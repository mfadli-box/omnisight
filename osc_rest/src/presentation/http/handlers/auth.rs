//! Handler auth: daftar company publik, login dual-mode (HRIS/Local),
//! dan company switcher (bab 5.1–5.2, 5.4).

use axum::Json;
use axum::extract::State;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::application::auth::{self, LoginOutcome};
use crate::presentation::error::AppError;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

/// `GET /api/v1/auth/companies` — publik. TIDAK membocorkan
/// `hris_login_url` (hanya flag boolean) maupun secret apa pun.
pub async fn companies(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let list = state.store.companies_active().await.map_err(AppError::from)?;
    let data = list
        .iter()
        .map(|company| {
            json!({
                "id": company.id,
                "name": company.name,
                "code": company.code,
                "hris_enabled": company.hris_enabled(),
            })
        })
        .collect::<Vec<_>>();

    Ok(Json(json!({
        "status": "success",
        "data": {
            "companies": data,
            "count": data.len(),
        }
    })))
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub company_id: Option<String>,
    pub username: String,
    pub password: String,
}

/// `POST /api/v1/auth/login` — publik. Dual-mode HRIS/Local (bab 5.1–5.2).
pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<Value>, AppError> {
    let username = payload.username.trim();
    let limiter_key = format!("login:{username}");

    // Rate-limit login per username (anti credential stuffing).
    state.login_limiter.gate(&limiter_key).map_err(AppError::from)?;

    let company_id = match payload.company_id.as_deref() {
        // `company_id == ""` → Local Login / default company (bab 5.1).
        None | Some("") => None,
        Some(raw) => Some(Uuid::parse_str(raw.trim())
            .map_err(|_| AppError::Validation("company_id harus UUID".into()))?),
    };

    let input = auth::LoginInput {
        username,
        password: &payload.password,
        company_id,
        ip: None,
        user_agent: None,
        token_hours: state.config.access_token_hours,
    };

    let outcome = auth::login(
        state.store.as_ref(),
        state.hris.as_ref(),
        state.crypto.as_ref(),
        state.crypto.as_ref(),
        input,
    )
    .await;

    match outcome {
        Ok(LoginOutcome::MfaRequired { challenge_token }) => Ok(Json(json!({
            "status": "success",
            "data": {
                "mfa_required": true,
                "mfa_challenge_token": challenge_token,
            }
        }))),
        Ok(LoginOutcome::Authenticated {
            access_token,
            session_id,
            user,
            company,
            role_id,
            offline_cache,
        }) => {
            state.login_limiter.clear(&limiter_key);
            Ok(Json(json!({
                "status": "success",
                "data": {
                    "mfa_required": false,
                    "access_token": access_token,
                    "token_type": "bearer",
                    "session_id": session_id,
                    "offline_cache": offline_cache,
                    "user": user_summary(&user),
                    "active_company_id": company.as_ref().map(|c| c.id),
                    "active_role_id": role_id,
                }
            })))
        }
        Err(err) => {
            state.login_limiter.register_failure(&limiter_key);
            Err(AppError::from(err))
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SwitchCompanyRequest {
    pub company_id: String,
}

/// `POST /api/v1/auth/switch-company` — verifikasi `UserCompanyAccess`
/// lalu terbitkan ulang JWT dengan `active_company_id` baru (bab 5.4).
pub async fn switch_company(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<SwitchCompanyRequest>,
) -> Result<Json<Value>, AppError> {
    let company_id = Uuid::parse_str(payload.company_id.trim())
        .map_err(|_| AppError::Validation("company_id harus UUID".into()))?;

    let access = state
        .store
        .access_list(ctx.user_id)
        .await
        .map_err(AppError::from)?
        .into_iter()
        .find(|access| access.company.id == company_id && access.company.is_active)
        .ok_or(AppError::Forbidden("tidak memiliki akses ke company ini".into()))?;

    // Sesi DB-backed ikut berpindah konteks (source of truth RequestContext).
    state
        .store
        .session_set_company(ctx.session_id, company_id)
        .await
        .map_err(AppError::from)?;

    let claims = state.crypto.access_claims(
        ctx.user_id,
        ctx.session_id,
        Some(company_id),
        Some(access.role_id),
        state.config.access_token_hours,
    );
    let access_token = state.crypto.issue_token(&claims).map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": {
            "access_token": access_token,
            "token_type": "bearer",
            "active_company_id": company_id,
            "active_role_id": access.role_id,
            "company": {
                "id": access.company.id,
                "name": access.company.name,
                "code": access.company.code,
            }
        }
    })))
}

pub(crate) fn user_summary(user: &crate::domain::model::User) -> Value {
    json!({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "mfa_enabled": user.mfa_enabled,
        "is_super_admin": user.is_super_admin,
        "last_hris_sync_at": user.last_hris_sync_at,
    })
}
