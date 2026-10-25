use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use tlsn_service::{
    api::build_router,
    config::AppConfig,
    crypto::{build_signed_tlsn_presentation_for_transcript, verify_escrow_binding_signature},
    domain_policy::{is_forbidden_ip, validate_https_target_url, validate_target_domain},
    models::{
        CreateSessionResponse, EvaluateEscrowReleaseResponse, ProofEvidenceResponse,
        ProofSummaryResponse, SessionState,
    },
    state::AppState,
};

fn test_config() -> AppConfig {
    AppConfig {
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        service_api_key: "super_secret_service_api_key_32_bytes".to_string(),
        webhook_secret: "super_secret_webhook_secret_32_bytes".to_string(),
        webhook_url: None,
        notary_signing_key_hex: "2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a"
            .to_string(),
        allowed_hostnames: vec![
            "tlsnotary.org".to_string(),
            "example.com".to_string(),
            "api.opayweb.com".to_string(),
            "api.gtbank.com".to_string(),
        ],
        expected_chain_id: 5042002,
        expected_escrow_address: "0x5042f1114c6f272f5909f16510399986ef0d734d".to_string(),
        max_proof_bytes: 512 * 1024,
        session_ttl_secs: 900,
        max_transcript_age_secs: 3600,
    }
}

fn build_valid_http_transcript(
    trade_id: &str,
    amount_units: &str,
    currency: &str,
    payment_reference: &str,
    payment_status: &str,
    recipient_hash: Option<&str>,
) -> (Vec<u8>, Vec<u8>) {
    let req = b"GET /api/v1/transactions/verify HTTP/1.1\r\nHost: tlsnotary.org\r\nAuthorization: Bearer REDACTED\r\n\r\n".to_vec();
    let body = json!({
        "tradeId": trade_id,
        "amountUnits": amount_units,
        "currency": currency,
        "paymentReference": payment_reference,
        "paymentStatus": payment_status,
        "recipientHash": recipient_hash
    })
    .to_string();

    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    )
    .into_bytes();

    (req, resp)
}

#[tokio::test]
async fn test_health_endpoints_do_not_leak_secrets() {
    let cfg = test_config();
    let app = build_router(AppState::new(cfg.clone()));

    let live_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/health/live")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(live_res.status(), StatusCode::OK);

    let ready_res = app
        .oneshot(
            Request::builder()
                .uri("/health/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ready_res.status(), StatusCode::OK);
    let body_bytes = ready_res.into_body().collect().await.unwrap().to_bytes();
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap();

    // Ensure private keys and secrets are never leaked in health output
    assert!(!body_str.contains(&cfg.service_api_key));
    assert!(!body_str.contains(&cfg.webhook_secret));
    assert!(!body_str.contains(&cfg.notary_signing_key_hex));
}

#[tokio::test]
async fn test_end_to_end_tlsnotary_proof_verification_and_escrow_evaluation() {
    let cfg = test_config();
    let signing_key = cfg.notary_signing_key_bytes();
    let app = build_router(AppState::new(cfg.clone()));

    let buyer_wallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    let recipient_hash = "0x1111111111111111111111111111111111111111111111111111111111111111";

    // 1. Create verification session
    let create_req = json!({
        "trade_id": "42",
        "buyer_address": buyer_wallet,
        "expected_amount_units": 305500000u128,
        "expected_currency": "USDC",
        "payment_reference": "REF-NGN-987654321",
        "expected_recipient_hash": recipient_hash,
        "target_hostname": "tlsnotary.org"
    });

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(create_req.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::CREATED);
    let body_bytes = res.into_body().collect().await.unwrap().to_bytes();
    let session_resp: CreateSessionResponse = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(session_resp.state, SessionState::Pending);

    // 2. Generate a real cryptographic TLSNotary Presentation (Attestation + Merkle EncodingTree + ServerIdentityProof)
    let (http_req, http_resp) = build_valid_http_transcript(
        "42",
        "305500000",
        "USDC",
        "REF-NGN-987654321",
        "completed",
        Some(recipient_hash),
    );
    let presentation_bytes =
        build_signed_tlsn_presentation_for_transcript(&signing_key, &http_req, &http_resp).unwrap();
    let presentation_hex = hex::encode(&presentation_bytes);

    // 3. Submit presentation for cryptographic verification
    let verify_req = json!({
        "session_id": session_resp.session_id,
        "trade_id": "42",
        "buyer_address": buyer_wallet,
        "presentation_bincode_hex": presentation_hex
    });

    let verify_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/proofs/verify")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(verify_req.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(verify_res.status(), StatusCode::OK);
    let verify_bytes = verify_res.into_body().collect().await.unwrap().to_bytes();
    let proof_summary: ProofSummaryResponse = serde_json::from_slice(&verify_bytes).unwrap();
    assert!(proof_summary.verified);
    assert!(proof_summary
        .checks_performed
        .contains(&"tlsn_attestation_signature_verified".to_string()));
    assert!(proof_summary
        .checks_performed
        .contains(&"tlsn_server_identity_proof_verified".to_string()));
    assert!(proof_summary
        .checks_performed
        .contains(&"tlsn_merkle_transcript_commitment_verified".to_string()));

    // Verify the ECDSA binding attestation signature independently
    verify_escrow_binding_signature(
        &proof_summary.binding_attestation,
        &session_resp.notary_public_key_hex,
    )
    .expect("binding signature must verify");

    // 4. Retrieve evidence and confirm cross-user access control
    let cross_user_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!(
                    "/api/v1/proofs/{}/evidence",
                    proof_summary.proof_id
                ))
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header(
                    "x-wallet-address",
                    "0x1111111111111111111111111111111111111111",
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(cross_user_res.status(), StatusCode::FORBIDDEN);

    let owner_evidence_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!(
                    "/api/v1/proofs/{}/evidence",
                    proof_summary.proof_id
                ))
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("x-wallet-address", buyer_wallet)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(owner_evidence_res.status(), StatusCode::OK);
    let ev_bytes = owner_evidence_res
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let ev_resp: ProofEvidenceResponse = serde_json::from_slice(&ev_bytes).unwrap();
    assert_eq!(ev_resp.evidence.amount_units, 305500000u128);
    assert_eq!(ev_resp.evidence.server_name, "tlsnotary.org");

    // 5. Evaluate escrow release authorization
    let eval_req = json!({
        "session_id": session_resp.session_id,
        "proof_id": proof_summary.proof_id,
        "trade_id": "42",
        "buyer_address": buyer_wallet,
        "expected_amount_units": 305500000u128,
        "expected_currency": "USDC",
        "expected_payment_reference": "REF-NGN-987654321",
        "chain_id": 5042002,
        "escrow_address": "0x5042f1114c6f272f5909f16510399986ef0d734d"
    });

    let eval_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/escrow/evaluate-release")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(eval_req.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(eval_res.status(), StatusCode::OK);
    let eval_bytes = eval_res.into_body().collect().await.unwrap().to_bytes();
    let eval_body: EvaluateEscrowReleaseResponse = serde_json::from_slice(&eval_bytes).unwrap();
    assert!(eval_body.authorized);
    assert!(eval_body.rejection_reasons.is_empty());
}

#[tokio::test]
async fn test_adversarial_untrusted_notary_key_and_tampered_proof_rejected() {
    let cfg = test_config();
    let app = build_router(AppState::new(cfg.clone()));
    let buyer_wallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

    // Create session
    let create_req = json!({
        "trade_id": "77",
        "buyer_address": buyer_wallet,
        "expected_amount_units": 100000000u128,
        "expected_currency": "USDC",
        "payment_reference": "REF-ATTACK-1",
        "expected_recipient_hash": null,
        "target_hostname": "tlsnotary.org"
    });

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(create_req.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let session_resp: CreateSessionResponse =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Attacker signs presentation with rogue Notary key [99u8; 32]
    let rogue_key = [99u8; 32];
    let (http_req, http_resp) =
        build_valid_http_transcript("77", "100000000", "USDC", "REF-ATTACK-1", "completed", None);
    let rogue_presentation =
        build_signed_tlsn_presentation_for_transcript(&rogue_key, &http_req, &http_resp).unwrap();

    let verify_req = json!({
        "session_id": session_resp.session_id,
        "trade_id": "77",
        "buyer_address": buyer_wallet,
        "presentation_bincode_hex": hex::encode(&rogue_presentation)
    });

    let verify_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/proofs/verify")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(verify_req.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(verify_res.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let err_json: Value =
        serde_json::from_slice(&verify_res.into_body().collect().await.unwrap().to_bytes())
            .unwrap();
    assert_eq!(err_json["error"], "UNTRUSTED_ATTESTATION_SIGNER");
}

#[tokio::test]
async fn test_adversarial_replay_and_mismatched_financial_claims_rejected() {
    let cfg = test_config();
    let signing_key = cfg.notary_signing_key_bytes();
    let app = build_router(AppState::new(cfg.clone()));
    let buyer_wallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

    // Session 1: Trade 100 expecting 500 USDC
    let create_req_1 = json!({
        "trade_id": "100",
        "buyer_address": buyer_wallet,
        "expected_amount_units": 500_000_000u128,
        "expected_currency": "USDC",
        "payment_reference": "REF-100",
        "expected_recipient_hash": null,
        "target_hostname": "tlsnotary.org"
    });
    let res1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(create_req_1.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let sess1: CreateSessionResponse =
        serde_json::from_slice(&res1.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Attack A: Submit proof where paymentStatus is "pending" instead of settled/completed
    let (req_pending, resp_pending) =
        build_valid_http_transcript("100", "500000000", "USDC", "REF-100", "pending", None);
    let pres_pending =
        build_signed_tlsn_presentation_for_transcript(&signing_key, &req_pending, &resp_pending)
            .unwrap();

    let verify_pending_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/proofs/verify")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(
                    json!({
                        "session_id": sess1.session_id,
                        "trade_id": "100",
                        "buyer_address": buyer_wallet,
                        "presentation_bincode_hex": hex::encode(&pres_pending)
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        verify_pending_res.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let err_body: Value = serde_json::from_slice(
        &verify_pending_res
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes(),
    )
    .unwrap();
    assert_eq!(err_body["error"], "PAYMENT_STILL_PENDING");

    // Attack B: Session 1 is now in Failed state; trying to reuse failed session must return 409 CONFLICT
    let retry_failed_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/proofs/verify")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(
                    json!({
                        "session_id": sess1.session_id,
                        "trade_id": "100",
                        "buyer_address": buyer_wallet,
                        "presentation_bincode_hex": hex::encode(&pres_pending)
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(retry_failed_res.status(), StatusCode::CONFLICT);

    // Create fresh Session 2 for Trade 101 and verify valid proof
    let res2 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(
                    json!({
                        "trade_id": "101",
                        "buyer_address": buyer_wallet,
                        "expected_amount_units": 500_000_000u128,
                        "expected_currency": "USDC",
                        "payment_reference": "REF-SHARED-REPLAY",
                        "expected_recipient_hash": null,
                        "target_hostname": "tlsnotary.org"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let sess2: CreateSessionResponse =
        serde_json::from_slice(&res2.into_body().collect().await.unwrap().to_bytes()).unwrap();

    let (req_valid, resp_valid) = build_valid_http_transcript(
        "101",
        "500000000",
        "USDC",
        "REF-SHARED-REPLAY",
        "completed",
        None,
    );
    let pres_valid =
        build_signed_tlsn_presentation_for_transcript(&signing_key, &req_valid, &resp_valid)
            .unwrap();

    let ok_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/proofs/verify")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(
                    json!({
                        "session_id": sess2.session_id,
                        "trade_id": "101",
                        "buyer_address": buyer_wallet,
                        "presentation_bincode_hex": hex::encode(&pres_valid)
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ok_res.status(), StatusCode::OK);

    // Attack C: Attempt to reuse the same payment_reference "REF-SHARED-REPLAY" in Trade 102
    let res3 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(
                    json!({
                        "trade_id": "102",
                        "buyer_address": buyer_wallet,
                        "expected_amount_units": 500_000_000u128,
                        "expected_currency": "USDC",
                        "payment_reference": "REF-SHARED-REPLAY",
                        "expected_recipient_hash": null,
                        "target_hostname": "tlsnotary.org"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let sess3: CreateSessionResponse =
        serde_json::from_slice(&res3.into_body().collect().await.unwrap().to_bytes()).unwrap();

    let (req_replay_ref, resp_replay_ref) = build_valid_http_transcript(
        "102",
        "500000000",
        "USDC",
        "REF-SHARED-REPLAY",
        "completed",
        None,
    );
    let pres_replay_ref = build_signed_tlsn_presentation_for_transcript(
        &signing_key,
        &req_replay_ref,
        &resp_replay_ref,
    )
    .unwrap();

    let replay_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/proofs/verify")
                .header("Authorization", format!("Bearer {}", cfg.service_api_key))
                .header("Content-Type", "application/json")
                .body(Body::from(
                    json!({
                        "session_id": sess3.session_id,
                        "trade_id": "102",
                        "buyer_address": buyer_wallet,
                        "presentation_bincode_hex": hex::encode(&pres_replay_ref)
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(replay_res.status(), StatusCode::CONFLICT);
    let replay_err: Value =
        serde_json::from_slice(&replay_res.into_body().collect().await.unwrap().to_bytes())
            .unwrap();
    assert_eq!(replay_err["error"], "DUPLICATE_PAYMENT_REFERENCE_USED");
}

#[test]
fn test_ssrf_and_domain_policy_protections() {
    let allowed = vec!["example.com".to_string(), "api.opayweb.com".to_string()];

    // Reject localhost, private IPs, cloud metadata, and unallowed domains
    assert!(validate_target_domain("localhost", &allowed).is_err());
    assert!(validate_target_domain("127.0.0.1", &allowed).is_err());
    assert!(validate_target_domain("169.254.169.254", &allowed).is_err());
    assert!(validate_target_domain("metadata.google.internal", &allowed).is_err());
    assert!(validate_target_domain("evil.example.com", &allowed).is_err());
    assert!(validate_target_domain("example.com:8080", &allowed).is_err());
    assert!(validate_target_domain("example.com/path", &allowed).is_err());

    // Valid allowlisted domain passes
    assert_eq!(
        validate_target_domain("EXAMPLE.COM", &allowed).unwrap(),
        "example.com"
    );

    // Reject HTTP (non-HTTPS), credentials in URL, non-443 port
    assert!(validate_https_target_url("http://example.com/api", &allowed).is_err());
    assert!(validate_https_target_url("https://user:pass@example.com/api", &allowed).is_err());
    assert!(validate_https_target_url("https://example.com:8443/api", &allowed).is_err());
    assert!(validate_https_target_url("https://example.com/api/v1", &allowed).is_ok());

    // IP checks
    assert!(is_forbidden_ip("127.0.0.1".parse().unwrap()));
    assert!(is_forbidden_ip("10.0.0.1".parse().unwrap()));
    assert!(is_forbidden_ip("172.16.0.5".parse().unwrap()));
    assert!(is_forbidden_ip("192.168.1.1".parse().unwrap()));
    assert!(is_forbidden_ip("169.254.169.254".parse().unwrap()));
    assert!(is_forbidden_ip("100.64.0.1".parse().unwrap()));
    assert!(is_forbidden_ip("::1".parse().unwrap()));
    assert!(is_forbidden_ip("fe80::1".parse().unwrap()));
    assert!(is_forbidden_ip("fc00::1".parse().unwrap()));
    assert!(!is_forbidden_ip("93.184.216.34".parse().unwrap()));
}
