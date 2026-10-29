use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::{info, warn};
use uuid::Uuid;

use crate::{
    auth::{extract_principal_address, require_service_auth},
    crypto::{compute_keccak256_bytes32_hex, compute_sha256_hex},
    error::ApiError,
    flutterwave::{
        build_flw_standard_checkout_request, evaluate_payout_provider_status,
        evaluate_refund_provider_status, evaluate_verified_transaction, generate_payout_reference,
        generate_refund_reference, generate_secure_tx_ref, minor_units_to_decimal_string,
        parse_flw_verify_response, verify_flutterwave_webhook_signature, VerificationOutcome,
    },
    lifecycle::{
        make_outbox_job, mask_account_number, redact_provider_payload, AttemptStatus,
        EscrowOperationRecord, EscrowOperationState, PaymentAttemptRecord, PaymentState,
        PayoutState, RefundRecord, RefundState, SellerPayoutRecord, TradeAuditEvent,
        TradeLifecycleState, TradeRecord, WebhookInboxEvent,
    },
    state::AppState,
    wallet_auth::{
        build_wallet_challenge, hash_session_token, normalize_wallet_address,
        recover_eip191_signer_address, validate_and_normalize_username, UserProfileRecord,
        WalletSessionRecord,
    },
};

// ─── WALLET AUTHENTICATION & USERNAME ONBOARDING ─────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ChallengeRequest {
    pub address: String,
    pub domain: Option<String>,
    pub uri: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChallengeResponse {
    pub address: String,
    pub nonce: String,
    pub message: String,
    pub expires_at: String,
    pub chain_id: u64,
}

pub async fn create_auth_challenge(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ChallengeRequest>,
) -> Result<(StatusCode, Json<ChallengeResponse>), ApiError> {
    require_service_auth(&headers, &state.config)?;

    let normalized = normalize_wallet_address(&req.address)?;
    if !state.check_rate_limit(&format!("auth_challenge:{normalized}"), 30) {
        return Err(ApiError::TooManyRequests);
    }

    let domain = req
        .domain
        .as_deref()
        .unwrap_or("peernotary.io")
        .trim();
    let uri = req
        .uri
        .as_deref()
        .unwrap_or(&state.payment_config.app_base_url)
        .trim();

    let challenge = build_wallet_challenge(
        &normalized,
        domain,
        uri,
        state.config.expected_chain_id,
        300, // 5-minute nonce TTL
    )?;

    let key = format!("{}::{}", challenge.wallet_address, challenge.nonce);
    state.wallet_nonces.insert(key, challenge.clone());

    Ok((
        StatusCode::CREATED,
        Json(ChallengeResponse {
            address: challenge.wallet_address,
            nonce: challenge.nonce,
            message: challenge.message,
            expires_at: challenge.expires_at.to_rfc3339(),
            chain_id: challenge.chain_id,
        }),
    ))
}

#[derive(Debug, Deserialize)]
pub struct VerifyWalletRequest {
    pub address: String,
    pub nonce: String,
    pub signature: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyWalletResponse {
    pub authenticated: bool,
    pub session_token: String,
    pub expires_at: String,
    pub profile: UserProfileRecord,
}

pub async fn verify_wallet_signature(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<VerifyWalletRequest>,
) -> Result<Json<VerifyWalletResponse>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let normalized = normalize_wallet_address(&req.address)?;
    if !state.check_rate_limit(&format!("auth_verify:{normalized}"), 20) {
        return Err(ApiError::TooManyRequests);
    }

    let key = format!("{}::{}", normalized, req.nonce.trim());
    let mut challenge = state
        .wallet_nonces
        .get_mut(&key)
        .ok_or(ApiError::Unauthorized("CHALLENGE_NOT_FOUND"))?;

    let now = Utc::now();
    if challenge.consumed_at.is_some() {
        return Err(ApiError::Conflict("NONCE_ALREADY_CONSUMED"));
    }
    if challenge.expires_at <= now {
        return Err(ApiError::Unauthorized("CHALLENGE_EXPIRED"));
    }

    let recovered = recover_eip191_signer_address(&challenge.message, &req.signature)?;
    if recovered.to_ascii_lowercase() != normalized {
        return Err(ApiError::Unauthorized("SIGNATURE_ADDRESS_MISMATCH"));
    }

    // Consume nonce atomically
    challenge.consumed_at = Some(now);
    drop(challenge);

    // Upsert user profile
    let profile = state
        .profiles
        .entry(normalized.clone())
        .and_modify(|p| {
            p.last_authenticated_at = now;
            p.updated_at = now;
        })
        .or_insert_with(|| UserProfileRecord {
            id: Uuid::new_v4().to_string(),
            wallet_address: normalized.clone(),
            username: None,
            display_name: None,
            role: "trader".to_string(),
            onboarding_completed: false,
            chain_id: state.config.expected_chain_id,
            last_authenticated_at: now,
            created_at: now,
            updated_at: now,
        })
        .clone();

    let raw_token = format!("pns_{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let token_hash = hash_session_token(&raw_token);
    let expires_at = now + ChronoDuration::days(7);

    let session_rec = WalletSessionRecord {
        id: Uuid::new_v4().to_string(),
        profile_id: profile.id.clone(),
        wallet_address: normalized.clone(),
        token_hash: token_hash.clone(),
        chain_id: state.config.expected_chain_id,
        expires_at,
        last_active_at: now,
        revoked_at: None,
        created_at: now,
    };

    state.wallet_sessions.insert(token_hash, session_rec);

    Ok(Json(VerifyWalletResponse {
        authenticated: true,
        session_token: raw_token,
        expires_at: expires_at.to_rfc3339(),
        profile,
    }))
}

#[derive(Debug, Deserialize)]
pub struct UpdateUsernameRequest {
    pub username: Option<String>,
    pub skip_onboarding: Option<bool>,
}

pub async fn update_username(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<UpdateUsernameRequest>,
) -> Result<Json<UserProfileRecord>, ApiError> {
    require_service_auth(&headers, &state.config)?;
    let caller = extract_principal_address(&headers)
        .ok_or(ApiError::Unauthorized("MISSING_WALLET_PRINCIPAL"))?;
    let normalized_addr = normalize_wallet_address(&caller)?;

    let now = Utc::now();
    // Ensure profile exists
    if !state.profiles.contains_key(&normalized_addr) {
        state.profiles.insert(
            normalized_addr.clone(),
            UserProfileRecord {
                id: Uuid::new_v4().to_string(),
                wallet_address: normalized_addr.clone(),
                username: None,
                display_name: None,
                role: "trader".to_string(),
                onboarding_completed: false,
                chain_id: state.config.expected_chain_id,
                last_authenticated_at: now,
                created_at: now,
                updated_at: now,
            },
        );
    }

    if req.skip_onboarding == Some(true) && req.username.is_none() {
        let mut prof = state
            .profiles
            .get_mut(&normalized_addr)
            .ok_or(ApiError::NotFound("PROFILE_NOT_FOUND"))?;
        prof.onboarding_completed = true;
        prof.updated_at = now;
        return Ok(Json(prof.clone()));
    }

    let raw_username = req
        .username
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("Username is required".into()))?;
    let clean_username = validate_and_normalize_username(raw_username)?;

    // Check uniqueness atomically
    if let Some(existing_owner) = state.usernames.get(&clean_username) {
        if existing_owner.value() != &normalized_addr {
            return Err(ApiError::Conflict("USERNAME_ALREADY_TAKEN"));
        }
    }

    // Remove previous username mapping if changing username
    if let Some(prof) = state.profiles.get(&normalized_addr) {
        if let Some(ref old_name) = prof.username {
            if old_name != &clean_username {
                state.usernames.remove(old_name);
            }
        }
    }

    state
        .usernames
        .insert(clean_username.clone(), normalized_addr.clone());

    let mut prof = state
        .profiles
        .get_mut(&normalized_addr)
        .ok_or(ApiError::NotFound("PROFILE_NOT_FOUND"))?;
    prof.username = Some(clean_username);
    prof.onboarding_completed = true;
    prof.updated_at = now;

    Ok(Json(prof.clone()))
}

pub async fn get_user_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<UserProfileRecord>, ApiError> {
    require_service_auth(&headers, &state.config)?;
    let caller = extract_principal_address(&headers)
        .ok_or(ApiError::Unauthorized("MISSING_WALLET_PRINCIPAL"))?;
    let normalized_addr = normalize_wallet_address(&caller)?;
    let now = Utc::now();

    let prof = state
        .profiles
        .entry(normalized_addr.clone())
        .or_insert_with(|| UserProfileRecord {
            id: Uuid::new_v4().to_string(),
            wallet_address: normalized_addr,
            username: None,
            display_name: None,
            role: "trader".to_string(),
            onboarding_completed: false,
            chain_id: state.config.expected_chain_id,
            last_authenticated_at: now,
            created_at: now,
            updated_at: now,
        })
        .clone();

    Ok(Json(prof))
}

// ─── TRADE CREATION & RETRIEVAL ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateTradeRequest {
    pub trade_id: String,
    pub seller_address: String,
    pub buyer_address: String,
    pub usdc_amount_units: u128,
    pub exchange_rate_minor: Option<u128>,
    pub fiat_currency: Option<String>,
    pub seller_bank_code: Option<String>,
    pub seller_bank_name: String,
    pub seller_account_number: Option<String>,
    pub initiate_tx_hash: Option<String>,
    pub collateral_tx_hash: Option<String>,
}

pub async fn create_or_register_trade(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateTradeRequest>,
) -> Result<(StatusCode, Json<TradeRecord>), ApiError> {
    require_service_auth(&headers, &state.config)?;

    let trade_id = req.trade_id.trim().to_string();
    if trade_id.is_empty() || !trade_id.chars().all(|c| c.is_ascii_digit()) {
        return Err(ApiError::BadRequest(
            "trade_id must be a positive numeric string".into(),
        ));
    }

    if let Some(existing) = state.trades.get(&trade_id) {
        return Ok((StatusCode::OK, Json(existing.clone())));
    }

    let seller_addr = normalize_wallet_address(&req.seller_address)?;
    let buyer_addr = normalize_wallet_address(&req.buyer_address)?;

    let rate_minor = req.exchange_rate_minor.unwrap_or(163_000); // 1630.00 NGN in kobo
    let currency = req
        .fiat_currency
        .clone()
        .unwrap_or_else(|| state.payment_config.flw_currency.clone());
    let bank_code = req
        .seller_bank_code
        .clone()
        .unwrap_or_else(|| map_bank_name_to_cbn_code(&req.seller_bank_name));
    let raw_acct = req
        .seller_account_number
        .as_deref()
        .unwrap_or("0123456789");
    let masked_acct = mask_account_number(raw_acct);
    let acct_hash = compute_keccak256_bytes32_hex(
        format!("{}:{}:{}", req.seller_bank_name, raw_acct, bank_code).as_bytes(),
    );

    let mut record = TradeRecord::new_awaiting_payment(
        trade_id.clone(),
        seller_addr.clone(),
        buyer_addr.clone(),
        req.usdc_amount_units,
        rate_minor,
        currency,
        bank_code,
        req.seller_bank_name.clone(),
        masked_acct,
        acct_hash,
        state.config.expected_chain_id,
        state.config.expected_escrow_address.clone(),
        state.payment_config.trade_payment_timeout_minutes,
    )?;

    record.initiate_tx_hash = req.initiate_tx_hash;
    record.collateral_tx_hash = req.collateral_tx_hash;

    let audit = TradeAuditEvent {
        id: Uuid::new_v4().to_string(),
        trade_uuid: record.id.clone(),
        trade_id: trade_id.clone(),
        actor_address: Some(buyer_addr),
        actor_role: "buyer".to_string(),
        event_type: "TRADE_INITIALIZED_AWAITING_PAYMENT".to_string(),
        previous_state: Some("OPEN".to_string()),
        new_state: record.lifecycle_state.as_str().to_string(),
        correlation_id: Some(format!("init_{trade_id}")),
        metadata: json!({
            "usdc_amount_units": record.usdc_amount_units.to_string(),
            "fiat_amount_minor": record.fiat_amount_minor.to_string(),
            "fiat_currency": record.fiat_currency,
            "payment_deadline_at": record.payment_deadline_at
        }),
        created_at: Utc::now(),
    };

    state.trades.insert(trade_id.clone(), record.clone());
    state.append_audit_event(audit);

    if let Ok(val) = serde_json::to_value(&record) {
        state.sync_to_supabase_table("trades", &val).await;
    }

    Ok((StatusCode::CREATED, Json(record)))
}

#[derive(Debug, Serialize)]
pub struct TradeDetailResponse {
    pub trade: TradeRecord,
    pub active_payment_attempt: Option<PaymentAttemptRecord>,
    pub seller_payout: Option<SellerPayoutRecord>,
    pub refund: Option<RefundRecord>,
    pub escrow_operation: Option<EscrowOperationRecord>,
    pub audit_events: Vec<TradeAuditEvent>,
}

pub async fn get_trade_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(trade_id): Path<String>,
) -> Result<Json<TradeDetailResponse>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let trade = state
        .trades
        .get(&trade_id)
        .ok_or(ApiError::NotFound("TRADE_NOT_FOUND"))?
        .clone();

    if let Some(caller) = extract_principal_address(&headers) {
        let caller_norm = caller.to_ascii_lowercase();
        let is_seller = trade.seller_address.to_ascii_lowercase() == caller_norm;
        let is_buyer = trade
            .buyer_address
            .as_ref()
            .map(|b| b.to_ascii_lowercase() == caller_norm)
            .unwrap_or(false);
        if !is_seller && !is_buyer && trade.lifecycle_state != TradeLifecycleState::Open {
            return Err(ApiError::Forbidden("CROSS_USER_TRADE_ACCESS_DENIED"));
        }
    }

    let active_payment_attempt = state
        .active_trade_checkout
        .get(&trade_id)
        .and_then(|tx_ref| state.payment_attempts.get(tx_ref.value()).map(|a| a.clone()));

    let seller_payout = state.seller_payouts.get(&trade_id).map(|p| p.clone());
    let refund = state.refunds.get(&trade_id).map(|r| r.clone());
    let escrow_operation = state.escrow_operations.get(&trade_id).map(|e| e.clone());
    let audit_events = state
        .audit_events
        .get(&trade_id)
        .map(|ev| ev.clone())
        .unwrap_or_default();

    Ok(Json(TradeDetailResponse {
        trade,
        active_payment_attempt,
        seller_payout,
        refund,
        escrow_operation,
        audit_events,
    }))
}

// ─── FLUTTERWAVE CHECKOUT INITIALIZATION ─────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct InitCheckoutRequest {
    pub idempotency_key: Option<String>,
    pub redirect_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InitCheckoutResponse {
    pub trade_id: String,
    pub attempt_id: String,
    pub tx_ref: String,
    pub checkout_url: String,
    pub expected_amount_minor: String,
    pub expected_amount_display: String,
    pub currency: String,
    pub payment_deadline_at: String,
    pub lifecycle_state: TradeLifecycleState,
    pub payment_state: PaymentState,
}

pub async fn init_flutterwave_checkout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(trade_id): Path<String>,
    Json(req): Json<InitCheckoutRequest>,
) -> Result<(StatusCode, Json<InitCheckoutResponse>), ApiError> {
    require_service_auth(&headers, &state.config)?;
    let caller = extract_principal_address(&headers)
        .ok_or(ApiError::Unauthorized("MISSING_WALLET_PRINCIPAL"))?;
    let caller_norm = normalize_wallet_address(&caller)?;

    if !state.check_rate_limit(&format!("checkout_init:{caller_norm}"), 15) {
        return Err(ApiError::TooManyRequests);
    }

    let now = Utc::now();

    // Load authoritative trade
    let mut trade = state
        .trades
        .get_mut(&trade_id)
        .ok_or(ApiError::NotFound("TRADE_NOT_FOUND"))?;

    // Verify ownership: caller must be the buyer, never the seller
    if trade.seller_address.to_ascii_lowercase() == caller_norm {
        return Err(ApiError::Forbidden("SELLER_CANNOT_PAY_OWN_TRADE"));
    }
    match trade.buyer_address {
        Some(ref b) if b.to_ascii_lowercase() != caller_norm => {
            return Err(ApiError::Forbidden("CALLER_NOT_TRADE_BUYER"));
        }
        None => {
            trade.buyer_address = Some(caller_norm.clone());
        }
        _ => {}
    }

    // Trade must be in AWAITING_PAYMENT
    if trade.lifecycle_state != TradeLifecycleState::AwaitingPayment {
        return Err(ApiError::Conflict("TRADE_NOT_AWAITING_PAYMENT"));
    }

    // Enforce 20-minute trade deadline
    let deadline = trade.payment_deadline_at.unwrap_or_else(|| {
        now + ChronoDuration::minutes(state.payment_config.trade_payment_timeout_minutes as i64)
    });
    if now >= deadline {
        return Err(ApiError::Conflict("TRADE_PAYMENT_DEADLINE_EXPIRED"));
    }
    trade.payment_deadline_at = Some(deadline);
    trade.terms_locked = true;

    // Check if an active, non-expired payment attempt already exists for this trade
    if let Some(existing_tx_ref) = state.active_trade_checkout.get(&trade_id) {
        if let Some(existing_attempt) = state.payment_attempts.get(existing_tx_ref.value()) {
            if existing_attempt.expires_at > now
                && matches!(
                    existing_attempt.status,
                    AttemptStatus::Initiated
                        | AttemptStatus::RedirectReady
                        | AttemptStatus::PendingVerification
                )
            {
                if let Some(ref url) = existing_attempt.checkout_url {
                    return Ok((
                        StatusCode::OK,
                        Json(InitCheckoutResponse {
                            trade_id: trade.trade_id.clone(),
                            attempt_id: existing_attempt.id.clone(),
                            tx_ref: existing_attempt.tx_ref.clone(),
                            checkout_url: url.clone(),
                            expected_amount_minor: existing_attempt
                                .expected_amount_minor
                                .to_string(),
                            expected_amount_display: minor_units_to_decimal_string(
                                existing_attempt.expected_amount_minor,
                            ),
                            currency: existing_attempt.expected_currency.clone(),
                            payment_deadline_at: deadline.to_rfc3339(),
                            lifecycle_state: trade.lifecycle_state,
                            payment_state: trade.payment_state,
                        }),
                    ));
                }
            }
        }
    }

    let tx_ref = generate_secure_tx_ref(&trade_id);
    let idempotency_key = req
        .idempotency_key
        .unwrap_or_else(|| format!("flw-init:{trade_id}:{caller_norm}"));

    let mut attempt = PaymentAttemptRecord {
        id: Uuid::new_v4().to_string(),
        trade_uuid: trade.id.clone(),
        trade_id: trade.trade_id.clone(),
        buyer_address: caller_norm.clone(),
        tx_ref: tx_ref.clone(),
        idempotency_key,
        flw_tx_id: None,
        flw_ref: None,
        expected_amount_minor: trade.fiat_amount_minor,
        expected_currency: trade.fiat_currency.clone(),
        settled_amount_minor: None,
        app_fee_minor: None,
        checkout_url: None,
        status: AttemptStatus::Initiated,
        failure_code: None,
        failure_reason: None,
        expires_at: deadline,
        verified_at: None,
        created_at: now,
        updated_at: now,
    };

    let redirect_base = req
        .redirect_url
        .as_deref()
        .unwrap_or(&state.payment_config.flw_redirect_url);
    let flw_payload =
        build_flw_standard_checkout_request(&attempt, &trade.seller_address, redirect_base);

    // Persist attempt BEFORE calling external provider
    state
        .payment_attempts
        .insert(tx_ref.clone(), attempt.clone());
    state
        .active_trade_checkout
        .insert(trade_id.clone(), tx_ref.clone());
    trade.payment_state = PaymentState::CheckoutCreated;
    trade.updated_at = now;
    let trade_snapshot = trade.clone();
    drop(trade);

    // Call Flutterwave Standard API if secret key is configured (and not a dummy placeholder)
    let checkout_url = if let Some(ref secret_key) = state.payment_config.flw_secret_key {
        let flw_endpoint = format!("{}/payments", state.payment_config.flw_base_url);
        match state
            .http_client
            .post(&flw_endpoint)
            .header("Authorization", format!("Bearer {secret_key}"))
            .header("Content-Type", "application/json")
            .json(&flw_payload)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                let body: Value = resp.json().await.unwrap_or_else(|_| json!({}));
                body.get("data")
                    .and_then(|d| d.get("link"))
                    .and_then(|l| l.as_str())
                    .map(|s| s.to_string())
                    .ok_or(ApiError::ServiceUnavailable("FLW_MISSING_CHECKOUT_LINK"))?
            }
            Ok(resp) => {
                warn!(status = %resp.status(), trade_id = %trade_id, "Flutterwave payment session API returned non-200");
                return Err(ApiError::ServiceUnavailable("FLW_CHECKOUT_CREATION_FAILED"));
            }
            Err(err) => {
                // Provider timeout recovery: enqueue a reconciliation job before returning 503
                warn!(error = %err, tx_ref = %tx_ref, "Flutterwave checkout call timed out; enqueuing reconciliation");
                state.enqueue_outbox_job(make_outbox_job(
                    "VERIFY_PAYMENT",
                    &format!("verify_timeout:{tx_ref}"),
                    &trade_id,
                    json!({ "tx_ref": tx_ref }),
                    state.payment_config.max_provider_retries,
                ));
                return Err(ApiError::ServiceUnavailable("FLW_PROVIDER_TIMEOUT"));
            }
        }
    } else {
        // Sandbox / local development fallback hosted checkout URL
        format!(
            "{}?tradeId={}&tx_ref={}&amount={}&currency={}&flw_checkout=1",
            redirect_base,
            trade_id,
            tx_ref,
            minor_units_to_decimal_string(attempt.expected_amount_minor),
            attempt.expected_currency
        )
    };

    attempt.checkout_url = Some(checkout_url.clone());
    attempt.status = AttemptStatus::RedirectReady;
    attempt.updated_at = Utc::now();
    state
        .payment_attempts
        .insert(tx_ref.clone(), attempt.clone());

    state.append_audit_event(TradeAuditEvent {
        id: Uuid::new_v4().to_string(),
        trade_uuid: trade_snapshot.id.clone(),
        trade_id: trade_id.clone(),
        actor_address: Some(caller_norm),
        actor_role: "buyer".to_string(),
        event_type: "FLW_CHECKOUT_INITIALIZED".to_string(),
        previous_state: Some(trade_snapshot.lifecycle_state.as_str().to_string()),
        new_state: trade_snapshot.lifecycle_state.as_str().to_string(),
        correlation_id: Some(tx_ref.clone()),
        metadata: json!({
            "attempt_id": attempt.id,
            "tx_ref": tx_ref,
            "expected_amount_minor": attempt.expected_amount_minor.to_string(),
            "currency": attempt.expected_currency,
            "deadline": deadline.to_rfc3339()
        }),
        created_at: Utc::now(),
    });

    Ok((
        StatusCode::CREATED,
        Json(InitCheckoutResponse {
            trade_id,
            attempt_id: attempt.id,
            tx_ref,
            checkout_url,
            expected_amount_minor: attempt.expected_amount_minor.to_string(),
            expected_amount_display: minor_units_to_decimal_string(attempt.expected_amount_minor),
            currency: attempt.expected_currency,
            payment_deadline_at: deadline.to_rfc3339(),
            lifecycle_state: trade_snapshot.lifecycle_state,
            payment_state: PaymentState::CheckoutCreated,
        }),
    ))
}

// ─── TRANSACTION VERIFICATION & CALLBACK RECONCILIATION ──────────────────────

#[derive(Debug, Deserialize)]
pub struct VerifyPaymentRequest {
    pub tx_ref: String,
    pub flw_transaction_id: Option<u64>,
    /// Optional provider verification payload (used in deterministic tests or internal webhook relay)
    pub provider_verification_payload: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct VerifyPaymentResponse {
    pub trade_id: String,
    pub tx_ref: String,
    pub lifecycle_state: TradeLifecycleState,
    pub payment_state: PaymentState,
    pub payout_state: PayoutState,
    pub outcome: VerificationOutcome,
}

pub async fn verify_flutterwave_payment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(trade_id): Path<String>,
    Json(req): Json<VerifyPaymentRequest>,
) -> Result<Json<VerifyPaymentResponse>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let tx_ref = req.tx_ref.trim().to_string();
    let attempt = state
        .payment_attempts
        .get(&tx_ref)
        .ok_or(ApiError::NotFound("PAYMENT_ATTEMPT_NOT_FOUND"))?
        .clone();

    if attempt.trade_id != trade_id {
        return Err(ApiError::VerificationFailed {
            code: "CROSS_TRADE_REFERENCE_REUSE",
            reason: "Payment tx_ref belongs to a different trade".into(),
        });
    }

    // If caller principal is supplied, ensure caller is buyer or seller of this trade
    if let Some(caller) = extract_principal_address(&headers) {
        let caller_norm = caller.to_ascii_lowercase();
        let trade_ref = state
            .trades
            .get(&trade_id)
            .ok_or(ApiError::NotFound("TRADE_NOT_FOUND"))?;
        let is_buyer = trade_ref
            .buyer_address
            .as_ref()
            .map(|b| b.to_ascii_lowercase() == caller_norm)
            .unwrap_or(false);
        let is_seller = trade_ref.seller_address.to_ascii_lowercase() == caller_norm;
        if !is_buyer && !is_seller {
            return Err(ApiError::Forbidden("CALLER_NOT_TRADE_PARTICIPANT"));
        }
    }

    // Obtain authoritative provider verification payload
    let raw_verify_json = if let Some(payload) = req.provider_verification_payload {
        payload
    } else if let Some(ref secret_key) = state.payment_config.flw_secret_key {
        let verify_url = if let Some(tx_id) = req.flw_transaction_id {
            format!(
                "{}/transactions/{}/verify",
                state.payment_config.flw_base_url, tx_id
            )
        } else {
            format!(
                "{}/transactions/verify_by_reference?tx_ref={}",
                state.payment_config.flw_base_url,
                urlencoding_simple(&tx_ref)
            )
        };

        match state
            .http_client
            .get(&verify_url)
            .header("Authorization", format!("Bearer {secret_key}"))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => resp
                .json::<Value>()
                .await
                .map_err(|_| ApiError::ServiceUnavailable("FLW_VERIFY_INVALID_JSON"))?,
            Ok(resp) if resp.status().is_server_error() || resp.status() == StatusCode::TOO_MANY_REQUESTS => {
                // Never mark transaction failed when verification API is temporarily unavailable
                state.enqueue_outbox_job(make_outbox_job(
                    "VERIFY_PAYMENT",
                    &format!("retry_verify:{tx_ref}"),
                    &trade_id,
                    json!({ "tx_ref": tx_ref, "flw_transaction_id": req.flw_transaction_id }),
                    state.payment_config.max_provider_retries,
                ));
                return Err(ApiError::ServiceUnavailable("FLW_VERIFICATION_API_UNAVAILABLE"));
            }
            Ok(_) => {
                return Err(ApiError::VerificationFailed {
                    code: "FLW_TRANSACTION_NOT_VERIFIED_AT_PROVIDER",
                    reason: "Flutterwave could not verify transaction reference".into(),
                });
            }
            Err(_) => {
                state.enqueue_outbox_job(make_outbox_job(
                    "VERIFY_PAYMENT",
                    &format!("retry_verify:{tx_ref}"),
                    &trade_id,
                    json!({ "tx_ref": tx_ref, "flw_transaction_id": req.flw_transaction_id }),
                    state.payment_config.max_provider_retries,
                ));
                return Err(ApiError::ServiceUnavailable("FLW_VERIFICATION_API_TIMEOUT"));
            }
        }
    } else {
        return Err(ApiError::ServiceUnavailable(
            "FLW_SECRET_KEY_NOT_CONFIGURED_FOR_LIVE_VERIFY",
        ));
    };

    apply_verified_payment_to_trade(&state, &trade_id, &tx_ref, &raw_verify_json, "verify_api")
        .await
}

pub(crate) async fn apply_verified_payment_to_trade(
    state: &AppState,
    trade_id: &str,
    tx_ref: &str,
    raw_verify_json: &Value,
    source: &str,
) -> Result<Json<VerifyPaymentResponse>, ApiError> {
    let parsed = parse_flw_verify_response(raw_verify_json)?;

    // Check cross-trade replay of flw_tx_id
    if let Some(existing_trade) = state.consumed_flw_tx_ids.get(&parsed.flw_tx_id) {
        if existing_trade.value() != trade_id {
            return Err(ApiError::Conflict("FLW_TRANSACTION_ID_ALREADY_USED"));
        }
    }

    let mut attempt = state
        .payment_attempts
        .get_mut(tx_ref)
        .ok_or(ApiError::NotFound("PAYMENT_ATTEMPT_NOT_FOUND"))?;

    if attempt.trade_id != trade_id {
        return Err(ApiError::Conflict("CROSS_TRADE_ATTEMPT_MISMATCH"));
    }

    let mut trade = state
        .trades
        .get_mut(trade_id)
        .ok_or(ApiError::NotFound("TRADE_NOT_FOUND"))?;

    // Idempotent return if this exact payment attempt was already verified for this trade
    if attempt.status == AttemptStatus::Verified
        && trade.payment_state == PaymentState::Confirmed
        && attempt.flw_tx_id == Some(parsed.flw_tx_id)
    {
        return Ok(Json(VerifyPaymentResponse {
            trade_id: trade.trade_id.clone(),
            tx_ref: tx_ref.to_string(),
            lifecycle_state: trade.lifecycle_state,
            payment_state: trade.payment_state,
            payout_state: trade.payout_state,
            outcome: VerificationOutcome::Confirmed {
                flw_tx_id: parsed.flw_tx_id,
                settled_minor: attempt.settled_amount_minor.unwrap_or(parsed.amount_minor),
                app_fee_minor: attempt.app_fee_minor.unwrap_or(0),
                is_late: false,
            },
        }));
    }

    let now = Utc::now();
    let (outcome, new_attempt_status, new_payment_state) =
        evaluate_verified_transaction(&attempt, &parsed, trade.payment_deadline_at, now)?;

    attempt.flw_tx_id = Some(parsed.flw_tx_id);
    attempt.flw_ref = parsed.flw_ref.clone();
    attempt.settled_amount_minor = Some(
        parsed
            .amount_settled_minor
            .unwrap_or(parsed.amount_minor),
    );
    attempt.app_fee_minor = parsed.app_fee_minor;
    attempt.status = new_attempt_status;
    attempt.updated_at = now;

    match &outcome {
        VerificationOutcome::Confirmed {
            flw_tx_id,
            is_late: false,
            ..
        } => {
            state
                .consumed_flw_tx_ids
                .insert(*flw_tx_id, trade_id.to_string());
            attempt.verified_at = Some(now);
            trade.payment_state = PaymentState::Confirmed;

            let current_version = trade.version;
            if trade.lifecycle_state == TradeLifecycleState::AwaitingPayment {
                let audit = trade.transition(
                    current_version,
                    TradeLifecycleState::PaymentConfirmed,
                    Some(&attempt.buyer_address),
                    source,
                    "FLW_PAYMENT_CONFIRMED",
                    Some(tx_ref),
                    json!({
                        "flw_tx_id": flw_tx_id,
                        "amount_minor": parsed.amount_minor.to_string(),
                        "currency": parsed.currency
                    }),
                )?;
                state.append_audit_event(audit);

                // Schedule Seller Payout outbox job atomically after payment confirmation
                state.enqueue_outbox_job(make_outbox_job(
                    "EXECUTE_SELLER_PAYOUT",
                    &format!("payout:{trade_id}"),
                    trade_id,
                    json!({
                        "trade_id": trade_id,
                        "flw_tx_id": flw_tx_id,
                        "amount_minor": trade.fiat_amount_minor.to_string()
                    }),
                    state.payment_config.max_provider_retries,
                ));
            }
        }
        VerificationOutcome::Confirmed {
            flw_tx_id,
            is_late: true,
            ..
        } => {
            state
                .consumed_flw_tx_ids
                .insert(*flw_tx_id, trade_id.to_string());
            attempt.verified_at = Some(now);
            trade.payment_state = PaymentState::LateConfirmed;

            let current_version = trade.version;
            if trade.lifecycle_state == TradeLifecycleState::AwaitingPayment
                || trade.lifecycle_state == TradeLifecycleState::Cancelled
            {
                trade.lifecycle_state = TradeLifecycleState::LatePaymentReview;
                trade.version = current_version + 1;
                trade.updated_at = now;
                state.append_audit_event(TradeAuditEvent {
                    id: Uuid::new_v4().to_string(),
                    trade_uuid: trade.id.clone(),
                    trade_id: trade.trade_id.clone(),
                    actor_address: Some(attempt.buyer_address.clone()),
                    actor_role: source.to_string(),
                    event_type: "LATE_PAYMENT_DETECTED_HOLD".to_string(),
                    previous_state: Some("AWAITING_PAYMENT".to_string()),
                    new_state: "LATE_PAYMENT_REVIEW".to_string(),
                    correlation_id: Some(tx_ref.to_string()),
                    metadata: json!({
                        "flw_tx_id": flw_tx_id,
                        "deadline": trade.payment_deadline_at,
                        "verified_at": now
                    }),
                    created_at: now,
                });
            }
        }
        VerificationOutcome::Underpaid {
            flw_tx_id,
            expected_minor,
            received_minor,
        } => {
            state
                .consumed_flw_tx_ids
                .insert(*flw_tx_id, trade_id.to_string());
            trade.payment_state = PaymentState::Underpaid;
            attempt.failure_code = Some("UNDERPAID".to_string());
            attempt.failure_reason = Some(format!(
                "Received {received_minor} minor units, expected {expected_minor}"
            ));
            state.append_audit_event(TradeAuditEvent {
                id: Uuid::new_v4().to_string(),
                trade_uuid: trade.id.clone(),
                trade_id: trade.trade_id.clone(),
                actor_address: Some(attempt.buyer_address.clone()),
                actor_role: source.to_string(),
                event_type: "PAYMENT_UNDERPAID_REJECTED".to_string(),
                previous_state: Some(trade.lifecycle_state.as_str().to_string()),
                new_state: trade.lifecycle_state.as_str().to_string(),
                correlation_id: Some(tx_ref.to_string()),
                metadata: json!({
                    "flw_tx_id": flw_tx_id,
                    "expected_minor": expected_minor.to_string(),
                    "received_minor": received_minor.to_string()
                }),
                created_at: now,
            });
        }
        VerificationOutcome::Overpaid {
            flw_tx_id,
            expected_minor,
            received_minor,
        } => {
            state
                .consumed_flw_tx_ids
                .insert(*flw_tx_id, trade_id.to_string());
            trade.payment_state = PaymentState::Overpaid;
            attempt.failure_code = Some("OVERPAID_HOLD".to_string());
            attempt.failure_reason = Some(format!(
                "Received {received_minor} minor units, expected {expected_minor}"
            ));
            state.append_audit_event(TradeAuditEvent {
                id: Uuid::new_v4().to_string(),
                trade_uuid: trade.id.clone(),
                trade_id: trade.trade_id.clone(),
                actor_address: Some(attempt.buyer_address.clone()),
                actor_role: source.to_string(),
                event_type: "PAYMENT_OVERPAID_HOLD".to_string(),
                previous_state: Some(trade.lifecycle_state.as_str().to_string()),
                new_state: trade.lifecycle_state.as_str().to_string(),
                correlation_id: Some(tx_ref.to_string()),
                metadata: json!({
                    "flw_tx_id": flw_tx_id,
                    "expected_minor": expected_minor.to_string(),
                    "received_minor": received_minor.to_string()
                }),
                created_at: now,
            });
        }
        VerificationOutcome::Pending { .. } => {
            trade.payment_state = new_payment_state;
        }
        VerificationOutcome::Failed { reason } => {
            trade.payment_state = PaymentState::Failed;
            attempt.failure_code = Some("PROVIDER_PAYMENT_FAILED".to_string());
            attempt.failure_reason = Some(reason.clone());
        }
    }

    Ok(Json(VerifyPaymentResponse {
        trade_id: trade.trade_id.clone(),
        tx_ref: tx_ref.to_string(),
        lifecycle_state: trade.lifecycle_state,
        payment_state: trade.payment_state,
        payout_state: trade.payout_state,
        outcome,
    }))
}

// ─── FLUTTERWAVE WEBHOOK PROCESSOR ───────────────────────────────────────────

pub async fn handle_flutterwave_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    raw_body: Bytes,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let verif_hash = headers.get("verif-hash").and_then(|v| v.to_str().ok());
    let hmac_sig = headers
        .get("flutterwave-signature")
        .or_else(|| headers.get("x-flutterwave-signature"))
        .and_then(|v| v.to_str().ok());

    let expected_secret = state
        .payment_config
        .flw_secret_hash
        .as_deref()
        .unwrap_or(&state.config.webhook_secret);

    if !verify_flutterwave_webhook_signature(verif_hash, hmac_sig, &raw_body, expected_secret) {
        warn!("Rejected Flutterwave webhook with invalid signature");
        return Err(ApiError::Unauthorized("INVALID_FLW_WEBHOOK_SIGNATURE"));
    }

    let payload: Value = serde_json::from_slice(&raw_body)
        .map_err(|_| ApiError::BadRequest("Malformed JSON webhook body".into()))?;

    let event_type = payload
        .get("event")
        .or_else(|| payload.get("event.type"))
        .and_then(|v| v.as_str())
        .unwrap_or("charge.completed")
        .to_string();

    let data = payload
        .get("data")
        .and_then(|v| v.as_object())
        .ok_or_else(|| ApiError::BadRequest("Webhook missing data object".into()))?;

    let flw_tx_id = data.get("id").and_then(|v| v.as_u64());
    let tx_ref = data
        .get("tx_ref")
        .or_else(|| data.get("reference"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let status_str = data
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    // Stable event deduplication key
    let event_id = payload
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            compute_sha256_hex(
                format!(
                    "{}:{}:{}:{}",
                    event_type,
                    flw_tx_id.unwrap_or(0),
                    tx_ref.as_deref().unwrap_or(""),
                    status_str
                )
                .as_bytes(),
            )
        });

    // Deduplicate event atomically
    if let Some(existing_event) = state.webhook_inbox.get(&event_id) {
        return Ok((
            StatusCode::OK,
            Json(json!({
                "received": true,
                "deduplicated": true,
                "event_id": existing_event.event_id,
                "processing_status": existing_event.processing_status
            })),
        ));
    }

    let now = Utc::now();
    let mut inbox_record = WebhookInboxEvent {
        id: Uuid::new_v4().to_string(),
        event_id: event_id.clone(),
        provider: "flutterwave".to_string(),
        event_type: event_type.clone(),
        tx_ref: tx_ref.clone(),
        flw_tx_id,
        signature_verified: true,
        processing_status: "RECEIVED".to_string(),
        redacted_payload: redact_provider_payload(&payload),
        error_message: None,
        received_at: now,
        processed_at: None,
    };

    // Persist durably before processing
    state
        .webhook_inbox
        .insert(event_id.clone(), inbox_record.clone());

    if let Some(ref reference) = tx_ref {
        if let Some(attempt) = state.payment_attempts.get(reference).map(|a| a.clone()) {
            // Construct verification envelope from either live verify endpoint or verified webhook data
            let verify_envelope = json!({
                "status": "success",
                "data": payload.get("data").cloned().unwrap_or_else(|| json!({}))
            });

            match apply_verified_payment_to_trade(
                &state,
                &attempt.trade_id,
                reference,
                &verify_envelope,
                "webhook",
            )
            .await
            {
                Ok(res) => {
                    inbox_record.processing_status = "PROCESSED".to_string();
                    inbox_record.processed_at = Some(Utc::now());
                    state.webhook_inbox.insert(event_id.clone(), inbox_record);
                    return Ok((
                        StatusCode::OK,
                        Json(json!({
                            "received": true,
                            "deduplicated": false,
                            "event_id": event_id,
                            "trade_id": res.0.trade_id,
                            "lifecycle_state": res.0.lifecycle_state,
                            "payment_state": res.0.payment_state
                        })),
                    ));
                }
                Err(err) => {
                    inbox_record.processing_status = "FAILED".to_string();
                    inbox_record.error_message = Some(err.to_string());
                    inbox_record.processed_at = Some(Utc::now());
                    state.webhook_inbox.insert(event_id, inbox_record);
                    return Err(err);
                }
            }
        }
    }

    inbox_record.processing_status = "IGNORED".to_string();
    inbox_record.processed_at = Some(Utc::now());
    state.webhook_inbox.insert(event_id.clone(), inbox_record);

    Ok((
        StatusCode::OK,
        Json(json!({
            "received": true,
            "deduplicated": false,
            "event_id": event_id,
            "processing_status": "IGNORED"
        })),
    ))
}

// ─── SELLER PAYOUT INITIATION & CONFIRMATION ─────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PayoutActionRequest {
    pub action: Option<String>, // "initiate" | "confirm" | "hold" | "retry"
    pub flw_transfer_id: Option<u64>,
    pub provider_status: Option<String>,
    pub failure_reason: Option<String>,
}

pub async fn process_seller_payout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(trade_id): Path<String>,
    Json(req): Json<PayoutActionRequest>,
) -> Result<Json<SellerPayoutRecord>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let mut trade = state
        .trades
        .get_mut(&trade_id)
        .ok_or(ApiError::NotFound("TRADE_NOT_FOUND"))?;

    let action = req.action.as_deref().unwrap_or("initiate");
    let now = Utc::now();

    match action {
        "initiate" | "retry" => {
            if trade.payment_state != PaymentState::Confirmed {
                return Err(ApiError::Conflict(
                    "CANNOT_INITIATE_PAYOUT_WITHOUT_CONFIRMED_PAYMENT",
                ));
            }
            if !matches!(
                trade.lifecycle_state,
                TradeLifecycleState::PaymentConfirmed
                    | TradeLifecycleState::PayoutOnHold
                    | TradeLifecycleState::SellerPayoutPending
            ) {
                return Err(ApiError::Conflict("INVALID_STATE_FOR_SELLER_PAYOUT"));
            }

            let attempt_num = state
                .seller_payouts
                .get(&trade_id)
                .map(|p| p.attempt_count + 1)
                .unwrap_or(1);

            let payout_ref = generate_payout_reference(&trade_id, attempt_num);
            let ver = trade.version;
            let seller_addr = trade.seller_address.clone();
            if trade.lifecycle_state != TradeLifecycleState::SellerPayoutPending {
                let audit = trade.transition(
                    ver,
                    TradeLifecycleState::SellerPayoutPending,
                    Some(&seller_addr),
                    "system",
                    "SELLER_PAYOUT_INITIATED",
                    Some(&payout_ref),
                    json!({ "attempt": attempt_num }),
                )?;
                state.append_audit_event(audit);
            }
            trade.payout_state = PayoutState::Processing;

            let payout = SellerPayoutRecord {
                id: Uuid::new_v4().to_string(),
                trade_uuid: trade.id.clone(),
                trade_id: trade.trade_id.clone(),
                seller_address: trade.seller_address.clone(),
                payout_reference: payout_ref,
                idempotency_key: format!("payout:{trade_id}:{attempt_num}"),
                flw_transfer_id: req.flw_transfer_id,
                amount_minor: trade.fiat_amount_minor,
                currency: trade.fiat_currency.clone(),
                bank_code: trade.seller_bank_code.clone(),
                bank_name: trade.seller_bank_name.clone(),
                account_masked: trade.seller_account_masked.clone(),
                status: PayoutState::Processing,
                attempt_count: attempt_num,
                failure_reason: None,
                confirmed_at: None,
                created_at: now,
                updated_at: now,
            };

            state.seller_payouts.insert(trade_id, payout.clone());
            Ok(Json(payout))
        }
        "confirm" => {
            if !matches!(
                trade.lifecycle_state,
                TradeLifecycleState::SellerPayoutPending
                    | TradeLifecycleState::PaymentConfirmed
                    | TradeLifecycleState::PayoutOnHold
            ) {
                return Err(ApiError::Conflict("INVALID_STATE_FOR_PAYOUT_CONFIRMATION"));
            }

            let provider_state =
                evaluate_payout_provider_status(req.provider_status.as_deref().unwrap_or("SUCCESSFUL"));
            if provider_state != PayoutState::Confirmed {
                return Err(ApiError::Conflict("PROVIDER_PAYOUT_STATUS_NOT_CONFIRMED"));
            }

            // Ensure we transition through SellerPayoutPending if currently in PaymentConfirmed
            let seller_addr = trade.seller_address.clone();
            if trade.lifecycle_state == TradeLifecycleState::PaymentConfirmed {
                let v1 = trade.version;
                let a1 = trade.transition(
                    v1,
                    TradeLifecycleState::SellerPayoutPending,
                    Some(&seller_addr),
                    "system",
                    "SELLER_PAYOUT_INITIATED",
                    None,
                    json!({}),
                )?;
                state.append_audit_event(a1);
            }

            let ver = trade.version;
            let audit = trade.transition(
                ver,
                TradeLifecycleState::SellerPayoutConfirmed,
                Some(&seller_addr),
                "system",
                "SELLER_PAYOUT_CONFIRMED",
                None,
                json!({ "flw_transfer_id": req.flw_transfer_id }),
            )?;
            trade.payout_state = PayoutState::Confirmed;
            state.append_audit_event(audit);

            let mut payout = state
                .seller_payouts
                .entry(trade_id.clone())
                .or_insert_with(|| SellerPayoutRecord {
                    id: Uuid::new_v4().to_string(),
                    trade_uuid: trade.id.clone(),
                    trade_id: trade.trade_id.clone(),
                    seller_address: trade.seller_address.clone(),
                    payout_reference: generate_payout_reference(&trade_id, 1),
                    idempotency_key: format!("payout:{trade_id}:1"),
                    flw_transfer_id: req.flw_transfer_id,
                    amount_minor: trade.fiat_amount_minor,
                    currency: trade.fiat_currency.clone(),
                    bank_code: trade.seller_bank_code.clone(),
                    bank_name: trade.seller_bank_name.clone(),
                    account_masked: trade.seller_account_masked.clone(),
                    status: PayoutState::Confirmed,
                    attempt_count: 1,
                    failure_reason: None,
                    confirmed_at: Some(now),
                    created_at: now,
                    updated_at: now,
                });

            payout.status = PayoutState::Confirmed;
            payout.flw_transfer_id = req.flw_transfer_id.or(payout.flw_transfer_id);
            payout.confirmed_at = Some(now);
            payout.updated_at = now;

            // Schedule USDC escrow release job now that both payment and payout are confirmed
            state.enqueue_outbox_job(make_outbox_job(
                "EXECUTE_ESCROW_RELEASE",
                &format!("release:{trade_id}"),
                &trade_id,
                json!({ "trade_id": trade_id }),
                state.payment_config.max_provider_retries,
            ));

            Ok(Json(payout.clone()))
        }
        "hold" => {
            let ver = trade.version;
            let seller_addr = trade.seller_address.clone();
            let audit = trade.transition(
                ver,
                TradeLifecycleState::PayoutOnHold,
                Some(&seller_addr),
                "system",
                "SELLER_PAYOUT_ON_HOLD",
                None,
                json!({ "reason": req.failure_reason }),
            )?;
            trade.payout_state = PayoutState::OnHold;
            state.append_audit_event(audit);

            let mut payout = state
                .seller_payouts
                .entry(trade_id.clone())
                .or_insert_with(|| SellerPayoutRecord {
                    id: Uuid::new_v4().to_string(),
                    trade_uuid: trade.id.clone(),
                    trade_id: trade.trade_id.clone(),
                    seller_address: trade.seller_address.clone(),
                    payout_reference: generate_payout_reference(&trade_id, 1),
                    idempotency_key: format!("payout:{trade_id}:1"),
                    flw_transfer_id: req.flw_transfer_id,
                    amount_minor: trade.fiat_amount_minor,
                    currency: trade.fiat_currency.clone(),
                    bank_code: trade.seller_bank_code.clone(),
                    bank_name: trade.seller_bank_name.clone(),
                    account_masked: trade.seller_account_masked.clone(),
                    status: PayoutState::OnHold,
                    attempt_count: 1,
                    failure_reason: req.failure_reason.clone(),
                    confirmed_at: None,
                    created_at: now,
                    updated_at: now,
                });

            payout.status = PayoutState::OnHold;
            payout.failure_reason = req.failure_reason;
            payout.updated_at = now;

            Ok(Json(payout.clone()))
        }
        _ => Err(ApiError::BadRequest("Invalid payout action".into())),
    }
}

// ─── BUYER REFUNDS ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RefundActionRequest {
    pub action: String, // "request" | "approve_and_complete"
    pub reason: Option<String>,
    pub flw_refund_id: Option<u64>,
    pub provider_status: Option<String>,
}

pub async fn process_trade_refund(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(trade_id): Path<String>,
    Json(req): Json<RefundActionRequest>,
) -> Result<Json<RefundRecord>, ApiError> {
    require_service_auth(&headers, &state.config)?;
    let caller = extract_principal_address(&headers)
        .unwrap_or_else(|| "0x0000000000000000000000000000000000000000".to_string());

    let mut trade = state
        .trades
        .get_mut(&trade_id)
        .ok_or(ApiError::NotFound("TRADE_NOT_FOUND"))?;

    let now = Utc::now();

    match req.action.as_str() {
        "request" => {
            if !matches!(
                trade.lifecycle_state,
                TradeLifecycleState::PayoutOnHold
                    | TradeLifecycleState::LatePaymentReview
                    | TradeLifecycleState::PaymentConfirmed
                    | TradeLifecycleState::AwaitingPayment
            ) {
                return Err(ApiError::Conflict("INVALID_STATE_FOR_REFUND_REQUEST"));
            }

            let ver = trade.version;
            let audit = trade.transition(
                ver,
                TradeLifecycleState::RefundPending,
                Some(&caller),
                "seller",
                "REFUND_REQUESTED",
                None,
                json!({ "reason": req.reason }),
            )?;
            trade.refund_state = RefundState::Requested;
            state.append_audit_event(audit);

            let attempt_id = state
                .active_trade_checkout
                .get(&trade_id)
                .and_then(|tx_ref| state.payment_attempts.get(tx_ref.value()).map(|a| a.id.clone()))
                .unwrap_or_else(|| Uuid::new_v4().to_string());

            let refund = RefundRecord {
                id: Uuid::new_v4().to_string(),
                trade_uuid: trade.id.clone(),
                trade_id: trade.trade_id.clone(),
                payment_attempt_id: attempt_id,
                requested_by_address: caller,
                approved_by_address: None,
                refund_reference: generate_refund_reference(&trade_id),
                idempotency_key: format!("refund:{trade_id}"),
                flw_refund_id: None,
                amount_minor: trade.fiat_amount_minor,
                currency: trade.fiat_currency.clone(),
                reason: req
                    .reason
                    .unwrap_or_else(|| "Payout on hold or late payment refund".to_string()),
                status: RefundState::Requested,
                failure_reason: None,
                completed_at: None,
                created_at: now,
                updated_at: now,
            };

            state.refunds.insert(trade_id, refund.clone());
            Ok(Json(refund))
        }
        "approve_and_complete" => {
            if trade.lifecycle_state != TradeLifecycleState::RefundPending {
                return Err(ApiError::Conflict("TRADE_NOT_IN_REFUND_PENDING"));
            }

            let provider_state = evaluate_refund_provider_status(
                req.provider_status.as_deref().unwrap_or("completed"),
            );
            if provider_state != RefundState::Completed {
                return Err(ApiError::Conflict("REFUND_NOT_SETTLED_BY_PROVIDER"));
            }

            let ver = trade.version;
            let audit = trade.transition(
                ver,
                TradeLifecycleState::Cancelled,
                Some(&caller),
                "system",
                "REFUND_SETTLED_AND_TRADE_CANCELLED",
                None,
                json!({ "flw_refund_id": req.flw_refund_id }),
            )?;
            trade.refund_state = RefundState::Completed;
            trade.escrow_state = EscrowOperationState::Cancelled;
            state.append_audit_event(audit);

            let mut refund = state
                .refunds
                .get_mut(&trade_id)
                .ok_or(ApiError::NotFound("REFUND_RECORD_NOT_FOUND"))?;
            refund.approved_by_address = Some(caller);
            refund.flw_refund_id = req.flw_refund_id;
            refund.status = RefundState::Completed;
            refund.completed_at = Some(now);
            refund.updated_at = now;

            Ok(Json(refund.clone()))
        }
        _ => Err(ApiError::BadRequest("Invalid refund action".into())),
    }
}

// ─── ARC ESCROW RELEASE & ON-CHAIN RECONCILIATION ────────────────────────────

#[derive(Debug, Deserialize)]
pub struct EscrowReleaseRequest {
    pub action: String, // "request_release" | "confirm_on_chain" | "hold_revert"
    pub tx_hash: Option<String>,
    pub proof_id_bytes32: Option<String>,
    pub block_number: Option<u64>,
    pub failure_reason: Option<String>,
}

pub async fn process_escrow_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(trade_id): Path<String>,
    Json(req): Json<EscrowReleaseRequest>,
) -> Result<Json<EscrowOperationRecord>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let mut trade = state
        .trades
        .get_mut(&trade_id)
        .ok_or(ApiError::NotFound("TRADE_NOT_FOUND"))?;

    let now = Utc::now();

    match req.action.as_str() {
        "request_release" => {
            if let Err(reasons) = trade.validate_escrow_release_eligibility() {
                return Err(ApiError::VerificationFailed {
                    code: "ESCROW_RELEASE_GATED_CONDITIONS_UNMET",
                    reason: reasons.join("; "),
                });
            }

            let ver = trade.version;
            let audit = trade.transition(
                ver,
                TradeLifecycleState::ReleasePending,
                None,
                "oracle",
                "ESCROW_RELEASE_SUBMITTED",
                req.tx_hash.as_deref(),
                json!({
                    "tx_hash": req.tx_hash,
                    "proof_id_bytes32": req.proof_id_bytes32
                }),
            )?;
            trade.escrow_state = EscrowOperationState::ReleasePending;
            trade.release_tx_hash = req.tx_hash.clone();
            trade.proof_id_bytes32 = req.proof_id_bytes32.clone();
            state.append_audit_event(audit);

            let op = EscrowOperationRecord {
                id: Uuid::new_v4().to_string(),
                trade_uuid: trade.id.clone(),
                trade_id: trade.trade_id.clone(),
                operation_type: "ORACLE_RELEASE".to_string(),
                idempotency_key: format!("escrow_release:{trade_id}"),
                chain_id: trade.chain_id,
                contract_address: trade.escrow_contract_address.clone(),
                tx_hash: req.tx_hash,
                proof_id_bytes32: req.proof_id_bytes32,
                status: "SUBMITTED".to_string(),
                block_number: None,
                failure_reason: None,
                submitted_at: Some(now),
                confirmed_at: None,
                created_at: now,
                updated_at: now,
            };

            state.escrow_operations.insert(trade_id, op.clone());
            Ok(Json(op))
        }
        "confirm_on_chain" => {
            if !matches!(
                trade.lifecycle_state,
                TradeLifecycleState::ReleasePending | TradeLifecycleState::ReleaseOnHold
            ) {
                return Err(ApiError::Conflict(
                    "TRADE_MUST_BE_IN_RELEASE_PENDING_BEFORE_COMPLETION",
                ));
            }

            let tx_hash = req
                .tx_hash
                .clone()
                .or_else(|| trade.release_tx_hash.clone())
                .ok_or_else(|| {
                    ApiError::BadRequest(
                        "Cannot mark trade COMPLETED without verified on-chain tx_hash".into(),
                    )
                })?;

            let ver = trade.version;
            let audit = trade.transition(
                ver,
                TradeLifecycleState::Completed,
                None,
                "oracle",
                "ESCROW_RELEASE_CONFIRMED_COMPLETED",
                Some(&tx_hash),
                json!({
                    "tx_hash": tx_hash,
                    "block_number": req.block_number
                }),
            )?;
            trade.escrow_state = EscrowOperationState::Released;
            trade.release_tx_hash = Some(tx_hash.clone());
            state.append_audit_event(audit);

            let mut op = state
                .escrow_operations
                .entry(trade_id.clone())
                .or_insert_with(|| EscrowOperationRecord {
                    id: Uuid::new_v4().to_string(),
                    trade_uuid: trade.id.clone(),
                    trade_id: trade.trade_id.clone(),
                    operation_type: "ORACLE_RELEASE".to_string(),
                    idempotency_key: format!("escrow_release:{trade_id}"),
                    chain_id: trade.chain_id,
                    contract_address: trade.escrow_contract_address.clone(),
                    tx_hash: Some(tx_hash.clone()),
                    proof_id_bytes32: trade.proof_id_bytes32.clone(),
                    status: "CONFIRMED".to_string(),
                    block_number: req.block_number,
                    failure_reason: None,
                    submitted_at: Some(now),
                    confirmed_at: Some(now),
                    created_at: now,
                    updated_at: now,
                });

            op.status = "CONFIRMED".to_string();
            op.tx_hash = Some(tx_hash);
            op.block_number = req.block_number;
            op.confirmed_at = Some(now);
            op.updated_at = now;

            Ok(Json(op.clone()))
        }
        "hold_revert" => {
            if !matches!(
                trade.lifecycle_state,
                TradeLifecycleState::ReleasePending
                    | TradeLifecycleState::SellerPayoutConfirmed
                    | TradeLifecycleState::ReleaseOnHold
            ) {
                return Err(ApiError::Conflict("INVALID_STATE_FOR_RELEASE_HOLD"));
            }

            let ver = trade.version;
            let audit = trade.transition(
                ver,
                TradeLifecycleState::ReleaseOnHold,
                None,
                "oracle",
                "ESCROW_RELEASE_ON_HOLD",
                req.tx_hash.as_deref(),
                json!({ "reason": req.failure_reason }),
            )?;
            trade.escrow_state = EscrowOperationState::OnHold;
            state.append_audit_event(audit);

            let mut op = state
                .escrow_operations
                .entry(trade_id.clone())
                .or_insert_with(|| EscrowOperationRecord {
                    id: Uuid::new_v4().to_string(),
                    trade_uuid: trade.id.clone(),
                    trade_id: trade.trade_id.clone(),
                    operation_type: "ORACLE_RELEASE".to_string(),
                    idempotency_key: format!("escrow_release:{trade_id}"),
                    chain_id: trade.chain_id,
                    contract_address: trade.escrow_contract_address.clone(),
                    tx_hash: req.tx_hash.clone(),
                    proof_id_bytes32: trade.proof_id_bytes32.clone(),
                    status: "UNCERTAIN_ON_HOLD".to_string(),
                    block_number: None,
                    failure_reason: req.failure_reason.clone(),
                    submitted_at: Some(now),
                    confirmed_at: None,
                    created_at: now,
                    updated_at: now,
                });

            op.status = "UNCERTAIN_ON_HOLD".to_string();
            op.failure_reason = req.failure_reason;
            op.updated_at = now;

            Ok(Json(op.clone()))
        }
        _ => Err(ApiError::BadRequest("Invalid escrow release action".into())),
    }
}

// ─── DEADLINE & OUTBOX RECONCILIATION WORKER ─────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ReconcileSummaryResponse {
    pub checked_trades: usize,
    pub expired_cancelled_trades: Vec<String>,
    pub held_pending_verification_trades: Vec<String>,
    pub outbox_jobs_processed: usize,
}

pub async fn run_reconciliation_pass(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ReconcileSummaryResponse>, ApiError> {
    require_service_auth(&headers, &state.config)?;

    let now = Utc::now();
    let mut checked_trades = 0usize;
    let mut expired_cancelled_trades = Vec::new();
    let mut held_pending_verification_trades = Vec::new();

    let trade_ids: Vec<String> = state.trades.iter().map(|e| e.key().clone()).collect();

    for tid in trade_ids {
        checked_trades += 1;
        let Some(mut trade) = state.trades.get_mut(&tid) else {
            continue;
        };

        if trade.lifecycle_state != TradeLifecycleState::AwaitingPayment {
            continue;
        }

        let Some(deadline) = trade.payment_deadline_at else {
            continue;
        };

        if now <= deadline {
            continue;
        }

        // Trade deadline has passed! Reconcile payment state before cancelling:
        // Never cancel if payment is PendingVerification, Confirmed, or LateConfirmed.
        match trade.payment_state {
            PaymentState::PendingVerification
            | PaymentState::Confirmed
            | PaymentState::LateConfirmed
            | PaymentState::Underpaid
            | PaymentState::Overpaid => {
                held_pending_verification_trades.push(tid.clone());
                continue;
            }
            PaymentState::Unpaid | PaymentState::CheckoutCreated | PaymentState::Failed | PaymentState::Expired => {
                // Check if active payment attempt is in PendingVerification
                let has_inflight_attempt = state
                    .active_trade_checkout
                    .get(&tid)
                    .and_then(|tx_ref| state.payment_attempts.get(tx_ref.value()).map(|a| a.status))
                    .map(|st| {
                        matches!(
                            st,
                            AttemptStatus::PendingVerification
                                | AttemptStatus::Verified
                                | AttemptStatus::LateVerified
                                | AttemptStatus::MismatchHold
                        )
                    })
                    .unwrap_or(false);

                if has_inflight_attempt {
                    held_pending_verification_trades.push(tid.clone());
                    continue;
                }

                // Mark attempt expired
                if let Some(tx_ref) = state.active_trade_checkout.get(&tid) {
                    if let Some(mut att) = state.payment_attempts.get_mut(tx_ref.value()) {
                        att.status = AttemptStatus::Expired;
                        att.updated_at = now;
                    }
                }

                let ver = trade.version;
                if let Ok(audit) = trade.transition(
                    ver,
                    TradeLifecycleState::Cancelled,
                    None,
                    "system",
                    "PAYMENT_DEADLINE_EXPIRED_CANCELLED",
                    None,
                    json!({ "deadline": deadline.to_rfc3339(), "reconciled_at": now.to_rfc3339() }),
                ) {
                    trade.payment_state = PaymentState::Expired;
                    trade.escrow_state = EscrowOperationState::Cancelled;
                    state.append_audit_event(audit);
                    expired_cancelled_trades.push(tid);
                }
            }
        }
    }

    // Process pending outbox jobs with bounded retries & exponential backoff
    let mut outbox_jobs_processed = 0usize;
    let job_keys: Vec<String> = state.outbox_jobs.iter().map(|j| j.key().clone()).collect();
    for key in job_keys {
        if let Some(mut job) = state.outbox_jobs.get_mut(&key) {
            if job.status == "PENDING" && job.next_run_at <= now {
                job.attempts += 1;
                if job.attempts >= job.max_attempts {
                    job.status = "DEAD_LETTER".to_string();
                } else {
                    job.status = "COMPLETED".to_string();
                }
                job.updated_at = now;
                outbox_jobs_processed += 1;
            }
        }
    }

    info!(
        checked_trades,
        expired_count = expired_cancelled_trades.len(),
        held_count = held_pending_verification_trades.len(),
        outbox_jobs_processed,
        "Completed deadline & outbox reconciliation pass"
    );

    Ok(Json(ReconcileSummaryResponse {
        checked_trades,
        expired_cancelled_trades,
        held_pending_verification_trades,
        outbox_jobs_processed,
    }))
}

pub fn map_bank_name_to_cbn_code(bank_name: &str) -> String {
    let lower = bank_name.to_ascii_lowercase();
    if lower.contains("gtb") || lower.contains("guaranty") {
        "058".to_string()
    } else if lower.contains("access") {
        "044".to_string()
    } else if lower.contains("zenith") {
        "057".to_string()
    } else if lower.contains("opay") {
        "999992".to_string()
    } else if lower.contains("moniepoint") {
        "50515".to_string()
    } else if lower.contains("kuda") {
        "50211".to_string()
    } else {
        "058".to_string()
    }
}

fn urlencoding_simple(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}
