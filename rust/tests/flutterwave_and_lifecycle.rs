use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use chrono::{Duration as ChronoDuration, Utc};
use http_body_util::BodyExt;
use k256::ecdsa::SigningKey;
use serde_json::{json, Value};
use tower::ServiceExt;

use tlsn_service::{
    api::build_router,
    config::AppConfig,
    flutterwave::{
        minor_units_to_decimal_string, parse_decimal_to_minor_units,
        verify_flutterwave_webhook_signature, PaymentConfig,
    },
    lifecycle::{PayoutState, RefundState, TradeLifecycleState},
    state::AppState,
    wallet_auth::compute_eip191_digest,
};

fn test_state() -> AppState {
    let cfg = AppConfig {
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        service_api_key: "super_secret_service_api_key_32_bytes".to_string(),
        webhook_secret: "super_secret_webhook_secret_32_bytes".to_string(),
        webhook_url: None,
        notary_signing_key_hex: "2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a"
            .to_string(),
        allowed_hostnames: vec!["tlsnotary.org".to_string(), "api.gtbank.com".to_string()],
        expected_chain_id: 5042002,
        expected_escrow_address: "0x5042f1114c6f272f5909f16510399986ef0d734d".to_string(),
        max_proof_bytes: 512 * 1024,
        session_ttl_secs: 900,
        max_transcript_age_secs: 3600,
    };

    let mut pay_cfg = PaymentConfig::default();
    pay_cfg.flw_secret_hash = Some("flw_test_webhook_secret_hash_2026".to_string());
    pay_cfg.flw_secret_key = None; // deterministic local checkout mode
    pay_cfg.trade_payment_timeout_minutes = 20;

    AppState::with_payment_config(cfg, pay_cfg)
}

fn sign_eip191_message(priv_key_bytes: &[u8; 32], message: &str) -> (String, String) {
    let signing_key = SigningKey::from_bytes(priv_key_bytes.into()).unwrap();
    let verifying_key = signing_key.verifying_key();
    let uncompressed = verifying_key.to_encoded_point(false);
    let pub_bytes = uncompressed.as_bytes();

    use tiny_keccak::{Hasher, Keccak};
    let mut keccak = Keccak::v256();
    keccak.update(&pub_bytes[1..]);
    let mut addr_hash = [0u8; 32];
    keccak.finalize(&mut addr_hash);
    let address = format!("0x{}", hex::encode(&addr_hash[12..]));

    let digest = compute_eip191_digest(message);
    let (sig, rec_id) = signing_key.sign_prehash_recoverable(&digest).unwrap();
    let mut sig_bytes = [0u8; 65];
    sig_bytes[..64].copy_from_slice(&sig.to_bytes());
    sig_bytes[64] = rec_id.to_byte() + 27;

    (address, format!("0x{}", hex::encode(sig_bytes)))
}

#[test]
fn test_decimal_safe_monetary_parsing_and_formatting() {
    assert_eq!(parse_decimal_to_minor_units("500000").unwrap(), 50_000_000);
    assert_eq!(
        parse_decimal_to_minor_units("500,000.50").unwrap(),
        50_000_050
    );
    assert_eq!(parse_decimal_to_minor_units("1630.05").unwrap(), 163_005);
    assert_eq!(minor_units_to_decimal_string(50_000_050), "500000.50");
    assert!(parse_decimal_to_minor_units("-100.00").is_err());
    assert!(parse_decimal_to_minor_units("100.123").is_err());
}

#[test]
fn test_flutterwave_webhook_signature_verification_and_forgery_rejection() {
    let secret = "flw_test_webhook_secret_hash_2026";
    let body = br#"{"event":"charge.completed","data":{"id":1001,"tx_ref":"PN-FLW-1"}}"#;

    // 1. Valid verif-hash header passes
    assert!(verify_flutterwave_webhook_signature(
        Some(secret),
        None,
        body,
        secret
    ));

    // 2. Forged verif-hash header fails
    assert!(!verify_flutterwave_webhook_signature(
        Some("forged_hash_value"),
        None,
        body,
        secret
    ));

    // 3. Missing headers fail
    assert!(!verify_flutterwave_webhook_signature(
        None, None, body, secret
    ));
}

#[tokio::test]
async fn test_wallet_challenge_signature_verification_replay_and_username_onboarding() {
    let state = test_state();
    let auth_header = format!("Bearer {}", state.config.service_api_key);
    let app = build_router(state.clone());

    let priv_key = [0x42u8; 32];
    let (wallet_addr, _) = sign_eip191_message(&priv_key, "init");

    // 1. Request challenge nonce
    let ch_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/challenge")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "address": wallet_addr, "domain": "peernotary.io" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ch_res.status(), StatusCode::CREATED);
    let ch_body: Value = serde_json::from_slice(
        &ch_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    let nonce = ch_body["nonce"].as_str().unwrap().to_string();
    let message = ch_body["message"].as_str().unwrap().to_string();

    let (_, signature) = sign_eip191_message(&priv_key, &message);

    // 2. Verify wallet signature -> establishes session
    let ver_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/verify")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "address": wallet_addr,
                        "nonce": nonce,
                        "signature": signature
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ver_res.status(), StatusCode::OK);

    // 3. Replaying the same nonce must be rejected with 409 CONFLICT
    let replay_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/verify")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "address": wallet_addr,
                        "nonce": nonce,
                        "signature": signature
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(replay_res.status(), StatusCode::CONFLICT);

    // 4. Protected/reserved username ("admin") must be rejected
    let reserved_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/v1/users/username")
                .header("authorization", &auth_header)
                .header("x-wallet-address", &wallet_addr)
                .header("content-type", "application/json")
                .body(Body::from(json!({ "username": "admin" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(reserved_res.status(), StatusCode::FORBIDDEN);

    // 5. Valid username ("adebayo_fx") succeeds
    let valid_user_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/v1/users/username")
                .header("authorization", &auth_header)
                .header("x-wallet-address", &wallet_addr)
                .header("content-type", "application/json")
                .body(Body::from(json!({ "username": "adebayo_fx" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(valid_user_res.status(), StatusCode::OK);

    // 6. Another wallet attempting to claim "adebayo_fx" is rejected with 409 CONFLICT
    let other_wallet = "0x9999999999999999999999999999999999999999";
    let dup_user_res = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/v1/users/username")
                .header("authorization", &auth_header)
                .header("x-wallet-address", other_wallet)
                .header("content-type", "application/json")
                .body(Body::from(json!({ "username": "adebayo_fx" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(dup_user_res.status(), StatusCode::CONFLICT);
}

#[tokio::test]
async fn test_complete_trade_lifecycle_checkout_webhook_dedup_payout_and_gated_escrow_release() {
    let state = test_state();
    let auth_header = format!("Bearer {}", state.config.service_api_key);
    let flw_secret = state
        .payment_config
        .flw_secret_hash
        .clone()
        .unwrap();
    let app = build_router(state.clone());

    let seller = "0x1111111111111111111111111111111111111111";
    let buyer = "0x2222222222222222222222222222222222222222";
    let attacker = "0x3333333333333333333333333333333333333333";

    // 1. Register trade #701 (100 USDC @ 1630 NGN = 163,000.00 NGN = 16,300,000 kobo)
    let create_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "trade_id": "701",
                        "seller_address": seller,
                        "buyer_address": buyer,
                        "usdc_amount_units": 100_000_000u128,
                        "exchange_rate_minor": 163_000u128,
                        "fiat_currency": "NGN",
                        "seller_bank_name": "GTBank",
                        "seller_account_number": "0123456789"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create_res.status(), StatusCode::CREATED);

    // 2. Seller attempting to initialize checkout for their own trade must be forbidden
    let seller_checkout = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/checkout")
                .header("authorization", &auth_header)
                .header("x-wallet-address", seller)
                .header("content-type", "application/json")
                .body(Body::from(json!({}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(seller_checkout.status(), StatusCode::FORBIDDEN);

    // 3. Unrelated user attempting to access trade or initialize checkout must be forbidden
    let attacker_get = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/trades/701")
                .header("authorization", &auth_header)
                .header("x-wallet-address", attacker)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(attacker_get.status(), StatusCode::FORBIDDEN);

    // 4. Buyer initializes Flutterwave checkout
    let checkout_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/checkout")
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer)
                .header("content-type", "application/json")
                .body(Body::from(json!({}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(checkout_res.status(), StatusCode::CREATED);
    let checkout_body: Value = serde_json::from_slice(
        &checkout_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    let tx_ref = checkout_body["tx_ref"].as_str().unwrap().to_string();
    assert_eq!(checkout_body["expected_amount_minor"], "16300000");
    assert_eq!(checkout_body["expected_amount_display"], "163000.00");

    // 5. Duplicate checkout request returns the same active tx_ref idempotently
    let dup_checkout_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/checkout")
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer)
                .header("content-type", "application/json")
                .body(Body::from(json!({}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(dup_checkout_res.status(), StatusCode::OK);
    let dup_body: Value = serde_json::from_slice(
        &dup_checkout_res
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes(),
    )
    .unwrap();
    assert_eq!(dup_body["tx_ref"].as_str().unwrap(), tx_ref);

    // 6. Premature escrow release before payment & payout confirmation must be rejected
    let premature_release = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/escrow")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "action": "request_release",
                        "tx_hash": "0xaaaa"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(premature_release.status(), StatusCode::UNPROCESSABLE_ENTITY);

    // 7. Deliver authenticated Flutterwave webhook for successful payment
    let webhook_payload = json!({
        "id": "evt_flw_701_001",
        "event": "charge.completed",
        "data": {
            "id": 88442211u64,
            "tx_ref": tx_ref,
            "flw_ref": "FLW-MOCK-88442211",
            "amount": "163000.00",
            "amount_settled": "162185.00",
            "app_fee": "815.00",
            "currency": "NGN",
            "status": "successful",
            "meta": {
                "trade_id": "701",
                "buyer_address": buyer
            }
        }
    });

    let wh_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/webhooks/flutterwave")
                .header("verif-hash", &flw_secret)
                .header("content-type", "application/json")
                .body(Body::from(webhook_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(wh_res.status(), StatusCode::OK);
    let wh_body: Value = serde_json::from_slice(
        &wh_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(wh_body["lifecycle_state"], "PAYMENT_CONFIRMED");
    assert_eq!(wh_body["deduplicated"], false);

    // 8. Deliver duplicate webhook -> deduplicated without error or duplicate jobs
    let dup_wh_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/webhooks/flutterwave")
                .header("verif-hash", &flw_secret)
                .header("content-type", "application/json")
                .body(Body::from(webhook_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(dup_wh_res.status(), StatusCode::OK);
    let dup_wh_body: Value = serde_json::from_slice(
        &dup_wh_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(dup_wh_body["deduplicated"], true);

    // 9. Browser callback arriving after webhook is idempotent
    let cb_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/verify-payment")
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "tx_ref": tx_ref,
                        "flw_transaction_id": 88442211u64,
                        "provider_verification_payload": {
                            "status": "success",
                            "data": webhook_payload["data"]
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(cb_res.status(), StatusCode::OK);

    // 10. Initiate seller payout -> SELLER_PAYOUT_PENDING, then hold -> PAYOUT_ON_HOLD, then confirm -> SELLER_PAYOUT_CONFIRMED
    let payout_init = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/payout")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(json!({ "action": "initiate" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(payout_init.status(), StatusCode::OK);
    assert_eq!(
        state.trades.get("701").unwrap().lifecycle_state,
        TradeLifecycleState::SellerPayoutPending
    );

    let payout_hold = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/payout")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "action": "hold",
                        "failure_reason": "NIP destination bank switch timeout"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(payout_hold.status(), StatusCode::OK);
    assert_eq!(
        state.trades.get("701").unwrap().lifecycle_state,
        TradeLifecycleState::PayoutOnHold
    );

    let payout_confirm = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/payout")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "action": "confirm",
                        "flw_transfer_id": 550011u64,
                        "provider_status": "SUCCESSFUL"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(payout_confirm.status(), StatusCode::OK);
    assert_eq!(
        state.trades.get("701").unwrap().lifecycle_state,
        TradeLifecycleState::SellerPayoutConfirmed
    );
    assert_eq!(
        state.trades.get("701").unwrap().payout_state,
        PayoutState::Confirmed
    );

    // 11. Request Arc escrow release -> RELEASE_PENDING -> simulate revert -> RELEASE_ON_HOLD -> confirm -> COMPLETED
    let rel_req = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/escrow")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "action": "request_release",
                        "tx_hash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                        "proof_id_bytes32": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rel_req.status(), StatusCode::OK);
    assert_eq!(
        state.trades.get("701").unwrap().lifecycle_state,
        TradeLifecycleState::ReleasePending
    );

    let rel_hold = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/escrow")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "action": "hold_revert",
                        "failure_reason": "RPC nonce gap detected; awaiting receipt reconciliation"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rel_hold.status(), StatusCode::OK);
    assert_eq!(
        state.trades.get("701").unwrap().lifecycle_state,
        TradeLifecycleState::ReleaseOnHold
    );

    let rel_confirm = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/701/escrow")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "action": "confirm_on_chain",
                        "tx_hash": "0x9999567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                        "block_number": 102488u64
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rel_confirm.status(), StatusCode::OK);
    assert_eq!(
        state.trades.get("701").unwrap().lifecycle_state,
        TradeLifecycleState::Completed
    );
}

#[tokio::test]
async fn test_underpayment_late_payment_recovery_and_refund_flow() {
    let state = test_state();
    let auth_header = format!("Bearer {}", state.config.service_api_key);
    let app = build_router(state.clone());

    let seller = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let buyer = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    // Create trade #702
    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "trade_id": "702",
                        "seller_address": seller,
                        "buyer_address": buyer,
                        "usdc_amount_units": 50_000_000u128,
                        "exchange_rate_minor": 160_000u128,
                        "fiat_currency": "NGN",
                        "seller_bank_name": "OPay"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let checkout_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/702/checkout")
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer)
                .header("content-type", "application/json")
                .body(Body::from(json!({}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let checkout_body: Value = serde_json::from_slice(
        &checkout_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    let tx_ref = checkout_body["tx_ref"].as_str().unwrap().to_string();

    // 1. Test underpayment (expected 80,000.00 NGN, paid 75,000.00 NGN) -> does NOT confirm trade
    let underpaid_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/702/verify-payment")
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "tx_ref": tx_ref,
                        "provider_verification_payload": {
                            "status": "success",
                            "data": {
                                "id": 990011u64,
                                "tx_ref": tx_ref,
                                "amount": "75000.00",
                                "currency": "NGN",
                                "status": "successful"
                            }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(underpaid_res.status(), StatusCode::OK);
    let underpaid_body: Value = serde_json::from_slice(
        &underpaid_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(underpaid_body["payment_state"], "UNDERPAID");
    assert_eq!(underpaid_body["lifecycle_state"], "AWAITING_PAYMENT");

    // 2. Simulate expired deadline + late payment arriving after deadline -> LATE_PAYMENT_REVIEW
    if let Some(mut t) = state.trades.get_mut("702") {
        t.payment_deadline_at = Some(Utc::now() - ChronoDuration::minutes(5));
    }

    let late_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/702/verify-payment")
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "tx_ref": tx_ref,
                        "provider_verification_payload": {
                            "status": "success",
                            "data": {
                                "id": 990022u64,
                                "tx_ref": tx_ref,
                                "amount": "80000.00",
                                "currency": "NGN",
                                "status": "successful"
                            }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(late_res.status(), StatusCode::OK);
    let late_body: Value = serde_json::from_slice(
        &late_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(late_body["lifecycle_state"], "LATE_PAYMENT_REVIEW");
    assert_eq!(late_body["payment_state"], "LATE_CONFIRMED");

    // 3. Request and complete refund from LATE_PAYMENT_REVIEW -> REFUND_PENDING -> CANCELLED
    let req_refund = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/702/refund")
                .header("authorization", &auth_header)
                .header("x-wallet-address", seller)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "action": "request",
                        "reason": "Late payment after deadline; refunding buyer"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(req_refund.status(), StatusCode::OK);
    assert_eq!(
        state.trades.get("702").unwrap().lifecycle_state,
        TradeLifecycleState::RefundPending
    );

    let complete_refund = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/702/refund")
                .header("authorization", &auth_header)
                .header("x-wallet-address", seller)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "action": "approve_and_complete",
                        "flw_refund_id": 776655u64,
                        "provider_status": "completed"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(complete_refund.status(), StatusCode::OK);
    assert_eq!(
        state.trades.get("702").unwrap().lifecycle_state,
        TradeLifecycleState::Cancelled
    );
    assert_eq!(
        state.trades.get("702").unwrap().refund_state,
        RefundState::Completed
    );
}

#[tokio::test]
async fn test_seller_funded_partial_fills_fifo_queue_cancellation_and_trust_progression() {
    let state = test_state();
    let auth_header = format!("Bearer {}", state.config.service_api_key);
    let app = build_router(state.clone());

    let seller = "0x1000000000000000000000000000000000000001";
    let buyer_a = "0x200000000000000000000000000000000000000a";
    let buyer_b = "0x200000000000000000000000000000000000000b";
    let buyer_c = "0x200000000000000000000000000000000000000c";

    // 1. Seller locks 500 USDC (500_000_000 units) in escrow listing LST-900
    let list_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/listings")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "listing_ref": "LST-900",
                        "onchain_listing_id": "900",
                        "seller_address": seller,
                        "total_deposited_usdc_units": 500_000_000u128,
                        "exchange_rate_minor": 163_000u128,
                        "fiat_currency": "NGN",
                        "seller_bank_name": "GTBank",
                        "seller_account_number": "0123456789"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_res.status(), StatusCode::CREATED);

    // 2. Buyer A requests partial fill of 120 USDC -> acquires ACTIVE_SLOT immediately with 0 buyer collateral
    let order_a_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/listings/LST-900/orders")
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer_a)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "requested_usdc_units": 120_000_000u128,
                        "child_trade_id": "9001"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(order_a_res.status(), StatusCode::CREATED);
    let order_a_body: Value = serde_json::from_slice(
        &order_a_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(order_a_body["execution_mode"], "ACTIVE_SLOT");
    assert_eq!(order_a_body["trade"]["buyer_collateral_usdc_units"], 0u64);
    assert_eq!(order_a_body["listing"]["available_usdc_units"], 380_000_000u64);
    assert_eq!(order_a_body["listing"]["allocated_usdc_units"], 120_000_000u64);

    // 3. New Buyer A attempting a second concurrent unpaid order is rejected with 409 CONFLICT
    let dup_a_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/listings/LST-900/orders")
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer_a)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "requested_usdc_units": 10_000_000u128
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(dup_a_res.status(), StatusCode::CONFLICT);

    // 4. Buyer B requests 100 USDC while Seller is serving Buyer A -> placed in FIFO QUEUED at position 1
    let order_b_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/listings/LST-900/orders")
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer_b)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "requested_usdc_units": 100_000_000u128
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(order_b_res.status(), StatusCode::ACCEPTED);
    let order_b_body: Value = serde_json::from_slice(
        &order_b_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(order_b_body["execution_mode"], "QUEUED");
    assert_eq!(order_b_body["queue_entry"]["queue_position"], 1);
    let q_ref_b = order_b_body["queue_entry"]["queue_ref"]
        .as_str()
        .unwrap()
        .to_string();

    // 5. Buyer C requests 80 USDC -> placed in FIFO QUEUED at position 2
    let order_c_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/listings/LST-900/orders")
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer_c)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "requested_usdc_units": 80_000_000u128
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(order_c_res.status(), StatusCode::ACCEPTED);
    let order_c_body: Value = serde_json::from_slice(
        &order_c_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(order_c_body["queue_entry"]["queue_position"], 2);
    let q_ref_c = order_c_body["queue_entry"]["queue_ref"]
        .as_str()
        .unwrap()
        .to_string();

    // 6. Buyer B cancels while waiting in queue -> 100 USDC returned to available, Buyer C advances to position 1
    let cancel_b_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(&format!("/api/v1/queue/{q_ref_b}/cancel"))
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer_b)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "reason": "Seller taking too long" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(cancel_b_res.status(), StatusCode::OK);
    assert_eq!(
        state
            .seller_listings
            .get("LST-900")
            .unwrap()
            .available_usdc_units,
        300_000_000u128
    );
    assert_eq!(
        state.queue_entries.get(&q_ref_c).unwrap().queue_position,
        1
    );

    // 7. Complete Buyer A's trade #9001 -> Seller slot frees, Buyer A upgrades to STANDARD tier (500 USDC limit),
    // and Buyer C becomes ELIGIBLE_AWAITING_CONSENT and activates trade #9002
    {
        let mut t = state.trades.get_mut("9001").unwrap();
        t.payment_state = tlsn_service::lifecycle::PaymentState::Confirmed;
        t.payout_state = PayoutState::Confirmed;
        t.lifecycle_state = TradeLifecycleState::ReleasePending;
    }
    let rel_confirm = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades/9001/escrow")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "action": "confirm_on_chain",
                        "tx_hash": "0xaaaa567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                        "block_number": 200100u64
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rel_confirm.status(), StatusCode::OK);

    let listing_after = state.seller_listings.get("LST-900").unwrap().clone();
    assert_eq!(listing_after.filled_usdc_units, 120_000_000u128);
    assert_eq!(listing_after.allocated_usdc_units, 0);
    assert_eq!(listing_after.reserved_queued_usdc_units, 80_000_000u128);
    assert_eq!(listing_after.available_usdc_units, 300_000_000u128);
    assert!(listing_after.validate_conservation().is_ok());

    let prof_a = state.get_or_init_trust_profile(buyer_a);
    assert_eq!(prof_a.completed_trade_count, 1);
    assert_eq!(prof_a.max_trade_usdc_units, 500_000_000u128);

    // Buyer C activates their front-of-queue reservation
    let act_c_res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(&format!("/api/v1/queue/{q_ref_c}/activate"))
                .header("authorization", &auth_header)
                .header("x-wallet-address", buyer_c)
                .header("content-type", "application/json")
                .body(Body::from(json!({ "child_trade_id": "9002" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(act_c_res.status(), StatusCode::OK);
    let act_c_body: Value = serde_json::from_slice(
        &act_c_res.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(act_c_body["execution_mode"], "ACTIVE_SLOT");
    assert_eq!(act_c_body["trade"]["trade_id"], "9002");
}

#[tokio::test]
async fn test_progressive_cooldown_on_unexplained_expiry_and_guarantor_commitment() {
    let state = test_state();
    let auth_header = format!("Bearer {}", state.config.service_api_key);
    let app = build_router(state.clone());

    let seller = "0x3000000000000000000000000000000000000001";
    let buyer_d = "0x400000000000000000000000000000000000000d";

    // 1. Create a micro-trade of 0.10 USDC (100_000 micro-USDC @ 1630 NGN = 163.00 NGN = 16300 kobo)
    let create_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "trade_id": "950",
                        "seller_address": seller,
                        "buyer_address": buyer_d,
                        "usdc_amount_units": 100_000u128,
                        "exchange_rate_minor": 163_000u128,
                        "fiat_currency": "NGN",
                        "seller_bank_name": "Access Bank"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create_res.status(), StatusCode::CREATED);

    // 2. Simulate unexplained 20-minute payment deadline expiration and run reconciliation
    if let Some(mut t) = state.trades.get_mut("950") {
        t.payment_deadline_at = Some(Utc::now() - ChronoDuration::minutes(2));
    }
    let rec_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/reconcile/run")
                .header("authorization", &auth_header)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rec_res.status(), StatusCode::OK);

    // 3. Buyer D now has an active progressive cooldown and is blocked from opening another trade
    let blocked_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "trade_id": "951",
                        "seller_address": seller,
                        "buyer_address": buyer_d,
                        "usdc_amount_units": 10_000_000u128,
                        "exchange_rate_minor": 163_000u128,
                        "fiat_currency": "NGN",
                        "seller_bank_name": "Access Bank"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(blocked_res.status(), StatusCode::UNPROCESSABLE_ENTITY);

    // 4. Admin override clears cooldown; now test Guarantor Commitment enabling a 600 USDC trade for a New buyer
    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/admin/risk-override")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "wallet_address": buyer_d,
                        "clear_cooldown": true,
                        "reason": "Verified bank USSD maintenance window"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Without guarantor, 600 USDC exceeds New buyer's 150 USDC limit
    let over_limit_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "trade_id": "952",
                        "seller_address": seller,
                        "buyer_address": buyer_d,
                        "usdc_amount_units": 600_000_000u128,
                        "exchange_rate_minor": 163_000u128,
                        "fiat_currency": "NGN",
                        "seller_bank_name": "Access Bank"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(over_limit_res.status(), StatusCode::UNPROCESSABLE_ENTITY);

    // Guarantor signs EIP-191 commitment backing Buyer D up to 1,000 USDC
    let guarantor_key = [0x77u8; 32];
    let msg = format!(
        "PeerNotary Guarantor Commitment: I back buyer {} up to 1000 USDC",
        buyer_d
    );
    let (guarantor_addr, guarantor_sig) = sign_eip191_message(&guarantor_key, &msg);

    let gua_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/users/guarantor")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "guarantor_address": guarantor_addr,
                        "beneficiary_buyer_address": buyer_d,
                        "max_backed_usdc_units": 1_000_000_000u128,
                        "locked_bond_usdc_units": 100_000_000u128,
                        "message": msg,
                        "eip191_signature": guarantor_sig
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(gua_res.status(), StatusCode::CREATED);

    // Now Buyer D's 600 USDC trade succeeds!
    let backed_trade_res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/trades")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "trade_id": "952",
                        "seller_address": seller,
                        "buyer_address": buyer_d,
                        "usdc_amount_units": 600_000_000u128,
                        "exchange_rate_minor": 163_000u128,
                        "fiat_currency": "NGN",
                        "seller_bank_name": "Access Bank"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(backed_trade_res.status(), StatusCode::CREATED);
}
