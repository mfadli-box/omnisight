//! Repository Telemetry Ingest (Wave 2 — high-throughput):
//!
//! - `hardware_inventory_snapshots`: inventaris hardware/software agent
//!   (+ payload S.M.A.R.T. `kind=smart` — satu-satunya sink JSONB generik
//!   untuk laporan disk health sesuai skema P3).
//! - `system_metric_snapshots` / `container_metric_snapshots` /
//!   `interface_metric_snapshots`: batch insert multi-baris ter-chunk
//!   (QueryBuilder `.push_bind()` — anti SQL injection, pola UNNEST-like).
//! - `alert_rules` / `alert_histories`: evaluasi histeresis app-level.
//!
//! Tenant isolation: semua batch tervalidasi kepemilikan `company_id`
//! SEBELUM insert (host/asset/docker_host/interface milik tenant aktif).

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::application::alerts::{AlertRule, MetricSample};
use crate::domain::error::DomainError;

use super::{Store, db_err, ref_in_company};

/// Satu sampel metrik host.
#[derive(Debug, Clone)]
pub struct SystemMetricRow {
    pub recorded_at: Option<DateTime<Utc>>,
    pub cpu_usage_pct: Option<f64>,
    pub load1: Option<f64>,
    pub load5: Option<f64>,
    pub load15: Option<f64>,
    pub mem_used_bytes: Option<i64>,
    pub mem_total_bytes: Option<i64>,
    pub disk_used_bytes: Option<i64>,
    pub disk_total_bytes: Option<i64>,
    pub net_in_bps: Option<i64>,
    pub net_out_bps: Option<i64>,
    pub uptime_seconds: Option<i64>,
}

/// Satu sampel metrik container.
#[derive(Debug, Clone)]
pub struct ContainerMetricRow {
    pub host_id: Uuid,
    pub container_ref: String,
    pub container_name: Option<String>,
    pub recorded_at: Option<DateTime<Utc>>,
    pub cpu_usage_pct: Option<f64>,
    pub mem_used_bytes: Option<i64>,
    pub mem_limit_bytes: Option<i64>,
    pub net_in_bps: Option<i64>,
    pub net_out_bps: Option<i64>,
    pub block_read_bps: Option<i64>,
    pub block_write_bps: Option<i64>,
    pub pids: Option<i32>,
    pub is_running: bool,
}

/// Satu sampel metrik interface SNMP.
#[derive(Debug, Clone)]
pub struct InterfaceMetricRow {
    pub interface_id: Uuid,
    pub collected_at: Option<DateTime<Utc>>,
    pub in_octets: i64,
    pub out_octets: i64,
    pub in_unicast_packets: Option<i64>,
    pub out_unicast_packets: Option<i64>,
    pub in_errors: Option<i64>,
    pub out_errors: Option<i64>,
    pub in_discards: Option<i64>,
    pub out_discards: Option<i64>,
    pub in_rate_bps: Option<i64>,
    pub out_rate_bps: Option<i64>,
}

/// Batas batch per ingest (anti payload bomb — di-cache handler juga).
pub const MAX_CONTAINERS: usize = 200;
pub const MAX_INTERFACES: usize = 500;
pub const MAX_SMART_DEVICES: usize = 64;

/// Paket data inventaris hardware/software dari satu agent.
pub struct InventoryData<'a> {
    pub cpu_model: Option<&'a str>,
    pub cpu_cores: Option<i32>,
    pub memory_total_bytes: Option<i64>,
    pub storage_total_bytes: Option<i64>,
    pub os_name: Option<&'a str>,
    pub os_version: Option<&'a str>,
    pub hostname: Option<&'a str>,
    pub payload: Value,
}

impl Store {
    // ------------------------------------------------------------------
    // Inventory (hardware/software discovery)
    // ------------------------------------------------------------------

    /// Simpan snapshot inventaris + perbarui identity host dinamis.
    pub async fn inventory_ingest(
        &self,
        company_id: Uuid,
        agent_id: Uuid,
        data: InventoryData<'_>,
    ) -> Result<Uuid, DomainError> {
        if !ref_in_company(self.pool(), company_id, super::RefTable::Asset, agent_id).await? {
            return Err(DomainError::validation("agent tidak ditemukan pada company aktif"));
        }

        let mut tx = self.pool().begin().await.map_err(db_err)?;
        let row = sqlx::query(
            "INSERT INTO hardware_inventory_snapshots
                 (company_id, asset_id, cpu_model, cpu_cores, memory_total_bytes,
                  storage_total_bytes, os_name, os_version, payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id",
        )
        .bind(company_id)
        .bind(agent_id)
        .bind(data.cpu_model)
        .bind(data.cpu_cores)
        .bind(data.memory_total_bytes)
        .bind(data.storage_total_bytes)
        .bind(data.os_name)
        .bind(data.os_version)
        .bind(data.payload)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_err)?;

        sqlx::query(
            "UPDATE assets
             SET last_seen_at = now(),
                 hostname = COALESCE($2, hostname),
                 updated_at = now()
             WHERE id = $1 AND company_id = $3",
        )
        .bind(agent_id)
        .bind(data.hostname)
        .bind(company_id)
        .execute(&mut *tx)
        .await
        .map_err(db_err)?;

        tx.commit().await.map_err(db_err)?;
        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    /// Laporan S.M.A.R.T. (disk health) — dipersist sebagai snapshot
    /// inventaris `kind=smart` (payload JSONB generik skema P3).
    pub async fn smart_ingest(
        &self,
        company_id: Uuid,
        agent_id: Uuid,
        devices: Value,
        collected_at: Option<DateTime<Utc>>,
    ) -> Result<Uuid, DomainError> {
        if !ref_in_company(self.pool(), company_id, super::RefTable::Asset, agent_id).await? {
            return Err(DomainError::validation("agent tidak ditemukan pada company aktif"));
        }
        let payload = json!({ "kind": "smart", "devices": devices, "collected_at": collected_at });
        let row = sqlx::query(
            "INSERT INTO hardware_inventory_snapshots (company_id, asset_id, payload, collected_at)
             VALUES ($1, $2, $3, COALESCE($4, now()))
             RETURNING id",
        )
        .bind(company_id)
        .bind(agent_id)
        .bind(payload)
        .bind(collected_at)
        .fetch_one(self.pool())
        .await
        .map_err(db_err)?;
        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    // ------------------------------------------------------------------
    // Metric snapshots (batch)
    // ------------------------------------------------------------------

    /// Batch insert metrik host (satu agent = satu host). Mengembalikan
    /// jumlah baris tersimpan.
    pub async fn system_metrics_insert(
        &self,
        company_id: Uuid,
        host_id: Uuid,
        agent_id: Uuid,
        rows: &[SystemMetricRow],
    ) -> Result<u64, DomainError> {
        if rows.is_empty() {
            return Ok(0);
        }
        if !ref_in_company(self.pool(), company_id, super::RefTable::Asset, host_id).await? {
            return Err(DomainError::validation("host_id tidak ditemukan pada company aktif"));
        }

        let mut result_total: u64 = 0;
        for chunk in rows.chunks(250) {
            let mut qb = sqlx::query_builder::QueryBuilder::new(
                "INSERT INTO system_metric_snapshots
                     (company_id, host_id, recorded_at, tier, cpu_usage_pct, load1, load5,
                      load15, mem_used_bytes, mem_total_bytes, disk_used_bytes,
                      disk_total_bytes, net_in_bps, net_out_bps, uptime_seconds, agent_id) VALUES ",
            );
            qb.push_values(chunk.iter(), |mut b, row| {
                b.push_bind(company_id)
                    .push_bind(host_id)
                    .push_bind(row.recorded_at.unwrap_or_else(Utc::now))
                    .push("CAST('TIER_1M' AS metric_tier)")
                    .push_bind(row.cpu_usage_pct)
                    .push_bind(row.load1)
                    .push_bind(row.load5)
                    .push_bind(row.load15)
                    .push_bind(row.mem_used_bytes)
                    .push_bind(row.mem_total_bytes)
                    .push_bind(row.disk_used_bytes)
                    .push_bind(row.disk_total_bytes)
                    .push_bind(row.net_in_bps)
                    .push_bind(row.net_out_bps)
                    .push_bind(row.uptime_seconds)
                    .push_bind(agent_id);
            });
            let result = qb.build().execute(self.pool()).await.map_err(db_err)?;
            result_total += result.rows_affected();
        }
        Ok(result_total)
    }

    /// Batch insert metrik container — host pemilik divalidasi per tenant.
    pub async fn container_metrics_insert(
        &self,
        company_id: Uuid,
        rows: &[ContainerMetricRow],
    ) -> Result<u64, DomainError> {
        if rows.is_empty() {
            return Ok(0);
        }
        let hosts: Vec<Uuid> = rows.iter().map(|r| r.host_id).collect::<Vec<_>>();
        let valid_hosts = sqlx::query(
            "SELECT id FROM docker_hosts
             WHERE company_id = $1 AND id = ANY($2) AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(&hosts)
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;
        let valid: Vec<Uuid> = valid_hosts
            .iter()
            .filter_map(|row| row.try_get::<Uuid, _>("id").ok())
            .collect();
        if valid.len()
            != hosts.iter().collect::<std::collections::HashSet<_>>().len()
        {
            return Err(DomainError::validation(
                "host_id container tidak ditemukan pada company aktif",
            ));
        }

        let mut result_total: u64 = 0;
        for chunk in rows.chunks(250) {
            let mut qb = sqlx::query_builder::QueryBuilder::new(
                "INSERT INTO container_metric_snapshots
                     (company_id, host_id, container_ref, container_name, recorded_at,
                      cpu_usage_pct, mem_used_bytes, mem_limit_bytes, net_in_bps,
                      net_out_bps, block_read_bps, block_write_bps, pids, is_running) VALUES ",
            );
            qb.push_values(chunk.iter(), |mut b, row| {
                b.push_bind(company_id)
                    .push_bind(row.host_id)
                    .push_bind(row.container_ref.as_str())
                    .push_bind(row.container_name.as_deref())
                    .push_bind(row.recorded_at.unwrap_or_else(Utc::now))
                    .push_bind(row.cpu_usage_pct)
                    .push_bind(row.mem_used_bytes)
                    .push_bind(row.mem_limit_bytes)
                    .push_bind(row.net_in_bps)
                    .push_bind(row.net_out_bps)
                    .push_bind(row.block_read_bps)
                    .push_bind(row.block_write_bps)
                    .push_bind(row.pids)
                    .push_bind(row.is_running);
            });
            let result = qb.build().execute(self.pool()).await.map_err(db_err)?;
            result_total += result.rows_affected();
        }
        Ok(result_total)
    }

    /// Batch insert metrik interface SNMP — interface divalidasi per tenant.
    pub async fn interface_metrics_insert(
        &self,
        company_id: Uuid,
        rows: &[InterfaceMetricRow],
    ) -> Result<u64, DomainError> {
        if rows.is_empty() {
            return Ok(0);
        }
        let interfaces: Vec<Uuid> = rows.iter().map(|r| r.interface_id).collect();
        let valid = sqlx::query(
            "SELECT id FROM device_interfaces WHERE company_id = $1 AND id = ANY($2)",
        )
        .bind(company_id)
        .bind(&interfaces)
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;
        if valid.len() != interfaces.iter().collect::<std::collections::HashSet<_>>().len() {
            return Err(DomainError::validation(
                "interface_id tidak ditemukan pada company aktif",
            ));
        }

        // Kolom `inOctets`/`outOctets` camelCase mewarisi skema Prisma P2 —
        // selalu dikutip eksplisit.
        let mut result_total: u64 = 0;
        for chunk in rows.chunks(250) {
            let mut qb = sqlx::query_builder::QueryBuilder::new(
                "INSERT INTO interface_metric_snapshots
                     (company_id, interface_id, collected_at, \"inOctets\", \"outOctets\",
                      in_unicast_packets, out_unicast_packets, in_errors, out_errors,
                      in_discards, out_discards, in_rate_bps, out_rate_bps) VALUES ",
            );
            qb.push_values(chunk.iter(), |mut b, row| {
                b.push_bind(company_id)
                    .push_bind(row.interface_id)
                    .push_bind(row.collected_at.unwrap_or_else(Utc::now))
                    .push_bind(row.in_octets)
                    .push_bind(row.out_octets)
                    .push_bind(row.in_unicast_packets)
                    .push_bind(row.out_unicast_packets)
                    .push_bind(row.in_errors)
                    .push_bind(row.out_errors)
                    .push_bind(row.in_discards)
                    .push_bind(row.out_discards)
                    .push_bind(row.in_rate_bps)
                    .push_bind(row.out_rate_bps);
            });
            let result = qb.build().execute(self.pool()).await.map_err(db_err)?;
            result_total += result.rows_affected();
        }
        Ok(result_total)
    }

    // ------------------------------------------------------------------
    // Alert rules & history (evaluasi histeresis)
    // ------------------------------------------------------------------

    /// Rule aktif pada company untuk daftar metrik yang hadir di batch.
    pub async fn alert_rules_active(
        &self,
        company_id: Uuid,
        metrics: &[String],
    ) -> Result<Vec<AlertRule>, DomainError> {
        if metrics.is_empty() {
            return Ok(Vec::new());
        }
        let rows = sqlx::query(
            "SELECT id, name, metric, operator::text AS operator, threshold::float8 AS threshold,
                    duration_seconds, severity::text AS severity, target_filter
             FROM alert_rules
             WHERE company_id = $1 AND is_active AND deleted_at IS NULL
               AND metric = ANY($2)",
        )
        .bind(company_id)
        .bind(metrics)
        .fetch_all(self.pool())
        .await
        .map_err(db_err)?;

        rows.iter()
            .map(|row| {
                Ok(AlertRule {
                    id: row.try_get("id")?,
                    name: row.try_get("name")?,
                    metric: row.try_get("metric")?,
                    operator: row.try_get("operator")?,
                    threshold: row.try_get::<Option<f64>, _>("threshold")?.unwrap_or_default(),
                    duration_seconds: row.try_get("duration_seconds")?,
                    severity: row.try_get("severity")?,
                    target_filter: row.try_get("target_filter")?,
                })
            })
            .collect()
    }

    /// State alert terakhir untuk (rule, target) — dedup FIRING/RESOLVED.
    pub async fn alert_last_state(
        &self,
        rule_id: Uuid,
        target_ref: &str,
    ) -> Result<Option<String>, DomainError> {
        let row = sqlx::query(
            "SELECT state::text AS state
             FROM alert_histories
             WHERE alert_rule_id = $1 AND (target_ref = $2 OR (target_ref IS NULL AND $2 = ''))
             ORDER BY fired_at DESC
             LIMIT 1",
        )
        .bind(rule_id)
        .bind(target_ref)
        .fetch_optional(self.pool())
        .await
        .map_err(db_err)?;
        Ok(row.and_then(|row| row.try_get("state").ok()))
    }

    /// Tulis event alert history (FIRING / RESOLVED).
    pub async fn alert_history_insert(&self, data: AlertHistoryNew<'_>) -> Result<Uuid, DomainError> {
        if !matches!(data.state, "FIRING" | "RESOLVED") {
            return Err(DomainError::validation("state alert tidak valid"));
        }
        if !matches!(data.severity, "INFO" | "WARNING" | "CRITICAL") {
            return Err(DomainError::validation("severity alert tidak valid"));
        }
        let row = sqlx::query(
            "INSERT INTO alert_histories
                 (company_id, alert_rule_id, state, severity, target_ref, value, message)
             VALUES ($1, $2, CAST($3 AS alert_state), CAST($4 AS alert_severity),
                     $5, $6, $7)
             RETURNING id",
        )
        .bind(data.company_id)
        .bind(data.rule_id)
        .bind(data.state)
        .bind(data.severity)
        .bind(data.target_ref)
        .bind(data.value)
        .bind(data.message)
        .fetch_one(self.pool())
        .await
        .map_err(db_err)?;
        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }
}

/// Paket tulis event alert history.
pub struct AlertHistoryNew<'a> {
    pub company_id: Uuid,
    pub rule_id: Uuid,
    pub state: &'a str,
    pub severity: &'a str,
    pub target_ref: &'a str,
    pub value: Option<f64>,
    pub message: String,
}

/// Kumpulkan sampel metrik kandidat evaluasi dari batch yang baru masuk
/// (free function — pure transform tanpa I/O).
pub fn collect_samples(
    host_id: Uuid,
    system: &[SystemMetricRow],
    containers: &[ContainerMetricRow],
) -> Vec<MetricSample> {
    let mut samples = Vec::new();
    if let Some(first) = system.first() {
        let recorded = first.recorded_at.unwrap_or_else(Utc::now);
        if let Some(cpu) = first.cpu_usage_pct {
            samples.push(metric_sample(host_id, "system.cpu_pct", "system", cpu, recorded));
        }
        if let (Some(used), Some(total)) = (first.mem_used_bytes, first.mem_total_bytes)
            && total > 0
        {
            let pct = (used as f64 / total as f64) * 100.0;
            samples.push(metric_sample(host_id, "system.mem_pct", "system", pct, recorded));
        }
        if let (Some(used), Some(total)) = (first.disk_used_bytes, first.disk_total_bytes)
            && total > 0
        {
            let pct = (used as f64 / total as f64) * 100.0;
            samples.push(metric_sample(host_id, "system.disk_pct", "system", pct, recorded));
        }
    }
    for row in containers {
        let recorded = row.recorded_at.unwrap_or_else(Utc::now);
        if let Some(cpu) = row.cpu_usage_pct {
            samples.push(MetricSample {
                metric: "container.cpu_pct".into(),
                target_ref: row.container_ref.clone(),
                kind: "container",
                host_id: Some(row.host_id),
                container_ref: Some(row.container_ref.clone()),
                monitor_id: None,
                value: cpu,
                recorded_at: recorded,
            });
        }
        if let (Some(used), Some(limit)) = (row.mem_used_bytes, row.mem_limit_bytes)
            && limit > 0
        {
            let pct = (used as f64 / limit as f64) * 100.0;
            samples.push(MetricSample {
                metric: "container.mem_pct".into(),
                target_ref: row.container_ref.clone(),
                kind: "container",
                host_id: Some(row.host_id),
                container_ref: Some(row.container_ref.clone()),
                monitor_id: None,
                value: pct,
                recorded_at: recorded,
            });
        }
    }
    samples
}

fn metric_sample(host_id: Uuid, metric: &str, kind: &'static str, value: f64, at: DateTime<Utc>) -> MetricSample {
    MetricSample {
        metric: metric.into(),
        target_ref: host_id.to_string(),
        kind,
        host_id: Some(host_id),
        container_ref: None,
        monitor_id: None,
        value,
        recorded_at: at,
    }
}
