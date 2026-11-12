//! State bersama handlers — hasil wiring `infrastructure/` saat startup.

use std::sync::Arc;

use crate::infrastructure::config::AppConfig;
use crate::infrastructure::crypto::CryptoProvider;
use crate::infrastructure::hris::HrisClient;
use crate::infrastructure::mfa_reset::MfaResetStore;
use crate::infrastructure::persistence::PgHealth;
use crate::infrastructure::ratelimit::RateLimiter;
use crate::infrastructure::storage::RustfsClient;
use crate::infrastructure::store::Store;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<PgHealth>,
    pub storage: Arc<RustfsClient>,
    pub config: Arc<AppConfig>,
    pub crypto: Arc<CryptoProvider>,
    pub hris: Arc<HrisClient>,
    pub store: Arc<Store>,
    /// Rate-limit MFA (5 kegagalan → lockout) — key `mfa:{user_id}`.
    pub mfa_limiter: Arc<RateLimiter>,
    /// Rate-limit login (10 kegagalan → lockout) — key `login:{username}`.
    pub login_limiter: Arc<RateLimiter>,
    /// Token reset MFA sekali pakai (in-memory TTL 10 menit).
    pub mfa_resets: Arc<MfaResetStore>,
}
