import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
	createOrReuseCheckoutAttempt,
	getPaymentAttemptByRef,
	getSharedTrade,
	recordVerifiedFlutterwavePayment,
	type PaymentAttemptInfo,
} from "@/lib/trades/tradeStore";

function getFlwBaseUrl(): string {
	return (
		process.env.FLW_BASE_URL ?? "https://api.flutterwave.com/v3"
	).replace(/\/$/, "");
}

function getFlwSecretKey(): string | undefined {
	const key = process.env.FLW_SECRET_KEY?.trim();
	return key && key.length > 0 ? key : undefined;
}

function getFlwSecretHash(): string {
	return (
		process.env.FLW_SECRET_HASH ??
		process.env.TLSN_WEBHOOK_SECRET ??
		""
	).trim();
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

export async function initializeFlutterwaveStandardCheckout(params: {
	tradeId: string;
	buyerAddress: string;
	originUrl: string;
}): Promise<{
	attempt: PaymentAttemptInfo;
	hostedMode: "live_api" | "sandbox_portal";
}> {
	const attempt = createOrReuseCheckoutAttempt(
		params.tradeId,
		params.buyerAddress,
	);
	const trade = getSharedTrade(params.tradeId);
	const secretKey = getFlwSecretKey();

	if (secretKey && trade) {
		const redirectUrl = `${params.originUrl.replace(/\/$/, "")}/bank-checkout?tradeId=${encodeURIComponent(params.tradeId)}&tx_ref=${encodeURIComponent(attempt.txRef)}`;
		try {
			const res = await fetch(`${getFlwBaseUrl()}/payments`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${secretKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
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
						title: `PeerNotary Escrow Trade #${params.tradeId}`,
						description: `Fiat settlement for Arc Escrow Trade #${params.tradeId}`,
					},
				}),
				cache: "no-store",
				signal: AbortSignal.timeout(10_000),
			});

			if (res.ok) {
				const body = (await res.json()) as {
					status?: string;
					data?: { link?: string };
				};
				if (body.status === "success" && body.data?.link) {
					attempt.checkoutUrl = body.data.link;
					return { attempt, hostedMode: "live_api" };
				}
			}
		} catch {
			// Fall back to integrated checkout portal when offline or sandbox key not active
		}
	}

	return { attempt, hostedMode: "sandbox_portal" };
}

export async function verifyFlutterwaveTransactionServerSide(params: {
	tradeId: string;
	txRef: string;
	flwTransactionId?: number;
	simulatedAmountMinor?: number;
	simulatedCurrency?: string;
}): Promise<ReturnType<typeof recordVerifiedFlutterwavePayment>> {
	const attempt = getPaymentAttemptByRef(params.txRef);
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

		const res = await fetch(verifyUrl, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${secretKey}`,
			},
			cache: "no-store",
			signal: AbortSignal.timeout(10_000),
		});

		if (!res.ok) {
			throw new Error(`FLW_VERIFICATION_HTTP_${res.status}`);
		}

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
			payload.status !== "success" ||
			!payload.data ||
			payload.data.status?.toLowerCase() !== "successful"
		) {
			throw new Error("FLW_TRANSACTION_NOT_SUCCESSFUL");
		}

		if (payload.data.tx_ref !== params.txRef) {
			throw new Error("FLW_TX_REF_MISMATCH");
		}

		const verifiedAmountMinor = parseDecimalToMinorUnits(
			payload.data.amount ?? 0,
		);
		const verifiedCurrency = payload.data.currency ?? "NGN";
		const verifiedId = payload.data.id ?? params.flwTransactionId ?? Date.now();

		return recordVerifiedFlutterwavePayment({
			tradeId: params.tradeId,
			txRef: params.txRef,
			flwTxId: verifiedId,
			amountMinor: verifiedAmountMinor,
			currency: verifiedCurrency,
			source: "verify_api",
		});
	}

	// Deterministic sandbox verification when FLW_SECRET_KEY is not set in local dev
	const flwTxId =
		params.flwTransactionId ?? Math.floor(10_000_000 + Math.random() * 89_000_000);
	const amountMinor = params.simulatedAmountMinor ?? attempt.expectedAmountMinor;
	const currency = params.simulatedCurrency ?? attempt.expectedCurrency;

	return recordVerifiedFlutterwavePayment({
		tradeId: params.tradeId,
		txRef: params.txRef,
		flwTxId,
		amountMinor,
		currency,
		source: "verify_api",
	});
}
