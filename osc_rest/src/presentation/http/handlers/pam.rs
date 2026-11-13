//! Handler Wave 3 — PAM Vault & Session Authorization (pola JumpServer):
//!
//! - CRUD `/api/v1/pam/accounts` — vault akun; secret/password/private key
//!   dienkripsi Envelope AES-256-GCM (`APP_MASTER_ENCRYPTION_KEY`) dan
//!   TIDAK PERNAH dikembalikan dalam respons apa pun.
//! - `POST /api/v1/pam/sessions/authorize` — mandatory MFA (`403
//!   MFA_REQUIRED_FOR_PAM` bila `user.mfa_enabled == false`) + step-up OTP
//!   bila verifikasi terakhir > window policy (default 15 menit, `403
//!   PAM_STEP_UP_REQUIRED`) → ephemeral session ticket (TTL pendek,
//!   sekali tampil; DB hanya SHA-256) untuk `pam_bastion_gateway`.
//! - `POST /api/v1/agents/pam/ticket/redeem` — HMAC gateway: tukar ticket
//!   → kredensial target (didekripsi sekali) + mark ACTIVE.
//! - `POST /api/v1/pam/sessions/{id}/recording` — HMAC gateway: unggah
//!   rekaman terminal ke bucket privat RustFS `RUSTFS_BUCKET_PAM`
//!   (immutable — pointer di `pam_session_logs` + registry `file_assets`).
//!
//! Setiap keputusan authorize (lolos/ditolak) tercatat append-only di
//! `pam_session_logs` (audit immutable, bab 5.6).

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::application::pam as usecases;
use crate::domain::error::DomainError;
use crate::domain::model::ActivityLogData;
use crate::infrastructure::store::pam::{PamAccountNew, PamAccountPatch, PamPolicyRow};
use crate::presentation::error::AppError;
use crate::presentation::http::agent_auth::{AgentRequest, AgentUpload};
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

// ======================================================================
// Vault accounts CRUD (JWT)
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct PamAccountCreateRequest {
    pub asset_id: Uuid,
    #[serde(default)]
    pub policy_id: Option<Uuid>,
    pub label: String,
    /// `SSH_PASSWORD` | `SSH_KEY` | `DATABASE` | `HTTP_ENDPOINT`.
    pub account_type: String,
    pub username: String,
    /// Secret plaintext (password / private key) — dienkripsi server-side,
    /// tidak pernah di-log maupun dikembalikan.
    pub secret: String,
    #[serde(default = "default_port")]
    pub port: i32,
}

fn default_port() -> i32 {
    22
}

/// `POST /api/v1/pam/accounts` — secret dienkripsi sebelum persist.
pub async fn create_account(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<PamAccountCreateRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;

    let label = payload.label.trim();
    if label.is_empty() || label.chars().count() > 150 {
        return Err(AppError::Validation("label wajib 1–150 karakter".into()));
    }
    let username = payload.username.trim();
    if username.is_empty() || username.chars().count() > 150 {
        return Err(AppError::Validation("username wajib 1–150 karakter".into()));
    }
    if payload.secret.is_empty() || payload.secret.len() > 32 * 1024 {
        return Err(AppError::Validation("secret wajib 1–32768 byte".into()));
    }
    let port = payload.port.clamp(1, 65_535);
    let account_type = usecases::validate_account_type(&payload.account_type).map_err(AppError::from)?;

    // Envelope AES-256-GCM: DEK acak per secret, KEK dari env (vault 2 lapis
    // — anti-pattern AES-ECB JumpServer legacy, audit-c §6).
    let ciphertext = state
        .crypto
        .envelope_encrypt(payload.secret.as_bytes())
        .map_err(AppError::from)?;

    let account_id = state
        .store
        .pam_account_create(PamAccountNew {
            company_id,
            asset_id: payload.asset_id,
            policy_id: payload.policy_id,
            label,
            account_type: &account_type,
            username,
            secret_encrypted: ciphertext,
            port,
        })
        .await
        .map_err(AppError::from)?;

    state
        .store
        .activity_log(ActivityLogData {
            company_id: Some(company_id),
            user_id: Some(ctx.user_id),
            action: "PAM_ACCOUNT_CREATE",
            entity_type: Some("pam_vault_account"),
            entity_id: Some(account_id),
            ip_address: None,
            user_agent: None,
            detail: Some(json!({ "label": label, "account_type": account_type })),
        })
        .await;

    let account = state
        .store
        .pam_account_summary(company_id, account_id)
        .await
        .map_err(AppError::from)?;
    Ok((StatusCode::CREATED, Json(json!({ "status": "success", "data": account }))).into_response())
}

/// `GET /api/v1/pam/accounts` — metadata vault tanpa secret.
pub async fn list_accounts(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<crate::presentation::http::handlers::files::FileListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let rows = state
        .store
        .pam_accounts_list(company_id, query.limit.unwrap_or(100))
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": { "accounts": rows, "count": rows.len() } })))
}

/// `GET /api/v1/pam/accounts/{id}` — metadata akun (tanpa secret).
pub async fn get_account(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(account_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let account = state
        .store
        .pam_account_summary(company_id, account_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": account })))
}

#[derive(Debug, Deserialize)]
pub struct PamAccountUpdateRequest {
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub policy_id: Option<Option<Uuid>>,
    #[serde(default)]
    pub port: Option<i32>,
    #[serde(default)]
    pub is_active: Option<bool>,
    #[serde(default)]
    pub secret: Option<String>,
}

/// `PUT /api/v1/pam/accounts/{id}` — rotasi secret opsional (re-encrypt).
pub async fn update_account(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(account_id): Path<Uuid>,
    Json(payload): Json<PamAccountUpdateRequest>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;

    let label = payload
        .label
        .as_deref()
        .map(str::trim)
        .filter(|l| !l.is_empty() && l.chars().count() <= 150)
        .map(str::to_owned);
    if let Some(secret) = payload.secret.as_deref()
        && (secret.is_empty() || secret.len() > 32 * 1024)
    {
        return Err(AppError::Validation("secret wajib 1–32768 byte".into()));
    }

    // Rotasi secret: re-encrypt plaintext baru (None = biarkan).
    let secret_encrypted = match payload.secret.as_deref() {
        None => None,
        Some(secret) => Some(
            state
                .crypto
                .envelope_encrypt(secret.as_bytes())
                .map_err(AppError::from)?,
        ),
    };

    state
        .store
        .pam_account_update(
            company_id,
            account_id,
            PamAccountPatch {
                label,
                policy_id: payload.policy_id,
                port: payload.port.map(|p| p.clamp(1, 65_535)),
                is_active: payload.is_active,
                secret_encrypted,
            },
        )
        .await
        .map_err(AppError::from)?;

    state
        .store
        .activity_log(ActivityLogData {
            company_id: Some(company_id),
            user_id: Some(ctx.user_id),
            action: "PAM_ACCOUNT_UPDATE",
            entity_type: Some("pam_vault_account"),
            entity_id: Some(account_id),
            ip_address: None,
            user_agent: None,
            detail: Some(json!({ "secret_rotated": payload.secret.is_some() })),
        })
        .await;

    let account = state
        .store
        .pam_account_summary(company_id, account_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": account })))
}

/// `DELETE /api/v1/pam/accounts/{id}` — soft delete (audit tetap utuh).
pub async fn delete_account(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(account_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    state
        .store
        .pam_account_delete(company_id, account_id)
        .await
        .map_err(AppError::from)?;

    state
        .store
        .activity_log(ActivityLogData {
            company_id: Some(company_id),
            user_id: Some(ctx.user_id),
            action: "PAM_ACCOUNT_DELETE",
            entity_type: Some("pam_vault_account"),
            entity_id: Some(account_id),
            ip_address: None,
            user_agent: None,
            detail: None,
        })
        .await;

    Ok((
        StatusCode::OK,
        Json(json!({ "status": "success", "data": { "deleted": true } })),
    )
        .into_response())
}

// ======================================================================
// Session authorization (mandatory MFA + step-up)
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct PamAuthorizeRequest {
    pub account_id: Uuid,
    /// OTP baru — wajib bila verifikasi MFA terakhir di luar window
    /// step-up (default 15 menit) atau pada percobaan pertama sesi.
    #[serde(default)]
    pub otp: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
    /// Durasi sesi diinginkan (di-clamp ke policy `max_session_minutes`).
    #[serde(default)]
    pub duration_minutes: Option<i32>,
}

/// `POST /api/v1/pam/sessions/authorize` — satu pintu ke bastion:
/// 1. Akun vault milik tenant + policy aktif (policy NULL → ditolak).
/// 2. `mfa_enabled == false` → 403 `MFA_REQUIRED_FOR_PAM` (hard reject).
/// 3. CIDR allowlist sumber (policy) → 403 `PAM_POLICY_DENIED`.
/// 4. approval/ticket staging → 403 `PAM_POLICY_DENIED` (W4 workflow).
/// 5. Step-up: verifikasi terakhir > window → wajib `otp` baru.
/// 6. Terbitkan ephemeral ticket (TTL pendek) + catat AUTHORIZED.
pub async fn authorize(
    State(state): State<AppState>,
    ctx: AuthContext,
    headers: HeaderMap,
    Json(payload): Json<PamAuthorizeRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let source_ip = forwarded_ip(&headers);

    // --- 0. User (state MFA) ---
    let user = state
        .store
        .user_by_id(ctx.user_id)
        .await
        .filter(|user| user.is_active)
        .ok_or(AppError::Unauthorized("akun tidak aktif".into()))?;

    // --- 1. Akun vault (anti IDOR: scope company aktif) ---
    let account = state
        .store
        .pam_account_load(company_id, payload.account_id)
        .await
        .map_err(AppError::from)?
        .ok_or(AppError::NotFound)?;
    if !account.is_active {
        return Err(AppError::Validation("akun vault tidak aktif".into()));
    }

    // --- 2. Policy aktif (NULL = tidak dapat diakses — skema P3) ---
    let policy_id = account.policy_id;
    let policy = match policy_id {
        None => {
            denied(&state, company_id, account.id, None, ctx.user_id, source_ip.as_deref(), "PAM_ACCOUNT_NO_POLICY").await;
            return Err(DomainError::PolicyDenied(
                "akun vault tidak memiliki access policy aktif".into(),
            )
            .into());
        }
        Some(policy_id) => state
            .store
            .pam_policy_load(company_id, policy_id)
            .await
            .map_err(AppError::from)?
            .filter(|policy| policy.is_active),
    };
    let policy = match policy {
        None => {
            denied(&state, company_id, account.id, policy_id, ctx.user_id, source_ip.as_deref(), "PAM_POLICY_INACTIVE").await;
            return Err(DomainError::PolicyDenied("access policy tidak aktif".into()).into());
        }
        Some(policy) => policy,
    };

    // --- 3. MANDATORY MFA (bab 5.3): tanpa MFA = tanpa PAM, tanpa kecuali ---
    if !user.mfa_enabled {
        denied(
            &state,
            company_id,
            account.id,
            policy_id,
            ctx.user_id,
            source_ip.as_deref(),
            "MFA_REQUIRED_FOR_PAM",
        )
        .await;
        return Err(DomainError::PamMfaRequired.into());
    }

    // --- 4. CIDR allowlist sumber (deny-by-default bila policy menetapkan) ---
    if !policy_cidr_ok(&policy, source_ip.as_deref()) {
        denied(
            &state,
            company_id,
            account.id,
            policy_id,
            ctx.user_id,
            source_ip.as_deref(),
            "PAM_POLICY_SOURCE_CIDR",
        )
        .await;
        return Err(DomainError::PolicyDenied(
            "IP sumber di luar allowlist policy PAM".into(),
        )
        .into());
    }

    // --- 5. ACL staging approval/ticket (workflow W4 — deny-by-default) ---
    if policy.approval_required {
        denied(&state, company_id, account.id, policy_id, ctx.user_id, source_ip.as_deref(), "PAM_POLICY_APPROVAL_REQUIRED").await;
        return Err(DomainError::PolicyDenied(
            "policy menuntut approval — workflow persetujuan belum tersedia".into(),
        )
        .into());
    }
    if policy.ticket_required {
        denied(&state, company_id, account.id, policy_id, ctx.user_id, source_ip.as_deref(), "PAM_POLICY_TICKET_REQUIRED").await;
        return Err(DomainError::PolicyDenied(
            "policy menuntut tiket change terkait".into(),
        )
        .into());
    }

    // --- 6. MANDATORY STEP-UP (bab 5.3): verifikasi terakhir > window ---
    let step_up = usecases::step_up_state(user.mfa_last_verified_step, policy.step_up_window_minutes);
    let otp = payload.otp.as_deref().map(str::trim).filter(|o| !o.is_empty());

    if step_up.required && otp.is_none() {
        // Bukan penolakan — instruksi: kirim OTP baru pada authorize yang sama.
        return Err(DomainError::PamStepUpRequired(format!(
            "verifikasi MFA terakhir {} detik lalu melebihi window {} detik — kirim otp baru",
            step_up.age_seconds, step_up.window_seconds
        ))
        .into());
    }
    if let Some(otp) = otp {
        verify_pam_otp(&state, &user, otp, company_id, account.id, policy_id, source_ip.as_deref()).await?;
    }

    // --- 7. Terbitkan sesi AUTHORIZED + ephemeral ticket ---
    let ticket = usecases::new_ticket();
    let ticket_hash = usecases::ticket_hash(&ticket);
    let session_id = Uuid::now_v7();
    state
        .store
        .pam_session_authorized(crate::infrastructure::store::pam::PamSessionAuthorized {
            session_id,
            company_id,
            account_id: account.id,
            policy_id,
            requested_by: ctx.user_id,
            source_ip: source_ip.as_deref(),
            ws_ticket_hash: &ticket_hash,
        })
        .await
        .map_err(AppError::from)?;

    let duration_minutes = usecases::effective_session_minutes(payload.duration_minutes, policy.max_session_minutes);
    state
        .store
        .activity_log(ActivityLogData {
            company_id: Some(company_id),
            user_id: Some(ctx.user_id),
            action: "PAM_SESSION_AUTHORIZED",
            entity_type: Some("pam_session_log"),
            entity_id: Some(session_id),
            ip_address: source_ip.as_deref(),
            user_agent: None,
            detail: Some(json!({
                "account_id": account.id,
                "policy_id": policy_id,
                "reason": payload.reason.as_deref().map(|r| r.chars().take(300).collect::<String>()),
                "duration_minutes": duration_minutes,
            })),
        })
        .await;

    let ticket_ttl = state.config.pam_ticket_ttl_seconds.clamp(30, 600);
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "status": "success",
            "data": {
                "session_id": session_id,
                "gateway": "pam_bastion_gateway",
                "ticket": ticket,
                "ticket_ttl_seconds": ticket_ttl,
                "duration_minutes": duration_minutes,
                "account": {
                    "id": account.id,
                    "label": account.label,
                    "username": account.username,
                    "account_type": account.account_type,
                    "asset_id": account.asset_id,
                    "port": account.port,
                },
                "policy": {
                    "id": policy.id,
                    "name": policy.name,
                    "mfa_required": policy.mfa_required,
                    "command_filter": policy.command_filter,
                },
            }
        })),
    )
        .into_response())
}

/// Verifikasi OTP step-up: rate-limit (5 kegagalan/15 menit), anti-replay
/// step, audit DENIED bila gagal.
async fn verify_pam_otp(
    state: &AppState,
    user: &crate::domain::model::User,
    otp: &str,
    company_id: Uuid,
    account_id: Uuid,
    policy_id: Option<Uuid>,
    source_ip: Option<&str>,
) -> Result<(), AppError> {
    let key = format!("mfa:{}", user.id);
    state.mfa_limiter.gate(&key).map_err(AppError::from)?;

    let secret_encrypted = user
        .mfa_secret_encrypted
        .clone()
        .ok_or_else(|| AppError::Forbidden("MFA belum di-setup".into()))?;
    let secret = state.crypto.envelope_decrypt(&secret_encrypted).map_err(AppError::from)?;

    let outcome = state.crypto.verify_totp(&secret, otp, user.mfa_last_verified_step);
    match outcome {
        crate::domain::model::OtpOutcome::Valid { step } => {
            state.mfa_limiter.clear(&key);
            state.store.mfa_step_set(user.id, step).await.map_err(AppError::from)?;
            Ok(())
        }
        crate::domain::model::OtpOutcome::Invalid => {
            state.mfa_limiter.register_failure(&key);
            denied(state, company_id, account_id, policy_id, user.id, source_ip, "PAM_OTP_INVALID").await;
            Err(AppError::Unauthorized("OTP tidak valid/replay".into()))
        }
    }
}

/// CIDR allowlist: kosong = izinkan; IP sumber tidak dikenal + policy
/// menetapkan allowlist = tolak (tidak menebak).
fn policy_cidr_ok(policy: &PamPolicyRow, source_ip: Option<&str>) -> bool {
    if policy.allowed_source_cidrs.is_empty() {
        return true;
    }
    match source_ip.and_then(|ip| ip.parse::<std::net::IpAddr>().ok()) {
        Some(ip) => crate::infrastructure::cidr::ip_in_allowlist(&policy.allowed_source_cidrs, ip),
        None => false,
    }
}

/// `X-Forwarded-For` hop pertama (BFF osc_site meneruskan klien).
fn forwarded_ip(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|ip| ip.parse::<std::net::IpAddr>().is_ok())
        .map(str::to_owned)
}

/// Catat penolakan (session log DENIED + activity log) — helper audit.
async fn denied(
    state: &AppState,
    company_id: Uuid,
    account_id: Uuid,
    policy_id: Option<Uuid>,
    user_id: Uuid,
    source_ip: Option<&str>,
    reason: &str,
) {
    state
        .store
        .pam_session_denied(company_id, account_id, policy_id, Some(user_id), source_ip, reason)
        .await;
    state
        .store
        .activity_log(ActivityLogData {
            company_id: Some(company_id),
            user_id: Some(user_id),
            action: "PAM_SESSION_DENIED",
            entity_type: Some("pam_vault_account"),
            entity_id: Some(account_id),
            ip_address: source_ip,
            user_agent: None,
            detail: Some(json!({ "reason": reason, "policy_id": policy_id })),
        })
        .await;
}

// ======================================================================
// Session audit (JWT)
// ======================================================================

/// `GET /api/v1/pam/sessions` — riwayat sesi tenant.
pub async fn sessions_list(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<crate::presentation::http::handlers::files::FileListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let rows = state
        .store
        .pam_sessions_list(company_id, query.limit.unwrap_or(100))
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": { "sessions": rows, "count": rows.len() } })))
}

/// `GET /api/v1/pam/sessions/{id}` — detail satu sesi (anti IDOR).
pub async fn session_get(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(session_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let session = state
        .store
        .pam_session_get(company_id, session_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": session })))
}

// ======================================================================
// Ticket redeem (HMAC gateway)
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct TicketRedeemRequest {
    pub session_id: Uuid,
    /// Plaintext ticket dari respons authorize — sekali pakai.
    pub ticket: String,
}

/// `POST /api/v1/agents/pam/ticket/redeem` — `pam_bastion_gateway` menukar
/// ticket sekali pakai dengan kredensial target (didekripsi sekali di sini,
/// dikirim ke gateway internal; koneksi user tidak pernah melihat secret).
pub async fn ticket_redeem(
    State(state): State<AppState>,
    request: AgentRequest<TicketRedeemRequest>,
) -> Result<Response, AppError> {
    let company_id = request.ctx.company_id;
    let session = state
        .store
        .pam_session_redeem_load(company_id, request.body.session_id)
        .await
        .map_err(AppError::from)?
        .ok_or(AppError::NotFound)?;

    // Ticket hash cocok + status masih AUTHORIZED (sekali pakai atomik).
    let provided_hash = usecases::ticket_hash(request.body.ticket.trim());
    let hash_ok = session
        .ws_ticket_hash
        .as_deref()
        .is_some_and(|stored| crate::infrastructure::hmac::constant_time_eq(stored.as_bytes(), provided_hash.as_bytes()));
    if !hash_ok {
        return Err(AppError::Unauthorized("ticket PAM tidak cocok".into()));
    }
    if session.status != "AUTHORIZED" {
        return Err(AppError::Conflict("ticket PAM sudah ditebus/ditutup".into()));
    }
    // TTL: ticket kedaluwarsa bila created_at + ttl < now.
    let ttl = chrono::Duration::seconds(state.config.pam_ticket_ttl_seconds.clamp(30, 600));
    if chrono::Utc::now() - session.created_at > ttl {
        return Err(AppError::Unauthorized("ticket PAM kedaluwarsa".into()));
    }

    let activated = state
        .store
        .pam_session_mark_active(session.id)
        .await
        .map_err(AppError::from)?;
    if !activated {
        return Err(AppError::Conflict("ticket PAM sudah ditebus/ditutup".into()));
    }

    // Secret didekripsi SEKALI untuk gateway (jalur internal; tidak di-log).
    let secret = state
        .crypto
        .envelope_decrypt(&session.secret_encrypted)
        .map_err(AppError::from)?;
    let secret = String::from_utf8(secret)
        .map_err(|_| AppError::Internal("secret vault bukan UTF-8 valid".into()))?;

    state
        .store
        .activity_log(ActivityLogData {
            company_id: Some(company_id),
            user_id: None,
            action: "PAM_TICKET_REDEEMED",
            entity_type: Some("pam_session_log"),
            entity_id: Some(session.id),
            ip_address: None,
            user_agent: None,
            detail: Some(json!({ "agent_id": request.ctx.agent_id })),
        })
        .await;

    let target_host = usecases::target_host(session.fqdn.as_deref(), session.hostname.as_deref(), session.mgmt_ip.as_deref());
    Ok((
        StatusCode::OK,
        Json(json!({
            "status": "success",
            "data": {
                "session_id": session.id,
                "target": {
                    "asset_id": session.asset_id,
                    "asset_name": session.asset_name,
                    "host": target_host,
                    "port": session.port,
                },
                "account": {
                    "username": session.username,
                    "account_type": session.account_type,
                    "secret": secret,
                },
                "policy": {
                    "command_filter": session.command_filter,
                    "max_session_minutes": session.max_session_minutes,
                },
            }
        })),
    )
        .into_response())
}

// ======================================================================
// Immutable session recording (HMAC gateway → RustFS privat)
// ======================================================================

/// Format rekaman diterima (query `?format=`) — ekstensi + magic bytes.
pub const RECORDING_FORMATS: &[(&str, &str, &str)] = &[
    // (format, ekstensi, content-type)
    ("CAST_GZ", "cast.gz", "application/gzip"),
    ("ASCIINEMA", "cast", "application/json"),
    ("MP4", "mp4", "video/mp4"),
];

#[derive(Debug, Deserialize)]
pub struct RecordingQuery {
    #[serde(default = "default_format")]
    pub format: String,
}

fn default_format() -> String {
    "CAST_GZ".into()
}

/// `POST /api/v1/pam/sessions/{id}/recording?format=CAST_GZ` — body biner
/// (raw octet-stream) ber-HMAC. Rekaman disimpan ke bucket privat
/// `RUSTFS_BUCKET_PAM` (immutable); DB hanya metadata + pointer (bab 5.8).
pub async fn recording_upload(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Query(query): Query<RecordingQuery>,
    upload: AgentUpload,
) -> Result<Response, AppError> {
    let company_id = upload.ctx.company_id;

    // Validasi format + magic bytes (bukan sekadar extension).
    let format = query.format.trim().to_uppercase();
    let Some((_, extension, content_type)) = RECORDING_FORMATS.iter().find(|(name, _, _)| *name == format) else {
        return Err(AppError::Validation(format!(
            "format rekaman tidak valid (salah satu dari: {})",
            RECORDING_FORMATS.iter().map(|(name, _, _)| *name).collect::<Vec<_>>().join(", ")
        )));
    };
    validate_magic_bytes(&format, &upload.body).map_err(AppError::from)?;

    // Sesi milik tenant (anti IDOR lintas company).
    let session = state
        .store
        .pam_session_get(company_id, session_id)
        .await
        .map_err(AppError::from)?;

    let sha256 = crate::infrastructure::crypto::sha256_hex(&upload.body);
    // Key acak per objek (UUIDv7) — anti path-traversal + anti-enumerasi.
    let object_key = format!("pam/{company_id}/{session_id}/{}.{extension}", Uuid::now_v7().simple());

    state
        .storage
        .put_object_in(
            &state.config.rustfs_bucket_pam,
            &object_key,
            upload.body.clone(),
            content_type,
        )
        .await
        .map_err(AppError::from)?;

    // Registry file_assets (audit objek) + pointer di sesi.
    let file_id = state
        .store
        .file_create(crate::infrastructure::store::files::FileMetaNew {
            company_id,
            category: "PAM_RECORDING",
            bucket: state.config.rustfs_bucket_pam.clone(),
            object_key: object_key.clone(),
            file_name: format!("{session_id}.{extension}"),
            mime_type: Some((*content_type).to_owned()),
            size_bytes: upload.body.len() as i64,
            sha256: Some(sha256.clone()),
            uploaded_by_user_id: None,
        })
        .await
        .map_err(AppError::from)?;

    state
        .store
        .pam_session_set_recording(company_id, session_id, &object_key)
        .await
        .map_err(AppError::from)?;

    state
        .store
        .activity_log(ActivityLogData {
            company_id: Some(company_id),
            user_id: None,
            action: "PAM_RECORDING_UPLOADED",
            entity_type: Some("pam_session_log"),
            entity_id: Some(session_id),
            ip_address: None,
            user_agent: None,
            detail: Some(json!({
                "file_id": file_id,
                "size_bytes": upload.body.len(),
                "sha256": sha256,
                "session_status": session.get("status").cloned().unwrap_or(json!(null)),
            })),
        })
        .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "status": "success",
            "data": {
                "session_id": session_id,
                "file_id": file_id,
                "bucket": state.config.rustfs_bucket_pam,
                "object_key": object_key,
                "size_bytes": upload.body.len(),
                "sha256": sha256,
            }
        })),
    )
        .into_response())
}

/// Magic bytes: gzip `1F 8B` (cast/asciinema), MP4 `ftyp` @ offset 4.
fn validate_magic_bytes(format: &str, bytes: &[u8]) -> Result<(), DomainError> {
    match format {
        "CAST_GZ" | "ASCIINEMA" => {
            let is_gzip = bytes.len() > 2 && bytes[0] == 0x1F && bytes[1] == 0x8B;
            // ASCIINEMA juga menerima JSON polos (`{"version":2,...}`).
            let is_json = bytes.first().is_some_and(|b| *b == b'{');
            if is_gzip || (format == "ASCIINEMA" && is_json) {
                Ok(())
            } else {
                Err(DomainError::validation(
                    "rekaman bukan gzip/json valid (magic bytes ditolak)",
                ))
            }
        }
        "MP4" => {
            let ok = bytes.len() > 8 && &bytes[4..8] == b"ftyp";
            if ok {
                Ok(())
            } else {
                Err(DomainError::validation("rekaman bukan MP4 valid (magic bytes ditolak)"))
            }
        }
        _ => Err(DomainError::validation("format rekaman tidak dikenal")),
    }
}

// Re-export tidak diperlukan — semua tipe dipakai langsung di handler.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn magic_bytes_gzip_dan_mp4() {
        let gzip = vec![0x1F, 0x8B, 0x08, 0x00];
        assert!(validate_magic_bytes("CAST_GZ", &gzip).is_ok());
        assert!(validate_magic_bytes("CAST_GZ", b"MZexecutable").is_err());

        let json_cast = b"{\"version\": 2, \"width\": 80}";
        assert!(validate_magic_bytes("ASCIINEMA", json_cast).is_ok());

        let mut mp4 = vec![0u8; 12];
        mp4[4..8].copy_from_slice(b"ftyp");
        assert!(validate_magic_bytes("MP4", &mp4).is_ok());
        assert!(validate_magic_bytes("MP4", &gzip).is_err());
        assert!(validate_magic_bytes("WMV", &mp4).is_err());
    }

    #[test]
    fn forwarded_ip_mengambil_hop_pertama() {
        let mut headers = HeaderMap::new();
        assert!(forwarded_ip(&headers).is_none());
        headers.insert("x-forwarded-for", "203.0.113.7, 10.0.0.1".parse().expect("hdr"));
        assert_eq!(forwarded_ip(&headers).as_deref(), Some("203.0.113.7"));
        let mut bad = HeaderMap::new();
        bad.insert("x-forwarded-for", "bukan-ip".parse().expect("hdr"));
        assert!(forwarded_ip(&bad).is_none());
    }
}
