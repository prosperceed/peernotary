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
	// Prefer TLSN_WEBHOOK_SECRET first since it is shared across both .env files, or TLSN_SERVICE_API_KEY
	const key = process.env.TLSN_WEBHOOK_SECRET ?? process.env.TLSN_SERVICE_API_KEY;
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
	expectedAmountUnits: bigint | number | string;
	expectedCurrency: string;
	paymentReference: string;
	expectedRecipientHash?: string | null;
	targetHostname: string;
	idempotencyKey?: string;
}

export interface RustCreateSessionResponse {
	session_id: string;
	verification_id: string;
	trade_id: string;
	state: string;
	expires_at: string;
	notary_public_key_hex: string;
	domain_binding_digest: string;
}

export interface RustEscrowBindingAttestation {
	chain_id: number;
	escrow_address: string;
	trade_id: string;
	session_id: string;
	on_chain_proof_id_bytes32: string;
	evidence_digest_hex: string;
	notary_signature_hex: string;
	notary_public_key_hex: string;
	verified_at: string;
}

export interface RustProofSummaryResponse {
	proof_id: string;
	on_chain_proof_id_bytes32: string;
	session_id: string;
	trade_id: string;
	verified: boolean;
	checks_performed: string[];
	binding_attestation: RustEscrowBindingAttestation;
	created_at: string;
}

export interface RustExtractedPaymentEvidence {
	server_name: string;
	connection_timestamp: number;
	trade_id: string;
	amount_units: number;
	currency: string;
	payment_reference: string;
	payment_status: string;
	recipient_hash?: string | null;
	transcript_sent_len: number;
	transcript_recv_len: number;
	transcript_digest_hex: string;
}

export interface RustProofEvidenceResponse {
	proof_id: string;
	session_id: string;
	trade_id: string;
	evidence: RustExtractedPaymentEvidence;
	binding_attestation: RustEscrowBindingAttestation;
}

export interface RustEvaluateEscrowReleaseResponse {
	authorized: boolean;
	trade_id: string;
	session_id: string;
	proof_id: string;
	on_chain_proof_id_bytes32: string;
	checks_performed: string[];
	rejection_reasons: string[];
	binding_attestation?: RustEscrowBindingAttestation | null;
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
): Promise<RustCreateSessionResponse> {
	const numericUnits = Number(
		String(params.expectedAmountUnits).replace(/[^0-9]/g, "") || "0",
	);
	const response = await fetch(`${verifierUrl()}/api/v1/sessions`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${serviceApiKey()}`,
			"x-wallet-address": params.buyerAddress,
		},
		body: JSON.stringify({
			trade_id: params.tradeId,
			buyer_address: params.buyerAddress,
			expected_amount_units: numericUnits > 0 ? numericUnits : 500000,
			expected_currency: params.expectedCurrency,
			payment_reference: params.paymentReference,
			expected_recipient_hash: params.expectedRecipientHash ?? null,
			target_hostname: params.targetHostname,
			idempotency_key: params.idempotencyKey ?? null,
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

	return (await response.json()) as RustCreateSessionResponse;
}

export async function executeRustSessionVerification(params: {
	sessionId: string;
	buyerAddress: string;
	paymentStatus?: string;
	presentationBincodeHex?: string;
}): Promise<RustProofSummaryResponse> {
	const response = await fetch(
		`${verifierUrl()}/api/v1/sessions/${encodeURIComponent(params.sessionId)}/execute`,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${serviceApiKey()}`,
				"x-wallet-address": params.buyerAddress,
			},
			body: JSON.stringify({
				presentation_bincode_hex: params.presentationBincodeHex ?? null,
				payment_status: params.paymentStatus ?? "completed",
			}),
			cache: "no-store",
			signal: AbortSignal.timeout(15_000),
		},
	);

	if (!response.ok) {
		const errBody = await response.json().catch(() => ({}));
		throw new Error(
			typeof errBody?.error === "string"
				? `${errBody.error}${errBody.message ? `: ${errBody.message}` : ""}`
				: `Rust TLSN proof execution failed with status ${response.status}`,
		);
	}

	return (await response.json()) as RustProofSummaryResponse;
}

export async function getRustProofEvidence(params: {
	proofId: string;
	buyerAddress: string;
}): Promise<RustProofEvidenceResponse> {
	const response = await fetch(
		`${verifierUrl()}/api/v1/proofs/${encodeURIComponent(params.proofId)}/evidence`,
		{
			method: "GET",
			headers: {
				authorization: `Bearer ${serviceApiKey()}`,
				"x-wallet-address": params.buyerAddress,
			},
			cache: "no-store",
			signal: AbortSignal.timeout(8_000),
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch proof evidence: ${response.status}`);
	}

	return (await response.json()) as RustProofEvidenceResponse;
}

export async function evaluateRustEscrowRelease(params: {
	sessionId: string;
	proofId: string;
	tradeId: string;
	buyerAddress: string;
	expectedAmountUnits: number;
	expectedCurrency: string;
	expectedPaymentReference: string;
	chainId?: number;
	escrowAddress?: string;
}): Promise<RustEvaluateEscrowReleaseResponse> {
	const response = await fetch(`${verifierUrl()}/api/v1/escrow/evaluate-release`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${serviceApiKey()}`,
			"x-wallet-address": params.buyerAddress,
		},
		body: JSON.stringify({
			session_id: params.sessionId,
			proof_id: params.proofId,
			trade_id: params.tradeId,
			buyer_address: params.buyerAddress,
			expected_amount_units: params.expectedAmountUnits,
			expected_currency: params.expectedCurrency,
			expected_payment_reference: params.expectedPaymentReference,
			chain_id: params.chainId ?? 5042002,
			escrow_address:
				params.escrowAddress ??
				process.env.ESCROW_ADDRESS ??
				process.env.NEXT_PUBLIC_ESCROW_ADDRESS ??
				"0x5042f1114C6F272f5909f16510399986EF0D734D",
		}),
		cache: "no-store",
		signal: AbortSignal.timeout(8_000),
	});

	if (!response.ok) {
		throw new Error(`Escrow release evaluation failed: ${response.status}`);
	}

	return (await response.json()) as RustEvaluateEscrowReleaseResponse;
}
