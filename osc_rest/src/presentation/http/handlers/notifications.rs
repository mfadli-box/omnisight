//! Handler Wave 3 — Notification Channel CRUD (bab 5.8 Centralized
//! Notification Dispatcher): channel SMTP/Telegram/Webhook per company.
//!
//! Config (SMTP password, bot token, webhook URL) dienkripsi Envelope
//! AES-256-GCM sebelum persist; respons hanya memuat ringkasan ter-mask.
//! Pengiriman notifikasi dieksekusi asinkron oleh `flow_worker_agent`
//! (osc_rest hanya menyimpan konfigurasi channel — outbox polling).

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::application::notifications as usecases;
use crate::domain::model::ActivityLogData;
use crate::presentation::error::AppError;
use crate::presentation::http::handlers::files::FileListQuery;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ChannelCreateRequest {
    /// `SMTP_EMAIL` | `TELEGRAM` | `WEBHOOK`.
    pub channel_type: String,
    /// Config channel (secret di dalamnya dienkripsi server-side).
    pub config: Value,
    /// Kode event yang berlangganan, mis. `["alert.firing", "siem.critical"]`.
    #[serde(default)]
    pub event_filter: Vec<String>,
    #[serde(default = "default_true")]
    pub is_active: bool,
}

fn default_true() -> bool {
    true
}

/// `POST /api/v1/notifications/channels` — validasi + enkripsi + persist.
pub async fn create_channel(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<ChannelCreateRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;

    let validated = usecases::validate_channel(
        state.crypto.as_ref(),
        &payload.channel_type,
        &payload.config,
        &payload.event_filter,
    )
    .map_err(AppError::from)?;

    let channel_id = state
        .store
        .notif_channel_create(
            company_id,
            payload.channel_type.trim().to_uppercase().as_str(),
            validated.config_encrypted,
            &payload
                .event_filter
                .iter()
                .map(|e| e.trim().to_uppercase())
                .collect::<Vec<String>>(),
            payload.is_active,
        )
        .await
        .map_err(AppError::from)?;

    state
        .store
        .activity_log(ActivityLogData {
            company_id: Some(company_id),
            user_id: Some(ctx.user_id),
            action: "NOTIFICATION_CHANNEL_CREATE",
            entity_type: Some("notification_channel"),
            entity_id: Some(channel_id),
            ip_address: None,
            user_agent: None,
            detail: Some(json!({ "type": payload.channel_type })),
        })
        .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "status": "success",
            "data": { "id": channel_id, "config_summary": validated.summary }
        })),
    )
        .into_response())
}

/// `GET /api/v1/notifications/channels` — daftar channel (config masked).
pub async fn list_channels(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<FileListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let mut rows = state
        .store
        .notif_channels_list(company_id, query.limit.unwrap_or(50))
        .await
        .map_err(AppError::from)?;

    // Dekripsi → ringkasan ter-sanitasi (secret tidak pernah keluar).
    for row in &mut rows {
        let channel_type = row
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        if let Some(config) = row.get_mut("config")
            && let Ok(plaintext) = usecases::decrypt_config(state.crypto.as_ref(), config)
            && let Ok(summary) = usecases::validate_channel(
                state.crypto.as_ref(),
                &channel_type,
                &plaintext,
                &[],
            )
        {
            *config = summary.summary;
        }
    }

    Ok(Json(json!({ "status": "success", "data": { "channels": rows, "count": rows.len() } })))
}

/// `GET /api/v1/notifications/channels/{id}`.
pub async fn get_channel(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(channel_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let mut channel = state
        .store
        .notif_channel_get(company_id, channel_id)
        .await
        .map_err(AppError::from)?;
    let channel_type = channel
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();

    if let Some(config) = channel.get_mut("config")
        && let Ok(plaintext) = usecases::decrypt_config(state.crypto.as_ref(), config)
        && let Ok(summary) = usecases::validate_channel(state.crypto.as_ref(), &channel_type, &plaintext, &[])
    {
        *config = summary.summary;
    }

    Ok(Json(json!({ "status": "success", "data": channel })))
}

#[derive(Debug, Deserialize)]
pub struct ChannelUpdateRequest {
    #[serde(default)]
    pub config: Option<Value>,
    #[serde(default)]
    pub event_filter: Option<Vec<String>>,
    #[serde(default)]
    pub is_active: Option<bool>,
}

/// `PUT /api/v1/notifications/channels/{id}` — rotasi config opsional.
pub async fn update_channel(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(channel_id): Path<Uuid>,
    Json(payload): Json<ChannelUpdateRequest>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;

    // Config baru divalidasi+dienkripsi sesuai tipe channel tersimpan.
    let config_encrypted = match payload.config.as_ref() {
        None => None,
        Some(config) => {
            let current = state
                .store
                .notif_channel_get(company_id, channel_id)
                .await
                .map_err(AppError::from)?;
            let channel_type = current.get("type").and_then(Value::as_str).unwrap_or_default();
            let validated = usecases::validate_channel(
                state.crypto.as_ref(),
                channel_type,
                config,
                &[],
            )
            .map_err(AppError::from)?;
            Some(validated.config_encrypted)
        }
    };

    let event_filter = payload
        .event_filter
        .as_ref()
        .map(|filter| filter.iter().map(|e| e.trim().to_uppercase()).collect::<Vec<String>>());

    state
        .store
        .notif_channel_update(company_id, channel_id, config_encrypted, event_filter, payload.is_active)
        .await
        .map_err(AppError::from)?;

    state
        .store
        .activity_log(ActivityLogData {
            company_id: Some(company_id),
            user_id: Some(ctx.user_id),
            action: "NOTIFICATION_CHANNEL_UPDATE",
            entity_type: Some("notification_channel"),
            entity_id: Some(channel_id),
            ip_address: None,
            user_agent: None,
            detail: Some(json!({ "config_rotated": payload.config.is_some() })),
        })
        .await;

    get_channel(State(state), ctx, Path(channel_id)).await
}

/// `DELETE /api/v1/notifications/channels/{id}` — soft delete.
pub async fn delete_channel(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(channel_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    state
        .store
        .notif_channel_delete(company_id, channel_id)
        .await
        .map_err(AppError::from)?;

    state
        .store
        .activity_log(ActivityLogData {
            company_id: Some(company_id),
            user_id: Some(ctx.user_id),
            action: "NOTIFICATION_CHANNEL_DELETE",
            entity_type: Some("notification_channel"),
            entity_id: Some(channel_id),
            ip_address: None,
            user_agent: None,
            detail: None,
        })
        .await;

    Ok((
        StatusCode::OK,
        Json(json!({ "status": "success", "data": { "deleted": true } })),
    )
        .into_response())
}
