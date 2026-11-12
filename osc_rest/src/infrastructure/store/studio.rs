//! Repository Studio koleksi dinamis (Directus-style, 3 tabel metadata)
//! + DDL runtime per-koleksi (identifier tervalidasi `valid_key`).

use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;
use crate::domain::filter::{FieldKind, FilterNode, push_where, valid_key};

use super::Store;

/// Nama tabel fisik koleksi — identifier dibatasi (prefix `dyn_` + ≤50 char).
pub(crate) fn table_name(collection: &str) -> Result<String, DomainError> {
    if valid_key(collection) && collection.len() <= 50 {
        Ok(format!("dyn_{collection}"))
    } else {
        Err(DomainError::validation(
            "nama koleksi harus [a-z][a-z0-9_]{0,49} (identifikasi tabel runtime)",
        ))
    }
}

/// Definisi field baru (Registrasi metadata — data tersimpan JSONB `data`).
pub struct FieldInput {
    pub field: String,
    pub is_required: bool,
    pub special: Option<String>,
}

impl Store {
    pub async fn collection_list(&self) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT c.id, c.collection, c.icon, c.note, c.is_hidden, c.is_system,
                    c.sort_order, c.created_at,
                    (SELECT count(*) FROM field_meta f WHERE f.collection_id = c.id) AS field_count
             FROM collection_meta c
             WHERE c.deleted_at IS NULL
             ORDER BY c.sort_order, c.collection",
        )
        .fetch_all(self.pool())
        .await
        .map_err(super::db_err)?;

        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "collection": row.try_get::<String, _>("collection")?,
                    "icon": row.try_get::<Option<String>, _>("icon")?,
                    "note": row.try_get::<Option<String>, _>("note")?,
                    "is_hidden": row.try_get::<bool, _>("is_hidden")?,
                    "is_system": row.try_get::<bool, _>("is_system")?,
                    "sort_order": row.try_get::<i32, _>("sort_order")?,
                    "field_count": row.try_get::<i64, _>("field_count")?,
                    "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")?,
                }))
            })
            .collect()
    }

    pub async fn collection_by_name(&self, collection: &str) -> Result<Option<Value>, DomainError> {
        let row = sqlx::query("SELECT id, collection FROM collection_meta WHERE collection = $1 AND deleted_at IS NULL")
            .bind(collection)
            .fetch_optional(self.pool())
            .await
            .map_err(super::db_err)?;
        Ok(row.map(|row| {
            json!({
                "id": row.try_get::<Uuid, _>("id").ok(),
                "collection": row.try_get::<String, _>("collection").ok(),
            })
        }))
    }

    /// Koleksi baru: metadata + fields + DDL runtime (transaksi).
    pub async fn collection_create(
        &self,
        collection: &str,
        icon: Option<&str>,
        note: Option<&str>,
        fields: &[FieldInput],
    ) -> Result<Value, DomainError> {
        let table = table_name(collection)?;

        // Validasi field name sebelum apapun (identifier / JSON key).
        for field in fields {
            if !valid_key(&field.field) {
                return Err(DomainError::validation(format!(
                    "field `{}` harus [a-z][a-z0-9_]",
                    field.field
                )));
            }
        }

        let mut tx = self.pool().begin().await.map_err(super::db_err)?;

        let exists = sqlx::query("SELECT 1 FROM collection_meta WHERE collection = $1")
            .bind(collection)
            .fetch_optional(&mut *tx)
            .await
            .map_err(super::db_err)?;
        if exists.is_some() {
            return Err(DomainError::Conflict(format!("koleksi `{collection}` sudah ada")));
        }

        let row = sqlx::query(
            "INSERT INTO collection_meta (collection, icon, note)
             VALUES ($1, $2, $3)
             RETURNING id",
        )
        .bind(collection)
        .bind(icon)
        .bind(note)
        .fetch_one(&mut *tx)
        .await
        .map_err(super::db_err)?;
        let collection_id: Uuid = row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;

        for field in fields {
            sqlx::query(
                "INSERT INTO field_meta (collection_id, field, is_required, special)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (collection_id, field) DO NOTHING",
            )
            .bind(collection_id)
            .bind(&field.field)
            .bind(field.is_required)
            .bind(&field.special)
            .execute(&mut *tx)
            .await
            .map_err(super::db_err)?;
        }

        // DDL runtime — identifier tervalidasi ketat (hanya [a-z0-9_]
        // via `valid_key`, lihat `table_name`), AUDIT: tidak ada nilai
        // klien lain yang masuk ke SQL ini → AssertSqlSafe aman.
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "CREATE TABLE IF NOT EXISTS {table} (
                 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                 company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
                 data jsonb NOT NULL DEFAULT '{{}}'::jsonb,
                 created_at timestamptz(3) NOT NULL DEFAULT now(),
                 updated_at timestamptz(3) NOT NULL DEFAULT now(),
                 deleted_at timestamptz(3)
             )"
        )))
        .execute(&mut *tx)
        .await
        .map_err(super::db_err)?;

        sqlx::query(sqlx::AssertSqlSafe(format!(
            "CREATE INDEX IF NOT EXISTS {table}_company_idx ON {table} (company_id, created_at DESC)"
        )))
        .execute(&mut *tx)
        .await
        .map_err(super::db_err)?;

        tx.commit().await.map_err(super::db_err)?;

        Ok(json!({
            "id": collection_id,
            "collection": collection,
            "table": table,
        }))
    }

    pub async fn field_list(&self, collection_id: Uuid) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT field, is_required, is_hidden, special, meta
             FROM field_meta
             WHERE collection_id = $1
             ORDER BY field",
        )
        .bind(collection_id)
        .fetch_all(self.pool())
        .await
        .map_err(super::db_err)?;

        rows.iter()
            .map(|row| {
                Ok(json!({
                    "field": row.try_get::<String, _>("field")?,
                    "is_required": row.try_get::<bool, _>("is_required")?,
                    "is_hidden": row.try_get::<bool, _>("is_hidden")?,
                    "special": row.try_get::<Option<String>, _>("special")?,
                    "meta": row.try_get::<Option<Value>, _>("meta")?,
                }))
            })
            .collect()
    }

    pub async fn field_add(
        &self,
        collection_id: Uuid,
        input: &FieldInput,
    ) -> Result<Value, DomainError> {
        if !valid_key(&input.field) {
            return Err(DomainError::validation("field harus [a-z][a-z0-9_]"));
        }
        let row = sqlx::query(
            "INSERT INTO field_meta (collection_id, field, is_required, special)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (collection_id, field) DO UPDATE SET
                 is_required = EXCLUDED.is_required, special = EXCLUDED.special
             RETURNING field",
        )
        .bind(collection_id)
        .bind(&input.field)
        .bind(input.is_required)
        .bind(input.special.clone())
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        Ok(json!({
            "field": row.try_get::<String, _>("field").map_err(super::db_err)?,
        }))
    }

    /// Peta field metadata → FieldKind DataKey (untuk filter AST).
    pub async fn field_map(&self, collection_id: Uuid) -> Result<crate::domain::filter::FieldMap, DomainError> {
        let rows = sqlx::query("SELECT field FROM field_meta WHERE collection_id = $1")
            .bind(collection_id)
            .fetch_all(self.pool())
            .await
            .map_err(super::db_err)?;

        let mut map = crate::domain::filter::FieldMap::new();
        for row in rows {
            let field: String = row.try_get("field").map_err(|e| DomainError::Unavailable(format!("{e}")))?;
            map.insert(field.clone(), FieldKind::DataKey(field));
        }
        Ok(map)
    }

    // ------------------------------------------------------------------
    // Items (data koleksi dinamis, tenant-guarded)
    // ------------------------------------------------------------------

    pub async fn item_insert(
        &self,
        collection: &str,
        company_id: Uuid,
        data: Value,
    ) -> Result<Value, DomainError> {
        let table = table_name(collection)?; // identifier tervalidasi (audit)
        let row = sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO {table} (company_id, data) VALUES ($1, $2) RETURNING id, data"
        )))
        .bind(company_id)
        .bind(data)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        Ok(json!({
            "id": row.try_get::<Uuid, _>("id").map_err(super::db_err)?,
            "data": row.try_get::<Value, _>("data").map_err(super::db_err)?,
        }))
    }

    pub async fn item_list(
        &self,
        collection: &str,
        company_id: Uuid,
        filter: Option<&FilterNode>,
        fields: &crate::domain::filter::FieldMap,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let table = table_name(collection)?;
        let mut qb = sqlx::query_builder::QueryBuilder::new(format!(
            "SELECT id, data, created_at FROM {table} WHERE company_id = "
        ));
        qb.push_bind(company_id);
        qb.push(" AND deleted_at IS NULL");
        if let Some(filter) = filter {
            qb.push(" AND ");
            push_where(&mut qb, filter, fields)?;
        }
        qb.push(" ORDER BY created_at DESC LIMIT ");
        qb.push_bind(limit.clamp(1, 500));
        qb.push(" OFFSET ");
        qb.push_bind(offset.max(0));

        let rows = qb
            .build()
            .fetch_all(self.pool())
            .await
            .map_err(super::db_err)?;

        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "data": row.try_get::<Value, _>("data")?,
                    "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")?,
                }))
            })
            .collect()
    }
}
