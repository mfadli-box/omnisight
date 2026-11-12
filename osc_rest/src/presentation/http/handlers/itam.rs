//! Handler ITAM & Service Desk: `/assets` (+checkout/checkin atomik),
//! `/licenses`, `/tickets` (pola Snipe-IT/GLPI, bab 5.6 tenant guard).

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::domain::filter::{self, FilterNode};
use crate::infrastructure::store::itam::AssetNew;
use crate::presentation::error::AppError;
use crate::presentation::http::handlers::studio::ListQuery;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

fn parse_filter(raw: Option<&str>) -> Result<Option<FilterNode>, AppError> {
    let Some(raw) = raw else { return Ok(None) };
    let value: Value = serde_json::from_str(raw)
        .map_err(|_| AppError::Validation("filter harus JSON valid".into()))?;
    filter::parse(&value).map_err(AppError::from)
}

/// `GET /api/v1/assets?filter={...}` — daftar aset (tenant-guarded).
pub async fn list_assets(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let filter = parse_filter(query.filter.as_deref())?;
    let rows = state
        .store
        .assets_list(
            company_id,
            filter.as_ref(),
            query.limit.unwrap_or(50),
            query.offset.unwrap_or(0),
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "assets": rows, "count": rows.len() }
    })))
}

/// `GET /api/v1/assets/{id}`.
pub async fn get_asset(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(asset_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let asset = state
        .store
        .asset_get(company_id, asset_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(json!({ "status": "success", "data": { "asset": asset } })))
}

#[derive(Debug, Deserialize)]
pub struct AssetCreateRequest {
    pub name: String,
    pub asset_tag: String,
    #[serde(default = "default_node_type")]
    pub node_type: String,
    #[serde(default = "default_status")]
    pub status: String,
    pub hostname: Option<String>,
    pub mgmt_ip: Option<String>,
    pub serial_number: Option<String>,
    pub asset_model_id: Uuid,
    pub status_label_id: Uuid,
    pub site_id: Option<Uuid>,
    pub department_id: Option<Uuid>,
    pub location_id: Option<Uuid>,
    pub supplier_id: Option<Uuid>,
    pub assigned_to_user_id: Option<Uuid>,
    pub purchase_date: Option<NaiveDate>,
    pub purchase_cost: Option<f64>,
    pub notes: Option<String>,
}

fn default_node_type() -> String {
    "HOST".into()
}

fn default_status() -> String {
    "ACTIVE".into()
}

/// `POST /api/v1/assets` — buat aset (model & status label wajib satu tenant).
pub async fn create_asset(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<AssetCreateRequest>,
) -> Result<axum::response::Response, AppError> {
    let company_id = ctx.require_company()?;
    let asset_id = state
        .store
        .asset_create(AssetNew {
            company_id,
            name: payload.name.trim(),
            asset_tag: payload.asset_tag.trim(),
            node_type: payload.node_type.trim(),
            status: payload.status.trim(),
            hostname: payload.hostname.as_deref(),
            mgmt_ip: payload.mgmt_ip.as_deref(),
            serial_number: payload.serial_number.as_deref(),
            asset_model_id: payload.asset_model_id,
            status_label_id: payload.status_label_id,
            site_id: payload.site_id,
            department_id: payload.department_id,
            location_id: payload.location_id,
            supplier_id: payload.supplier_id,
            assigned_to_user_id: payload.assigned_to_user_id,
            purchase_date: payload.purchase_date,
            purchase_cost: payload.purchase_cost,
            notes: payload.notes.as_deref(),
            source: Some("manual"),
        })
        .await
        .map_err(AppError::from)?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({
            "status": "success",
            "data": { "id": asset_id }
        })),
    )
        .into_response())
}

#[derive(Debug, Deserialize)]
pub struct CheckoutRequest {
    pub target_user_id: Option<Uuid>,
    pub target_location_id: Option<Uuid>,
    pub expected_checkin_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// `POST /api/v1/assets/{id}/checkout` — atomik: FOR UPDATE + re-check
/// availability (pola Snipe-IT `lockForUpdate`).
pub async fn checkout(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(asset_id): Path<Uuid>,
    Json(payload): Json<CheckoutRequest>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    state
        .store
        .asset_checkout(
            company_id,
            asset_id,
            ctx.user_id,
            payload.target_user_id,
            payload.target_location_id,
            payload.expected_checkin_at,
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "asset_id": asset_id, "action": "CHECKOUT", "assigned_to": payload.target_user_id }
    })))
}

/// `POST /api/v1/assets/{id}/checkin`.
pub async fn checkin(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(asset_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    state
        .store
        .asset_checkin(company_id, asset_id, ctx.user_id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "asset_id": asset_id, "action": "CHECKIN" }
    })))
}

/// `GET /api/v1/licenses`.
pub async fn list_licenses(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let filter = parse_filter(query.filter.as_deref())?;
    let rows = state
        .store
        .licenses_list(
            company_id,
            filter.as_ref(),
            query.limit.unwrap_or(50),
            query.offset.unwrap_or(0),
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "licenses": rows, "count": rows.len() }
    })))
}

#[derive(Debug, Deserialize)]
pub struct TicketCreateRequest {
    pub title: String,
    pub description: Option<String>,
    #[serde(default = "default_ticket_type")]
    pub ticket_type: String,
    #[serde(default = "default_priority")]
    pub priority: String,
    pub assignee_user_id: Option<Uuid>,
    pub asset_id: Option<Uuid>,
    pub category_id: Option<Uuid>,
    pub due_at: Option<chrono::DateTime<chrono::Utc>>,
}

fn default_ticket_type() -> String {
    "INCIDENT".into()
}

fn default_priority() -> String {
    "MEDIUM".into()
}

/// `GET /api/v1/tickets`.
pub async fn list_tickets(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let filter = parse_filter(query.filter.as_deref())?;
    let rows = state
        .store
        .tickets_list(
            company_id,
            filter.as_ref(),
            query.limit.unwrap_or(50),
            query.offset.unwrap_or(0),
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "tickets": rows, "count": rows.len() }
    })))
}

/// `POST /api/v1/tickets` — kode per-company `TK-NNNNNN` app-generated.
pub async fn create_ticket(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<TicketCreateRequest>,
) -> Result<axum::response::Response, AppError> {
    let company_id = ctx.require_company()?;
    let ticket = state
        .store
        .ticket_create(crate::infrastructure::store::itam::TicketNew {
            company_id,
            title: payload.title.trim(),
            description: payload.description.as_deref(),
            ticket_type: payload.ticket_type.trim(),
            priority: payload.priority.trim(),
            requester_user_id: Some(ctx.user_id),
            assignee_user_id: payload.assignee_user_id,
            asset_id: payload.asset_id,
            category_id: payload.category_id,
            due_at: payload.due_at,
        })
        .await
        .map_err(AppError::from)?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "status": "success", "data": { "ticket": ticket } })),
    )
        .into_response())
}
