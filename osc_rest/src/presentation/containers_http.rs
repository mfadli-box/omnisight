use super::{
    auth_http::{ApiError, AppState, TenantTransaction},
    modules_http::envelope,
};
use crate::{
    application::{crypto, modules::Action},
    domain::{AuthError, ops::Input},
    infrastructure::{
        modules::{self, database_error},
        ops,
    },
};
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgConnection;
use std::sync::Arc;
use uuid::Uuid;
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Snapshot {
    containers: Vec<Container>,
    sbom: Vec<Sbom>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Container {
    id: String,
    name: String,
    image: String,
    state: String,
    image_update_status: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Sbom {
    container_id: String,
    image: String,
    packages: Vec<Package>,
    status: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Package {
    name: String,
    version: String,
    #[serde(rename = "type")]
    kind: String,
}
fn id_ok(s: &str) -> bool {
    (12..=64).contains(&s.len())
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn label(s: &str, max: usize) -> bool {
    s.len() <= max && !s.contains('\0')
}
impl Snapshot {
    pub(super) fn valid(&self) -> bool {
        self.containers.len() <= 256
            && self.sbom.len() <= 256
            && self.containers.iter().all(|c| {
                id_ok(&c.id)
                    && label(&c.name, 256)
                    && label(&c.image, 512)
                    && label(&c.state, 64)
                    && matches!(
                        c.image_update_status.as_str(),
                        "unknown" | "available" | "current"
                    )
            })
            && self.sbom.iter().all(|s| {
                id_ok(&s.container_id)
                    && label(&s.image, 512)
                    && matches!(
                        s.status.as_str(),
                        "available" | "unsupported" | "unavailable" | "too_large"
                    )
                    && s.packages.len() <= 2000
                    && s.packages.iter().all(|p| {
                        label(&p.name, 256) && label(&p.version, 256) && label(&p.kind, 64)
                    })
            })
    }
}
pub(super) async fn save_snapshot(
    db: &mut PgConnection,
    node: Uuid,
    timestamp: i64,
    snapshot: &Snapshot,
) -> Result<(), AuthError> {
    let changed = sqlx::query("INSERT INTO public.osc_container_snapshot(node_id,company_id,area_id,store_id,containers,sbom,recorded_at) SELECT id,company_id,area_id,store_id,$2,$3,$4 FROM public.osc_agent_node WHERE id=$1 ON CONFLICT(node_id) DO UPDATE SET containers=excluded.containers,sbom=excluded.sbom,recorded_at=excluded.recorded_at WHERE osc_container_snapshot.recorded_at < excluded.recorded_at")
 .bind(node).bind(sqlx::types::Json(&snapshot.containers)).bind(sqlx::types::Json(&snapshot.sbom)).bind(timestamp).execute(db).await.map_err(database_error)?.rows_affected();
    if changed == 0 {
        return Err(AuthError::Conflict);
    }
    Ok(())
}
async fn read(tenant: TenantTransaction, is_sbom: bool) -> Result<Json<Value>, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    let menu = if is_sbom { "SA04" } else { "OP02" };
    let permission = modules::permission(Action::View, "$1", "s.company_id", "s.area_id", "$4");
    let column = if is_sbom { "sbom" } else { "containers" };
    let query = format!(
        "SELECT item || jsonb_build_object('node_id',s.node_id,'company_id',s.company_id,'area_id',s.area_id,'store_id',s.store_id,'recorded_at',to_timestamp(s.recorded_at)) FROM public.osc_container_snapshot s CROSS JOIN LATERAL jsonb_array_elements(s.{column}) item WHERE s.company_id=$2 AND ($3::uuid IS NULL OR s.area_id=$3) AND {permission} ORDER BY s.node_id LIMIT 10000"
    );
    let rows: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(query))
        .bind(tenant.claims.sub)
        .bind(modules::company(&tenant.claims)?)
        .bind(tenant.claims.area_id)
        .bind(menu)
        .fetch_all(&mut **db)
        .await
        .map_err(database_error)?;
    Ok(envelope(rows))
}
pub(super) async fn list(
    Extension(tenant): Extension<TenantTransaction>,
) -> Result<Json<Value>, ApiError> {
    read(tenant, false).await
}
pub(super) async fn sbom(
    Extension(tenant): Extension<TenantTransaction>,
) -> Result<Json<Value>, ApiError> {
    read(tenant, true).await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ActionRequest {
    node_id: Uuid,
    action: String,
}
pub(super) async fn action(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path(id): Path<String>,
    Json(request): Json<ActionRequest>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if !id_ok(&id) {
        return Err(AuthError::InvalidInput.into());
    }
    let (action, permission) = match request.action.as_str() {
        "start" => ("docker.start", Action::Update),
        "stop" => ("docker.stop", Action::Update),
        "prune" => ("docker.prune_containers", Action::Delete),
        _ => return Err(AuthError::InvalidInput.into()),
    };
    let mut guard = tenant.transaction.lock().await;
    let db = guard.as_mut().ok_or(AuthError::Internal)?;
    let target = ops::node(db, request.node_id).await?;
    modules::require(db, &tenant.claims, Some(target.area_id), "OP02", permission).await?;
    let found:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM public.osc_container_snapshot s CROSS JOIN LATERAL jsonb_array_elements(s.containers) c WHERE s.node_id=$1 AND c->>'id'=$2)").bind(request.node_id).bind(&id).fetch_one(&mut **db).await.map_err(database_error)?;
    if !found {
        return Err(AuthError::NotFound.into());
    }
    let payload = ops::JobPayload {
        input: Input::default(),
        terminal_session: None,
        container_id: (request.action != "prune").then_some(id),
    };
    let encrypted = crypto::encrypt_secret(
        &state.ops_key,
        &serde_json::to_vec(&payload).map_err(|_| AuthError::Internal)?,
    )?;
    let expires = Utc::now() + chrono::Duration::minutes(6);
    let job = ops::enqueue(
        db,
        &target,
        None,
        &tenant.claims,
        action,
        &encrypted,
        expires,
    )
    .await?;
    ops::audit_request(db, &tenant.claims, &target, job, action, None, false).await?;
    Ok((
        StatusCode::ACCEPTED,
        envelope(json!({"job_id":job,"expires_at":expires})),
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_container_ids() {
        assert!(id_ok("0123456789ab"));
        assert!(!id_ok("--malicious"));
        assert!(!id_ok("ABCDEF123456"));
    }
}
