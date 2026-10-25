import { NextRequest, NextResponse } from "next/server";
import { keccak256, toUtf8Bytes } from "ethers";
import { verificationStore } from "@/app/api/tlsn/trades/[tradeId]/verify/route";
import { oracleRelease } from "@/lib/oracle/escrow";
import { validateTlsnPayload, type TlsnWebhookPayload } from "@/lib/tlsn/verification";

export async function POST(request: NextRequest) {
	try {
		// ── Auth ──────────────────────────────────────────────────────────────
		const secret     = process.env.TLSN_WEBHOOK_SECRET;
		const authHeader = request.headers.get("authorization");

		if (!secret || authHeader !== `Bearer ${secret}`) {
			return NextResponse.json({ error: "WEBHOOK_UNAUTHORIZED" }, { status: 401 });
		}

		// ── Parse body ────────────────────────────────────────────────────────
		const body: unknown = await request.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return NextResponse.json({ error: "MALFORMED_WEBHOOK" }, { status: 400 });
		}
		const payload = body as TlsnWebhookPayload;

		if (typeof payload.sessionId !== "string") {
			return NextResponse.json({ error: "MALFORMED_WEBHOOK" }, { status: 400 });
		}

		// ── Look up record ────────────────────────────────────────────────────
		const record = verificationStore.get(payload.sessionId);
		if (!record) {
			return NextResponse.json({ error: "UNKNOWN_SESSION" }, { status: 404 });
		}

		// ── Idempotency ───────────────────────────────────────────────────────
		if (record.status === "completed" || record.status === "oracle_pending") {
			return NextResponse.json({ received: true, status: record.status });
		}
		if (record.status !== "pending") {
			return NextResponse.json({ error: "INVALID_VERIFICATION_STATE" }, { status: 409 });
		}

		// ── Validate proof ────────────────────────────────────────────────────
		const result = validateTlsnPayload(payload, {
			tradeId:          record.tradeId,
			amount:           record.amount,
			paymentReference: record.paymentReference,
			allowedHostnames: (process.env.TLSN_ALLOWED_HOSTNAMES ?? "")
				.split(",")
				.map((h) => h.trim())
				.filter(Boolean),
		});

		if (!result.valid) {
			record.status        = "failed";
			record.failureReason = result.reason;
			record.updatedAt     = new Date();
			record.activeKey     = undefined;
			return NextResponse.json({ error: result.reason }, { status: 422 });
		}

		// ── Advance to oracle_pending (atomic-ish: check expiry first) ────────
		if (record.expiresAt <= new Date()) {
			record.status        = "failed";
			record.failureReason = "VERIFICATION_EXPIRED";
			record.updatedAt     = new Date();
			record.activeKey     = undefined;
			return NextResponse.json({ error: "VERIFICATION_EXPIRED" }, { status: 409 });
		}

		const proofId        = keccak256(toUtf8Bytes(payload.sessionId));
		record.status        = "oracle_pending";
		record.proofId       = proofId;
		record.proofHash     = keccak256(toUtf8Bytes(JSON.stringify(payload.sessionData)));
		record.updatedAt     = new Date();
		record.activeKey     = undefined;

		// ── Call oracle ───────────────────────────────────────────────────────
		try {
			const transaction            = await oracleRelease(BigInt(record.tradeId), proofId);
			record.status                = "completed";
			record.oracleTransactionHash = transaction.transactionHash;
			record.updatedAt             = new Date();

			return NextResponse.json({
				received:         true,
				status:           "completed",
				transactionHash:  transaction.transactionHash,
			});
		} catch (error) {
			record.status        = "failed";
			record.failureReason = "ORACLE_EXECUTION_FAILED";
			record.updatedAt     = new Date();
			console.error("Oracle release failed", error instanceof Error ? error.name : "unknown");
			return NextResponse.json({ error: "ORACLE_EXECUTION_FAILED" }, { status: 503 });
		}
	} catch (error) {
		console.error("TLSN webhook rejected", error instanceof Error ? error.name : "unknown");
		return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
	}
}
