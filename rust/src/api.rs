use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration as ChronoDuration, Utc};
use serde_json::{json, Value};
use tracing::{info, warn};
use uuid::Uuid;

use crate::{
    auth::{extract_principal_address, require_service_auth},
    config::is_valid_eth_address,
    crypto::{
        compute_keccak256_bytes32_hex, compute_sha256_hex, derive_notary_public_key_hex,
        sign_escrow_binding, verify_escrow_binding_signature, verify_tlsn_presentation_and_extract,
    },
    domain_policy::validate_target_domain,
    error::ApiError,
    models::{
        CreateSessionRequest, CreateSessionResponse, EvaluateEscrowReleaseRequest,
        EvaluateEscrowReleaseResponse, ExecuteSessionRequest, NextjsSessionData,
        NextjsWebhookCompatPayload, ProofEvidenceResponse, ProofRecord, ProofSummaryResponse,
        SessionRecord, SessionState, VerifyProofRequest,
    },
    state::AppState,
};

pub fn build_router(state: AppState) -> Router {
    let body_limit = state.config.max_proof_bytes + (256 * 1024);

    Router::new()
        .route("/health", get(health_compat))
        .route("/health/live", get(health_live))
        .route("/health/ready", get(health_ready))
        .route("/api/v1/sessions", post(create_session))
        .route("/api/v1/sessions/:id", get(get_session))
        .route("/api/v1/sessions/:id/execute", post(execute_session))
        .route("/api/v1/sessions/:id/cancel", post(cancel_session))
        .route("/api/v1/proofs/verify", post(verify_proof))
        .route("/api/v1/proofs/:id", get(get_proof))
        .route("/api/v1/proofs/:id/evidence", get(get_proof_evidence))
        .route(
            "/api/v1/escrow/evaluate-release",
            post(evaluate_escrow_release),
        )
        .layer(DefaultBodyLimit::max(body_limit))
        .with_state(state)
}

async fn health_live() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "status": "alive"
        })),
    )
}

async fn health_ready(
    State(state): State<AppState>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let notary_pubkey = derive_notary_public_key_hex(&state.config.notary_signing_key_bytes())
        .map_err(|_| ApiError::ServiceUnavailable("CRYPTO_SIGNER_NOT_READY"))?;

    if state.config.allowed_hostnames.is_empty() {
        return Err(ApiError::ServiceUnavailable("EMPTY_HOSTNAME_ALLOWLIST"));
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "status": "ready",
            "protocol": "tlsnotary-v0.1.0-alpha.12",
            "chain_id": state.config.expected_chain_id,
            "notary_public_key_hex": notary_pubkey,
            "allowed_hostnames_count": state.config.allowed_hostnames.len(),
        })),
    ))
}

async fn health_compat(
    State(state): State<AppState>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let (status, body) = health_ready(State(state)).await?;
    Ok((status, body))
}

async fn create_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateSessionRequest>,
) -> Result<(StatusCode, Json<CreateSessionResponse>), ApiError> {
    require_service_auth(&headers, &state.config)?;

    let buyer_addr = req.buyer_address.trim().to_ascii_lowercase();
    if !is_valid_eth_address(&buyer_addr) {
        return Err(ApiError::BadRequest(
            "Invalid buyer Ethereum wallet address".into(),
        ));
    }

    if !state.check_rate_limit(&format!("session_create:{buyer_addr}"), 30) {
        return Err(ApiError::TooManyRequests);
    }

    let trade_id = req.trade_id.trim().to_string();
    if trade_id.is_empty()
        || trade_id.len() > 39
        || !trade_id.chars().all(|c| c.is_ascii_digit())
        || trade_id.starts_with('0')
    {
        return Err(ApiError::BadRequest(
            "trade_id must be a positive decimal integer string".into(),
        ));
    }

    if req.expected_amount_units == 0 {
        return Err(ApiError::BadRequest(
            "expected_amount_units must be greater than zero".into(),
        ));
    }

    let expected_currency = req.expected_currency.trim().to_ascii_uppercase();
    if !matches!(expected_currency.as_str(), "NGN" | "USDC" | "USD") {
        return Err(ApiError::BadRequest(format!(
            "Unsupported currency '{}'; supported: NGN, USDC, USD",
            expected_currency
        )));
    }

    let payment_reference = req.payment_reference.trim().to_string();
    if payment_reference.len() > 128 {
        return Err(ApiError::BadRequest(
            "payment_reference exceeds 128 characters".into(),
        ));
    }

    if let Some(ref rcpt) = req.expected_recipient_hash {
        let trimmed = rcpt.trim().trim_start_matches("0x");
        if trimmed.len() != 64 || !trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(ApiError::BadRequest(
                "expected_recipient_hash must be a 32-byte hex string".into(),
            ));
        }
    }

    let validated_hostname =
        validate_target_domain(&req.target_hostname, &state.config.allowed_hostnames)?;

    let notary_public_key_hex =
        derive_notary_public_key_hex(&state.config.notary_signing_key_bytes())?;

    // Check idempotency key or active trade+buyer deduplication
    let dedup_key = req
        .idempotency_key
        .clone()
        .unwrap_or_else(|| format!("active:{trade_id}:{buyer_addr}:{validated_hostname}"));

    let now = Utc::now();
    if let Some(existing_session_id) = state.idempotency_sessions.get(&dedup_key) {
        if let Some(existing) = state.sessions.get(existing_session_id.value()) {
            if existing.expires_at > now
                && existing.state != SessionState::Cancelled
                && existing.state != SessionState::Failed
            {
                let binding_digest = compute_sha256_hex(
                    format!(
                        "{}:{}:{}:{}",
                        existing.chain_id,
                        existing.escrow_address,
                        existing.trade_id,
                        existing.session_id
                    )
                    .as_bytes(),
                );
                return Ok((
                    StatusCode::OK,
                    Json(CreateSessionResponse {
                        session_id: existing.session_id.clone(),
                        verification_id: existing.verification_id.clone(),
                        trade_id: existing.trade_id.clone(),
                        state: existing.state,
                        expires_at: existing.expires_at,
                        notary_public_key_hex,
                        domain_binding_digest: binding_digest,
                    }),
                ));
            }
        }
    }

    let session_id = format!("sess_{}", Uuid::new_v4().simple());
    let verification_id = format!("ver_{}", Uuid::new_v4().simple());
    let expires_at = now + ChronoDuration::seconds(state.config.session_ttl_secs as i64);

    let record = SessionRecord {
        session_id: session_id.clone(),
        verification_id: verification_id.clone(),
        trade_id: trade_id.clone(),
        buyer_address: buyer_addr.clone(),
        expected_amount_units: req.expected_amount_units,
        expected_currency,
        payment_reference,
        expected_recipient_hash: req
            .expected_recipient_hash
            .map(|s| s.trim().to_ascii_lowercase()),
        target_hostname: validated_hostname,
        chain_id: state.config.expected_chain_id,
        escrow_address: state.config.expected_escrow_address.clone(),
        state: SessionState::Pending,
        proof_id: None,
        on_chain_proof_id_bytes32: None,
        failure_reason: None,
        created_at: now,
        updated_at: now,
        expires_at,
    };

    let binding_digest = compute_sha256_hex(
        format!(
            "{}:{}:{}:{}",
            record.chain_id, record.escrow_address, record.trade_id, record.session_id
        )
        .as_bytes(),
    );

    state.sessions.insert(session_id.clone(), record);
    state
        .idempotency_sessions
        .insert(dedup_key, session_id.clone());

    info!(
        event = "session_created",
        session_id = %session_id,
        trade_id = %trade_id,
        "Initialized TLSNotary verification session"
    );

    Ok((
        StatusCode::CREATED,
        Json(CreateSessionResponse {
            session_id,
            verification_id,
            trade_id,
            state: SessionState::Pending,
            expires_at,
            notary_public_key_hex,
            domain_binding_digest: binding_digest,
        }),
    ))
}

async fn get_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<Json<SessionRecord>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let mut session = state
        .sessions
        .get_mut(&session_id)
        .ok_or(ApiError::NotFound("SESSION_NOT_FOUND"))?;

    if let Some(caller_wallet) = extract_principal_address(&headers) {
        if caller_wallet != session.buyer_address {
            return Err(ApiError::Forbidden("CROSS_USER_SESSION_ACCESS_DENIED"));
        }
    }

    if session.state == SessionState::Pending && session.expires_at <= Utc::now() {
        session.state = SessionState::Expired;
        session.updated_at = Utc::now();
    }

    Ok(Json(session.clone()))
}

async fn cancel_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<Json<SessionRecord>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let mut session = state
        .sessions
        .get_mut(&session_id)
        .ok_or(ApiError::NotFound("SESSION_NOT_FOUND"))?;

    if let Some(caller_wallet) = extract_principal_address(&headers) {
        if caller_wallet != session.buyer_address {
            return Err(ApiError::Forbidden("CROSS_USER_SESSION_ACCESS_DENIED"));
        }
    }

    if !session.state.can_transition_to(SessionState::Cancelled) {
        return Err(ApiError::Conflict("SESSION_CANNOT_BE_CANCELLED"));
    }

    session.state = SessionState::Cancelled;
    session.updated_at = Utc::now();

    info!(
        event = "session_cancelled",
        session_id = %session_id,
        trade_id = %session.trade_id,
        "Verification session cancelled"
    );

    Ok(Json(session.clone()))
}

async fn execute_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Json(req): Json<ExecuteSessionRequest>,
) -> Result<Json<ProofSummaryResponse>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let (trade_id, buyer_address) = {
        let session = state
            .sessions
            .get(&session_id)
            .ok_or(ApiError::NotFound("SESSION_NOT_FOUND"))?;

        if let Some(caller_wallet) = extract_principal_address(&headers) {
            if caller_wallet != session.buyer_address {
                return Err(ApiError::Forbidden("CROSS_USER_SESSION_ACCESS_DENIED"));
            }
        }

        (session.trade_id.clone(), session.buyer_address.clone())
    };

    process_proof_verification(
        &state,
        VerifyProofRequest {
            session_id,
            trade_id,
            buyer_address,
            presentation_bincode_hex: req.presentation_bincode_hex,
        },
    )
    .await
    .map(Json)
}

async fn verify_proof(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<VerifyProofRequest>,
) -> Result<Json<ProofSummaryResponse>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    if let Some(caller_wallet) = extract_principal_address(&headers) {
        if caller_wallet != req.buyer_address.trim().to_ascii_lowercase() {
            return Err(ApiError::Forbidden("CROSS_USER_PROOF_SUBMISSION_DENIED"));
        }
    }

    process_proof_verification(&state, req).await.map(Json)
}

async fn process_proof_verification(
    state: &AppState,
    req: VerifyProofRequest,
) -> Result<ProofSummaryResponse, ApiError> {
    let buyer_addr = req.buyer_address.trim().to_ascii_lowercase();
    if !state.check_rate_limit(&format!("proof_verify:{buyer_addr}"), 20) {
        return Err(ApiError::TooManyRequests);
    }

    let now = Utc::now();

    // Atomic state lock & pre-check on session
    let session_snapshot = {
        let mut session = state
            .sessions
            .get_mut(&req.session_id)
            .ok_or(ApiError::NotFound("SESSION_NOT_FOUND"))?;

        if session.buyer_address != buyer_addr {
            return Err(ApiError::Forbidden("SESSION_PRINCIPAL_MISMATCH"));
        }

        if session.trade_id != req.trade_id.trim() {
            return Err(ApiError::VerificationFailed {
                code: "SESSION_TRADE_ID_MISMATCH",
                reason: "Request trade_id does not match session trade_id".into(),
            });
        }

        if session.expires_at <= now {
            session.state = SessionState::Expired;
            session.updated_at = now;
            return Err(ApiError::Conflict("SESSION_EXPIRED"));
        }

        // Idempotent return if already verified for this exact session
        if session.state == SessionState::Verified {
            if let Some(ref existing_proof_id) = session.proof_id {
                if let Some(existing_proof) = state.proofs.get(existing_proof_id) {
                    return Ok(ProofSummaryResponse {
                        proof_id: existing_proof.proof_id.clone(),
                        on_chain_proof_id_bytes32: existing_proof.on_chain_proof_id_bytes32.clone(),
                        session_id: existing_proof.session_id.clone(),
                        trade_id: existing_proof.trade_id.clone(),
                        verified: existing_proof.verified,
                        checks_performed: existing_proof.checks_performed.clone(),
                        binding_attestation: existing_proof.binding_attestation.clone(),
                        created_at: existing_proof.created_at,
                    });
                }
            }
        }

        if !session.state.can_transition_to(SessionState::Executing) {
            return Err(ApiError::Conflict("INVALID_SESSION_STATE"));
        }

        session.state = SessionState::Executing;
        session.updated_at = now;
        session.clone()
    };

    // Perform cryptographic verification of the TLSNotary Presentation
    let verification_outcome = verify_tlsn_presentation_and_extract(
        &req.presentation_bincode_hex,
        &session_snapshot,
        &state.config,
    );

    let (evidence, mut checks) = match verification_outcome {
        Ok(res) => res,
        Err(err) => {
            if let Some(mut session) = state.sessions.get_mut(&req.session_id) {
                session.state = SessionState::Failed;
                session.failure_reason = Some(err.to_string());
                session.updated_at = Utc::now();
            }
            warn!(
                event = "proof_verification_rejected",
                session_id = %req.session_id,
                trade_id = %req.trade_id,
                error = %err,
                "Rejected TLSNotary presentation verification"
            );
            return Err(err);
        }
    };

    // Anti-replay: ensure neither this transcript digest nor this payment reference was used in another session/trade
    if let Some(prior_session) = state
        .consumed_transcript_digests
        .get(&evidence.transcript_digest_hex)
    {
        if prior_session.value() != &req.session_id {
            if let Some(mut session) = state.sessions.get_mut(&req.session_id) {
                session.state = SessionState::Failed;
                session.failure_reason = Some("REPLAYED_TRANSCRIPT_PROOF".into());
                session.updated_at = Utc::now();
            }
            return Err(ApiError::Conflict("REPLAYED_TRANSCRIPT_PROOF"));
        }
    }

    if !evidence.payment_reference.is_empty() {
        let ref_key = format!(
            "{}:{}",
            evidence.server_name,
            evidence.payment_reference.to_ascii_lowercase()
        );
        if let Some(prior_trade) = state.consumed_payment_references.get(&ref_key) {
            if prior_trade.value() != &session_snapshot.trade_id {
                if let Some(mut session) = state.sessions.get_mut(&req.session_id) {
                    session.state = SessionState::Failed;
                    session.failure_reason = Some("DUPLICATE_PAYMENT_REFERENCE_USED".into());
                    session.updated_at = Utc::now();
                }
                return Err(ApiError::Conflict("DUPLICATE_PAYMENT_REFERENCE_USED"));
            }
        }
        state
            .consumed_payment_references
            .insert(ref_key, session_snapshot.trade_id.clone());
    }

    state.consumed_transcript_digests.insert(
        evidence.transcript_digest_hex.clone(),
        req.session_id.clone(),
    );
    checks.push("anti_replay_transcript_and_payment_ref_verified".to_string());

    // Compute canonical on-chain proofId matching Next.js webhook `keccak256(toUtf8Bytes(sessionId))`
    let on_chain_proof_id_bytes32 =
        compute_keccak256_bytes32_hex(session_snapshot.session_id.as_bytes());
    let proof_id = format!("prf_{}", Uuid::new_v4().simple());

    let binding_attestation = sign_escrow_binding(
        &state.config.notary_signing_key_bytes(),
        session_snapshot.chain_id,
        &session_snapshot.escrow_address,
        &session_snapshot.trade_id,
        &session_snapshot.session_id,
        &on_chain_proof_id_bytes32,
        &evidence.transcript_digest_hex,
    )?;
    checks.push("escrow_domain_binding_signed".to_string());

    let proof_record = ProofRecord {
        proof_id: proof_id.clone(),
        on_chain_proof_id_bytes32: on_chain_proof_id_bytes32.clone(),
        session_id: session_snapshot.session_id.clone(),
        trade_id: session_snapshot.trade_id.clone(),
        buyer_address: session_snapshot.buyer_address.clone(),
        verified: true,
        checks_performed: checks.clone(),
        evidence: evidence.clone(),
        binding_attestation: binding_attestation.clone(),
        created_at: now,
    };

    state.proofs.insert(proof_id.clone(), proof_record);

    if let Some(mut session) = state.sessions.get_mut(&req.session_id) {
        session.state = SessionState::Verified;
        session.proof_id = Some(proof_id.clone());
        session.on_chain_proof_id_bytes32 = Some(on_chain_proof_id_bytes32.clone());
        session.updated_at = Utc::now();
    }

    // Optional authenticated webhook callback to Next.js /api/tlsn/webhook if configured
    if let Some(ref webhook_url) = state.config.webhook_url {
        let compat_payload = NextjsWebhookCompatPayload {
            session_id: session_snapshot.session_id.clone(),
            server_name: evidence.server_name.clone(),
            session_data: NextjsSessionData {
                trade_id: evidence.trade_id.clone(),
                amount: evidence.amount_units.to_string(),
                payment_reference: evidence.payment_reference.clone(),
                payment_status: "completed".to_string(),
            },
            redacted_transcript: format!("sha256:{}", evidence.transcript_digest_hex),
        };

        let _ = state
            .http_client
            .post(webhook_url)
            .bearer_auth(&state.config.webhook_secret)
            .json(&compat_payload)
            .send()
            .await;
    }

    info!(
        event = "proof_verified",
        proof_id = %proof_id,
        session_id = %session_snapshot.session_id,
        trade_id = %session_snapshot.trade_id,
        on_chain_proof_id = %on_chain_proof_id_bytes32,
        "Cryptographic TLSNotary proof verified and bound to escrow"
    );

    Ok(ProofSummaryResponse {
        proof_id,
        on_chain_proof_id_bytes32,
        session_id: session_snapshot.session_id,
        trade_id: session_snapshot.trade_id,
        verified: true,
        checks_performed: checks,
        binding_attestation,
        created_at: now,
    })
}

async fn get_proof(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(proof_id): Path<String>,
) -> Result<Json<ProofSummaryResponse>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let proof = state
        .proofs
        .get(&proof_id)
        .ok_or(ApiError::NotFound("PROOF_NOT_FOUND"))?;

    if let Some(caller_wallet) = extract_principal_address(&headers) {
        if caller_wallet != proof.buyer_address {
            return Err(ApiError::Forbidden("CROSS_USER_PROOF_ACCESS_DENIED"));
        }
    }

    Ok(Json(ProofSummaryResponse {
        proof_id: proof.proof_id.clone(),
        on_chain_proof_id_bytes32: proof.on_chain_proof_id_bytes32.clone(),
        session_id: proof.session_id.clone(),
        trade_id: proof.trade_id.clone(),
        verified: proof.verified,
        checks_performed: proof.checks_performed.clone(),
        binding_attestation: proof.binding_attestation.clone(),
        created_at: proof.created_at,
    }))
}

async fn get_proof_evidence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(proof_id): Path<String>,
) -> Result<Json<ProofEvidenceResponse>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let proof = state
        .proofs
        .get(&proof_id)
        .ok_or(ApiError::NotFound("PROOF_NOT_FOUND"))?;

    if let Some(caller_wallet) = extract_principal_address(&headers) {
        if caller_wallet != proof.buyer_address {
            return Err(ApiError::Forbidden("CROSS_USER_EVIDENCE_ACCESS_DENIED"));
        }
    }

    Ok(Json(ProofEvidenceResponse {
        proof_id: proof.proof_id.clone(),
        session_id: proof.session_id.clone(),
        trade_id: proof.trade_id.clone(),
        evidence: proof.evidence.clone(),
        binding_attestation: proof.binding_attestation.clone(),
    }))
}

async fn evaluate_escrow_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<EvaluateEscrowReleaseRequest>,
) -> Result<Json<EvaluateEscrowReleaseResponse>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let mut checks = Vec::new();
    let mut rejections = Vec::new();

    if req.chain_id != state.config.expected_chain_id {
        rejections.push(format!(
            "CHAIN_ID_MISMATCH: expected {}, got {}",
            state.config.expected_chain_id, req.chain_id
        ));
    } else {
        checks.push("chain_id_verified".to_string());
    }

    if req.escrow_address.trim().to_ascii_lowercase() != state.config.expected_escrow_address {
        rejections.push("ESCROW_CONTRACT_ADDRESS_MISMATCH".to_string());
    } else {
        checks.push("escrow_contract_address_verified".to_string());
    }

    let proof = match state.proofs.get(&req.proof_id) {
        Some(p) => p,
        None => {
            return Err(ApiError::NotFound("PROOF_NOT_FOUND"));
        }
    };

    if !proof.verified {
        rejections.push("PROOF_NOT_VERIFIED".to_string());
    } else {
        checks.push("proof_cryptographic_status_verified".to_string());
    }

    if proof.session_id != req.session_id {
        rejections.push("SESSION_ID_MISMATCH".to_string());
    } else {
        checks.push("session_id_binding_verified".to_string());
    }

    if proof.trade_id != req.trade_id.trim() {
        rejections.push("TRADE_ID_MISMATCH".to_string());
    } else {
        checks.push("trade_id_binding_verified".to_string());
    }

    if proof.buyer_address != req.buyer_address.trim().to_ascii_lowercase() {
        rejections.push("BUYER_ADDRESS_MISMATCH".to_string());
    } else {
        checks.push("buyer_principal_binding_verified".to_string());
    }

    if proof.evidence.amount_units != req.expected_amount_units {
        rejections.push("AMOUNT_UNITS_MISMATCH".to_string());
    } else {
        checks.push("amount_units_exact_match".to_string());
    }

    if !proof
        .evidence
        .currency
        .eq_ignore_ascii_case(req.expected_currency.trim())
    {
        rejections.push("CURRENCY_MISMATCH".to_string());
    } else {
        checks.push("currency_exact_match".to_string());
    }

    if !req.expected_payment_reference.is_empty()
        && proof.evidence.payment_reference != req.expected_payment_reference
    {
        rejections.push("PAYMENT_REFERENCE_MISMATCH".to_string());
    } else {
        checks.push("payment_reference_exact_match".to_string());
    }

    let expected_pubkey = derive_notary_public_key_hex(&state.config.notary_signing_key_bytes())?;
    if verify_escrow_binding_signature(&proof.binding_attestation, &expected_pubkey).is_err() {
        rejections.push("INVALID_ESCROW_BINDING_SIGNATURE".to_string());
    } else {
        checks.push("escrow_binding_ecdsa_signature_verified".to_string());
    }

    let authorized = rejections.is_empty();

    Ok(Json(EvaluateEscrowReleaseResponse {
        authorized,
        trade_id: proof.trade_id.clone(),
        session_id: proof.session_id.clone(),
        proof_id: proof.proof_id.clone(),
        on_chain_proof_id_bytes32: proof.on_chain_proof_id_bytes32.clone(),
        checks_performed: checks,
        rejection_reasons: rejections,
        binding_attestation: if authorized {
            Some(proof.binding_attestation.clone())
        } else {
            None
        },
    }))
}
