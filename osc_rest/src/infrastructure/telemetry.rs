use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use sqlx::{PgConnection, PgPool, types::Json};
use uuid::Uuid;

use crate::{
    application::modules::Resource,
    domain::{AuthError, SessionClaims, telemetry::HostMetrics},
    infrastructure::modules::{database_error, read_for_menu},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentScope {
    pub company_id: Uuid,
    pub area_id: Uuid,
}

pub async fn record(
    pool: &PgPool,
    scope: &AgentScope,
    node: Uuid,
    recorded_at: DateTime<Utc>,
    sample: &HostMetrics,
) -> Result<(), AuthError> {
    let mut db = pool.begin().await.map_err(database_error)?;
    sqlx::query("SELECT set_config('app.current_company_id',$1,true), set_config('app.allowed_area_ids',$2,true)")
        .bind(scope.company_id.to_string())
        .bind(scope.area_id.to_string())
        .execute(&mut *db).await.map_err(database_error)?;

    // Serialize writers for a node before checking its high-water mark and updating alerts.
    let (store, last_seen): (Uuid, Option<DateTime<Utc>>) = sqlx::query_as(
        "SELECT store_id, last_seen_at FROM public.osc_agent_node
         WHERE id=$1 AND company_id=$2 AND area_id=$3 AND is_active AND status <> 'DISABLED'
         FOR NO KEY UPDATE",
    )
    .bind(node)
    .bind(scope.company_id)
    .bind(scope.area_id)
    .fetch_optional(&mut *db)
    .await
    .map_err(database_error)?
    .ok_or(AuthError::NotFound)?;
    if last_seen.is_some_and(|last| last >= recorded_at) {
        return Err(AuthError::Conflict);
    }

    sqlx::query(
        "INSERT INTO public.osc_node_metric
         (node_id,company_id,area_id,store_id,cpu_pct,ram_used_mb,ram_total_mb,disk_json,disk_io_json,
          net_json,load_avg,temp_c,smart_json,containers_json,recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    )
    .bind(node).bind(scope.company_id).bind(scope.area_id).bind(store)
    .bind(sample.cpu_pct).bind(sample.ram_used_mb).bind(sample.ram_total_mb)
    .bind(Json(&sample.disk_json)).bind(Json(&sample.disk_io_json)).bind(Json(&sample.net_json))
    .bind(sample.load_avg.as_ref().map(|load| load.as_slice())).bind(sample.temp_c)
    .bind(Json(&sample.smart_json)).bind(Json(&sample.containers_json)).bind(recorded_at)
    .execute(&mut *db).await.map_err(database_error)?;

    let values = [
        Some(sample.cpu_pct),
        Some(sample.ram_used_mb),
        Some(sample.ram_pct()),
        Some(sample.disk_pct()),
        sample.load_avg.map(|load| load[0]),
        sample.temp_c,
        sample.smart_failed(),
    ];
    sqlx::query(include_str!("telemetry_alerts.sql"))
        .bind(node)
        .bind(scope.company_id)
        .bind(scope.area_id)
        .bind(store)
        .bind(recorded_at)
        .bind(&values[..])
        .execute(&mut *db)
        .await
        .map_err(database_error)?;

    sqlx::query("UPDATE public.osc_agent_node SET status='ONLINE', last_seen_at=$2 WHERE id=$1")
        .bind(node)
        .bind(recorded_at)
        .execute(&mut *db)
        .await
        .map_err(database_error)?;
    db.commit().await.map_err(database_error)
}

pub async fn history(
    db: &mut PgConnection,
    claims: &SessionClaims,
    node: Uuid,
    limit: i64,
    before: Option<DateTime<Utc>>,
) -> Result<Vec<Value>, AuthError> {
    let node_visible = !read_for_menu(db, claims, Resource::Nodes, Some(node), (1, 0), "CT01")
        .await?
        .is_empty()
        || !read_for_menu(db, claims, Resource::Nodes, Some(node), (1, 0), "OP02")
            .await?
            .is_empty();
    if !node_visible {
        return Err(AuthError::NotFound);
    }
    sqlx::query_scalar(
        "SELECT to_jsonb(m) FROM public.osc_node_metric m
         WHERE m.node_id=$1 AND m.company_id=$2 AND m.area_id=ANY($3)
           AND ($5::timestamptz IS NULL OR m.recorded_at < $5)
         ORDER BY m.recorded_at DESC LIMIT $4",
    )
    .bind(node)
    .bind(claims.company_id)
    .bind(&claims.allowed_area_ids)
    .bind(limit)
    .bind(before)
    .fetch_all(db)
    .await
    .map_err(database_error)
}
