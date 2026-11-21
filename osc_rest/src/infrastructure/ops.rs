use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{PgConnection, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    application::{crypto, modules::Action},
    domain::{AuthError, SessionClaims, ops::Input},
    infrastructure::{
        modules::{self, database_error},
        telemetry::AgentScope,
    },
};

#[derive(sqlx::FromRow)]
pub struct Target {
    pub node_id: Uuid,
    pub company_id: Uuid,
    pub area_id: Uuid,
    pub store_id: Uuid,
    pub stack_name: Option<String>,
}

#[derive(sqlx::FromRow)]
pub struct Job {
    pub id: Uuid,
    pub stack_id: Option<Uuid>,
    pub actor_user_id: Uuid,
    pub session_id: Uuid,
    pub area_id: Uuid,
    pub action: String,
    pub status: String,
    pub expires_at: DateTime<Utc>,
    pub payload_encrypted: Option<Vec<u8>>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct JobPayload {
    pub input: Input,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_session: Option<SessionClaims>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub container_id: Option<String>,
}

pub async fn detail(db: &mut PgConnection, id: Uuid) -> Result<Value, AuthError> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {STACK_JSON} FROM public.osc_compose_stack s WHERE s.id=$1"
    )))
    .bind(id)
    .fetch_optional(db)
    .await
    .map_err(database_error)?
    .ok_or(AuthError::NotFound)
}

pub async fn node(db: &mut PgConnection, id: Uuid) -> Result<Target, AuthError> {
    sqlx::query_as(
        "SELECT id AS node_id, company_id, area_id, store_id, NULL::text AS stack_name
         FROM public.osc_agent_node WHERE id=$1 AND is_active AND status <> 'DISABLED'",
    )
    .bind(id)
    .fetch_optional(db)
    .await
    .map_err(database_error)?
    .ok_or(AuthError::NotFound)
}

pub async fn stack(db: &mut PgConnection, id: Uuid) -> Result<Target, AuthError> {
    sqlx::query_as(
        "SELECT s.node_id,s.company_id,s.area_id,s.store_id,s.stack_name
         FROM public.osc_compose_stack s JOIN public.osc_agent_node n ON n.id=s.node_id
         WHERE s.id=$1 AND n.is_active AND n.status <> 'DISABLED'",
    )
    .bind(id)
    .fetch_optional(db)
    .await
    .map_err(database_error)?
    .ok_or(AuthError::NotFound)
}

const STACK_JSON: &str =
    "jsonb_build_object('id',s.id,'node_id',s.node_id,'stack_name',s.stack_name,
       'compose_path',s.compose_path,'status',s.status,'last_deployed_at',s.last_deployed_at)";

pub async fn list(
    db: &mut PgConnection,
    claims: &SessionClaims,
    after: Option<Uuid>,
) -> Result<Vec<Value>, AuthError> {
    let permission = modules::permission(Action::View, "$1", "s.company_id", "s.area_id", "'OP02'");
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {STACK_JSON} FROM public.osc_compose_stack s
         WHERE s.company_id=$2 AND ($3::uuid IS NULL OR s.area_id=$3)
           AND ($4::uuid IS NULL OR s.id>$4) AND {permission}
         ORDER BY s.id LIMIT 100"
    )))
    .bind(claims.sub)
    .bind(modules::company(claims)?)
    .bind(claims.area_id)
    .bind(after)
    .fetch_all(db)
    .await
    .map_err(database_error)
}

pub async fn terminal_nodes(
    db: &mut PgConnection,
    claims: &SessionClaims,
    after: Option<Uuid>,
) -> Result<Vec<Value>, AuthError> {
    let permission =
        modules::permission(Action::Create, "$1", "n.company_id", "n.area_id", "'OP01'");
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT jsonb_build_object('id',n.id,'name',coalesce(n.display_name,n.node_code,n.hostname,n.id::text))
         FROM public.osc_agent_node n WHERE n.company_id=$2 AND ($3::uuid IS NULL OR n.area_id=$3)
           AND ($4::uuid IS NULL OR n.id>$4) AND n.is_active AND n.status <> 'DISABLED'
           AND {permission} ORDER BY n.id LIMIT 100"
    )))
    .bind(claims.sub).bind(modules::company(claims)?).bind(claims.area_id).bind(after)
    .fetch_all(db).await.map_err(database_error)
}

pub async fn create(
    db: &mut PgConnection,
    target: &Target,
    name: &str,
) -> Result<Value, AuthError> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "INSERT INTO public.osc_compose_stack AS s (company_id,area_id,store_id,node_id,stack_name)
         VALUES ($1,$2,$3,$4,$5) RETURNING {STACK_JSON}"
    )))
    .bind(target.company_id)
    .bind(target.area_id)
    .bind(target.store_id)
    .bind(target.node_id)
    .bind(name)
    .fetch_one(db)
    .await
    .map_err(database_error)
}

pub async fn expire(db: &mut PgConnection, node: Uuid) -> Result<(), AuthError> {
    sqlx::query(
        "WITH expired AS (
             UPDATE public.osc_ops_job
             SET status='failed',payload_encrypted=NULL
             WHERE node_id=$1 AND status IN ('queued','running') AND expires_at <= clock_timestamp()
             RETURNING id,company_id,area_id,node_id
         )
         INSERT INTO public.osc_activity_log
             (company_id,area_id,actor_agent_id,action,target_type,target_id,request_id,outcome)
         SELECT company_id,area_id,node_id,'OPS_JOB_EXPIRED','osc_ops_job',id::text,id::text,'FAILURE'
         FROM expired",
    ).bind(node).execute(db).await.map_err(database_error)?;
    Ok(())
}

pub async fn enqueue(
    db: &mut PgConnection,
    target: &Target,
    stack_id: Option<Uuid>,
    claims: &SessionClaims,
    action: &str,
    encrypted: &[u8],
    expires: DateTime<Utc>,
) -> Result<Uuid, AuthError> {
    expire(db, target.node_id).await?;
    sqlx::query_scalar(
        "INSERT INTO public.osc_ops_job
         (company_id,area_id,store_id,node_id,stack_id,actor_user_id,session_id,action,payload_encrypted,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
    )
    .bind(target.company_id).bind(target.area_id).bind(target.store_id).bind(target.node_id)
    .bind(stack_id).bind(claims.sub).bind(claims.jti).bind(action).bind(encrypted).bind(expires)
    .fetch_one(db).await.map_err(database_error)
}

pub async fn job(db: &mut PgConnection, id: Uuid) -> Result<Job, AuthError> {
    sqlx::query_as("SELECT id,stack_id,actor_user_id,session_id,area_id,action,status,expires_at,payload_encrypted
                    FROM public.osc_ops_job WHERE id=$1")
        .bind(id).fetch_optional(db).await.map_err(database_error)?.ok_or(AuthError::NotFound)
}

pub async fn output(
    db: &mut PgConnection,
    id: Uuid,
    after: i32,
) -> Result<Vec<(i32, Vec<u8>)>, AuthError> {
    sqlx::query_as(
        "SELECT seq,output_encrypted FROM public.osc_ops_event
                    WHERE job_id=$1 AND seq>$2 ORDER BY seq LIMIT 128",
    )
    .bind(id)
    .bind(after)
    .fetch_all(db)
    .await
    .map_err(database_error)
}

pub async fn agent_transaction(
    pool: &PgPool,
    agent: &AgentScope,
    id: Uuid,
) -> Result<Transaction<'static, Postgres>, AuthError> {
    let mut db = pool.begin().await.map_err(database_error)?;
    modules::set_tenant_scope(&mut db, agent.company_id, &[agent.area_id]).await?;
    let active: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM public.osc_agent_node
         WHERE id=$1 AND company_id=$2 AND area_id=$3 AND is_active AND status <> 'DISABLED'
         FOR SHARE",
    )
    .bind(id)
    .bind(agent.company_id)
    .bind(agent.area_id)
    .fetch_optional(&mut *db)
    .await
    .map_err(database_error)?;
    active.ok_or(AuthError::NotFound)?;
    Ok(db)
}

pub async fn claim(
    db: &mut PgConnection,
    node: Uuid,
    compose: bool,
) -> Result<Option<Job>, AuthError> {
    expire(db, node).await?;
    sqlx::query(
        "DELETE FROM public.osc_ops_job WHERE node_id=$1 AND expires_at<now()-interval '24 hours'",
    )
    .bind(node)
    .execute(&mut *db)
    .await
    .map_err(database_error)?;
    sqlx::query_as(
        "UPDATE public.osc_ops_job SET status='running' WHERE node_id=$1 AND status='queued'
         AND expires_at>clock_timestamp() AND ($2 OR action='terminal' OR action LIKE 'docker.%')
         RETURNING id,stack_id,actor_user_id,session_id,area_id,action,status,expires_at,payload_encrypted",
    ).bind(node).bind(compose).fetch_optional(db).await.map_err(database_error)
}

pub async fn record_output(
    db: &mut PgConnection,
    key: &[u8; 32],
    node: Uuid,
    id: Uuid,
    seq: i32,
    output: &str,
) -> Result<(), AuthError> {
    let eligible: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM public.osc_ops_job WHERE id=$1 AND node_id=$2
         AND status='running' AND expires_at >= clock_timestamp() FOR UPDATE",
    )
    .bind(id)
    .bind(node)
    .fetch_optional(&mut *db)
    .await
    .map_err(database_error)?;
    eligible.ok_or(AuthError::Conflict)?;
    let last: Option<i32> =
        sqlx::query_scalar("SELECT max(seq) FROM public.osc_ops_event WHERE job_id=$1")
            .bind(id)
            .fetch_one(&mut *db)
            .await
            .map_err(database_error)?;
    if seq > last.unwrap_or(0) + 1 {
        return Err(AuthError::Conflict);
    }
    if seq <= last.unwrap_or(0) {
        let previous: Vec<u8> = sqlx::query_scalar(
            "SELECT output_encrypted FROM public.osc_ops_event WHERE job_id=$1 AND seq=$2",
        )
        .bind(id)
        .bind(seq)
        .fetch_one(&mut *db)
        .await
        .map_err(database_error)?;
        return if crypto::decrypt_secret(key, &previous)? == output.as_bytes() {
            Ok(())
        } else {
            Err(AuthError::Conflict)
        };
    }
    let cipher = crypto::encrypt_secret(key, output.as_bytes())?;
    sqlx::query("INSERT INTO public.osc_ops_event(job_id,seq,output_encrypted) VALUES ($1,$2,$3)")
        .bind(id)
        .bind(seq)
        .bind(cipher)
        .execute(db)
        .await
        .map_err(database_error)?;
    Ok(())
}

pub async fn finish(
    db: &mut PgConnection,
    key: &[u8; 32],
    node: Uuid,
    id: Uuid,
    success: bool,
) -> Result<(), AuthError> {
    let job: Job = sqlx::query_as(
        "SELECT id,stack_id,actor_user_id,session_id,area_id,action,status,expires_at,payload_encrypted
         FROM public.osc_ops_job WHERE id=$1 AND node_id=$2 FOR UPDATE",
    ).bind(id).bind(node).fetch_optional(&mut *db).await.map_err(database_error)?
        .ok_or(AuthError::NotFound)?;
    let status = if success { "succeeded" } else { "failed" };
    if job.status == status {
        return Ok(());
    }
    if job.status != "running" || job.expires_at < Utc::now() {
        return Err(AuthError::Conflict);
    }

    if let Some(stack_id) = job.stack_id {
        let next = match (success, job.action.as_str()) {
            (true, "up" | "restart") => Some("RUNNING"),
            (true, "down") => Some("STOPPED"),
            (true, "save") => Some("READY"),
            (false, "up" | "restart" | "down") => Some("ERROR"),
            _ => None,
        };
        let env = if success && job.action == "save" {
            let args = decode_payload(key, &job)?;
            args.input
                .env
                .as_deref()
                .map(|s| crypto::encrypt_secret(key, s.as_bytes()))
                .transpose()?
        } else {
            None
        };
        sqlx::query(
            "UPDATE public.osc_compose_stack SET
                 status=CASE WHEN $2='READY' AND status IN ('RUNNING','STOPPED') THEN status
                             ELSE coalesce($2,status) END,
                 env_encrypted=CASE WHEN $3 THEN $4 ELSE env_encrypted END,
                 last_deployed_at=CASE WHEN $5 THEN clock_timestamp() ELSE last_deployed_at END
             WHERE id=$1",
        )
        .bind(stack_id)
        .bind(next)
        .bind(env.is_some())
        .bind(env)
        .bind(success && matches!(job.action.as_str(), "up" | "restart"))
        .execute(&mut *db)
        .await
        .map_err(database_error)?;
    }

    sqlx::query("UPDATE public.osc_ops_job SET status=$2,payload_encrypted=NULL WHERE id=$1")
        .bind(id)
        .bind(status)
        .execute(&mut *db)
        .await
        .map_err(database_error)?;
    sqlx::query(
        "INSERT INTO public.osc_activity_log
         (company_id,area_id,actor_agent_id,action,target_type,target_id,request_id,outcome)
         SELECT company_id,area_id,node_id,$2,'osc_ops_job',id::text,id::text,$3
         FROM public.osc_ops_job WHERE id=$1",
    )
    .bind(id)
    .bind(if job.action == "terminal" {
        "WEB_TERMINAL_COMPLETED"
    } else if job.action.starts_with("docker.") {
        "CONTAINER_JOB_COMPLETED"
    } else {
        "COMPOSE_JOB_COMPLETED"
    })
    .bind(if success { "SUCCESS" } else { "FAILURE" })
    .execute(db)
    .await
    .map_err(database_error)?;
    Ok(())
}

pub fn decode_payload(key: &[u8; 32], job: &Job) -> Result<JobPayload, AuthError> {
    let cipher = job
        .payload_encrypted
        .as_deref()
        .ok_or(AuthError::Internal)?;
    serde_json::from_slice(&crypto::decrypt_secret(key, cipher)?).map_err(|_| AuthError::Internal)
}

pub async fn audit_request(
    db: &mut PgConnection,
    claims: &SessionClaims,
    target: &Target,
    id: Uuid,
    action: &str,
    command: Option<&str>,
    denied: bool,
) -> Result<(), AuthError> {
    let terminal = action == "terminal";
    sqlx::query(
        "INSERT INTO public.osc_activity_log
         (company_id,area_id,actor_user_id,action,target_type,target_id,request_id,details,outcome)
         VALUES($1,$2,$3,$4,'osc_agent_node',$5,$6,$7,$8)",
    )
    .bind(target.company_id)
    .bind(target.area_id)
    .bind(claims.sub)
    .bind(match (terminal, denied, action.starts_with("docker.")) {
        (true, true, _) => "WEB_TERMINAL_DENIED",
        (true, false, _) => "WEB_TERMINAL_QUEUED",
        (false, _, true) => "CONTAINER_JOB_QUEUED",
        (false, _, false) => "COMPOSE_JOB_QUEUED",
    })
    .bind(target.node_id.to_string())
    .bind(id.to_string())
    .bind(if terminal {
        serde_json::json!({"command":command})
    } else {
        serde_json::json!({"action":action})
    })
    .bind(if denied { "DENIED" } else { "SUCCESS" })
    .execute(db)
    .await
    .map_err(database_error)?;
    Ok(())
}
