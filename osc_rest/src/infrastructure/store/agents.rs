//! Repository Agent Enrollment & Registry (bab 5.8):
//!
//! - `agent_enrollment_tokens`: one-time token terikat company + TTL
//!   (disimpan sebagai hash SHA-256; plaintext hanya ditampilkan sekali).
//! - Registry agent: entitas `assets` (ManagedNode) dengan
//!   `is_dynamic = true`, `source = 'agent'`; `agent_id` = id asset.
//!   `hmac_secret` disimpan Envelope AES-256-GCM (base64) di
//!   `assets.metadata->{"agent"}` — tidak pernah plaintext di database.

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;

use super::Store;

/// Baris token enrollment hasil konsumsi atomik.
#[derive(Debug, Clone)]
pub struct EnrollmentToken {
    pub id: Uuid,
    pub company_id: Uuid,
    pub node_type: String,
}

/// Paket pembuatan identitas agent (ManagedNode dinamis).
pub struct AgentNew<'a> {
    pub company_id: Uuid,
    pub node_type: &'a str,
    pub hostname: &'a str,
    pub mgmt_ip: Option<&'a str>,
    pub asset_tag: &'a str,
    pub asset_model_id: Uuid,
    pub status_label_id: Uuid,
    pub agent_version: Option<&'a str>,
    /// Ciphertext Envelope AES-256-GCM (base64 standar).
    pub hmac_secret_enc: &'a str,
}

/// Identitas agent untuk verifikasi HMAC per-request.
pub struct AgentIdentity {
    pub company_id: Uuid,
    /// Ciphertext Envelope (base64) dari `assets.metadata`.
    pub hmac_secret_enc: String,
}

impl Store {
    // ------------------------------------------------------------------
    // Enrollment tokens (one-time, TTL, terikat tenant)
    // ------------------------------------------------------------------

    pub async fn enrollment_token_create(
        &self,
        company_id: Uuid,
        token_hash: &str,
        node_type: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<Uuid, DomainError> {
        if !matches!(
            node_type,
            "HOST" | "NETWORK" | "VIRTUAL" | "CONTAINER" | "RACK_MOUNTED" | "SERVICE"
        ) {
            return Err(DomainError::validation("node_type tidak valid"));
        }
        let row = sqlx::query(
            "INSERT INTO agent_enrollment_tokens
                 (company_id, token_hash, node_type, expires_at)
             VALUES ($1, $2, CAST($3 AS node_type), $4)
             RETURNING id",
        )
        .bind(company_id)
        .bind(token_hash)
        .bind(node_type)
        .bind(expires_at)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    /// Konsumsi atomik token sekali pakai (single-use + TTL).
    /// `UPDATE ... WHERE used_at IS NULL AND expires_at > now()` mencegah
    /// double-claim dua agent paralel.
    pub async fn enrollment_token_consume(
        &self,
        token_hash: &str,
    ) -> Result<Option<EnrollmentToken>, DomainError> {
        let row = sqlx::query(
            "UPDATE agent_enrollment_tokens
              SET used_at = now()
              WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
              RETURNING id, company_id, node_type::text AS node_type",
        )
        .bind(token_hash)
        .fetch_optional(self.pool())
        .await
        .map_err(super::db_err)?;

        let Some(row) = row else { return Ok(None) };
        Ok(Some(EnrollmentToken {
            id: row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))?,
            company_id: row.try_get("company_id").map_err(|e| DomainError::Unavailable(format!("{e}")))?,
            node_type: row.try_get("node_type").map_err(|e| DomainError::Unavailable(format!("{e}")))?,
        }))
    }

    // ------------------------------------------------------------------
    // Registry agent (ManagedNode dinamis)
    // ------------------------------------------------------------------

    /// Daftarkan agent baru → `agent_id` (id asset dinamis). Secret HMAC
    /// disimpan terenkripsi di metadata; plaintext tidak pernah dipersist.
    pub async fn agent_register(&self, agent: AgentNew<'_>) -> Result<Uuid, DomainError> {
        let metadata = json!({
            "agent": {
                "version": agent.agent_version,
                "hmac_secret_enc": agent.hmac_secret_enc,
                "enrolled_at": Utc::now().to_rfc3339(),
            }
        });

        let row = sqlx::query(
            "INSERT INTO assets
                 (company_id, name, asset_tag, node_type, status, hostname, mgmt_ip,
                  asset_model_id, status_label_id, is_dynamic, source, metadata, last_seen_at)
             VALUES ($1, $2, $3, CAST($4 AS node_type), CAST('ACTIVE' AS asset_status),
                     $5, CAST($6 AS inet), $7, $8, true, 'agent', $9, now())
             RETURNING id",
        )
        .bind(agent.company_id)
        .bind(agent.hostname)
        .bind(agent.asset_tag)
        .bind(agent.node_type)
        .bind(agent.hostname)
        .bind(agent.mgmt_ip)
        .bind(agent.asset_model_id)
        .bind(agent.status_label_id)
        .bind(metadata)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    /// Muat identitas agent (company + secret terenkripsi) untuk guard HMAC.
    /// Hanya asset dinamis `source='agent'` yang dianggap agent.
    pub async fn agent_identity_load(&self, agent_id: Uuid) -> Result<Option<AgentIdentity>, DomainError> {
        let row = sqlx::query(
            "SELECT company_id, metadata
             FROM assets
             WHERE id = $1 AND is_dynamic AND source = 'agent' AND deleted_at IS NULL",
        )
        .bind(agent_id)
        .fetch_optional(self.pool())
        .await
        .map_err(super::db_err)?;

        let Some(row) = row else { return Ok(None) };
        let company_id: Uuid = row.try_get("company_id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;
        let metadata: Option<Value> = row
            .try_get("metadata")
            .map_err(|e| DomainError::Unavailable(format!("{e}")))?;
        let secret = metadata
            .as_ref()
            .and_then(|m| m.get("agent"))
            .and_then(|a| a.get("hmac_secret_enc"))
            .and_then(Value::as_str)
            .map(str::to_owned);

        Ok(secret.map(|hmac_secret_enc| AgentIdentity { company_id, hmac_secret_enc }))
    }

    /// Heartbeat agent: `assets.last_seen_at` (best-effort, non-fatal).
    pub async fn agent_touch(&self, agent_id: Uuid) {
        let _ = sqlx::query("UPDATE assets SET last_seen_at = now() WHERE id = $1")
            .bind(agent_id)
            .execute(self.pool())
            .await;
    }

    // ------------------------------------------------------------------
    // Admin gate (enrollment token = endpoint admin)
    // ------------------------------------------------------------------

    /// Nama role untuk gate admin (`super admin` ATAU role ber-nama admin).
    pub async fn role_name(&self, role_id: Uuid) -> Result<Option<String>, DomainError> {
        let row = sqlx::query("SELECT name FROM roles WHERE id = $1")
            .bind(role_id)
            .fetch_optional(self.pool())
            .await
            .map_err(super::db_err)?;
        Ok(row.and_then(|row| row.try_get("name").ok()))
    }
}
