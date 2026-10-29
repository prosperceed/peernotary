use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::ApiError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TradeLifecycleState {
    Open,
    AwaitingPayment,
    PaymentConfirmed,
    SellerPayoutPending,
    SellerPayoutConfirmed,
    ReleasePending,
    Completed,
    PayoutOnHold,
    RefundPending,
    ReleaseOnHold,
    LatePaymentReview,
    Cancelled,
    Disputed,
}

impl TradeLifecycleState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Open => "OPEN",
            Self::AwaitingPayment => "AWAITING_PAYMENT",
            Self::PaymentConfirmed => "PAYMENT_CONFIRMED",
            Self::SellerPayoutPending => "SELLER_PAYOUT_PENDING",
            Self::SellerPayoutConfirmed => "SELLER_PAYOUT_CONFIRMED",
            Self::ReleasePending => "RELEASE_PENDING",
            Self::Completed => "COMPLETED",
            Self::PayoutOnHold => "PAYOUT_ON_HOLD",
            Self::RefundPending => "REFUND_PENDING",
            Self::ReleaseOnHold => "RELEASE_ON_HOLD",
            Self::LatePaymentReview => "LATE_PAYMENT_REVIEW",
            Self::Cancelled => "CANCELLED",
            Self::Disputed => "DISPUTED",
        }
    }

    pub fn can_transition_to(self, next: Self) -> bool {
        if self == next {
            return true;
        }
        matches!(
            (self, next),
            // Offer creation -> Buyer joins trade & locks collateral -> AWAITING_PAYMENT
            (Self::Open, Self::AwaitingPayment)
                | (Self::Open, Self::Cancelled)
                // AWAITING_PAYMENT -> verified payment or expiry/late/dispute
                | (Self::AwaitingPayment, Self::PaymentConfirmed)
                | (Self::AwaitingPayment, Self::LatePaymentReview)
                | (Self::AwaitingPayment, Self::RefundPending)
                | (Self::AwaitingPayment, Self::Cancelled)
                | (Self::AwaitingPayment, Self::Disputed)
                // PAYMENT_CONFIRMED -> Seller payout initiation or refund/dispute
                | (Self::PaymentConfirmed, Self::SellerPayoutPending)
                | (Self::PaymentConfirmed, Self::PayoutOnHold)
                | (Self::PaymentConfirmed, Self::RefundPending)
                | (Self::PaymentConfirmed, Self::Disputed)
                // SELLER_PAYOUT_PENDING -> Confirmed or On Hold
                | (Self::SellerPayoutPending, Self::SellerPayoutConfirmed)
                | (Self::SellerPayoutPending, Self::PayoutOnHold)
                | (Self::SellerPayoutPending, Self::Disputed)
                // PAYOUT_ON_HOLD -> Retry payout, confirm payout, or seller-authorized refund
                | (Self::PayoutOnHold, Self::SellerPayoutPending)
                | (Self::PayoutOnHold, Self::SellerPayoutConfirmed)
                | (Self::PayoutOnHold, Self::RefundPending)
                | (Self::PayoutOnHold, Self::Disputed)
                // SELLER_PAYOUT_CONFIRMED -> Request on-chain USDC release
                | (Self::SellerPayoutConfirmed, Self::ReleasePending)
                | (Self::SellerPayoutConfirmed, Self::ReleaseOnHold)
                | (Self::SellerPayoutConfirmed, Self::Disputed)
                // RELEASE_PENDING -> Confirmed on-chain or placed on hold
                | (Self::ReleasePending, Self::Completed)
                | (Self::ReleasePending, Self::ReleaseOnHold)
                | (Self::ReleasePending, Self::Disputed)
                // RELEASE_ON_HOLD -> Reconcile/retry release or complete after receipt verification
                | (Self::ReleaseOnHold, Self::ReleasePending)
                | (Self::ReleaseOnHold, Self::Completed)
                | (Self::ReleaseOnHold, Self::Disputed)
                // LATE_PAYMENT_REVIEW -> Either authorized continuation or refund
                | (Self::LatePaymentReview, Self::PaymentConfirmed)
                | (Self::LatePaymentReview, Self::RefundPending)
                | (Self::LatePaymentReview, Self::Disputed)
                // REFUND_PENDING -> Cancelled only after refund settlement & escrow resolution
                | (Self::RefundPending, Self::Cancelled)
                | (Self::RefundPending, Self::Disputed)
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PaymentState {
    Unpaid,
    CheckoutCreated,
    PendingVerification,
    Confirmed,
    LateConfirmed,
    Underpaid,
    Overpaid,
    Failed,
    Expired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PayoutState {
    NotStarted,
    Pending,
    Processing,
    Confirmed,
    OnHold,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RefundState {
    None,
    Requested,
    Approved,
    Processing,
    Completed,
    Failed,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EscrowOperationState {
    Created,
    Funded,
    FiatSent,
    ReleasePending,
    Released,
    OnHold,
    Cancelled,
    Disputed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AttemptStatus {
    Initiated,
    RedirectReady,
    PendingVerification,
    Verified,
    LateVerified,
    MismatchHold,
    Failed,
    Expired,
    Abandoned,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeRecord {
    pub id: String,
    pub trade_id: String,
    pub seller_address: String,
    pub buyer_address: Option<String>,
    pub side: String,
    pub usdc_amount_units: u128,
    pub buyer_collateral_usdc_units: u128,
    pub platform_fee_bps: u16,
    pub platform_fee_usdc_units: u128,
    pub fiat_currency: String,
    pub fiat_amount_minor: u128,
    pub exchange_rate_minor: u128,
    pub seller_bank_code: String,
    pub seller_bank_name: String,
    pub seller_account_masked: String,
    pub seller_account_hash: String,
    pub seller_recipient_code: Option<String>,
    pub lifecycle_state: TradeLifecycleState,
    pub payment_state: PaymentState,
    pub payout_state: PayoutState,
    pub refund_state: RefundState,
    pub escrow_state: EscrowOperationState,
    pub terms_locked: bool,
    pub payment_deadline_at: Option<DateTime<Utc>>,
    pub chain_id: u64,
    pub escrow_contract_address: String,
    pub initiate_tx_hash: Option<String>,
    pub collateral_tx_hash: Option<String>,
    pub release_tx_hash: Option<String>,
    pub proof_id_bytes32: Option<String>,
    pub version: u32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentAttemptRecord {
    pub id: String,
    pub trade_uuid: String,
    pub trade_id: String,
    pub buyer_address: String,
    pub tx_ref: String,
    pub idempotency_key: String,
    pub flw_tx_id: Option<u64>,
    pub flw_ref: Option<String>,
    pub expected_amount_minor: u128,
    pub expected_currency: String,
    pub settled_amount_minor: Option<u128>,
    pub app_fee_minor: Option<u128>,
    pub checkout_url: Option<String>,
    pub status: AttemptStatus,
    pub failure_code: Option<String>,
    pub failure_reason: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub verified_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SellerPayoutRecord {
    pub id: String,
    pub trade_uuid: String,
    pub trade_id: String,
    pub seller_address: String,
    pub payout_reference: String,
    pub idempotency_key: String,
    pub flw_transfer_id: Option<u64>,
    pub amount_minor: u128,
    pub currency: String,
    pub bank_code: String,
    pub bank_name: String,
    pub account_masked: String,
    pub status: PayoutState,
    pub attempt_count: u32,
    pub failure_reason: Option<String>,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefundRecord {
    pub id: String,
    pub trade_uuid: String,
    pub trade_id: String,
    pub payment_attempt_id: String,
    pub requested_by_address: String,
    pub approved_by_address: Option<String>,
    pub refund_reference: String,
    pub idempotency_key: String,
    pub flw_refund_id: Option<u64>,
    pub amount_minor: u128,
    pub currency: String,
    pub reason: String,
    pub status: RefundState,
    pub failure_reason: Option<String>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EscrowOperationRecord {
    pub id: String,
    pub trade_uuid: String,
    pub trade_id: String,
    pub operation_type: String,
    pub idempotency_key: String,
    pub chain_id: u64,
    pub contract_address: String,
    pub tx_hash: Option<String>,
    pub proof_id_bytes32: Option<String>,
    pub status: String,
    pub block_number: Option<u64>,
    pub failure_reason: Option<String>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeAuditEvent {
    pub id: String,
    pub trade_uuid: String,
    pub trade_id: String,
    pub actor_address: Option<String>,
    pub actor_role: String,
    pub event_type: String,
    pub previous_state: Option<String>,
    pub new_state: String,
    pub correlation_id: Option<String>,
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutboxJob {
    pub id: String,
    pub job_type: String,
    pub dedup_key: String,
    pub trade_id: String,
    pub payload: Value,
    pub status: String,
    pub attempts: u32,
    pub max_attempts: u32,
    pub next_run_at: DateTime<Utc>,
    pub last_error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookInboxEvent {
    pub id: String,
    pub event_id: String,
    pub provider: String,
    pub event_type: String,
    pub tx_ref: Option<String>,
    pub flw_tx_id: Option<u64>,
    pub signature_verified: bool,
    pub processing_status: String,
    pub redacted_payload: Value,
    pub error_message: Option<String>,
    pub received_at: DateTime<Utc>,
    pub processed_at: Option<DateTime<Utc>>,
}

impl TradeRecord {
    pub fn new_awaiting_payment(
        trade_id: String,
        seller_address: String,
        buyer_address: String,
        usdc_amount_units: u128,
        exchange_rate_minor: u128,
        fiat_currency: String,
        seller_bank_code: String,
        seller_bank_name: String,
        seller_account_masked: String,
        seller_account_hash: String,
        chain_id: u64,
        escrow_contract_address: String,
        timeout_minutes: u64,
    ) -> Result<Self, ApiError> {
        let seller = seller_address.trim().to_ascii_lowercase();
        let buyer = buyer_address.trim().to_ascii_lowercase();
        if seller == buyer {
            return Err(ApiError::BadRequest(
                "Seller and buyer wallet addresses must be distinct".into(),
            ));
        }
        if usdc_amount_units == 0 || exchange_rate_minor == 0 {
            return Err(ApiError::BadRequest(
                "Trade amounts and exchange rate must be positive".into(),
            ));
        }

        // Decimal-safe calculation:
        // usdc_amount_units is in 1e-6 USDC (micro-USDC).
        // exchange_rate_minor is NGN kobo per 1 USDC (e.g., 1630.00 NGN = 163_000 kobo).
        // fiat_amount_minor = (usdc_amount_units * exchange_rate_minor) / 1_000_000
        let fiat_amount_minor = usdc_amount_units
            .checked_mul(exchange_rate_minor)
            .ok_or_else(|| ApiError::BadRequest("Monetary calculation overflow".into()))?
            / 1_000_000;

        if fiat_amount_minor == 0 {
            return Err(ApiError::BadRequest(
                "Calculated fiat amount in minor units must be greater than zero".into(),
            ));
        }

        let platform_fee_bps: u16 = 100; // 1.00%
        let platform_fee_usdc_units = (usdc_amount_units * u128::from(platform_fee_bps)) / 10_000;
        let now = Utc::now();
        let deadline = now + ChronoDuration::minutes(timeout_minutes as i64);

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            trade_id,
            seller_address: seller,
            buyer_address: Some(buyer),
            side: "sell".to_string(),
            usdc_amount_units,
            buyer_collateral_usdc_units: 50_000_000, // 50 USDC
            platform_fee_bps,
            platform_fee_usdc_units,
            fiat_currency: fiat_currency.to_ascii_uppercase(),
            fiat_amount_minor,
            exchange_rate_minor,
            seller_bank_code,
            seller_bank_name,
            seller_account_masked,
            seller_account_hash,
            seller_recipient_code: None,
            lifecycle_state: TradeLifecycleState::AwaitingPayment,
            payment_state: PaymentState::Unpaid,
            payout_state: PayoutState::NotStarted,
            refund_state: RefundState::None,
            escrow_state: EscrowOperationState::Funded,
            terms_locked: true,
            payment_deadline_at: Some(deadline),
            chain_id,
            escrow_contract_address: escrow_contract_address.to_ascii_lowercase(),
            initiate_tx_hash: None,
            collateral_tx_hash: None,
            release_tx_hash: None,
            proof_id_bytes32: None,
            version: 1,
            created_at: now,
            updated_at: now,
        })
    }

    pub fn transition(
        &mut self,
        expected_version: u32,
        next_lifecycle: TradeLifecycleState,
        actor_address: Option<&str>,
        actor_role: &str,
        event_type: &str,
        correlation_id: Option<&str>,
        metadata: Value,
    ) -> Result<TradeAuditEvent, ApiError> {
        if self.version != expected_version {
            return Err(ApiError::Conflict("CONCURRENT_MODIFICATION_VERSION_MISMATCH"));
        }
        if !self.lifecycle_state.can_transition_to(next_lifecycle) {
            return Err(ApiError::Conflict("ILLEGAL_TRADE_STATE_TRANSITION"));
        }

        let prev = self.lifecycle_state.as_str().to_string();
        self.lifecycle_state = next_lifecycle;
        self.version += 1;
        self.updated_at = Utc::now();

        Ok(TradeAuditEvent {
            id: Uuid::new_v4().to_string(),
            trade_uuid: self.id.clone(),
            trade_id: self.trade_id.clone(),
            actor_address: actor_address.map(|a| a.to_ascii_lowercase()),
            actor_role: actor_role.to_string(),
            event_type: event_type.to_string(),
            previous_state: Some(prev),
            new_state: next_lifecycle.as_str().to_string(),
            correlation_id: correlation_id.map(|c| c.to_string()),
            metadata,
            created_at: self.updated_at,
        })
    }

    pub fn validate_escrow_release_eligibility(&self) -> Result<(), Vec<String>> {
        let mut reasons = Vec::new();

        if self.lifecycle_state != TradeLifecycleState::SellerPayoutConfirmed
            && self.lifecycle_state != TradeLifecycleState::ReleasePending
            && self.lifecycle_state != TradeLifecycleState::ReleaseOnHold
        {
            reasons.push(format!(
                "Trade lifecycle state '{}' is not eligible for escrow release; requires SELLER_PAYOUT_CONFIRMED",
                self.lifecycle_state.as_str()
            ));
        }

        if self.payment_state != PaymentState::Confirmed {
            reasons.push(format!(
                "Buyer payment state '{:?}' is not CONFIRMED",
                self.payment_state
            ));
        }

        if self.payout_state != PayoutState::Confirmed {
            reasons.push(format!(
                "Seller fiat payout state '{:?}' is not CONFIRMED",
                self.payout_state
            ));
        }

        if self.refund_state != RefundState::None && self.refund_state != RefundState::Rejected {
            reasons.push(format!(
                "Trade has active or completed refund state '{:?}'",
                self.refund_state
            ));
        }

        if self.buyer_address.is_none() {
            reasons.push("Trade has no assigned buyer wallet address".to_string());
        }

        if reasons.is_empty() {
            Ok(())
        } else {
            Err(reasons)
        }
    }
}

pub fn make_outbox_job(
    job_type: &str,
    dedup_key: &str,
    trade_id: &str,
    payload: Value,
    max_attempts: u32,
) -> OutboxJob {
    let now = Utc::now();
    OutboxJob {
        id: Uuid::new_v4().to_string(),
        job_type: job_type.to_string(),
        dedup_key: dedup_key.to_string(),
        trade_id: trade_id.to_string(),
        payload,
        status: "PENDING".to_string(),
        attempts: 0,
        max_attempts,
        next_run_at: now,
        last_error: None,
        created_at: now,
        updated_at: now,
    }
}

pub fn mask_account_number(account_no: &str) -> String {
    let digits: String = account_no.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() <= 4 {
        return "****".to_string();
    }
    let suffix = &digits[digits.len() - 4..];
    format!("******{suffix}")
}

pub fn redact_provider_payload(raw: &Value) -> Value {
    let mut cloned = raw.clone();
    if let Some(obj) = cloned.as_object_mut() {
        for sensitive in [
            "card",
            "account_number",
            "authorization",
            "secret",
            "token",
            "customer_ip",
            "device_fingerprint",
        ] {
            if obj.contains_key(sensitive) {
                obj.insert(sensitive.to_string(), json!("[REDACTED]"));
            }
        }
        if let Some(data) = obj.get_mut("data").and_then(|d| d.as_object_mut()) {
            for sensitive in [
                "card",
                "account",
                "account_number",
                "customer_ip",
                "device_fingerprint",
            ] {
                if data.contains_key(sensitive) {
                    data.insert(sensitive.to_string(), json!("[REDACTED]"));
                }
            }
        }
    }
    cloned
}
