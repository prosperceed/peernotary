import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { oracleSettleToBuyer, paymentProofId } from "@/lib/oracle/escrow";
import { getPaymentMode, getServerNetworkSecrets, type PaymentMode } from "@/lib/env/serverSecrets";
import {
	completePeerTrade,
	createOrReuseCheckoutAttempt,
	getOrHydratePaymentAttempt,
	getProviderConfirmedPayment,
	getSharedTrade,
	persistPaymentAttemptToSupabase,
	recordVerifiedFlutterwavePayment,
	resolveOnChainListingId,
	transitionEscrowReleaseState,
	transitionSellerPayoutState,
	type PaymentAttemptInfo,
	type SharedTrade,
} from "@/lib/trades/tradeStore";

function getFlwBaseUrl(): string {
	return (
		process.env.FLW_BASE_URL ?? "https://api.flutterwave.com/v3"
	).replace(/\/$/, "");
}

/** Secret key for the active network, validated against the payment mode. */
function getFlwSecretKey(): string | undefined {
	const mode = getPaymentMode(); // throws on test/live key mismatch
	return mode === "simulated" ? undefined : getServerNetworkSecrets().flwSecretKey;
}

function getFlwSecretHash(): string {
	return getServerNetworkSecrets().flwSecretHash ?? "";
}

export function minorUnitsToDecimalString(minorUnits: number): string {
	const integerMinor = Math.round(minorUnits);
	const major = Math.floor(integerMinor / 100);
	const minor = integerMinor % 100;
	return `${major}.${String(minor).padStart(2, "0")}`;
}

export function parseDecimalToMinorUnits(raw: string | number): number {
	const cleaned = String(raw).trim().replace(/,/g, "");
	if (!cleaned || cleaned.startsWith("-")) {
		throw new Error("Invalid negative or empty monetary amount");
	}
	const parts = cleaned.split(".");
	if (parts.length > 2) {
		throw new Error("Malformed decimal monetary amount");
	}
	const majorStr = parts[0] || "0";
	const fracStr = parts[1] || "";
	if (!/^\d+$/.test(majorStr) || (fracStr && !/^\d+$/.test(fracStr))) {
		throw new Error("Non-numeric monetary characters");
	}
	const major = parseInt(majorStr, 10);
	let minor = 0;
	if (fracStr.length === 1) {
		minor = parseInt(fracStr, 10) * 10;
	} else if (fracStr.length >= 2) {
		const extra = fracStr.slice(2);
		if (extra && !/^0+$/.test(extra)) {
			throw new Error("Monetary precision exceeds 2 decimal places");
		}
		minor = parseInt(fracStr.slice(0, 2), 10);
	}
	return major * 100 + minor;
}

export function verifyFlutterwaveWebhookSignature(params: {
	verifHashHeader?: string | null;
	hmacSignatureHeader?: string | null;
	rawBody: string;
}): boolean {
	const secret = getFlwSecretHash();
	if (!secret) return false;

	if (params.verifHashHeader) {
		const a = Buffer.from(params.verifHashHeader.trim());
		const b = Buffer.from(secret);
		if (a.length === b.length && timingSafeEqual(a, b)) {
			return true;
		}
	}

	if (params.hmacSignatureHeader) {
		const computedHex = createHmac("sha256", secret)
			.update(params.rawBody, "utf8")
			.digest("hex");
		const computedB64 = createHmac("sha256", secret)
			.update(params.rawBody, "utf8")
			.digest("base64");
		const provided = Buffer.from(params.hmacSignatureHeader.trim());
		const hexBuf = Buffer.from(computedHex);
		const b64Buf = Buffer.from(computedB64);

		if (
			(provided.length === hexBuf.length && timingSafeEqual(provided, hexBuf)) ||
			(provided.length === b64Buf.length && timingSafeEqual(provided, b64Buf))
		) {
			return true;
		}
	}

	return false;
}

/**
 * Creates a Flutterwave hosted payment link. Test mode can take several
 * seconds, so each try gets 20s and timeouts, network errors and 5xx
 * responses are retried once with the same tx_ref (Flutterwave reuses it).
 */
async function requestHostedLink(secretKey: string, payload: Record<string, unknown>): Promise<string> {
	let lastError: Error = new Error("FLUTTERWAVE_CHECKOUT_FAILED");
	for (let tryNo = 1; tryNo <= 2; tryNo++) {
		let res: Response;
		try {
			res = await fetch(`${getFlwBaseUrl()}/payments`, {
				method: "POST",
				headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				cache: "no-store",
				signal: AbortSignal.timeout(20_000),
			});
		} catch (err) {
			const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
			lastError = new Error(timedOut ? "FLUTTERWAVE_TIMEOUT" : "FLUTTERWAVE_UNREACHABLE");
			continue;
		}

		const body = (await res.json().catch(() => ({}))) as {
			status?: string;
			message?: string;
			data?: { link?: string };
		};
		if (res.ok && body.status === "success" && body.data?.link) return body.data.link;

		lastError = new Error(`FLUTTERWAVE_CHECKOUT_FAILED: ${body.message ?? `HTTP ${res.status}`}`);
		if (res.status < 500) break; // 4xx won't succeed on retry
	}
	throw lastError;
}

export async function initializeFlutterwaveStandardCheckout(params: {
	tradeId: string;
	buyerAddress: string;
	originUrl: string;
}): Promise<{
	attempt: PaymentAttemptInfo;
	hostedMode: "live_api" | "sandbox_portal";
	paymentMode: PaymentMode;
}> {
	const paymentMode = getPaymentMode();
	const attempt = createOrReuseCheckoutAttempt(
		params.tradeId,
		params.buyerAddress,
	);
	const trade = getSharedTrade(params.tradeId);
	const secretKey = getFlwSecretKey();

	if (secretKey && trade) {
		// Reuse a hosted link Flutterwave already issued for this attempt.
		if (attempt.checkoutUrl.startsWith("https://")) {
			return { attempt, hostedMode: "live_api", paymentMode };
		}

		const redirectUrl = `${params.originUrl.replace(/\/$/, "")}/bank-checkout?tradeId=${encodeURIComponent(params.tradeId)}&tx_ref=${encodeURIComponent(attempt.txRef)}`;
		const link = await requestHostedLink(secretKey, {
			tx_ref: attempt.txRef,
			amount: minorUnitsToDecimalString(attempt.expectedAmountMinor),
			currency: attempt.expectedCurrency,
			redirect_url: redirectUrl,
			customer: {
				email: `${params.buyerAddress.toLowerCase()}@wallet.peernotary.io`,
				name: `PeerNotary Buyer (${params.buyerAddress.slice(0, 6)}...${params.buyerAddress.slice(-4)})`,
			},
			meta: {
				trade_id: params.tradeId,
				attempt_id: attempt.id,
				buyer_address: params.buyerAddress.toLowerCase(),
				seller_address: trade.sellerAddress.toLowerCase(),
				expected_amount_minor: String(attempt.expectedAmountMinor),
			},
			customizations: {
				title: `PeerNotary order #${params.tradeId}`,
				description: `Payment for escrow order #${params.tradeId}`,
			},
		});
		attempt.checkoutUrl = link;
		persistPaymentAttemptToSupabase(attempt);
		return { attempt, hostedMode: "live_api", paymentMode };
	}

	if (paymentMode !== "simulated") throw new Error("TRADE_NOT_FOUND");
	return { attempt, hostedMode: "sandbox_portal", paymentMode };
}

export async function verifyFlutterwaveTransactionServerSide(params: {
	tradeId: string;
	txRef: string;
	flwTransactionId?: number;
	simulatedAmountMinor?: number;
	simulatedCurrency?: string;
}): Promise<ReturnType<typeof recordVerifiedFlutterwavePayment>> {
	const attempt = await getOrHydratePaymentAttempt(params.txRef);
	if (!attempt) {
		throw new Error("PAYMENT_ATTEMPT_NOT_FOUND");
	}
	if (attempt.tradeId !== params.tradeId) {
		throw new Error("CROSS_TRADE_TX_REF_MISMATCH");
	}

	const secretKey = getFlwSecretKey();
	if (secretKey) {
		const verifyUrl = params.flwTransactionId
			? `${getFlwBaseUrl()}/transactions/${encodeURIComponent(String(params.flwTransactionId))}/verify`
			: `${getFlwBaseUrl()}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(params.txRef)}`;

		let res: Response | null = null;
		try {
			res = await fetch(verifyUrl, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${secretKey}`,
				},
				cache: "no-store",
				signal: AbortSignal.timeout(10_000),
			});
		} catch {
			res = null;
		}

		if (res && res.ok) {
			const payload = (await res.json()) as {
				status?: string;
				data?: {
					id?: number;
					tx_ref?: string;
					status?: string;
					amount?: number | string;
					currency?: string;
				};
			};

			if (
				payload.status === "success" &&
				payload.data &&
				payload.data.status?.toLowerCase() === "successful" &&
				payload.data.tx_ref === params.txRef
			) {
				const verifiedAmountMinor = parseDecimalToMinorUnits(
					payload.data.amount ?? 0,
				);
				const verifiedCurrency = payload.data.currency ?? "NGN";
				const verifiedId =
					payload.data.id ?? params.flwTransactionId ?? Date.now();

				const record = recordVerifiedFlutterwavePayment({
					tradeId: params.tradeId,
					txRef: params.txRef,
					flwTxId: verifiedId,
					amountMinor: verifiedAmountMinor,
					currency: verifiedCurrency,
					source: "verify_api",
				});

				if (record.trade.paymentState === "CONFIRMED") {
					const completedTrade = await settleAndReleaseEscrowAfterPaymentConfirmed({
						tradeId: params.tradeId,
						txRef: params.txRef,
						flwTxId: verifiedId,
					});
					return {
						trade: completedTrade,
						attempt: record.attempt,
						deduplicated: record.deduplicated,
					};
				}

				return record;
			}
		}
		// Real Flutterwave mode: only a payment Flutterwave reports as successful counts.
		throw new Error(
			"PAYMENT_NOT_CONFIRMED: Flutterwave has no successful payment for this reference yet.",
		);
	}

	// Simulated mode only (testnet, no key, FLW_ALLOW_SIMULATED_PAYMENTS=true, non-production).
	const flwTxId =
		params.flwTransactionId ?? Math.floor(10_000_000 + Math.random() * 89_000_000);
	const amountMinor = params.simulatedAmountMinor ?? attempt.expectedAmountMinor;
	const currency = params.simulatedCurrency ?? attempt.expectedCurrency;

	const record = recordVerifiedFlutterwavePayment({
		tradeId: params.tradeId,
		txRef: params.txRef,
		flwTxId,
		amountMinor,
		currency,
		source: "verify_api",
		simulated: true,
	});

	if (record.trade.paymentState === "CONFIRMED") {
		const completedTrade = await settleAndReleaseEscrowAfterPaymentConfirmed({
			tradeId: params.tradeId,
			txRef: params.txRef,
			flwTxId,
		});
		return {
			trade: completedTrade,
			attempt: record.attempt,
			deduplicated: record.deduplicated,
		};
	}

	return record;
}

export async function settleAndReleaseEscrowAfterPaymentConfirmed(params: {
	tradeId: string;
	txRef: string;
	flwTxId: number;
}): Promise<SharedTrade> {
	const trade = getSharedTrade(params.tradeId);
	if (!trade) throw new Error("TRADE_NOT_FOUND");

	if (trade.lifecycleState === "COMPLETED") {
		return trade;
	}

	// Defence in depth: never move USDC unless the provider confirmed this payment.
	const confirmed = getProviderConfirmedPayment(params.tradeId);
	if (!confirmed || confirmed.txRef !== params.txRef) {
		throw new Error("PAYMENT_NOT_CONFIRMED_BY_PROVIDER");
	}

	// 1. Transition seller fiat payout to processing and confirmed
	try {
		transitionSellerPayoutState(params.tradeId, "initiate");
		transitionSellerPayoutState(params.tradeId, "confirm", {
			flwTransferId: params.flwTxId,
		});
	} catch (payoutErr) {
		console.warn("Seller payout auto-transition warning:", payoutErr);
	}

	// 2. Oracle release / on-chain settlement of USDC to buyer
	const proofIdBytes32 = paymentProofId("FLW", params.tradeId, params.txRef);
	const buyerWallet = trade.buyerAddress;
	const listingId = resolveOnChainListingId(params.tradeId);
	if (!buyerWallet) throw new Error("Trade has no buyer wallet to release USDC to");
	if (listingId === null) {
		throw new Error(`Trade ${params.tradeId} has no on-chain escrow listing to settle`);
	}
	const usdcUnits = BigInt(trade.usdcAmountUnits);

	const settled = await oracleSettleToBuyer({
		listingId,
		buyerAddress: buyerWallet,
		amountUnits: usdcUnits,
		proofId: proofIdBytes32,
	});
	const releaseTxHash = settled.transactionHash ?? trade.txHash ?? undefined;
	if (!releaseTxHash && !settled.alreadyCompleted) {
		throw new Error("On-chain escrow settlement did not return a transaction hash");
	}

	// 3. Complete escrow release lifecycle and update order
	try {
		transitionEscrowReleaseState(params.tradeId, "request_release", {
			txHash: releaseTxHash,
			proofId: proofIdBytes32,
		});
		transitionEscrowReleaseState(params.tradeId, "confirm_on_chain", {
			txHash: releaseTxHash,
			proofId: proofIdBytes32,
		});
	} catch (releaseErr) {
		console.warn("Escrow release transition warning:", releaseErr);
	}

	completePeerTrade(params.tradeId, {
		proofId: proofIdBytes32,
		txHash: releaseTxHash,
	});

	return getSharedTrade(params.tradeId) || trade;
}

export type ProviderChargeStatus =
	| { state: "successful"; flwTxId: number }
	| { state: "failed"; reason: string }
	| { state: "pending" }
	| { state: "unknown" };

/**
 * Asks Flutterwave what happened to a checkout reference. Used by the payment
 * watcher; it never changes state itself.
 */
export async function getFlutterwaveChargeStatus(txRef: string): Promise<ProviderChargeStatus> {
	const secretKey = getFlwSecretKey();
	if (!secretKey) return { state: "unknown" };
	try {
		const res = await fetch(
			`${getFlwBaseUrl()}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
			{
				headers: { Authorization: `Bearer ${secretKey}` },
				cache: "no-store",
				signal: AbortSignal.timeout(15_000),
			},
		);
		const body = (await res.json().catch(() => ({}))) as {
			status?: string;
			message?: string;
			data?: { id?: number; status?: string; tx_ref?: string; processor_response?: string };
		};
		if (!res.ok || body.status !== "success" || !body.data) {
			// Flutterwave answers "No transaction was found for this id" until the buyer pays.
			return { state: "pending" };
		}
		if (body.data.tx_ref && body.data.tx_ref !== txRef) return { state: "unknown" };
		const status = (body.data.status ?? "").toLowerCase();
		if (status === "successful" && body.data.id) return { state: "successful", flwTxId: body.data.id };
		if (status === "failed" || status === "cancelled") {
			return { state: "failed", reason: body.data.processor_response || status };
		}
		return { state: "pending" };
	} catch {
		return { state: "unknown" };
	}
}
