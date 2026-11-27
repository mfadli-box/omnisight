use crate::middleware::rbac::{authorize, Action, RbacState, TenantContext};
use axum::{middleware, routing::get, Extension, Json, Router};
use sqlx::PgPool;

pub fn router(db: PgPool, secret: &str) -> Result<Router, &'static str> {
    let policy = RbacState::new(db, secret, "CM02", Action::Read)?;
    Ok(Router::new()
        .route("/baas/v1/tenant/context", get(context))
        .route_layer(middleware::from_fn_with_state(policy, authorize)))
}

async fn context(Extension(tenant): Extension<TenantContext>) -> Json<TenantContext> {
    Json(tenant)
}
