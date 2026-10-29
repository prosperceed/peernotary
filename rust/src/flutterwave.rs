use std::env;

use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use subtle::ConstantTimeEq;
use uuid::Uuid;
use zeroize::Zeroize;

use crate::{
    config::ConfigError,
    error::ApiError,
    lifecycle::{AttemptStatus, PaymentAttemptRecord, PaymentState, PayoutState, RefundState},
};

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug)]
pub struct PaymentConfig {
    pub app_env: String,
    pub app_base_url: String,
    pub database_url: Option<String>,
    pub supabase_url: Option<String>,
    pub supabase_publishable_key: Option<String>,
    pub supabase_service_role_key: Option<String>,
    pub flw_secret_key: Option<String>,
    pub flw_secret_hash: Option<String>,
    pub flw_base_url: String,
    pub flw_redirect_url: String,
    pub flw_currency: String,
    pub flw_webhook_url: Option<String>,
    pub rust_api_auth_secret: Option<String>,
    pub arc_rpc_url: String,
    pub arc_usdc_contract_address: String,
    pub trade_payment_timeout_minutes: u64,
    pub reconciliation_interval_seconds: u64,
    pub max_provider_retries: u32,
}

impl Drop for PaymentConfig {
    fn drop(&mut self) {
        if let Some(ref mut s) = self.flw_secret_key {
            s.zeroize();
        }
        if let Some(ref mut s) = self.flw_secret_hash {
            s.zeroize();
        }
        if let Some(ref mut s) = self.supabase_service_role_key {
            s.zeroize();
        }
        if let Some(ref mut s) = self.rust_api_auth_secret {
            s.zeroize();
        }
        if let Some(ref mut s) = self.database_url {
            s.zeroize();
        }
    }
}

impl Default for PaymentConfig {
    fn default() -> Self {
        Self::from_env_or_defaults()
    }
}

impl PaymentConfig {
    pub fn from_env_or_defaults() -> Self {
        let app_env = env::var("APP_ENV").unwrap_or_else(|_| "development".to_string());
        let app_base_url =
            env::var("APP_BASE_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
        let flw_base_url = env::var("FLW_BASE_URL")
            .unwrap_or_else(|_| "https://api.flutterwave.com/v3".to_string())
            .trim_end_matches('/')
            .to_string();
        let flw_redirect_url = env::var("FLW_REDIRECT_URL")
            .unwrap_or_else(|_| format!("{}/bank-checkout", app_base_url.trim_end_matches('/')));
        let flw_currency = env::var("FLW_CURRENCY")
            .unwrap_or_else(|_| "NGN".to_string())
            .to_ascii_uppercase();

        let trade_payment_timeout_minutes = env::var("TRADE_PAYMENT_TIMEOUT_MINUTES")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .filter(|&v| v > 0 && v <= 120)
            .unwrap_or(20);

        let reconciliation_interval_seconds = env::var("RECONCILIATION_INTERVAL_SECONDS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .filter(|&v| v >= 5)
            .unwrap_or(30);

        let max_provider_retries = env::var("MAX_PROVIDER_Retries")
            .or_else(|_| env::var("MAX_PROVIDER_RETRIES"))
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .filter(|&v| v >= 1 && v <= 20)
            .unwrap_or(5);

        Self {
            app_env,
            app_base_url,
            database_url: env::var("DATABASE_URL").ok().filter(|s| !s.is_empty()),
            supabase_url: env::var("SUPABASE_URL").ok().filter(|s| !s.is_empty()),
            supabase_publishable_key: env::var("SUPABASE_PUBLISHABLE_KEY")
                .ok()
                .filter(|s| !s.is_empty()),
            supabase_service_role_key: env::var("SUPABASE_SERVICE_ROLE_KEY")
                .ok()
                .filter(|s| !s.is_empty()),
            flw_secret_key: env::var("FLW_SECRET_KEY").ok().filter(|s| !s.is_empty()),
            flw_secret_hash: env::var("FLW_SECRET_HASH").ok().filter(|s| !s.is_empty()),
            flw_base_url,
            flw_redirect_url,
            flw_currency,
            flw_webhook_url: env::var("FLW_WEBHOOK_URL").ok().filter(|s| !s.is_empty()),
            rust_api_auth_secret: env::var("RUST_API_AUTH_SECRET")
                .ok()
                .filter(|s| !s.is_empty()),
            arc_rpc_url: env::var("ARC_RPC_URL")
                .unwrap_or_else(|_| "https://rpc.testnet.arc.io".to_string()),
            arc_usdc_contract_address: env::var("ARC_USDC_CONTRACT_ADDRESS")
                .or_else(|_| env::var("USDC_ADDRESS"))
                .unwrap_or_else(|_| "0x3600000000000000000000000000000000000000".to_string()),
            trade_payment_timeout_minutes,
            reconciliation_interval_seconds,
            max_provider_retries,
        }
    }

    pub fn validate_production_readiness(&self) -> Result<(), ConfigError> {
        if self.app_env.eq_ignore_ascii_case("production") {
            let flw_key = self
                .flw_secret_key
                .as_deref()
                .ok_or(ConfigError::MissingVar("FLW_SECRET_KEY"))?;
            if flw_key.contains("TEST") || flw_key.contains("sandbox") || flw_key.len() < 16 {
                return Err(ConfigError::InvalidValue(
                    "FLW_SECRET_KEY",
                    "production environment must not use test/sandbox Flutterwave credentials"
                        .into(),
                ));
            }
            let flw_hash = self
                .flw_secret_hash
                .as_deref()
                .ok_or(ConfigError::MissingVar("FLW_SECRET_HASH"))?;
            if flw_hash.len() < 16 {
                return Err(ConfigError::InvalidValue(
                    "FLW_SECRET_HASH",
                    "must be at least 16 characters in production".into(),
                ));
            }
            if self.supabase_url.is_none() && self.database_url.is_none() {
                return Err(ConfigError::MissingVar("DATABASE_URL or SUPABASE_URL"));
            }
        }
        Ok(())
    }
}

/// Converts minor units (e.g. kobo, 2 decimal places) to an exact decimal string ("500000.00")
/// without floating-point representation.
pub fn minor_units_to_decimal_string(minor_units: u128) -> String {
    let major = minor_units / 100;
    let minor = minor_units % 100;
    format!("{major}.{minor:02}")
}

/// Parses a monetary value (string or JSON number representation) into exact minor units (2 decimals)
/// using integer string arithmetic rather than IEEE-754 floating-point math.
pub fn parse_decimal_to_minor_units(raw: &str) -> Result<u128, ApiError> {
    let cleaned = raw.trim().replace(',', "");
    if cleaned.is_empty() || cleaned.starts_with('-') {
        return Err(ApiError::BadRequest(
            "Invalid negative or empty monetary amount".into(),
        ));
    }

    let mut parts = cleaned.split('.');
    let major_str = parts.next().unwrap_or("0");
    let frac_str = parts.next();
    if parts.next().is_some() {
        return Err(ApiError::BadRequest(
            "Malformed decimal monetary string".into(),
        ));
    }

    if !major_str.chars().all(|c| c.is_ascii_digit()) {
        return Err(ApiError::BadRequest(
            "Non-digit characters in major monetary amount".into(),
        ));
    }

    let major: u128 = major_str
        .parse()
        .map_err(|_| ApiError::BadRequest("Monetary major amount overflow".into()))?;

    let minor: u128 = match frac_str {
        None | Some("") => 0,
        Some(f) => {
            if !f.chars().all(|c| c.is_ascii_digit()) {
                return Err(ApiError::BadRequest(
                    "Non-digit characters in fractional monetary amount".into(),
                ));
            }
            if f.len() == 1 {
                f.parse::<u128>().unwrap_or(0) * 10
            } else if f.len() == 2 {
                f.parse::<u128>().unwrap_or(0)
            } else {
                // Reject sub-minor precision unless trailing zeros
                let head = &f[..2];
                let tail = &f[2..];
                if !tail.chars().all(|c| c == '0') {
                    return Err(ApiError::BadRequest(
                        "Monetary amount exceeds 2 decimal places precision".into(),
                    ));
                }
                head.parse::<u128>().unwrap_or(0)
            }
        }
    };

    major
        .checked_mul(100)
        .and_then(|v| v.checked_add(minor))
        .ok_or_else(|| ApiError::BadRequest("Monetary minor unit overflow".into()))
}

pub fn generate_secure_tx_ref(trade_id: &str) -> String {
    format!("PN-FLW-{}-{}", trade_id, Uuid::new_v4().simple())
}

pub fn generate_payout_reference(trade_id: &str, attempt: u32) -> String {
    format!(
        "PN-PAYOUT-{}-A{}-{}",
        trade_id,
        attempt,
        Uuid::new_v4().simple()
    )
}

pub fn generate_refund_reference(trade_id: &str) -> String {
    format!("PN-REFUND-{}-{}", trade_id, Uuid::new_v4().simple())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlwStandardCheckoutPayload {
    pub tx_ref: String,
    pub amount: String,
    pub currency: String,
    pub redirect_url: String,
    pub customer: FlwCustomerInfo,
    pub meta: FlwTransactionMeta,
    pub customizations: FlwCustomizations,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlwCustomerInfo {
    pub email: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlwTransactionMeta {
    pub trade_id: String,
    pub attempt_id: String,
    pub buyer_address: String,
    pub seller_address: String,
    pub expected_amount_minor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlwCustomizations {
    pub title: String,
    pub description: String,
}

pub fn build_flw_standard_checkout_request(
    attempt: &PaymentAttemptRecord,
    seller_address: &str,
    redirect_url_base: &str,
) -> FlwStandardCheckoutPayload {
    let sep = if redirect_url_base.contains('?') {
        "&"
    } else {
        "?"
    };
    let redirect_url = format!(
        "{}{}tradeId={}&tx_ref={}",
        redirect_url_base, sep, attempt.trade_id, attempt.tx_ref
    );

    let short_buyer = if attempt.buyer_address.len() >= 10 {
        format!(
            "{}...{}",
            &attempt.buyer_address[..6],
            &attempt.buyer_address[attempt.buyer_address.len() - 4..]
        )
    } else {
        attempt.buyer_address.clone()
    };

    FlwStandardCheckoutPayload {
        tx_ref: attempt.tx_ref.clone(),
        amount: minor_units_to_decimal_string(attempt.expected_amount_minor),
        currency: attempt.expected_currency.clone(),
        redirect_url,
        customer: FlwCustomerInfo {
            email: format!(
                "{}@wallet.peernotary.io",
                attempt.buyer_address.to_ascii_lowercase()
            ),
            name: format!("PeerNotary Buyer ({short_buyer})"),
        },
        meta: FlwTransactionMeta {
            trade_id: attempt.trade_id.clone(),
            attempt_id: attempt.id.clone(),
            buyer_address: attempt.buyer_address.to_ascii_lowercase(),
            seller_address: seller_address.to_ascii_lowercase(),
            expected_amount_minor: attempt.expected_amount_minor.to_string(),
        },
        customizations: FlwCustomizations {
            title: format!("PeerNotary Escrow Trade #{}", attempt.trade_id),
            description: format!(
                "Fiat settlement for Arc Escrow Trade #{} ({})",
                attempt.trade_id, attempt.tx_ref
            ),
        },
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlwVerifiedTransactionData {
    pub flw_tx_id: u64,
    pub tx_ref: String,
    pub flw_ref: Option<String>,
    pub status: String,
    pub currency: String,
    pub amount_minor: u128,
    pub amount_settled_minor: Option<u128>,
    pub app_fee_minor: Option<u128>,
    pub trade_id_meta: Option<String>,
    pub buyer_address_meta: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum VerificationOutcome {
    Confirmed {
        flw_tx_id: u64,
        settled_minor: u128,
        app_fee_minor: u128,
        is_late: bool,
    },
    Underpaid {
        flw_tx_id: u64,
        expected_minor: u128,
        received_minor: u128,
    },
    Overpaid {
        flw_tx_id: u64,
        expected_minor: u128,
        received_minor: u128,
    },
    Pending {
        flw_tx_id: Option<u64>,
    },
    Failed {
        reason: String,
    },
}

pub fn parse_flw_verify_response(raw_body: &Value) -> Result<FlwVerifiedTransactionData, ApiError> {
    let top_status = raw_body
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if top_status != "success" {
        return Err(ApiError::VerificationFailed {
            code: "FLW_PROVIDER_RESPONSE_NOT_SUCCESS",
            reason: "Flutterwave verification response top-level status was not 'success'".into(),
        });
    }

    let data = raw_body
        .get("data")
        .and_then(|v| v.as_object())
        .ok_or(ApiError::VerificationFailed {
            code: "FLW_MALFORMED_DATA_OBJECT",
            reason: "Missing 'data' object in Flutterwave verification response".into(),
        })?;

    let flw_tx_id = data
        .get("id")
        .and_then(|v| v.as_u64())
        .ok_or(ApiError::VerificationFailed {
            code: "FLW_MISSING_TX_ID",
            reason: "Missing numeric transaction ID in Flutterwave response".into(),
        })?;

    let tx_ref = data
        .get("tx_ref")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or(ApiError::VerificationFailed {
            code: "FLW_MISSING_TX_REF",
            reason: "Missing tx_ref in Flutterwave verification response".into(),
        })?;

    let flw_ref = data
        .get("flw_ref")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let status = data
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let currency = data
        .get("currency")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_uppercase();

    let amount_str = value_to_decimal_string(data.get("amount")).ok_or(
        ApiError::VerificationFailed {
            code: "FLW_MISSING_AMOUNT",
            reason: "Missing or non-numeric amount in Flutterwave response".into(),
        },
    )?;
    let amount_minor = parse_decimal_to_minor_units(&amount_str)?;

    let amount_settled_minor = match data.get("amount_settled") {
        Some(v) if !v.is_null() => {
            let s = value_to_decimal_string(Some(v)).unwrap_or_else(|| "0".to_string());
            parse_decimal_to_minor_units(&s).ok()
        }
        _ => None,
    };

    let app_fee_minor = match data.get("app_fee") {
        Some(v) if !v.is_null() => {
            let s = value_to_decimal_string(Some(v)).unwrap_or_else(|| "0".to_string());
            parse_decimal_to_minor_units(&s).ok()
        }
        _ => None,
    };

    let meta = data.get("meta").and_then(|m| m.as_object());
    let trade_id_meta = meta
        .and_then(|m| m.get("trade_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let buyer_address_meta = meta
        .and_then(|m| m.get("buyer_address"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_ascii_lowercase());

    Ok(FlwVerifiedTransactionData {
        flw_tx_id,
        tx_ref,
        flw_ref,
        status,
        currency,
        amount_minor,
        amount_settled_minor,
        app_fee_minor,
        trade_id_meta,
        buyer_address_meta,
    })
}

fn value_to_decimal_string(val: Option<&Value>) -> Option<String> {
    match val? {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Validates a parsed Flutterwave transaction against the authoritative `PaymentAttemptRecord`
/// and trade deadline.
pub fn evaluate_verified_transaction(
    attempt: &PaymentAttemptRecord,
    verified: &FlwVerifiedTransactionData,
    trade_deadline: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Result<(VerificationOutcome, AttemptStatus, PaymentState), ApiError> {
    // 1. Validate tx_ref exact match
    if verified.tx_ref != attempt.tx_ref {
        return Err(ApiError::VerificationFailed {
            code: "FLW_TX_REF_MISMATCH",
            reason: format!(
                "Provider tx_ref '{}' does not match attempt tx_ref '{}'",
                verified.tx_ref, attempt.tx_ref
            ),
        });
    }

    // 2. Validate trade ownership metadata if present
    if let Some(ref meta_trade_id) = verified.trade_id_meta {
        if meta_trade_id != &attempt.trade_id {
            return Err(ApiError::VerificationFailed {
                code: "FLW_META_TRADE_ID_MISMATCH",
                reason: format!(
                    "Provider metadata trade_id '{}' does not match trade '{}'",
                    meta_trade_id, attempt.trade_id
                ),
            });
        }
    }

    if let Some(ref meta_buyer) = verified.buyer_address_meta {
        if meta_buyer.to_ascii_lowercase() != attempt.buyer_address.to_ascii_lowercase() {
            return Err(ApiError::VerificationFailed {
                code: "FLW_META_BUYER_MISMATCH",
                reason: "Provider metadata buyer_address does not match trade buyer".into(),
            });
        }
    }

    // 3. Validate currency
    if verified.currency.to_ascii_uppercase() != attempt.expected_currency.to_ascii_uppercase() {
        return Err(ApiError::VerificationFailed {
            code: "FLW_CURRENCY_MISMATCH",
            reason: format!(
                "Provider currency '{}' does not match expected currency '{}'",
                verified.currency, attempt.expected_currency
            ),
        });
    }

    // 4. Evaluate status
    match verified.status.as_str() {
        "successful" => {
            if verified.amount_minor < attempt.expected_amount_minor {
                return Ok((
                    VerificationOutcome::Underpaid {
                        flw_tx_id: verified.flw_tx_id,
                        expected_minor: attempt.expected_amount_minor,
                        received_minor: verified.amount_minor,
                    },
                    AttemptStatus::MismatchHold,
                    PaymentState::Underpaid,
                ));
            }

            if verified.amount_minor > attempt.expected_amount_minor {
                return Ok((
                    VerificationOutcome::Overpaid {
                        flw_tx_id: verified.flw_tx_id,
                        expected_minor: attempt.expected_amount_minor,
                        received_minor: verified.amount_minor,
                    },
                    AttemptStatus::MismatchHold,
                    PaymentState::Overpaid,
                ));
            }

            let is_late = trade_deadline.map(|dl| now > dl).unwrap_or(false)
                || now > attempt.expires_at;

            let settled = verified
                .amount_settled_minor
                .unwrap_or(verified.amount_minor);
            let fee = verified.app_fee_minor.unwrap_or(0);

            if is_late {
                Ok((
                    VerificationOutcome::Confirmed {
                        flw_tx_id: verified.flw_tx_id,
                        settled_minor: settled,
                        app_fee_minor: fee,
                        is_late: true,
                    },
                    AttemptStatus::LateVerified,
                    PaymentState::LateConfirmed,
                ))
            } else {
                Ok((
                    VerificationOutcome::Confirmed {
                        flw_tx_id: verified.flw_tx_id,
                        settled_minor: settled,
                        app_fee_minor: fee,
                        is_late: false,
                    },
                    AttemptStatus::Verified,
                    PaymentState::Confirmed,
                ))
            }
        }
        "pending" | "processing" | "queued" => Ok((
            VerificationOutcome::Pending {
                flw_tx_id: Some(verified.flw_tx_id),
            },
            AttemptStatus::PendingVerification,
            PaymentState::PendingVerification,
        )),
        other => Ok((
            VerificationOutcome::Failed {
                reason: format!("Provider reported non-successful status '{other}'"),
            },
            AttemptStatus::Failed,
            PaymentState::Failed,
        )),
    }
}

/// Authenticates a Flutterwave webhook notification.
/// Supports:
/// 1. Flutterwave v3 `verif-hash` header compared in constant time against `FLW_SECRET_HASH`.
/// 2. HMAC-SHA256 signature (`flutterwave-signature` / `x-flutterwave-signature`) computed over raw body.
pub fn verify_flutterwave_webhook_signature(
    verif_hash_header: Option<&str>,
    hmac_signature_header: Option<&str>,
    raw_body: &[u8],
    expected_secret_hash: &str,
) -> bool {
    let secret = expected_secret_hash.trim();
    if secret.is_empty() {
        return false;
    }

    if let Some(provided_hash) = verif_hash_header {
        let provided = provided_hash.trim().as_bytes();
        let expected = secret.as_bytes();
        if provided.len() == expected.len() && bool::from(provided.ct_eq(expected)) {
            return true;
        }
    }

    if let Some(sig_header) = hmac_signature_header {
        if let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) {
            mac.update(raw_body);
            let computed = mac.finalize().into_bytes();
            let computed_hex = hex::encode(computed);
            let computed_b64 =
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, computed);

            let sig_trimmed = sig_header.trim();
            if (sig_trimmed.len() == computed_hex.len()
                && bool::from(sig_trimmed.as_bytes().ct_eq(computed_hex.as_bytes())))
                || (sig_trimmed.len() == computed_b64.len()
                    && bool::from(sig_trimmed.as_bytes().ct_eq(computed_b64.as_bytes())))
            {
                return true;
            }
        }
    }

    false
}

pub fn evaluate_payout_provider_status(status: &str) -> PayoutState {
    match status.trim().to_ascii_uppercase().as_str() {
        "SUCCESSFUL" | "COMPLETED" => PayoutState::Confirmed,
        "NEW" | "PENDING" | "PROCESSING" | "QUEUED" => PayoutState::Processing,
        "FAILED" | "REVERSED" => PayoutState::OnHold,
        _ => PayoutState::OnHold,
    }
}

pub fn evaluate_refund_provider_status(status: &str) -> RefundState {
    match status.trim().to_ascii_lowercase().as_str() {
        "completed" | "successful" | "refunded" => RefundState::Completed,
        "pending" | "processing" | "new" => RefundState::Processing,
        _ => RefundState::Failed,
    }
}

pub fn build_flw_transfer_request(
    payout_reference: &str,
    bank_code: &str,
    account_number: &str,
    amount_minor: u128,
    currency: &str,
    narration: &str,
) -> Value {
    json!({
        "account_bank": bank_code,
        "account_number": account_number,
        "amount": minor_units_to_decimal_string(amount_minor),
        "narration": narration,
        "currency": currency.to_ascii_uppercase(),
        "reference": payout_reference,
        "debit_currency": currency.to_ascii_uppercase()
    })
}
