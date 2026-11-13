//! Repository identitas: companies, users, user_company_access, sessions
//! (revocable DB-backed), state MFA, menu privilege, dan activity logs.

use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;
use crate::domain::model::{ActivityLogData, Company, CompanyAccess, MenuEntry, SessionData, User};

use super::Store;

impl Store {
    // ------------------------------------------------------------------
    // Companies
    // ------------------------------------------------------------------

    pub async fn companies_active(&self) -> Result<Vec<Company>, DomainError> {
        let rows = sqlx::query(
            "SELECT id, name, code, hris_login_url, hris_cache_ttl_hours, is_active
             FROM companies
             WHERE is_active AND deleted_at IS NULL
             ORDER BY name",
        )
        .fetch_all(self.pool())
        .await
        .map_err(super::db_err)?;

        rows.iter().map(company_from_row).collect()
    }

    pub async fn company_by_id(&self, id: Uuid) -> Result<Company, DomainError> {
        sqlx::query(
            "SELECT id, name, code, hris_login_url, hris_cache_ttl_hours, is_active
             FROM companies
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(self.pool())
        .await
        .map_err(super::db_err)?
        .as_ref()
        .map(company_from_row)
        .transpose()
        .map(|company| company.ok_or(DomainError::NotFound))?
    }

    // ------------------------------------------------------------------
    // Users
    // ------------------------------------------------------------------

    pub async fn user_by_username(&self, username: &str) -> Option<User> {
        sqlx::query(sqlx::AssertSqlSafe(user_select(
            "WHERE username = $1 AND deleted_at IS NULL",
        )))
        .bind(username)
        .fetch_optional(self.pool())
        .await
        .ok()
        .flatten()
        .and_then(|row| user_from_row(&row).ok())
    }

    pub async fn user_by_id(&self, id: Uuid) -> Option<User> {
        sqlx::query(sqlx::AssertSqlSafe(user_select(
            "WHERE id = $1 AND deleted_at IS NULL",
        )))
        .bind(id)
        .fetch_optional(self.pool())
        .await
        .ok()
        .flatten()
        .and_then(|row| user_from_row(&row).ok())
    }

    /// Auto-provision user HRIS (bab 5.2): email fallback `<username>@hris.local`
    /// bila profil upstream tidak membawa email valid.
    pub async fn user_create_hris(
        &self,
        username: &str,
        email: Option<&str>,
        display_name: Option<&str>,
    ) -> Result<User, DomainError> {
        let mut email = email
            .map(str::trim)
            .filter(|e| e.contains('@') && e.len() >= 5 && e.len() <= 255)
            .map(str::to_owned)
            .unwrap_or_else(|| format!("{username}@hris.local"));

        // Hindari benturan unique email antar autoprovision.
        if self.user_email_taken(&email).await {
            email = format!("{username}.{}@hris.local", Uuid::now_v7().simple());
        }
        let display = display_name
            .map(str::trim)
            .filter(|d| !d.is_empty())
            .map(|d| d.chars().take(100).collect::<String>());

        let row = sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO users (username, email, display_name)
             VALUES ($1, $2, $3)
             RETURNING {USER_COLUMNS}"
        )))
        .bind(username)
        .bind(email)
        .bind(display)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;
        user_from_row(&row)
    }

    pub async fn user_email_taken(&self, email: &str) -> bool {
        sqlx::query("SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL")
            .bind(email)
            .fetch_optional(self.pool())
            .await
            .map(|opt| opt.is_some())
            .unwrap_or(true) // aman: anggap taken saat error
    }

    /// Sinkron profil HRIS (bukan role/privilege — bab 5.2).
    pub async fn user_profile_sync(
        &self,
        user_id: Uuid,
        display_name: Option<&str>,
        email: Option<&str>,
    ) -> Result<(), DomainError> {
        let display = display_name
            .map(str::trim)
            .filter(|d| !d.is_empty())
            .map(|d| d.chars().take(100).collect::<String>());
        let email = email
            .map(str::trim)
            .filter(|e| e.contains('@') && e.len() >= 5 && e.len() <= 255);
        sqlx::query(
            "UPDATE users
             SET display_name = COALESCE($2, display_name),
                 email = COALESCE($3, email),
                 updated_at = now()
             WHERE id = $1",
        )
        .bind(user_id)
        .bind(display)
        .bind(email)
        .execute(self.pool())
        .await
        .map_err(super::db_err)?;
        Ok(())
    }

    /// Cache password Argon2id + penanda sync HRIS (bab 5.2 poin 2).
    pub async fn user_password_cache_update(
        &self,
        user_id: Uuid,
        password_hash: &str,
        hris_synced: bool,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "UPDATE users
             SET password_hash = $2,
                 last_hris_sync_at = CASE WHEN $3 THEN now() ELSE last_hris_sync_at END,
                 updated_at = now()
             WHERE id = $1",
        )
        .bind(user_id)
        .bind(password_hash)
        .bind(hris_synced)
        .execute(self.pool())
        .await
        .map_err(super::db_err)?;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Roles & UserCompanyAccess
    // ------------------------------------------------------------------

    /// Get-or-create role non-sistem (untuk autoprovision HRIS).
    pub async fn role_ensure(&self, name: &str) -> Result<Uuid, DomainError> {
        let row = sqlx::query(
            "INSERT INTO roles (name, description)
             VALUES ($1, $2)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id",
        )
        .bind(name)
        .bind("Role otomatis (autoprovision HRIS)")
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;
        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("row: {e}")))
    }

    /// Ikatkan user ke company (INSERT ON CONFLICT re-activate).
    pub async fn access_ensure(
        &self,
        user_id: Uuid,
        company_id: Uuid,
        role_id: Uuid,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "INSERT INTO user_company_access (user_id, company_id, role_id, is_default, is_active)
             VALUES ($1, $2, $3, false, true)
             ON CONFLICT (user_id, company_id, role_id)
             DO UPDATE SET is_active = true, updated_at = now()",
        )
        .bind(user_id)
        .bind(company_id)
        .bind(role_id)
        .execute(self.pool())
        .await
        .map_err(super::db_err)?;
        Ok(())
    }

    /// Daftar company + role yang boleh diakses user (untuk switcher & login).
    pub async fn access_list(&self, user_id: Uuid) -> Result<Vec<CompanyAccess>, DomainError> {
        let rows = sqlx::query(
            "SELECT c.id AS c_id, c.name AS c_name, c.code AS c_code,
                    c.hris_login_url, c.hris_cache_ttl_hours, c.is_active AS c_active,
                    a.role_id, r.name AS role_name, a.is_default, a.is_active
             FROM user_company_access a
             JOIN companies c ON c.id = a.company_id AND c.deleted_at IS NULL
             JOIN roles r ON r.id = a.role_id
             WHERE a.user_id = $1 AND a.is_active
             ORDER BY a.is_default DESC, c.name",
        )
        .bind(user_id)
        .fetch_all(self.pool())
        .await
        .map_err(super::db_err)?;

        rows.iter()
            .map(|row| {
                Ok(CompanyAccess {
                    company: company_from_row_parts(
                        row.try_get("c_id")?,
                        row.try_get("c_name")?,
                        row.try_get("c_code")?,
                        row.try_get("hris_login_url")?,
                        row.try_get("hris_cache_ttl_hours")?,
                        row.try_get("c_active")?,
                    ),
                    role_id: row.try_get("role_id")?,
                    role_name: row.try_get("role_name")?,
                    is_default: row.try_get("is_default")?,
                })
            })
            .collect()
    }

    // ------------------------------------------------------------------
    // Sessions (revocable DB-backed)
    // ------------------------------------------------------------------

    pub async fn session_create(&self, data: SessionData) -> Result<(), DomainError> {
        sqlx::query(
            "INSERT INTO user_sessions
                 (id, user_id, active_company_id, token_hash, ip_address, user_agent, expires_at)
             VALUES ($1, $2, $3, $4, CAST($5 AS inet), $6, $7)",
        )
        .bind(data.id)
        .bind(data.user_id)
        .bind(data.active_company_id)
        .bind(data.token_hash)
        .bind(data.ip_address)
        .bind(data.user_agent)
        .bind(data.expires_at)
        .execute(self.pool())
        .await
        .map_err(super::db_err)?;
        Ok(())
    }

    /// Verifikasi sesi aktif → `active_company_id` konteks (source of truth).
    pub async fn session_active_company(
        &self,
        session_id: Uuid,
    ) -> Result<Option<Option<Uuid>>, DomainError> {
        let row = sqlx::query(
            "SELECT active_company_id
             FROM user_sessions
             WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()",
        )
        .bind(session_id)
        .fetch_optional(self.pool())
        .await
        .map_err(super::db_err)?;

        Ok(row.map(|row| row.try_get("active_company_id").ok().flatten()))
    }

    pub async fn session_touch(&self, session_id: Uuid) {
        let _ = sqlx::query("UPDATE user_sessions SET last_used_at = now() WHERE id = $1")
            .bind(session_id)
            .execute(self.pool())
            .await;
    }

    /// Terbitkan ulang konteks company (switch-company — bab 5.4).
    pub async fn session_set_company(
        &self,
        session_id: Uuid,
        company_id: Uuid,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "UPDATE user_sessions SET active_company_id = $2 WHERE id = $1 AND revoked_at IS NULL",
        )
        .bind(session_id)
        .bind(company_id)
        .execute(self.pool())
        .await
        .map_err(super::db_err)?;
        Ok(())
    }

    /// Cabut seluruh sesi user (reset MFA — bab 5.3).
    pub async fn sessions_revoke_all(&self, user_id: Uuid) -> Result<(), DomainError> {
        sqlx::query(
            "UPDATE user_sessions SET revoked_at = now()
             WHERE user_id = $1 AND revoked_at IS NULL",
        )
        .bind(user_id)
        .execute(self.pool())
        .await
        .map_err(super::db_err)?;
        Ok(())
    }

    // ------------------------------------------------------------------
    // MFA state
    // ------------------------------------------------------------------

    pub async fn mfa_store_secret(
        &self,
        user_id: Uuid,
        secret_encrypted: Vec<u8>,
        backup_hashes: Vec<String>,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "UPDATE users
             SET mfa_secret_encrypted = $2,
                 mfa_backup_codes_hash = $3,
                 mfa_last_verified_step = NULL,
                 mfa_enabled = false,
                 updated_at = now()
             WHERE id = $1",
        )
        .bind(user_id)
        .bind(secret_encrypted)
        .bind(backup_hashes)
        .execute(self.pool())
        .await
        .map_err(super::db_err)?;
        Ok(())
    }

    pub async fn mfa_set_enabled(&self, user_id: Uuid, enabled: bool) -> Result<(), DomainError> {
        sqlx::query("UPDATE users SET mfa_enabled = $2, updated_at = now() WHERE id = $1")
            .bind(user_id)
            .bind(enabled)
            .execute(self.pool())
            .await
            .map_err(super::db_err)?;
        Ok(())
    }

    pub async fn mfa_step_set(&self, user_id: Uuid, step: i64) -> Result<(), DomainError> {
        sqlx::query(
            "UPDATE users
             SET mfa_last_verified_step = GREATEST(COALESCE(mfa_last_verified_step, 0), $2),
                 updated_at = now()
             WHERE id = $1",
        )
        .bind(user_id)
        .bind(step)
        .execute(self.pool())
        .await
        .map_err(super::db_err)?;
        Ok(())
    }

    /// Backup code sekali pakai: hash tercairkan dihapus dari array.
    pub async fn mfa_backup_consume(
        &self,
        user_id: Uuid,
        used_hash: &str,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "UPDATE users
             SET mfa_backup_codes_hash = array_remove(mfa_backup_codes_hash, $2),
                 mfa_enabled = false,
                 updated_at = now()
             WHERE id = $1",
        )
        .bind(user_id)
        .bind(used_hash)
        .execute(self.pool())
        .await
        .map_err(super::db_err)?;
        Ok(())
    }

    /// Reset penuh MFA (lost device / admin reset).
    pub async fn mfa_clear(&self, user_id: Uuid) -> Result<(), DomainError> {
        sqlx::query(
            "UPDATE users
             SET mfa_enabled = false,
                 mfa_secret_encrypted = NULL,
                 mfa_last_verified_step = NULL,
                 mfa_backup_codes_hash = '{}',
                 updated_at = now()
             WHERE id = $1",
        )
        .bind(user_id)
        .execute(self.pool())
        .await
        .map_err(super::db_err)?;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Menu privilege (bab 5.5)
    // ------------------------------------------------------------------

    /// Merge menu aktif × privilege (can_view=false tidak dikirim).
    pub async fn navigation_menus(
        &self,
        company_id: Uuid,
        role_id: Uuid,
    ) -> Result<Vec<MenuEntry>, DomainError> {
        let rows = sqlx::query(
            "SELECT m.id, m.code, m.label, m.route_path, m.icon, m.parent_id,
                    m.sort_order, p.can_create, p.can_update, p.can_delete
             FROM menu_modules m
             JOIN company_menu_privileges p
               ON p.menu_id = m.id AND p.company_id = $1 AND p.role_id = $2
             WHERE m.is_active AND p.can_view
             ORDER BY m.sort_order, m.label",
        )
        .bind(company_id)
        .bind(role_id)
        .fetch_all(self.pool())
        .await
        .map_err(super::db_err)?;

        rows.iter()
            .map(|row| {
                Ok(MenuEntry {
                    id: row.try_get("id")?,
                    code: row.try_get("code")?,
                    label: row.try_get("label")?,
                    route_path: row.try_get("route_path")?,
                    icon: row.try_get("icon")?,
                    parent_id: row.try_get("parent_id")?,
                    sort_order: row.try_get("sort_order")?,
                    can_create: row.try_get("can_create")?,
                    can_update: row.try_get("can_update")?,
                    can_delete: row.try_get("can_delete")?,
                })
            })
            .collect()
    }

    // ------------------------------------------------------------------
    // Activity log (append-only, multi-tenant)
    // ------------------------------------------------------------------

    pub async fn activity_log(&self, data: ActivityLogData<'_>) {
        let result = sqlx::query(
            "INSERT INTO activity_logs
                 (company_id, user_id, action, entity_type, entity_id, ip_address, user_agent, detail)
             VALUES ($1, $2, $3, $4, $5, CAST($6 AS inet), $7, $8)",
        )
        .bind(data.company_id)
        .bind(data.user_id)
        .bind(data.action)
        .bind(data.entity_type)
        .bind(data.entity_id)
        .bind(data.ip_address)
        .bind(data.user_agent)
        .bind(data.detail)
        .execute(self.pool())
        .await;

        // Log audit gagal TIDAK boleh menggagalkan request utama — cukup dicatat.
        if let Err(err) = result {
            tracing::warn!(
                error = %crate::infrastructure::logging::redact(&err.to_string()),
                "activity_log gagal ditulis"
            );
        }
    }
}

// ----------------------------------------------------------------------
// Row mapping helpers
// ----------------------------------------------------------------------

const USER_COLUMNS: &str = "id, username, email, password_hash, display_name,
    last_hris_sync_at, mfa_enabled, mfa_secret_encrypted, mfa_last_verified_step,
    mfa_backup_codes_hash, is_super_admin, is_active";

fn user_select(suffix: &str) -> String {
    format!("SELECT {USER_COLUMNS} FROM users {suffix}")
}

fn company_from_row_parts(
    id: Uuid,
    name: String,
    code: String,
    hris_login_url: Option<String>,
    hris_cache_ttl_hours: i32,
    is_active: bool,
) -> Company {
    Company {
        id,
        name,
        code,
        hris_login_url,
        hris_cache_ttl_hours,
        is_active,
    }
}

pub(crate) fn company_from_row(row: &sqlx::postgres::PgRow) -> Result<Company, DomainError> {
    Ok(company_from_row_parts(
        row.try_get("id")?,
        row.try_get("name")?,
        row.try_get("code")?,
        row.try_get("hris_login_url")?,
        row.try_get("hris_cache_ttl_hours")?,
        row.try_get("is_active")?,
    ))
}

pub(crate) fn user_from_row(row: &sqlx::postgres::PgRow) -> Result<User, DomainError> {
    Ok(User {
        id: row.try_get("id")?,
        username: row.try_get("username")?,
        email: row.try_get("email")?,
        display_name: row.try_get("display_name")?,
        password_hash: row.try_get("password_hash")?,
        last_hris_sync_at: row.try_get("last_hris_sync_at")?,
        mfa_enabled: row.try_get("mfa_enabled")?,
        mfa_secret_encrypted: row.try_get("mfa_secret_encrypted")?,
        mfa_last_verified_step: row.try_get("mfa_last_verified_step")?,
        mfa_backup_codes_hash: row.try_get("mfa_backup_codes_hash")?,
        is_super_admin: row.try_get("is_super_admin")?,
        is_active: row.try_get("is_active")?,
    })
}

// ----------------------------------------------------------------------
// Port domain::ports::AuthStore — delegasi ke metode inherent Store
// (dependency direction: application/domain tidak menyentuh sqlx).
// ----------------------------------------------------------------------

impl crate::domain::ports::AuthStore for Store {
    async fn company_by_id(&self, id: Uuid) -> Result<Company, DomainError> {
        Store::company_by_id(self, id).await
    }
    async fn user_by_username(&self, username: &str) -> Option<User> {
        Store::user_by_username(self, username).await
    }
    async fn user_by_id(&self, id: Uuid) -> Option<User> {
        Store::user_by_id(self, id).await
    }
    async fn user_create_hris(
        &self,
        username: &str,
        email: Option<&str>,
        display_name: Option<&str>,
    ) -> Result<User, DomainError> {
        Store::user_create_hris(self, username, email, display_name).await
    }
    async fn user_profile_sync(
        &self,
        user_id: Uuid,
        display_name: Option<&str>,
        email: Option<&str>,
    ) -> Result<(), DomainError> {
        Store::user_profile_sync(self, user_id, display_name, email).await
    }
    async fn user_password_cache_update(
        &self,
        user_id: Uuid,
        password_hash: &str,
        hris_synced: bool,
    ) -> Result<(), DomainError> {
        Store::user_password_cache_update(self, user_id, password_hash, hris_synced).await
    }
    async fn role_ensure(&self, name: &str) -> Result<Uuid, DomainError> {
        Store::role_ensure(self, name).await
    }
    async fn access_ensure(&self, user_id: Uuid, company_id: Uuid, role_id: Uuid) -> Result<(), DomainError> {
        Store::access_ensure(self, user_id, company_id, role_id).await
    }
    async fn access_list(&self, user_id: Uuid) -> Result<Vec<CompanyAccess>, DomainError> {
        Store::access_list(self, user_id).await
    }
    async fn session_create(&self, data: SessionData) -> Result<(), DomainError> {
        Store::session_create(self, data).await
    }
    async fn sessions_revoke_all(&self, user_id: Uuid) -> Result<(), DomainError> {
        Store::sessions_revoke_all(self, user_id).await
    }
    async fn mfa_store_secret(
        &self,
        user_id: Uuid,
        secret_encrypted: Vec<u8>,
        backup_hashes: Vec<String>,
    ) -> Result<(), DomainError> {
        Store::mfa_store_secret(self, user_id, secret_encrypted, backup_hashes).await
    }
    async fn mfa_set_enabled(&self, user_id: Uuid, enabled: bool) -> Result<(), DomainError> {
        Store::mfa_set_enabled(self, user_id, enabled).await
    }
    async fn mfa_step_set(&self, user_id: Uuid, step: i64) -> Result<(), DomainError> {
        Store::mfa_step_set(self, user_id, step).await
    }
    async fn mfa_backup_consume(&self, user_id: Uuid, used_hash: &str) -> Result<(), DomainError> {
        Store::mfa_backup_consume(self, user_id, used_hash).await
    }
    async fn mfa_clear(&self, user_id: Uuid) -> Result<(), DomainError> {
        Store::mfa_clear(self, user_id).await
    }
    async fn activity_log(&self, data: ActivityLogData<'_>) {
        Store::activity_log(self, data).await
    }
}
