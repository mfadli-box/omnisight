//! Handler Wave 2 — Agent Enrollment, Telemetry Ingest, Uptime Ingest
//! dan Live Logs Push.
//!
//! - `POST /api/v1/agents/enrollment-tokens` — JWT (admin/super admin).
//! - `POST /api/v1/agents/enroll` — publik (one-time token → HMAC secret).
//! - `POST /api/v1/agents/inventory/ingest` — HMAC agent.
//! - `POST /api/v1/agents/metrics/ingest` — HMAC agent + evaluasi AlertRule.
//! - `POST /api/v1/agents/uptime/ingest` — HMAC agent.
//! - `POST /api/v1/agents/logs` — HMAC agent → broadcast SSE.
//!
//! Semua endpoint agent mendapatkan `company_id` dari baris agent (bukan
//! body) — tenant isolation ketat bab 5.6.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::application::alerts;
use crate::infrastructure::logstream::LogEvent;
use crate::infrastructure::store::agents::AgentNew;
use crate::infrastructure::store::telemetry::{
    ContainerMetricRow, InterfaceMetricRow, SystemMetricRow, MAX_CONTAINERS, MAX_INTERFACES,
    MAX_SMART_DEVICES,
};
use crate::infrastructure::store::{RefTable, ref_in_company};
use crate::presentation::error::AppError;
use crate::presentation::http::agent_auth::AgentRequest;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

// ======================================================================
// Enrollment tokens (admin)
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct EnrollmentTokenRequest {
    /// `HOST` | `NETWORK` | `VIRTUAL` | `CONTAINER` | `RACK_MOUNTED` | `SERVICE`
    pub node_type: String,
    /// TTL token (jam, 1–72; default 24).
    #[serde(default = "default_ttl")]
    pub ttl_hours: i64,
}

fn default_ttl() -> i64 {
    24
}

/// Gate endpoint admin: super admin ATAU role ber-nama *admin*.
async fn require_admin(state: &AppState, ctx: &AuthContext) -> Result<(), AppError> {
    if ctx.is_super_admin {
        return Ok(());
    }
    let role_id = ctx.role_id.ok_or_else(|| {
        AppError::Forbidden("role aktif tidak ditemukan (pilih company)".into())
    })?;
    let role_name = state
        .store
        .role_name(role_id)
        .await
        .map_err(AppError::from)?
        .unwrap_or_default();
    if role_name.to_lowercase().contains("admin") {
        return Ok(());
    }
    Err(AppError::Forbidden("endpoint khusus admin".into()))
}

/// `POST /api/v1/agents/enrollment-tokens` — token plaintext ditampilkan
/// SEKALI; database hanya menyimpan SHA-256.
pub async fn create_enrollment_token(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<EnrollmentTokenRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    require_admin(&state, &ctx).await?;

    let ttl = payload.ttl_hours.clamp(1, 72);
    let token = crate::infrastructure::crypto::random_hex(32);
    let token_hash = crate::infrastructure::crypto::sha256_hex(token.as_bytes());
    let expires_at = Utc::now() + Duration::hours(ttl);

    let token_id = state
        .store
        .enrollment_token_create(company_id, &token_hash, payload.node_type.trim(), expires_at)
        .await
        .map_err(AppError::from)?;

    state.store.activity_log(crate::domain::model::ActivityLogData {
        company_id: Some(company_id),
        user_id: Some(ctx.user_id),
        action: "ENROLLMENT_TOKEN_CREATE",
        entity_type: Some("agent_enrollment_token"),
        entity_id: Some(token_id),
        ip_address: None,
        user_agent: None,
        detail: Some(json!({ "node_type": payload.node_type, "ttl_hours": ttl })),
    })
    .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "status": "success",
            "data": {
                "id": token_id,
                "token": token,
                "node_type": payload.node_type,
                "expires_at": expires_at,
            }
        })),
    )
        .into_response())
}

// ======================================================================
// Enroll (publik — menukar one-time token)
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct EnrollRequest {
    pub enrollment_token: String,
    #[serde(default)]
    pub hostname: String,
    #[serde(default)]
    pub mgmt_ip: Option<String>,
    /// FK master ITAM wajib (kolom NOT NULL pada `assets`) — disediakan
    /// admin pada bootstrap config agent.
    pub asset_model_id: Uuid,
    pub status_label_id: Uuid,
    #[serde(default)]
    pub asset_tag: Option<String>,
    #[serde(default)]
    pub agent_version: Option<String>,
}

/// `POST /api/v1/agents/enroll` — single-use, TTL, atomic claim.
/// Respons: `agent_id`, `company_id`, `hmac_secret` (ditampilkan sekali).
pub async fn enroll(
    State(state): State<AppState>,
    Json(payload): Json<EnrollRequest>,
) -> Result<Response, AppError> {
    let token_hash = crate::infrastructure::crypto::sha256_hex(payload.enrollment_token.trim().as_bytes());
    let token = state
        .store
        .enrollment_token_consume(&token_hash)
        .await
        .map_err(AppError::from)?
        .ok_or(AppError::Unauthorized("token enrollment tidak valid, terpakai, atau kedaluwarsa".into()))?;

    let hostname = payload.hostname.trim();
    if hostname.is_empty() || hostname.len() > 150 {
        return Err(AppError::Validation("hostname wajib 1–150 karakter".into()));
    }
    if !ref_in_company(state.store.pool(), token.company_id, RefTable::AssetModel, payload.asset_model_id)
        .await
        .map_err(AppError::from)?
    {
        return Err(AppError::Validation("asset_model_id tidak milik company token".into()));
    }
    if !ref_in_company(state.store.pool(), token.company_id, RefTable::StatusLabel, payload.status_label_id)
        .await
        .map_err(AppError::from)?
    {
        return Err(AppError::Validation("status_label_id tidak milik company token".into()));
    }
    let mgmt_ip = payload
        .mgmt_ip
        .as_deref()
        .map(str::trim)
        .filter(|ip| !ip.is_empty());
    if let Some(ip) = mgmt_ip
        && ip.parse::<std::net::IpAddr>().is_err()
    {
        return Err(AppError::Validation("mgmt_ip bukan alamat IP valid".into()));
    }

    // Secret HMAC 256-bit: Envelope AES-256-GCM → base64 di metadata.
    let secret = crate::infrastructure::crypto::random_hex(32);
    let ciphertext = state.crypto.envelope_encrypt(secret.as_bytes()).map_err(AppError::from)?;
    let secret_enc = data_encoding::BASE64.encode(&ciphertext);
    let asset_tag = payload
        .asset_tag
        .as_deref()
        .map(str::trim)
        .filter(|tag| !tag.is_empty() && tag.len() <= 100)
        .map(str::to_owned)
        .unwrap_or_else(|| format!("AG-{}", Uuid::now_v7().simple()));

    let agent_id = state
        .store
        .agent_register(AgentNew {
            company_id: token.company_id,
            node_type: token.node_type.as_str(),
            hostname,
            mgmt_ip,
            asset_tag: asset_tag.as_str(),
            asset_model_id: payload.asset_model_id,
            status_label_id: payload.status_label_id,
            agent_version: payload.agent_version.as_deref(),
            hmac_secret_enc: secret_enc.as_str(),
        })
        .await
        .map_err(AppError::from)?;

    state.store.activity_log(crate::domain::model::ActivityLogData {
        company_id: Some(token.company_id),
        user_id: None,
        action: "AGENT_ENROLL",
        entity_type: Some("asset"),
        entity_id: Some(agent_id),
        ip_address: None,
        user_agent: None,
        detail: Some(json!({
            "node_type": token.node_type,
            "hostname": hostname,
            "agent_version": payload.agent_version,
            "enrollment_token_id": token.id,
        })),
    })
    .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "status": "success",
            "data": {
                "agent_id": agent_id,
                "company_id": token.company_id,
                "hmac_secret": secret,
                "node_type": token.node_type,
                "asset_tag": asset_tag,
            }
        })),
    )
        .into_response())
}

// ======================================================================
// Inventory ingest (HMAC)
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct InventoryPayload {
    #[serde(default)]
    pub cpu_model: Option<String>,
    #[serde(default)]
    pub cpu_cores: Option<i32>,
    #[serde(default)]
    pub memory_total_bytes: Option<i64>,
    #[serde(default)]
    pub storage_total_bytes: Option<i64>,
    #[serde(default)]
    pub os_name: Option<String>,
    #[serde(default)]
    pub os_version: Option<String>,
    #[serde(default)]
    pub hostname: Option<String>,
    /// Payload mentah (disk, paket, service) — JSONB `payload`.
    #[serde(default)]
    pub payload: Option<Value>,
}

/// `POST /api/v1/agents/inventory/ingest` — snapshot hardware/software.
pub async fn inventory_ingest(
    State(state): State<AppState>,
    request: AgentRequest<InventoryPayload>,
) -> Result<Response, AppError> {
    let payload = request.body;
    let snapshot_id = state
        .store
        .inventory_ingest(
            request.ctx.company_id,
            request.ctx.agent_id,
            crate::infrastructure::store::telemetry::InventoryData {
                cpu_model: payload.cpu_model.as_deref(),
                cpu_cores: payload.cpu_cores,
                memory_total_bytes: payload.memory_total_bytes,
                storage_total_bytes: payload.storage_total_bytes,
                os_name: payload.os_name.as_deref(),
                os_version: payload.os_version.as_deref(),
                hostname: payload.hostname.as_deref(),
                payload: payload.payload.unwrap_or_else(|| json!({})),
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "status": "accepted", "data": { "snapshot_id": snapshot_id } })),
    )
        .into_response())
}

// ======================================================================
// Metrics ingest (HMAC) + evaluasi AlertRule
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct MetricsPayload {
    /// Sampel host (agent = host; host_id diambil dari identitas agent).
    #[serde(default)]
    pub host: Option<HostSample>,
    #[serde(default)]
    pub containers: Vec<ContainerSample>,
    /// Laporan S.M.A.R.T. (dipersist sebagai snapshot inventaris `kind=smart`).
    #[serde(default)]
    pub smart: Vec<SmartDevice>,
    /// Metrik interface SNMP (interface_id milik tenant wajib).
    #[serde(default)]
    pub snmp_interfaces: Vec<InterfaceSample>,
}

#[derive(Debug, Deserialize)]
pub struct HostSample {
    #[serde(default)]
    pub recorded_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    pub cpu_usage_pct: Option<f64>,
    #[serde(default)]
    pub load1: Option<f64>,
    #[serde(default)]
    pub load5: Option<f64>,
    #[serde(default)]
    pub load15: Option<f64>,
    #[serde(default)]
    pub mem_used_bytes: Option<i64>,
    #[serde(default)]
    pub mem_total_bytes: Option<i64>,
    #[serde(default)]
    pub disk_used_bytes: Option<i64>,
    #[serde(default)]
    pub disk_total_bytes: Option<i64>,
    #[serde(default)]
    pub net_in_bps: Option<i64>,
    #[serde(default)]
    pub net_out_bps: Option<i64>,
    #[serde(default)]
    pub uptime_seconds: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ContainerSample {
    pub host_id: Uuid,
    pub container_ref: String,
    #[serde(default)]
    pub container_name: Option<String>,
    #[serde(default)]
    pub recorded_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    pub cpu_usage_pct: Option<f64>,
    #[serde(default)]
    pub mem_used_bytes: Option<i64>,
    #[serde(default)]
    pub mem_limit_bytes: Option<i64>,
    #[serde(default)]
    pub net_in_bps: Option<i64>,
    #[serde(default)]
    pub net_out_bps: Option<i64>,
    #[serde(default)]
    pub block_read_bps: Option<i64>,
    #[serde(default)]
    pub block_write_bps: Option<i64>,
    #[serde(default)]
    pub pids: Option<i32>,
    #[serde(default = "default_true")]
    pub is_running: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize, serde::Serialize)]
pub struct SmartDevice {
    pub device: String,
    #[serde(default)]
    pub health: Option<String>,
    #[serde(default)]
    pub temperature_c: Option<f64>,
    #[serde(default)]
    pub reallocated_sectors: Option<i64>,
    #[serde(default)]
    pub power_on_hours: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct InterfaceSample {
    pub interface_id: Uuid,
    #[serde(default)]
    pub collected_at: Option<chrono::DateTime<chrono::Utc>>,
    pub in_octets: i64,
    pub out_octets: i64,
    #[serde(default)]
    pub in_unicast_packets: Option<i64>,
    #[serde(default)]
    pub out_unicast_packets: Option<i64>,
    #[serde(default)]
    pub in_errors: Option<i64>,
    #[serde(default)]
    pub out_errors: Option<i64>,
    #[serde(default)]
    pub in_discards: Option<i64>,
    #[serde(default)]
    pub out_discards: Option<i64>,
    #[serde(default)]
    pub in_rate_bps: Option<i64>,
    #[serde(default)]
    pub out_rate_bps: Option<i64>,
}

/// `POST /api/v1/agents/metrics/ingest` — batch host + container + SNMP +
/// SMART, lalu evaluasi `AlertRule` (histeresis app-level).
pub async fn metrics_ingest(
    State(state): State<AppState>,
    request: AgentRequest<MetricsPayload>,
) -> Result<Response, AppError> {
    let payload = request.body;
    let company_id = request.ctx.company_id;
    let agent_id = request.ctx.agent_id;

    if payload.containers.len() > MAX_CONTAINERS {
        return Err(AppError::Validation(format!(
            "batch containers melebihi {MAX_CONTAINERS} sampel"
        )));
    }
    if payload.snmp_interfaces.len() > MAX_INTERFACES {
        return Err(AppError::Validation(format!(
            "batch SNMP melebihi {MAX_INTERFACES} sampel"
        )));
    }
    if payload.smart.len() > MAX_SMART_DEVICES {
        return Err(AppError::Validation(format!(
            "batch S.M.A.R.T. melebihi {MAX_SMART_DEVICES} perangkat"
        )));
    }
    if payload.containers.iter().any(|c| {
        c.container_ref.trim().is_empty() || c.container_ref.len() > 100
    }) {
        return Err(AppError::Validation("container_ref wajib 1–100 karakter".into()));
    }

    let system_rows: Vec<SystemMetricRow> = payload
        .host
        .as_ref()
        .map(|host| vec![SystemMetricRow { recorded_at: host.recorded_at, cpu_usage_pct: host.cpu_usage_pct, load1: host.load1, load5: host.load5, load15: host.load15, mem_used_bytes: host.mem_used_bytes, mem_total_bytes: host.mem_total_bytes, disk_used_bytes: host.disk_used_bytes, disk_total_bytes: host.disk_total_bytes, net_in_bps: host.net_in_bps, net_out_bps: host.net_out_bps, uptime_seconds: host.uptime_seconds }])
        .unwrap_or_default();
    let container_rows: Vec<ContainerMetricRow> = payload
        .containers
        .iter()
        .map(|c| ContainerMetricRow {
            host_id: c.host_id,
            container_ref: c.container_ref.trim().to_owned(),
            container_name: c.container_name.as_deref().map(str::trim).map(str::to_owned),
            recorded_at: c.recorded_at,
            cpu_usage_pct: c.cpu_usage_pct,
            mem_used_bytes: c.mem_used_bytes,
            mem_limit_bytes: c.mem_limit_bytes,
            net_in_bps: c.net_in_bps,
            net_out_bps: c.net_out_bps,
            block_read_bps: c.block_read_bps,
            block_write_bps: c.block_write_bps,
            pids: c.pids,
            is_running: c.is_running,
        })
        .collect();
    let interface_rows: Vec<InterfaceMetricRow> = payload
        .snmp_interfaces
        .iter()
        .map(|i| InterfaceMetricRow {
            interface_id: i.interface_id,
            collected_at: i.collected_at,
            in_octets: i.in_octets,
            out_octets: i.out_octets,
            in_unicast_packets: i.in_unicast_packets,
            out_unicast_packets: i.out_unicast_packets,
            in_errors: i.in_errors,
            out_errors: i.out_errors,
            in_discards: i.in_discards,
            out_discards: i.out_discards,
            in_rate_bps: i.in_rate_bps,
            out_rate_bps: i.out_rate_bps,
        })
        .collect();

    let system_stored = state
        .store
        .system_metrics_insert(company_id, agent_id, agent_id, &system_rows)
        .await
        .map_err(AppError::from)?;
    let container_stored = state
        .store
        .container_metrics_insert(company_id, &container_rows)
        .await
        .map_err(AppError::from)?;
    let interface_stored = state
        .store
        .interface_metrics_insert(company_id, &interface_rows)
        .await
        .map_err(AppError::from)?;

    let smart_stored = if payload.smart.is_empty() {
        0
    } else {
        let devices = serde_json::to_value(&payload.smart)
            .map_err(|_| AppError::Validation("payload S.M.A.R.T. tidak serializable".into()))?;
        let collected = payload.host.as_ref().and_then(|h| h.recorded_at);
        state
            .store
            .smart_ingest(company_id, agent_id, devices, collected)
            .await
            .map_err(AppError::from)?;
        payload.smart.len()
    };

    // --- Evaluasi AlertRule (histeresis berbasis timestamp batch) ---
    let samples =
        crate::infrastructure::store::telemetry::collect_samples(agent_id, &system_rows, &container_rows);
    let alert_fired = evaluate_alerts(&state, company_id, &samples).await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "status": "accepted",
            "data": {
                "system_rows": system_stored,
                "container_rows": container_stored,
                "interface_rows": interface_stored,
                "smart_reports": smart_stored,
                "alert_events": alert_fired,
            }
        })),
    )
        .into_response())
}

/// Evaluasi rule aktif terhadap sampel: FIRING saat pelanggaran bertahan
/// ≥ duration; RESOLVED saat rule FIRING tidak lagi melanggar.
pub async fn evaluate_alerts(
    state: &AppState,
    company_id: Uuid,
    samples: &[alerts::MetricSample],
) -> Result<usize, AppError> {
    if samples.is_empty() {
        return Ok(0);
    }
    let mut metrics: Vec<String> = Vec::new();
    for sample in samples {
        if !metrics.contains(&sample.metric) {
            metrics.push(sample.metric.clone());
        }
    }
    let rules = state
        .store
        .alert_rules_active(company_id, &metrics)
        .await
        .map_err(AppError::from)?;

    let mut fired = 0usize;
    for rule in rules {
        // Per-target: kumpulkan sampel milik target sama.
        let mut targets: Vec<String> = Vec::new();
        for sample in samples.iter().filter(|s| s.metric == rule.metric) {
            if !targets.contains(&sample.target_ref) {
                targets.push(sample.target_ref.clone());
            }
        }
        for target in targets {
            let per_target: Vec<alerts::MetricSample> = samples
                .iter()
                .filter(|s| s.metric == rule.metric && s.target_ref == target)
                .cloned()
                .collect();
            let breach = alerts::breach_for(&rule, &per_target);
            let last_state = state
                .store
                .alert_last_state(rule.id, &target)
                .await
                .map_err(AppError::from)?;

            match (breach, last_state.as_deref()) {
                // Sudah FIRING → dedup (histeresis: tunggu pulih dulu).
                (Some(breach), Some("FIRING")) => {
                    let _ = breach;
                }
                // Pelanggaran baru / setelah RESOLVED → firing bila durasi
                // terpenuhi (anti-flapping).
                (Some(breach), _) => {
                    if alerts::duration_satisfied(&rule, &breach) {
                        state
                            .store
                            .alert_history_insert(crate::infrastructure::store::telemetry::AlertHistoryNew {
                                company_id,
                                rule_id: rule.id,
                                state: "FIRING",
                                severity: rule.severity.as_str(),
                                target_ref: breach.target_ref.as_str(),
                                value: Some(breach.value),
                                message: alerts::message(&rule, &breach),
                            })
                            .await
                            .map_err(AppError::from)?;
                        fired += 1;
                    }
                }
                // Tidak lagi melanggar sementara state FIRING → resolve.
                (None, Some("FIRING")) => {
                    state
                        .store
                        .alert_history_insert(crate::infrastructure::store::telemetry::AlertHistoryNew {
                            company_id,
                            rule_id: rule.id,
                            state: "RESOLVED",
                            severity: rule.severity.as_str(),
                            target_ref: target.as_str(),
                            value: None,
                            message: format!("{}: pulih pada target {target}", rule.name),
                        })
                        .await
                        .map_err(AppError::from)?;
                    fired += 1;
                }
                _ => {}
            }
        }
    }
    Ok(fired)
}

// ======================================================================
// Uptime ingest (HMAC)
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct UptimePayload {
    pub monitor_id: Uuid,
    /// `UP` | `DOWN` | `PENDING` | `MAINTENANCE`.
    pub status: String,
    #[serde(default)]
    pub ping_ms: Option<i32>,
    #[serde(default)]
    pub msg: Option<String>,
    #[serde(default)]
    pub recorded_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// `POST /api/v1/agents/uptime/ingest` — heartbeat + transisi `important` +
/// evaluasi rule `uptime.down`.
pub async fn uptime_ingest(
    State(state): State<AppState>,
    request: AgentRequest<UptimePayload>,
) -> Result<Response, AppError> {
    let payload = request.body;
    let company_id = request.ctx.company_id;
    let status = payload.status.trim().to_uppercase();

    let heartbeat_id = state
        .store
        .heartbeat_insert(
            company_id,
            payload.monitor_id,
            status.as_str(),
            payload.ping_ms,
            payload.msg.as_deref().map(str::trim).filter(|m| !m.is_empty()),
            payload.recorded_at,
        )
        .await
        .map_err(AppError::from)?;

    // Evaluasi rule `uptime.down` — value 1.0 saat DOWN, 0.0 saat UP.
    let value = if status == "DOWN" { 1.0 } else { 0.0 };
    let sample = alerts::MetricSample {
        metric: "uptime.down".into(),
        target_ref: payload.monitor_id.to_string(),
        kind: "uptime",
        host_id: None,
        container_ref: None,
        monitor_id: Some(payload.monitor_id),
        value,
        recorded_at: payload.recorded_at.unwrap_or_else(Utc::now),
    };
    let alert_fired = evaluate_alerts(&state, company_id, &[sample]).await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "status": "accepted",
            "data": { "heartbeat_id": heartbeat_id, "alert_events": alert_fired }
        })),
    )
        .into_response())
}

// ======================================================================
// Live logs push (HMAC) → broker SSE
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct LogsPayload {
    /// `docker_stack` | `nginx_vhost`.
    pub scope: String,
    /// Id stack compose / vhost nginx.
    pub reference: Uuid,
    #[serde(default)]
    pub source: Option<String>,
    /// `DEBUG` | `INFO` | `WARN` | `ERROR` (default INFO).
    #[serde(default)]
    pub level: Option<String>,
    /// Baris log (cap 100 baris, masing-masing ≤ 2000 karakter).
    pub lines: Vec<String>,
}

/// `POST /api/v1/agents/logs` — push baris log live (diteruskan ke
/// subscriber SSE `/api/v1/infra/logs/stream` milik company yang sama).
pub async fn logs_ingest(
    State(state): State<AppState>,
    request: AgentRequest<LogsPayload>,
) -> Result<Response, AppError> {
    let payload = request.body;
    let company_id = request.ctx.company_id;
    let scope = payload.scope.trim().to_owned();
    if !matches!(scope.as_str(), "docker_stack" | "nginx_vhost") {
        return Err(AppError::Validation("scope log tidak valid".into()));
    }
    let ref_table = match scope.as_str() {
        "docker_stack" => RefTable::ComposeStack,
        _ => RefTable::NginxVhost,
    };
    if !ref_in_company(state.store.pool(), company_id, ref_table, payload.reference)
        .await
        .map_err(AppError::from)?
    {
        return Err(AppError::Validation("referensi log tidak milik company aktif".into()));
    }
    if payload.lines.is_empty() || payload.lines.len() > 100 {
        return Err(AppError::Validation("lines wajib 1–100 baris".into()));
    }
    let level = payload
        .level
        .as_deref()
        .map(str::trim)
        .map(str::to_uppercase)
        .unwrap_or_else(|| "INFO".into());
    if !matches!(level.as_str(), "DEBUG" | "INFO" | "WARN" | "ERROR") {
        return Err(AppError::Validation("level log tidak valid".into()));
    }

    let source = payload
        .source
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("agent")
        .to_owned();

    let mut published = 0usize;
    for line in &payload.lines {
        let message: String = line.chars().take(2000).collect();
        if message.trim().is_empty() {
            continue;
        }
        state.logs.publish(LogEvent {
            ts: Utc::now(),
            scope: scope.clone(),
            company_id,
            reference: payload.reference,
            level: level.clone(),
            source: source.clone(),
            message,
        });
        published += 1;
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "status": "accepted", "data": { "published": published } })),
    )
        .into_response())
}
