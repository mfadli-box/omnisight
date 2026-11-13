//! Handler TOTP MFA opsional + safe recovery (bab 5.3):
//! setup/enable/verify/disable, reset-request/reset-confirm, admin reset.

use axum::Json;
use axum::extract::{Path, State};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::application::mfa;
use crate::domain::error::DomainError;
use crate::presentation::error::AppError;
use crate::presentation::http::handlers::auth::user_summary;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

#[derive(Debug, Deserialize)]
pub struct MfaEnableRequest {
    pub otp: String,
}

/// `POST /api/v1/auth/mfa/setup` — generate secret + backup code
/// (plaintext hanya pada respons ini).
pub async fn setup(
    State(state): State<AppState>,
    ctx: AuthContext,
) -> Result<Json<Value>, AppError> {
    let user = load_user(&state, ctx.user_id).await?;
    if user.mfa_enabled {
        return Err(AppError::Conflict("MFA sudah aktif — disable dulu untuk re-enroll".into()));
    }
    let setup = mfa::setup(state.store.as_ref(), state.crypto.as_ref(), &user)
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": {
            "secret_base32": setup.secret_base32,
            "otpauth_url": setup.otpauth_url,
            "backup_codes": setup.backup_codes,
            "note": "simpan backup code sekarang — hanya ditampilkan sekali"
        }
    })))
}

/// `POST /api/v1/auth/mfa/enable` — konfirmasi OTP pertama.
pub async fn enable(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<MfaEnableRequest>,
) -> Result<Json<Value>, AppError> {
    let user = load_user(&state, ctx.user_id).await?;
    mfa::enable(state.store.as_ref(), state.crypto.as_ref(), &user, &payload.otp)
        .await
        .map_err(AppError::from)?;
    let user = load_user(&state, ctx.user_id).await?;

    Ok(Json(json!({
        "status": "success",
        "data": { "mfa_enabled": user.mfa_enabled }
    })))
}

#[derive(Debug, Deserialize)]
pub struct MfaVerifyRequest {
    pub otp: Option<String>,
    pub backup_code: Option<String>,
}

/// `POST /api/v1/auth/mfa/verify` — verifikasi challenge login (scope
/// mfa_pending) ATAU step-up (access token). Rate-limit 5 kegagalan.
pub async fn verify(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<MfaVerifyRequest>,
) -> Result<Json<Value>, AppError> {
    let key = format!("mfa:{}", ctx.user_id);
    state.mfa_limiter.gate(&key).map_err(AppError::from)?;

    let user = load_user(&state, ctx.user_id).await?;
    let challenge = mfa::verify_challenge(
        state.store.as_ref(),
        state.crypto.as_ref(),
        state.crypto.as_ref(),
        &user,
        payload.otp.as_deref(),
        payload.backup_code.as_deref(),
        mfa::ChallengeContext {
            ip: None,
            user_agent: None,
            token_hours: state.config.access_token_hours,
        },
    )
    .await;

    match challenge {
        Ok(verified) => {
            state.mfa_limiter.clear(&key);
            let _ = verified.used_backup_code; // tercatat sebagai MFA_RESET_SELF_BACKUP
            Ok(Json(json!({
                "status": "success",
                "data": {
                    "access_token": verified.access_token,
                    "token_type": "bearer",
                    "session_id": verified.session_id,
                    "active_company_id": verified.company.as_ref().map(|c| c.id),
                    "active_role_id": verified.role_id,
                    "mfa_reset_via_backup": verified.used_backup_code,
                    "user": user_summary(&verified.user),
                }
            })))
        }
        Err(err) => {
            state.mfa_limiter.register_failure(&key);
            Err(AppError::from(err))
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct MfaDisableRequest {
    pub password: String,
    pub otp: String,
}

/// `POST /api/v1/auth/mfa/disable` — doubleCheckPassword + OTP (bab 5.3).
pub async fn disable(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<MfaDisableRequest>,
) -> Result<Json<Value>, AppError> {
    let user = load_user(&state, ctx.user_id).await?;
    mfa::disable(
        state.store.as_ref(),
        state.crypto.as_ref(),
        &user,
        &payload.password,
        &payload.otp,
    )
    .await
    .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "mfa_enabled": false }
    })))
}

#[derive(Debug, Deserialize)]
pub struct MfaResetRequest {
    pub username: String,
    pub email: String,
}

/// `POST /api/v1/auth/mfa/reset-request` — publik; token sekali pakai
/// (TTL 10 menit) dikirim ke email terdaftar via dispatcher (W2). Respons
/// identik untuk akun dikenal/asing — anti user-enumeration.
pub async fn reset_request(
    State(state): State<AppState>,
    Json(payload): Json<MfaResetRequest>,
) -> Result<Json<Value>, AppError> {
    let user = state
        .store
        .user_by_username(payload.username.trim())
        .await
        .filter(|user| {
            user.is_active
                && user.mfa_enabled
                && user.email.eq_ignore_ascii_case(payload.email.trim())
        });

    if let Some(user) = user {
        let token = state.mfa_resets.issue(user.id);
        // Pengiriman email dilakukan flow_worker_agent (bab 5.8). Token
        // TIDAK PERNAH di-log — hanya respons debug DEV (doc: W2 swap).
        tracing::info!(user_id = %user.id, "mfa reset token diterbitkan (TTL 10m)");
        let _ = token; // produksi: masuk antrean notifikasi, bukan respons
    }

    Ok(Json(json!({
        "status": "success",
        "data": {
            "accepted": true,
            "message": "bila akun valid, token reset dikirim ke email terdaftar"
        }
    })))
}

#[derive(Debug, Deserialize)]
pub struct MfaResetConfirmRequest {
    pub username: String,
    pub token: String,
}

/// `POST /api/v1/auth/mfa/reset-confirm` — konsumsi token → reset MFA +
/// pencabutan seluruh sesi aktif (`MFA_RESET_SELF_EMAIL`).
pub async fn reset_confirm(
    State(state): State<AppState>,
    Json(payload): Json<MfaResetConfirmRequest>,
) -> Result<Json<Value>, AppError> {
    let user_id = state
        .mfa_resets
        .consume(payload.token.trim())
        .ok_or(AppError::Unauthorized("token reset tidak valid/kedaluwarsa".into()))?;

    let user = state
        .store
        .user_by_id(user_id)
        .await
        .filter(|user| user.username.eq_ignore_ascii_case(payload.username.trim()))
        .ok_or(AppError::Unauthorized("token tidak cocok dengan akun".into()))?;

    mfa::reset_confirm(state.store.as_ref(), state.crypto.as_ref(), user.id, None, None)
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": {
            "mfa_enabled": false,
            "sessions_revoked": true,
            "message": "pasang ulang MFA melalui /mfa/setup"
        }
    })))
}

#[derive(Debug, Deserialize)]
pub struct MfaAdminResetRequest {
    pub reason: String,
}

/// `POST /api/v1/users/{id}/mfa/reset` — admin-assisted reset.
/// Admin wajib super admin DAN mfa_enabled sendiri (step-up enforce).
pub async fn admin_reset(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(target): Path<Uuid>,
    Json(payload): Json<MfaAdminResetRequest>,
) -> Result<Json<Value>, AppError> {
    let actor = load_user(&state, ctx.user_id).await?;
    let reason = payload.reason.trim();
    if reason.is_empty() || reason.len() > 500 {
        return Err(AppError::Validation("reason wajib 1..=500 karakter".into()));
    }

    mfa::admin_reset(
        state.store.as_ref(),
        state.crypto.as_ref(),
        &actor,
        target,
        reason,
        None,
        None,
    )
    .await
    .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": {
            "target_user_id": target,
            "mfa_enabled": false,
            "sessions_revoked": true,
            "audited_as": "MFA_RESET"
        }
    })))
}

async fn load_user(state: &AppState, user_id: Uuid) -> Result<crate::domain::model::User, AppError> {
    state
        .store
        .user_by_id(user_id)
        .await
        .filter(|user| user.is_active)
        .ok_or(AppError::NotFound)
        .map_err(|_| AppError::from(DomainError::NotFound))
}
