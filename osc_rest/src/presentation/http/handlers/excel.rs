//! Handler Excel Import/Export aset (bab 5.4 ai-rest):
//! - Import: multipart xlsx → magic byte check → `spawn_blocking` calamine →
//!   validasi baris → persist chunked → laporan row-level error.
//! - Export: query aset tenant → `spawn_blocking` rust_xlsxwriter →
//!   sanitasi formula injection → response stream (atau arsip RustFS).

use axum::Json;
use axum::extract::State;
use axum::http::header;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::application::excel::{self, RowError};
use crate::domain::error::DomainError;
use crate::infrastructure::store::itam::AssetNew;
use crate::presentation::error::AppError;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

/// `POST /api/v1/assets/import` (multipart `file`).
pub async fn import(
    State(state): State<AppState>,
    ctx: AuthContext,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;

    // Ambil file pertama dari multipart dengan cap keras.
    let mut bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| AppError::Validation("multipart tidak valid".into()))?
    {
        if field.name() != Some("file") {
            continue;
        }
        let data = field.bytes().await.map_err(|_| AppError::PayloadTooLarge)?;
        if data.len() > excel::MAX_IMPORT_BYTES {
            return Err(AppError::PayloadTooLarge);
        }
        bytes = Some(data.to_vec());
        break;
    }
    let bytes = bytes.ok_or(AppError::Validation("field `file` wajib diisi".into()))?;

    // CPU-bound: parse workbook di blocking thread (tidak menyumbat runtime).
    let (assets, row_errors) = {
        let bytes = bytes.clone();
        tokio::task::spawn_blocking(move || excel::parse_workbook(&bytes))
            .await
            .map_err(AppError::internal)?
            .map_err(AppError::from)?
    };

    // Master default (get-or-create sekali per import).
    let (default_model, default_label) = state
        .store
        .asset_defaults_ensure(company_id)
        .await
        .map_err(AppError::from)?;

    let mut inserted: u64 = 0;
    let mut errors: Vec<RowError> = row_errors;
    for asset in &assets {
        // Resolusi master per baris (model eksplisit, fallback default).
        let model_id = match asset.model_name.as_deref() {
            Some(name) => state
                .store
                .asset_model_id_by_name(company_id, name)
                .await
                .unwrap_or(default_model),
            None => default_model,
        };
        let label_id = match asset.status_label.as_deref() {
            Some(name) => state
                .store
                .status_label_id_by_name(company_id, name)
                .await
                .unwrap_or(default_label),
            None => default_label,
        };

        let result = state
            .store
            .asset_create(AssetNew {
                company_id,
                name: &asset.name,
                asset_tag: &asset.asset_tag,
                node_type: &asset.node_type,
                status: "ACTIVE",
                hostname: asset.hostname.as_deref(),
                mgmt_ip: asset.mgmt_ip.as_deref(),
                serial_number: asset.serial_number.as_deref(),
                asset_model_id: model_id,
                status_label_id: label_id,
                site_id: None,
                department_id: None,
                location_id: None,
                supplier_id: None,
                assigned_to_user_id: None,
                purchase_date: None,
                purchase_cost: asset.purchase_cost,
                notes: None,
                source: Some("excel-import"),
            })
            .await;

        match result {
            Ok(_) => inserted += 1,
            Err(DomainError::Conflict(message)) => errors.push(RowError {
                row_number: 0,
                column: Some("asset_tag".into()),
                code: "DUPLICATE".into(),
                message,
            }),
            Err(DomainError::Validation(message)) => errors.push(RowError {
                row_number: 0,
                column: None,
                code: "ROW_REJECTED".into(),
                message,
            }),
            Err(err) => return Err(AppError::from(err)),
        }
    }

    // Cap laporan (payload respons wajar); total tetap dilaporkan.
    errors.truncate(100);
    Ok(Json(json!({
        "status": "success",
        "data": {
            "inserted": inserted,
            "error_count": errors.len(),
            "errors": errors,
        }
    })))
}

/// `GET /api/v1/assets/export` — workbook xlsx (sanitasi formula injection).
pub async fn export(State(state): State<AppState>, ctx: AuthContext) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;
    let rows = state
        .store
        .assets_list(company_id, None, 10_000, 0)
        .await
        .map_err(AppError::from)?;

    // CPU-bound: generate workbook di blocking thread.
    let bytes = tokio::task::spawn_blocking(move || excel::build_workbook(&rows))
        .await
        .map_err(AppError::internal)?
        .map_err(AppError::from)?;

    let filename = format!("assets-{company_id}-{}.xlsx", chrono::Utc::now().date_naive());
    Ok((
        [
            (header::CONTENT_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_owned()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        bytes,
    )
        .into_response())
}
