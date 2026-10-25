import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireWalletAddress } from "@/lib/auth/wallet";
import { readEscrowTrade } from "@/lib/oracle/escrow";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type VerificationStatus =
	| "pending"
	| "proof_received"
	| "verified"
	| "oracle_pending"
	| "completed"
	| "failed";

interface VerificationRecord {
	tradeId: string;
	verificationId: string;
	sessionId: string;
	address: string;
	purpose: "payment_verification";
	status: VerificationStatus;
	amount: string;
	paymentReference: string;
	proofId?: string;
	proofHash?: string;
	oracleTransactionHash?: string;
	failureReason?: string;
	createdAt: Date;
	updatedAt: Date;
	expiresAt: Date;
	/** Deduplication key: `${tradeId}:${address}` */
	activeKey?: string;
}

// ─── IN-MEMORY STORE ──────────────────────────────────────────────────────────
// Exported so the webhook route can share the same Map at runtime.

export const verificationStore = new Map<string, VerificationRecord>();

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function createOpaqueId(): string {
	return randomBytes(32).toString("hex");
}

const allowedHostnames = (process.env.TLSN_ALLOWED_HOSTNAMES ?? "")
	.split(",")
	.map((h) => h.trim().toLowerCase())
	.filter(Boolean);

// ─── ROUTE ────────────────────────────────────────────────────────────────────

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

		// ── Verify on-chain state ─────────────────────────────────────────────
		let onChainTrade: Awaited<ReturnType<typeof readEscrowTrade>>;
		try {
			onChainTrade = await readEscrowTrade(BigInt(rawTradeId));
		} catch {
			return NextResponse.json({ error: "TRADE_NOT_FOUND" }, { status: 404 });
		}

		if (onChainTrade.buyer.toLowerCase() !== address.toLowerCase()) {
			return NextResponse.json({ error: "TRADE_FORBIDDEN" }, { status: 403 });
		}
		// status 1 = Funded, status 2 = FiatSent
		if (onChainTrade.status !== 1n && onChainTrade.status !== 2n) {
			return NextResponse.json({ error: "TRADE_NOT_VERIFIABLE" }, { status: 409 });
		}

		// ── Deduplication: return existing unexpired record if one exists ─────
		const activeKey = `${rawTradeId}:${address.toLowerCase()}`;
		const now       = new Date();

		for (const rec of verificationStore.values()) {
			if (rec.activeKey === activeKey && rec.expiresAt > now) {
				return NextResponse.json({
					verificationId: rec.verificationId,
					sessionId:      rec.sessionId,
					status:         rec.status,
				});
			}
		}

		// ── Create new verification session ───────────────────────────────────
		const verificationId = createOpaqueId();
		const sessionId      = createOpaqueId();

		const record: VerificationRecord = {
			tradeId:          rawTradeId,
			verificationId,
			sessionId,
			address,
			purpose:          "payment_verification",
			status:           "pending",
			// These would normally come from the off-chain trade record.
			// Without a DB, we use the on-chain amount and an empty reference.
			amount:           onChainTrade.cryptoAmount.toString(),
			paymentReference: "",
			activeKey,
			createdAt:        now,
			updatedAt:        now,
			expiresAt:        new Date(now.getTime() + 15 * 60 * 1_000),
		};

		verificationStore.set(sessionId, record);

		return NextResponse.json({
			verificationId,
			sessionId,
			status:      "pending",
			verifierUrl: process.env.TLSN_VERIFIER_URL,
			metadata:    { verificationId, tradeId: rawTradeId, purpose: "payment_verification" },
		});
	} catch (error) {
		if (error instanceof Error && error.message === "Authentication required") {
			return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
		}
		console.error("Verification start failed", error instanceof Error ? error.name : "unknown");
		return NextResponse.json({ error: "VERIFICATION_UNAVAILABLE" }, { status: 503 });
	}
}
