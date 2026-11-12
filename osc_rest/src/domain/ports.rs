//! Port (trait) milik `domain/`, diimplementasikan oleh `infrastructure/`.
//! Async fn in trait (RPITIT) — dipakai lewat static dispatch (generik),
//! sehingga tidak perlu crate `async-trait`.

use crate::domain::error::DomainError;
use crate::domain::model::{
    ActivityLogData, AuthClaims, Company, CompanyAccess, HrisDecision, SessionData, User,
};
use uuid::Uuid;

/// Probe kesiapan database (dipakai use case health/readiness).
pub trait DatabaseProbe {
    async fn ping(&self) -> Result<(), DomainError>;
}

/// Probe kesiapan object storage RustFS (S3-compatible).
pub trait StorageProbe {
    async fn probe(&self) -> Result<(), DomainError>;
}

/// Gateway HRIS ASMX (server-to-server). Implementasi konkret:
/// `infrastructure::hris::HrisClient` — anti-SSRF, cap 64 KB, circuit breaker.
pub trait HrisGateway {
    async fn hris_login(
        &self,
        template_url: &str,
        username: &str,
        password: &str,
    ) -> Result<HrisDecision, DomainError>;
}

/// Penerbit/verifikasi token (JWT HS256). Implementasi konkret:
/// `infrastructure::crypto::CryptoProvider`.
pub trait TokenIssuer {
    fn issue_token(&self, claims: &AuthClaims) -> Result<String, DomainError>;
    /// Klaim access token (sesi penuh).
    fn access_claims(
        &self,
        user_id: Uuid,
        session_id: Uuid,
        company_id: Option<Uuid>,
        role_id: Option<Uuid>,
        hours: i64,
    ) -> AuthClaims;
    /// Klaim challenge MFA (5 menit, scope mfa_pending).
    fn mfa_challenge_claims(&self, user_id: Uuid) -> AuthClaims;
    /// Fingerprint stabil token (untuk `user_sessions.token_hash`).
    fn fingerprint(&self, token: &str) -> String;
}

/// Kriptografi password (Argon2id).
pub trait PasswordCrypto {
    fn hash_password(&self, password: &str) -> Result<String, DomainError>;
    fn verify_password(&self, password: &str, hash: &str) -> bool;
}

/// Envelope encryption (AES-256-GCM) untuk secret at-rest.
pub trait EnvelopeCrypto {
    fn envelope_encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, DomainError>;
    fn envelope_decrypt(&self, blob: &[u8]) -> Result<Vec<u8>, DomainError>;
}

/// Kriptografi TOTP + backup code (dipakai usecase MFA).
pub trait MfaCrypto: PasswordCrypto + EnvelopeCrypto {
    fn generate_totp_secret(&self) -> Result<(Vec<u8>, String), DomainError>;
    fn otpauth_url(&self, secret: &[u8], account: &str) -> Result<String, DomainError>;
    fn verify_totp(&self, secret: &[u8], token: &str, last_step: Option<i64>) -> crate::domain::model::OtpOutcome;
    fn hash_backup_code(&self, code: &str) -> Result<String, DomainError>;
    fn match_backup_code(&self, code: &str, hashes: &[String]) -> Option<usize>;
}

/// Port store untuk usecase auth/MFA — diimplementasikan `Store`.
pub trait AuthStore {
    async fn company_by_id(&self, id: Uuid) -> Result<Company, DomainError>;
    async fn user_by_username(&self, username: &str) -> Option<User>;
    async fn user_by_id(&self, id: Uuid) -> Option<User>;
    async fn user_create_hris(
        &self,
        username: &str,
        email: Option<&str>,
        display_name: Option<&str>,
    ) -> Result<User, DomainError>;
    async fn user_profile_sync(
        &self,
        user_id: Uuid,
        display_name: Option<&str>,
        email: Option<&str>,
    ) -> Result<(), DomainError>;
    async fn user_password_cache_update(
        &self,
        user_id: Uuid,
        password_hash: &str,
        hris_synced: bool,
    ) -> Result<(), DomainError>;
    async fn role_ensure(&self, name: &str) -> Result<Uuid, DomainError>;
    async fn access_ensure(&self, user_id: Uuid, company_id: Uuid, role_id: Uuid) -> Result<(), DomainError>;
    async fn access_list(&self, user_id: Uuid) -> Result<Vec<CompanyAccess>, DomainError>;
    async fn session_create(&self, data: SessionData) -> Result<(), DomainError>;
    async fn sessions_revoke_all(&self, user_id: Uuid) -> Result<(), DomainError>;
    async fn mfa_store_secret(
        &self,
        user_id: Uuid,
        secret_encrypted: Vec<u8>,
        backup_hashes: Vec<String>,
    ) -> Result<(), DomainError>;
    async fn mfa_set_enabled(&self, user_id: Uuid, enabled: bool) -> Result<(), DomainError>;
    async fn mfa_step_set(&self, user_id: Uuid, step: i64) -> Result<(), DomainError>;
    async fn mfa_backup_consume(&self, user_id: Uuid, used_hash: &str) -> Result<(), DomainError>;
    async fn mfa_clear(&self, user_id: Uuid) -> Result<(), DomainError>;
    async fn activity_log(&self, data: ActivityLogData<'_>);
}
