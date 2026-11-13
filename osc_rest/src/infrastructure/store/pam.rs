//! Repository PAM (Wave 3 — pola JumpServer): vault akun (secret Envelope
//! AES-256-GCM), access policy (mandatory MFA + step-up + CIDR ACL), sesi
//! append-only dengan ephemeral WS ticket (hash SHA-256, mentah tidak
//! pernah disimpan), dan pointer rekaman RustFS.
//!
//! Tenant isolation: setiap load membawa `company_id` (anti IDOR) —
//! `active_company_id` selalu leading pada filter (bab 5.6).

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;

use super::{Store, db_err, ref_in_company};

/// Payload pembuatan akun vault (secret_encrypted = ciphertext Envelope
/// hasil handler — plaintext tidak pernah menyentuh layer ini).
pub struct PamAccountNew<'a> {
    pub company_id: Uuid,
    pub asset_id: Uuid,
    pub policy_id: Option<Uuid>,
    pub label: &'a str,
    pub account_type: &'a str,
    pub username: &'a str,
    pub secret_encrypted: Vec<u8>,
    pub port: i32,
}

/// Patch akun vault (None = biarkan; Some(None) = hapus policy).
pub struct PamAccountPatch {
    pub label: Option<String>,
    pub policy_id: Option<Option<Uuid>>,
    pub port: Option<i32>,
    pub is_active: Option<bool>,
    /// None = biarkan; Some(blob) = rotasi secret (re-encrypt).
    pub secret_encrypted: Option<Vec<u8>>,
}

/// Baris policy akses (snapshot untuk keputusan authorize).
#[derive(Debug, Clone)]
pub struct PamPolicyRow {
    pub id: Uuid,
    pub name: String,
    pub mfa_required: bool,
    pub step_up_window_minutes: i32,
    pub approval_required: bool,
    pub ticket_required: bool,
    pub command_filter: Option<Value>,
    /// INET[] dibaca sebagai `::text[]` — diparse `infrastructure::cidr`.
    pub allowed_source_cidrs: Vec<String>,
    pub max_session_minutes: i32,
    pub is_active: bool,
}

/// Baris akun vault untuk keputusan authorize (secret TIDAK dimuat —
/// dekripsi hanya terjadi pada redeem ticket oleh gateway).
pub struct PamAccountRow {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub policy_id: Option<Uuid>,
    pub label: String,
    pub account_type: String,
    pub username: String,
    pub port: i32,
    pub is_active: bool,
}

/// Data sesi AUTHORIZED baru (bundle argumen — audit append-only).
pub struct PamSessionAuthorized<'a> {
    pub session_id: Uuid,
    pub company_id: Uuid,
    pub account_id: Uuid,
    pub policy_id: Option<Uuid>,
    pub requested_by: Uuid,
    pub source_ip: Option<&'a str>,
    pub ws_ticket_hash: &'a str,
}

/// Baris sesi untuk redeem gateway (join akun + asset target).
pub struct PamRedeemRow {    pub id: Uuid,
    pub status: String,
    pub ws_ticket_hash: Option<String>,
    pub created_at: DateTime<Utc>,
    pub username: String,
    pub account_type: String,
    pub secret_encrypted: Vec<u8>,
    pub port: i32,
    pub asset_id: Uuid,
    pub asset_name: String,
    pub mgmt_ip: Option<String>,
    pub hostname: Option<String>,
    pub fqdn: Option<String>,
    pub command_filter: Option<Value>,
    pub max_session_minutes: i32,
}

impl Store {
    // ------------------------------------------------------------------
    // Vault accounts
    // ------------------------------------------------------------------

    /// Akun baru — validasi kepemilikan asset & policy SEBELUM insert.
    pub async fn pam_account_create(&self, account: PamAccountNew<'_>) -> Result<Uuid, DomainError> {
        if !ref_in_company(self.pool(), account.company_id, super::RefTable::Asset, account.asset_id)
            .await?
        {
            return Err(DomainError::validation("asset_id tidak milik company aktif"));
        }
        if let Some(policy_id) = account.policy_id
            && !ref_in_company(
                self.pool(),
                account.company_id,
                super::RefTable::PamPolicy,
                policy_id,
            )
            .await?
        {
            return Err(DomainError::validation("policy_id tidak milik company aktif"));
        }

        let row = sqlx::query(
            "INSERT INTO pam_vault_accounts
                 (company_id, asset_id, policy_id, label, account_type, username,
                  secret_encrypted, port)
             VALUES ($1, $2, $3, $4, CAST($5 AS pam_account_type), $6, $7, $8)
             RETURNING id",
        )
        .bind(account.company_id)
        .bind(account.asset_id)
        .bind(account.policy_id)
        .bind(account.label)
        .bind(account.account_type)
        .bind(account.username)
        .bind(account.secret_encrypted)
        .bind(account.port)
        .fetch_one(self.pool())
        .await
        .map_err(db_err)?;
        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("row: {e}")))
    }

    /// Daftar akun (tanpa secret — hanya metadata vault).
    pub async fn pam_accounts_list(
        &self,
        company_id: Uuid,
        limit: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT a.id, a.asset_id, x.name AS asset_name, a.policy_id, p.name AS policy_name,
                    a.label, a.account_type::text AS account_type, a.username, a.port,
                    a.is_active, a.created_at, a.updated_at
             FROM pam_vault_accounts a
             JOIN assets x ON x.id = a.asset_id
             LEFT JOIN pam_access_policies p ON p.id = a.policy_id
             WHERE a.company_id = $1 AND a.deleted_at IS NULL
             ORDER BY a.created_at DESC
             LIMIT $2",
        )
        .bind(company_id)
        .bind(limit.clamp(1, 200))
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "asset_id": row.try_get::<Uuid, _>("asset_id")?,
                    "asset_name": row.try_get::<String, _>("asset_name")?,
                    "policy_id": row.try_get::<Option<Uuid>, _>("policy_id")?,
                    "policy_name": row.try_get::<Option<String>, _>("policy_name")?,
                    "label": row.try_get::<String, _>("label")?,
                    "account_type": row.try_get::<String, _>("account_type")?,
                    "username": row.try_get::<String, _>("username")?,
                    "port": row.try_get::<i32, _>("port")?,
                    "is_active": row.try_get::<bool, _>("is_active")?,
                    "created_at": row.try_get::<DateTime<Utc>, _>("created_at")?,
                    "updated_at": row.try_get::<DateTime<Utc>, _>("updated_at")?,
                }))
            })
            .collect()
    }

    /// Baris penuh akun untuk authorize (secret tidak dimuat — dekripsi
    /// hanya pada redeem).
    pub async fn pam_account_load(
        &self,
        company_id: Uuid,
        account_id: Uuid,
    ) -> Result<Option<PamAccountRow>, DomainError> {
        let row = sqlx::query(
            "SELECT id, asset_id, policy_id, label,
                    account_type::text AS account_type, username, port, is_active
             FROM pam_vault_accounts
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(account_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?;

        row.map(|row| {
            Ok(PamAccountRow {
                id: row.try_get("id")?,
                asset_id: row.try_get("asset_id")?,
                policy_id: row.try_get("policy_id")?,
                label: row.try_get("label")?,
                account_type: row.try_get("account_type")?,
                username: row.try_get("username")?,
                port: row.try_get("port")?,
                is_active: row.try_get("is_active")?,
            })
        })
        .transpose()
    }

    /// Metadata akun untuk response CRUD (tanpa secret).
    pub async fn pam_account_summary(
        &self,
        company_id: Uuid,
        account_id: Uuid,
    ) -> Result<Value, DomainError> {
        let row = sqlx::query(
            "SELECT a.id, a.asset_id, x.name AS asset_name, a.policy_id, p.name AS policy_name,
                    a.label, a.account_type::text AS account_type, a.username, a.port,
                    a.is_active, a.created_at, a.updated_at
             FROM pam_vault_accounts a
             JOIN assets x ON x.id = a.asset_id
             LEFT JOIN pam_access_policies p ON p.id = a.policy_id
             WHERE a.id = $2 AND a.company_id = $1 AND a.deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(account_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?
        .ok_or(DomainError::NotFound)?;

        Ok(json!({
            "id": row.try_get::<Uuid, _>("id")?,
            "asset_id": row.try_get::<Uuid, _>("asset_id")?,
            "asset_name": row.try_get::<String, _>("asset_name")?,
            "policy_id": row.try_get::<Option<Uuid>, _>("policy_id")?,
            "policy_name": row.try_get::<Option<String>, _>("policy_name")?,
            "label": row.try_get::<String, _>("label")?,
            "account_type": row.try_get::<String, _>("account_type")?,
            "username": row.try_get::<String, _>("username")?,
            "port": row.try_get::<i32, _>("port")?,
            "is_active": row.try_get::<bool, _>("is_active")?,
            "created_at": row.try_get::<DateTime<Utc>, _>("created_at")?,
            "updated_at": row.try_get::<DateTime<Utc>, _>("updated_at")?,
        }))
    }

    pub async fn pam_account_update(
        &self,
        company_id: Uuid,
        account_id: Uuid,
        patch: PamAccountPatch,
    ) -> Result<(), DomainError> {
        if let Some(Some(policy_id)) = patch.policy_id
            && !ref_in_company(self.pool(), company_id, super::RefTable::PamPolicy, policy_id)
                .await?
        {
            return Err(DomainError::validation("policy_id tidak milik company aktif"));
        }

        let result = sqlx::query(
            "UPDATE pam_vault_accounts SET
                 label = COALESCE($3, label),
                 policy_id = CASE
                     WHEN $4::bool IS NULL THEN policy_id
                     WHEN $4::bool THEN $5::uuid
                     ELSE NULL END,
                 port = COALESCE($6, port),
                 is_active = COALESCE($7, is_active),
                 secret_encrypted = COALESCE($8, secret_encrypted),
                 updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(account_id)
        .bind(patch.label)
        .bind(patch.policy_id.is_some())
        .bind(patch.policy_id.flatten())
        .bind(patch.port)
        .bind(patch.is_active)
        .bind(patch.secret_encrypted)
        .execute(self.pool())
        .await
        .map_err(db_err)?;

        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    /// Soft delete (vault tetap auditable).
    pub async fn pam_account_delete(&self, company_id: Uuid, account_id: Uuid) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE pam_vault_accounts SET deleted_at = now(), is_active = false, updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(account_id)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    // ------------------------------------------------------------------
    // Access policy
    // ------------------------------------------------------------------

    pub async fn pam_policy_load(
        &self,
        company_id: Uuid,
        policy_id: Uuid,
    ) -> Result<Option<PamPolicyRow>, DomainError> {
        let row = sqlx::query(
            "SELECT id, name, mfa_required, step_up_window_minutes, approval_required,
                    ticket_required, command_filter, allowed_source_cidrs::text[] AS cidrs,
                    max_session_minutes, is_active
             FROM pam_access_policies
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(policy_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?;

        row.map(|row| {
            Ok(PamPolicyRow {
                id: row.try_get("id")?,
                name: row.try_get("name")?,
                mfa_required: row.try_get("mfa_required")?,
                step_up_window_minutes: row.try_get("step_up_window_minutes")?,
                approval_required: row.try_get("approval_required")?,
                ticket_required: row.try_get("ticket_required")?,
                command_filter: row.try_get("command_filter")?,
                allowed_source_cidrs: row.try_get("cidrs")?,
                max_session_minutes: row.try_get("max_session_minutes")?,
                is_active: row.try_get("is_active")?,
            })
        })
        .transpose()
    }

    // ------------------------------------------------------------------
    // Session logs (append-only)
    // ------------------------------------------------------------------

    /// Sesi baru berstatus AUTHORIZED (ticket hash disimpan — mentah sekali tampil).
    pub async fn pam_session_authorized(&self, data: PamSessionAuthorized<'_>) -> Result<(), DomainError> {
        sqlx::query(
            "INSERT INTO pam_session_logs
                 (id, company_id, account_id, policy_id, requested_by_user_id,
                  status, source_ip, ws_ticket_hash)
             VALUES ($1, $2, $3, $4, $5, 'AUTHORIZED', CAST($6 AS inet), $7)",
        )
        .bind(data.session_id)
        .bind(data.company_id)
        .bind(data.account_id)
        .bind(data.policy_id)
        .bind(data.requested_by)
        .bind(data.source_ip)
        .bind(data.ws_ticket_hash)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        Ok(())
    }

    /// Catat penolakan authorize (audit keamanan — tidak pernah diam).
    pub async fn pam_session_denied(
        &self,
        company_id: Uuid,
        account_id: Uuid,
        policy_id: Option<Uuid>,
        requested_by: Option<Uuid>,
        source_ip: Option<&str>,
        reason: &str,
    ) {
        let result = sqlx::query(
            "INSERT INTO pam_session_logs
                 (company_id, account_id, policy_id, requested_by_user_id,
                  status, source_ip, denied_reason)
             VALUES ($1, $2, $3, $4, 'DENIED', CAST($5 AS inet), $6)",
        )
        .bind(company_id)
        .bind(account_id)
        .bind(policy_id)
        .bind(requested_by)
        .bind(source_ip)
        .bind(reason.chars().take(300).collect::<String>())
        .execute(self.pool())
        .await;

        // Audit gagal tidak menggagalkan penolakan utama.
        if let Err(err) = result {
            tracing::warn!(
                error = %crate::infrastructure::logging::redact(&err.to_string()),
                "pam_session_denied gagal ditulis"
            );
        }
    }

    /// Muat sesi + konteks koneksi untuk redeem ticket (HMAC gateway).
    pub async fn pam_session_redeem_load(
        &self,
        company_id: Uuid,
        session_id: Uuid,
    ) -> Result<Option<PamRedeemRow>, DomainError> {
        let row = sqlx::query(
            "SELECT s.id, s.status::text AS status, s.ws_ticket_hash, s.created_at,
                    a.username, a.account_type::text AS account_type,
                    a.secret_encrypted, a.port,
                    x.id AS asset_id, x.name AS asset_name,
                    x.mgmt_ip::text AS mgmt_ip, x.hostname, x.fqdn,
                    p.command_filter, p.max_session_minutes
             FROM pam_session_logs s
             JOIN pam_vault_accounts a ON a.id = s.account_id
             JOIN assets x ON x.id = a.asset_id
             LEFT JOIN pam_access_policies p ON p.id = a.policy_id
             WHERE s.id = $2 AND s.company_id = $1",
        )
        .bind(company_id)
        .bind(session_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?;

        row.map(|row| {
            Ok(PamRedeemRow {
                id: row.try_get("id")?,
                status: row.try_get("status")?,
                ws_ticket_hash: row.try_get("ws_ticket_hash")?,
                created_at: row.try_get("created_at")?,
                username: row.try_get("username")?,
                account_type: row.try_get("account_type")?,
                secret_encrypted: row.try_get("secret_encrypted")?,
                port: row.try_get("port")?,
                asset_id: row.try_get("asset_id")?,
                asset_name: row.try_get("asset_name")?,
                mgmt_ip: row.try_get("mgmt_ip")?,
                hostname: row.try_get("hostname")?,
                fqdn: row.try_get("fqdn")?,
                command_filter: row.try_get("command_filter")?,
                max_session_minutes: row
                    .try_get::<Option<i32>, _>("max_session_minutes")?
                    .unwrap_or(120),
            })
        })
        .transpose()
    }

    /// Ticket ditebus satu kali: AUTHORIZED → ACTIVE + started_at.
    /// `rows_affected == 0` berarti sudah ditebus/denied/expired.
    pub async fn pam_session_mark_active(&self, session_id: Uuid) -> Result<bool, DomainError> {
        let result = sqlx::query(
            "UPDATE pam_session_logs
             SET status = 'ACTIVE', started_at = now()
             WHERE id = $1 AND status = 'AUTHORIZED'",
        )
        .bind(session_id)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        Ok(result.rows_affected() > 0)
    }

    /// Simpan pointer rekaman di RustFS (DB hanya metadata — bab 5.8).
    pub async fn pam_session_set_recording(
        &self,
        company_id: Uuid,
        session_id: Uuid,
        object_key: &str,
    ) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE pam_session_logs
             SET recording_object_key = $3
             WHERE id = $2 AND company_id = $1",
        )
        .bind(company_id)
        .bind(session_id)
        .bind(object_key)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    /// Riwayat sesi tenant (audit trail — tanpa ticket hash/secret).
    pub async fn pam_sessions_list(
        &self,
        company_id: Uuid,
        limit: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT s.id, s.account_id, a.label AS account_label, s.policy_id,
                    s.requested_by_user_id, s.status::text AS status, s.source_ip::text AS source_ip,
                    s.command_count, s.recording_object_key, s.denied_reason,
                    s.started_at, s.ended_at, s.duration_seconds, s.created_at
             FROM pam_session_logs s
             JOIN pam_vault_accounts a ON a.id = s.account_id
             WHERE s.company_id = $1
             ORDER BY s.created_at DESC
             LIMIT $2",
        )
        .bind(company_id)
        .bind(limit.clamp(1, 200))
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "account_id": row.try_get::<Uuid, _>("account_id")?,
                    "account_label": row.try_get::<String, _>("account_label")?,
                    "policy_id": row.try_get::<Option<Uuid>, _>("policy_id")?,
                    "requested_by_user_id": row.try_get::<Option<Uuid>, _>("requested_by_user_id")?,
                    "status": row.try_get::<String, _>("status")?,
                    "source_ip": row.try_get::<Option<String>, _>("source_ip")?,
                    "command_count": row.try_get::<i32, _>("command_count")?,
                    "recording_object_key": row.try_get::<Option<String>, _>("recording_object_key")?,
                    "denied_reason": row.try_get::<Option<String>, _>("denied_reason")?,
                    "started_at": row.try_get::<Option<DateTime<Utc>>, _>("started_at")?,
                    "ended_at": row.try_get::<Option<DateTime<Utc>>, _>("ended_at")?,
                    "duration_seconds": row.try_get::<Option<i32>, _>("duration_seconds")?,
                    "created_at": row.try_get::<DateTime<Utc>, _>("created_at")?,
                }))
            })
            .collect()
    }

    /// Ringkasan satu sesi (anti IDOR — company scope).
    pub async fn pam_session_get(
        &self,
        company_id: Uuid,
        session_id: Uuid,
    ) -> Result<Value, DomainError> {
        let row = sqlx::query(
            "SELECT s.id, s.account_id, a.label AS account_label, s.policy_id,
                    s.requested_by_user_id, s.status::text AS status,
                    s.source_ip::text AS source_ip, s.command_count,
                    s.recording_object_key, s.denied_reason,
                    s.started_at, s.ended_at, s.duration_seconds, s.created_at
             FROM pam_session_logs s
             JOIN pam_vault_accounts a ON a.id = s.account_id
             WHERE s.id = $2 AND s.company_id = $1",
        )
        .bind(company_id)
        .bind(session_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?
        .ok_or(DomainError::NotFound)?;

        Ok(json!({
            "id": row.try_get::<Uuid, _>("id")?,
            "account_id": row.try_get::<Uuid, _>("account_id")?,
            "account_label": row.try_get::<String, _>("account_label")?,
            "policy_id": row.try_get::<Option<Uuid>, _>("policy_id")?,
            "requested_by_user_id": row.try_get::<Option<Uuid>, _>("requested_by_user_id")?,
            "status": row.try_get::<String, _>("status")?,
            "source_ip": row.try_get::<Option<String>, _>("source_ip")?,
            "command_count": row.try_get::<i32, _>("command_count")?,
            "recording_object_key": row.try_get::<Option<String>, _>("recording_object_key")?,
            "denied_reason": row.try_get::<Option<String>, _>("denied_reason")?,
            "started_at": row.try_get::<Option<DateTime<Utc>>, _>("started_at")?,
            "ended_at": row.try_get::<Option<DateTime<Utc>>, _>("ended_at")?,
            "duration_seconds": row.try_get::<Option<i32>, _>("duration_seconds")?,
            "created_at": row.try_get::<DateTime<Utc>, _>("created_at")?,
        }))
    }
}
