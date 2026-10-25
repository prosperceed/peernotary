use axum::http::HeaderMap;
use subtle::ConstantTimeEq;

use crate::{config::AppConfig, error::ApiError};

pub fn require_service_auth(headers: &HeaderMap, config: &AppConfig) -> Result<(), ApiError> {
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(ApiError::Unauthorized("MISSING_AUTHORIZATION_HEADER"))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(ApiError::Unauthorized("MALFORMED_BEARER_TOKEN"))?
        .trim();

    let expected_api = config.service_api_key.as_bytes();
    let expected_webhook = config.webhook_secret.as_bytes();
    let provided = token.as_bytes();

    let matches_api =
        provided.len() == expected_api.len() && bool::from(provided.ct_eq(expected_api));
    let matches_webhook =
        provided.len() == expected_webhook.len() && bool::from(provided.ct_eq(expected_webhook));

    if !matches_api && !matches_webhook {
        return Err(ApiError::Unauthorized("INVALID_SERVICE_CREDENTIALS"));
    }

    Ok(())
}

pub fn extract_principal_address(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-wallet-address")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_ascii_lowercase())
}
