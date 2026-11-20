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

        if fiat_amount_minor < 100 {
            return Err(ApiError::BadRequest(
                "Converted fiat amount is below payment provider minimum payable threshold (100 minor units / 1.00 NGN)".into(),
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
            buyer_collateral_usdc_units: 0,
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

// ─── SELLER-FUNDED INVENTORY, FIFO QUEUE, TRUST SCORING & ABUSE PREVENTION ───

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SellerListingStatus {
    Active,
    Paused,
    Depleted,
    Closed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SellerListingRecord {
    pub id: String,
    pub listing_ref: String,
    pub onchain_listing_id: String,
    pub seller_address: String,
    pub total_deposited_usdc_units: u128,
    pub available_usdc_units: u128,
    pub allocated_usdc_units: u128,
    pub reserved_queued_usdc_units: u128,
    pub filled_usdc_units: u128,
    pub withdrawn_usdc_units: u128,
    pub fiat_currency: String,
    pub exchange_rate_minor: u128,
    pub seller_bank_code: String,
    pub seller_bank_name: String,
    pub seller_account_masked: String,
    pub seller_account_hash: String,
    pub status: SellerListingStatus,
    pub active_trade_id: Option<String>,
    pub active_slot_lease_owner: Option<String>,
    pub active_slot_lease_expires_at: Option<DateTime<Utc>>,
    pub chain_id: u64,
    pub escrow_contract_address: String,
    pub deposit_tx_hash: Option<String>,
    pub version: u32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl SellerListingRecord {
    pub fn validate_conservation(&self) -> Result<(), ApiError> {
        let sum = self
            .available_usdc_units
            .checked_add(self.allocated_usdc_units)
            .and_then(|s| s.checked_add(self.reserved_queued_usdc_units))
            .and_then(|s| s.checked_add(self.filled_usdc_units))
            .and_then(|s| s.checked_add(self.withdrawn_usdc_units))
            .ok_or_else(|| ApiError::BadRequest("Seller inventory overflow".into()))?;
        if sum != self.total_deposited_usdc_units {
            return Err(ApiError::Conflict("SELLER_INVENTORY_CONSERVATION_MISMATCH"));
        }
        Ok(())
    }

    pub fn has_active_slot(&self, now: DateTime<Utc>) -> bool {
        if self.active_trade_id.is_some() {
            return true;
        }
        if let Some(exp) = self.active_slot_lease_expires_at {
            return exp > now;
        }
        false
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QueueEntryStatus {
    Queued,
    EligibleAwaitingConsent,
    ActiveSlot,
    Completed,
    CancelledByBuyer,
    Expired,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueEntryRecord {
    pub id: String,
    pub queue_ref: String,
    pub listing_ref: String,
    pub buyer_address: String,
    pub requested_usdc_units: u128,
    pub quoted_fiat_amount_minor: u128,
    pub exchange_rate_minor: u128,
    pub queue_position: u32,
    pub status: QueueEntryStatus,
    pub allocated_trade_id: Option<String>,
    pub consent_deadline_at: Option<DateTime<Utc>>,
    pub activated_at: Option<DateTime<Utc>>,
    pub cancelled_at: Option<DateTime<Utc>>,
    pub cancel_reason: Option<String>,
    pub client_ip_hash: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TrustTier {
    Restricted,
    New,
    Standard,
    Established,
    HighLimit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StrongerVerificationStatus {
    None,
    Pending,
    Verified,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskPolicyConfig {
    pub new_buyer_limit_usdc_units: u128,
    pub standard_limit_usdc_units: u128,
    pub established_limit_usdc_units: u128,
    pub high_limit_usdc_units: u128,
    pub restricted_limit_usdc_units: u128,
    pub large_trade_verification_threshold_usdc_units: u128,
    pub cooldown_steps_seconds: [u64; 5],
    pub active_slot_lease_seconds: i64,
    pub queue_consent_window_seconds: i64,
}

impl Default for RiskPolicyConfig {
    fn default() -> Self {
        Self {
            new_buyer_limit_usdc_units: 150_000_000,                  // 150 USDC
            standard_limit_usdc_units: 500_000_000,                   // 500 USDC
            established_limit_usdc_units: 2_500_000_000,              // 2,500 USDC
            high_limit_usdc_units: 10_000_000_000,                    // 10,000 USDC
            restricted_limit_usdc_units: 50_000_000,                  // 50 USDC
            large_trade_verification_threshold_usdc_units: 1_000_000_000, // 1,000 USDC
            cooldown_steps_seconds: [300, 900, 3600, 21600, 86400],
            active_slot_lease_seconds: 1200, // 20-minute payment window
            queue_consent_window_seconds: 300, // 5-minute activation window when reaching front of queue
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserTrustProfile {
    pub wallet_address: String,
    pub trust_tier: TrustTier,
    pub trust_score: u32,
    pub max_trade_usdc_units: u128,
    pub max_concurrent_unpaid_trades: u32,
    pub completed_trade_count: u32,
    pub completed_volume_usdc_units: u128,
    pub on_time_payment_count: u32,
    pub unexplained_expiry_count: u32,
    pub consecutive_expiry_streak: u32,
    pub cancelled_queue_count: u32,
    pub rapid_join_cancel_count: u32,
    pub dispute_loss_count: u32,
    pub cooldown_until: Option<DateTime<Utc>>,
    pub cooldown_reason: Option<String>,
    pub stronger_verification_status: StrongerVerificationStatus,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRiskEvent {
    pub id: String,
    pub wallet_address: String,
    pub event_type: String,
    pub trade_id: Option<String>,
    pub queue_ref: Option<String>,
    pub reason_code: String,
    pub score_delta: i32,
    pub previous_tier: TrustTier,
    pub new_tier: TrustTier,
    pub cooldown_seconds: u64,
    pub client_ip_hash: Option<String>,
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuarantorCommitmentRecord {
    pub id: String,
    pub commitment_ref: String,
    pub guarantor_address: String,
    pub beneficiary_buyer_address: String,
    pub trade_id: Option<String>,
    pub max_backed_usdc_units: u128,
    pub locked_bond_usdc_units: u128,
    pub eip191_signature: String,
    pub signed_payload_json: Value,
    pub onchain_tx_hash: Option<String>,
    pub status: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl UserTrustProfile {
    pub fn new_for_wallet(wallet_address: &str) -> Self {
        let cfg = RiskPolicyConfig::default();
        Self {
            wallet_address: wallet_address.trim().to_ascii_lowercase(),
            trust_tier: TrustTier::New,
            trust_score: 50,
            max_trade_usdc_units: cfg.new_buyer_limit_usdc_units,
            max_concurrent_unpaid_trades: 1,
            completed_trade_count: 0,
            completed_volume_usdc_units: 0,
            on_time_payment_count: 0,
            unexplained_expiry_count: 0,
            consecutive_expiry_streak: 0,
            cancelled_queue_count: 0,
            rapid_join_cancel_count: 0,
            dispute_loss_count: 0,
            cooldown_until: None,
            cooldown_reason: None,
            stronger_verification_status: StrongerVerificationStatus::None,
            updated_at: Utc::now(),
        }
    }

    pub fn active_cooldown_remaining_seconds(&self, now: DateTime<Utc>) -> u64 {
        if let Some(until) = self.cooldown_until {
            if until > now {
                return (until - now).num_seconds().max(1) as u64;
            }
        }
        0
    }

    pub fn recalculate_policy(&mut self, cfg: &RiskPolicyConfig) {
        let base: i32 = 50;
        let completed_bonus = ((self.completed_trade_count as i32) * 12).min(240);
        let volume_steps = (self.completed_volume_usdc_units / 50_000_000) as i32;
        let volume_bonus = (volume_steps * 5).min(150);
        let verification_bonus = if self.stronger_verification_status == StrongerVerificationStatus::Verified {
            60
        } else {
            0
        };

        let expiry_penalty = (self.unexplained_expiry_count as i32) * 25
            + (self.consecutive_expiry_streak as i32) * 20;
        let dispute_penalty = (self.dispute_loss_count as i32) * 120;
        let churn_penalty = (self.rapid_join_cancel_count as i32) * 15
            + (self.cancelled_queue_count as i32) * 2;

        let raw_score = base + completed_bonus + volume_bonus + verification_bonus
            - expiry_penalty
            - dispute_penalty
            - churn_penalty;
        self.trust_score = raw_score.clamp(0, 1000) as u32;

        if self.dispute_loss_count >= 2
            || self.consecutive_expiry_streak >= 4
            || self.trust_score < 25
        {
            self.trust_tier = TrustTier::Restricted;
            self.max_trade_usdc_units = cfg.restricted_limit_usdc_units;
            self.max_concurrent_unpaid_trades = 1;
        } else if self.completed_trade_count >= 20
            && self.completed_volume_usdc_units >= 5_000_000_000
            && self.trust_score >= 300
        {
            self.trust_tier = TrustTier::HighLimit;
            self.max_trade_usdc_units = cfg.high_limit_usdc_units;
            self.max_concurrent_unpaid_trades = 3;
        } else if self.completed_trade_count >= 5
            && self.completed_volume_usdc_units >= 500_000_000
            && self.trust_score >= 140
        {
            self.trust_tier = TrustTier::Established;
            self.max_trade_usdc_units = cfg.established_limit_usdc_units;
            self.max_concurrent_unpaid_trades = 2;
        } else if self.completed_trade_count >= 1 && self.trust_score >= 60 {
            self.trust_tier = TrustTier::Standard;
            self.max_trade_usdc_units = cfg.standard_limit_usdc_units;
            self.max_concurrent_unpaid_trades = 1;
        } else {
            self.trust_tier = TrustTier::New;
            self.max_trade_usdc_units = cfg.new_buyer_limit_usdc_units;
            self.max_concurrent_unpaid_trades = 1;
        }
        self.updated_at = Utc::now();
    }

    pub fn apply_trade_expiration(
        &mut self,
        trade_id: &str,
        is_provider_outage: bool,
        reason_code: &str,
        cfg: &RiskPolicyConfig,
    ) -> UserRiskEvent {
        let now = Utc::now();
        let prev_tier = self.trust_tier;

        if is_provider_outage {
            return UserRiskEvent {
                id: Uuid::new_v4().to_string(),
                wallet_address: self.wallet_address.clone(),
                event_type: "PROVIDER_OUTAGE_EXEMPTION".to_string(),
                trade_id: Some(trade_id.to_string()),
                queue_ref: None,
                reason_code: reason_code.to_string(),
                score_delta: 0,
                previous_tier: prev_tier,
                new_tier: self.trust_tier,
                cooldown_seconds: 0,
                client_ip_hash: None,
                metadata: json!({ "exempt_from_penalty": true }),
                created_at: now,
            };
        }

        let prev_score = self.trust_score as i32;
        self.unexplained_expiry_count += 1;
        self.consecutive_expiry_streak += 1;

        let idx = (self.consecutive_expiry_streak.saturating_sub(1) as usize)
            .min(cfg.cooldown_steps_seconds.len() - 1);
        let cooldown_secs = cfg.cooldown_steps_seconds[idx];
        let until = now + ChronoDuration::seconds(cooldown_secs as i64);

        self.cooldown_until = Some(until);
        self.cooldown_reason = Some(reason_code.to_string());
        self.recalculate_policy(cfg);
        let delta = (self.trust_score as i32) - prev_score;

        UserRiskEvent {
            id: Uuid::new_v4().to_string(),
            wallet_address: self.wallet_address.clone(),
            event_type: "COOLDOWN_APPLIED".to_string(),
            trade_id: Some(trade_id.to_string()),
            queue_ref: None,
            reason_code: reason_code.to_string(),
            score_delta: delta,
            previous_tier: prev_tier,
            new_tier: self.trust_tier,
            cooldown_seconds: cooldown_secs,
            client_ip_hash: None,
            metadata: json!({
                "consecutive_expiry_streak": self.consecutive_expiry_streak,
                "cooldown_until": until.to_rfc3339()
            }),
            created_at: now,
        }
    }

    pub fn record_completed_trade(
        &mut self,
        trade_id: &str,
        usdc_amount_units: u128,
        cfg: &RiskPolicyConfig,
    ) -> UserRiskEvent {
        let now = Utc::now();
        let prev_tier = self.trust_tier;
        let prev_score = self.trust_score as i32;

        self.completed_trade_count += 1;
        self.completed_volume_usdc_units = self
            .completed_volume_usdc_units
            .saturating_add(usdc_amount_units);
        self.on_time_payment_count += 1;
        self.consecutive_expiry_streak = 0;
        self.recalculate_policy(cfg);

        let delta = (self.trust_score as i32) - prev_score;
        UserRiskEvent {
            id: Uuid::new_v4().to_string(),
            wallet_address: self.wallet_address.clone(),
            event_type: "TRADE_COMPLETED_POSITIVE".to_string(),
            trade_id: Some(trade_id.to_string()),
            queue_ref: None,
            reason_code: "COMPLETED_TRADE_SETTLEMENT".to_string(),
            score_delta: delta,
            previous_tier: prev_tier,
            new_tier: self.trust_tier,
            cooldown_seconds: 0,
            client_ip_hash: None,
            metadata: json!({
                "completed_trade_count": self.completed_trade_count,
                "completed_volume_usdc_units": self.completed_volume_usdc_units.to_string(),
                "max_trade_usdc_units": self.max_trade_usdc_units.to_string()
            }),
            created_at: now,
        }
    }
}

/// Trusted-proxy aware client IP extractor.
/// Never trusts raw `X-Forwarded-For` or `X-Real-IP` unless `trust_proxy_headers` is explicitly enabled,
/// preventing attackers from spoofing `X-Forwarded-For` to bypass rate limits or frame other users.
pub fn extract_trusted_client_ip(
    headers: &axum::http::HeaderMap,
    trust_proxy_headers: bool,
) -> String {
    if trust_proxy_headers {
        if let Some(val) = headers
            .get("x-peernotary-trusted-client-ip")
            .or_else(|| headers.get("x-forwarded-for"))
            .and_then(|v| v.to_str().ok())
        {
            if let Some(first_hop) = val.split(',').next() {
                let trimmed = first_hop.trim();
                if !trimmed.is_empty() && trimmed.len() <= 64 {
                    return trimmed.to_ascii_lowercase();
                }
            }
        }
    }
    "direct_peer_socket".to_string()
}
