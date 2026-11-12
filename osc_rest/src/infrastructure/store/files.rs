//! Repository FileAsset — registry objek RustFS (metadata DB + pointer).

use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;

use super::Store;

pub(crate) struct FileMetaNew {
    pub company_id: Uuid,
    pub category: &'static str,
    pub bucket: String,
    pub object_key: String,
    pub file_name: String,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub sha256: Option<String>,
    pub uploaded_by_user_id: Option<Uuid>,
}

impl Store {
    pub async fn file_create(&self, meta: FileMetaNew) -> Result<Uuid, DomainError> {
        if !matches!(
            meta.category,
            "PAM_RECORDING" | "CONFIG_BACKUP" | "EXCEL_EXPORT" | "ATTACHMENT"
        ) {
            return Err(DomainError::validation("kategori file tidak valid"));
        }
        let row = sqlx::query(
            "INSERT INTO file_assets (company_id, category, bucket, object_key, file_name,
                 mime_type, size_bytes, sha256, uploaded_by_user_id)
             VALUES ($1, CAST($2 AS file_asset_category), $3, $4, $5, $6, $7, $8, $9)
             RETURNING id",
        )
        .bind(meta.company_id)
        .bind(meta.category)
        .bind(&meta.bucket)
        .bind(&meta.object_key)
        .bind(&meta.file_name)
        .bind(&meta.mime_type)
        .bind(meta.size_bytes)
        .bind(&meta.sha256)
        .bind(meta.uploaded_by_user_id)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    pub async fn file_list(&self, company_id: Uuid, limit: i64) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT id, category::text AS category, bucket, object_key, file_name,
                    mime_type, size_bytes, sha256, uploaded_by_user_id, created_at
             FROM file_assets
             WHERE company_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC
             LIMIT $2",
        )
        .bind(company_id)
        .bind(limit.clamp(1, 200))
        .fetch_all(self.pool())
        .await
        .map_err(super::db_err)?;

        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "category": row.try_get::<String, _>("category")?,
                    "file_name": row.try_get::<String, _>("file_name")?,
                    "mime_type": row.try_get::<Option<String>, _>("mime_type")?,
                    "size_bytes": row.try_get::<i64, _>("size_bytes")?,
                    "sha256": row.try_get::<Option<String>, _>("sha256")?,
                    "uploaded_by_user_id": row.try_get::<Option<Uuid>, _>("uploaded_by_user_id")?,
                    "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")?,
                }))
            })
            .collect()
    }

    /// Metadata file milik company aktif (anti IDOR).
    pub async fn file_get(&self, company_id: Uuid, file_id: Uuid) -> Result<Value, DomainError> {
        let row = sqlx::query(
            "SELECT id, category::text AS category, bucket, object_key, file_name,
                    mime_type, size_bytes, uploaded_by_user_id, created_at
             FROM file_assets
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(file_id)
        .fetch_optional(self.pool())
        .await
        .map_err(super::db_err)?
        .ok_or(DomainError::NotFound)?;

        Ok(json!({
            "id": row.try_get::<Uuid, _>("id")?,
            "category": row.try_get::<String, _>("category")?,
            "bucket": row.try_get::<String, _>("bucket")?,
            "object_key": row.try_get::<String, _>("object_key")?,
            "file_name": row.try_get::<String, _>("file_name")?,
            "mime_type": row.try_get::<Option<String>, _>("mime_type")?,
            "size_bytes": row.try_get::<i64, _>("size_bytes")?,
            "uploaded_by_user_id": row.try_get::<Option<Uuid>, _>("uploaded_by_user_id")?,
            "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")?,
        }))
    }
}
