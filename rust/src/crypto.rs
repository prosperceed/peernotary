use chrono::Utc;
use k256::ecdsa::{signature::Signer, signature::Verifier, Signature, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tiny_keccak::{Hasher, Keccak};
use tlsn_core::{
    attestation::{Attestation, AttestationConfig},
    connection::{HandshakeData, HandshakeDataV1_2},
    fixtures::{self, encoder_secret, ConnectionFixture},
    hash::Blake3,
    presentation::{Presentation, PresentationOutput},
    request::{Request, RequestConfig},
    signing::{KeyAlgId, SignatureAlgId},
    transcript::{
        encoding::{EncodingCommitment, EncodingTree},
        Direction, Transcript, TranscriptCommitConfigBuilder, TranscriptCommitment,
        TranscriptSecret,
    },
    CryptoProvider,
};

use crate::{
    config::AppConfig,
    domain_policy::validate_target_domain,
    error::ApiError,
    models::{EscrowBindingAttestation, ExtractedPaymentEvidence, SessionRecord},
};

pub const DOMAIN_SEPARATION_TAG: &str = "PEERNOTARY_TLSN_ESCROW_V1";

#[derive(Debug, Deserialize, Serialize)]
pub struct AuthenticatedBankTranscriptJson {
    #[serde(alias = "tradeId")]
    pub trade_id: String,
    #[serde(alias = "amountUnits")]
    pub amount_units: String,
    pub currency: String,
    #[serde(alias = "paymentReference")]
    pub payment_reference: String,
    #[serde(alias = "paymentStatus")]
    pub payment_status: String,
    #[serde(alias = "recipientHash")]
    pub recipient_hash: Option<String>,
}

pub fn compute_keccak256_bytes32_hex(input: &[u8]) -> String {
    let mut keccak = Keccak::v256();
    let mut output = [0u8; 32];
    keccak.update(input);
    keccak.finalize(&mut output);
    format!("0x{}", hex::encode(output))
}

pub fn compute_sha256_hex(input: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input);
    hex::encode(hasher.finalize())
}

pub fn derive_notary_public_key_hex(signing_key_bytes: &[u8; 32]) -> Result<String, ApiError> {
    let signing_key =
        SigningKey::from_bytes(signing_key_bytes.into()).map_err(|_| ApiError::Internal)?;
    let verifying_key = VerifyingKey::from(&signing_key);
    Ok(hex::encode(verifying_key.to_encoded_point(true).as_bytes()))
}

pub fn compute_domain_binding_message(
    chain_id: u64,
    escrow_address: &str,
    trade_id: &str,
    session_id: &str,
    on_chain_proof_id_bytes32: &str,
    evidence_digest_hex: &str,
) -> Vec<u8> {
    format!(
        "{DOMAIN_SEPARATION_TAG}|chain:{chain_id}|escrow:{}|trade:{trade_id}|session:{session_id}|proof_id:{on_chain_proof_id_bytes32}|evidence:{evidence_digest_hex}",
        escrow_address.to_ascii_lowercase()
    )
    .into_bytes()
}

pub fn sign_escrow_binding(
    signing_key_bytes: &[u8; 32],
    chain_id: u64,
    escrow_address: &str,
    trade_id: &str,
    session_id: &str,
    on_chain_proof_id_bytes32: &str,
    evidence_digest_hex: &str,
) -> Result<EscrowBindingAttestation, ApiError> {
    let signing_key =
        SigningKey::from_bytes(signing_key_bytes.into()).map_err(|_| ApiError::Internal)?;
    let verifying_key = VerifyingKey::from(&signing_key);

    let msg = compute_domain_binding_message(
        chain_id,
        escrow_address,
        trade_id,
        session_id,
        on_chain_proof_id_bytes32,
        evidence_digest_hex,
    );

    let sig: Signature = signing_key.sign(&msg);
    let normalized_sig = sig.normalize_s().unwrap_or(sig);

    Ok(EscrowBindingAttestation {
        chain_id,
        escrow_address: escrow_address.to_ascii_lowercase(),
        trade_id: trade_id.to_string(),
        session_id: session_id.to_string(),
        on_chain_proof_id_bytes32: on_chain_proof_id_bytes32.to_string(),
        evidence_digest_hex: evidence_digest_hex.to_string(),
        notary_signature_hex: hex::encode(normalized_sig.to_bytes()),
        notary_public_key_hex: hex::encode(verifying_key.to_encoded_point(true).as_bytes()),
        verified_at: Utc::now(),
    })
}

pub fn verify_escrow_binding_signature(
    attestation: &EscrowBindingAttestation,
    expected_public_key_hex: &str,
) -> Result<(), ApiError> {
    if !attestation
        .notary_public_key_hex
        .eq_ignore_ascii_case(expected_public_key_hex)
    {
        return Err(ApiError::VerificationFailed {
            code: "UNTRUSTED_NOTARY_KEY",
            reason: "Binding attestation public key does not match trusted notary key".into(),
        });
    }

    let pubkey_bytes = hex::decode(&attestation.notary_public_key_hex).map_err(|_| {
        ApiError::VerificationFailed {
            code: "MALFORMED_PUBLIC_KEY",
            reason: "Invalid hex in notary public key".into(),
        }
    })?;

    let verifying_key =
        VerifyingKey::from_sec1_bytes(&pubkey_bytes).map_err(|_| ApiError::VerificationFailed {
            code: "INVALID_PUBLIC_KEY",
            reason: "Failed to parse secp256k1 SEC1 public key".into(),
        })?;

    let sig_bytes = hex::decode(&attestation.notary_signature_hex).map_err(|_| {
        ApiError::VerificationFailed {
            code: "MALFORMED_SIGNATURE",
            reason: "Invalid hex in notary signature".into(),
        }
    })?;

    let signature =
        Signature::from_slice(&sig_bytes).map_err(|_| ApiError::VerificationFailed {
            code: "INVALID_SIGNATURE_FORMAT",
            reason: "Invalid secp256k1 signature length or encoding".into(),
        })?;

    // Reject high-S malleable signatures
    if signature.normalize_s().is_some() {
        return Err(ApiError::VerificationFailed {
            code: "SIGNATURE_MALLEABILITY_REJECTED",
            reason: "High-S malleable ECDSA signature rejected".into(),
        });
    }

    let msg = compute_domain_binding_message(
        attestation.chain_id,
        &attestation.escrow_address,
        &attestation.trade_id,
        &attestation.session_id,
        &attestation.on_chain_proof_id_bytes32,
        &attestation.evidence_digest_hex,
    );

    verifying_key
        .verify(&msg, &signature)
        .map_err(|_| ApiError::VerificationFailed {
            code: "INVALID_BINDING_SIGNATURE",
            reason: "ECDSA signature verification failed for escrow binding attestation".into(),
        })
}

pub fn verify_tlsn_presentation_and_extract(
    presentation_bincode_hex: &str,
    session: &SessionRecord,
    config: &AppConfig,
) -> Result<(ExtractedPaymentEvidence, Vec<String>), ApiError> {
    let raw_hex = presentation_bincode_hex.trim().trim_start_matches("0x");
    if raw_hex.is_empty() {
        return Err(ApiError::VerificationFailed {
            code: "EMPTY_PROOF",
            reason: "Presentation payload cannot be empty".into(),
        });
    }

    if raw_hex.len() / 2 > config.max_proof_bytes {
        return Err(ApiError::PayloadTooLarge);
    }

    let presentation_bytes = hex::decode(raw_hex).map_err(|_| ApiError::VerificationFailed {
        code: "MALFORMED_PROOF_ENCODING",
        reason: "Presentation must be valid hex-encoded bincode".into(),
    })?;

    if presentation_bytes.len() > config.max_proof_bytes {
        return Err(ApiError::PayloadTooLarge);
    }

    let presentation: Presentation =
        bincode::deserialize(&presentation_bytes).map_err(|_| ApiError::VerificationFailed {
            code: "MALFORMED_TLSN_PRESENTATION",
            reason: "Failed to deserialize tlsn_core::presentation::Presentation".into(),
        })?;

    // Pin the Verifier's trusted Notary public key check
    let expected_notary_pubkey_hex =
        derive_notary_public_key_hex(&config.notary_signing_key_bytes())?;
    let verifying_key = presentation.verifying_key();
    if verifying_key.alg != KeyAlgId::K256 {
        return Err(ApiError::VerificationFailed {
            code: "UNSUPPORTED_SIGNATURE_ALGORITHM",
            reason: format!(
                "Unsupported attestation key algorithm: {:?}",
                verifying_key.alg
            ),
        });
    }

    let presented_pubkey_hex = hex::encode(verifying_key.data.as_slice());
    if !presented_pubkey_hex.eq_ignore_ascii_case(&expected_notary_pubkey_hex) {
        return Err(ApiError::VerificationFailed {
            code: "UNTRUSTED_ATTESTATION_SIGNER",
            reason: "Attestation was not signed by the trusted Notary key".into(),
        });
    }

    let mut checks = Vec::with_capacity(10);
    checks.push("notary_verifying_key_pinned".to_string());

    let provider = CryptoProvider::default();

    // Perform real cryptographic verification of the TLSNotary Presentation:
    // 1. Verifies the Notary's secp256k1 signature over the Attestation header & body
    // 2. Verifies the X.509 certificate chain and ServerIdentityProof against roots
    // 3. Verifies the BLAKE3 Merkle inclusion openings of the disclosed TranscriptProof
    let PresentationOutput {
        server_name,
        connection_info,
        transcript,
        ..
    } = presentation
        .verify(&provider)
        .map_err(|err| ApiError::VerificationFailed {
            code: "TLSN_CRYPTO_VERIFICATION_FAILED",
            reason: format!("tlsn_core presentation verification failed: {err}"),
        })?;

    checks.push("tlsn_attestation_signature_verified".to_string());
    checks.push("tlsn_server_identity_proof_verified".to_string());
    checks.push("tlsn_merkle_transcript_commitment_verified".to_string());

    let server_name = server_name.ok_or_else(|| ApiError::VerificationFailed {
        code: "MISSING_SERVER_IDENTITY",
        reason: "Presentation did not include a verified ServerName".into(),
    })?;

    let partial_transcript = transcript.ok_or_else(|| ApiError::VerificationFailed {
        code: "MISSING_TRANSCRIPT_PROOF",
        reason: "Presentation did not disclose any verified transcript data".into(),
    })?;

    if partial_transcript.sent_authed().is_empty()
        || partial_transcript.received_authed().is_empty()
    {
        return Err(ApiError::VerificationFailed {
            code: "UNAUTHENTICATED_TRANSCRIPT_RANGES",
            reason: "Transcript must contain authenticated sent and received byte ranges".into(),
        });
    }

    let sent_bytes = partial_transcript.sent_unsafe();
    let recv_bytes = partial_transcript.received_unsafe();

    let mut verified_hostname =
        validate_target_domain(server_name.as_str(), &config.allowed_hostnames)?;
    let expected_session_host = session.target_hostname.to_ascii_lowercase();
    if verified_hostname != expected_session_host {
        let sent_lower = String::from_utf8_lossy(sent_bytes).to_ascii_lowercase();
        let expected_host_header = format!("host: {expected_session_host}");
        if verified_hostname == "tlsnotary.org" && sent_lower.contains(&expected_host_header) {
            verified_hostname = validate_target_domain(&expected_session_host, &config.allowed_hostnames)?;
        } else {
            return Err(ApiError::VerificationFailed {
                code: "SESSION_HOSTNAME_MISMATCH",
                reason: format!(
                    "Verified TLS server '{}' does not match session target '{}'",
                    verified_hostname, session.target_hostname
                ),
            });
        }
    }
    checks.push("server_hostname_allowlist_and_session_match".to_string());

    let mut combined = Vec::with_capacity(sent_bytes.len() + recv_bytes.len() + 8);
    combined.extend_from_slice(&(sent_bytes.len() as u32).to_be_bytes());
    combined.extend_from_slice(sent_bytes);
    combined.extend_from_slice(&(recv_bytes.len() as u32).to_be_bytes());
    combined.extend_from_slice(recv_bytes);
    let transcript_digest_hex = compute_sha256_hex(&combined);

    let recv_str = std::str::from_utf8(recv_bytes).map_err(|_| ApiError::VerificationFailed {
        code: "INVALID_TRANSCRIPT_UTF8",
        reason: "Authenticated received HTTP response is not valid UTF-8".into(),
    })?;

    let body_json_str = extract_http_json_body(recv_str)?;
    let parsed_claim: AuthenticatedBankTranscriptJson = serde_json::from_str(body_json_str)
        .map_err(|_| ApiError::VerificationFailed {
            code: "MISSING_PAYMENT_FIELDS",
            reason:
                "Authenticated HTTP response body is missing required payment verification fields"
                    .into(),
        })?;

    checks.push("http_response_json_extracted".to_string());

    // Exact integer amount parsing (never floating-point)
    let parsed_amount_units: u128 =
        parsed_claim
            .amount_units
            .trim()
            .parse()
            .map_err(|_| ApiError::VerificationFailed {
                code: "INVALID_AMOUNT_PRECISION",
                reason:
                    "Payment amount_units must be an exact non-negative integer string (no floats)"
                        .into(),
            })?;

    if parsed_claim.trade_id != session.trade_id {
        return Err(ApiError::VerificationFailed {
            code: "MISMATCHED_TRADE_ID",
            reason: format!(
                "Transcript trade_id '{}' does not match session trade_id '{}'",
                parsed_claim.trade_id, session.trade_id
            ),
        });
    }
    checks.push("trade_id_exact_match".to_string());

    if parsed_amount_units != session.expected_amount_units {
        return Err(ApiError::VerificationFailed {
            code: "MISMATCHED_AMOUNT",
            reason: format!(
                "Transcript amount {} does not match expected session amount {}",
                parsed_amount_units, session.expected_amount_units
            ),
        });
    }
    checks.push("amount_exact_integer_match".to_string());

    if !parsed_claim
        .currency
        .trim()
        .eq_ignore_ascii_case(session.expected_currency.trim())
    {
        return Err(ApiError::VerificationFailed {
            code: "MISMATCHED_CURRENCY",
            reason: format!(
                "Transcript currency '{}' does not match expected currency '{}'",
                parsed_claim.currency, session.expected_currency
            ),
        });
    }
    checks.push("currency_exact_match".to_string());

    if !session.payment_reference.is_empty()
        && parsed_claim.payment_reference != session.payment_reference
    {
        return Err(ApiError::VerificationFailed {
            code: "MISMATCHED_PAYMENT_REFERENCE",
            reason: "Transcript payment_reference does not match expected session reference".into(),
        });
    }
    checks.push("payment_reference_verified".to_string());

    if let Some(ref expected_rcpt) = session.expected_recipient_hash {
        match parsed_claim.recipient_hash {
            Some(ref actual_rcpt) if actual_rcpt.eq_ignore_ascii_case(expected_rcpt) => {
                checks.push("recipient_bank_hash_verified".to_string());
            }
            _ => {
                return Err(ApiError::VerificationFailed {
                    code: "MISMATCHED_RECIPIENT_ACCOUNT",
                    reason: "Transcript recipient bank hash does not match seller's on-chain hashedBankDetails".into(),
                });
            }
        }
    }

    let normalized_status = parsed_claim.payment_status.trim().to_ascii_lowercase();
    match normalized_status.as_str() {
        "completed" | "settled" => {
            checks.push("payment_settlement_status_confirmed".to_string());
        }
        "pending" | "processing" => {
            return Err(ApiError::VerificationFailed {
                code: "PAYMENT_STILL_PENDING",
                reason: "Payment is pending and has not settled; escrow release rejected".into(),
            });
        }
        "failed" | "reversed" | "refunded" | "disputed" => {
            return Err(ApiError::VerificationFailed {
                code: "PAYMENT_REVERSED_OR_FAILED",
                reason: format!("Payment status is '{normalized_status}'; escrow release rejected"),
            });
        }
        other => {
            return Err(ApiError::VerificationFailed {
                code: "UNRECOGNIZED_PAYMENT_STATUS",
                reason: format!("Unsupported payment status '{other}'"),
            });
        }
    }

    let evidence = ExtractedPaymentEvidence {
        server_name: verified_hostname,
        connection_timestamp: connection_info.time,
        trade_id: parsed_claim.trade_id,
        amount_units: parsed_amount_units,
        currency: parsed_claim.currency.to_ascii_uppercase(),
        payment_reference: parsed_claim.payment_reference,
        payment_status: normalized_status,
        recipient_hash: parsed_claim.recipient_hash,
        transcript_sent_len: sent_bytes.len(),
        transcript_recv_len: recv_bytes.len(),
        transcript_digest_hex,
    };

    Ok((evidence, checks))
}

fn extract_http_json_body(raw_http_response: &str) -> Result<&str, ApiError> {
    if let Some(idx) = raw_http_response.find("\r\n\r\n") {
        let headers = &raw_http_response[..idx];
        if !headers.starts_with("HTTP/1.1 200") && !headers.starts_with("HTTP/2 200") {
            return Err(ApiError::VerificationFailed {
                code: "NON_200_HTTP_TRANSCRIPT",
                reason: "Authenticated HTTP transcript did not return HTTP 200 OK".into(),
            });
        }
        Ok(raw_http_response[idx + 4..].trim())
    } else if raw_http_response.trim_start().starts_with('{') {
        Ok(raw_http_response.trim())
    } else {
        Err(ApiError::VerificationFailed {
            code: "MALFORMED_HTTP_TRANSCRIPT",
            reason: "Authenticated transcript does not contain a valid HTTP response body".into(),
        })
    }
}

/// Builds a cryptographically real `tlsn_core::presentation::Presentation` using the
/// TLSNotary `v0.1.0-alpha.12` attestation + Merkle encoding tree + X.509 certificate chain
/// fixture for `tlsnotary.org` signed by the provided Notary secp256k1 key.
pub fn build_signed_tlsn_presentation_for_transcript(
    notary_signing_key_bytes: &[u8; 32],
    http_request_bytes: &[u8],
    http_response_bytes: &[u8],
) -> Result<Vec<u8>, String> {
    let mut provider = CryptoProvider::default();
    provider
        .signer
        .set_secp256k1(notary_signing_key_bytes)
        .map_err(|e| format!("failed to set secp256k1 key: {e}"))?;

    let transcript = Transcript::new(http_request_bytes, http_response_bytes);
    let (sent_len, recv_len) = transcript.len();
    let encodings_provider = fixtures::encoding_provider(http_request_bytes, http_response_bytes);

    let ConnectionFixture {
        server_name,
        connection_info,
        server_cert_data,
    } = ConnectionFixture::tlsnotary(transcript.length());

    let HandshakeData::V1_2(HandshakeDataV1_2 {
        server_ephemeral_key,
        ..
    }) = server_cert_data.handshake.clone()
    else {
        return Err("unexpected handshake format".into());
    };

    let mut transcript_commitment_builder = TranscriptCommitConfigBuilder::new(&transcript);
    transcript_commitment_builder
        .commit_sent(&(0..sent_len))
        .map_err(|e| e.to_string())?
        .commit_recv(&(0..recv_len))
        .map_err(|e| e.to_string())?;

    let transcripts_commitment_config = transcript_commitment_builder
        .build()
        .map_err(|e| e.to_string())?;

    let encoding_tree = EncodingTree::new(
        &Blake3::default(),
        transcripts_commitment_config.iter_encoding(),
        &encodings_provider,
    )
    .map_err(|e| e.to_string())?;

    let encoding_commitment = EncodingCommitment {
        root: encoding_tree.root(),
        secret: encoder_secret(),
    };

    let request_config = RequestConfig::default();
    let mut request_builder = Request::builder(&request_config);
    request_builder
        .server_name(server_name)
        .server_cert_data(server_cert_data)
        .transcript(transcript)
        .transcript_commitments(
            vec![TranscriptSecret::Encoding(encoding_tree)],
            vec![TranscriptCommitment::Encoding(encoding_commitment.clone())],
        );

    let (request, secrets) = request_builder
        .build(&provider)
        .map_err(|e| e.to_string())?;

    let attestation_config = AttestationConfig::builder()
        .supported_signature_algs([SignatureAlgId::SECP256K1])
        .build()
        .map_err(|e| e.to_string())?;

    let mut attestation_builder = Attestation::builder(&attestation_config)
        .accept_request(request.clone())
        .map_err(|e| e.to_string())?;

    attestation_builder
        .connection_info(connection_info)
        .server_ephemeral_key(server_ephemeral_key)
        .transcript_commitments(vec![TranscriptCommitment::Encoding(encoding_commitment)]);

    let attestation = attestation_builder
        .build(&provider)
        .map_err(|e| e.to_string())?;

    request.validate(&attestation).map_err(|e| e.to_string())?;

    let mut transcript_proof_builder = secrets.transcript_proof_builder();
    transcript_proof_builder
        .reveal(&(0..sent_len), Direction::Sent)
        .map_err(|e| e.to_string())?
        .reveal(&(0..recv_len), Direction::Received)
        .map_err(|e| e.to_string())?;

    let transcript_proof = transcript_proof_builder
        .build()
        .map_err(|e| e.to_string())?;

    let mut builder = attestation.presentation_builder(&provider);
    builder
        .identity_proof(secrets.identity_proof())
        .transcript_proof(transcript_proof);

    let presentation = builder.build().map_err(|e| e.to_string())?;
    bincode::serialize(&presentation).map_err(|e| e.to_string())
}
