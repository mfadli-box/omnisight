//! Usecase login dual-mode (reengineering.md bab 5.1–5.2):
//!
//! ```text
//! company (pilihan/default) hris_login_url terisi?
//!   ├─ ya  → HRIS GET (circuit breaker):
//!   │        1|         → sync profil + cache Argon2id → proceed
//!   │        0|…|NONE   → 401 TANPA fallback
//!   │        error      → cache offline valid? → Argon2id lokal + LOGIN_HRIS_OFFLINE_CACHE
//!   │                                        └─ selain itu → 502
//!   └─ tidak / company_id kosong → Local Login Argon2id
//! ```
//!
//! Usecase generik murni atas port domain — tanpa axum/sqlx/reqwest.

use chrono::Utc;
use uuid::Uuid;

use crate::domain::error::DomainError;
use crate::domain::model::{ActivityLogData, Company, HrisDecision, SessionData, User};
use crate::domain::ports::{AuthStore, HrisGateway, PasswordCrypto, TokenIssuer};

/// Input login tervalidasi (handler memastikan panjang/format dasar).
pub struct LoginInput<'a> {
    pub username: &'a str,
    pub password: &'a str,
    pub company_id: Option<Uuid>,
    pub ip: Option<&'a str>,
    pub user_agent: Option<&'a str>,
    /// Masa berlaku access token (jam) — dari AppConfig.
    pub token_hours: i64,
}

/// Hasil usecase login.
#[allow(clippy::large_enum_variant)] // varian Authenticated memang kaya konteks
pub enum LoginOutcome {
    /// Token access penuh diterbitkan (+ sesi DB-backed).
    Authenticated {
        access_token: String,
        session_id: Uuid,
        user: User,
        company: Option<Company>,
        role_id: Option<Uuid>,
        offline_cache: bool,
    },
    /// MFA aktif — challenge 5 menit (scope mfa_pending) diterbitkan.
    MfaRequired { challenge_token: String },
}

/// Usecase login dual-mode — orkestrasi murni atas port.
pub async fn login<S, H, C, T>(
    store: &S,
    hris: &H,
    crypto: &C,
    tokens: &T,
    input: LoginInput<'_>,
) -> Result<LoginOutcome, DomainError>
where
    S: AuthStore,
    H: HrisGateway,
    C: PasswordCrypto,
    T: TokenIssuer,
{
    let username = input.username.trim();
    if username.is_empty() || username.len() > 100 {
        return Err(DomainError::validation("username wajib 1..=100 karakter"));
    }
    if input.password.is_empty() || input.password.len() > 200 {
        return Err(DomainError::validation("password wajib 1..=200 karakter"));
    }

    let existing = store.user_by_username(username).await;

    // 1) Tentukan company: pilihan eksplisit / default access / None.
    let company = resolve_company(store, input.company_id, existing.as_ref()).await?;

    // 2) Jalankan jalur HRIS atau Local.
    let (user, offline_cache) = match company.as_ref().filter(|c| c.hris_enabled()) {
        Some(company) => {
            let template = company.hris_login_url.as_deref().unwrap_or_default();
            match hris.hris_login(template, username, input.password).await {
                Ok(HrisDecision::Accepted { profile }) => {
                    let user = hris_sync_user(store, crypto, username, &profile, input.password, company.id).await?;
                    (user, false)
                }
                Ok(HrisDecision::Rejected) => {
                    // Keputusan bisnis upstream — 401 TANPA fallback (bab 5.2).
                    log_attempt(store, existing.as_ref().map(|u| u.id), Some(company.id), "LOGIN_HRIS_REJECTED", &input).await;
                    return Err(DomainError::Unauthorized("kredensial ditolak HRIS".into()));
                }
                Err(DomainError::Upstream(reason)) => {
                    // Gangguan upstream / circuit open → fallback cache offline.
                    let user = offline_cache_user(crypto, existing, company, input.password)?;
                    log_attempt(store, Some(user.id), Some(company.id), "LOGIN_HRIS_OFFLINE_CACHE", &input).await;
                    tracing::warn!(reason = %reason, "login HRIS gagal — fallback cache offline");
                    (user, true)
                }
                Err(err) => return Err(err),
            }
        }
        // Local Login (URL kosong / company_id kosong / tanpa company default).
        _ => {
            let user = existing
                .filter(|user| user.is_active)
                .ok_or_else(|| DomainError::Unauthorized("kredensial tidak valid".into()))?;
            let hash = user.password_hash.as_deref().ok_or_else(|| {
                DomainError::Unauthorized("akun belum memiliki kredensial lokal".into())
            })?;
            if !crypto.verify_password(input.password, hash) {
                log_attempt(store, Some(user.id), company.as_ref().map(|c| c.id), "LOGIN_FAILED", &input).await;
                return Err(DomainError::Unauthorized("kredensial tidak valid".into()));
            }
            (user, false)
        }
    };

    // 3) Validasi akses company (autoprovision baru saja mengikatnya).
    let (role_id, company) = match company {
        Some(company) => {
            let access = store
                .access_list(user.id)
                .await?
                .into_iter()
                .find(|access| access.company.id == company.id)
                .ok_or(DomainError::Forbidden("tidak memiliki akses ke company ini".into()))?;
            (Some(access.role_id), Some(access.company))
        }
        None => (None, None),
    };

    // 4) MFA opsional: challenge 5 menit scope mfa_pending (bab 5.3).
    if user.mfa_enabled {
        let challenge_token = tokens.issue_token(&tokens.mfa_challenge_claims(user.id))?;
        return Ok(LoginOutcome::MfaRequired { challenge_token });
    }

    // 5) Terbitkan sesi revocable + access token.
    let session_id = Uuid::now_v7();
    let claims = tokens.access_claims(user.id, session_id, company.as_ref().map(|c| c.id), role_id, input.token_hours);
    let access_token = tokens.issue_token(&claims)?;
    store
        .session_create(SessionData {
            id: session_id,
            user_id: user.id,
            active_company_id: company.as_ref().map(|c| c.id),
            token_hash: tokens.fingerprint(&access_token),
            ip_address: input.ip.map(str::to_owned),
            user_agent: input.user_agent.map(str::to_owned),
            expires_at: Utc::now() + chrono::Duration::hours(input.token_hours),
        })
        .await?;

    Ok(LoginOutcome::Authenticated {
        access_token,
        session_id,
        user,
        company,
        role_id,
        offline_cache,
    })
}

/// Company pilihan: eksplisit (validasi aktif) / default access (is_default
/// diutamakan, bab 5.4) / None bila user tidak punya akses mana pun.
async fn resolve_company<S: AuthStore>(
    store: &S,
    company_id: Option<Uuid>,
    user: Option<&User>,
) -> Result<Option<Company>, DomainError> {
    match company_id {
        Some(id) => {
            let company = store.company_by_id(id).await.map_err(|e| match e {
                DomainError::NotFound => DomainError::validation("company tidak ditemukan"),
                other => other,
            })?;
            if !company.is_active {
                return Err(DomainError::validation("company tidak aktif"));
            }
            Ok(Some(company))
        }
        None => match user {
            Some(user) => {
                let accesses = store.access_list(user.id).await?;
                Ok(accesses
                    .iter()
                    .find(|access| access.is_default)
                    .or_else(|| accesses.first())
                    .cloned()
                    .map(|access| access.company))
            }
            None => Ok(None),
        },
    }
}

async fn log_attempt<S: AuthStore>(
    store: &S,
    user_id: Option<Uuid>,
    company_id: Option<Uuid>,
    action: &str,
    input: &LoginInput<'_>,
) {
    store
        .activity_log(ActivityLogData {
            company_id,
            user_id,
            action,
            entity_type: None,
            entity_id: None,
            ip_address: input.ip,
            user_agent: input.user_agent,
            detail: None,
        })
        .await;
}

/// Sinkronisasi user HRIS: cari/buat → sync profil → cache password Argon2id
/// (hanya hash — plaintext `{\)P}` hilang setelah request, bab 5.2).
async fn hris_sync_user<S, C>(
    store: &S,
    crypto: &C,
    username: &str,
    profile: &str,
    password: &str,
    company_id: Uuid,
) -> Result<User, DomainError>
where
    S: AuthStore,
    C: PasswordCrypto,
{
    // Profil: `nama|email|atribut…` (minimal nama + email, bab 5.2).
    let mut parts = profile.split('|').map(str::trim);
    let display_name = parts.next().filter(|s| !s.is_empty());
    let email = parts.next().filter(|s| s.contains('@'));

    let user = match store.user_by_username(username).await {
        Some(user) if user.is_active => user,
        Some(_) => return Err(DomainError::Unauthorized("akun dinonaktifkan".into())),
        None => {
            let created = store.user_create_hris(username, email, display_name).await?;
            // Ikatkan akses company dengan role standar non-privat (bab 5.2).
            let role_id = store.role_ensure("Member").await?;
            store.access_ensure(created.id, company_id, role_id).await?;
            created
        }
    };

    store.user_profile_sync(user.id, display_name, email).await?;
    let hash = crypto.hash_password(password)?;
    store.user_password_cache_update(user.id, &hash, true).await?;
    Ok(user)
}

/// Fallback cache offline: hash ada + last_hris_sync_at ≤ TTL → Argon2id
/// lokal (bab 5.2). Cache kedaluwarsa/kosong → 502 (bukan 401).
fn offline_cache_user<C: PasswordCrypto>(
    crypto: &C,
    user: Option<User>,
    company: &Company,
    password: &str,
) -> Result<User, DomainError> {
    let user = user
        .filter(|user| user.is_active)
        .ok_or(DomainError::Unauthorized("kredensial tidak valid".into()))?;

    let hash = user.password_hash.as_deref().ok_or(DomainError::Upstream(
        "tidak ada cache kredensial offline".into(),
    ))?;
    let ttl = company.hris_cache_ttl();
    let fresh = user
        .last_hris_sync_at
        .is_some_and(|synced| Utc::now() - synced <= ttl);
    if !fresh {
        return Err(DomainError::Upstream(
            "cache offline kedaluwarsa (melebihi hris_cache_ttl_hours)".into(),
        ));
    }
    if !crypto.verify_password(password, hash) {
        return Err(DomainError::Unauthorized("kredensial tidak valid".into()));
    }
    Ok(user)
}


