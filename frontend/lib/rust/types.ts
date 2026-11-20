/**
 * Authoritative TypeScript types matching the PeerNotary Rust backend models
 * defined in rust/src/models.rs, rust/src/lifecycle.rs, and rust/src/payments_api.rs.
 */

// ─── HEALTH & OBSERVED STATUS ───────────────────────────────────────────────

export interface RustHealthResponse {
	status: string;
	chain_id?: number;
	notary_public_key?: string;
	escrow_address?: string;
	version?: string;
	service?: string;
}

export interface RustLiveResponse {
	status: "alive";
}

export interface RustReadyResponse {
	status: "ready" | "not_ready";
	active_sessions?: number;
	total_proofs?: number;
	notary_key_loaded?: boolean;
}

// ─── TLSNOTARY SESSIONS & PROOFS ───────────────────────────────────────────

export type RustSessionState =
	| "pending"
	| "executing"
	| "verified"
	| "failed"
	| "cancelled"
	| "expired";

export interface RustCreateSessionRequest {
	trade_id: string;
	buyer_address: string;
	expected_amount_units: number | string | bigint;
	expected_currency: string;
	payment_reference: string;
	expected_recipient_hash?: string | null;
	target_hostname: string;
	idempotency_key?: string | null;
}

export interface RustCreateSessionResponse {
	session_id: string;
	verification_id: string;
	trade_id: string;
	state: RustSessionState;
	expires_at: string;
	notary_public_key_hex: string;
	domain_binding_digest: string;
}

export interface RustSessionRecord {
	session_id: string;
	verification_id: string;
	trade_id: string;
	buyer_address: string;
	expected_amount_units: number;
	expected_currency: string;
	payment_reference: string;
	expected_recipient_hash?: string | null;
	target_hostname: string;
	chain_id: number;
	escrow_address: string;
	state: RustSessionState;
	proof_id?: string | null;
	on_chain_proof_id_bytes32?: string | null;
	failure_reason?: string | null;
	created_at: string;
	updated_at: string;
	expires_at: string;
}

export interface RustExecuteSessionRequest {
	presentation_bincode_hex?: string | null;
	payment_status?: string | null;
}

export interface RustVerifyProofRequest {
	session_id: string;
	trade_id: string;
	buyer_address: string;
	presentation_bincode_hex: string;
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

export interface RustProofRecord {
	proof_id: string;
	on_chain_proof_id_bytes32: string;
	session_id: string;
	trade_id: string;
	buyer_address: string;
	verified: boolean;
	checks_performed: string[];
	evidence: RustExtractedPaymentEvidence;
	binding_attestation: RustEscrowBindingAttestation;
	created_at: string;
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

export interface RustProofEvidenceResponse {
	proof_id: string;
	session_id: string;
	trade_id: string;
	evidence: RustExtractedPaymentEvidence;
	binding_attestation: RustEscrowBindingAttestation;
}

export interface RustEvaluateEscrowReleaseRequest {
	session_id: string;
	proof_id: string;
	trade_id: string;
	buyer_address: string;
	expected_amount_units: number | string | bigint;
	expected_currency: string;
	expected_payment_reference: string;
	chain_id: number;
	escrow_address: string;
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

// ─── WALLET AUTHENTICATION & PROFILES ───────────────────────────────────────

export interface RustChallengeRequest {
	address: string;
	domain?: string;
	uri?: string;
}

export interface RustChallengeResponse {
	address: string;
	nonce: string;
	message: string;
	expires_at: string;
	chain_id: number;
}

export interface RustVerifyWalletRequest {
	address: string;
	nonce: string;
	signature: string;
}

export interface RustUserProfileRecord {
	wallet_address: string;
	username?: string | null;
	created_at: string;
	updated_at: string;
}

export interface RustVerifyWalletResponse {
	authenticated: boolean;
	session_token: string;
	expires_at: string;
	profile: RustUserProfileRecord;
}

export interface RustUserTrustProfile {
	wallet_address: string;
	trust_tier: "new" | "verified" | "trusted" | "flagged";
	completed_trades: number;
	disputed_trades: number;
	total_volume_minor_units: number;
	requires_strong_verification: boolean;
	active_guarantors_count: number;
	risk_score: number;
}

// ─── SELLER LISTINGS & PARTIAL QUEUE ────────────────────────────────────────

export interface RustSellerListingRecord {
	listing_ref: string;
	seller_address: string;
	total_amount_units: number;
	available_amount_units: number;
	min_order_units: number;
	max_order_units: number;
	currency: string;
	price_per_unit_fiat: string;
	fiat_currency: string;
	payment_methods: string[];
	status: "active" | "exhausted" | "cancelled" | "frozen";
	created_at: string;
	updated_at: string;
}

export interface RustCreateListingRequest {
	seller_address: string;
	total_amount_units: number;
	min_order_units: number;
	max_order_units: number;
	currency: string;
	price_per_unit_fiat: string;
	fiat_currency: string;
	payment_methods: string[];
}

export interface RustListingOrderRequest {
	buyer_address: string;
	order_amount_units: number;
	payment_method: string;
	idempotency_key?: string;
}

export interface RustListingOrderResponse {
	order_ref: string;
	listing_ref: string;
	trade_id?: string | null;
	status: "matched" | "queued";
	queue_position?: number | null;
	allocated_amount_units: number;
}

export interface RustQueueEntryRecord {
	queue_ref: string;
	listing_ref: string;
	buyer_address: string;
	requested_amount_units: number;
	status: "waiting" | "allocated" | "cancelled" | "expired";
	created_at: string;
}

// ─── TRADES, CHECKOUT & PAYOUTS ─────────────────────────────────────────────

export interface RustTradeRecord {
	trade_id: string;
	buyer_address: string;
	seller_address: string;
	fiat_amount_minor_units: number;
	fiat_currency: string;
	crypto_amount_units: number;
	crypto_currency: string;
	payment_reference: string;
	state:
		| "created"
		| "payment_pending"
		| "payment_verified"
		| "payout_pending"
		| "payout_completed"
		| "escrow_released"
		| "cancelled"
		| "refunded"
		| "disputed";
	created_at: string;
	expires_at: string;
}

export interface RustCreateTradeRequest {
	trade_id: string;
	buyer_address: string;
	seller_address: string;
	fiat_amount_minor_units: number;
	fiat_currency: string;
	crypto_amount_units: number;
	crypto_currency: string;
	payment_reference: string;
	buyer_email?: string | null;
	buyer_name?: string | null;
}

export interface RustCheckoutRequest {
	buyer_email: string;
	buyer_name: string;
	redirect_url?: string;
	idempotency_key?: string;
}

export interface RustCheckoutResponse {
	trade_id: string;
	payment_reference: string;
	checkout_url: string;
	flw_ref?: string;
	expires_at: string;
}

export interface RustVerifyPaymentRequest {
	flw_transaction_id?: string | number;
	tx_ref?: string;
}

export interface RustVerifyPaymentResponse {
	trade_id: string;
	verified: boolean;
	payment_status: "successful" | "failed" | "pending";
	amount_matched: boolean;
	currency_matched: boolean;
	account_settled: boolean;
}

export interface RustPayoutRequest {
	seller_bank_code: string;
	seller_account_number: string;
	seller_account_name?: string;
	idempotency_key?: string;
}

export interface RustPayoutResponse {
	trade_id: string;
	payout_reference: string;
	status: "queued" | "successful" | "failed";
}

export interface RustRefundRequest {
	reason: string;
	idempotency_key?: string;
}

export interface RustRefundResponse {
	trade_id: string;
	refund_reference: string;
	status: "queued" | "successful" | "failed";
}

export interface RustEscrowReleaseRequest {
	trade_id: string;
	proof_id: string;
	session_id: string;
	idempotency_key?: string;
}

export interface RustEscrowReleaseResponse {
	trade_id: string;
	authorized: boolean;
	on_chain_tx_hash?: string;
	status: "completed" | "failed" | "deferred";
}
