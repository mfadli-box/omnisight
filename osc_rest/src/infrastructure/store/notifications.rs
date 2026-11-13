//! Repository Notification Channel (bab 5.8 — Centralized Notification
//! Dispatcher): CRUD channel SMTP/Telegram/Webhook per company.
//!
//! `config` (SMTP password, bot token, webhook URL) TIDAK pernah disimpan
//! plaintext — handler mengenkripsi seluruh config (Envelope AES-256-GCM)
//! menjadi `{"enc": "<base64>"}` di kolom JSONB; API hanya mengembalikan
//! ringkasan ter-sanitasi (secret di-mask).

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;

use super::{Store, db_err};

impl Store {
    pub async fn notif_channels_list(
        &self,
        company_id: Uuid,
        limit: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT id, type::text AS type, config, event_filter, is_active, created_at, updated_at
             FROM notification_channels
             WHERE company_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC
             LIMIT $2",
        )
        .bind(company_id)
        .bind(limit.clamp(1, 100))
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        rows.iter().map(channel_from_row).collect()
    }

    pub async fn notif_channel_get(
        &self,
        company_id: Uuid,
        channel_id: Uuid,
    ) -> Result<Value, DomainError> {
        let row = sqlx::query(
            "SELECT id, type::text AS type, config, event_filter, is_active, created_at, updated_at
             FROM notification_channels
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(channel_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?
        .ok_or(DomainError::NotFound)?;

        channel_from_row(&row)
    }

    /// Channel baru — `config_encrypted` sudah `{"enc": ...}` dari handler.
    /// UNIQUE (company_id, type) → pelanggaran dipetakan 409 oleh `db_err`.
    pub async fn notif_channel_create(
        &self,
        company_id: Uuid,
        channel_type: &str,
        config_encrypted: Value,
        event_filter: &[String],
        is_active: bool,
    ) -> Result<Uuid, DomainError> {
        let row = sqlx::query(
            "INSERT INTO notification_channels (company_id, type, config, event_filter, is_active)
             VALUES ($1, CAST($2 AS notification_channel_type), $3, $4, $5)
             RETURNING id",
        )
        .bind(company_id)
        .bind(channel_type)
        .bind(config_encrypted)
        .bind(event_filter)
        .bind(is_active)
        .fetch_one(self.pool())
        .await
        .map_err(db_err)?;
        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("row: {e}")))
    }

    pub async fn notif_channel_update(
        &self,
        company_id: Uuid,
        channel_id: Uuid,
        config_encrypted: Option<Value>,
        event_filter: Option<Vec<String>>,
        is_active: Option<bool>,
    ) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE notification_channels SET
                 config = COALESCE($3, config),
                 event_filter = COALESCE($4, event_filter),
                 is_active = COALESCE($5, is_active),
                 updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(channel_id)
        .bind(config_encrypted)
        .bind(event_filter)
        .bind(is_active)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    pub async fn notif_channel_delete(
        &self,
        company_id: Uuid,
        channel_id: Uuid,
    ) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE notification_channels SET deleted_at = now(), is_active = false, updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(channel_id)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }
}

/// Mapping baris → JSON respons (config didekripsi handler jadi ringkasan;
/// di sini hanya melewatkan blob `{"enc": ...}` apa adanya).
fn channel_from_row(row: &sqlx::postgres::PgRow) -> Result<Value, DomainError> {
    Ok(json!({
        "id": row.try_get::<Uuid, _>("id")?,
        "type": row.try_get::<String, _>("type")?,
        "config": row.try_get::<Value, _>("config")?,
        "event_filter": row.try_get::<Vec<String>, _>("event_filter")?,
        "is_active": row.try_get::<bool, _>("is_active")?,
        "created_at": row.try_get::<DateTime<Utc>, _>("created_at")?,
        "updated_at": row.try_get::<DateTime<Utc>, _>("updated_at")?,
    }))
}
