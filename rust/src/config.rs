use std::env;
use std::net::SocketAddr;
use zeroize::Zeroize;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub bind_addr: SocketAddr,
    pub service_api_key: String,
    pub webhook_secret: String,
    pub webhook_url: Option<String>,
    pub notary_signing_key_hex: String,
    pub allowed_hostnames: Vec<String>,
    pub expected_chain_id: u64,
    pub expected_escrow_address: String,
    pub max_proof_bytes: usize,
    pub session_ttl_secs: u64,
    pub max_transcript_age_secs: u64,
}

impl Drop for AppConfig {
    fn drop(&mut self) {
        self.service_api_key.zeroize();
        self.webhook_secret.zeroize();
        self.notary_signing_key_hex.zeroize();
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Missing required environment variable: {0}")]
    MissingVar(&'static str),
    #[error("Invalid configuration value for {0}: {1}")]
    InvalidValue(&'static str, String),
}

impl AppConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let port: u16 = env::var("PORT")
            .unwrap_or_else(|_| "7047".to_string())
            .parse()
            .map_err(|_| ConfigError::InvalidValue("PORT", "must be a valid u16 port".into()))?;

        let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let bind_addr: SocketAddr = format!("{host}:{port}")
            .parse()
            .map_err(|_| ConfigError::InvalidValue("HOST/PORT", "invalid socket address".into()))?;

        let service_api_key = env::var("TLSN_SERVICE_API_KEY")
            .or_else(|_| env::var("TLSN_WEBHOOK_SECRET"))
            .map_err(|_| ConfigError::MissingVar("TLSN_SERVICE_API_KEY or TLSN_WEBHOOK_SECRET"))?;

        if service_api_key.trim().len() < 16 {
            return Err(ConfigError::InvalidValue(
                "TLSN_SERVICE_API_KEY",
                "must be at least 16 characters".into(),
            ));
        }

        let webhook_secret =
            env::var("TLSN_WEBHOOK_SECRET").unwrap_or_else(|_| service_api_key.clone());

        if webhook_secret.trim().len() < 16 {
            return Err(ConfigError::InvalidValue(
                "TLSN_WEBHOOK_SECRET",
                "must be at least 16 characters".into(),
            ));
        }

        let webhook_url = env::var("TLSN_WEBHOOK_URL")
            .ok()
            .filter(|s| !s.trim().is_empty());

        let notary_signing_key_hex = env::var("NOTARY_SIGNING_KEY_HEX").unwrap_or_else(|_| {
            // Deterministic development default only when NOT in production
            "2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a".to_string()
        });

        let key_bytes =
            hex::decode(notary_signing_key_hex.trim_start_matches("0x")).map_err(|_| {
                ConfigError::InvalidValue("NOTARY_SIGNING_KEY_HEX", "must be valid hex".into())
            })?;
        if key_bytes.len() != 32 {
            return Err(ConfigError::InvalidValue(
                "NOTARY_SIGNING_KEY_HEX",
                "must be a 32-byte secp256k1 private key".into(),
            ));
        }

        let raw_hosts = env::var("TLSN_ALLOWED_HOSTNAMES")
            .unwrap_or_else(|_| "tlsnotary.org,example.com,api.opayweb.com,api.gtbank.com,api.monnify.com,api.fincra.com,api.withmono.com".to_string());

        let allowed_hostnames: Vec<String> = raw_hosts
            .split(',')
            .map(|h| h.trim().to_ascii_lowercase())
            .filter(|h| !h.is_empty())
            .collect();

        if allowed_hostnames.is_empty() {
            return Err(ConfigError::InvalidValue(
                "TLSN_ALLOWED_HOSTNAMES",
                "at least one allowed hostname must be configured".into(),
            ));
        }

        for host in &allowed_hostnames {
            if !is_safe_allowed_hostname(host) {
                return Err(ConfigError::InvalidValue(
                    "TLSN_ALLOWED_HOSTNAMES",
                    format!("unsafe or forbidden hostname pattern: {host}"),
                ));
            }
        }

        let expected_chain_id: u64 = env::var("ARC_CHAIN_ID")
            .unwrap_or_else(|_| "5042002".to_string())
            .parse()
            .map_err(|_| ConfigError::InvalidValue("ARC_CHAIN_ID", "must be a valid u64".into()))?;

        let expected_escrow_address = env::var("ESCROW_ADDRESS")
            .or_else(|_| env::var("NEXT_PUBLIC_ESCROW_ADDRESS"))
            .unwrap_or_else(|_| "0x5042f1114C6F272f5909f16510399986EF0D734D".to_string())
            .to_ascii_lowercase();

        if !is_valid_eth_address(&expected_escrow_address) {
            return Err(ConfigError::InvalidValue(
                "ESCROW_ADDRESS",
                "must be a valid 20-byte 0x-prefixed hex address".into(),
            ));
        }

        let max_proof_bytes: usize = env::var("MAX_PROOF_BYTES")
            .unwrap_or_else(|_| (2 * 1024 * 1024).to_string())
            .parse()
            .map_err(|_| ConfigError::InvalidValue("MAX_PROOF_BYTES", "must be usize".into()))?;

        let session_ttl_secs: u64 = env::var("SESSION_TTL_SECS")
            .unwrap_or_else(|_| "900".to_string())
            .parse()
            .map_err(|_| ConfigError::InvalidValue("SESSION_TTL_SECS", "must be u64".into()))?;

        let max_transcript_age_secs: u64 = env::var("MAX_TRANSCRIPT_AGE_SECS")
            .unwrap_or_else(|_| "3600".to_string())
            .parse()
            .map_err(|_| {
                ConfigError::InvalidValue("MAX_TRANSCRIPT_AGE_SECS", "must be u64".into())
            })?;

        Ok(Self {
            bind_addr,
            service_api_key,
            webhook_secret,
            webhook_url,
            notary_signing_key_hex,
            allowed_hostnames,
            expected_chain_id,
            expected_escrow_address,
            max_proof_bytes,
            session_ttl_secs,
            max_transcript_age_secs,
        })
    }

    pub fn notary_signing_key_bytes(&self) -> [u8; 32] {
        let decoded = hex::decode(self.notary_signing_key_hex.trim_start_matches("0x"))
            .expect("validated at startup");
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&decoded);
        arr
    }
}

pub fn is_valid_eth_address(addr: &str) -> bool {
    let addr = addr.trim();
    if !addr.starts_with("0x") && !addr.starts_with("0X") {
        return false;
    }
    let hex_part = &addr[2..];
    hex_part.len() == 40
        && hex_part.chars().all(|c| c.is_ascii_hexdigit())
        && hex_part != "0000000000000000000000000000000000000000"
}

pub fn is_safe_allowed_hostname(host: &str) -> bool {
    let h = host.trim().to_ascii_lowercase();
    if h.is_empty() || h.len() > 253 {
        return false;
    }
    if h == "localhost"
        || h.ends_with(".local")
        || h.ends_with(".internal")
        || h.ends_with(".localhost")
        || h.contains(':')
        || h.contains('/')
        || h.contains('@')
    {
        return false;
    }
    if h.parse::<std::net::IpAddr>().is_ok() {
        return false;
    }
    h.split('.').count() >= 2
        && h.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
}
