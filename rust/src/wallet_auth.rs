use chrono::{DateTime, Duration as ChronoDuration, Utc};
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tiny_keccak::{Hasher, Keccak};
use uuid::Uuid;

use crate::{config::is_valid_eth_address, error::ApiError};

const RESERVED_USERNAMES: &[&str] = &[
    "admin",
    "system",
    "support",
    "peernotary",
    "flutterwave",
    "arc",
    "escrow",
    "oracle",
    "moderator",
    "root",
    "api",
    "help",
    "security",
    "official",
    "treasury",
    "null",
    "undefined",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfileRecord {
    pub id: String,
    pub wallet_address: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub role: String,
    pub onboarding_completed: bool,
    pub chain_id: u64,
    pub last_authenticated_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletNonceRecord {
    pub id: String,
    pub wallet_address: String,
    pub nonce: String,
    pub domain: String,
    pub uri: String,
    pub chain_id: u64,
    pub statement: String,
    pub message: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub consumed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletSessionRecord {
    pub id: String,
    pub profile_id: String,
    pub wallet_address: String,
    pub token_hash: String,
    pub chain_id: u64,
    pub expires_at: DateTime<Utc>,
    pub last_active_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

pub fn normalize_wallet_address(address: &str) -> Result<String, ApiError> {
    let trimmed = address.trim().to_ascii_lowercase();
    if !is_valid_eth_address(&trimmed) {
        return Err(ApiError::BadRequest(
            "Invalid Ethereum wallet address".into(),
        ));
    }
    Ok(trimmed)
}

pub fn validate_and_normalize_username(raw: &str) -> Result<String, ApiError> {
    let normalized = raw.trim().trim_start_matches('@').to_ascii_lowercase();
    if normalized.len() < 3 || normalized.len() > 24 {
        return Err(ApiError::BadRequest(
            "Username must be between 3 and 24 characters".into(),
        ));
    }
    if !normalized
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err(ApiError::BadRequest(
            "Username may only contain lowercase letters, digits, and underscores".into(),
        ));
    }
    if RESERVED_USERNAMES.contains(&normalized.as_str())
        || normalized.starts_with("admin_")
        || normalized.starts_with("peernotary_")
        || normalized.starts_with("system_")
    {
        return Err(ApiError::Forbidden("USERNAME_RESERVED_OR_PROTECTED"));
    }
    Ok(normalized)
}

pub fn build_wallet_challenge(
    wallet_address: &str,
    domain: &str,
    uri: &str,
    chain_id: u64,
    ttl_seconds: i64,
) -> Result<WalletNonceRecord, ApiError> {
    let normalized_addr = normalize_wallet_address(wallet_address)?;
    let now = Utc::now();
    let expires_at = now + ChronoDuration::seconds(ttl_seconds);
    let nonce = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let statement = "Authenticate this wallet for PeerNotary.".to_string();
    let issued_str = now.to_rfc3339();
    let expires_str = expires_at.to_rfc3339();

    let message = format!(
        "{domain} wants you to sign in with your Ethereum account:\n{normalized_addr}\n\nPeerNotary wallet authentication\n\nURI: {uri}\nChain ID: {chain_id}\nNonce: {nonce}\nIssued At: {issued_str}\nExpiration Time: {expires_str}\nStatement: {statement}"
    );

    Ok(WalletNonceRecord {
        id: Uuid::new_v4().to_string(),
        wallet_address: normalized_addr,
        nonce,
        domain: domain.to_string(),
        uri: uri.to_string(),
        chain_id,
        statement,
        message,
        issued_at: now,
        expires_at,
        consumed_at: None,
    })
}

/// Computes the EIP-191 personal_sign digest:
/// keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)
pub fn compute_eip191_digest(message: &str) -> [u8; 32] {
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut keccak = Keccak::v256();
    keccak.update(prefix.as_bytes());
    keccak.update(message.as_bytes());
    let mut out = [0u8; 32];
    keccak.finalize(&mut out);
    out
}

/// Recovers the 20-byte lowercase `0x...` Ethereum address from a 65-byte EIP-191 signature.
pub fn recover_eip191_signer_address(message: &str, signature_hex: &str) -> Result<String, ApiError> {
    let clean_hex = signature_hex.trim().trim_start_matches("0x");
    let sig_bytes = hex::decode(clean_hex)
        .map_err(|_| ApiError::Unauthorized("MALFORMED_WALLET_SIGNATURE"))?;
    if sig_bytes.len() != 65 {
        return Err(ApiError::Unauthorized("INVALID_SIGNATURE_LENGTH"));
    }

    let r_s = &sig_bytes[..64];
    let v_raw = sig_bytes[64];
    let rec_byte = match v_raw {
        27 | 28 => v_raw - 27,
        0 | 1 => v_raw,
        _ => return Err(ApiError::Unauthorized("INVALID_RECOVERY_ID")),
    };

    let signature = Signature::from_slice(r_s)
        .map_err(|_| ApiError::Unauthorized("INVALID_ECDSA_SIGNATURE"))?;
    let recovery_id = RecoveryId::from_byte(rec_byte)
        .ok_or(ApiError::Unauthorized("INVALID_RECOVERY_ID"))?;

    let digest = compute_eip191_digest(message);
    let verifying_key = VerifyingKey::recover_from_prehash(&digest, &signature, recovery_id)
        .map_err(|_| ApiError::Unauthorized("SIGNATURE_RECOVERY_FAILED"))?;

    let uncompressed = verifying_key.to_encoded_point(false);
    let pubkey_bytes = uncompressed.as_bytes();
    if pubkey_bytes.len() != 65 {
        return Err(ApiError::Unauthorized("INVALID_RECOVERED_PUBLIC_KEY"));
    }

    let mut keccak = Keccak::v256();
    keccak.update(&pubkey_bytes[1..]);
    let mut hash = [0u8; 32];
    keccak.finalize(&mut hash);

    Ok(format!("0x{}", hex::encode(&hash[12..])))
}

pub fn hash_session_token(raw_token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw_token.as_bytes());
    hex::encode(hasher.finalize())
}
