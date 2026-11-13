//! Autentikasi agent `osc_auto` (bab 5.8): HMAC-SHA256 per-request.
//!
//! Headers wajib:
//! - `X-Agent-Id`: UUID agent (= id ManagedNode dinamis hasil enroll).
//! - `X-Agent-Timestamp`: unix detik — jendela replay ±30 s.
//! - `X-Agent-Signature`: hex HMAC-SHA256 atas kanonis
//!   `{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}`.
//!
//! `company_id` TIDAK pernah dibaca dari body — selalu dari baris agent di
//! database (strict tenant isolation, bab 5.6). Extractor memverifikasi
//! signature SETELAH body dibaca (signature mengikat hash body), sehingga
//! implementasinya `FromRequest` (bukan `FromRequestParts`).

use axum::body::Body;
use axum::extract::Request;
use axum::extract::FromRequest;
use axum::http::header::HeaderName;
use data_encoding::HEXLOWER;
use serde::de::DeserializeOwned;
use uuid::Uuid;

use crate::infrastructure::hmac;
use crate::infrastructure::hmac::hmac_sha256;
use crate::presentation::error::AppError;
use crate::presentation::http::state::AppState;

/// Batas ukuran body ingest agent (batch metrik/inventaris/log).
pub const MAX_AGENT_BODY: usize = 4 * 1024 * 1024;

const HDR_AGENT_ID: HeaderName = HeaderName::from_static("x-agent-id");
const HDR_TIMESTAMP: HeaderName = HeaderName::from_static("x-agent-timestamp");
const HDR_SIGNATURE: HeaderName = HeaderName::from_static("x-agent-signature");

/// Identitas agent terverifikasi per-request.
#[derive(Debug, Clone)]
pub struct AgentContext {
    pub agent_id: Uuid,
    /// Tenant owner — sumber kebenaran: baris `assets` agent, bukan body.
    pub company_id: Uuid,
}

/// Payload agent + konteks terverifikasi — extractor handler:
/// `AgentRequest<T>` (signature diverifikasi atas `sha256(body)`).
pub struct AgentRequest<T> {
    pub ctx: AgentContext,
    pub body: T,
}

/// Body mentah (biner) + konteks terverifikasi — dipakai endpoint unggah
/// biner agent (rekaman sesi PAM). Signature HMAC tetap mengikat
/// `sha256(body)`; ukuran dibatasi `max_bytes` (streaming to_bytes).
pub struct AgentUpload {
    pub ctx: AgentContext,
    pub body: Vec<u8>,
}

impl FromRequest<AppState> for AgentUpload {
    type Rejection = AppError;

    async fn from_request(req: Request, state: &AppState) -> Result<Self, Self::Rejection> {
        let (parts, body): (axum::http::request::Parts, Body) = req.into_parts();

        let agent_id = parts
            .headers
            .get(&HDR_AGENT_ID)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| Uuid::parse_str(value).ok())
            .ok_or(AppError::Unauthorized("header X-Agent-Id tidak valid".into()))?;
        let timestamp = parts
            .headers
            .get(&HDR_TIMESTAMP)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<i64>().ok())
            .ok_or(AppError::Unauthorized("header X-Agent-Timestamp tidak valid".into()))?;
        let provided_sig = parts
            .headers
            .get(&HDR_SIGNATURE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| HEXLOWER.decode(value.as_bytes()).ok())
            .ok_or(AppError::Unauthorized("header X-Agent-Signature tidak valid".into()))?;

        // Anti-replay: jendela ±30 detik (bab 5.8).
        let now = chrono::Utc::now().timestamp();
        if !hmac::timestamp_valid(timestamp, now) {
            return Err(AppError::Unauthorized(
                "tanda tangan kedaluwarsa / timestamp melampaui jendela replay".into(),
            ));
        }

        let identity = state
            .store
            .agent_identity_load(agent_id)
            .await
            .map_err(AppError::from)?
            .ok_or(AppError::Unauthorized("agent tidak terdaftar".into()))?;
        let ciphertext = data_encoding::BASE64
            .decode(identity.hmac_secret_enc.as_bytes())
            .map_err(|_| AppError::Unauthorized("vault secret agent korup".into()))?;
        let secret = state.crypto.envelope_decrypt(&ciphertext).map_err(AppError::from)?;

        // Cap ukuran dari konfigurasi (rekaman sesi PAM > default ingest).
        let max_bytes = state.config.pam_recording_max_bytes;
        let body_bytes = axum::body::to_bytes(body, max_bytes)
            .await
            .map_err(|_| AppError::PayloadTooLarge)?;
        let body_hash = crate::infrastructure::crypto::sha256_hex(&body_bytes);
        let message = hmac::signature_message(
            timestamp,
            parts.method.as_str(),
            parts.uri.path(),
            &body_hash,
        );
        let expected = hmac_sha256(&secret, message.as_bytes());
        if !hmac::constant_time_eq(&expected, &provided_sig) {
            return Err(AppError::Unauthorized("signature HMAC tidak cocok".into()));
        }

        let content_type = parts
            .headers
            .get(axum::http::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let _ = content_type; // diagnostik opsional — format ditentukan query `?format=`

        // Heartbeat agent (best-effort).
        state.store.agent_touch(agent_id).await;

        Ok(Self {
            ctx: AgentContext { agent_id, company_id: identity.company_id },
            body: body_bytes.to_vec(),
        })
    }
}

impl<T> FromRequest<AppState> for AgentRequest<T>
where
    T: DeserializeOwned + Send,
{
    type Rejection = AppError;

    async fn from_request(req: Request, state: &AppState) -> Result<Self, Self::Rejection> {
        let (parts, body): (axum::http::request::Parts, Body) = req.into_parts();

        let agent_id = parts
            .headers
            .get(&HDR_AGENT_ID)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| Uuid::parse_str(value).ok())
            .ok_or(AppError::Unauthorized("header X-Agent-Id tidak valid".into()))?;
        let timestamp = parts
            .headers
            .get(&HDR_TIMESTAMP)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<i64>().ok())
            .ok_or(AppError::Unauthorized("header X-Agent-Timestamp tidak valid".into()))?;
        let provided_sig = parts
            .headers
            .get(&HDR_SIGNATURE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| HEXLOWER.decode(value.as_bytes()).ok())
            .ok_or(AppError::Unauthorized("header X-Agent-Signature tidak valid".into()))?;

        // Anti-replay: jendela ±30 detik (bab 5.8).
        let now = chrono::Utc::now().timestamp();
        if !hmac::timestamp_valid(timestamp, now) {
            return Err(AppError::Unauthorized(
                "tanda tangan kedaluwarsa / timestamp melampaui jendela replay".into(),
            ));
        }

        // Secret dari vault DB (metadata assets) — Envelope AES-256-GCM.
        let identity = state
            .store
            .agent_identity_load(agent_id)
            .await
            .map_err(AppError::from)?
            .ok_or(AppError::Unauthorized("agent tidak terdaftar".into()))?;
        let ciphertext = data_encoding::BASE64
            .decode(identity.hmac_secret_enc.as_bytes())
            .map_err(|_| AppError::Unauthorized("vault secret agent korup".into()))?;
        let secret = state.crypto.envelope_decrypt(&ciphertext).map_err(AppError::from)?;

        // Body hash ikut dalam kanonis signature — tampering terdeteksi.
        let body_bytes = axum::body::to_bytes(body, MAX_AGENT_BODY)
            .await
            .map_err(|_| AppError::Validation("body ingest tidak dapat dibaca".into()))?;
        let body_hash = crate::infrastructure::crypto::sha256_hex(&body_bytes);
        let message = hmac::signature_message(
            timestamp,
            parts.method.as_str(),
            parts.uri.path(),
            &body_hash,
        );
        let expected = hmac_sha256(&secret, message.as_bytes());
        if !hmac::constant_time_eq(&expected, &provided_sig) {
            return Err(AppError::Unauthorized("signature HMAC tidak cocok".into()));
        }

        let body_value: T = serde_json::from_slice(&body_bytes)
            .map_err(|_| AppError::Validation("payload JSON agent tidak valid".into()))?;

        // Heartbeat agent (best-effort).
        state.store.agent_touch(agent_id).await;

        let ctx = AgentContext { agent_id, company_id: identity.company_id };
        Ok(Self { ctx, body: body_value })
    }
}
