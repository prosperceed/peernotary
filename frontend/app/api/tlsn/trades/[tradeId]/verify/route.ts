import { NETWORK } from "@/lib/env/network";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, requireWalletAddress } from "@/lib/auth/wallet";
import { readEscrowTrade } from "@/lib/oracle/escrow";
import { getOrHydrateSharedTrade, getProviderConfirmedPayment } from "@/lib/trades/tradeStore";
import { settleAndReleaseEscrowAfterPaymentConfirmed } from "@/lib/payments/flutterwaveServer";
import {
	createRustVerificationSession,
	evaluateRustEscrowRelease,
	executeRustSessionVerification,
	getRustProofEvidence,
	type RustEvaluateEscrowReleaseResponse,
	type RustExtractedPaymentEvidence,
	type RustProofSummaryResponse,
} from "@/lib/tlsn/client";
import { verificationStore } from "@/lib/tlsn/verificationStore";

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

function assertVerifiedPayment(
	proofSummary: RustProofSummaryResponse,
	evidence: RustExtractedPaymentEvidence,
	record: VerificationRecord,
	expectedTradeId: string,
): void {
	const amount = Number(record.amount);
	const attestation = proofSummary.binding_attestation;
	if (
		!proofSummary.verified ||
		proofSummary.session_id !== record.sessionId ||
		proofSummary.trade_id !== expectedTradeId ||
		evidence.server_name !== record.targetHostname ||
		evidence.trade_id !== expectedTradeId ||
		evidence.amount_units !== amount ||
		evidence.currency.toUpperCase() !== record.currency.toUpperCase() ||
		evidence.payment_reference !== record.paymentReference ||
		evidence.payment_status.toLowerCase() !== "completed" ||
		attestation.chain_id !== NETWORK.chainId ||
		attestation.escrow_address.toLowerCase() !== NETWORK.escrowAddress.toLowerCase() ||
		attestation.trade_id !== expectedTradeId ||
		attestation.session_id !== record.sessionId ||
		attestation.on_chain_proof_id_bytes32 !== proofSummary.on_chain_proof_id_bytes32 ||
		attestation.evidence_digest_hex !== evidence.transcript_digest_hex
	) {
		throw new Error("TLSN_PAYMENT_EVIDENCE_MISMATCH");
	}
}

async function resolveCallerWallet(request: NextRequest): Promise<string> {
	const headerAddr = request.headers.get("x-wallet-address")?.trim();
	try {
		const user = await getAuthenticatedUser(headerAddr || undefined);
		return user.walletAddress;
	} catch {
		if (headerAddr && /^0x[a-fA-F0-9]{40}$/.test(headerAddr)) {
			return headerAddr;
		}
		return requireWalletAddress();
	}
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ tradeId: string }> },
) {
	try {
		const address = await resolveCallerWallet(request);
		const { tradeId } = await params;
		const sessionId = request.nextUrl.searchParams.get("sessionId");

		if (sessionId) {
			const rec = verificationStore.get(sessionId);
			if (!rec) {
				return NextResponse.json(
					{ error: "SESSION_NOT_FOUND" },
					{ status: 404 },
				);
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

		return NextResponse.json(
			{ error: "VERIFICATION_NOT_FOUND" },
			{ status: 404 },
		);
	} catch {
		return NextResponse.json(
			{ error: "AUTHENTICATION_REQUIRED" },
			{ status: 401 },
		);
	}
}

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ tradeId: string }> },
) {
	try {
		const address = await resolveCallerWallet(request);
		const { tradeId: rawTradeId } = await params;

		const numericTradeId = rawTradeId.replace(/[^0-9]/g, "") || "1";

		const body = (await request.json().catch(() => ({}))) as {
			action?: "create_session" | "execute_proof";
			sessionId?: string;
			bankName?: string;
			amountUnits?: string | number;
			currency?: string;
			paymentReference?: string;
			paymentStatus?: string;
			cryptoAmountUsdc?: string;
		};

		// Branch 1: Execute real TLSNotary proof generation, verification & on-chain Escrow Settlement
		if (body.action === "execute_proof" && body.sessionId) {
			const record = verificationStore.get(body.sessionId);
			if (!record) {
				return NextResponse.json({ error: "UNKNOWN_SESSION" }, { status: 404 });
			}

			const existingTrade = await getOrHydrateSharedTrade(rawTradeId, address);
			if (existingTrade?.lifecycleState === "COMPLETED") {
				return NextResponse.json({ error: "TRADE_ALREADY_SETTLED" }, { status: 409 });
			}

			const proofSummary = await executeRustSessionVerification({
				sessionId: record.sessionId,
				buyerAddress: address,
				fallbackContext: {
					tradeId: numericTradeId,
					amountUnits: Number(record.amount) || 500000,
					currency: record.currency,
					paymentReference: record.paymentReference,
					targetHostname: record.targetHostname,
				},
			});

			const evidenceRes = await getRustProofEvidence({
				proofId: proofSummary.proof_id,
				buyerAddress: address,
			});
			assertVerifiedPayment(
				proofSummary,
				evidenceRes.evidence,
				record,
				numericTradeId,
			);

			const evalRes = await evaluateRustEscrowRelease({
				sessionId: record.sessionId,
				proofId: proofSummary.proof_id,
				tradeId: numericTradeId,
				buyerAddress: address,
				expectedAmountUnits: Number(record.amount),
				expectedCurrency: record.currency,
				expectedPaymentReference: record.paymentReference,
			});

			record.proofId = proofSummary.on_chain_proof_id_bytes32;
			record.proofHash = proofSummary.binding_attestation.evidence_digest_hex;
			record.rustProofSummary = proofSummary;
			record.rustEvidence = evidenceRes.evidence;
			record.rustEscrowEvaluation = evalRes;
			record.updatedAt = new Date();

			// A TLSNotary proof is supporting evidence only. USDC is released solely
			// on a payment the provider itself confirmed (webhook or verify API), via
			// the same idempotent settlement the payment watcher uses.
			let releaseBlockedReason: string | null = null;
			if (evalRes.authorized && proofSummary.verified) {
				record.status = "verified";
				const confirmed = getProviderConfirmedPayment(rawTradeId);
				if (!confirmed) {
					releaseBlockedReason = "PAYMENT_NOT_CONFIRMED_BY_PROVIDER";
				} else {
					try {
						const settledTrade = await settleAndReleaseEscrowAfterPaymentConfirmed({
							tradeId: rawTradeId,
							txRef: confirmed.txRef,
							flwTxId: confirmed.flwTxId ?? 0,
						});
						if (settledTrade.txHash) {
							record.oracleTransactionHash = settledTrade.txHash;
							record.status = "completed";
						}
					} catch (err) {
						console.error("Escrow settlement error during TLSN verify:", err);
						releaseBlockedReason = err instanceof Error ? err.message : "SETTLEMENT_FAILED";
					}
				}
			} else {
				record.status = "failed";
			}

			return NextResponse.json({
				verified: proofSummary.verified,
				authorizedForRelease: evalRes.authorized && !releaseBlockedReason,
				releaseBlockedReason,
				sessionId: record.sessionId,
				verificationId: record.verificationId,
				tradeId: rawTradeId,
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
			const onChainTrade = await readEscrowTrade(BigInt(numericTradeId));
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
			// Allow session creation when trade is initiated off-chain or pending confirmation
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
			`ARC-REF-${numericTradeId}-${Date.now().toString().slice(-6)}`;

		const now = new Date();

		const rustSession = await createRustVerificationSession({
			tradeId: numericTradeId,
			buyerAddress: address,
			expectedAmountUnits: amountUnits,
			expectedCurrency: currency,
			paymentReference,
			expectedRecipientHash: recipientHash,
			targetHostname,
		});

		const sessionId = rustSession.session_id;
		const verificationId = rustSession.verification_id;
		const notaryPublicKeyHex = rustSession.notary_public_key_hex;
		const domainBindingDigest = rustSession.domain_binding_digest;

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
		});

		return NextResponse.json(
			{
				tradeId: rawTradeId,
				verificationId,
				sessionId,
				checkoutUrl: `/bank-checkout?${checkoutParams.toString()}`,
				expiresAt: record.expiresAt.toISOString(),
				session: {
					session_id: sessionId,
					verification_id: verificationId,
					target_hostname: targetHostname,
					notary_public_key_hex: notaryPublicKeyHex,
					domain_binding_digest: domainBindingDigest,
				},
			},
			{ status: 201 },
		);
	} catch (error) {
		console.error("Failed to process TLSNotary verification request:", error);
		return NextResponse.json(
			{
				error: "VERIFICATION_SESSION_FAILED",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
