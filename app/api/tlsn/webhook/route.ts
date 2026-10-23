import { NextRequest, NextResponse } from "next/server";
import { keccak256, toUtf8Bytes } from "ethers";
import { getCollections } from "@/lib/db/models";
import { oracleRelease } from "@/lib/oracle/escrow";
import { validateTlsnPayload, type TlsnWebhookPayload } from "@/lib/tlsn/verification";

export async function POST(request: NextRequest) {
	try {
		const secret = process.env.TLSN_WEBHOOK_SECRET;
		const authHeader = request.headers.get("authorization");

		if (!secret || authHeader !== `Bearer ${secret}`) {
			return NextResponse.json({ error: "WEBHOOK_UNAUTHORIZED" }, { status: 401 });
		}

		const body: unknown = await request.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return NextResponse.json({ error: "MALFORMED_WEBHOOK" }, { status: 400 });
		}
		const payload = body as TlsnWebhookPayload;
		const { verifications } = await getCollections();
		if (typeof payload.sessionId !== "string") {
			return NextResponse.json({ error: "MALFORMED_WEBHOOK" }, { status: 400 });
		}
		const record = await verifications.findOne({ sessionId: payload.sessionId });
		if (!record) return NextResponse.json({ error: "UNKNOWN_SESSION" }, { status: 404 });
		if (record.status === "completed" || record.status === "oracle_pending") {
			return NextResponse.json({ received: true, status: record.status });
		}
		if (record.status !== "pending") {
			return NextResponse.json({ error: "INVALID_VERIFICATION_STATE" }, { status: 409 });
		}

		const result = validateTlsnPayload(payload, {
			tradeId: record.tradeId,
			amount: record.amount,
			paymentReference: record.paymentReference,
			allowedHostnames: (process.env.TLSN_ALLOWED_HOSTNAMES ?? "")
				.split(",").map((hostname) => hostname.trim()).filter(Boolean),
		});
		if (!result.valid) {
			await verifications.updateOne(
				{ _id: record._id, status: "pending" },
				{ $set: { status: "failed", failureReason: result.reason, updatedAt: new Date() }, $unset: { activeKey: "" } },
			);
			return NextResponse.json({ error: result.reason }, { status: 422 });
		}

		const proofId = keccak256(toUtf8Bytes(payload.sessionId));
		const claimed = await verifications.findOneAndUpdate(
			{ _id: record._id, status: "pending", expiresAt: { $gt: new Date() } },
			{ $set: { status: "oracle_pending", proofId, proofHash: keccak256(toUtf8Bytes(JSON.stringify(payload.sessionData))), updatedAt: new Date() }, $unset: { activeKey: "" } },
			{ returnDocument: "after" },
		);
		if (!claimed) return NextResponse.json({ received: true, status: "already_processing" });

		try {
			const transaction = await oracleRelease(BigInt(record.tradeId), proofId);
			await verifications.updateOne(
				{ _id: record._id, status: "oracle_pending" },
				{ $set: { status: "completed", oracleTransactionHash: transaction.transactionHash, updatedAt: new Date() } },
			);
			return NextResponse.json({ received: true, status: "completed", transactionHash: transaction.transactionHash });
		} catch (error) {
			await verifications.updateOne(
				{ _id: record._id, status: "oracle_pending" },
				{ $set: { status: "failed", failureReason: "ORACLE_EXECUTION_FAILED", updatedAt: new Date() } },
			);
			console.error("Oracle release failed", error instanceof Error ? error.name : "unknown");
			return NextResponse.json({ error: "ORACLE_EXECUTION_FAILED" }, { status: 503 });
		}
	} catch (error) {
		console.error("TLSN webhook rejected", error instanceof Error ? error.name : "unknown");

		return NextResponse.json(
			{ error: "Webhook processing failed" },
			{ status: 500 },
		);
	}
}
