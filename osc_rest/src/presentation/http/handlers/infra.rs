//! Handler Wave 2 — Docker Stack & Nginx Reverse Proxy Control Plane:
//! - CRUD `/api/v1/docker/stacks` (+ dispatch `up|down|pull|restart`).
//! - CRUD `/api/v1/nginx/vhosts` (+ dispatch `test & reload`).
//! - `GET /api/v1/infra/logs/stream` — live logs via SSE.
//!
//! Pipeline (pola Nginx UI/Dockge): validasi app-level → backup snapshot
//! RustFS → dispatch antrean (activity_logs outbox) → agent `infra_control`
//! mengeksekusi → API tidak pernah memanggil shell langsung (zero command
//! injection surface). Semua endpoint tenant-guarded (`active_company_id`).

use std::time::Duration;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::application::infra_validate;
use crate::domain::model::ActivityLogData;
use crate::infrastructure::logstream::LogEvent;
use crate::infrastructure::store::infra::STACK_COMMANDS;
use crate::presentation::error::AppError;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

// ======================================================================
// Docker hosts & nginx nodes (referensi)
// ======================================================================

/// `GET /api/v1/docker/hosts` — daftar host untuk pilihan stack.
pub async fn list_docker_hosts(
    State(state): State<AppState>,
    ctx: AuthContext,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let rows = state.store.docker_hosts_list(company_id).await.map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": { "hosts": rows, "count": rows.len() } })))
}

/// `GET /api/v1/nginx/nodes` — daftar node untuk pilihan vhost.
pub async fn list_nginx_nodes(
    State(state): State<AppState>,
    ctx: AuthContext,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let rows = state.store.nginx_nodes_list(company_id).await.map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": { "nodes": rows, "count": rows.len() } })))
}

// ======================================================================
// Docker stacks CRUD
// ======================================================================

/// `GET /api/v1/docker/stacks?docker_host_id=…`.
pub async fn list_stacks(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<StackListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let rows = state
        .store
        .stacks_list(company_id, query.docker_host_id, query.limit.unwrap_or(100), query.offset.unwrap_or(0))
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": { "stacks": rows, "count": rows.len() } })))
}

#[derive(Debug, Deserialize)]
pub struct StackListQuery {
    #[serde(default)]
    pub docker_host_id: Option<Uuid>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct StackCreateRequest {
    pub docker_host_id: Uuid,
    /// Nama project compose (`UNIQUE (docker_host_id, name)`).
    pub name: String,
    /// Path absolut host (anti path traversal — divalidasi app-level).
    pub working_dir: String,
    /// Isi `compose.yaml` penuh.
    pub compose_content: String,
    /// Env override plaintext — dienkripsi Envelope AES-256-GCM sebelum disimpan.
    #[serde(default)]
    pub env: Option<String>,
}

/// `POST /api/v1/docker/stacks` — validasi compose + working dir.
pub async fn create_stack(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<StackCreateRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let name = payload.name.trim();
    if name.is_empty() || name.len() > 150 || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(AppError::Validation(
            "name wajib 1–150 karakter [a-zA-Z0-9_-] (nama project compose)".into(),
        ));
    }
    let working_dir = infra_validate::validate_working_dir(&payload.working_dir)
        .map_err(AppError::Validation)?;
    infra_validate::validate_compose(&payload.compose_content).map_err(AppError::Validation)?;
    let env_encrypted = match payload.env.as_deref() {
        None => None,
        Some("") => None,
        Some(env) => {
            Some(state.crypto.envelope_encrypt(env.as_bytes()).map_err(AppError::from)?)
        }
    };

    let stack_id = state
        .store
        .stack_create(crate::infrastructure::store::infra::StackNew {
            company_id,
            docker_host_id: payload.docker_host_id,
            name,
            working_dir: working_dir.as_str(),
            compose_content: payload.compose_content.as_str(),
            env_encrypted,
        })
        .await
        .map_err(AppError::from)?;

    state.store.activity_log(ActivityLogData {
        company_id: Some(company_id),
        user_id: Some(ctx.user_id),
        action: "COMPOSE_STACK_CREATE",
        entity_type: Some("compose_stack"),
        entity_id: Some(stack_id),
        ip_address: None,
        user_agent: None,
        detail: Some(json!({ "name": name, "working_dir": working_dir })),
    })
    .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "status": "success", "data": { "id": stack_id } })),
    )
        .into_response())
}

/// `GET /api/v1/docker/stacks/{id}` — termasuk compose_content
/// (env ciphertext tidak pernah diekspos).
pub async fn get_stack(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(stack_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let stack = state.store.stack_get(company_id, stack_id).await.map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": stack })))
}

#[derive(Debug, Deserialize)]
pub struct StackUpdateRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub working_dir: Option<String>,
    #[serde(default)]
    pub compose_content: Option<String>,
    /// None = biarkan; string kosong = hapus; isi = re-encrypt.
    #[serde(default)]
    pub env: Option<String>,
    #[serde(default)]
    pub is_active: Option<bool>,
}

/// `PUT /api/v1/docker/stacks/{id}` — snapshot compose lama ke RustFS
/// SEBELUM overwrite (drift/journal rollback pola Arcane/Dockge).
pub async fn update_stack(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(stack_id): Path<Uuid>,
    Json(payload): Json<StackUpdateRequest>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let working_dir = match &payload.working_dir {
        Some(raw) => Some(infra_validate::validate_working_dir(raw).map_err(AppError::Validation)?),
        None => None,
    };
    if let Some(content) = &payload.compose_content {
        infra_validate::validate_compose(content).map_err(AppError::Validation)?;
    }
    let env_encrypted = match payload.env.as_deref() {
        None => None,
        Some("") => Some(None),
        Some(env) => Some(Some(state.crypto.envelope_encrypt(env.as_bytes()).map_err(AppError::from)?)),
    };

    // Backup snapshot konten lama (best-effort kegagalan = 500 generik).
    if payload.compose_content.is_some() || payload.env.is_some() {
        backup_stack_compose(&state, company_id, stack_id, &ctx).await?;
    }

    state
        .store
        .stack_update(
            company_id,
            stack_id,
            crate::infrastructure::store::infra::StackPatch {
                name: payload.name.as_deref().map(str::trim).filter(|n| !n.is_empty()),
                working_dir: working_dir.as_deref(),
                compose_content: payload.compose_content.as_deref(),
                env_encrypted,
                is_active: payload.is_active,
            },
        )
        .await
        .map_err(AppError::from)?;

    let stack = state.store.stack_get(company_id, stack_id).await.map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": stack })))
}

/// `DELETE /api/v1/docker/stacks/{id}` — soft delete.
pub async fn delete_stack(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(stack_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    state.store.stack_delete(company_id, stack_id).await.map_err(AppError::from)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// Upload snapshot compose ke RustFS + registry `file_assets` (CONFIG_BACKUP).
async fn backup_stack_compose(
    state: &AppState,
    company_id: Uuid,
    stack_id: Uuid,
    ctx: &AuthContext,
) -> Result<(), AppError> {
    let content = state
        .store
        .stack_compose_content(company_id, stack_id)
        .await
        .map_err(AppError::from)?;
    let sha256 = crate::infrastructure::crypto::sha256_hex(content.as_bytes());
    let size_bytes = content.len() as i64;
    let object_key = format!(
        "config-backups/{company_id}/compose/{stack_id}/{}.yaml",
        Utc::now().timestamp_millis()
    );
    state
        .storage
        .put_object(&object_key, content.into_bytes(), "application/yaml")
        .await
        .map_err(AppError::from)?;
    state
        .store
        .stack_set_backup(company_id, stack_id, &object_key)
        .await
        .map_err(AppError::from)?;
    state
        .store
        .file_create(crate::infrastructure::store::files::FileMetaNew {
            company_id,
            category: "CONFIG_BACKUP",
            bucket: state.storage.bucket().to_owned(),
            object_key,
            file_name: format!("compose-{stack_id}.yaml"),
            mime_type: Some("application/yaml".into()),
            size_bytes,
            sha256: Some(sha256),
            uploaded_by_user_id: Some(ctx.user_id),
        })
        .await
        .map_err(AppError::from)?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct StackDispatchRequest {
    /// `up` | `down` | `pull` | `restart`.
    pub command: String,
}

/// `POST /api/v1/docker/stacks/{id}/dispatch` — 202 QUEUED.
/// Antrean dieksekusi agent `infra_control` (poll outbox activity_logs);
/// bukan exec shell dari API.
pub async fn dispatch_stack(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(stack_id): Path<Uuid>,
    Json(payload): Json<StackDispatchRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let command = payload.command.trim().to_lowercase();
    if !STACK_COMMANDS.contains(&command.as_str()) {
        return Err(AppError::Validation(format!(
            "command tidak valid — salah satu dari {}",
            STACK_COMMANDS.join("|")
        )));
    }

    // Snapshot sebelum mutasi stack (up/pull mengganti state runtime).
    if matches!(command.as_str(), "up" | "restart") {
        backup_stack_compose(&state, company_id, stack_id, &ctx).await?;
    }

    let dispatch_ref = Uuid::now_v7();
    state.store.activity_log(ActivityLogData {
        company_id: Some(company_id),
        user_id: Some(ctx.user_id),
        action: "DOCKER_STACK_DISPATCH",
        entity_type: Some("compose_stack"),
        entity_id: Some(stack_id),
        ip_address: None,
        user_agent: None,
        detail: Some(json!({
            "command": command,
            "dispatch_ref": dispatch_ref,
            "by": ctx.user_id,
        })),
    })
    .await;

    if command == "up" {
        state.store.stack_mark_deployed(company_id, stack_id).await.map_err(AppError::from)?;
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "status": "queued",
            "data": { "dispatch_ref": dispatch_ref, "command": command, "stack_id": stack_id }
        })),
    )
        .into_response())
}

// ======================================================================
// Nginx vhosts CRUD
// ======================================================================

/// `GET /api/v1/nginx/vhosts?nginx_node_id=…`.
pub async fn list_vhosts(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<VhostListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let rows = state
        .store
        .vhosts_list(company_id, query.nginx_node_id, query.limit.unwrap_or(100), query.offset.unwrap_or(0))
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": { "vhosts": rows, "count": rows.len() } })))
}

#[derive(Debug, Deserialize)]
pub struct VhostListQuery {
    #[serde(default)]
    pub nginx_node_id: Option<Uuid>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct VhostCreateRequest {
    pub nginx_node_id: Uuid,
    /// Domain / server_name (UNIQUE per node+port).
    pub server_name: String,
    #[serde(default = "default_port")]
    pub listen_port: i32,
    /// Isi server block penuh (`server { … }`).
    pub config_content: String,
    #[serde(default)]
    pub ssl_cert_path: Option<String>,
    #[serde(default)]
    pub ssl_key_path: Option<String>,
}

fn default_port() -> i32 {
    80
}

/// `POST /api/v1/nginx/vhosts` — validasi blok config (brace seimbang,
/// `server {` wajib, `include` anti traversal).
pub async fn create_vhost(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<VhostCreateRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let server_name = payload.server_name.trim();
    if server_name.is_empty() || server_name.len() > 255 {
        return Err(AppError::Validation("server_name wajib 1–255 karakter".into()));
    }
    infra_validate::validate_nginx_config(&payload.config_content).map_err(AppError::Validation)?;

    let vhost_id = state
        .store
        .vhost_create(crate::infrastructure::store::infra::VhostNew {
            company_id,
            nginx_node_id: payload.nginx_node_id,
            server_name,
            listen_port: payload.listen_port,
            config_content: payload.config_content.as_str(),
            ssl_cert_path: payload.ssl_cert_path.as_deref().map(str::trim).filter(|p| !p.is_empty()),
            ssl_key_path: payload.ssl_key_path.as_deref().map(str::trim).filter(|p| !p.is_empty()),
        })
        .await
        .map_err(AppError::from)?;

    state.store.activity_log(ActivityLogData {
        company_id: Some(company_id),
        user_id: Some(ctx.user_id),
        action: "NGINX_VHOST_CREATE",
        entity_type: Some("nginx_vhost"),
        entity_id: Some(vhost_id),
        ip_address: None,
        user_agent: None,
        detail: Some(json!({ "server_name": server_name, "listen_port": payload.listen_port })),
    })
    .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "status": "success", "data": { "id": vhost_id } })),
    )
        .into_response())
}

/// `GET /api/v1/nginx/vhosts/{id}`.
pub async fn get_vhost(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(vhost_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let vhost = state.store.vhost_get(company_id, vhost_id).await.map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": vhost })))
}

#[derive(Debug, Deserialize)]
pub struct VhostUpdateRequest {
    #[serde(default)]
    pub server_name: Option<String>,
    #[serde(default)]
    pub listen_port: Option<i32>,
    #[serde(default)]
    pub config_content: Option<String>,
    #[serde(default)]
    pub ssl_cert_path: Option<String>,
    #[serde(default)]
    pub ssl_key_path: Option<String>,
}

/// `PUT /api/v1/nginx/vhosts/{id}` — config lama dibackup ke RustFS dulu;
/// status kembali DRAFT sampai dispatch sukses.
pub async fn update_vhost(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(vhost_id): Path<Uuid>,
    Json(payload): Json<VhostUpdateRequest>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    if let Some(content) = &payload.config_content {
        infra_validate::validate_nginx_config(content).map_err(AppError::Validation)?;
        // Backup konten lama sebelum overwrite (pipeline nginx-ui).
        backup_vhost_config(&state, company_id, vhost_id, &ctx).await?;
    }

    state
        .store
        .vhost_update(
            vhost_id,
            company_id,
            crate::infrastructure::store::infra::VhostPatch {
                server_name: payload.server_name.as_deref().map(str::trim).filter(|s| !s.is_empty()),
                listen_port: payload.listen_port,
                config_content: payload.config_content.as_deref(),
                ssl_cert_path: payload.ssl_cert_path.as_deref().map(str::trim).filter(|p| !p.is_empty()),
                ssl_key_path: payload.ssl_key_path.as_deref().map(str::trim).filter(|p| !p.is_empty()),
            },
        )
        .await
        .map_err(AppError::from)?;

    let vhost = state.store.vhost_get(company_id, vhost_id).await.map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": vhost })))
}

/// `DELETE /api/v1/nginx/vhosts/{id}` — soft delete.
pub async fn delete_vhost(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(vhost_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    state.store.vhost_delete(company_id, vhost_id).await.map_err(AppError::from)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// Upload snapshot config nginx ke RustFS + registry CONFIG_BACKUP.
async fn backup_vhost_config(
    state: &AppState,
    company_id: Uuid,
    vhost_id: Uuid,
    ctx: &AuthContext,
) -> Result<(), AppError> {
    let content = state
        .store
        .vhost_config_content(company_id, vhost_id)
        .await
        .map_err(AppError::from)?;
    let object_key = format!("config-backups/{company_id}/nginx/{vhost_id}/{}.conf", Utc::now().timestamp_millis());
    let sha256 = crate::infrastructure::crypto::sha256_hex(content.as_bytes());
    state
        .storage
        .put_object(&object_key, content.into_bytes(), "text/plain")
        .await
        .map_err(AppError::from)?;
    state
        .store
        .vhost_set_backup(company_id, vhost_id, &object_key)
        .await
        .map_err(AppError::from)?;
    state
        .store
        .file_create(crate::infrastructure::store::files::FileMetaNew {
            company_id,
            category: "CONFIG_BACKUP",
            bucket: state.storage.bucket().to_owned(),
            object_key,
            file_name: format!("vhost-{vhost_id}.conf"),
            mime_type: Some("text/plain".into()),
            size_bytes: 0,
            sha256: Some(sha256),
            uploaded_by_user_id: Some(ctx.user_id),
        })
        .await
        .map_err(AppError::from)?;
    Ok(())
}

/// `POST /api/v1/nginx/vhosts/{id}/dispatch` — 202 QUEUED; agent menjalankan
/// `nginx -t` lalu reload (status TESTING saat antre, APPLIED/FAILED hasil ack).
pub async fn dispatch_vhost(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(vhost_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;

    // Re-validasi config tersimpan sebelum dispatch.
    let content = state
        .store
        .vhost_config_content(company_id, vhost_id)
        .await
        .map_err(AppError::from)?;
    infra_validate::validate_nginx_config(&content).map_err(AppError::Validation)?;

    backup_vhost_config(&state, company_id, vhost_id, &ctx).await?;
    state
        .store
        .vhost_set_status(company_id, vhost_id, "TESTING", None)
        .await
        .map_err(AppError::from)?;

    let dispatch_ref = Uuid::now_v7();
    state.store.activity_log(ActivityLogData {
        company_id: Some(company_id),
        user_id: Some(ctx.user_id),
        action: "NGINX_VHOST_DISPATCH",
        entity_type: Some("nginx_vhost"),
        entity_id: Some(vhost_id),
        ip_address: None,
        user_agent: None,
        detail: Some(json!({
            "command": "test_reload",
            "dispatch_ref": dispatch_ref,
            "by": ctx.user_id,
        })),
    })
    .await;

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "status": "queued",
            "data": { "dispatch_ref": dispatch_ref, "command": "test_reload", "vhost_id": vhost_id }
        })),
    )
        .into_response())
}

// ======================================================================
// Live logs — SSE
// ======================================================================

#[derive(Debug, Deserialize)]
pub struct LogStreamQuery {
    /// `docker_stack` | `nginx_vhost` (opsional — bila kosong semua scope).
    #[serde(default)]
    pub scope: Option<String>,
    /// Filter id stack/vhost (opsional).
    #[serde(default)]
    pub reference: Option<Uuid>,
}

/// Filter event SSE: company_id wajib; scope/reference opsional.
struct LogFilter {
    company_id: Uuid,
    scope: Option<String>,
    reference: Option<Uuid>,
}

impl LogFilter {
    fn matches(&self, event: &LogEvent) -> bool {
        event.company_id == self.company_id
            && self.scope.as_deref().is_none_or(|s| event.scope == s)
            && self.reference.is_none_or(|r| event.reference == r)
    }
}

/// Adapter broadcast → SSE: memfilter per tenant + scope, memetakan
/// `Lagged` (subscriber lambat) menjadi event `lagged` alih-alih error.
struct SseStream {
    inner: tokio_stream::wrappers::BroadcastStream<LogEvent>,
    filter: LogFilter,
}

impl tokio_stream::Stream for SseStream {
    type Item = Result<Event, std::convert::Infallible>;

    fn poll_next(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        use std::pin::Pin;

        let this = std::pin::Pin::into_inner(self);
        loop {
            match Pin::new(&mut this.inner).poll_next(cx) {
                std::task::Poll::Ready(Some(Ok(event))) => {
                    if this.filter.matches(&event) {
                        let payload =
                            serde_json::to_string(&event).unwrap_or_else(|_| "{}".to_owned());
                        return std::task::Poll::Ready(Some(Ok(
                            Event::default().event("log").data(payload)
                        )));
                    }
                    // Event tenant/scope lain → lanjutkan polling.
                }
                // Subscriber lambat → tandai, jangan putuskan stream.
                std::task::Poll::Ready(Some(Err(
                    tokio_stream::wrappers::errors::BroadcastStreamRecvError::Lagged(_),
                ))) => {
                    return std::task::Poll::Ready(Some(Ok(
                        Event::default().event("lagged").data("{\"dropped\":true}")
                    )));
                }
                std::task::Poll::Ready(None) => return std::task::Poll::Ready(None),
                std::task::Poll::Pending => return std::task::Poll::Pending,
            }
        }
    }
}

/// `GET /api/v1/infra/logs/stream?scope=…&reference=…` — SSE live logs.
/// Content-Type: text/event-stream; keep-alive heartbeat 15 s.
pub async fn stream_logs(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<LogStreamQuery>,
) -> Result<impl IntoResponse, AppError> {
    let company_id = ctx.require_company()?;
    if let Some(scope) = &query.scope
        && !matches!(scope.as_str(), "docker_stack" | "nginx_vhost")
    {
        return Err(AppError::Validation("scope log tidak valid".into()));
    }

    let filter = LogFilter {
        company_id,
        scope: query.scope,
        reference: query.reference,
    };
    let stream = SseStream {
        inner: tokio_stream::wrappers::BroadcastStream::new(state.logs.subscribe()),
        filter,
    };

    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    ))
}
