//! Definisi router — satu-satunya tempat pemetaan route.
//! Route baru (auth, excel, CRUD) ditambahkan di sini.

use axum::routing::get;
use axum::{Router, middleware as axum_middleware};

use crate::presentation::http::handlers;
use crate::presentation::http::middleware::correlation_id::correlation_id;
use crate::presentation::http::middleware::security_headers::security_headers;
use crate::presentation::http::state::AppState;

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/health", get(handlers::health::health))
        .layer(axum_middleware::from_fn(correlation_id))
        // security_headers sebagai layer terluar: tetap terpasang walau
        // middleware dalam menyusun ulang body (penyisipan correlation_id).
        .layer(axum_middleware::from_fn(security_headers))
        .with_state(state)
}
