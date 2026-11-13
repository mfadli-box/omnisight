//! Entitas bisnis murni (zero framework dependency) — pemetaan baris
//! PostgreSQL dilakukan di `infrastructure/store` agar layer ini tetap
//! bebas sqlx/serde-wire.

use chrono::{DateTime, Utc};
use uuid::Uuid;
/// Tenant master (`companies`). `hris_login_url` NULL/kosong = Local Login.
#[derive(Debug, Clone)]
pub struct Company {
    pub id: Uuid,
    pub name: String,
    pub code: String,
    pub hris_login_url: Option<String>,
    pub hris_cache_ttl_hours: i32,
    pub is_active: bool,
}

impl Company {
    /// Mode HRIS aktif hanya bila URL template terisi dan tidak kosong.
    pub fn hris_enabled(&self) -> bool {
        self.hris_login_url
            .as_deref()
            .is_some_and(|url| !url.trim().is_empty())
    }

    /// TTL cache offline (detik) — batasi ke 1..=30 hari agar nilai
    /// administratif liar tidak melumpuhkan keamanan.
    pub fn hris_cache_ttl(&self) -> chrono::Duration {
        let hours = self.hris_cache_ttl_hours.clamp(1, 24 * 30);
        chrono::Duration::hours(i64::from(hours))
    }
}

/// Pengguna (`users`) — termasuk state MFA. `password_hash` adalah
/// Argon2id (cache HRIS atau hash lokal); plaintext tidak pernah disimpan.
#[derive(Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub display_name: Option<String>,
    pub password_hash: Option<String>,
    pub last_hris_sync_at: Option<DateTime<Utc>>,
    pub mfa_enabled: bool,
    pub mfa_secret_encrypted: Option<Vec<u8>>,
    pub mfa_last_verified_step: Option<i64>,
    pub mfa_backup_codes_hash: Vec<String>,
    pub is_super_admin: bool,
    pub is_active: bool,
}

/// Baris `user_company_access` + konteks role.
#[derive(Debug, Clone)]
pub struct CompanyAccess {
    pub company: Company,
    pub role_id: Uuid,
    pub role_name: String,
    pub is_default: bool,
}

/// Node menu hasil merge `menu_modules` × `company_menu_privileges`
/// (`can_view=false` tidak pernah dikirim ke UI).
#[derive(Debug, Clone)]
pub struct MenuEntry {
    pub id: Uuid,
    pub code: String,
    pub label: String,
    pub route_path: Option<String>,
    pub icon: Option<String>,
    pub parent_id: Option<Uuid>,
    pub sort_order: i32,
    pub can_create: bool,
    pub can_update: bool,
    pub can_delete: bool,
}

/// Aksi hasil keputusan login HRIS (gateway-level, belum bisnis).
#[derive(Debug, Clone)]
pub enum HrisDecision {
    /// `1|…` — upstream mengonfirmasi kredensial; sisa payload = profil.
    Accepted { profile: String },
    /// `0|…|NONE` — keputusan bisnis upstream: kredensial ditolak.
    Rejected,
}

/// Data sesi baru (port AuthStore).
pub struct SessionData {
    pub id: Uuid,
    pub user_id: Uuid,
    pub active_company_id: Option<Uuid>,
    pub token_hash: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub expires_at: DateTime<Utc>,
}

/// Data activity log (port AuthStore) — append-only, multi-tenant.
pub struct ActivityLogData<'a> {
    pub company_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub action: &'a str,
    pub entity_type: Option<&'a str>,
    pub entity_id: Option<Uuid>,
    pub ip_address: Option<&'a str>,
    pub user_agent: Option<&'a str>,
    pub detail: Option<serde_json::Value>,
}

/// Hasil verifikasi OTP.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OtpOutcome {
    /// Kode valid pada `step` (30 detik) — wajib > step tersimpan.
    Valid { step: i64 },
    Invalid,
}

/// Klaim JWT aplikasi. `scope`: `access` (token sesi penuh) atau
/// `mfa_pending` (challenge 5 menit, hanya berlaku untuk endpoint MFA).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AuthClaims {
    /// `user id`
    pub sub: String,
    /// `session id` (None untuk challenge MFA)
    pub sid: Option<String>,
    /// `active_company_id` konteks tenant (None = platform-level)
    pub company: Option<String>,
    /// role aktif dalam konteks company
    pub role: Option<String>,
    /// `access` | `mfa_pending`
    pub scope: String,
    pub iat: u64,
    pub exp: u64,
    /// JTI = session id untuk access token (korelasi DB-backed).
    pub jti: String,
}

impl AuthClaims {
    pub const SCOPE_ACCESS: &'static str = "access";
    pub const SCOPE_MFA_PENDING: &'static str = "mfa_pending";

    #[allow(dead_code)] // util klaim (dipakai test & wave berikut)
    pub fn scope_is(&self, scope: &str) -> bool {
        self.scope == scope
    }
}
