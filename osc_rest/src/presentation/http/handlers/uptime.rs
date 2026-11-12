//! Handler Wave 2 — Synthetic Uptime & Status Pages:
//! - CRUD `/api/v1/monitors` (JWT, tenant-guarded).
//! - CRUD `/api/v1/status-pages` (JWT) + monitor attach.
//! - `GET /api/v1/status-pages/{slug}` — publik (tanpa auth).

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::presentation::error::AppError;
use crate::presentation::http::handlers::studio::ListQuery;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

// ======================================================================
// Monitors (JWT)
// ======================================================================

/// `GET /api/v1/monitors`.
pub async fn list_monitors(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let rows = state
        .store
        .monitors_list(company_id, query.limit.unwrap_or(100), query.offset.unwrap_or(0))
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": { "monitors": rows, "count": rows.len() } })))
}

#[derive(Debug, Deserialize)]
pub struct MonitorCreateRequest {
    pub name: String,
    /// HTTP | HTTPS | TCP | ICMP | DNS | KEYWORD | PUSH
    pub monitor_type: String,
    pub target: String,
    /// Config polymorphic per tipe (mis. `keyword`, `headers`, `dns_resolver`).
    #[serde(default)]
    pub config: Option<Value>,
    #[serde(default = "default_interval")]
    pub interval_seconds: i32,
    #[serde(default = "default_retries")]
    pub retries: i32,
    #[serde(default)]
    pub asset_id: Option<Uuid>,
}

fn default_interval() -> i32 {
    60
}
fn default_retries() -> i32 {
    1
}

/// Validasi target per tipe monitor (anti-SSRF ringan: HTTP tanpa userinfo;
/// pemantauan intranet adalah tujuan produk — range privat diizinkan).
fn validate_target(monitor_type: &str, target: &str, config: Option<&Value>) -> Result<(), AppError> {
    if target.is_empty() || target.len() > 500 {
        return Err(AppError::Validation("target wajib 1–500 karakter".into()));
    }
    match monitor_type {
        "HTTP" | "HTTPS" | "KEYWORD" => {
            let url = reqwest::Url::parse(target)
                .map_err(|_| AppError::Validation("target harus URL http(s) valid".into()))?;
            if url.scheme() != if monitor_type == "HTTPS" { "https" } else { "http" } {
                return Err(AppError::Validation(format!(
                    "scheme target harus {monitor_type} sesuai tipe monitor"
                )));
            }
            if !url.username().is_empty() || url.password().is_some() {
                return Err(AppError::Validation("target tidak boleh memuat userinfo".into()));
            }
            if url.host_str().is_none() {
                return Err(AppError::Validation("target harus memuat host".into()));
            }
            if monitor_type == "KEYWORD"
                && config
                    .and_then(|c| c.get("keyword"))
                    .and_then(Value::as_str)
                    .is_none_or(|k| k.trim().is_empty())
            {
                return Err(AppError::Validation("monitor KEYWORD wajib memuat config.keyword".into()));
            }
        }
        "TCP" => {
            let has_port = target.rsplit(':').next().is_some_and(|p| p.parse::<u16>().is_ok());
            let host_part = target.rsplit_once(':').map(|(h, _)| h).unwrap_or(target);
            if !has_port || host_part.is_empty() {
                return Err(AppError::Validation("target TCP harus host:port".into()));
            }
        }
        "DNS" => {
            if target.contains('/') || target.contains(':') {
                return Err(AppError::Validation("target DNS harus hostname polos".into()));
            }
        }
        "ICMP" | "PUSH" => {
            if target.contains("://") {
                return Err(AppError::Validation("target tidak boleh memuat URL scheme".into()));
            }
        }
        other => {
            return Err(AppError::Validation(format!("tipe monitor tidak valid: {other}")));
        }
    }
    Ok(())
}

/// `POST /api/v1/monitors` — tipe PUSH mengembalikan `push_token` (sekali).
pub async fn create_monitor(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<MonitorCreateRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let monitor_type = payload.monitor_type.trim().to_uppercase();
    let name = payload.name.trim();
    if name.is_empty() || name.len() > 150 {
        return Err(AppError::Validation("name wajib 1–150 karakter".into()));
    }
    let interval = payload.interval_seconds.clamp(10, 86_400);
    let retries = payload.retries.clamp(0, 10);
    validate_target(&monitor_type, payload.target.trim(), payload.config.as_ref())?;

    let (monitor_id, push_token) = state
        .store
        .monitor_create(
            company_id,
            crate::infrastructure::store::uptime::MonitorNew {
                name,
                monitor_type: &monitor_type,
                target: payload.target.trim(),
                config: payload.config,
                interval_seconds: interval,
                retries,
                asset_id: payload.asset_id,
            },
        )
        .await
        .map_err(AppError::from)?;

    let mut data = json!({ "id": monitor_id });
    if let Some(token) = push_token {
        data["push_token"] = json!(token);
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({ "status": "success", "data": data })),
    )
        .into_response())
}

/// `GET /api/v1/monitors/{id}`.
pub async fn get_monitor(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(monitor_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let monitor = state
        .store
        .monitor_get(company_id, monitor_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": monitor })))
}

#[derive(Debug, Deserialize)]
pub struct MonitorUpdateRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub config: Option<Value>,
    #[serde(default)]
    pub interval_seconds: Option<i32>,
    #[serde(default)]
    pub retries: Option<i32>,
    #[serde(default)]
    pub is_active: Option<bool>,
}

/// `PUT /api/v1/monitors/{id}` — update monitor (tanpa rotasi push token).
pub async fn update_monitor(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(monitor_id): Path<Uuid>,
    Json(payload): Json<MonitorUpdateRequest>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let name = payload.name.as_deref().map(str::trim).filter(|n| !n.is_empty());
    if let Some(n) = name
        && n.len() > 150
    {
        return Err(AppError::Validation("name maksimal 150 karakter".into()));
    }
    let target = payload.target.as_deref().map(str::trim).filter(|t| !t.is_empty());
    if let (Some(t), Some(current)) = (target, state.store.monitor_get(company_id, monitor_id).await.ok())
        && let Some(monitor_type) = current["type"].as_str()
    {
        validate_target(monitor_type, t, payload.config.as_ref())?;
    }
    let interval = payload.interval_seconds.map(|v| v.clamp(10, 86_400));
    let retries = payload.retries.map(|v| v.clamp(0, 10));

    state
        .store
        .monitor_update(
            company_id,
            monitor_id,
            crate::infrastructure::store::uptime::MonitorPatch {
                name,
                target,
                config: payload.config,
                interval_seconds: interval,
                retries,
                is_active: payload.is_active,
            },
        )
        .await
        .map_err(AppError::from)?;

    let monitor = state
        .store
        .monitor_get(company_id, monitor_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": monitor })))
}

/// `DELETE /api/v1/monitors/{id}` — soft delete.
pub async fn delete_monitor(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(monitor_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    state
        .store
        .monitor_delete(company_id, monitor_id)
        .await
        .map_err(AppError::from)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

// ======================================================================
// Status pages (JWT)
// ======================================================================

/// `GET /api/v1/status-pages`.
pub async fn list_status_pages(
    State(state): State<AppState>,
    ctx: AuthContext,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let rows = state.store.status_pages_list(company_id).await.map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": { "pages": rows, "count": rows.len() } })))
}

#[derive(Debug, Deserialize)]
pub struct StatusPageCreateRequest {
    pub slug: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub is_published: bool,
    /// Monitor yang ditampilkan (id, sort order).
    #[serde(default)]
    pub monitor_ids: Vec<Uuid>,
}

fn validate_slug(slug: &str) -> Result<(), AppError> {
    let valid = !slug.is_empty()
        && slug.len() <= 100
        && slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !valid {
        return Err(AppError::Validation(
            "slug wajib 1–100 karakter [a-z0-9-] (anti path traversal)".into(),
        ));
    }
    Ok(())
}

/// `POST /api/v1/status-pages`.
pub async fn create_status_page(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<StatusPageCreateRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let slug = payload.slug.trim().to_lowercase();
    validate_slug(&slug)?;
    let title = payload.title.trim();
    if title.is_empty() || title.len() > 150 {
        return Err(AppError::Validation("title wajib 1–150 karakter".into()));
    }
    let description = payload.description.as_deref().map(str::trim).filter(|d| !d.is_empty());

    let page_id = state
        .store
        .status_page_create(company_id, &slug, title, description, payload.is_published)
        .await
        .map_err(AppError::from)?;
    if !payload.monitor_ids.is_empty() {
        state
            .store
            .status_page_monitors_set(company_id, page_id, &payload.monitor_ids.iter().enumerate().map(|(idx, id)| (*id, idx as i32)).collect::<Vec<_>>())
            .await
            .map_err(AppError::from)?;
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({ "status": "success", "data": { "id": page_id, "slug": slug } })),
    )
        .into_response())
}

/// `GET /api/v1/status-pages/{id}`.
pub async fn get_status_page(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(page_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let page = state
        .store
        .status_page_get(company_id, page_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": page })))
}

#[derive(Debug, Deserialize)]
pub struct StatusPageUpdateRequest {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub is_published: Option<bool>,
    /// Bila di-set → ganti seluruh daftar monitor (m2m replace).
    #[serde(default)]
    pub monitor_ids: Option<Vec<Uuid>>,
}

/// `PUT /api/v1/status-pages/{id}`.
pub async fn update_status_page(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(page_id): Path<Uuid>,
    Json(payload): Json<StatusPageUpdateRequest>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let title = payload.title.as_deref().map(str::trim).filter(|t| !t.is_empty());
    let description = payload.description.as_deref().map(str::trim).filter(|d| !d.is_empty());

    state
        .store
        .status_page_update(company_id, page_id, title, description, payload.is_published)
        .await
        .map_err(AppError::from)?;
    if let Some(monitor_ids) = &payload.monitor_ids {
        state
            .store
            .status_page_monitors_set(
                company_id,
                page_id,
                &monitor_ids.iter().enumerate().map(|(idx, id)| (*id, idx as i32)).collect::<Vec<_>>(),
            )
            .await
            .map_err(AppError::from)?;
    }

    let page = state
        .store
        .status_page_get(company_id, page_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": page })))
}

/// `DELETE /api/v1/status-pages/{id}` — soft delete.
pub async fn delete_status_page(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(page_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    state
        .store
        .status_page_delete(company_id, page_id)
        .await
        .map_err(AppError::from)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

// ======================================================================
// Status page publik (tanpa auth)
// ======================================================================

/// `GET /api/v1/status-pages/{slug}` — PUBLIK.
/// Hanya halaman `is_published`; tidak mengekspos config/push token.
pub async fn public_status_page(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<Value>, AppError> {
    let page = state
        .store
        .status_page_public(&slug)
        .await
        .map_err(AppError::from)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(json!({ "status": "success", "data": page })))
}
