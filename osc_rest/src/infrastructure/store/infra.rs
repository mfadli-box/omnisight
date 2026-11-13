//! Repository Docker Stack & Nginx Control Plane (Wave 2 — pola
//! Dockge/Arcane + Nginx UI): CRUD terikat tenant + pointer backup RustFS.
//!
//! - `compose_stacks`: `env_encrypted` Envelope AES-256-GCM (app-level),
//!   `backup_object_key` = snapshot compose sebelum overwrite/dispatch.
//! - `nginx_virtual_hosts`: status pipeline DRAFT→TESTING→APPLIED/FAILED;
//!   dispatch `test & reload` dieksekusi agent `infra_control` (poll outbox
//!   `activity_logs`), bukan shell langsung dari API (zero command injection).
//!
//! Tenant isolation: FK `docker_host_id`/`nginx_node_id` wajib milik
//! `company_id` aktif (divalidasi sebelum insert — anti IDOR).

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;

use super::{Store, db_err, ref_in_company};

/// Perintah dispatch compose yang sah (dieksekusi agent, bukan API).
pub const STACK_COMMANDS: &[&str] = &["up", "down", "pull", "restart"];

/// Status vhost pipeline (enum Prisma `nginx_vhost_status`).
pub const VHOST_STATUSES: &[&str] =
    &["DRAFT", "TESTING", "APPLIED", "FAILED", "ROLLED_BACK"];

/// Paket update compose stack (None = biarkan; env: Some(None) = hapus).
pub struct StackPatch<'a> {
    pub name: Option<&'a str>,
    pub working_dir: Option<&'a str>,
    pub compose_content: Option<&'a str>,
    /// None = biarkan; Some(None) = hapus; Some(Some(bytes)) = ganti.
    pub env_encrypted: Option<Option<Vec<u8>>>,
    pub is_active: Option<bool>,
}

/// Paket pembuatan compose stack.
pub struct StackNew<'a> {
    pub company_id: Uuid,
    pub docker_host_id: Uuid,
    pub name: &'a str,
    pub working_dir: &'a str,
    pub compose_content: &'a str,
    pub env_encrypted: Option<Vec<u8>>,
}

/// Paket pembuatan vhost nginx.
pub struct VhostNew<'a> {
    pub company_id: Uuid,
    pub nginx_node_id: Uuid,
    pub server_name: &'a str,
    pub listen_port: i32,
    pub config_content: &'a str,
    pub ssl_cert_path: Option<&'a str>,
    pub ssl_key_path: Option<&'a str>,
}

/// Paket update vhost nginx (None = biarkan).
pub struct VhostPatch<'a> {
    pub server_name: Option<&'a str>,
    pub listen_port: Option<i32>,
    pub config_content: Option<&'a str>,
    pub ssl_cert_path: Option<&'a str>,
    pub ssl_key_path: Option<&'a str>,
}

impl Store {
    // ------------------------------------------------------------------
    // Docker hosts & stacks
    // ------------------------------------------------------------------

    pub async fn docker_hosts_list(&self, company_id: Uuid) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT id, name, endpoint, docker_version, status::text AS status,
                    container_count, last_seen_at, is_active
             FROM docker_hosts
             WHERE company_id = $1 AND deleted_at IS NULL
             ORDER BY name",
        )
        .bind(company_id)
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "name": row.try_get::<String, _>("name")?,
                    "endpoint": row.try_get::<String, _>("endpoint")?,
                    "docker_version": row.try_get::<Option<String>, _>("docker_version")?,
                    "status": row.try_get::<String, _>("status")?,
                    "container_count": row.try_get::<Option<i32>, _>("container_count")?,
                    "last_seen_at": row.try_get::<Option<DateTime<Utc>>, _>("last_seen_at")?,
                    "is_active": row.try_get::<bool, _>("is_active")?,
                }))
            })
            .collect()
    }

    pub async fn stacks_list(
        &self,
        company_id: Uuid,
        docker_host_id: Option<Uuid>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT s.id, s.docker_host_id, h.name AS host_name, s.name, s.working_dir,
                    s.drift_status::text AS drift_status, s.backup_object_key,
                    s.last_deployed_at, s.last_synced_at, s.last_error, s.is_active,
                    s.created_at, s.updated_at
             FROM compose_stacks s
             JOIN docker_hosts h ON h.id = s.docker_host_id
             WHERE s.company_id = $1 AND s.deleted_at IS NULL
               AND ($2::uuid IS NULL OR s.docker_host_id = $2)
             ORDER BY h.name, s.name
             LIMIT $3 OFFSET $4",
        )
        .bind(company_id)
        .bind(docker_host_id)
        .bind(limit.clamp(1, 500))
        .bind(offset.max(0))
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        rows.iter().map(stack_from_row).collect()
    }

    pub async fn stack_get(&self, company_id: Uuid, stack_id: Uuid) -> Result<Value, DomainError> {
        let row = sqlx::query(
            "SELECT s.id, s.docker_host_id, h.name AS host_name, s.name, s.working_dir,
                    s.compose_content, s.drift_status::text AS drift_status,
                    s.backup_object_key, s.last_deployed_at, s.last_synced_at,
                    s.last_error, s.is_active, s.created_at, s.updated_at
             FROM compose_stacks s
             JOIN docker_hosts h ON h.id = s.docker_host_id
             WHERE s.id = $2 AND s.company_id = $1 AND s.deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(stack_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?
        .ok_or(DomainError::NotFound)?;

        let mut value = stack_from_row(&row)?;
        value["compose_content"] = json!(row.try_get::<String, _>("compose_content")
            .map_err(|e| DomainError::Unavailable(format!("{e}")))?);
        Ok(value)
    }

    /// Stack baru. `env_encrypted` sudah ciphertext Envelope dari handler.
    pub async fn stack_create(&self, stack: StackNew<'_>) -> Result<Uuid, DomainError> {
        if !ref_in_company(self.pool(), stack.company_id, super::RefTable::DockerHost, stack.docker_host_id)
            .await?
        {
            return Err(DomainError::validation("docker_host tidak milik company aktif"));
        }
        let row = sqlx::query(
            "INSERT INTO compose_stacks
                 (company_id, docker_host_id, name, working_dir, compose_content, env_encrypted)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id",
        )
        .bind(stack.company_id)
        .bind(stack.docker_host_id)
        .bind(stack.name)
        .bind(stack.working_dir)
        .bind(stack.compose_content)
        .bind(stack.env_encrypted)
        .fetch_one(self.pool())
        .await
        .map_err(db_err)?;
        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    pub async fn stack_update(&self, company_id: Uuid, stack_id: Uuid, patch: StackPatch<'_>) -> Result<(), DomainError> {
        // env: None = biarkan; Some(None) = hapus; Some(Some(bytes)) = ganti.
        let (env_set, env_value) = match patch.env_encrypted {
            None => (false, None),
            Some(inner) => (true, inner),
        };
        let result = sqlx::query(
            "UPDATE compose_stacks
             SET name = COALESCE($3, name),
                 working_dir = COALESCE($4, working_dir),
                 compose_content = COALESCE($5, compose_content),
                 env_encrypted = CASE WHEN $6 THEN $7 ELSE env_encrypted END,
                 is_active = COALESCE($8, is_active),
                 updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(stack_id)
        .bind(patch.name)
        .bind(patch.working_dir)
        .bind(patch.compose_content)
        .bind(env_set)
        .bind(env_value)
        .bind(patch.is_active)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    pub async fn stack_delete(&self, company_id: Uuid, stack_id: Uuid) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE compose_stacks SET deleted_at = now(), is_active = false, updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(stack_id)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    /// Simpan pointer snapshot backup compose (RustFS object key).
    pub async fn stack_set_backup(
        &self,
        company_id: Uuid,
        stack_id: Uuid,
        object_key: &str,
    ) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE compose_stacks SET backup_object_key = $3, updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(stack_id)
        .bind(object_key)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    pub async fn stack_mark_deployed(&self, company_id: Uuid, stack_id: Uuid) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE compose_stacks SET last_deployed_at = now(), updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(stack_id)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    /// Snapshot compose (dipakai backup sebelum update/dispatch).
    pub async fn stack_compose_content(
        &self,
        company_id: Uuid,
        stack_id: Uuid,
    ) -> Result<String, DomainError> {
        let row = sqlx::query(
            "SELECT compose_content FROM compose_stacks
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(stack_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?
        .ok_or(DomainError::NotFound)?;
        row.try_get("compose_content").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    // ------------------------------------------------------------------
    // Nginx nodes & vhosts
    // ------------------------------------------------------------------

    pub async fn nginx_nodes_list(&self, company_id: Uuid) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT id, name, endpoint, config_dir, status::text AS status,
                    nginx_version, last_seen_at, is_active
             FROM nginx_nodes
             WHERE company_id = $1 AND deleted_at IS NULL
             ORDER BY name",
        )
        .bind(company_id)
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "name": row.try_get::<String, _>("name")?,
                    "endpoint": row.try_get::<String, _>("endpoint")?,
                    "config_dir": row.try_get::<Option<String>, _>("config_dir")?,
                    "status": row.try_get::<String, _>("status")?,
                    "nginx_version": row.try_get::<Option<String>, _>("nginx_version")?,
                    "last_seen_at": row.try_get::<Option<DateTime<Utc>>, _>("last_seen_at")?,
                    "is_active": row.try_get::<bool, _>("is_active")?,
                }))
            })
            .collect()
    }

    pub async fn vhosts_list(
        &self,
        company_id: Uuid,
        nginx_node_id: Option<Uuid>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let rows = sqlx::query(
            "SELECT v.id, v.nginx_node_id, n.name AS node_name, v.server_name, v.listen_port,
                    v.status::text AS status, v.ssl_cert_path, v.ssl_key_path,
                    v.backup_object_key, v.last_error, v.validated_at, v.applied_at,
                    v.created_at, v.updated_at
             FROM nginx_virtual_hosts v
             JOIN nginx_nodes n ON n.id = v.nginx_node_id
             WHERE v.company_id = $1 AND v.deleted_at IS NULL
               AND ($2::uuid IS NULL OR v.nginx_node_id = $2)
             ORDER BY n.name, v.server_name, v.listen_port
             LIMIT $3 OFFSET $4",
        )
        .bind(company_id)
        .bind(nginx_node_id)
        .bind(limit.clamp(1, 500))
        .bind(offset.max(0))
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        rows.iter().map(vhost_from_row).collect()
    }

    pub async fn vhost_get(&self, company_id: Uuid, vhost_id: Uuid) -> Result<Value, DomainError> {
        let row = sqlx::query(
            "SELECT v.id, v.nginx_node_id, n.name AS node_name, v.server_name, v.listen_port,
                    v.status::text AS status, v.config_content, v.ssl_cert_path,
                    v.ssl_key_path, v.backup_object_key, v.last_error, v.validated_at,
                    v.applied_at, v.created_at, v.updated_at
             FROM nginx_virtual_hosts v
             JOIN nginx_nodes n ON n.id = v.nginx_node_id
             WHERE v.id = $2 AND v.company_id = $1 AND v.deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(vhost_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?
        .ok_or(DomainError::NotFound)?;

        let mut value = vhost_from_row(&row)?;
        value["config_content"] = json!(row.try_get::<String, _>("config_content")
            .map_err(|e| DomainError::Unavailable(format!("{e}")))?);
        Ok(value)
    }

    pub async fn vhost_create(&self, vhost: VhostNew<'_>) -> Result<Uuid, DomainError> {
        if !(1..=65535).contains(&vhost.listen_port) {
            return Err(DomainError::validation("listen_port di luar rentang 1–65535"));
        }
        if !ref_in_company(self.pool(), vhost.company_id, super::RefTable::NginxNode, vhost.nginx_node_id)
            .await?
        {
            return Err(DomainError::validation("nginx_node tidak milik company aktif"));
        }
        let row = sqlx::query(
            "INSERT INTO nginx_virtual_hosts
                 (company_id, nginx_node_id, server_name, listen_port, config_content,
                  ssl_cert_path, ssl_key_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id",
        )
        .bind(vhost.company_id)
        .bind(vhost.nginx_node_id)
        .bind(vhost.server_name)
        .bind(vhost.listen_port)
        .bind(vhost.config_content)
        .bind(vhost.ssl_cert_path)
        .bind(vhost.ssl_key_path)
        .fetch_one(self.pool())
        .await
        .map_err(db_err)?;
        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    pub async fn vhost_update(&self, vhost_id: Uuid, company_id: Uuid, patch: VhostPatch<'_>) -> Result<(), DomainError> {
        if let Some(port) = patch.listen_port
            && !(1..=65535).contains(&port)
        {
            return Err(DomainError::validation("listen_port di luar rentang 1–65535"));
        }
        let result = sqlx::query(
            "UPDATE nginx_virtual_hosts
             SET server_name = COALESCE($3, server_name),
                 listen_port = COALESCE($4, listen_port),
                 config_content = COALESCE($5, config_content),
                 ssl_cert_path = COALESCE($6, ssl_cert_path),
                 ssl_key_path = COALESCE($7, ssl_key_path),
                 status = 'DRAFT',
                 updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(vhost_id)
        .bind(patch.server_name)
        .bind(patch.listen_port)
        .bind(patch.config_content)
        .bind(patch.ssl_cert_path)
        .bind(patch.ssl_key_path)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    pub async fn vhost_delete(&self, company_id: Uuid, vhost_id: Uuid) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE nginx_virtual_hosts SET deleted_at = now(), updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(vhost_id)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    pub async fn vhost_set_backup(
        &self,
        company_id: Uuid,
        vhost_id: Uuid,
        object_key: &str,
    ) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE nginx_virtual_hosts SET backup_object_key = $3, updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(vhost_id)
        .bind(object_key)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    /// Transisi status pipeline (`TESTING` saat dispatch, hasil final oleh
    /// agent ack — `APPLIED`/`FAILED` + `last_error`).
    pub async fn vhost_set_status(
        &self,
        company_id: Uuid,
        vhost_id: Uuid,
        status: &str,
        last_error: Option<&str>,
    ) -> Result<(), DomainError> {
        if !VHOST_STATUSES.contains(&status) {
            return Err(DomainError::validation("status vhost tidak valid"));
        }
        let validated_at = (status == "TESTING").then(Utc::now);
        let applied_at = matches!(status, "APPLIED" | "ROLLED_BACK").then(Utc::now);
        let result = sqlx::query(
            "UPDATE nginx_virtual_hosts
             SET status = CAST($3 AS nginx_vhost_status),
                 last_error = $4,
                 validated_at = COALESCE($5, validated_at),
                 applied_at = COALESCE($6, applied_at),
                 updated_at = now()
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(vhost_id)
        .bind(status)
        .bind(last_error)
        .bind(validated_at)
        .bind(applied_at)
        .execute(self.pool())
        .await
        .map_err(db_err)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }

    pub async fn vhost_config_content(
        &self,
        company_id: Uuid,
        vhost_id: Uuid,
    ) -> Result<String, DomainError> {
        let row = sqlx::query(
            "SELECT config_content FROM nginx_virtual_hosts
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(vhost_id)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?
        .ok_or(DomainError::NotFound)?;
        row.try_get("config_content").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }
}

fn stack_from_row(row: &sqlx::postgres::PgRow) -> Result<Value, DomainError> {
    // env_encrypted tidak pernah diekspos (ciphertext Envelope).
    Ok(json!({
        "id": row.try_get::<Uuid, _>("id")?,
        "docker_host_id": row.try_get::<Uuid, _>("docker_host_id")?,
        "host_name": row.try_get::<String, _>("host_name")?,
        "name": row.try_get::<String, _>("name")?,
        "working_dir": row.try_get::<String, _>("working_dir")?,
        "drift_status": row.try_get::<String, _>("drift_status")?,
        "backup_object_key": row.try_get::<Option<String>, _>("backup_object_key")?,
        "last_deployed_at": row.try_get::<Option<DateTime<Utc>>, _>("last_deployed_at")?,
        "last_synced_at": row.try_get::<Option<DateTime<Utc>>, _>("last_synced_at")?,
        "last_error": row.try_get::<Option<String>, _>("last_error")?,
        "is_active": row.try_get::<bool, _>("is_active")?,
        "created_at": row.try_get::<DateTime<Utc>, _>("created_at")?,
        "updated_at": row.try_get::<DateTime<Utc>, _>("updated_at")?,
    }))
}

fn vhost_from_row(row: &sqlx::postgres::PgRow) -> Result<Value, DomainError> {
    Ok(json!({
        "id": row.try_get::<Uuid, _>("id")?,
        "nginx_node_id": row.try_get::<Uuid, _>("nginx_node_id")?,
        "node_name": row.try_get::<String, _>("node_name")?,
        "server_name": row.try_get::<String, _>("server_name")?,
        "listen_port": row.try_get::<i32, _>("listen_port")?,
        "status": row.try_get::<String, _>("status")?,
        "ssl_cert_path": row.try_get::<Option<String>, _>("ssl_cert_path")?,
        "ssl_key_path": row.try_get::<Option<String>, _>("ssl_key_path")?,
        "backup_object_key": row.try_get::<Option<String>, _>("backup_object_key")?,
        "last_error": row.try_get::<Option<String>, _>("last_error")?,
        "validated_at": row.try_get::<Option<DateTime<Utc>>, _>("validated_at")?,
        "applied_at": row.try_get::<Option<DateTime<Utc>>, _>("applied_at")?,
        "created_at": row.try_get::<DateTime<Utc>, _>("created_at")?,
        "updated_at": row.try_get::<DateTime<Utc>, _>("updated_at")?,
    }))
}
