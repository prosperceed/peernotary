import "server-only";

const verifierUrl = (): string => {
	const value = process.env.TLSN_VERIFIER_URL;
	if (!value) throw new Error("Missing required server configuration: TLSN_VERIFIER_URL");
	const url = new URL(value);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("TLSN_VERIFIER_URL must use HTTP or HTTPS");
	}
	return url.toString().replace(/\/$/, "");
};

const serviceApiKey = (): string => {
	const key = process.env.TLSN_SERVICE_API_KEY ?? process.env.TLSN_WEBHOOK_SECRET;
	if (!key) {
		throw new Error("Missing required server configuration: TLSN_SERVICE_API_KEY or TLSN_WEBHOOK_SECRET");
	}
	return key;
};

export interface TlsnSessionMetadata {
	verificationId: string;
	tradeId: string;
	purpose: "payment_verification";
}

export interface CreateRustTlsnSessionParams {
	tradeId: string;
	buyerAddress: string;
	sellerAddress?: string;
	expectedAmountUnits: string;
	expectedCurrency: string;
	expectedPaymentReference: string;
	targetDomain: string;
	chainId?: number;
	escrowAddress?: string;
	idempotencyKey?: string;
}

export interface RustTlsnSessionResponse {
	sessionId: string;
	verificationId: string;
	tradeId: string;
	state: string;
	targetDomain: string;
	expectedAmountUnits: string;
	expectedCurrency: string;
	expectedPaymentReference: string;
	chainId: number;
	escrowAddress: string;
	proofId?: string | null;
	onChainProofIdBytes32?: string | null;
	failureReason?: string | null;
	createdAt: string;
	updatedAt: string;
	expiresAt: string;
}

export interface RustVerifyPresentationParams {
	sessionId: string;
	tradeId: string;
	presentationBincodeHex: string;
	buyerAddress: string;
}

export interface RustEscrowBindingAttestation {
	chainId: number;
	escrowAddress: string;
	tradeId: string;
	sessionId: string;
	onChainProofIdBytes32: string;
	evidenceDigestHex: string;
	notarySignatureHex: string;
	notaryPublicKeyHex: string;
	verifiedAt: string;
}

export interface RustProofSummaryResponse {
	proofId: string;
	onChainProofIdBytes32: string;
	sessionId: string;
	tradeId: string;
	verified: boolean;
	checksPerformed: string[];
	bindingAttestation: RustEscrowBindingAttestation;
	createdAt: string;
}

export async function verifierHealth(): Promise<boolean> {
	try {
		const response = await fetch(`${verifierUrl()}/health/ready`, {
			cache: "no-store",
			signal: AbortSignal.timeout(5_000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

export function getVerifierUrl(): string {
	return verifierUrl();
}

export async function createRustVerificationSession(
	params: CreateRustTlsnSessionParams,
): Promise<RustTlsnSessionResponse> {
	const response = await fetch(`${verifierUrl()}/api/v1/sessions`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${serviceApiKey()}`,
			"x-wallet-address": params.buyerAddress,
		},
		body: JSON.stringify({
			tradeId: params.tradeId,
			buyerAddress: params.buyerAddress,
			sellerAddress: params.sellerAddress,
			expectedAmountUnits: params.expectedAmountUnits,
			expectedCurrency: params.expectedCurrency,
			expectedPaymentReference: params.expectedPaymentReference,
			targetDomain: params.targetDomain,
			chainId: params.chainId,
			escrowAddress: params.escrowAddress,
			idempotencyKey: params.idempotencyKey,
		}),
		cache: "no-store",
		signal: AbortSignal.timeout(8_000),
	});

	if (!response.ok) {
		const errBody = await response.json().catch(() => ({}));
		throw new Error(
			typeof errBody?.error === "string"
				? errBody.error
				: `Rust TLSN session creation failed with status ${response.status}`,
		);
	}

	return (await response.json()) as RustTlsnSessionResponse;
}

export async function verifyPresentationWithRustService(
	params: RustVerifyPresentationParams,
): Promise<RustProofSummaryResponse> {
	const response = await fetch(`${verifierUrl()}/api/v1/proofs/verify`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${serviceApiKey()}`,
			"x-wallet-address": params.buyerAddress,
		},
		body: JSON.stringify({
			sessionId: params.sessionId,
			tradeId: params.tradeId,
			presentationBincodeHex: params.presentationBincodeHex,
		}),
		cache: "no-store",
		signal: AbortSignal.timeout(15_000),
	});

	if (!response.ok) {
		const errBody = await response.json().catch(() => ({}));
		throw new Error(
			typeof errBody?.error === "string"
				? errBody.error
				: `Rust TLSN proof verification failed with status ${response.status}`,
		);
	}

	return (await response.json()) as RustProofSummaryResponse;
}
