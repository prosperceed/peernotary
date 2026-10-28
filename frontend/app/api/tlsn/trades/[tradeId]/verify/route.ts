import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireWalletAddress } from "@/lib/auth/wallet";
import { readEscrowTrade } from "@/lib/oracle/escrow";
import { completePeerTrade } from "@/lib/trades/tradeStore";
import {
	createRustVerificationSession,
	evaluateRustEscrowRelease,
	executeRustSessionVerification,
	getRustProofEvidence,
	type RustEvaluateEscrowReleaseResponse,
	type RustExtractedPaymentEvidence,
	type RustProofSummaryResponse,
} from "@/lib/tlsn/client";

export type VerificationStatus =
	| "pending"
	| "proof_received"
	| "verified"
	| "oracle_pending"
	| "completed"
	| "failed";

export interface VerificationRecord {
	tradeId: string;
	verificationId: string;
	sessionId: string;
	address: string;
	purpose: "payment_verification";
	status: VerificationStatus;
	amount: string;
	currency: string;
	paymentReference: string;
	bankName: string;
	targetHostname: string;
	notaryPublicKeyHex?: string;
	domainBindingDigest?: string;
	proofId?: string;
	proofHash?: string;
	oracleTransactionHash?: string;
	failureReason?: string;
	rustProofSummary?: RustProofSummaryResponse;
	rustEvidence?: RustExtractedPaymentEvidence;
	rustEscrowEvaluation?: RustEvaluateEscrowReleaseResponse;
	createdAt: Date;
	updatedAt: Date;
	expiresAt: Date;
	activeKey?: string;
}

export const verificationStore = new Map<string, VerificationRecord>();

function createOpaqueId(): string {
	return randomBytes(32).toString("hex");
}

function mapBankToHostname(bankName?: string): string {
	const normalized = (bankName ?? "").toLowerCase();
	if (normalized.includes("opay")) return "api.opayweb.com";
	if (normalized.includes("gtb")) return "api.gtbank.com";
	if (normalized.includes("monie") || normalized.includes("monnify"))
		return "api.monnify.com";
	if (normalized.includes("access") || normalized.includes("fincra"))
		return "api.fincra.com";
	if (normalized.includes("kuda") || normalized.includes("zenith"))
		return "api.withmono.com";
	return "tlsnotary.org";
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ tradeId: string }> },
) {
	try {
		const address = await requireWalletAddress();
		const { tradeId } = await params;
		const sessionId = request.nextUrl.searchParams.get("sessionId");

		if (sessionId) {
			const rec = verificationStore.get(sessionId);
			if (!rec) {
				return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
			}
			if (rec.address.toLowerCase() !== address.toLowerCase()) {
				return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
			}
			return NextResponse.json(rec);
		}

		for (const rec of verificationStore.values()) {
			if (
				rec.tradeId === tradeId &&
				rec.address.toLowerCase() === address.toLowerCase()
			) {
				return NextResponse.json(rec);
			}
		}

		return NextResponse.json({ error: "VERIFICATION_NOT_FOUND" }, { status: 404 });
	} catch {
		return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
	}
}

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ tradeId: string }> },
) {
	try {
		const address = await requireWalletAddress();
		const { tradeId: rawTradeId } = await params;

		if (!/^[1-9][0-9]{0,38}$/.test(rawTradeId)) {
			return NextResponse.json({ error: "INVALID_TRADE_ID" }, { status: 400 });
		}

		const body = (await request.json().catch(() => ({}))) as {
			action?: "create_session" | "execute_proof";
			sessionId?: string;
			bankName?: string;
			amountUnits?: string | number;
			currency?: string;
			paymentReference?: string;
			paymentStatus?: string;
		};

		// Branch 1: Execute real TLSNotary proof generation & verification on Rust server
		if (body.action === "execute_proof" && body.sessionId) {
			const record = verificationStore.get(body.sessionId);
			if (!record) {
				return NextResponse.json({ error: "UNKNOWN_SESSION" }, { status: 404 });
			}
			if (record.address.toLowerCase() !== address.toLowerCase()) {
				return NextResponse.json({ error: "TRADE_FORBIDDEN" }, { status: 403 });
			}

			const proofSummary = await executeRustSessionVerification({
				sessionId: record.sessionId,
				buyerAddress: address,
				paymentStatus: body.paymentStatus ?? "completed",
			});

			const evidenceRes = await getRustProofEvidence({
				proofId: proofSummary.proof_id,
				buyerAddress: address,
			});

			const evalRes = await evaluateRustEscrowRelease({
				sessionId: record.sessionId,
				proofId: proofSummary.proof_id,
				tradeId: record.tradeId,
				buyerAddress: address,
				expectedAmountUnits: Number(record.amount),
				expectedCurrency: record.currency,
				expectedPaymentReference: record.paymentReference,
			});

			record.status = evalRes.authorized ? "completed" : "verified";
			record.proofId = proofSummary.on_chain_proof_id_bytes32;
			record.proofHash = proofSummary.binding_attestation.evidence_digest_hex;
			record.rustProofSummary = proofSummary;
			record.rustEvidence = evidenceRes.evidence;
			record.rustEscrowEvaluation = evalRes;
			record.updatedAt = new Date();

			if (evalRes.authorized || proofSummary.verified) {
				completePeerTrade(record.tradeId, {
					proofId: proofSummary.on_chain_proof_id_bytes32,
					txHash: record.oracleTransactionHash ?? undefined,
				});
			}

			return NextResponse.json({
				verified: proofSummary.verified,
				authorizedForRelease: evalRes.authorized,
				sessionId: record.sessionId,
				verificationId: record.verificationId,
				tradeId: record.tradeId,
				bankName: record.bankName,
				proofSummary,
				evidence: evidenceRes.evidence,
				escrowEvaluation: evalRes,
				oracleTransactionHash: record.oracleTransactionHash ?? null,
			});
		}

		// Branch 2: Create a new TLSNotary verification session
		let onChainAmount = "500000";
		let recipientHash: string | null = null;

		try {
			const onChainTrade = await readEscrowTrade(BigInt(rawTradeId));
			const zeroAddr = "0x0000000000000000000000000000000000000000";
			if (
				onChainTrade.buyer &&
				String(onChainTrade.buyer) !== zeroAddr &&
				String(onChainTrade.buyer).toLowerCase() !== address.toLowerCase()
			) {
				return NextResponse.json({ error: "TRADE_FORBIDDEN" }, { status: 403 });
			}
			if (BigInt(onChainTrade.cryptoAmount ?? 0n) > 0n) {
				onChainAmount = BigInt(onChainTrade.cryptoAmount).toString();
			}
			if (
				onChainTrade.privacyHashedBankDetails &&
				String(onChainTrade.privacyHashedBankDetails) !==
					"0x0000000000000000000000000000000000000000000000000000000000000000"
			) {
				recipientHash = String(onChainTrade.privacyHashedBankDetails);
			}
		} catch {
			// Allow testnet session creation when trade is initiated off-chain or pending confirmation
		}

		const requestedUnits = String(body.amountUnits ?? onChainAmount).replace(
			/[^0-9]/g,
			"",
		);
		const amountUnits = requestedUnits.length > 0 ? requestedUnits : "500000";
		const currency = (body.currency ?? "NGN").toUpperCase();
		const bankName = body.bankName ?? "GTBank";
		const targetHostname = mapBankToHostname(bankName);
		const paymentReference =
			body.paymentReference?.trim() ||
			`ARC-REF-${rawTradeId}-${Date.now().toString().slice(-6)}`;

		const now = new Date();
		let verificationId = createOpaqueId();
		let sessionId = `sess_${createOpaqueId().slice(0, 32)}`;
		let notaryPublicKeyHex: string | undefined;
		let domainBindingDigest: string | undefined;

		const rustSession = await createRustVerificationSession({
			tradeId: rawTradeId,
			buyerAddress: address,
			expectedAmountUnits: amountUnits,
			expectedCurrency: currency,
			paymentReference,
			expectedRecipientHash: recipientHash,
			targetHostname,
		});

		sessionId = rustSession.session_id;
		verificationId = rustSession.verification_id;
		notaryPublicKeyHex = rustSession.notary_public_key_hex;
		domainBindingDigest = rustSession.domain_binding_digest;

		const record: VerificationRecord = {
			tradeId: rawTradeId,
			verificationId,
			sessionId,
			address,
			purpose: "payment_verification",
			status: "pending",
			amount: amountUnits,
			currency,
			paymentReference,
			bankName,
			targetHostname,
			notaryPublicKeyHex,
			domainBindingDigest,
			createdAt: now,
			updatedAt: now,
			expiresAt: new Date(now.getTime() + 15 * 60 * 1_000),
		};

		verificationStore.set(sessionId, record);

		const checkoutParams = new URLSearchParams({
			tradeId: rawTradeId,
			sessionId,
			verificationId,
			bank: bankName,
			amountNgn: amountUnits,
			ref: paymentReference,
			host: targetHostname,
		});

		return NextResponse.json({
			verificationId,
			sessionId,
			status: "pending",
			bankName,
			targetHostname,
			paymentReference,
			amountUnits,
			currency,
			notaryPublicKeyHex,
			domainBindingDigest,
			checkoutUrl: `/bank-checkout?${checkoutParams.toString()}`,
			verifierUrl: process.env.TLSN_VERIFIER_URL,
			metadata: {
				verificationId,
				tradeId: rawTradeId,
				purpose: "payment_verification",
			},
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "Authentication required"
		) {
			return NextResponse.json(
				{ error: "AUTHENTICATION_REQUIRED" },
				{ status: 401 },
			);
		}
		console.error(
			"Verification session error:",
			error instanceof Error ? error.message : "unknown",
		);
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "VERIFICATION_UNAVAILABLE",
			},
			{ status: 503 },
		);
	}
}
