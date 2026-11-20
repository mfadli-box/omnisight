use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::{AuthError, CompanyAuth, HrisProfile, LoginPrincipal, PublicCompany, UserAuth};

#[async_trait]
pub trait AuthRepository: Send + Sync {
    async fn public_companies(&self) -> Result<Vec<PublicCompany>, AuthError>;
    async fn company_auth(&self, company_id: Uuid) -> Result<CompanyAuth, AuthError>;
    async fn auth_user_by_id(&self, user_id: Uuid) -> Result<UserAuth, AuthError>;
    async fn principal_for_user(
        &self,
        user_id: Uuid,
        company_id: Uuid,
        area_id: Option<Uuid>,
    ) -> Result<LoginPrincipal, AuthError>;
    async fn find_local_user(
        &self,
        username: &str,
        company_id: Option<Uuid>,
    ) -> Result<(UserAuth, LoginPrincipal), AuthError>;
    async fn sync_hris_user(
        &self,
        company_id: Uuid,
        profile: &HrisProfile,
        password_hash: &str,
    ) -> Result<(), AuthError>;
    async fn find_hris_context(
        &self,
        username: &str,
        company_id: Uuid,
    ) -> Result<(UserAuth, LoginPrincipal), AuthError>;
    async fn disable_mfa_with_backup_code(
        &self,
        user_id: Uuid,
        expected_hashes: &[String],
    ) -> Result<bool, AuthError>;
    async fn enable_mfa(
        &self,
        user_id: Uuid,
        encrypted: &[u8],
        backup_hashes: &[String],
        verified_step: i64,
    ) -> Result<(), AuthError>;
    async fn mark_mfa_step(
        &self,
        user_id: Uuid,
        step: i64,
        encrypted: &[u8],
    ) -> Result<bool, AuthError>;
    async fn mfa_secret(&self, user_id: Uuid) -> Result<Vec<u8>, AuthError>;
    async fn clear_mfa(&self, user_id: Uuid, expected_secret: &[u8]) -> Result<bool, AuthError>;
    async fn find_user_by_email(&self, email: &str) -> Result<Option<Uuid>, AuthError>;
    async fn admin_can_reset_mfa(
        &self,
        admin_id: Uuid,
        target_id: Uuid,
        company_id: Uuid,
        allowed_area_ids: &[Uuid],
        area_id: Option<Uuid>,
    ) -> Result<bool, AuthError>;
    async fn record_activity(
        &self,
        principal: &LoginPrincipal,
        action: &str,
        outcome: &str,
    ) -> Result<(), AuthError>;
    async fn record_admin_reset(
        &self,
        admin_id: Uuid,
        target_id: Uuid,
        company_id: Uuid,
    ) -> Result<(), AuthError>;
    async fn record_user_event(&self, user_id: Uuid, action: &str) -> Result<(), AuthError>;
}

#[derive(Serialize, Deserialize)]
pub struct MfaReset {
    pub user_id: Uuid,
    pub generation: String,
}

#[async_trait]
pub trait CachePort: Send + Sync {
    async fn login_attempt_allowed(&self, username: &str) -> Result<bool, AuthError>;
    async fn circuit_is_open(&self, company_id: Uuid) -> Result<bool, AuthError>;
    async fn record_hris_failure(&self, company_id: Uuid) -> Result<(), AuthError>;
    async fn clear_hris_failures(&self, company_id: Uuid) -> Result<(), AuthError>;
    async fn mfa_attempt_allowed(&self, user_id: Uuid) -> Result<bool, AuthError>;
    async fn reset_email_allowed(&self, email: &str) -> Result<bool, AuthError>;
    async fn record_step_up(&self, session_id: Uuid, timestamp: i64) -> Result<(), AuthError>;
    async fn step_up_at(&self, session_id: Uuid) -> Result<Option<i64>, AuthError>;
    async fn clear_mfa_failures(&self, user_id: Uuid) -> Result<(), AuthError>;
    async fn put_pending_mfa(&self, session_id: Uuid, secret: &str) -> Result<(), AuthError>;
    async fn get_pending_mfa(&self, session_id: Uuid) -> Result<Option<String>, AuthError>;
    async fn clear_pending_mfa(&self, session_id: Uuid) -> Result<(), AuthError>;
    async fn put_reset_token(&self, token_hash: &str, reset: &MfaReset) -> Result<(), AuthError>;
    async fn consume_reset_token(&self, token_hash: &str) -> Result<Option<MfaReset>, AuthError>;
    async fn consume_mfa_challenge(&self, challenge_id: Uuid) -> Result<bool, AuthError>;
    async fn revoke_sessions(&self, user_id: Uuid, timestamp: i64) -> Result<(), AuthError>;
    async fn session_is_revoked(&self, user_id: Uuid, issued_at: i64) -> Result<bool, AuthError>;
}

#[async_trait]
pub trait HrisPort: Send + Sync {
    fn validate_endpoint(&self, template: &str) -> Result<(), AuthError>;

    async fn authenticate(
        &self,
        template: &str,
        username: &str,
        password: &str,
    ) -> Result<Option<HrisProfile>, AuthError>;
}

#[async_trait]
pub trait MailPort: Send + Sync {
    async fn send_reset_link(&self, email: &str, token: &str) -> Result<(), AuthError>;
}
