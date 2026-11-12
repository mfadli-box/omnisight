//! Middleware `RequestContext` — Tenant Guard (bab 5.6):
//!
//! - Verifikasi Bearer JWT (HS256) + sesi DB-backed (revocable).
//! - Scope `access`: sisipkan `AuthContext { user_id, session_id,
//!   active_company_id (dari sesi = source of truth), role_id }` ke ekstensi
//!   request. SEMUA query tenant di bawahnya wajib memakai nilai ini —
//!   developer tidak dapat "lupa" memfilter `company_id`.
//! - Scope `mfa_pending`: HANYA boleh melewati path `/api/v1/auth/mfa/*`
//!   (challenge 5 menit tanpa hak akses lain).
//! - CORS-permissive TIDAK diterapkan di sini (BFF osc_site same-origin).

use axum::extract::{Request, State};
use axum::http::header::AUTHORIZATION;
use axum::middleware::Next;
use axum::response::Response;
use uuid::Uuid;

use crate::domain::model::AuthClaims;
use crate::presentation::error::AppError;
use crate::presentation::http::state::AppState;

/// Konteks otorisasi per-request — hasil verifikasi middleware.
/// Di-extract handler via `ctx: AuthContext`.
#[derive(Debug, Clone)]
pub struct AuthContext {
    pub user_id: Uuid,
    pub session_id: Uuid,
    /// Tenant aktif — dari baris sesi DB (bukan dari klaim mentah).
    pub active_company_id: Option<Uuid>,
    /// Role aktif pada company konteks.
    pub role_id: Option<Uuid>,
    #[allow(dead_code)] // diagnostik konteks (dipakai handler wave berikut)
    pub scope: String,
    /// Super admin (platform-level, boleh lintas company eksplisit).
    pub is_super_admin: bool,
}

impl AuthContext {
    /// Tenant wajib — endpoint tenant-scoped memanggil ini untuk guard ketat.
    pub fn require_company(&self) -> Result<Uuid, AppError> {
        self.active_company_id.ok_or_else(|| {
            AppError::Forbidden("pilih company aktif terlebih dahulu (switch-company)".into())
        })
    }
}

/// Extractor handler: `ctx: AuthContext` — konteks sudah diverifikasi
/// middleware `request_context` (trust boundary tunggal).
impl axum::extract::FromRequestParts<AppState> for AuthContext {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        _state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        parts
            .extensions
            .get::<AuthContext>()
            .cloned()
            .ok_or(AppError::Unauthorized("kredensial tidak ditemukan".into()))
    }
}

/// Middleware RequestContext: pasang pada sub-router terproteksi.
pub async fn request_context(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let path = req.uri().path().to_owned();
    let token = bearer_token(&req).ok_or(AppError::Unauthorized("token tidak ditemukan".into()))?;
    let claims = state
        .crypto
        .verify_token(&token)
        .map_err(AppError::from)?;

    match claims.scope.as_str() {
        AuthClaims::SCOPE_MFA_PENDING => {
            // Challenge MFA hanya berlaku untuk endpoint MFA.
            if !path.starts_with("/api/v1/auth/mfa") {
                return Err(AppError::Unauthorized(
                    "challenge MFA tidak berlaku untuk endpoint ini".into(),
                ));
            }
            let ctx = AuthContext {
                user_id: parse_uuid(&claims.sub)?,
                session_id: Uuid::nil(),
                active_company_id: None,
                role_id: None,
                scope: claims.scope.clone(),
                is_super_admin: false,
            };
            req.extensions_mut().insert(ctx);
        }
        AuthClaims::SCOPE_ACCESS => {
            let session_id = claims
                .sid
                .as_deref()
                .map(parse_uuid)
                .transpose()?
                .ok_or(AppError::Unauthorized("sesi tidak valid".into()))?;

            // Sesi DB-backed: revocable + expiry server-side (bab 5.4).
            let session_company = state
                .store
                .session_active_company(session_id)
                .await
                .map_err(AppError::from)?
                .ok_or(AppError::Unauthorized("sesi dicabut atau kedaluwarsa".into()))?;

            let user_id = parse_uuid(&claims.sub)?;
            let user = state
                .store
                .user_by_id(user_id)
                .await
                .filter(|user| user.is_active)
                .ok_or(AppError::Unauthorized("akun tidak aktif".into()))?;

            let ctx = AuthContext {
                user_id,
                session_id,
                active_company_id: session_company,
                role_id: claims.role.as_deref().map(parse_uuid).transpose()?,
                scope: claims.scope.clone(),
                is_super_admin: user.is_super_admin,
            };
            req.extensions_mut().insert(ctx);
            // Sliding activity marker (best-effort, non-blocking error).
            state.store.session_touch(session_id).await;
        }
        other => {
            return Err(AppError::Unauthorized(format!("scope tidak dikenal: {other}")));
        }
    }

    Ok(next.run(req).await)
}

fn bearer_token(req: &Request) -> Option<String> {
    let value = req.headers().get(AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = value.split_once(' ')?;
    scheme.eq_ignore_ascii_case("bearer").then(|| token.trim().to_owned())
}

fn parse_uuid(raw: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(raw).map_err(|_| AppError::Unauthorized("identifier token tidak valid".into()))
}
