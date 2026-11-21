pub mod ops;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct CompanyAuth {
    pub id: Uuid,
    pub provider: String,
    pub hris_login_url: Option<String>,
    pub hris_cache_ttl_hours: i32,
}

#[derive(Serialize)]
pub struct PublicCompany {
    pub id: Uuid,
    pub code: String,
    pub name: String,
}

#[derive(Clone, Debug)]
pub struct UserAuth {
    pub id: Uuid,
    pub username: String,
    pub email: Option<String>,
    pub full_name: String,
    pub password_hash: Option<String>,
    pub auth_source: String,
    pub last_hris_sync_at: Option<chrono::DateTime<chrono::Utc>>,
    pub mfa_enabled: bool,
    pub mfa_secret_encrypted: Option<Vec<u8>>,
    pub mfa_last_verified_step: Option<i64>,
    pub mfa_last_verified_at: Option<chrono::DateTime<chrono::Utc>>,
    pub mfa_backup_codes_hash: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LoginPrincipal {
    pub user_id: Uuid,
    pub username: String,
    pub full_name: String,
    pub email: Option<String>,
    pub company_id: Uuid,
    pub area_id: Option<Uuid>,
    pub allowed_area_ids: Vec<Uuid>,
    pub mfa_enabled: bool,
    pub mfa_last_verified_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionClaims {
    #[serde(rename = "user_id", alias = "sub")]
    pub sub: Uuid,
    pub scope: String,
    pub exp: i64,
    pub iat: i64,
    #[serde(default)]
    pub issued_at_micros: Option<i64>,
    #[serde(rename = "active_company_id", alias = "company_id")]
    pub company_id: Option<Uuid>,
    pub area_id: Option<Uuid>,
    #[serde(rename = "active_area_ids", alias = "allowed_area_ids")]
    pub allowed_area_ids: Vec<Uuid>,
    pub jti: Uuid,
}

#[derive(Clone, Debug)]
pub struct HrisProfile {
    pub username: String,
    pub full_name: String,
    pub email: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("invalid request data")]
    InvalidInput,
    #[error("resource not found")]
    NotFound,
    #[error("resource conflict")]
    Conflict,
    #[error("unsupported attachment")]
    UnsupportedAttachment,
    #[error("invalid credentials")]
    InvalidCredentials,
    #[error("company is inactive or unavailable")]
    CompanyUnavailable,
    #[error("user has no active access grant")]
    NoActiveAccess,
    #[error("configured authentication provider is not implemented")]
    ProviderUnsupported,
    #[error("upstream HRIS failure")]
    HrisUnavailable,
    #[error("invalid HRIS response")]
    HrisInvalidResponse,
    #[error("invalid HRIS endpoint configuration")]
    HrisMisconfigured,
    #[error("MFA challenge is invalid or expired")]
    InvalidChallenge,
    #[error("MFA verification failed")]
    InvalidOtp,
    #[error("MFA rate limit exceeded")]
    RateLimited,
    #[error("login rate limit exceeded")]
    LoginRateLimited,
    #[error("OTP step has already been used")]
    OtpReplay,
    #[error("MFA is not enabled")]
    MfaNotEnabled,
    #[error("MFA must be enabled for PAM")]
    MfaRequired,
    #[error("fresh MFA verification is required")]
    StepUpRequired,
    #[error("not authorized")]
    Forbidden,
    #[error("reset token is invalid or expired")]
    InvalidResetToken,
    #[error("required dependency unavailable")]
    DependencyUnavailable,
    #[error("configuration error")]
    Configuration,
    #[error("internal operation failed")]
    Internal,
}

pub mod telemetry;
