//! Repository SecOps (Wave 3 — pola Wazuh 5.x): FIM dual-event, log anomali
//! keamanan, matching paket terinstal → CVE (dedupe upsert), hasil SCA/CIS,
//! dan job retensi batch ter-throttle (bab 5.8).
//!
//! Tenant isolation: semua insert membawa `company_id` dari baris agent
//! (bukan body) dan `asset_id` divalidasi identik dengan agent pelapor
//! (anti-spoof: agent hanya boleh melaporkan dirinya sendiri).

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;

use super::{Store, db_err};

/// Batas batch per ingest (anti payload bomb — dikonfirmasi ulang handler).
pub const MAX_FIM_EVENTS: usize = 500;
pub const MAX_SECURITY_ALERTS: usize = 200;
pub const MAX_VULNERABILITIES: usize = 500;
pub const MAX_COMPLIANCE_RESULTS: usize = 500;

/// Ukuran chunk multi-row insert (pola UNNEST-like, QueryBuilder push_bind).
const CHUNK: usize = 250;

/// Jumlah iterasi maksimum per tabel pada job retensi (batas waktu request).
const RETENTION_MAX_BATCHES: i64 = 200;
/// Ukuran batch DELETE retensi per iterasi.
const RETENTION_BATCH_SIZE: i64 = 1000;

/// Event FIM (dual-event Wazuh: REALTIME inotify / SCHEDULED checksum).
#[derive(Debug, Clone)]
pub struct FimEventRow {
    pub asset_id: Uuid,
    pub path: String,
    pub event_type: String,
    pub detection_source: String,
    pub baseline_version: i32,
    pub old_checksum: Option<String>,
    pub new_checksum: Option<String>,
    pub old_attrs: Option<Value>,
    pub new_attrs: Option<Value>,
    pub size_bytes: Option<i64>,
    pub detected_at: Option<DateTime<Utc>>,
}

/// Log anomali keamanan (detector Sigma/Syscheck — terpisah dari event store).
#[derive(Debug, Clone)]
pub struct SecurityAlertRow {
    pub asset_id: Uuid,
    pub rule_name: String,
    pub category: Option<String>,
    pub severity: String,
    pub mitre_tactic: Option<String>,
    pub mitre_technique: Option<String>,
    pub source_ip: Option<String>,
    pub payload: Option<Value>,
    pub detected_at: Option<DateTime<Utc>>,
}

/// Paket terinstal yang cocok dengan CVE feed (upsert dedupe per asset+cve).
#[derive(Debug, Clone)]
pub struct VulnerabilityRow {
    pub asset_id: Uuid,
    pub cve_id: String,
    pub title: String,
    pub severity: String,
    pub cvss_score: Option<f64>,
    pub version_installed: Option<String>,
    pub version_fixed: Option<String>,
    pub source_feed: Option<String>,
    pub detected_at: Option<DateTime<Utc>>,
}

/// Hasil compliance check (CIS benchmark / SCA).
#[derive(Debug, Clone)]
pub struct ComplianceRow {
    pub asset_id: Uuid,
    pub benchmark: String,
    pub check_id: String,
    pub title: String,
    pub status: String,
    pub severity: String,
    pub evidence: Option<Value>,
    pub checked_at: Option<DateTime<Utc>>,
}

impl Store {
    // ------------------------------------------------------------------
    // FIM baseline events
    // ------------------------------------------------------------------

    pub async fn fim_events_insert(
        &self,
        company_id: Uuid,
        rows: &[FimEventRow],
    ) -> Result<u64, DomainError> {
        let mut inserted = 0u64;
        for chunk in rows.chunks(CHUNK) {
            let mut qb = sqlx::QueryBuilder::new(
                "INSERT INTO fim_baseline_events
                     (company_id, asset_id, path, event_type, detection_source,
                      baseline_version, old_checksum, new_checksum, old_attrs,
                      new_attrs, size_bytes, detected_at) VALUES ",
            );
            for (index, row) in chunk.iter().enumerate() {
                if index > 0 {
                    qb.push(", ");
                }
                qb.push("(");
                qb.push_bind(company_id);
                qb.push(", ");
                qb.push_bind(row.asset_id);
                qb.push(", ");
                qb.push_bind(row.path.as_str());
                qb.push(", CAST(");
                qb.push_bind(row.event_type.as_str());
                qb.push(" AS fim_event_type), CAST(");
                qb.push_bind(row.detection_source.as_str());
                qb.push(" AS fim_detection_source), ");
                qb.push_bind(row.baseline_version);
                qb.push(", ");
                qb.push_bind(row.old_checksum.clone());
                qb.push(", ");
                qb.push_bind(row.new_checksum.clone());
                qb.push(", ");
                qb.push_bind(row.old_attrs.clone());
                qb.push(", ");
                qb.push_bind(row.new_attrs.clone());
                qb.push(", ");
                qb.push_bind(row.size_bytes);
                qb.push(", COALESCE(");
                qb.push_bind(row.detected_at);
                qb.push(", now()))");
            }
            let result = qb.build().execute(self.pool()).await.map_err(db_err)?;
            inserted += result.rows_affected();
        }
        Ok(inserted)
    }

    // ------------------------------------------------------------------
    // Security alert events
    // ------------------------------------------------------------------

    pub async fn security_alerts_insert(
        &self,
        company_id: Uuid,
        rows: &[SecurityAlertRow],
    ) -> Result<u64, DomainError> {
        let mut inserted = 0u64;
        for chunk in rows.chunks(CHUNK) {
            let mut qb = sqlx::QueryBuilder::new(
                "INSERT INTO security_alert_events
                     (company_id, asset_id, rule_name, category, severity,
                      mitre_tactic, mitre_technique, source_ip, payload, detected_at)
                 VALUES ",
            );
            for (index, row) in chunk.iter().enumerate() {
                if index > 0 {
                    qb.push(", ");
                }
                qb.push("(");
                qb.push_bind(company_id);
                qb.push(", ");
                qb.push_bind(row.asset_id);
                qb.push(", ");
                qb.push_bind(row.rule_name.as_str());
                qb.push(", ");
                qb.push_bind(row.category.clone());
                qb.push(", CAST(");
                qb.push_bind(row.severity.as_str());
                qb.push(" AS security_severity), ");
                qb.push_bind(row.mitre_tactic.clone());
                qb.push(", ");
                qb.push_bind(row.mitre_technique.clone());
                qb.push(", CAST(");
                qb.push_bind(row.source_ip.clone());
                qb.push(" AS inet), ");
                qb.push_bind(row.payload.clone());
                qb.push(", COALESCE(");
                qb.push_bind(row.detected_at);
                qb.push(", now()))");
            }
            let result = qb.build().execute(self.pool()).await.map_err(db_err)?;
            inserted += result.rows_affected();
        }
        Ok(inserted)
    }

    // ------------------------------------------------------------------
    // Vulnerability findings (dedupe UNIQUE (asset_id, cve_id))
    // ------------------------------------------------------------------

    pub async fn vulnerabilities_upsert(
        &self,
        company_id: Uuid,
        rows: &[VulnerabilityRow],
    ) -> Result<u64, DomainError> {
        let mut inserted = 0u64;
        for chunk in rows.chunks(CHUNK) {
            let mut qb = sqlx::QueryBuilder::new(
                "INSERT INTO vulnerability_findings
                     (company_id, asset_id, cve_id, title, severity, cvss_score,
                      version_installed, version_fixed, source_feed,
                      first_detected_at, last_detected_at)
                 VALUES ",
            );
            for (index, row) in chunk.iter().enumerate() {
                if index > 0 {
                    qb.push(", ");
                }
                qb.push("(");
                qb.push_bind(company_id);
                qb.push(", ");
                qb.push_bind(row.asset_id);
                qb.push(", ");
                qb.push_bind(row.cve_id.as_str());
                qb.push(", ");
                qb.push_bind(row.title.as_str());
                qb.push(", CAST(");
                qb.push_bind(row.severity.as_str());
                qb.push(" AS security_severity), ");
                qb.push_bind(row.cvss_score);
                qb.push(", ");
                qb.push_bind(row.version_installed.clone());
                qb.push(", ");
                qb.push_bind(row.version_fixed.clone());
                qb.push(", ");
                qb.push_bind(row.source_feed.clone());
                qb.push(", COALESCE(");
                qb.push_bind(row.detected_at);
                qb.push(", now()), COALESCE(");
                qb.push_bind(row.detected_at);
                qb.push(", now()))");
            }
            qb.push(" ON CONFLICT (asset_id, cve_id) DO UPDATE SET
                         title = EXCLUDED.title,
                         severity = EXCLUDED.severity,
                         cvss_score = EXCLUDED.cvss_score,
                         version_installed = EXCLUDED.version_installed,
                         version_fixed = EXCLUDED.version_fixed,
                         source_feed = EXCLUDED.source_feed,
                         last_detected_at = EXCLUDED.last_detected_at");
            let result = qb.build().execute(self.pool()).await.map_err(db_err)?;
            inserted += result.rows_affected();
        }
        Ok(inserted)
    }

    // ------------------------------------------------------------------
    // Compliance check results (dedupe UNIQUE 4 kolom)
    // ------------------------------------------------------------------

    pub async fn compliance_results_upsert(
        &self,
        company_id: Uuid,
        rows: &[ComplianceRow],
    ) -> Result<u64, DomainError> {
        let mut inserted = 0u64;
        for chunk in rows.chunks(CHUNK) {
            let mut qb = sqlx::QueryBuilder::new(
                "INSERT INTO compliance_check_results
                     (company_id, asset_id, benchmark, check_id, title, status,
                      severity, evidence, checked_at)
                 VALUES ",
            );
            for (index, row) in chunk.iter().enumerate() {
                if index > 0 {
                    qb.push(", ");
                }
                qb.push("(");
                qb.push_bind(company_id);
                qb.push(", ");
                qb.push_bind(row.asset_id);
                qb.push(", ");
                qb.push_bind(row.benchmark.as_str());
                qb.push(", ");
                qb.push_bind(row.check_id.as_str());
                qb.push(", ");
                qb.push_bind(row.title.as_str());
                qb.push(", CAST(");
                qb.push_bind(row.status.as_str());
                qb.push(" AS compliance_status), CAST(");
                qb.push_bind(row.severity.as_str());
                qb.push(" AS security_severity), ");
                qb.push_bind(row.evidence.clone());
                qb.push(", COALESCE(");
                qb.push_bind(row.checked_at);
                qb.push(", now()))");
            }
            qb.push(" ON CONFLICT (asset_id, benchmark, check_id, checked_at) DO UPDATE SET
                         title = EXCLUDED.title,
                         status = EXCLUDED.status,
                         severity = EXCLUDED.severity,
                         evidence = EXCLUDED.evidence");
            let result = qb.build().execute(self.pool()).await.map_err(db_err)?;
            inserted += result.rows_affected();
        }
        Ok(inserted)
    }

    // ------------------------------------------------------------------
    // Retention purge (bab 5.8 — batch + throttling, dipanggil
    // flow_worker_agent via endpoint internal ber-HMAC + allowlist env)
    // ------------------------------------------------------------------

    /// Hapus baris lebih tua dari `cutoff` untuk satu tabel time-series.
    /// Batch `LIMIT n` + iterasi terbatas agar tidak menahan lock lama.
    /// SQL dibangun dari enum `RetentionTable` (bukan input user) — aman.
    pub async fn retention_purge_table(
        &self,
        table: RetentionTable,
        cutoff: DateTime<Utc>,
    ) -> Result<i64, DomainError> {
        let time_column = table.time_column();
        let tier_filter = match table {
            RetentionTable::SystemMetricsTier1 => " AND tier = 'TIER_1M'",
            RetentionTable::SystemMetricsTier10 => " AND tier = 'TIER_10M'",
            _ => "",
        };
        let mut total = 0i64;
        for _ in 0..RETENTION_MAX_BATCHES {
            let sql = format!(
                "DELETE FROM {table} WHERE id IN (
                     SELECT id FROM {table}
                     WHERE {time_column} < $1{tier_filter}
                     ORDER BY {time_column}
                     LIMIT {RETENTION_BATCH_SIZE}
                 )"
            );
            let result = sqlx::query(sqlx::AssertSqlSafe(sql))
                .bind(cutoff)
                .execute(self.pool())
                .await
                .map_err(db_err)?;
            total += i64::try_from(result.rows_affected()).unwrap_or(i64::MAX);
            if result.rows_affected() < RETENTION_BATCH_SIZE as u64 {
                break;
            }
        }
        Ok(total)
    }
}

/// Tabel time-series yang di-cover job retensi (enum — anti SQL injection:
/// nama tabel TIDAK pernah dari input user).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetentionTable {
    SystemMetricsTier1,
    SystemMetricsTier10,
    ContainerMetrics,
    UptimeHeartbeats,
    FimEvents,
    SecurityAlerts,
    ComplianceResults,
}

impl RetentionTable {
    fn time_column(&self) -> &'static str {
        match self {
            RetentionTable::SystemMetricsTier1 | RetentionTable::SystemMetricsTier10 => {
                "recorded_at"
            }
            RetentionTable::ContainerMetrics => "recorded_at",
            RetentionTable::UptimeHeartbeats => "recorded_at",
            RetentionTable::FimEvents => "detected_at",
            RetentionTable::SecurityAlerts => "detected_at",
            RetentionTable::ComplianceResults => "checked_at",
        }
    }
}

impl std::fmt::Display for RetentionTable {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            RetentionTable::SystemMetricsTier1 => "system_metric_snapshots",
            RetentionTable::SystemMetricsTier10 => "system_metric_snapshots",
            RetentionTable::ContainerMetrics => "container_metric_snapshots",
            RetentionTable::UptimeHeartbeats => "uptime_heartbeats",
            RetentionTable::FimEvents => "fim_baseline_events",
            RetentionTable::SecurityAlerts => "security_alert_events",
            RetentionTable::ComplianceResults => "compliance_check_results",
        };
        f.write_str(name)
    }
}

/// Ringkasan hitungan untuk dashboard SOC (label tabel → baris tersisa).
pub async fn secops_counts(store: &Store, company_id: Uuid) -> Result<Value, DomainError> {
    let fim = count_table(
        store,
        "SELECT COUNT(*) AS n FROM fim_baseline_events WHERE company_id = $1 AND NOT is_resolved",
        company_id,
    )
    .await?;
    let alerts = count_table(
        store,
        "SELECT COUNT(*) AS n FROM security_alert_events WHERE company_id = $1 AND NOT is_acknowledged",
        company_id,
    )
    .await?;
    let vulns = count_table(
        store,
        "SELECT COUNT(*) AS n FROM vulnerability_findings WHERE company_id = $1 AND status = 'OPEN'",
        company_id,
    )
    .await?;
    Ok(json!({ "fim_unresolved": fim, "alerts_unacknowledged": alerts, "vulnerabilities_open": vulns }))
}

async fn count_table(
    store: &Store,
    sql: &'static str,
    company_id: Uuid,
) -> Result<i64, DomainError> {
    let row = sqlx::query(sql)
        .bind(company_id)
        .fetch_one(store.pool())
        .await
        .map_err(db_err)?;
    row.try_get::<i64, _>("n")
        .map_err(|e| DomainError::Unavailable(format!("row: {e}")))
}

#[allow(dead_code)] // dipakai handler list SOC dashboard (follow-up W3 site)
pub(crate) async fn fim_recent(
    store: &Store,
    company_id: Uuid,
    limit: i64,
) -> Result<Vec<Value>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, asset_id, path, event_type::text AS event_type,
                detection_source::text AS detection_source, baseline_version,
                old_checksum, new_checksum, size_bytes, detected_at, is_resolved
         FROM fim_baseline_events
         WHERE company_id = $1
         ORDER BY detected_at DESC
         LIMIT $2",
    )
    .bind(company_id)
    .bind(limit.clamp(1, 500))
    .fetch_all(store.pool())
    .await
    .map_err(db_err)?;

    rows.iter()
        .map(|row| {
            Ok(json!({
                "id": row.try_get::<Uuid, _>("id")?,
                "asset_id": row.try_get::<Uuid, _>("asset_id")?,
                "path": row.try_get::<String, _>("path")?,
                "event_type": row.try_get::<String, _>("event_type")?,
                "detection_source": row.try_get::<String, _>("detection_source")?,
                "baseline_version": row.try_get::<i32, _>("baseline_version")?,
                "old_checksum": row.try_get::<Option<String>, _>("old_checksum")?,
                "new_checksum": row.try_get::<Option<String>, _>("new_checksum")?,
                "size_bytes": row.try_get::<Option<i64>, _>("size_bytes")?,
                "detected_at": row.try_get::<DateTime<Utc>, _>("detected_at")?,
                "is_resolved": row.try_get::<bool, _>("is_resolved")?,
            }))
        })
        .collect()
}
