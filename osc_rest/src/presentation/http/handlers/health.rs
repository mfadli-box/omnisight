//! Handler `GET /api/v1/health` — readiness agregat.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::application::health;
use crate::presentation::http::state::AppState;

/// Readiness: `200 {"status":"ok", ...}` bila database & storage up;
/// `503 {"status":"degraded", ...}` bila ada yang turun.
pub async fn health(State(state): State<AppState>) -> Response {
    let report = health::check(state.db.as_ref(), state.storage.as_ref()).await;

    let status = if report.status == "ok" {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (status, Json(report)).into_response()
}
