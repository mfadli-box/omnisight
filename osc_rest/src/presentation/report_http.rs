use std::sync::Arc;

use axum::{
    Extension, Json,
    body::Body,
    extract::{Path, State},
    http::header,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    application::{modules::Action, report},
    domain::AuthError,
    infrastructure::modules,
};

use super::auth_http::{ApiError, AppState, TenantTransaction};

#[derive(Clone, Copy)]
enum Format {
    Excel,
    Pdf,
}

impl Format {
    fn menu(self) -> &'static str {
        match self {
            Self::Excel => "RP01",
            Self::Pdf => "RP02",
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Excel => "xlsx",
            Self::Pdf => "pdf",
        }
    }

    fn download(self, id: Uuid, bytes: Vec<u8>) -> Response {
        let mime = match self {
            Self::Excel => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            Self::Pdf => "application/pdf",
        };
        (
            [
                (header::CONTENT_TYPE.as_str(), mime.to_owned()),
                (
                    header::CONTENT_DISPOSITION.as_str(),
                    format!(
                        "attachment; filename=\"omnisight-report.{}\"",
                        self.extension()
                    ),
                ),
                (
                    header::CACHE_CONTROL.as_str(),
                    "private, no-store".to_owned(),
                ),
                ("x-report-archive-id", id.to_string()),
            ],
            Body::from(bytes),
        )
            .into_response()
    }
}

struct Source {
    table: &'static str,
    menu: &'static str,
    columns: &'static str,
    filter: &'static str,
}

impl Source {
    fn parse(table: &str) -> Result<Self, AuthError> {
        let (table, menu, columns, filter) = match table {
            "osc_sop_document" => (
                "osc_sop_document",
                "KB01",
                "to_jsonb(t)-ARRAY['rustfs_object_key','markdown_content']",
                "t.is_active AND t.approval_status<>'ARCHIVED'",
            ),
            "osc_pam_session" => ("osc_pam_session", "OP01", "to_jsonb(t)", "t.is_active"),
            "osc_agent_node" => (
                "osc_agent_node",
                "CT01",
                "to_jsonb(t)-ARRAY['agent_secret_hash','credential_ref']",
                "t.is_active",
            ),
            "osc_activity_log" => ("osc_activity_log", "SA03", "to_jsonb(t)-'details'", "true"),
            _ => return Err(AuthError::InvalidInput),
        };
        Ok(Self {
            table,
            menu,
            columns,
            filter,
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PdfRequest {
    table_name: String,
}

pub(super) async fn export_excel(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path(table): Path<String>,
) -> Result<Response, ApiError> {
    generate(&state, &tenant, Source::parse(&table)?, Format::Excel).await
}

pub(super) async fn generate_pdf(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Json(input): Json<PdfRequest>,
) -> Result<Response, ApiError> {
    generate(
        &state,
        &tenant,
        Source::parse(&input.table_name)?,
        Format::Pdf,
    )
    .await
}

async fn generate(
    state: &AppState,
    tenant: &TenantTransaction,
    source: Source,
    format: Format,
) -> Result<Response, ApiError> {
    let company = modules::company(&tenant.claims)?;
    let area = tenant.claims.area_id;
    let mut guard = tenant.transaction.lock().await;
    let tx = guard.as_mut().ok_or(AuthError::Internal)?;
    modules::require(tx, &tenant.claims, area, format.menu(), Action::View).await?;
    modules::require(tx, &tenant.claims, area, format.menu(), Action::Create).await?;
    modules::require(tx, &tenant.claims, area, source.menu, Action::View).await?;

    let sql = format!(
        "SELECT {} FROM public.{} t WHERE t.company_id=$1 AND ($2::uuid IS NULL OR t.area_id=$2)
            AND {} ORDER BY t.id DESC LIMIT $3",
        source.columns, source.table, source.filter
    );
    let limit = match format {
        Format::Excel => 5000_i64,
        Format::Pdf => 500,
    };
    let rows: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(company)
        .bind(area)
        .bind(limit)
        .fetch_all(&mut **tx)
        .await
        .map_err(modules::database_error)?;
    let bytes = tokio::task::spawn_blocking(move || match format {
        Format::Excel => report::excel(&rows),
        Format::Pdf => Ok(report::pdf(
            &format!("OmniSight report - {}", source.table),
            &rows,
        )),
    })
    .await
    .map_err(|_| AuthError::Internal)??;

    let id = Uuid::new_v4();
    let extension = format.extension();
    let key = format!("reports/{company}/{id}.{extension}");
    sqlx::query(
        "INSERT INTO public.osc_report_archive(id,company_id,area_id,created_by,object_key,report_format,source_name)
         VALUES($1,$2,$3,$4,$5,upper($6),$7)"
    ).bind(id).bind(company).bind(area).bind(tenant.claims.sub).bind(&key).bind(extension).bind(source.table)
        .execute(&mut **tx).await.map_err(modules::database_error)?;
    modules::audit(
        tx,
        &tenant.claims,
        area,
        "REPORT_ARCHIVED",
        "osc_report_archive",
        id,
    )
    .await?;
    let response = format.download(id, bytes.clone());
    let mime = response.headers()[header::CONTENT_TYPE]
        .to_str()
        .map_err(|_| AuthError::Internal)?;
    state
        .storage
        .put(&key, bytes, mime)
        .await
        .map_err(|_| AuthError::DependencyUnavailable)?;
    tenant.uploaded_objects.lock().await.push(key);
    Ok(response)
}

pub(super) async fn download_report_archive(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let area = tenant.claims.area_id;
    let mut guard = tenant.transaction.lock().await;
    let tx = guard.as_mut().ok_or(AuthError::Internal)?;
    let (key, format, source): (String, String, String) = sqlx::query_as(
        "SELECT object_key,report_format,source_name FROM public.osc_report_archive
         WHERE id=$1 AND created_by=$2 AND company_id=$3 AND area_id IS NOT DISTINCT FROM $4 AND is_active"
    ).bind(id).bind(tenant.claims.sub).bind(modules::company(&tenant.claims)?).bind(area)
        .fetch_optional(&mut **tx).await.map_err(modules::database_error)?.ok_or(AuthError::NotFound)?;
    let format = match format.as_str() {
        "XLSX" => Format::Excel,
        "PDF" => Format::Pdf,
        _ => return Err(AuthError::NotFound.into()),
    };
    modules::require(tx, &tenant.claims, area, format.menu(), Action::View).await?;
    modules::require(
        tx,
        &tenant.claims,
        area,
        Source::parse(&source)?.menu,
        Action::View,
    )
    .await?;
    let bytes = state
        .storage
        .get(&key)
        .await
        .map_err(|_| AuthError::DependencyUnavailable)?;
    modules::audit(
        tx,
        &tenant.claims,
        area,
        "REPORT_DOWNLOADED",
        "osc_report_archive",
        id,
    )
    .await?;
    Ok(format.download(id, bytes))
}
