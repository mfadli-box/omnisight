use std::{collections::HashMap, sync::Arc};

use axum::{
    Extension, Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::{AuthError, telemetry::HostMetrics},
    infrastructure::{
        redis_cache::RedisCache,
        telemetry::{self, AgentScope},
    },
};

use super::{
    auth_http::{ApiError, TenantTransaction},
    heartbeat_http::{authenticate, parse_secrets},
    modules_http::envelope,
};

const PATH: &str = "/baas/v1/agents/telemetry";

struct IngestState {
    pool: PgPool,
    cache: Arc<RedisCache>,
    secrets: HashMap<String, String>,
    scopes: HashMap<Uuid, AgentScope>,
}

pub fn router(
    pool: PgPool,
    cache: Arc<RedisCache>,
    secrets_json: &str,
    scopes_json: &str,
) -> Result<Router, &'static str> {
    let secrets = parse_secrets(secrets_json)?;
    let scopes: HashMap<Uuid, AgentScope> = if scopes_json.is_empty() {
        HashMap::new()
    } else {
        serde_json::from_str(scopes_json)
            .map_err(|_| "AGENT_TELEMETRY_SCOPES must map node UUIDs to company_id and area_id")?
    };
    if scopes
        .keys()
        .any(|node| !secrets.contains_key(&node.to_string()))
    {
        return Err(
            "AGENT_TELEMETRY_SCOPES requires a canonical UUID key in AGENT_HEARTBEAT_SECRETS for each node",
        );
    }

    Ok(Router::new()
        .route(PATH, post(receive))
        .layer(DefaultBodyLimit::max(128 * 1024))
        .with_state(Arc::new(IngestState {
            pool,
            cache,
            secrets,
            scopes,
        })))
}

async fn receive(
    State(state): State<Arc<IngestState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, ApiError> {
    let now = Utc::now();
    let (id, timestamp) =
        authenticate(&headers, &body, &state.secrets, now.timestamp(), Some(PATH))
            .ok_or(AuthError::InvalidCredentials)?;
    let node = Uuid::parse_str(id).map_err(|_| AuthError::InvalidCredentials)?;
    let scope = state
        .scopes
        .get(&node)
        .ok_or(AuthError::InvalidCredentials)?;
    let recorded_at = DateTime::from_timestamp(timestamp, 0).ok_or(AuthError::InvalidInput)?;
    let sample =
        serde_json::from_slice::<HostMetrics>(&body).map_err(|_| AuthError::InvalidInput)?;
    if !sample.valid() {
        return Err(AuthError::InvalidInput.into());
    }
    telemetry::record(&state.pool, scope, node, recorded_at, &sample).await?;

    let payload = json!({
        "timestamp": timestamp,
        "metrics": {
            "cpu_percent": sample.cpu_pct,
            "ram_percent": sample.ram_pct(),
            "disk_percent": sample.disk_pct(),
        }
    });
    state
        .cache
        .record_agent_heartbeat(id, timestamp, &payload.to_string())
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub(super) struct HistoryQuery {
    limit: Option<i64>,
    before: Option<DateTime<Utc>>,
}

pub(super) async fn history(
    Extension(tenant): Extension<TenantTransaction>,
    Path(node): Path<Uuid>,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<Value>, ApiError> {
    let limit = query.limit.unwrap_or(120);
    if !(1..=200).contains(&limit) {
        return Err(AuthError::InvalidInput.into());
    }
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    Ok(envelope(
        telemetry::history(db, &tenant.claims, node, limit, query.before).await?,
    ))
}
