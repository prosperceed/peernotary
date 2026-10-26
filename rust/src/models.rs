use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Pending,
    Executing,
    Verified,
    Failed,
    Cancelled,
    Expired,
}

impl SessionState {
    pub fn can_transition_to(self, next: SessionState) -> bool {
        matches!(
            (self, next),
            (SessionState::Pending, SessionState::Executing)
                | (SessionState::Pending, SessionState::Verified)
                | (SessionState::Pending, SessionState::Failed)
                | (SessionState::Pending, SessionState::Cancelled)
                | (SessionState::Pending, SessionState::Expired)
                | (SessionState::Executing, SessionState::Verified)
                | (SessionState::Executing, SessionState::Failed)
                | (SessionState::Executing, SessionState::Expired)
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateSessionRequest {
    pub trade_id: String,
    pub buyer_address: String,
    pub expected_amount_units: u128,
    pub expected_currency: String,
    pub payment_reference: String,
    pub expected_recipient_hash: Option<String>,
    pub target_hostname: String,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionResponse {
    pub session_id: String,
    pub verification_id: String,
    pub trade_id: String,
    pub state: SessionState,
    pub expires_at: DateTime<Utc>,
    pub notary_public_key_hex: String,
    pub domain_binding_digest: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub session_id: String,
    pub verification_id: String,
    pub trade_id: String,
    pub buyer_address: String,
    pub expected_amount_units: u128,
    pub expected_currency: String,
    pub payment_reference: String,
    pub expected_recipient_hash: Option<String>,
    pub target_hostname: String,
    pub chain_id: u64,
    pub escrow_address: String,
    pub state: SessionState,
    pub proof_id: Option<String>,
    pub on_chain_proof_id_bytes32: Option<String>,
    pub failure_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExecuteSessionRequest {
    pub presentation_bincode_hex: Option<String>,
    pub payment_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifyProofRequest {
    pub session_id: String,
    pub trade_id: String,
    pub buyer_address: String,
    pub presentation_bincode_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedPaymentEvidence {
    pub server_name: String,
    pub connection_timestamp: u64,
    pub trade_id: String,
    pub amount_units: u128,
    pub currency: String,
    pub payment_reference: String,
    pub payment_status: String,
    pub recipient_hash: Option<String>,
    pub transcript_sent_len: usize,
    pub transcript_recv_len: usize,
    pub transcript_digest_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EscrowBindingAttestation {
    pub chain_id: u64,
    pub escrow_address: String,
    pub trade_id: String,
    pub session_id: String,
    pub on_chain_proof_id_bytes32: String,
    pub evidence_digest_hex: String,
    pub notary_signature_hex: String,
    pub notary_public_key_hex: String,
    pub verified_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofRecord {
    pub proof_id: String,
    pub on_chain_proof_id_bytes32: String,
    pub session_id: String,
    pub trade_id: String,
    pub buyer_address: String,
    pub verified: bool,
    pub checks_performed: Vec<String>,
    pub evidence: ExtractedPaymentEvidence,
    pub binding_attestation: EscrowBindingAttestation,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofSummaryResponse {
    pub proof_id: String,
    pub on_chain_proof_id_bytes32: String,
    pub session_id: String,
    pub trade_id: String,
    pub verified: bool,
    pub checks_performed: Vec<String>,
    pub binding_attestation: EscrowBindingAttestation,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofEvidenceResponse {
    pub proof_id: String,
    pub session_id: String,
    pub trade_id: String,
    pub evidence: ExtractedPaymentEvidence,
    pub binding_attestation: EscrowBindingAttestation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvaluateEscrowReleaseRequest {
    pub session_id: String,
    pub proof_id: String,
    pub trade_id: String,
    pub buyer_address: String,
    pub expected_amount_units: u128,
    pub expected_currency: String,
    pub expected_payment_reference: String,
    pub chain_id: u64,
    pub escrow_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluateEscrowReleaseResponse {
    pub authorized: bool,
    pub trade_id: String,
    pub session_id: String,
    pub proof_id: String,
    pub on_chain_proof_id_bytes32: String,
    pub checks_performed: Vec<String>,
    pub rejection_reasons: Vec<String>,
    pub binding_attestation: Option<EscrowBindingAttestation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextjsWebhookCompatPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub server_name: String,
    #[serde(rename = "sessionData")]
    pub session_data: NextjsSessionData,
    #[serde(rename = "redactedTranscript")]
    pub redacted_transcript: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextjsSessionData {
    #[serde(rename = "tradeId")]
    pub trade_id: String,
    pub amount: String,
    #[serde(rename = "paymentReference")]
    pub payment_reference: String,
    #[serde(rename = "paymentStatus")]
    pub payment_status: String,
}
