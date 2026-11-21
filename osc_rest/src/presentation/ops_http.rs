use std::{collections::HashMap, convert::Infallible, sync::Arc, time::Duration};

use axum::{
    Extension, Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{
        IntoResponse, Response, Sse,
        sse::{Event, KeepAlive},
    },
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use data_encoding::HEXLOWER;
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::Sha256;
use sqlx::PgConnection;
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

use crate::{
    application::{crypto, modules::Action},
    domain::{
        AuthError, SessionClaims,
        ops::{Input, TERMINAL, valid_stack_name},
    },
    infrastructure::{
        modules::{self, database_error},
        ops,
        telemetry::AgentScope,
    },
};

use super::{
    auth_http::{ApiError, AppState, CommitAudit, TenantTransaction},
    heartbeat_http::{authenticate, parse_secrets},
    modules_http::envelope,
};

const CLAIM: &str = "/baas/v1/agents/ops/claim";
const EVENT: &str = "/baas/v1/agents/ops/event";

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/baas/v1/stacks", get(list).post(create))
        .route("/baas/v1/stacks/{id}", get(detail))
        .route("/baas/v1/stacks/{id}/action", post(action))
        .route("/baas/v1/stacks/{id}/logs/{job_id}", get(stack_logs))
        .route("/baas/v1/containers", get(super::containers_http::list))
        .route(
            "/baas/v1/containers/{id}/action",
            post(super::containers_http::action),
        )
        .route("/baas/v1/security/sbom", get(super::containers_http::sbom))
        .route("/baas/v1/pam/terminal", post(terminal))
        .route("/baas/v1/pam/terminal/nodes", get(terminal_nodes))
        .route("/baas/v1/pam/terminal/{job_id}/logs", get(terminal_logs))
        .layer(DefaultBodyLimit::max(512 * 1024))
}

pub fn agent_routes(
    app: Arc<AppState>,
    secrets: &str,
    scopes: &str,
) -> Result<Router, &'static str> {
    let secrets = parse_secrets(secrets)?;
    let scopes = if scopes.is_empty() {
        HashMap::new()
    } else {
        serde_json::from_str(scopes).map_err(|_| "Invalid AGENT_TELEMETRY_SCOPES")?
    };
    Ok(Router::new()
        .route(CLAIM, post(claim))
        .route(EVENT, post(agent_event))
        .route(
            "/baas/v1/agents/containers",
            post(container_snapshot).layer(DefaultBodyLimit::max(1024 * 1024)),
        )
        .layer(DefaultBodyLimit::max(32 * 1024))
        .with_state(Arc::new(AgentState {
            app,
            secrets,
            scopes,
        })))
}

#[derive(Deserialize)]
struct ListQuery {
    after: Option<Uuid>,
}

async fn list(
    Extension(tenant): Extension<TenantTransaction>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    Ok(envelope(ops::list(db, &tenant.claims, query.after).await?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Create {
    node_id: Uuid,
    stack_name: String,
}

async fn create(
    Extension(tenant): Extension<TenantTransaction>,
    Json(input): Json<Create>,
) -> Result<impl IntoResponse, ApiError> {
    if !valid_stack_name(&input.stack_name) {
        return Err(AuthError::InvalidInput.into());
    }
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    let node = ops::node(db, input.node_id).await?;
    modules::require(
        db,
        &tenant.claims,
        Some(node.area_id),
        "OP02",
        Action::Create,
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        envelope(ops::create(db, &node, &input.stack_name).await?),
    ))
}

async fn detail(
    Extension(tenant): Extension<TenantTransaction>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    let target = ops::stack(db, id).await?;
    modules::require(
        db,
        &tenant.claims,
        Some(target.area_id),
        "OP02",
        Action::View,
    )
    .await?;
    Ok(envelope(ops::detail(db, id).await?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StackAction {
    action: String,
    input: Input,
}

async fn action(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path(id): Path<Uuid>,
    Json(request): Json<StackAction>,
) -> Result<impl IntoResponse, ApiError> {
    if request.action == TERMINAL || !request.input.valid(&request.action) {
        return Err(AuthError::InvalidInput.into());
    }
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    let target = ops::stack(db, id).await?;
    let permission = if request.action == "read" {
        Action::View
    } else {
        Action::Update
    };
    modules::require(db, &tenant.claims, Some(target.area_id), "OP02", permission).await?;
    let expires = Utc::now() + chrono::Duration::minutes(6);
    let job = submit(
        db,
        &state,
        &tenant.claims,
        &target,
        Some(id),
        &request.action,
        &request.input,
        expires,
    )
    .await?;
    Ok((
        StatusCode::ACCEPTED,
        envelope(json!({"job_id":job,"expires_at":expires})),
    ))
}

async fn terminal_nodes(
    Extension(tenant): Extension<TenantTransaction>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    Ok(envelope(
        ops::terminal_nodes(db, &tenant.claims, query.after).await?,
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TerminalRequest {
    node_id: Uuid,
    command: String,
    otp: Option<String>,
}

async fn terminal(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Json(request): Json<TerminalRequest>,
) -> Result<Response, ApiError> {
    let input = Input {
        command: Some(request.command),
        ..Input::default()
    };
    if !input.valid(TERMINAL)
        || request
            .otp
            .as_ref()
            .is_some_and(|otp| otp.len() != 6 || !otp.bytes().all(|b| b.is_ascii_digit()))
    {
        return Err(AuthError::InvalidInput.into());
    }
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    let node = ops::node(db, request.node_id).await?;
    modules::require(
        db,
        &tenant.claims,
        Some(node.area_id),
        "OP01",
        Action::Create,
    )
    .await?;
    if let Err(error) = state
        .auth
        .require_step_up(&tenant.claims, request.otp.as_deref())
        .await
    {
        if !matches!(
            error,
            AuthError::MfaRequired
                | AuthError::StepUpRequired
                | AuthError::InvalidOtp
                | AuthError::OtpReplay
                | AuthError::RateLimited
                | AuthError::MfaNotEnabled
        ) {
            return Err(error.into());
        }
        ops::audit_request(
            db,
            &tenant.claims,
            &node,
            Uuid::new_v4(),
            TERMINAL,
            input.command.as_deref(),
            true,
        )
        .await?;
        let mut response = ApiError::from(error).into_response();
        response.extensions_mut().insert(CommitAudit);
        return Ok(response);
    }
    let deadline = state.auth.step_up_deadline(&tenant.claims).await?;
    let expires = deadline.min(Utc::now() + chrono::Duration::seconds(45));
    let id = submit(
        db,
        &state,
        &tenant.claims,
        &node,
        None,
        TERMINAL,
        &input,
        expires,
    )
    .await?;
    Ok((
        StatusCode::ACCEPTED,
        envelope(json!({"job_id":id,"expires_at":expires})),
    )
        .into_response())
}

async fn submit(
    db: &mut PgConnection,
    state: &AppState,
    claims: &SessionClaims,
    target: &ops::Target,
    stack: Option<Uuid>,
    action: &str,
    input: &Input,
    expires: DateTime<Utc>,
) -> Result<Uuid, AuthError> {
    let payload = ops::JobPayload {
        input: input.clone(),
        terminal_session: (action == TERMINAL).then(|| claims.clone()),
        container_id: None,
    };
    let serialized = serde_json::to_vec(&payload).map_err(|_| AuthError::Internal)?;
    let cipher = crypto::encrypt_secret(&state.ops_key, &serialized)?;
    let id = ops::enqueue(db, target, stack, claims, action, &cipher, expires).await?;
    ops::audit_request(
        db,
        claims,
        target,
        id,
        action,
        input.command.as_deref(),
        false,
    )
    .await?;
    Ok(id)
}

async fn stack_logs(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path((stack, job)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    logs(state, tenant, Some(stack), job, headers).await
}

async fn terminal_logs(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path(job): Path<Uuid>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    logs(state, tenant, None, job, headers).await
}

async fn authorized_job(
    db: &mut PgConnection,
    state: &AppState,
    claims: &SessionClaims,
    stack: Option<Uuid>,
    id: Uuid,
) -> Result<ops::Job, AuthError> {
    let job = ops::job(db, id).await?;
    if job.stack_id != stack || job.actor_user_id != claims.sub || job.session_id != claims.jti {
        return Err(AuthError::NotFound);
    }
    if stack.is_none() {
        modules::require(db, claims, Some(job.area_id), "OP01", Action::Create).await?;
        state.auth.require_step_up(claims, None).await?;
    } else {
        modules::require(db, claims, Some(job.area_id), "OP02", Action::View).await?;
        if job.action != "read" {
            modules::require(db, claims, Some(job.area_id), "OP02", Action::Update).await?;
        }
    }
    Ok(job)
}

async fn logs(
    state: Arc<AppState>,
    tenant: TenantTransaction,
    stack: Option<Uuid>,
    job: Uuid,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    let after = headers
        .get("last-event-id")
        .map(|value| {
            value
                .to_str()
                .ok()
                .and_then(|value| value.parse::<i32>().ok())
                .filter(|seq| (0..=128).contains(seq))
                .ok_or(AuthError::InvalidInput)
        })
        .transpose()?
        .unwrap_or(0);
    {
        let mut guard = tenant.transaction.lock().await;
        let db = guard.as_mut().ok_or(AuthError::Internal)?;
        authorized_job(db, &state, &tenant.claims, stack, job).await?;
    }
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(16);
    tokio::spawn(async move {
        let mut cursor = after;
        // Let the browser reconnect with Last-Event-ID and a fresh authorization check.
        for _ in 0..20 {
            let result = tokio::select! {
                _ = tx.closed() => return,
                result = poll_logs(&state, &tenant.claims, stack, job, cursor) => result,
            };
            let Ok((events, status)) = result else {
                let _ = tx
                    .send(Ok(Event::default()
                        .event("closed")
                        .data("Akses log berakhir.")))
                    .await;
                return;
            };
            for (seq, output) in events {
                let event = Event::default()
                    .event("output")
                    .id(seq.to_string())
                    .data(json!({"output":output}).to_string());
                if tx.send(Ok(event)).await.is_err() {
                    return;
                }
                cursor = seq;
            }
            if let Some(status) = status {
                let _ = tx
                    .send(Ok(Event::default().event("done").data(status)))
                    .await;
                return;
            }
            tokio::select! {
                _ = tx.closed() => return,
                _ = tokio::time::sleep(Duration::from_secs(1)) => {},
            }
        }
    });
    Ok((
        [
            (header::CACHE_CONTROL, "private, no-store"),
            (header::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        Sse::new(ReceiverStream::new(rx))
            .keep_alive(KeepAlive::new().interval(Duration::from_secs(5))),
    ))
}

async fn poll_logs(
    state: &AppState,
    claims: &SessionClaims,
    stack: Option<Uuid>,
    id: Uuid,
    cursor: i32,
) -> Result<(Vec<(i32, String)>, Option<String>), AuthError> {
    if claims.exp <= Utc::now().timestamp() {
        return Err(AuthError::InvalidChallenge);
    }
    state.auth.validate_session(claims).await?;
    let principal = state.auth.principal_from_claims(claims).await?;
    let mut claims = claims.clone();
    claims
        .allowed_area_ids
        .retain(|area| principal.allowed_area_ids.contains(area));
    let mut db = state.tenant_pool.begin().await.map_err(database_error)?;
    modules::set_tenant_scope(&mut db, principal.company_id, &claims.allowed_area_ids).await?;
    let job = authorized_job(&mut db, state, &claims, stack, id).await?;
    let rows = ops::output(&mut db, id, cursor).await?;
    db.commit().await.map_err(database_error)?;
    let events = rows
        .into_iter()
        .map(|(seq, cipher)| {
            let text = String::from_utf8(crypto::decrypt_secret(&state.ops_key, &cipher)?)
                .map_err(|_| AuthError::Internal)?;
            Ok((seq, text))
        })
        .collect::<Result<Vec<_>, AuthError>>()?;
    let status = match job.status.as_str() {
        "failed" | "succeeded" => Some(job.status),
        _ if job.expires_at <= Utc::now() && events.is_empty() => Some("expired".to_owned()),
        _ => None,
    };
    Ok((events, status))
}

struct AgentState {
    app: Arc<AppState>,
    secrets: HashMap<String, String>,
    scopes: HashMap<Uuid, AgentScope>,
}

impl AgentState {
    fn authenticate<'a>(
        &'a self,
        headers: &HeaderMap,
        body: &[u8],
        path: &str,
    ) -> Result<(Uuid, &'a AgentScope, &'a str), AuthError> {
        let (id, _) = authenticate(
            headers,
            body,
            &self.secrets,
            Utc::now().timestamp(),
            Some(path),
        )
        .ok_or(AuthError::InvalidCredentials)?;
        let node = Uuid::parse_str(id).map_err(|_| AuthError::InvalidCredentials)?;
        let scope = self
            .scopes
            .get(&node)
            .ok_or(AuthError::InvalidCredentials)?;
        let secret = self.secrets.get(id).ok_or(AuthError::InvalidCredentials)?;
        Ok((node, scope, secret))
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Claim {
    nonce: Uuid,
    compose: bool,
}

async fn claim(
    State(state): State<Arc<AgentState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, ApiError> {
    let (node, scope, secret) = state.authenticate(&headers, &body, CLAIM)?;
    let input: Claim = serde_json::from_slice(&body).map_err(|_| AuthError::InvalidInput)?;
    if !state.app.cache.reserve_ops_claim(node, input.nonce).await? {
        return Err(AuthError::Conflict.into());
    }
    let mut db = ops::agent_transaction(&state.app.tenant_pool, scope, node).await?;
    let response = if let Some(job) = ops::claim(&mut db, node, input.compose).await? {
        let args = ops::decode_payload(&state.app.ops_key, &job)?;
        if job.action == TERMINAL {
            let claims = args.terminal_session.as_ref().ok_or(AuthError::Internal)?;
            let access = authorize_claimed_terminal(&mut db, &state.app, &job, claims).await;
            if let Err(error) = access {
                if matches!(
                    error,
                    AuthError::Internal | AuthError::DependencyUnavailable
                ) {
                    return Err(error.into());
                }
                ops::finish(&mut db, &state.app.ops_key, node, job.id, false).await?;
                db.commit().await.map_err(database_error)?;
                return Ok(StatusCode::NO_CONTENT.into_response());
            }
        }
        let name = match job.stack_id {
            Some(stack) => ops::stack(&mut db, stack).await?.stack_name,
            None => args.container_id.clone(),
        };
        let payload = json!({
            "id":job.id,"node_id":node,"nonce":input.nonce,"action":job.action,
            "stack_name":name,"input":args.input,"expires_at":job.expires_at
        })
        .to_string();
        let mut mac =
            Hmac::<Sha256>::new_from_slice(secret.as_bytes()).map_err(|_| AuthError::Internal)?;
        mac.update(b"osc:ops:job\n");
        mac.update(payload.as_bytes());
        Json(json!({"payload":payload,"signature":HEXLOWER.encode(&mac.finalize().into_bytes())}))
            .into_response()
    } else {
        StatusCode::NO_CONTENT.into_response()
    };
    db.commit().await.map_err(database_error)?;
    Ok(response)
}

async fn container_snapshot(
    State(state): State<Arc<AgentState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, ApiError> {
    const PATH: &str = "/baas/v1/agents/containers";
    let (node, scope, _) = state.authenticate(&headers, &body, PATH)?;
    let (_, timestamp) = authenticate(
        &headers,
        &body,
        &state.secrets,
        Utc::now().timestamp(),
        Some(PATH),
    )
    .ok_or(AuthError::InvalidCredentials)?;
    let snapshot: super::containers_http::Snapshot =
        serde_json::from_slice(&body).map_err(|_| AuthError::InvalidInput)?;
    if !snapshot.valid() {
        return Err(AuthError::InvalidInput.into());
    }
    let mut db = ops::agent_transaction(&state.app.tenant_pool, scope, node).await?;
    super::containers_http::save_snapshot(&mut db, node, timestamp, &snapshot).await?;
    db.commit().await.map_err(database_error)?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod container_limit_tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    #[tokio::test]
    async fn snapshot_route_has_larger_limit_than_other_agent_routes() {
        async fn receive(_: Bytes) -> StatusCode {
            StatusCode::NO_CONTENT
        }
        let app = Router::new()
            .route(
                "/snapshot",
                post(receive).layer(DefaultBodyLimit::max(1024 * 1024)),
            )
            .route("/other", post(receive))
            .layer(DefaultBodyLimit::max(32 * 1024));
        let request = |path, size| Request::post(path).body(Body::from(vec![0; size])).unwrap();
        let snapshot = app
            .clone()
            .oneshot(request("/snapshot", 64 * 1024))
            .await
            .unwrap();
        assert_eq!(snapshot.status(), StatusCode::NO_CONTENT);
        let other = app
            .clone()
            .oneshot(request("/other", 64 * 1024))
            .await
            .unwrap();
        assert_eq!(other.status(), StatusCode::PAYLOAD_TOO_LARGE);
        let oversized = app
            .oneshot(request("/snapshot", 1024 * 1024 + 1))
            .await
            .unwrap();
        assert_eq!(oversized.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }
}

async fn authorize_claimed_terminal(
    db: &mut PgConnection,
    state: &AppState,
    job: &ops::Job,
    claims: &SessionClaims,
) -> Result<(), AuthError> {
    if claims.exp <= Utc::now().timestamp()
        || claims.jti != job.session_id
        || claims.sub != job.actor_user_id
    {
        return Err(AuthError::InvalidChallenge);
    }
    state.auth.validate_session(claims).await?;
    state.auth.principal_from_claims(claims).await?;
    state.auth.require_step_up(claims, None).await?;
    modules::require(db, claims, Some(job.area_id), "OP01", Action::Create).await
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
enum AgentEvent {
    Output {
        job_id: Uuid,
        seq: i32,
        output: String,
    },
    Done {
        job_id: Uuid,
        success: bool,
    },
}

async fn agent_event(
    State(state): State<Arc<AgentState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, ApiError> {
    let (node, scope, _) = state.authenticate(&headers, &body, EVENT)?;
    let event: AgentEvent = serde_json::from_slice(&body).map_err(|_| AuthError::InvalidInput)?;
    let mut db = ops::agent_transaction(&state.app.tenant_pool, scope, node).await?;
    match event {
        AgentEvent::Output {
            job_id,
            seq,
            output,
        } => {
            if !(1..=128).contains(&seq)
                || output.len() > 4096
                || output.is_empty()
                || output.contains('\0')
            {
                return Err(AuthError::InvalidInput.into());
            }
            ops::record_output(&mut db, &state.app.ops_key, node, job_id, seq, &output).await?;
        }
        AgentEvent::Done { job_id, success } => {
            ops::finish(&mut db, &state.app.ops_key, node, job_id, success).await?;
        }
    }
    db.commit().await.map_err(database_error)?;
    Ok(StatusCode::NO_CONTENT)
}
