//! Usecase TOTP MFA opsional + safe recovery (reengineering.md bab 5.3):
//! setup → enable → verify (anti-replay step, backup code sekali pakai),
//! disable (doubleCheckPassword), reset self (backup/email) & admin reset.

use uuid::Uuid;

use crate::domain::error::DomainError;
use crate::domain::model::{ActivityLogData, OtpOutcome, User};
use crate::domain::ports::{AuthStore, MfaCrypto, TokenIssuer};

/// Jumlah backup code per enrolment (standar industri 8-10).
pub const BACKUP_CODE_COUNT: usize = 10;

/// Hasil setup MFA — secret & kode hanya tampil SEKALI (plaintext tidak
/// pernah disimpan; DB hanya menerima Argon2id hash / Envelope blob).
pub struct MfaSetup {
    pub secret_base32: String,
    pub otpauth_url: String,
    pub backup_codes: Vec<String>,
}

/// Hasil verifikasi challenge (login step-2 / step-up).
pub struct MfaVerified {
    pub access_token: String,
    pub session_id: Uuid,
    pub user: User,
    pub company: Option<crate::domain::model::Company>,
    pub role_id: Option<Uuid>,
    pub used_backup_code: bool,
}

pub struct ChallengeContext<'a> {
    pub ip: Option<&'a str>,
    pub user_agent: Option<&'a str>,
    pub token_hours: i64,
}

/// Enrolment MFA: generate secret TOTP + 10 backup code (hash Argon2id),
/// `mfa_enabled` tetap `false` sampai `/enable` lolos OTP pertama.
pub async fn setup<S: AuthStore, C: MfaCrypto>(
    store: &S,
    crypto: &C,
    user: &User,
) -> Result<MfaSetup, DomainError> {
    let (secret, base32) = crypto.generate_totp_secret()?;
    let otpauth_url = crypto.otpauth_url(&secret, &format!("{} (omnisight)", user.email))?;
    let backup_codes = generate_backup_codes();
    let mut backup_hashes = Vec::with_capacity(backup_codes.len());
    for code in &backup_codes {
        backup_hashes.push(crypto.hash_backup_code(code)?);
    }

    store
        .mfa_store_secret(user.id, crypto.envelope_encrypt(&secret)?, backup_hashes)
        .await?;

    Ok(MfaSetup {
        secret_base32: base32,
        otpauth_url,
        backup_codes,
    })
}

/// Konfirmasi OTP pertama → `mfa_enabled = true` (+ simpan step anti-replay).
pub async fn enable<S: AuthStore, C: MfaCrypto>(
    store: &S,
    crypto: &C,
    user: &User,
    otp: &str,
) -> Result<(), DomainError> {
    let step = verify_otp(store, crypto, user, otp).await?;
    store.mfa_step_set(user.id, step).await?;
    store.mfa_set_enabled(user.id, true).await
}

/// Verifikasi challenge OTP/backup-code → sesi access penuh.
/// Backup code sekali pakai: dipakai di login = MFA di-reset otomatis
/// (`MFA_RESET_SELF_BACKUP`, bab 5.3 safe recovery #1).
pub async fn verify_challenge<S, C, T>(
    store: &S,
    crypto: &C,
    tokens: &T,
    user: &User,
    otp: Option<&str>,
    backup_code: Option<&str>,
    ctx: ChallengeContext<'_>,
) -> Result<MfaVerified, DomainError>
where
    S: AuthStore,
    C: MfaCrypto,
    T: TokenIssuer,
{
    let mut used_backup = false;
    let step = match (otp, backup_code) {
        (Some(otp), _) => verify_otp(store, crypto, user, otp).await?,
        (None, Some(code)) => match consume_backup_code(store, crypto, user, code).await? {
            Some(step) => {
                used_backup = true;
                step
            }
            None => return Err(DomainError::Unauthorized("backup code tidak valid".into())),
        },
        _ => return Err(DomainError::validation("otp atau backup_code wajib diisi")),
    };
    store.mfa_step_set(user.id, step).await?;

    if used_backup {
        // Safe recovery: login sukses via backup code → MFA auto-reset.
        store.activity_log(ActivityLogData {
            company_id: None,
            user_id: Some(user.id),
            action: "MFA_RESET_SELF_BACKUP",
            entity_type: Some("user"),
            entity_id: Some(user.id),
            ip_address: ctx.ip,
            user_agent: ctx.user_agent,
            detail: None,
        })
        .await;
    }

    // Konteks company default (bab 5.4) — switch-company menyusul via API.
    let accesses = store.access_list(user.id).await?;
    let default_access = accesses
        .iter()
        .find(|access| access.is_default)
        .or_else(|| accesses.first())
        .cloned();
    let (company, role_id) = match default_access {
        Some(access) => (Some(access.company), Some(access.role_id)),
        None => (None, None),
    };

    let session_id = Uuid::now_v7();
    let claims = tokens.access_claims(
        user.id,
        session_id,
        company.as_ref().map(|c| c.id),
        role_id,
        ctx.token_hours,
    );
    let access_token = tokens.issue_token(&claims)?;
    store
        .session_create(crate::domain::model::SessionData {
            id: session_id,
            user_id: user.id,
            active_company_id: company.as_ref().map(|c| c.id),
            token_hash: tokens.fingerprint(&access_token),
            ip_address: ctx.ip.map(str::to_owned),
            user_agent: ctx.user_agent.map(str::to_owned),
            expires_at: chrono::Utc::now() + chrono::Duration::hours(ctx.token_hours),
        })
        .await?;

    Ok(MfaVerified {
        access_token,
        session_id,
        user: user.clone(),
        company,
        role_id,
        used_backup_code: used_backup,
    })
}

/// Nonaktifkan MFA — wajib password (doubleCheckPassword) + OTP aktif.
pub async fn disable<S: AuthStore, C: MfaCrypto>(
    store: &S,
    crypto: &C,
    user: &User,
    password: &str,
    otp: &str,
) -> Result<(), DomainError> {
    let hash = user
        .password_hash
        .as_deref()
        .ok_or(DomainError::Unauthorized("tidak ada kredensial lokal".into()))?;
    if !crypto.verify_password(password, hash) {
        return Err(DomainError::Unauthorized("password tidak valid".into()));
    }
    verify_otp(store, crypto, user, otp).await?;
    store.mfa_clear(user.id).await
}

/// Reset self-service via email token (delivery via flow_worker_agent W2).
pub async fn reset_confirm<S: AuthStore, T: TokenIssuer>(
    store: &S,
    _tokens: &T,
    user_id: Uuid,
    actor_ip: Option<&str>,
    actor_ua: Option<&str>,
) -> Result<(), DomainError> {
    let user = store
        .user_by_id(user_id)
        .await
        .filter(|user| user.is_active)
        .ok_or(DomainError::NotFound)?;
    store.mfa_clear(user.id).await?;
    // Pencabutan seluruh sesi aktif (bab 5.3 safe recovery #2).
    store.sessions_revoke_all(user.id).await?;
    store
        .activity_log(ActivityLogData {
            company_id: None,
            user_id: Some(user.id),
            action: "MFA_RESET_SELF_EMAIL",
            entity_type: Some("user"),
            entity_id: Some(user.id),
            ip_address: actor_ip,
            user_agent: actor_ua,
            detail: None,
        })
        .await;
    Ok(())
}

/// Reset admin-assisted: admin wajib `mfa_enabled` sendiri (step-up enforce)
/// — diverifikasi handler; reason tercatat pada audit.
pub async fn admin_reset<S: AuthStore, T: TokenIssuer>(
    store: &S,
    _tokens: &T,
    actor: &User,
    target_id: Uuid,
    reason: &str,
    actor_ip: Option<&str>,
    actor_ua: Option<&str>,
) -> Result<(), DomainError> {
    if !actor.is_super_admin {
        return Err(DomainError::Forbidden(
            "hanya Global Super Admin dengan MFA aktif".into(),
        ));
    }
    if !actor.mfa_enabled {
        // Wajib MFA pada admin itu sendiri (bab 5.3 poin 3).
        return Err(DomainError::Forbidden(
            "admin wajib mengaktifkan MFA sebelum me-reset user lain".into(),
        ));
    }
    let target = store
        .user_by_id(target_id)
        .await
        .filter(|target| target.is_active)
        .ok_or(DomainError::NotFound)?;

    store.mfa_clear(target.id).await?;
    store.sessions_revoke_all(target.id).await?;
    store
        .activity_log(ActivityLogData {
            company_id: None,
            user_id: Some(actor.id),
            action: "MFA_RESET",
            entity_type: Some("user"),
            entity_id: Some(target.id),
            ip_address: actor_ip,
            user_agent: actor_ua,
            detail: Some(serde_json::json!({ "reason": reason, "target": target.username })),
        })
        .await;
    Ok(())
}

// ----------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------

/// Verifikasi OTP terhadap secret terenkripsi user → step (anti-replay).
async fn verify_otp<S: AuthStore, C: MfaCrypto>(
    _store: &S,
    crypto: &C,
    user: &User,
    otp: &str,
) -> Result<i64, DomainError> {
    let secret_encrypted = user
        .mfa_secret_encrypted
        .as_ref()
        .ok_or_else(|| DomainError::validation("MFA belum di-setup"))?;
    let secret = crypto.envelope_decrypt(secret_encrypted)?;
    match crypto.verify_totp(&secret, otp, user.mfa_last_verified_step) {
        OtpOutcome::Valid { step } => Ok(step),
        OtpOutcome::Invalid => Err(DomainError::Unauthorized("OTP tidak valid/replay".into())),
    }
}

/// Cari backup code cocok → (step = step verifikasi nomina, hash dipakai).
async fn consume_backup_code<S: AuthStore, C: MfaCrypto>(
    store: &S,
    crypto: &C,
    user: &User,
    code: &str,
) -> Result<Option<i64>, DomainError> {
    let matched = crypto.match_backup_code(code, &user.mfa_backup_codes_hash);
    let Some(index) = matched else {
        return Ok(None);
    };
    let used_hash = user
        .mfa_backup_codes_hash
        .get(index)
        .cloned()
        .ok_or_else(|| DomainError::Unauthorized("backup code tidak valid".into()))?;
    // Sekali pakai: hash dihapus + mfa_enabled=false (auto-reset, bab 5.3).
    store.mfa_backup_consume(user.id, &used_hash).await?;
    Ok(Some(0)) // backup code tidak membawa step TOTP
}

/// Backup code `XXXX-XXXX` (charset bebas ambigu).
fn generate_backup_codes() -> Vec<String> {
    const CHARSET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    (0..BACKUP_CODE_COUNT)
        .map(|_| {
            (0..8)
                .map(|i| {
                    if i == 4 {
                        '-'
                    } else {
                        let mut byte = [0u8; 1];
                        byte[0] = crate::infrastructure::crypto::random_bytes(1)[0];
                        CHARSET[byte[0] as usize % CHARSET.len()] as char
                    }
                })
                .collect()
        })
        .collect()
}
