use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde_json::Value;

use crate::{
    config::AppConfig,
    flutterwave::PaymentConfig,
    lifecycle::{
        EscrowOperationRecord, GuarantorCommitmentRecord, OutboxJob, PaymentAttemptRecord,
        PaymentState, QueueEntryRecord, QueueEntryStatus, RefundRecord, RiskPolicyConfig,
        SellerListingRecord, SellerListingStatus, SellerPayoutRecord, TradeAuditEvent,
        TradeLifecycleState, TradeRecord, UserRiskEvent, UserTrustProfile, WebhookInboxEvent,
    },
    models::{ProofRecord, SessionRecord},
    wallet_auth::{UserProfileRecord, WalletNonceRecord, WalletSessionRecord},
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub payment_config: Arc<PaymentConfig>,
    pub risk_policy: Arc<RiskPolicyConfig>,
    pub trust_proxy_headers: bool,
    pub sessions: Arc<DashMap<String, SessionRecord>>,
    pub proofs: Arc<DashMap<String, ProofRecord>>,
    pub idempotency_sessions: Arc<DashMap<String, String>>,
    pub consumed_transcript_digests: Arc<DashMap<String, String>>,
    pub consumed_payment_references: Arc<DashMap<String, String>>,
    pub rate_limits: Arc<DashMap<String, (u32, Instant)>>,
    pub trades: Arc<DashMap<String, TradeRecord>>,
    pub seller_listings: Arc<DashMap<String, SellerListingRecord>>,
    pub queue_entries: Arc<DashMap<String, QueueEntryRecord>>,
    pub trust_profiles: Arc<DashMap<String, UserTrustProfile>>,
    pub risk_events: Arc<DashMap<String, Vec<UserRiskEvent>>>,
    pub guarantor_commitments: Arc<DashMap<String, GuarantorCommitmentRecord>>,
    pub payment_attempts: Arc<DashMap<String, PaymentAttemptRecord>>,
    pub active_trade_checkout: Arc<DashMap<String, String>>,
    pub consumed_flw_tx_ids: Arc<DashMap<u64, String>>,
    pub webhook_inbox: Arc<DashMap<String, WebhookInboxEvent>>,
    pub seller_payouts: Arc<DashMap<String, SellerPayoutRecord>>,
    pub refunds: Arc<DashMap<String, RefundRecord>>,
    pub escrow_operations: Arc<DashMap<String, EscrowOperationRecord>>,
    pub audit_events: Arc<DashMap<String, Vec<TradeAuditEvent>>>,
    pub outbox_jobs: Arc<DashMap<String, OutboxJob>>,
    pub profiles: Arc<DashMap<String, UserProfileRecord>>,
    pub usernames: Arc<DashMap<String, String>>,
    pub wallet_nonces: Arc<DashMap<String, WalletNonceRecord>>,
    pub wallet_sessions: Arc<DashMap<String, WalletSessionRecord>>,
    pub http_client: reqwest::Client,
    pub started_at: DateTime<Utc>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        Self::with_payment_config(config, PaymentConfig::from_env_or_defaults())
    }

    pub fn with_payment_config(config: AppConfig, payment_config: PaymentConfig) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("failed to build reqwest client");

        let trust_proxy_headers = std::env::var("TRUST_PROXY_HEADERS")
            .ok()
            .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
            .unwrap_or(false);

        Self {
            config: Arc::new(config),
            payment_config: Arc::new(payment_config),
            risk_policy: Arc::new(RiskPolicyConfig::default()),
            trust_proxy_headers,
            sessions: Arc::new(DashMap::new()),
            proofs: Arc::new(DashMap::new()),
            idempotency_sessions: Arc::new(DashMap::new()),
            consumed_transcript_digests: Arc::new(DashMap::new()),
            consumed_payment_references: Arc::new(DashMap::new()),
            rate_limits: Arc::new(DashMap::new()),
            trades: Arc::new(DashMap::new()),
            seller_listings: Arc::new(DashMap::new()),
            queue_entries: Arc::new(DashMap::new()),
            trust_profiles: Arc::new(DashMap::new()),
            risk_events: Arc::new(DashMap::new()),
            guarantor_commitments: Arc::new(DashMap::new()),
            payment_attempts: Arc::new(DashMap::new()),
            active_trade_checkout: Arc::new(DashMap::new()),
            consumed_flw_tx_ids: Arc::new(DashMap::new()),
            webhook_inbox: Arc::new(DashMap::new()),
            seller_payouts: Arc::new(DashMap::new()),
            refunds: Arc::new(DashMap::new()),
            escrow_operations: Arc::new(DashMap::new()),
            audit_events: Arc::new(DashMap::new()),
            outbox_jobs: Arc::new(DashMap::new()),
            profiles: Arc::new(DashMap::new()),
            usernames: Arc::new(DashMap::new()),
            wallet_nonces: Arc::new(DashMap::new()),
            wallet_sessions: Arc::new(DashMap::new()),
            http_client,
            started_at: Utc::now(),
        }
    }

    pub fn get_or_init_trust_profile(&self, wallet_address: &str) -> UserTrustProfile {
        let key = wallet_address.trim().to_ascii_lowercase();
        self.trust_profiles
            .entry(key.clone())
            .or_insert_with(|| UserTrustProfile::new_for_wallet(&key))
            .clone()
    }

    pub fn append_risk_event(&self, event: UserRiskEvent) {
        let addr = event.wallet_address.clone();
        self.risk_events.entry(addr).or_default().push(event);
    }

    /// Counts how many active unpaid trades or active/queued queue reservations this buyer holds.
    pub fn count_buyer_active_unpaid_obligations(&self, buyer_address: &str) -> u32 {
        let buyer = buyer_address.trim().to_ascii_lowercase();
        let active_unpaid_trades = self
            .trades
            .iter()
            .filter(|e| {
                let t = e.value();
                t.buyer_address.as_deref() == Some(buyer.as_str())
                    && t.lifecycle_state == TradeLifecycleState::AwaitingPayment
                    && matches!(
                        t.payment_state,
                        PaymentState::Unpaid
                            | PaymentState::CheckoutCreated
                            | PaymentState::PendingVerification
                    )
            })
            .count() as u32;

        let active_queue_only = self
            .queue_entries
            .iter()
            .filter(|e| {
                let q = e.value();
                q.buyer_address == buyer
                    && matches!(
                        q.status,
                        QueueEntryStatus::Queued | QueueEntryStatus::EligibleAwaitingConsent
                    )
            })
            .count() as u32;

        active_unpaid_trades + active_queue_only
    }

    /// Releases a seller's active slot when an active child trade conclusively settles or cancels,
    /// updates the seller's inventory buckets, and marks the next FIFO queued entry as `EligibleAwaitingConsent`.
    pub fn reconcile_seller_listing_on_trade_resolution(
        &self,
        trade_id: &str,
        completed: bool,
    ) -> Option<String> {
        let now = Utc::now();
        let listing_ref = self.seller_listings.iter().find_map(|entry| {
            if entry.value().active_trade_id.as_deref() == Some(trade_id) {
                Some(entry.key().clone())
            } else {
                None
            }
        })?;

        let trade_amount = self
            .trades
            .get(trade_id)
            .map(|t| t.usdc_amount_units)
            .unwrap_or(0);

        if let Some(mut listing) = self.seller_listings.get_mut(&listing_ref) {
            if listing.allocated_usdc_units >= trade_amount {
                listing.allocated_usdc_units -= trade_amount;
                if completed {
                    listing.filled_usdc_units =
                        listing.filled_usdc_units.saturating_add(trade_amount);
                } else {
                    listing.available_usdc_units =
                        listing.available_usdc_units.saturating_add(trade_amount);
                }
            }
            listing.active_trade_id = None;
            listing.active_slot_lease_owner = None;
            listing.active_slot_lease_expires_at = None;
            if listing.available_usdc_units == 0
                && listing.allocated_usdc_units == 0
                && listing.reserved_queued_usdc_units == 0
            {
                listing.status = SellerListingStatus::Depleted;
            }
            listing.version += 1;
            listing.updated_at = now;
        }

        // Mark any ACTIVE_SLOT queue entry for this trade as COMPLETED or EXPIRED
        for mut q in self.queue_entries.iter_mut() {
            if q.allocated_trade_id.as_deref() == Some(trade_id)
                && q.status == QueueEntryStatus::ActiveSlot
            {
                q.status = if completed {
                    QueueEntryStatus::Completed
                } else {
                    QueueEntryStatus::Expired
                };
                q.updated_at = now;
            }
        }

        // Advance next FIFO queued entry for this listing to EligibleAwaitingConsent
        let mut queued: Vec<(u32, DateTime<Utc>, String)> = self
            .queue_entries
            .iter()
            .filter(|e| {
                let q = e.value();
                q.listing_ref == listing_ref && q.status == QueueEntryStatus::Queued
            })
            .map(|e| (e.value().queue_position, e.value().created_at, e.key().clone()))
            .collect();
        queued.sort_by_key(|(pos, created, _)| (*pos, *created));

        if let Some((_, _, next_qref)) = queued.first() {
            if let Some(mut next_q) = self.queue_entries.get_mut(next_qref) {
                next_q.status = QueueEntryStatus::EligibleAwaitingConsent;
                next_q.consent_deadline_at = Some(
                    now + chrono::Duration::seconds(self.risk_policy.queue_consent_window_seconds),
                );
                next_q.queue_position = 1;
                next_q.updated_at = now;
                return Some(next_qref.clone());
            }
        }

        None
    }

    pub fn check_rate_limit(&self, key: &str, max_per_minute: u32) -> bool {
        let now = Instant::now();
        let mut entry = self
            .rate_limits
            .entry(key.to_string())
            .or_insert((0, now + Duration::from_secs(60)));

        if now >= entry.1 {
            *entry = (1, now + Duration::from_secs(60));
            return true;
        }

        if entry.0 >= max_per_minute {
            return false;
        }

        entry.0 += 1;
        true
    }

    pub fn append_audit_event(&self, event: TradeAuditEvent) {
        let trade_id = event.trade_id.clone();
        self.audit_events
            .entry(trade_id)
            .or_default()
            .push(event);
    }

    pub fn enqueue_outbox_job(&self, job: OutboxJob) {
        self.outbox_jobs
            .entry(job.dedup_key.clone())
            .or_insert(job);
    }

    /// Best-effort async synchronization to Supabase PostgREST when SUPABASE_URL
    /// and SUPABASE_SERVICE_ROLE_KEY are configured in the environment.
    pub async fn sync_to_supabase_table(&self, table: &str, record: &Value) {
        let (Some(ref sb_url), Some(ref sb_key)) = (
            &self.payment_config.supabase_url,
            &self.payment_config.supabase_service_role_key,
        ) else {
            return;
        };

        let endpoint = format!("{}/rest/v1/{}", sb_url.trim_end_matches('/'), table);
        let _ = self
            .http_client
            .post(&endpoint)
            .header("apikey", sb_key)
            .header("Authorization", format!("Bearer {sb_key}"))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .json(record)
            .send()
            .await;
    }
}
