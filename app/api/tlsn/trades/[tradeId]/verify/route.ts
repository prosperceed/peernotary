import { NextResponse } from "next/server";
import { requireWalletAddress } from "@/lib/auth/wallet";
import { createOpaqueId, getCollections } from "@/lib/db/models";
import { readEscrowTrade } from "@/lib/oracle/escrow";

const allowedHostnames = (process.env.TLSN_ALLOWED_HOSTNAMES ?? "")
	.split(",")
	.map((hostname) => hostname.trim().toLowerCase())
	.filter(Boolean);

export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ tradeId: string }> },
) {
	try {
		const address = await requireWalletAddress();
		const { tradeId: rawTradeId } = await params;
		if (!/^[1-9][0-9]{0,38}$/.test(rawTradeId)) {
			return NextResponse.json({ error: "INVALID_TRADE_ID" }, { status: 400 });
		}
		if (allowedHostnames.length === 0) {
			return NextResponse.json({ error: "TLSN_NOT_CONFIGURED" }, { status: 503 });
		}

		const { trades, verifications } = await getCollections();
		const trade = await trades.findOne({ onChainTradeId: rawTradeId });
		if (!trade) return NextResponse.json({ error: "TRADE_NOT_FOUND" }, { status: 404 });
		if (trade.buyer.toLowerCase() !== address.toLowerCase()) {
			return NextResponse.json({ error: "TRADE_FORBIDDEN" }, { status: 403 });
		}
		if (trade.status !== "funded" && trade.status !== "fiat_sent") {
			return NextResponse.json({ error: "TRADE_NOT_VERIFIABLE" }, { status: 409 });
		}

		const onChainTrade = await readEscrowTrade(BigInt(rawTradeId));
		if (onChainTrade.buyer.toLowerCase() !== address.toLowerCase() ||
			(onChainTrade.status !== 1n && onChainTrade.status !== 2n)) {
			return NextResponse.json({ error: "TRADE_STATE_MISMATCH" }, { status: 409 });
		}

		const activeKey = `${rawTradeId}:${address.toLowerCase()}`;
		const existing = await verifications.findOne({ activeKey, expiresAt: { $gt: new Date() } });
		if (existing) {
			return NextResponse.json({ verificationId: existing.verificationId, sessionId: existing.sessionId, status: existing.status });
		}

		const now = new Date();
		const verificationId = createOpaqueId();
		const sessionId = createOpaqueId();
		try {
			await verifications.insertOne({
				tradeId: rawTradeId,
				verificationId,
				sessionId,
				address,
				purpose: "payment_verification",
				status: "pending",
				amount: trade.paymentAmount,
				paymentReference: trade.paymentReference,
				activeKey,
				createdAt: now,
				updatedAt: now,
				expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
			});
		} catch (error) {
			if (!(error instanceof Error) || !error.message.includes("duplicate")) throw error;
			const concurrent = await verifications.findOne({ activeKey });
			if (!concurrent) throw error;
			return NextResponse.json({ verificationId: concurrent.verificationId, sessionId: concurrent.sessionId, status: concurrent.status });
		}
		return NextResponse.json({
			verificationId,
			sessionId,
			status: "pending",
			verifierUrl: process.env.TLSN_VERIFIER_URL,
			metadata: { verificationId, tradeId: rawTradeId, purpose: "payment_verification" },
		});
	} catch (error) {
		if (error instanceof Error && error.message === "Authentication required") {
			return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
		}
		console.error("Verification start failed", error instanceof Error ? error.name : "unknown");
		return NextResponse.json(
			{
				error: "VERIFICATION_UNAVAILABLE",
			},
			{ status: 503 },
		);
	}
}
