use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use dashmap::DashMap;

use crate::{
    config::AppConfig,
    models::{ProofRecord, SessionRecord},
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub sessions: Arc<DashMap<String, SessionRecord>>,
    pub proofs: Arc<DashMap<String, ProofRecord>>,
    pub idempotency_sessions: Arc<DashMap<String, String>>,
    pub consumed_transcript_digests: Arc<DashMap<String, String>>,
    pub consumed_payment_references: Arc<DashMap<String, String>>,
    pub rate_limits: Arc<DashMap<String, (u32, Instant)>>,
    pub http_client: reqwest::Client,
    pub started_at: DateTime<Utc>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("failed to build reqwest client");

        Self {
            config: Arc::new(config),
            sessions: Arc::new(DashMap::new()),
            proofs: Arc::new(DashMap::new()),
            idempotency_sessions: Arc::new(DashMap::new()),
            consumed_transcript_digests: Arc::new(DashMap::new()),
            consumed_payment_references: Arc::new(DashMap::new()),
            rate_limits: Arc::new(DashMap::new()),
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
}
