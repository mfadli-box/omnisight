use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use data_encoding::BASE32_NOPAD;
use serde::Serialize;
use uuid::Uuid;

use crate::domain::{AuthError, LoginPrincipal, PublicCompany, SessionClaims};

use super::{
    crypto,
    ports::{AuthRepository, CachePort, HrisPort, MailPort, MfaReset},
    token::TokenService,
};

pub struct AuthService {
    repo: Arc<dyn AuthRepository>,
    cache: Arc<dyn CachePort>,
    hris: Arc<dyn HrisPort>,
    mailer: Option<Arc<dyn MailPort>>,
    tokens: Arc<TokenService>,
    encryption_key: [u8; 32],
}

#[derive(Clone, Debug, Serialize)]
pub struct LoginReply {
    pub access_token: Option<String>,
    pub expires_in: Option<i64>,
    pub mfa_required: bool,
    pub mfa_challenge_token: Option<String>,
    pub user: LoginUser,
}

#[derive(Clone, Debug, Serialize)]
pub struct LoginUser {
    pub id: Uuid,
    pub username: String,
    pub full_name: String,
    pub company_id: Uuid,
    pub area_id: Option<Uuid>,
}

#[derive(Clone, Debug, Serialize)]
pub struct MfaEnabledReply {
    pub enabled: bool,
    pub backup_codes: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct SetupReply {
    pub provisioning_uri: String,
}

impl AuthService {
    pub fn new(
        repo: Arc<dyn AuthRepository>,
        cache: Arc<dyn CachePort>,
        hris: Arc<dyn HrisPort>,
        mailer: Option<Arc<dyn MailPort>>,
        tokens: Arc<TokenService>,
        encryption_key: [u8; 32],
    ) -> Self {
        Self {
            repo,
            cache,
            hris,
            mailer,
            tokens,
            encryption_key,
        }
    }

    pub fn validate_hris_configuration(&self, template: &str) -> Result<(), AuthError> {
        self.hris
            .validate_endpoint(template)
            .map_err(|_| AuthError::InvalidInput)
    }

    pub async fn require_step_up(
        &self,
        claims: &SessionClaims,
        otp: Option<&str>,
    ) -> Result<(), AuthError> {
        if !self.repo.auth_user_by_id(claims.sub).await?.mfa_enabled {
            return Err(AuthError::MfaRequired);
        }
        if self
            .cache
            .step_up_at(claims.jti)
            .await?
            .is_some_and(|at| (0..=900_000).contains(&(chrono::Utc::now().timestamp_millis() - at)))
        {
            return Ok(());
        }
        self.accept_totp(claims.sub, otp.ok_or(AuthError::StepUpRequired)?)
            .await?;
        self.cache
            .record_step_up(claims.jti, chrono::Utc::now().timestamp_millis())
            .await
    }

    pub async fn step_up_deadline(
        &self,
        claims: &SessionClaims,
    ) -> Result<chrono::DateTime<chrono::Utc>, AuthError> {
        let at = self
            .cache
            .step_up_at(claims.jti)
            .await?
            .ok_or(AuthError::StepUpRequired)?;
        let now = chrono::Utc::now().timestamp_millis();
        if !(now.saturating_sub(900_000)..=now).contains(&at) {
            return Err(AuthError::StepUpRequired);
        }
        chrono::DateTime::from_timestamp_millis(at + 900_000)
            .map(|deadline| {
                deadline.min(chrono::DateTime::from_timestamp(claims.exp, 0).unwrap_or(deadline))
            })
            .ok_or(AuthError::StepUpRequired)
    }

    pub async fn require_admin_step_up(&self, claims: &SessionClaims) -> Result<(), AuthError> {
        self.require_step_up(claims, None)
            .await
            .map_err(|error| match error {
                AuthError::MfaRequired => AuthError::StepUpRequired,
                error => error,
            })
    }

    pub async fn switch_context(
        &self,
        claims: &SessionClaims,
        company_id: Uuid,
        area_id: Option<Uuid>,
    ) -> Result<(LoginPrincipal, String, i64), AuthError> {
        let principal = self
            .repo
            .principal_for_user(claims.sub, company_id, area_id)
            .await?;
        let (token, expiry) = self.tokens.issue_session(&principal)?;
        if let Some(at) = self.cache.step_up_at(claims.jti).await? {
            self.cache
                .record_step_up(self.tokens.decode(&token, "session")?.jti, at)
                .await?;
        }
        Ok((principal, token, expiry - now_epoch()))
    }

    pub async fn public_companies(&self) -> Result<Vec<PublicCompany>, AuthError> {
        self.repo.public_companies().await
    }

    pub async fn login(
        &self,
        company_id: Option<Uuid>,
        username: String,
        password: String,
        backup_code: Option<String>,
    ) -> Result<LoginReply, AuthError> {
        if !self.cache.login_attempt_allowed(&username).await? {
            return Err(AuthError::LoginRateLimited);
        }
        let authenticated = if let Some(company_id) = company_id {
            let company = self.repo.company_auth(company_id).await?;
            match company.provider.as_str() {
                "HRIS_ASMX" => self.login_hris(company, &username, &password).await?,
                "LOCAL" => {
                    self.login_local(&username, Some(company_id), &password)
                        .await?
                }
                _ => return Err(AuthError::ProviderUnsupported),
            }
        } else {
            self.login_local(&username, None, &password).await?
        };
        self.finish_login(authenticated.0, authenticated.1, backup_code)
            .await
    }

    async fn login_local(
        &self,
        username: &str,
        company_id: Option<Uuid>,
        password: &str,
    ) -> Result<(crate::domain::UserAuth, LoginPrincipal), AuthError> {
        let (user, principal) = self.repo.find_local_user(username, company_id).await?;
        let Some(hash) = user.password_hash.clone() else {
            return Err(AuthError::InvalidCredentials);
        };
        if user.auth_source != "LOCAL"
            || !crypto::verify_password(password.to_owned(), hash).await?
        {
            return Err(AuthError::InvalidCredentials);
        }
        Ok((user, principal))
    }

    async fn login_hris(
        &self,
        company: crate::domain::CompanyAuth,
        username: &str,
        password: &str,
    ) -> Result<(crate::domain::UserAuth, LoginPrincipal), AuthError> {
        let template = company
            .hris_login_url
            .as_deref()
            .ok_or(AuthError::HrisMisconfigured)?;
        if self.cache.circuit_is_open(company.id).await? {
            self.hris.validate_endpoint(template)?;
            return self
                .offline_fallback(company.id, company.hris_cache_ttl_hours, username, password)
                .await;
        }
        match self.hris.authenticate(template, username, password).await {
            Ok(Some(profile)) => {
                if !profile.username.eq_ignore_ascii_case(username) {
                    return Err(AuthError::InvalidCredentials);
                }
                let hash = crypto::hash_password(password.to_owned()).await?;
                self.repo
                    .sync_hris_user(company.id, &profile, &hash)
                    .await?;
                self.cache.clear_hris_failures(company.id).await?;
                self.repo
                    .find_hris_context(&profile.username, company.id)
                    .await
            }
            Ok(None) => Err(AuthError::InvalidCredentials), // HRIS says 0|...|NONE; never fall back.
            Err(AuthError::HrisUnavailable | AuthError::HrisInvalidResponse) => {
                self.cache.record_hris_failure(company.id).await?;
                self.offline_fallback(company.id, company.hris_cache_ttl_hours, username, password)
                    .await
            }
            Err(error) => Err(error),
        }
    }

    async fn offline_fallback(
        &self,
        company_id: Uuid,
        ttl_hours: i32,
        username: &str,
        password: &str,
    ) -> Result<(crate::domain::UserAuth, LoginPrincipal), AuthError> {
        let (user, principal) = self
            .repo
            .find_hris_context(username, company_id)
            .await
            .map_err(|error| match error {
                AuthError::InvalidCredentials | AuthError::NoActiveAccess => {
                    AuthError::HrisInvalidResponse
                }
                other => other,
            })?;
        let valid_cache = user.last_hris_sync_at.is_some_and(|at| {
            let age = chrono::Utc::now().signed_duration_since(at);
            age >= chrono::Duration::zero() && age <= chrono::Duration::hours(ttl_hours.into())
        });
        let Some(hash) = user
            .password_hash
            .clone()
            .filter(|_| valid_cache && user.auth_source == "HRIS_ASMX")
        else {
            return Err(AuthError::HrisInvalidResponse);
        };
        if !crypto::verify_password(password.to_owned(), hash).await? {
            return Err(AuthError::HrisInvalidResponse);
        }
        self.repo
            .record_activity(&principal, "LOGIN_HRIS_OFFLINE_CACHE", "SUCCESS")
            .await?;
        Ok((user, principal))
    }

    async fn finish_login(
        &self,
        user: crate::domain::UserAuth,
        principal: LoginPrincipal,
        backup_code: Option<String>,
    ) -> Result<LoginReply, AuthError> {
        if user.mfa_enabled {
            if let Some(code) = backup_code {
                self.require_mfa_rate_limit(user.id).await?;
                if code.len() > 128 {
                    return Err(AuthError::InvalidCredentials);
                }
                let matched =
                    crypto::verify_backup_code(code, user.mfa_backup_codes_hash.clone()).await?;
                if matched.is_none() {
                    return Err(AuthError::InvalidCredentials);
                }
                self.cache
                    .revoke_sessions(user.id, chrono::Utc::now().timestamp_micros())
                    .await?;
                if !self
                    .repo
                    .disable_mfa_with_backup_code(user.id, &user.mfa_backup_codes_hash)
                    .await?
                {
                    return Err(AuthError::InvalidCredentials);
                }
                self.repo
                    .record_activity(&principal, "MFA_RESET_BACKUP_CODE", "SUCCESS")
                    .await?;
                self.cache.clear_mfa_failures(user.id).await?;
                return self.session_reply(&principal);
            }
            let challenge = self.tokens.issue_pending(
                user.id,
                Some(principal.company_id),
                principal.area_id,
            )?;
            return Ok(LoginReply {
                access_token: None,
                expires_in: None,
                mfa_required: true,
                mfa_challenge_token: Some(challenge),
                user: LoginUser {
                    id: user.id,
                    username: user.username,
                    full_name: user.full_name,
                    company_id: principal.company_id,
                    area_id: principal.area_id,
                },
            });
        }
        if backup_code.is_some() {
            return Err(AuthError::InvalidCredentials);
        }
        self.session_reply(&principal)
    }

    fn session_reply(&self, principal: &LoginPrincipal) -> Result<LoginReply, AuthError> {
        let (token, expiry) = self.tokens.issue_session(principal)?;
        Ok(LoginReply {
            access_token: Some(token),
            expires_in: Some(expiry - now_epoch()),
            mfa_required: false,
            mfa_challenge_token: None,
            user: LoginUser {
                id: principal.user_id,
                username: principal.username.clone(),
                full_name: principal.full_name.clone(),
                company_id: principal.company_id,
                area_id: principal.area_id,
            },
        })
    }

    pub async fn setup_mfa(&self, claims: &SessionClaims) -> Result<SetupReply, AuthError> {
        if self.repo.auth_user_by_id(claims.sub).await?.mfa_enabled {
            return Err(AuthError::Forbidden);
        }
        let secret = crypto::random_secret()?;
        let encoded = BASE32_NOPAD.encode(&secret);
        let encrypted_pending = crypto::encrypt_secret(&self.encryption_key, &secret)?;
        self.cache
            .put_pending_mfa(claims.jti, &URL_SAFE_NO_PAD.encode(encrypted_pending))
            .await?;
        let principal = self.principal_from_claims(claims).await?;
        let label = url::form_urlencoded::byte_serialize(
            format!("OmniSight:{}", principal.username).as_bytes(),
        )
        .collect::<String>();
        Ok(SetupReply {
            provisioning_uri: format!(
                "otpauth://totp/{label}?secret={encoded}&issuer=OmniSight&algorithm=SHA1&digits=6&period=30"
            ),
        })
    }

    pub async fn enable_mfa(
        &self,
        claims: &SessionClaims,
        code: &str,
    ) -> Result<MfaEnabledReply, AuthError> {
        self.require_mfa_rate_limit(claims.sub).await?;
        let pending = self
            .cache
            .get_pending_mfa(claims.jti)
            .await?
            .ok_or(AuthError::InvalidChallenge)?;
        let encrypted_pending = URL_SAFE_NO_PAD
            .decode(pending)
            .map_err(|_| AuthError::InvalidChallenge)?;
        let secret = crypto::decrypt_secret(&self.encryption_key, &encrypted_pending)?;
        let step = now_epoch() / 30;
        let Some(verified_step) = crypto::verify_totp(&secret, code, step, None)? else {
            return Err(AuthError::InvalidOtp);
        };
        let encrypted = crypto::encrypt_secret(&self.encryption_key, &secret)?;
        let codes = crypto::random_backup_codes()?;
        let hashes = crypto::hash_backup_codes(codes.clone()).await?;
        self.repo
            .enable_mfa(claims.sub, &encrypted, &hashes, verified_step)
            .await?;
        self.cache.clear_pending_mfa(claims.jti).await?;
        self.cache.clear_mfa_failures(claims.sub).await?;
        self.cache
            .record_step_up(claims.jti, chrono::Utc::now().timestamp_millis())
            .await?;
        let principal = self.principal_from_claims(claims).await?;
        self.repo
            .record_activity(&principal, "MFA_ENABLED", "SUCCESS")
            .await?;
        Ok(MfaEnabledReply {
            enabled: true,
            backup_codes: codes,
        })
    }

    pub async fn verify_mfa(&self, challenge: &str, code: &str) -> Result<LoginReply, AuthError> {
        let claims = self.tokens.decode(challenge, "mfa_pending")?;
        self.validate_session(&claims).await?;
        self.principal_from_claims(&claims).await?;
        self.accept_totp(claims.sub, code).await?;
        if !self.cache.consume_mfa_challenge(claims.jti).await? {
            return Err(AuthError::InvalidChallenge);
        }
        self.validate_session(&claims).await?;
        let principal = self.principal_from_claims(&claims).await?;
        self.repo
            .record_activity(&principal, "MFA_VERIFIED", "SUCCESS")
            .await?;
        let reply = self.session_reply(&principal)?;
        let token = reply.access_token.as_deref().ok_or(AuthError::Internal)?;
        let session = self.tokens.decode(token, "session")?;
        self.cache
            .record_step_up(session.jti, chrono::Utc::now().timestamp_millis())
            .await?;
        Ok(reply)
    }

    async fn accept_totp(&self, user_id: Uuid, code: &str) -> Result<(), AuthError> {
        self.require_mfa_rate_limit(user_id).await?;
        self.check_totp(user_id, code).await.map(|_| ())
    }

    async fn check_totp(&self, user_id: Uuid, code: &str) -> Result<Vec<u8>, AuthError> {
        let encrypted = self.repo.mfa_secret(user_id).await?;
        let secret = crypto::decrypt_secret(&self.encryption_key, &encrypted)?;
        let step = crypto::verify_totp(&secret, code, now_epoch() / 30, None)?
            .ok_or(AuthError::InvalidOtp)?;
        if !self.repo.mark_mfa_step(user_id, step, &encrypted).await? {
            return Err(AuthError::OtpReplay);
        }
        self.cache.clear_mfa_failures(user_id).await?;
        Ok(encrypted)
    }

    pub async fn disable_mfa(
        &self,
        claims: &SessionClaims,
        password: &str,
        code: &str,
    ) -> Result<(), AuthError> {
        self.require_mfa_rate_limit(claims.sub).await?;
        let user = self.repo.auth_user_by_id(claims.sub).await?;
        let hash = user.password_hash.ok_or(AuthError::InvalidCredentials)?;
        if password.len() > 1024 || !crypto::verify_password(password.to_owned(), hash).await? {
            return Err(AuthError::InvalidCredentials);
        }
        let secret = self.check_totp(claims.sub, code).await?;
        self.cache
            .revoke_sessions(claims.sub, chrono::Utc::now().timestamp_micros())
            .await?;
        if !self.repo.clear_mfa(claims.sub, &secret).await? {
            return Err(AuthError::InvalidChallenge);
        }
        let principal = self.principal_from_claims(claims).await?;
        self.repo
            .record_activity(&principal, "MFA_DISABLED", "SUCCESS")
            .await
    }

    pub async fn reset_request(&self, email: &str) -> Result<(), AuthError> {
        let mailer = self
            .mailer
            .as_ref()
            .ok_or(AuthError::DependencyUnavailable)?;
        let email = email.trim();
        if !self.cache.reset_email_allowed(email).await? {
            return Ok(());
        }
        if let Some(user_id) = self.repo.find_user_by_email(email).await? {
            let encrypted = match self.repo.mfa_secret(user_id).await {
                Ok(secret) => secret,
                Err(AuthError::MfaNotEnabled) => return Ok(()),
                Err(error) => return Err(error),
            };
            let token = random_url_token()?;
            let digest = sha256_hex(token.as_bytes());
            self.cache
                .put_reset_token(
                    &digest,
                    &MfaReset {
                        user_id,
                        generation: sha256_hex(&encrypted),
                    },
                )
                .await?;
            if let Err(error) = mailer.send_reset_link(email, &token).await {
                tracing::warn!(
                    event = "mfa_reset_email_failed",
                    error = "mailer_unavailable"
                );
                return Err(error);
            }
        }
        Ok(()) // caller always returns the same generic 202 response
    }

    pub async fn reset_confirm(&self, token: &str) -> Result<(), AuthError> {
        if token.len() != 43 {
            return Err(AuthError::InvalidResetToken);
        }
        let token_hash = sha256_hex(token.as_bytes());
        let reset = self
            .cache
            .consume_reset_token(&token_hash)
            .await?
            .ok_or(AuthError::InvalidResetToken)?;
        let user_id = reset.user_id;
        let secret = match self.repo.mfa_secret(user_id).await {
            Ok(secret) => secret,
            Err(AuthError::MfaNotEnabled) => return Err(AuthError::InvalidResetToken),
            Err(error) => return Err(error),
        };
        if sha256_hex(&secret) != reset.generation {
            return Err(AuthError::InvalidResetToken);
        }
        self.reset_enrollment(user_id, &secret).await?;
        self.repo
            .record_user_event(user_id, "MFA_RESET_EMAIL")
            .await?;
        Ok(())
    }

    pub async fn admin_reset(
        &self,
        claims: &SessionClaims,
        target_id: Uuid,
    ) -> Result<(), AuthError> {
        let company_id = claims.company_id.ok_or(AuthError::Forbidden)?;
        self.require_admin_step_up(claims).await?;
        if !self
            .repo
            .admin_can_reset_mfa(
                claims.sub,
                target_id,
                company_id,
                &claims.allowed_area_ids,
                claims.area_id,
            )
            .await?
        {
            return Err(AuthError::Forbidden);
        }
        match self.repo.mfa_secret(target_id).await {
            Ok(secret) => self.reset_enrollment(target_id, &secret).await?,
            Err(AuthError::MfaNotEnabled) => {
                self.cache
                    .revoke_sessions(target_id, chrono::Utc::now().timestamp_micros())
                    .await?;
                self.cache.clear_mfa_failures(target_id).await?;
            }
            Err(error) => return Err(error),
        }
        self.repo
            .record_admin_reset(claims.sub, target_id, company_id)
            .await
    }

    async fn reset_enrollment(&self, user_id: Uuid, secret: &[u8]) -> Result<(), AuthError> {
        self.cache
            .revoke_sessions(user_id, chrono::Utc::now().timestamp_micros())
            .await?;
        if !self.repo.clear_mfa(user_id, secret).await? {
            return Err(AuthError::InvalidResetToken);
        }
        self.cache.clear_mfa_failures(user_id).await
    }

    pub async fn validate_session(&self, claims: &SessionClaims) -> Result<(), AuthError> {
        if self
            .cache
            .session_is_revoked(
                claims.sub,
                claims
                    .issued_at_micros
                    .unwrap_or_else(|| claims.iat.saturating_mul(1_000_000)),
            )
            .await?
        {
            return Err(AuthError::InvalidChallenge);
        }
        Ok(())
    }

    pub async fn principal_from_claims(
        &self,
        claims: &SessionClaims,
    ) -> Result<LoginPrincipal, AuthError> {
        let company_id = claims.company_id.ok_or(AuthError::Forbidden)?;
        self.repo
            .principal_for_user(claims.sub, company_id, claims.area_id)
            .await
    }

    async fn require_mfa_rate_limit(&self, user_id: Uuid) -> Result<(), AuthError> {
        if self.cache.mfa_attempt_allowed(user_id).await? {
            Ok(())
        } else {
            Err(AuthError::RateLimited)
        }
    }
}

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
fn sha256_hex(value: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(value))
}
fn random_url_token() -> Result<String, AuthError> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| AuthError::Internal)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
