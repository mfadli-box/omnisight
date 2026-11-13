//! Handler DCIM & IPAM (NetBox): `/dcim/racks`, `/ipam/prefixes`,
//! `/ipam/addresses` — semua tenant-guarded + validasi koherensi app-level.

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::domain::filter;
use crate::presentation::error::AppError;
use crate::presentation::http::handlers::studio::ListQuery;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

fn parse_filter(raw: Option<&str>) -> Result<Option<crate::domain::filter::FilterNode>, AppError> {
    let Some(raw) = raw else { return Ok(None) };
    let value: Value = serde_json::from_str(raw)
        .map_err(|_| AppError::Validation("filter harus JSON valid".into()))?;
    filter::parse(&value).map_err(AppError::from)
}

/// `GET /api/v1/dcim/racks` — rak + okupansi unit.
pub async fn list_racks(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let filter = parse_filter(query.filter.as_deref())?;
    let rows = state
        .store
        .racks_list(
            company_id,
            filter.as_ref(),
            query.limit.unwrap_or(50),
            query.offset.unwrap_or(0),
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "racks": rows, "count": rows.len() }
    })))
}

/// `GET /api/v1/ipam/prefixes`.
pub async fn list_prefixes(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let filter = parse_filter(query.filter.as_deref())?;
    let rows = state
        .store
        .prefixes_list(
            company_id,
            filter.as_ref(),
            query.limit.unwrap_or(50),
            query.offset.unwrap_or(0),
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "prefixes": rows, "count": rows.len() }
    })))
}

#[derive(Debug, Deserialize)]
pub struct PrefixCreateRequest {
    pub prefix: String,
    #[serde(default = "default_prefix_status")]
    pub status: String,
    #[serde(default)]
    pub is_pool: bool,
    pub site_id: Option<Uuid>,
    pub vlan_id: Option<Uuid>,
}

fn default_prefix_status() -> String {
    "ACTIVE".into()
}

/// `POST /api/v1/ipam/prefixes` — validasi CIDR + overlap check app-level.
pub async fn create_prefix(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<PrefixCreateRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let prefix_id = state
        .store
        .prefix_create(
            company_id,
            payload.prefix.trim(),
            payload.status.trim(),
            payload.is_pool,
            payload.site_id,
            payload.vlan_id,
        )
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "status": "success", "data": { "id": prefix_id } })),
    )
        .into_response())
}

/// `GET /api/v1/ipam/addresses`.
pub async fn list_addresses(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let filter = parse_filter(query.filter.as_deref())?;
    let rows = state
        .store
        .addresses_list(
            company_id,
            filter.as_ref(),
            query.limit.unwrap_or(50),
            query.offset.unwrap_or(0),
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "addresses": rows, "count": rows.len() }
    })))
}

#[derive(Debug, Deserialize)]
pub struct AddressCreateRequest {
    pub address: String,
    #[serde(default = "default_prefix_status")]
    pub status: String,
    pub prefix_id: Option<Uuid>,
    pub interface_id: Option<Uuid>,
    #[serde(default)]
    pub is_gateway: bool,
    pub dns_name: Option<String>,
}

/// `POST /api/v1/ipam/addresses` — tenant match interface divalidasi.
pub async fn create_address(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<AddressCreateRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let address_id = state
        .store
        .address_create(crate::infrastructure::store::netbox::AddressNew {
            company_id,
            address: payload.address.trim(),
            status: payload.status.trim(),
            prefix_id: payload.prefix_id,
            interface_id: payload.interface_id,
            is_gateway: payload.is_gateway,
            dns_name: payload.dns_name.as_deref(),
        })
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "status": "success", "data": { "id": address_id } })),
    )
        .into_response())
}
