//! Handler Wave 3 — Security Telemetry Ingest (pola Wazuh 5.x):
//!
//! - `POST /api/v1/agents/security/ingest` — HMAC agent: batch FIM events
//!   (dual-event), log anomali keamanan (detector), matching paket
//!   terinstal → CVE (upsert dedupe), hasil compliance/SCA.
//! - `POST /api/v1/agents/retention/purge` — HMAC agent + allowlist env
//!   `RETENTION_PURGE_AGENT_IDS`: job pembersihan retensi (bab 5.8)
//!   untuk `flow_worker_agent` (batch + throttling).
//! - `GET /api/v1/secops/overview` — JWT: ringkasan SOC tenant aktif.
//!
//! Tenant isolation: `company_id` dari baris agent (bukan body); setiap
//! `asset_id` pada event dipaksa = agent pelapor (anti-spoof — agent hanya
//! boleh melaporkan dirinya sendiri).

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::application::secops as usecases;
use crate::infrastructure::store::secops::{
    ComplianceRow, FimEventRow, MAX_COMPLIANCE_RESULTS, MAX_FIM_EVENTS, MAX_SECURITY_ALERTS,
    MAX_VULNERABILITIES, RetentionTable, SecurityAlertRow, VulnerabilityRow, fim_recent,
    secops_counts,
};
use crate::presentation::error::AppError;
use crate::presentation::http::agent_auth::AgentRequest;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

// ======================================================================
// Security ingest (HMAC)
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct SecurityIngestPayload {
    /// File Integrity Monitoring (dual-event REALTIME/SCHEDULED).
    #[serde(default)]
    pub fim_events: Vec<FimEventIn>,
    /// Log anomali keamanan (detector Sigma/Syscheck terpisah event store).
    #[serde(default)]
    pub security_alerts: Vec<SecurityAlertIn>,
    /// Paket terinstal cocok CVE feed (upsert dedupe per asset+cve).
    #[serde(default)]
    pub vulnerabilities: Vec<VulnerabilityIn>,
    /// Hasil compliance check (CIS benchmark / SCA).
    #[serde(default)]
    pub compliance_results: Vec<ComplianceIn>,
}

#[derive(Debug, Deserialize)]
pub struct FimEventIn {
    #[serde(default)]
    pub asset_id: Option<uuid::Uuid>,
    pub path: String,
    pub event_type: String,
    #[serde(default)]
    pub detection_source: Option<String>,
    #[serde(default)]
    pub baseline_version: Option<i32>,
    #[serde(default)]
    pub old_checksum: Option<String>,
    #[serde(default)]
    pub new_checksum: Option<String>,
    #[serde(default)]
    pub old_attrs: Option<Value>,
    #[serde(default)]
    pub new_attrs: Option<Value>,
    #[serde(default)]
    pub size_bytes: Option<i64>,
    #[serde(default)]
    pub detected_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct SecurityAlertIn {
    #[serde(default)]
    pub asset_id: Option<uuid::Uuid>,
    pub rule_name: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub severity: Option<String>,
    #[serde(default)]
    pub mitre_tactic: Option<String>,
    #[serde(default)]
    pub mitre_technique: Option<String>,
    #[serde(default)]
    pub source_ip: Option<String>,
    #[serde(default)]
    pub payload: Option<Value>,
    #[serde(default)]
    pub detected_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct VulnerabilityIn {
    #[serde(default)]
    pub asset_id: Option<uuid::Uuid>,
    pub cve_id: String,
    pub title: String,
    #[serde(default)]
    pub severity: Option<String>,
    #[serde(default)]
    pub cvss_score: Option<f64>,
    #[serde(default)]
    pub version_installed: Option<String>,
    #[serde(default)]
    pub version_fixed: Option<String>,
    #[serde(default)]
    pub source_feed: Option<String>,
    #[serde(default)]
    pub detected_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct ComplianceIn {
    #[serde(default)]
    pub asset_id: Option<uuid::Uuid>,
    pub benchmark: String,
    pub check_id: String,
    pub title: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub severity: Option<String>,
    #[serde(default)]
    pub evidence: Option<Value>,
    #[serde(default)]
    pub checked_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// `POST /api/v1/agents/security/ingest` — 202 + hitungan baris tersimpan.
pub async fn security_ingest(
    State(state): State<AppState>,
    request: AgentRequest<SecurityIngestPayload>,
) -> Result<Response, AppError> {
    let payload = request.body;
    let company_id = request.ctx.company_id;
    let agent_id = request.ctx.agent_id;

    // Batas batch (anti payload bomb).
    if payload.fim_events.len() > MAX_FIM_EVENTS {
        return Err(AppError::Validation(format!("fim_events melebihi {MAX_FIM_EVENTS} baris")));
    }
    if payload.security_alerts.len() > MAX_SECURITY_ALERTS {
        return Err(AppError::Validation(format!(
            "security_alerts melebihi {MAX_SECURITY_ALERTS} baris"
        )));
    }
    if payload.vulnerabilities.len() > MAX_VULNERABILITIES {
        return Err(AppError::Validation(format!(
            "vulnerabilities melebihi {MAX_VULNERABILITIES} baris"
        )));
    }
    if payload.compliance_results.len() > MAX_COMPLIANCE_RESULTS {
        return Err(AppError::Validation(format!(
            "compliance_results melebihi {MAX_COMPLIANCE_RESULTS} baris"
        )));
    }

    // --- Normalisasi & validasi murni (application::secops) ---
    let mut fim_rows = Vec::with_capacity(payload.fim_events.len());
    for event in &payload.fim_events {
        let asset_id = self_or_reject(event.asset_id, agent_id)?;
        let path = usecases::bounded(&event.path, 1000);
        if path.is_empty() {
            return Err(AppError::Validation("path FIM wajib 1–1000 karakter".into()));
        }
        fim_rows.push(FimEventRow {
            asset_id,
            path,
            event_type: usecases::enum_or(
                Some(&event.event_type),
                usecases::FIM_EVENT_TYPES,
                "MODIFIED",
                "event_type",
            )
            .map_err(AppError::from)?,
            detection_source: usecases::enum_or(
                event.detection_source.as_deref(),
                usecases::FIM_SOURCES,
                "SCHEDULED",
                "detection_source",
            )
            .map_err(AppError::from)?,
            baseline_version: event.baseline_version.unwrap_or(1).clamp(1, i32::MAX),
            old_checksum: checksum_or_reject(event.old_checksum.as_deref())?,
            new_checksum: checksum_or_reject(event.new_checksum.as_deref())?,
            old_attrs: event.old_attrs.clone(),
            new_attrs: event.new_attrs.clone(),
            size_bytes: event.size_bytes,
            detected_at: event.detected_at,
        });
    }

    let mut alert_rows = Vec::with_capacity(payload.security_alerts.len());
    for alert in &payload.security_alerts {
        let asset_id = self_or_reject(alert.asset_id, agent_id)?;
        let rule_name = usecases::bounded(&alert.rule_name, 200);
        if rule_name.is_empty() {
            return Err(AppError::Validation("rule_name wajib 1–200 karakter".into()));
        }
        alert_rows.push(SecurityAlertRow {
            asset_id,
            rule_name,
            category: alert.category.as_deref().map(|c| usecases::bounded(c, 100)).filter(|c| !c.is_empty()),
            severity: usecases::enum_or(alert.severity.as_deref(), usecases::SEVERITIES, "MEDIUM", "severity")
                .map_err(AppError::from)?,
            mitre_tactic: alert.mitre_tactic.as_deref().map(|m| usecases::bounded(m, 100)).filter(|m| !m.is_empty()),
            mitre_technique: alert
                .mitre_technique
                .as_deref()
                .map(|m| usecases::bounded(m, 100))
                .filter(|m| !m.is_empty()),
            source_ip: ip_or_reject(alert.source_ip.as_deref())?,
            payload: alert.payload.clone(),
            detected_at: alert.detected_at,
        });
    }

    let mut vuln_rows = Vec::with_capacity(payload.vulnerabilities.len());
    for vuln in &payload.vulnerabilities {
        let asset_id = self_or_reject(vuln.asset_id, agent_id)?;
        let title = usecases::bounded(&vuln.title, 300);
        if title.is_empty() {
            return Err(AppError::Validation("title CVE wajib 1–300 karakter".into()));
        }
        vuln_rows.push(VulnerabilityRow {
            asset_id,
            cve_id: usecases::validate_cve_id(&vuln.cve_id).map_err(AppError::from)?,
            title,
            severity: usecases::enum_or(vuln.severity.as_deref(), usecases::SEVERITIES, "MEDIUM", "severity")
                .map_err(AppError::from)?,
            cvss_score: usecases::validate_cvss(vuln.cvss_score).map_err(AppError::from)?,
            version_installed: vuln
                .version_installed
                .as_deref()
                .map(|v| usecases::bounded(v, 150))
                .filter(|v| !v.is_empty()),
            version_fixed: vuln
                .version_fixed
                .as_deref()
                .map(|v| usecases::bounded(v, 150))
                .filter(|v| !v.is_empty()),
            source_feed: vuln
                .source_feed
                .as_deref()
                .map(|v| usecases::bounded(v, 100))
                .filter(|v| !v.is_empty()),
            detected_at: vuln.detected_at,
        });
    }

    let mut compliance_rows = Vec::with_capacity(payload.compliance_results.len());
    for result in &payload.compliance_results {
        let asset_id = self_or_reject(result.asset_id, agent_id)?;
        let benchmark = usecases::bounded(&result.benchmark, 100);
        let check_id = usecases::bounded(&result.check_id, 50);
        let title = usecases::bounded(&result.title, 300);
        if benchmark.is_empty() || check_id.is_empty() || title.is_empty() {
            return Err(AppError::Validation(
                "benchmark/check_id/title compliance wajib diisi (≤100/50/300 karakter)".into(),
            ));
        }
        compliance_rows.push(ComplianceRow {
            asset_id,
            benchmark,
            check_id,
            title,
            status: usecases::enum_or(result.status.as_deref(), usecases::COMPLIANCE_STATUSES, "FAIL", "status")
                .map_err(AppError::from)?,
            severity: usecases::enum_or(result.severity.as_deref(), usecases::SEVERITIES, "MEDIUM", "severity")
                .map_err(AppError::from)?,
            evidence: result.evidence.clone(),
            checked_at: result.checked_at,
        });
    }

    // --- Persist (batch multi-row, chunked) ---
    let fim_stored = state
        .store
        .fim_events_insert(company_id, &fim_rows)
        .await
        .map_err(AppError::from)?;
    let alerts_stored = state
        .store
        .security_alerts_insert(company_id, &alert_rows)
        .await
        .map_err(AppError::from)?;
    let vulns_stored = state
        .store
        .vulnerabilities_upsert(company_id, &vuln_rows)
        .await
        .map_err(AppError::from)?;
    let compliance_stored = state
        .store
        .compliance_results_upsert(company_id, &compliance_rows)
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "status": "accepted",
            "data": {
                "fim_events": fim_stored,
                "security_alerts": alerts_stored,
                "vulnerabilities": vulns_stored,
                "compliance_results": compliance_stored,
            }
        })),
    )
        .into_response())
}

/// Asset pelapor wajib = agent itu sendiri (anti-spoof lintas host).
fn self_or_reject(asset_id: Option<uuid::Uuid>, agent_id: uuid::Uuid) -> Result<uuid::Uuid, AppError> {
    match asset_id {
        None => Ok(agent_id),
        Some(id) if id == agent_id => Ok(id),
        Some(_) => Err(AppError::Validation(
            "asset_id wajib sama dengan agent pelapor (agent hanya melaporkan dirinya sendiri)".into(),
        )),
    }
}

/// Checksum SHA-256 hex (64 char) — `None`/kosong diterima.
fn checksum_or_reject(raw: Option<&str>) -> Result<Option<String>, AppError> {
    match raw.map(str::trim).filter(|c| !c.is_empty()) {
        None => Ok(None),
        Some(value) if value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit()) => {
            Ok(Some(value.to_uppercase()))
        }
        Some(value) => Err(AppError::Validation(format!(
            "checksum wajib SHA-256 hex 64 karakter (dapat {len})",
            len = value.len()
        ))),
    }
}

/// IP address valid (dikirim `CAST AS inet` — malformed ditolak 400).
fn ip_or_reject(raw: Option<&str>) -> Result<Option<String>, AppError> {
    match raw.map(str::trim).filter(|ip| !ip.is_empty()) {
        None => Ok(None),
        Some(value) if value.parse::<std::net::IpAddr>().is_ok() => Ok(Some(value.to_owned())),
        Some(_) => Err(AppError::Validation("source_ip bukan alamat IP valid".into())),
    }
}

// ======================================================================
// Retention purge (internal — flow_worker_agent)
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct RetentionPurgePayload {
    /// Dry-run: hitung saja tanpa menghapus (laporan kebijakan).
    #[serde(default)]
    pub dry_run: bool,
}

/// `POST /api/v1/agents/retention/purge` — HMAC agent DAN allowlist env
/// `RETENTION_PURGE_AGENT_IDS` (deny-by-default; CSV `agent_id`).
pub async fn retention_purge(
    State(state): State<AppState>,
    request: AgentRequest<RetentionPurgePayload>,
) -> Result<Response, AppError> {
    let allowlist: Vec<uuid::Uuid> = state
        .config
        .retention_purge_agent_ids
        .split(',')
        .filter_map(|raw| raw.trim().parse().ok())
        .collect();
    if !allowlist.contains(&request.ctx.agent_id) {
        return Err(AppError::Forbidden(
            "agent tidak terdaftar pada RETENTION_PURGE_AGENT_IDS".into(),
        ));
    }

    let now = Utc::now();
    let cfg = &state.config;
    let mut purged = serde_json::Map::new();

    let targets: [(RetentionTable, i32); 7] = [
        (RetentionTable::SystemMetricsTier1, cfg.retention_metric_days),
        (RetentionTable::SystemMetricsTier10, cfg.retention_metric_tier10_days),
        (RetentionTable::ContainerMetrics, cfg.retention_metric_days),
        (RetentionTable::UptimeHeartbeats, cfg.retention_heartbeat_days),
        (RetentionTable::FimEvents, cfg.retention_secops_days),
        (RetentionTable::SecurityAlerts, cfg.retention_secops_days),
        (RetentionTable::ComplianceResults, cfg.retention_secops_days),
    ];

    for (table, days) in targets {
        let cutoff = now - Duration::days(i64::from(days.max(1)));
        let deleted = if request.body.dry_run {
            0 // dry-run tidak menghapus (laporan policy di luar scope — hitung via count terpisah)
        } else {
            state
                .store
                .retention_purge_table(table, cutoff)
                .await
                .map_err(AppError::from)?
        };
        purged.insert(table.to_string(), json!(deleted));
        // Throttling antar tabel — jaga beban database (bab 5.8).
        if !request.body.dry_run {
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
    }

    state
        .store
        .activity_log(crate::domain::model::ActivityLogData {
            company_id: None,
            user_id: None,
            action: "RETENTION_PURGE",
            entity_type: Some("retention_job"),
            entity_id: None,
            ip_address: None,
            user_agent: None,
            detail: Some(json!({
                "agent_id": request.ctx.agent_id,
                "dry_run": request.body.dry_run,
                "purged": purged,
            })),
        })
        .await;

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "status": "accepted", "data": { "dry_run": request.body.dry_run, "purged": purged } })),
    )
        .into_response())
}

// ======================================================================
// SOC overview (JWT)
// ======================================================================

/// `GET /api/v1/secops/overview` — hitung-an SOC tenant + FIM terbaru.
pub async fn secops_overview(
    State(state): State<AppState>,
    ctx: AuthContext,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let counts = secops_counts(&state.store, company_id)
        .await
        .map_err(AppError::from)?;
    let recent = fim_recent(&state.store, company_id, 50)
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": {
            "counts": counts,
            "fim_recent": recent,
        }
    })))
}
