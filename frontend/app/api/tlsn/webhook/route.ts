import { NextRequest, NextResponse } from "next/server";
import { keccak256, toUtf8Bytes } from "ethers";
import { verificationStore } from "@/app/api/tlsn/trades/[tradeId]/verify/route";
import { oracleRelease } from "@/lib/oracle/escrow";
import { completePeerTrade } from "@/lib/trades/tradeStore";
import {
	validateTlsnPayload,
	type TlsnWebhookPayload,
} from "@/lib/tlsn/verification";

export async function GET() {
	return NextResponse.json({
		status: "ok",
		endpoint: "/api/tlsn/webhook",
		activeSessions: verificationStore.size,
	});
}

export async function POST(request: NextRequest) {
	try {
		const secret = process.env.TLSN_WEBHOOK_SECRET;
		const authHeader = request.headers.get("authorization");

		if (!secret || authHeader !== `Bearer ${secret}`) {
			return NextResponse.json(
				{ error: "WEBHOOK_UNAUTHORIZED" },
				{ status: 401 },
			);
		}

		const body: unknown = await request.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return NextResponse.json({ error: "MALFORMED_WEBHOOK" }, { status: 400 });
		}
		const payload = body as TlsnWebhookPayload;

		if (typeof payload.sessionId !== "string") {
			return NextResponse.json({ error: "MALFORMED_WEBHOOK" }, { status: 400 });
		}

		const record = verificationStore.get(payload.sessionId);
		if (!record) {
			return NextResponse.json({ error: "UNKNOWN_SESSION" }, { status: 404 });
		}

		if (record.status === "completed" || record.status === "oracle_pending") {
			return NextResponse.json({ received: true, status: record.status });
		}

		const configuredHosts = (process.env.TLSN_ALLOWED_HOSTNAMES ?? "")
			.split(",")
			.map((h) => h.trim())
			.filter(Boolean);
		const allowedHostnames = Array.from(
			new Set([
				...configuredHosts,
				"tlsnotary.org",
				"api.opayweb.com",
				"api.gtbank.com",
				"api.monnify.com",
				"api.fincra.com",
				"api.withmono.com",
			]),
		);

		const result = validateTlsnPayload(payload, {
			tradeId: record.tradeId,
			amount: record.amount,
			paymentReference: record.paymentReference,
			allowedHostnames,
		});

		if (!result.valid) {
			record.status = "failed";
			record.failureReason = result.reason;
			record.updatedAt = new Date();
			return NextResponse.json({ error: result.reason }, { status: 422 });
		}

		if (record.expiresAt <= new Date()) {
			record.status = "failed";
			record.failureReason = "VERIFICATION_EXPIRED";
			record.updatedAt = new Date();
			return NextResponse.json(
				{ error: "VERIFICATION_EXPIRED" },
				{ status: 409 },
			);
		}

		const proofId = keccak256(toUtf8Bytes(payload.sessionId));
		record.status = "oracle_pending";
		record.proofId = proofId;
		record.proofHash = keccak256(
			toUtf8Bytes(JSON.stringify(payload.sessionData)),
		);
		record.updatedAt = new Date();

		try {
			const transaction = await oracleRelease(BigInt(record.tradeId), proofId);
			record.status = "completed";
			record.oracleTransactionHash = transaction.transactionHash;
			record.updatedAt = new Date();
			completePeerTrade(record.tradeId, {
				proofId,
				txHash: transaction.transactionHash,
			});

			return NextResponse.json({
				received: true,
				status: "completed",
				proofId,
				transactionHash: transaction.transactionHash,
			});
		} catch {
			// When the trade is a testnet session not yet funded on-chain, mark proof verified
			record.status = "verified";
			record.updatedAt = new Date();
			return NextResponse.json({
				received: true,
				status: "verified",
				proofId,
				transactionHash: null,
			});
		}
	} catch (error) {
		console.error(
			"TLSN webhook rejected",
			error instanceof Error ? error.name : "unknown",
		);
		return NextResponse.json(
			{ error: "Webhook processing failed" },
			{ status: 500 },
		);
	}
}
