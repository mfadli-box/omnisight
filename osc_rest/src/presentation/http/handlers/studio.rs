//! Handler Studio koleksi dinamis (Directus-style):
//! `/api/v1/collections`, `/collections/{c}/fields`, `/items/{c}` —
//! DDL runtime + filter AST terparameterisasi (domain::filter).

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashMap;

use uuid::Uuid;

use crate::domain::filter::{self, FilterNode};
use crate::infrastructure::store::studio::FieldInput;
use crate::presentation::error::AppError;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

fn created_response(body: Value) -> Response {
    (StatusCode::CREATED, Json(body)).into_response()
}

#[derive(Debug, Deserialize)]
pub struct CollectionRequest {
    pub collection: String,
    pub icon: Option<String>,
    pub note: Option<String>,
    #[serde(default)]
    pub fields: Vec<FieldSpec>,
}

#[derive(Debug, Deserialize)]
pub struct FieldSpec {
    pub field: String,
    #[serde(default)]
    pub is_required: bool,
    pub special: Option<String>,
}

/// `GET /api/v1/collections` — daftar koleksi metadata.
pub async fn list(State(state): State<AppState>) -> Result<Response, AppError> {
    let list = state.store.collection_list().await.map_err(AppError::from)?;
    Ok(Json(json!({
        "status": "success",
        "data": { "collections": list, "count": list.len() }
    }))
    .into_response())
}

/// `POST /api/v1/collections` — koleksi baru + DDL runtime (identifier
/// tervalidasi; seluruh nilai klien lewat bind/validasi ketat).
pub async fn create(
    State(state): State<AppState>,
    ctx: AuthContext,
    Json(payload): Json<CollectionRequest>,
) -> Result<Response, AppError> {
    // Hanya super admin / konteks company eksplisit boleh membuat koleksi.
    if !ctx.is_super_admin {
        ctx.require_company()?;
    }

    let fields: Vec<FieldInput> = payload
        .fields
        .iter()
        .map(|field| FieldInput {
            field: field.field.trim().to_ascii_lowercase(),
            is_required: field.is_required,
            special: field.special.clone(),
        })
        .collect();

    let row_out = state
        .store
        .collection_create(
            payload.collection.trim().to_ascii_lowercase().as_str(),
            payload.icon.as_deref(),
            payload.note.as_deref(),
            &fields,
        )
        .await
        .map_err(AppError::from)?;

    Ok(created_response(json!({
        "status": "success",
        "data": { "collection": row_out }
    })))
}

/// `GET /api/v1/collections/{collection}/fields`.
pub async fn fields(
    State(state): State<AppState>,
    Path(collection): Path<String>,
) -> Result<Response, AppError> {
    let collection_meta = state
        .store
        .collection_by_name(collection.trim().to_ascii_lowercase().as_str())
        .await
        .map_err(AppError::from)?
        .ok_or(AppError::NotFound)?;
    let collection_id = collection_meta
        .get("id")
        .and_then(Value::as_str)
        .and_then(|raw| Uuid::parse_str(raw).ok())
        .ok_or(AppError::NotFound)?;

    let list = state.store.field_list(collection_id).await.map_err(AppError::from)?;
    Ok(Json(json!({
        "status": "success",
        "data": { "fields": list }
    }))
    .into_response())
}

/// `POST /api/v1/collections/{collection}/fields`.
pub async fn add_field(
    State(state): State<AppState>,
    Path(collection): Path<String>,
    Json(payload): Json<FieldSpec>,
) -> Result<Response, AppError> {
    let collection_meta = state
        .store
        .collection_by_name(collection.trim().to_ascii_lowercase().as_str())
        .await
        .map_err(AppError::from)?
        .ok_or(AppError::NotFound)?;
    let collection_id = collection_meta
        .get("id")
        .and_then(Value::as_str)
        .and_then(|raw| Uuid::parse_str(raw).ok())
        .ok_or(AppError::NotFound)?;

    let row_out = state
        .store
        .field_add(
            collection_id,
            &FieldInput {
                field: payload.field.trim().to_ascii_lowercase(),
                is_required: payload.is_required,
                special: payload.special.clone(),
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(created_response(json!({
        "status": "success",
        "data": { "field": row_out }
    })))
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub filter: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// `GET /api/v1/items/{collection}?filter={...}` — filter AST terparameterisasi.
pub async fn items_list(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(collection): Path<String>,
    Query(query): Query<ListQuery>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let collection = collection.trim().to_ascii_lowercase();

    // Koleksi wajib terdaftar (metadata) — identifier tabel dari sana.
    let collection_meta = state
        .store
        .collection_by_name(&collection)
        .await
        .map_err(AppError::from)?
        .ok_or(AppError::NotFound)?;
    let collection_id = collection_meta
        .get("id")
        .and_then(Value::as_str)
        .and_then(|raw| Uuid::parse_str(raw).ok())
        .ok_or(AppError::NotFound)?;

    // Peta field server-side (DataKey) — field asing otomatis ditolak AST.
    let fields = state.store.field_map(collection_id).await.map_err(AppError::from)?;
    let filter_node = parse_filter(query.filter.as_deref())?;

    let rows = state
        .store
        .item_list(
            &collection,
            company_id,
            filter_node.as_ref(),
            &fields,
            query.limit.unwrap_or(50),
            query.offset.unwrap_or(0),
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "items": rows, "count": rows.len(), "collection": collection }
    }))
    .into_response())
}

#[derive(Debug, Deserialize)]
pub struct ItemCreateRequest {
    pub data: HashMap<String, Value>,
}

/// `POST /api/v1/items/{collection}` — data JSONB dengan validasi field.
pub async fn items_create(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(collection): Path<String>,
    Json(payload): Json<ItemCreateRequest>,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let collection = collection.trim().to_ascii_lowercase();
    let collection_meta = state
        .store
        .collection_by_name(&collection)
        .await
        .map_err(AppError::from)?
        .ok_or(AppError::NotFound)?;
    let collection_id = collection_meta
        .get("id")
        .and_then(Value::as_str)
        .and_then(|raw| Uuid::parse_str(raw).ok())
        .ok_or(AppError::NotFound)?;

    // Field asing ditolak; nilai bebas (JSONB bind — tidak pernah inline SQL).
    let fields = state.store.field_map(collection_id).await.map_err(AppError::from)?;
    let mut data = serde_json::Map::new();
    for (key, value) in payload.data {
        if !fields.contains_key(&key) {
            return Err(AppError::Validation(format!("field `{key}` tidak terdaftar pada koleksi")));
        }
        data.insert(key, value);
    }

    let row_out = state
        .store
        .item_insert(&collection, company_id, Value::Object(data))
        .await
        .map_err(AppError::from)?;

    Ok(created_response(json!({
        "status": "success",
        "data": { "item": row_out }
    })))
}

fn parse_filter(raw: Option<&str>) -> Result<Option<FilterNode>, AppError> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    let value: Value = serde_json::from_str(raw)
        .map_err(|_| AppError::Validation("filter harus JSON valid".into()))?;
    filter::parse(&value).map_err(AppError::from)
}
