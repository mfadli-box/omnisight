use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::sync::Arc;
use uuid::Uuid;

use super::{
    auth_http::{ApiError, AppState, TenantTransaction},
    modules_http::{Page, envelope},
};
use crate::{
    application::{crypto, modules::Action},
    domain::AuthError,
    infrastructure::{admin, modules},
};

pub(super) async fn audit_logs(
    Extension(tenant): Extension<TenantTransaction>,
    Query(page): Query<Page>,
) -> Result<Json<Value>, ApiError> {
    let (limit, offset) = page.bounds()?;
    let mut guard = tenant.transaction.lock().await;
    Ok(envelope(
        admin::audit_logs(
            guard.as_mut().ok_or(AuthError::Internal)?,
            &tenant.claims,
            limit,
            offset,
        )
        .await?,
    ))
}

pub(super) async fn users(
    Extension(tenant): Extension<TenantTransaction>,
    Query(page): Query<Page>,
) -> Result<Json<Value>, ApiError> {
    let (limit, offset) = page.bounds()?;
    let mut guard = tenant.transaction.lock().await;
    Ok(envelope(
        admin::users(
            guard.as_mut().ok_or(AuthError::Internal)?,
            &tenant.claims,
            None,
            limit,
            offset,
        )
        .await?,
    ))
}

pub(super) async fn user(
    Extension(tenant): Extension<TenantTransaction>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    let row = admin::users(
        guard.as_mut().ok_or(AuthError::Internal)?,
        &tenant.claims,
        Some(id),
        1,
        0,
    )
    .await?
    .pop()
    .ok_or(AuthError::NotFound)?;
    Ok(envelope(row))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UserInput {
    username: String,
    full_name: String,
    email: Option<String>,
    password: String,
    role_id: Uuid,
    area_id: Option<Uuid>,
}

fn valid_text(value: &str, limit: usize) -> bool {
    !value.trim().is_empty() && value.len() <= limit && !value.chars().any(char::is_control)
}

fn valid_email(value: &str) -> bool {
    valid_text(value, 320)
        && !value.contains(char::is_whitespace)
        && value.split_once('@').is_some_and(|(local, host)| {
            !local.is_empty() && !host.is_empty() && !host.contains('@')
        })
}

pub(super) async fn create_user(
    Extension(tenant): Extension<TenantTransaction>,
    Json(input): Json<UserInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if !valid_text(&input.username, 128)
        || !valid_text(&input.full_name, 200)
        || input
            .email
            .as_deref()
            .is_some_and(|email| !valid_email(email))
        || !(12..=1024).contains(&input.password.len())
    {
        return Err(AuthError::InvalidInput.into());
    }
    let area_id = input.area_id.or(tenant.claims.area_id);
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    modules::require(db, &tenant.claims, area_id, "SA02", Action::Create).await?;
    let hash = crypto::hash_password(input.password).await?;
    let row = admin::create_user(
        db,
        &tenant.claims,
        admin::NewUser {
            username: input.username.trim().to_owned(),
            full_name: input.full_name.trim().to_owned(),
            email: input.email,
            hash,
            role_id: input.role_id,
            area_id,
        },
    )
    .await?;
    Ok((StatusCode::CREATED, envelope(row)))
}

pub(super) async fn update_user(
    Extension(tenant): Extension<TenantTransaction>,
    Path(id): Path<Uuid>,
    Json(input): Json<Map<String, Value>>,
) -> Result<Json<Value>, ApiError> {
    if input.is_empty()
        || input.iter().any(|(key, value)| match key.as_str() {
            "full_name" => !value.as_str().is_some_and(|name| valid_text(name, 200)),
            "email" => !value.is_null() && !value.as_str().is_some_and(valid_email),
            _ => true,
        })
    {
        return Err(AuthError::InvalidInput.into());
    }
    let mut guard = tenant.transaction.lock().await;
    Ok(envelope(
        admin::change_user(
            guard.as_mut().ok_or(AuthError::Internal)?,
            &tenant.claims,
            id,
            Some(Value::Object(input)),
        )
        .await?,
    ))
}

pub(super) async fn remove_user(
    Extension(tenant): Extension<TenantTransaction>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    Ok(envelope(
        admin::change_user(
            guard.as_mut().ok_or(AuthError::Internal)?,
            &tenant.claims,
            id,
            None,
        )
        .await?,
    ))
}

pub(super) async fn roles(
    Extension(tenant): Extension<TenantTransaction>,
    Query(page): Query<Page>,
) -> Result<Json<Value>, ApiError> {
    let (limit, offset) = page.bounds()?;
    let mut guard = tenant.transaction.lock().await;
    Ok(envelope(
        admin::roles(
            guard.as_mut().ok_or(AuthError::Internal)?,
            &tenant.claims,
            limit,
            offset,
        )
        .await?,
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct RoleInput {
    role_code: String,
    role_name: String,
}

pub(super) async fn create_role(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Json(input): Json<RoleInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if !valid_text(&input.role_code, 48) || !valid_text(&input.role_name, 120) {
        return Err(AuthError::InvalidInput.into());
    }
    state.auth.require_admin_step_up(&tenant.claims).await?;
    let mut guard = tenant.transaction.lock().await;
    let row = admin::create_role(
        guard.as_mut().ok_or(AuthError::Internal)?,
        &tenant.claims,
        input.role_code,
        input.role_name,
    )
    .await?;
    Ok((StatusCode::CREATED, envelope(row)))
}

pub(super) async fn company_menus(
    Extension(tenant): Extension<TenantTransaction>,
) -> Result<Json<Value>, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    Ok(envelope(
        admin::company_menus(guard.as_mut().ok_or(AuthError::Internal)?, &tenant.claims).await?,
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct MenuFlags {
    can_view: bool,
    can_create: bool,
    can_update: bool,
    can_delete: bool,
}

pub(super) async fn set_role_menu(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path((id, menu)): Path<(Uuid, String)>,
    Json(input): Json<MenuFlags>,
) -> Result<Json<Value>, ApiError> {
    if menu.len() != 4
        || !menu.bytes().take(2).all(|byte| byte.is_ascii_uppercase())
        || !menu.bytes().skip(2).all(|byte| byte.is_ascii_digit())
    {
        return Err(AuthError::InvalidInput.into());
    }
    state.auth.require_admin_step_up(&tenant.claims).await?;
    let mut guard = tenant.transaction.lock().await;
    Ok(envelope(
        admin::set_role_menu(
            guard.as_mut().ok_or(AuthError::Internal)?,
            &tenant.claims,
            id,
            &menu,
            [
                input.can_view,
                input.can_create,
                input.can_update,
                input.can_delete,
            ],
        )
        .await?,
    ))
}

pub(super) async fn connector(
    Extension(tenant): Extension<TenantTransaction>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    Ok(envelope(
        admin::connector(
            guard.as_mut().ok_or(AuthError::Internal)?,
            &tenant.claims,
            id,
            None,
        )
        .await?,
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ConnectorInput {
    auth_provider: String,
    hris_login_url: Option<String>,
    hris_cache_ttl_hours: Option<i32>,
}

pub(super) async fn update_connector(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path(id): Path<Uuid>,
    Json(input): Json<ConnectorInput>,
) -> Result<Json<Value>, ApiError> {
    let ttl = input.hris_cache_ttl_hours.unwrap_or(72);
    if !matches!(input.auth_provider.as_str(), "LOCAL" | "HRIS_ASMX") || !(1..=8760).contains(&ttl)
    {
        return Err(AuthError::InvalidInput.into());
    }
    match (
        input.auth_provider.as_str(),
        input.hris_login_url.as_deref(),
    ) {
        ("HRIS_ASMX", Some(url)) if url.len() <= 2048 => {
            state.auth.validate_hris_configuration(url)?
        }
        ("LOCAL", None) => (),
        _ => return Err(AuthError::InvalidInput.into()),
    }
    state.auth.require_admin_step_up(&tenant.claims).await?;
    let mut guard = tenant.transaction.lock().await;
    Ok(envelope(
        admin::connector(
            guard.as_mut().ok_or(AuthError::Internal)?,
            &tenant.claims,
            id,
            Some((&input.auth_provider, input.hris_login_url.as_deref(), ttl)),
        )
        .await?,
    ))
}
