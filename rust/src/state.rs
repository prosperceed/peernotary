use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde_json::Value;

use crate::{
    config::AppConfig,
    flutterwave::PaymentConfig,
    lifecycle::{
        EscrowOperationRecord, OutboxJob, PaymentAttemptRecord, RefundRecord, SellerPayoutRecord,
        TradeAuditEvent, TradeRecord, WebhookInboxEvent,
    },
    models::{ProofRecord, SessionRecord},
    wallet_auth::{UserProfileRecord, WalletNonceRecord, WalletSessionRecord},
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub payment_config: Arc<PaymentConfig>,
    pub sessions: Arc<DashMap<String, SessionRecord>>,
    pub proofs: Arc<DashMap<String, ProofRecord>>,
    pub idempotency_sessions: Arc<DashMap<String, String>>,
    pub consumed_transcript_digests: Arc<DashMap<String, String>>,
    pub consumed_payment_references: Arc<DashMap<String, String>>,
    pub rate_limits: Arc<DashMap<String, (u32, Instant)>>,
    pub trades: Arc<DashMap<String, TradeRecord>>,
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

        Self {
            config: Arc::new(config),
            payment_config: Arc::new(payment_config),
            sessions: Arc::new(DashMap::new()),
            proofs: Arc::new(DashMap::new()),
            idempotency_sessions: Arc::new(DashMap::new()),
            consumed_transcript_digests: Arc::new(DashMap::new()),
            consumed_payment_references: Arc::new(DashMap::new()),
            rate_limits: Arc::new(DashMap::new()),
            trades: Arc::new(DashMap::new()),
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
