use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    extract::{Path, Query},
    http::StatusCode,
    routing::get,
};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use uuid::Uuid;

use crate::{application::modules::Resource, domain::AuthError, infrastructure::modules};

use super::auth_http::{ApiError, AppState, TenantTransaction};

pub fn routes() -> Router<Arc<AppState>> {
    let mut router = Router::new();
    for (path, resource) in [
        ("nodes", Resource::Nodes),
        ("pam/targets", Resource::Targets),
        ("sop-documents", Resource::Documents),
        ("sop/documents", Resource::Documents),
        ("companies", Resource::Companies),
        ("areas", Resource::Areas),
        ("stores", Resource::Stores),
    ] {
        router = router.merge(
            Router::new()
                .route(&format!("/baas/v1/{path}"), get(list).post(create))
                .route(
                    &format!("/baas/v1/{path}/{{id}}"),
                    get(detail).patch(update).delete(remove),
                )
                .layer(Extension(resource)),
        );
    }
    router
        .route("/baas/v1/audit-logs", get(audit_logs))
        .route("/baas/v1/users", get(users).post(create_user))
        .route(
            "/baas/v1/users/{id}",
            get(user).patch(update_user).delete(remove_user),
        )
        .route("/baas/v1/roles", get(roles).post(create_role))
        .route("/baas/v1/company-menus", get(company_menus))
        .route(
            "/baas/v1/company-menus/{role_id}/{menu}",
            axum::routing::put(set_role_menu),
        )
        .route(
            "/baas/v1/companies/{id}/connector",
            get(connector).patch(update_connector),
        )
}

#[derive(Default, Deserialize)]
pub(super) struct Page {
    limit: Option<i64>,
    offset: Option<i64>,
}

impl Page {
    pub(super) fn bounds(self) -> Result<(i64, i64), AuthError> {
        let limit = self.limit.unwrap_or(50);
        let offset = self.offset.unwrap_or(0);
        if !(1..=200).contains(&limit) || offset < 0 {
            return Err(AuthError::InvalidInput);
        }
        Ok((limit, offset))
    }
}

pub(super) fn envelope(data: impl serde::Serialize) -> Json<Value> {
    Json(json!({"data":data,"meta":{"request_id":Uuid::new_v4()}}))
}

async fn list(
    Extension(tenant): Extension<TenantTransaction>,
    Extension(resource): Extension<Resource>,
    Query(page): Query<Page>,
) -> Result<Json<Value>, ApiError> {
    let (limit, offset) = page.bounds()?;
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    Ok(envelope(
        modules::read(db, &tenant.claims, resource, None, limit, offset).await?,
    ))
}

async fn detail(
    Extension(tenant): Extension<TenantTransaction>,
    Extension(resource): Extension<Resource>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    let row = modules::read(db, &tenant.claims, resource, Some(id), 1, 0)
        .await?
        .pop()
        .ok_or(AuthError::NotFound)?;
    Ok(envelope(row))
}

async fn create(
    Extension(tenant): Extension<TenantTransaction>,
    Extension(resource): Extension<Resource>,
    Json(input): Json<Map<String, Value>>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = resource.validate(input, true)?;
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    let row = modules::create(db, &tenant.claims, resource, input).await?;
    Ok((StatusCode::CREATED, envelope(row)))
}

async fn update(
    Extension(tenant): Extension<TenantTransaction>,
    Extension(resource): Extension<Resource>,
    Path(id): Path<Uuid>,
    Json(input): Json<Map<String, Value>>,
) -> Result<Json<Value>, ApiError> {
    let input = resource.validate(input, false)?;
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    Ok(envelope(
        modules::change(db, &tenant.claims, resource, id, Some(input)).await?,
    ))
}

async fn remove(
    Extension(tenant): Extension<TenantTransaction>,
    Extension(resource): Extension<Resource>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    Ok(envelope(
        modules::change(db, &tenant.claims, resource, id, None).await?,
    ))
}

use super::admin_http::{
    audit_logs, company_menus, connector, create_role, create_user, remove_user, roles,
    set_role_menu, update_connector, update_user, user, users,
};
