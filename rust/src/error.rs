use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("Authentication required or invalid credentials")]
    Unauthorized(&'static str),

    #[error("Forbidden operation: {0}")]
    Forbidden(&'static str),

    #[error("Resource not found: {0}")]
    NotFound(&'static str),

    #[error("Invalid request: {0}")]
    BadRequest(String),

    #[error("Conflict or invalid state transition: {0}")]
    Conflict(&'static str),

    #[error("Payload exceeds maximum allowed size")]
    PayloadTooLarge,

    #[error("Rate limit exceeded")]
    TooManyRequests,

    #[error("Cryptographic or policy verification failed: {reason}")]
    VerificationFailed { code: &'static str, reason: String },

    #[error("Service dependency unavailable")]
    ServiceUnavailable(&'static str),

    #[error("Internal processing error")]
    Internal,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            ApiError::Unauthorized(code) => (
                StatusCode::UNAUTHORIZED,
                code.to_string(),
                "Authentication required or invalid credentials".to_string(),
            ),
            ApiError::Forbidden(code) => (
                StatusCode::FORBIDDEN,
                code.to_string(),
                "Operation not permitted for this principal or target".to_string(),
            ),
            ApiError::NotFound(code) => (
                StatusCode::NOT_FOUND,
                code.to_string(),
                "Requested resource does not exist".to_string(),
            ),
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST".to_string(), msg),
            ApiError::Conflict(code) => (
                StatusCode::CONFLICT,
                code.to_string(),
                "Invalid state transition or duplicate resource consumption".to_string(),
            ),
            ApiError::PayloadTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "PAYLOAD_TOO_LARGE".to_string(),
                "Request or proof payload exceeds maximum permitted size".to_string(),
            ),
            ApiError::TooManyRequests => (
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMIT_EXCEEDED".to_string(),
                "Too many requests; retry later".to_string(),
            ),
            ApiError::VerificationFailed { code, reason } => {
                (StatusCode::UNPROCESSABLE_ENTITY, code.to_string(), reason)
            }
            ApiError::ServiceUnavailable(code) => (
                StatusCode::SERVICE_UNAVAILABLE,
                code.to_string(),
                "Verification dependency or configuration unavailable".to_string(),
            ),
            ApiError::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR".to_string(),
                "An unexpected internal error occurred".to_string(),
            ),
        };

        (
            status,
            Json(ErrorResponse {
                error: code,
                message,
            }),
        )
            .into_response()
    }
}
