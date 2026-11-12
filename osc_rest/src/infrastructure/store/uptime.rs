//! Repository Synthetic Uptime & Status Pages (Wave 2 — pola Uptime Kuma):
//!
//! - `uptime_monitors`: CRUD polymorphic (config JSONB per tipe) +
//!   `push_token_hash` (hash SHA-256; plaintext ditampilkan sekali).
//! - `uptime_heartbeats`: append-only; `important` = flag transisi
//!   UP↔DOWN (partial index Uptime Kuma via migration SQL).
//! - `status_pages` + `status_page_monitors`: halaman publik per tenant.
//!
//! Tenant isolation: semua query leading `company_id = $1` (bab 5.6).

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;

use super::{Store, db_err, ref_in_company};

/// Tipe monitor yang didukung (enum Prisma `uptime_monitor_type`).
pub const MONITOR_TYPES: &[&str] =
    &["HTTP", "HTTPS", "TCP", "ICMP", "DNS", "KEYWORD", "PUSH"];

/// Paket pembuatan monitor baru.
pub struct MonitorNew<'a> {
    pub name: &'a str,
    pub monitor_type: &'a str,
    pub target: &'a str,
    pub config: Option<Value>,
    pub interval_seconds: i32,
    pub retries: i32,
    pub asset_id: Option<Uuid>,
}

/// Paket update monitor (None = biarkan).
pub struct MonitorPatch<'a> {
    pub name: Option<&'a str>,
    pub target: Option<&'a str>,
    pub config: Option<Value>,
    pub interval_seconds: Option<i32>,
    pub retries: Option<i32>,
    pub is_active: Option<bool>,
}

impl Store {
    // ------------------------------------------------------------------
    // Monitors CRUD
    // ------------------------------------------------------------------

    pub async fn monitors_list(
        &self,
        company_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT id, name, type::text AS type, target, config, interval_seconds,
                    retries, is_active, created_at, updated_at
             FROM uptime_monitors
             WHERE company_id = $1 AND deleted_at IS NULL
             ORDER BY name
             LIMIT $2 OFFSET $3",
        )
        .bind(company_id)
        .bind(limit.clamp(1, 500))
        .bind(offset.max(0))
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        rows.iter().map(monitor_from_row).collect()
    }

    pub async fn monitor_get(&self, company_id: Uuid, monitor_id: Uuid) -> Result<Value, DomainError> {
        let row = sqlx::query(
            "SELECT id, name, type::text AS type, target, config, interval_seconds,
                    retries, is_active, created_at, updated_at
             FROM uptime_monitors
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(monitor_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?
        .ok_or(DomainError::NotFound)?;

        monitor_from_row(&row)
    }

    /// Monitor baru; mengembalikan id + push token plaintext bila tipe PUSH
    /// (token disimpan sebagai hash, plaintext hanya sekali).
    pub async fn monitor_create(
        &self,
        company_id: Uuid,
        monitor: MonitorNew<'_>,
    ) -> Result<(Uuid, Option<String>), DomainError> {
        if !MONITOR_TYPES.contains(&monitor.monitor_type) {
            return Err(DomainError::validation("tipe monitor tidak valid"));
        }
        if let Some(asset_id) = monitor.asset_id
            && !ref_in_company(self.pool(), company_id, super::RefTable::Asset, asset_id).await?
        {
            return Err(DomainError::validation("asset_id tidak milik company aktif"));
        }

        // Tipe PUSH: token acak (disimpan SHA-256; plaintext tampil sekali).
        let push_token = (monitor.monitor_type == "PUSH").then(|| {
            crate::infrastructure::crypto::random_hex(24)
        });
        let push_token_hash = push_token
            .as_deref()
            .map(|token| crate::infrastructure::crypto::sha256_hex(token.as_bytes()));

        let row = sqlx::query(
            "INSERT INTO uptime_monitors
                 (company_id, asset_id, name, type, target, config,
                  interval_seconds, retries, push_token_hash)
             VALUES ($1, $2, $3, CAST($4 AS uptime_monitor_type), $5, $6, $7, $8, $9)
             RETURNING id",
        )
        .bind(company_id)
        .bind(monitor.asset_id)
        .bind(monitor.name)
        .bind(monitor.monitor_type)
        .bind(monitor.target)
        .bind(monitor.config)
        .bind(monitor.interval_seconds)
        .bind(monitor.retries)
        .bind(push_token_hash)
        .fetch_one(self.pool())
        .await
        .map_err(db_err)?;

        let id: Uuid = row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;
        Ok((id, push_token))
    }

    /// Update monitor (field opsional — NULL = biarkan). Tidak mengubah
    /// push token; rotasi = delete + create (semantik Uptime Kuma).
    pub async fn monitor_update(
        &self,
        company_id: Uuid,
        monitor_id: Uuid,
        patch: MonitorPatch<'_>,
    ) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE uptime_monitors
             SET name = COALESCE($3, name),
                 target = COALESCE($4, target),
                 config = COALESCE($5, config),
                 interval_seconds = COALESCE($6, interval_seconds),
                 retries = COALESCE($7, retries),
                 is_active = COALESCE($8, is_active),
                 updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(monitor_id)
        .bind(patch.name)
        .bind(patch.target)
        .bind(patch.config)
        .bind(patch.interval_seconds)
        .bind(patch.retries)
        .bind(patch.is_active)
        .execute(self.pool())
        .await
        .map_err(db_err)?;

        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    /// Soft delete (retensi heartbeat tetap — append-only audit).
    pub async fn monitor_delete(&self, company_id: Uuid, monitor_id: Uuid) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE uptime_monitors
             SET deleted_at = now(), is_active = false, updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(monitor_id)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    // ------------------------------------------------------------------
    // Heartbeats (agent push / poller)
    // ------------------------------------------------------------------

    /// Simpan heartbeat; flag `important` dihitung dari transisi status
    /// terakhir monitor (UP↔DOWN). Monitor wajib milik tenant.
    pub async fn heartbeat_insert(
        &self,
        company_id: Uuid,
        monitor_id: Uuid,
        status: &str,
        ping_ms: Option<i32>,
        msg: Option<&str>,
        recorded_at: Option<DateTime<Utc>>,
    ) -> Result<Uuid, DomainError> {
        if !matches!(status, "UP" | "DOWN" | "PENDING" | "MAINTENANCE") {
            return Err(DomainError::validation("status heartbeat tidak valid"));
        }
        if !ref_in_company(self.pool(), company_id, super::RefTable::UptimeMonitor, monitor_id).await? {
            return Err(DomainError::validation("monitor tidak milik company aktif"));
        }

        // Status terakhir untuk deteksi transisi (pola `important` partial idx).
        let previous = sqlx::query(
            "SELECT status::text AS status
             FROM uptime_heartbeats
             WHERE monitor_id = $1
             ORDER BY recorded_at DESC
             LIMIT 1",
        )
        .bind(monitor_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?
        .and_then(|row| row.try_get::<String, _>("status").ok());

        let important = previous.is_some_and(|prev| prev != status);
        let row = sqlx::query(
            "INSERT INTO uptime_heartbeats
                 (company_id, monitor_id, recorded_at, status, ping_ms, important, msg)
             VALUES ($1, $2, COALESCE($3, now()), CAST($4 AS heartbeat_status), $5, $6, $7)
             RETURNING id",
        )
        .bind(company_id)
        .bind(monitor_id)
        .bind(recorded_at)
        .bind(status)
        .bind(ping_ms)
        .bind(important)
        .bind(msg)
        .fetch_one(self.pool())
        .await
        .map_err(db_err)?;

        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    // ------------------------------------------------------------------
    // Status pages (tenant CRUD)
    // ------------------------------------------------------------------

    pub async fn status_pages_list(&self, company_id: Uuid) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT id, slug, title, description, is_published, created_at, updated_at
             FROM status_pages
             WHERE company_id = $1 AND deleted_at IS NULL
             ORDER BY slug",
        )
        .bind(company_id)
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        rows.iter().map(status_page_row).collect()
    }

    pub async fn status_page_create(
        &self,
        company_id: Uuid,
        slug: &str,
        title: &str,
        description: Option<&str>,
        is_published: bool,
    ) -> Result<Uuid, DomainError> {
        let row = sqlx::query(
            "INSERT INTO status_pages (company_id, slug, title, description, is_published)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id",
        )
        .bind(company_id)
        .bind(slug)
        .bind(title)
        .bind(description)
        .bind(is_published)
        .fetch_one(self.pool())
        .await
        .map_err(db_err)?;
        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    pub async fn status_page_get(&self, company_id: Uuid, page_id: Uuid) -> Result<Value, DomainError> {
        let row = sqlx::query(
            "SELECT id, slug, title, description, is_published, created_at, updated_at
             FROM status_pages
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(page_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?
        .ok_or(DomainError::NotFound)?;
        status_page_row(&row)
    }

    pub async fn status_page_update(
        &self,
        company_id: Uuid,
        page_id: Uuid,
        title: Option<&str>,
        description: Option<&str>,
        is_published: Option<bool>,
    ) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE status_pages
             SET title = COALESCE($3, title),
                 description = COALESCE($4, description),
                 is_published = COALESCE($5, is_published),
                 updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(page_id)
        .bind(title)
        .bind(description)
        .bind(is_published)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    pub async fn status_page_delete(&self, company_id: Uuid, page_id: Uuid) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE status_pages SET deleted_at = now(), updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(page_id)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    /// Ganti daftar monitor halaman (join m2m) — transaksi delete+insert;
    /// seluruh monitor wajib milik tenant (anti IDOR).
    pub async fn status_page_monitors_set(
        &self,
        company_id: Uuid,
        page_id: Uuid,
        monitors: &[(Uuid, i32)],
    ) -> Result<(), DomainError> {
        for (monitor_id, _) in monitors {
            if !ref_in_company(self.pool(), company_id, super::RefTable::UptimeMonitor, *monitor_id)
                .await?
            {
                return Err(DomainError::validation(
                    "monitor pada status page tidak milik company aktif",
                ));
            }
        }
        let mut tx = self.pool().begin().await.map_err(db_err)?;
        sqlx::query("DELETE FROM status_page_monitors WHERE status_page_id = $1")
            .bind(page_id)
            .execute(&mut *tx)
            .await
            .map_err(db_err)?;
        for (monitor_id, sort_order) in monitors {
            sqlx::query(
                "INSERT INTO status_page_monitors (company_id, status_page_id, monitor_id, sort_order)
                 VALUES ($1, $2, $3, $4)",
            )
            .bind(company_id)
            .bind(page_id)
            .bind(monitor_id)
            .bind(*sort_order)
            .execute(&mut *tx)
            .await
            .map_err(db_err)?;
        }
        tx.commit().await.map_err(db_err)?;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Status page publik (tanpa auth)
    // ------------------------------------------------------------------

    /// Halaman ter-publish berdasar slug (public; bila slug bentrok antar
    /// tenant → entri ter-early diambil; rekomendasi: slug unik global).
    pub async fn status_page_public(&self, slug: &str) -> Result<Option<Value>, DomainError> {
        let page = sqlx::query(
            "SELECT id, company_id, slug, title, description, is_published, created_at, updated_at
             FROM status_pages
             WHERE slug = $1 AND is_published AND deleted_at IS NULL
             ORDER BY created_at
             LIMIT 1",
        )
        .bind(slug)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?;

        let Some(page) = page else { return Ok(None) };
        let page_id: Uuid = page.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;

        // Monitor ter-attach + status terakhir + uptime % 24 jam.
        let monitors = sqlx::query(
            "SELECT m.id, m.name, m.type::text AS type,
                    (SELECT h.status::text FROM uptime_heartbeats h
                      WHERE h.monitor_id = m.id ORDER BY h.recorded_at DESC LIMIT 1) AS last_status,
                    (SELECT h.ping_ms FROM uptime_heartbeats h
                      WHERE h.monitor_id = m.id ORDER BY h.recorded_at DESC LIMIT 1) AS last_ping_ms,
                    (SELECT h.msg FROM uptime_heartbeats h
                      WHERE h.monitor_id = m.id ORDER BY h.recorded_at DESC LIMIT 1) AS last_msg,
                    COALESCE(
                      (SELECT count(*) FILTER (WHERE h.status = 'UP')::float
                         / NULLIF(count(*), 0) * 100
                       FROM uptime_heartbeats h
                       WHERE h.monitor_id = m.id
                         AND h.recorded_at > now() - INTERVAL '24 hours'),
                      100.0) AS uptime_pct_24h
             FROM status_page_monitors spm
             JOIN uptime_monitors m ON m.id = spm.monitor_id AND m.deleted_at IS NULL
             WHERE spm.status_page_id = $1
             ORDER BY spm.sort_order, m.name",
        )
        .bind(page_id)
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        let monitors: Vec<Value> = monitors
            .iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "name": row.try_get::<String, _>("name")?,
                    "type": row.try_get::<String, _>("type")?,
                    "status": row.try_get::<Option<String>, _>("last_status")?,
                    "ping_ms": row.try_get::<Option<i32>, _>("last_ping_ms")?,
                    "message": row.try_get::<Option<String>, _>("last_msg")?,
                    "uptime_pct_24h": row.try_get::<Option<f64>, _>("uptime_pct_24h")?,
                }))
            })
            .collect::<Result<_, sqlx::Error>>()
            .map_err(|e| DomainError::Unavailable(format!("{e}")))?;

        let page = status_page_row(&page)?;
        let mut page = page;
        page["monitors"] = Value::Array(monitors);
        Ok(Some(page))
    }
}

fn monitor_from_row(row: &sqlx::postgres::PgRow) -> Result<Value, DomainError> {
    // push_token_hash TIDAK pernah diekspos (hash, bukan plaintext).
    Ok(json!({
        "id": row.try_get::<Uuid, _>("id")?,
        "name": row.try_get::<String, _>("name")?,
        "type": row.try_get::<String, _>("type")?,
        "target": row.try_get::<String, _>("target")?,
        "config": row.try_get::<Option<Value>, _>("config")?,
        "interval_seconds": row.try_get::<i32, _>("interval_seconds")?,
        "retries": row.try_get::<i32, _>("retries")?,
        "is_active": row.try_get::<bool, _>("is_active")?,
        "created_at": row.try_get::<DateTime<Utc>, _>("created_at")?,
        "updated_at": row.try_get::<DateTime<Utc>, _>("updated_at")?,
    }))
}

fn status_page_row(row: &sqlx::postgres::PgRow) -> Result<Value, DomainError> {
    Ok(json!({
        "id": row.try_get::<Uuid, _>("id")?,
        "slug": row.try_get::<String, _>("slug")?,
        "title": row.try_get::<String, _>("title")?,
        "description": row.try_get::<Option<String>, _>("description")?,
        "is_published": row.try_get::<bool, _>("is_published")?,
        "created_at": row.try_get::<Option<DateTime<Utc>>, _>("created_at")?,
        "updated_at": row.try_get::<Option<DateTime<Utc>>, _>("updated_at")?,
    }))
}
