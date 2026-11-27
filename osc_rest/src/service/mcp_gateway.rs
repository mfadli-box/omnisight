use crate::middleware::rbac::TenantContext;
use serde_json::{json, Value};
use sqlx::{Acquire, PgConnection, PgPool};
use std::time::Instant;
use uuid::Uuid;

#[derive(Clone, Copy, Debug)]
pub(crate) struct Fault {
    pub code: i32,
    pub message: &'static str,
    status: &'static str,
}
impl Fault {
    const fn new(code: i32, message: &'static str, status: &'static str) -> Self {
        Self {
            code,
            message,
            status,
        }
    }
    pub const PARSE: Self = Self::new(-32700, "Parse error", "SANITY_REJECTED");
    pub const INVALID: Self = Self::new(-32600, "Invalid Request", "SANITY_REJECTED");
    pub const METHOD: Self = Self::new(-32601, "Method not found", "SANITY_REJECTED");
    pub const PARAMS: Self = Self::new(-32602, "Invalid params", "SANITY_REJECTED");
    const DENIED: Self = Self::new(-32001, "Access denied", "BLOCKED_RBAC");
    const LIMIT: Self = Self::new(-32002, "Rate limit exceeded", "FAILED");
    const INTERNAL: Self = Self::new(-32603, "Internal error", "FAILED");
    const UNKNOWN: Self = Self::new(-32602, "Tool unavailable", "FAILED");
}

impl From<sqlx::Error> for Fault {
    fn from(_: sqlx::Error) -> Self {
        Self::INTERNAL
    }
}

fn validate(schema: &Value, args: &Value) -> Result<(), Fault> {
    let validator = jsonschema::validator_for(schema).map_err(|_| Fault::INTERNAL)?;
    if args.is_object() && validator.is_valid(args) {
        Ok(())
    } else {
        Err(Fault::PARAMS)
    }
}

async fn dispatch(
    conn: &mut PgConnection,
    ctx: &TenantContext,
    name: &str,
    permission: &str,
    args: &Value,
) -> Result<Value, Fault> {
    match (name, permission) {
        ("count_tickets", "SD01:READ") => {
            let priority = args.get("priority").and_then(Value::as_str);
            let count: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM trx_ticket_issue t
                WHERE t.company_id=$1 AND ($3::text IS NULL OR t.priority=$3)
                AND (t.area_id IS NULL OR EXISTS (SELECT FROM trx_user_area a WHERE
                a.company_id=t.company_id AND a.area_id=t.area_id AND a.user_id=$2))",
            )
            .bind(ctx.company_id)
            .bind(ctx.user_id)
            .bind(priority)
            .fetch_one(conn)
            .await?;
            Ok(json!({"content":[{"type":"text","text":count.to_string()}],"isError":false}))
        }
        _ => Err(Fault::UNKNOWN),
    }
}

pub(crate) async fn call(
    db: &PgPool,
    ctx: &TenantContext,
    token: &str,
    name: &str,
    args: &Value,
) -> Result<Value, Fault> {
    let start = Instant::now();
    let mut tx = db.begin().await?;
    let (session, client, allowed, rpm): (Uuid, Uuid, bool, i32) = sqlx::query_as(
        "SELECT s.session_id,c.client_id,
        jsonb_typeof(c.allowed_tools)='array' AND (c.allowed_tools ? '*' OR c.allowed_tools ? $4),c.rate_limit_rpm
        FROM trx_mcp_session s JOIN dat_mcp_client c ON s.client_id=c.client_id AND s.company_id=c.company_id
        WHERE s.user_id=$1 AND s.company_id=$2 AND s.session_token=$3 AND s.status='ACTIVE' AND c.is_active
        FOR UPDATE OF c FOR SHARE OF s",
    )
    .bind(ctx.user_id)
    .bind(ctx.company_id)
    .bind(token)
    .bind(name)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(Fault::DENIED)?;
    let recent: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM log_mcp_execution WHERE client_id=$1
         AND created_at > clock_timestamp()-interval '1 minute'
         AND error_message IS DISTINCT FROM 'Rate limit exceeded'",
    )
    .bind(client)
    .fetch_one(&mut *tx)
    .await?;
    let tool: Option<(Uuid, Value, String, bool)> = sqlx::query_as(
        "SELECT t.tool_id,t.input_schema_json,t.required_permission,
        EXISTS(SELECT FROM trx_user_company g JOIN dat_permission p ON p.role_id=g.role_id
        JOIN dat_menu m ON m.menu_id=p.menu_id AND m.is_active
        WHERE g.user_id=$2 AND g.company_id=$3 AND g.role_id=$4 AND t.required_permission IN (
        CASE WHEN p.can_read THEN m.sub_module_code || ':READ' END,
        CASE WHEN p.can_execute THEN m.sub_module_code || ':EXECUTE' END,
        CASE WHEN p.can_create THEN m.sub_module_code || ':CREATE' END,
        CASE WHEN p.can_update THEN m.sub_module_code || ':UPDATE' END,
        CASE WHEN p.can_delete THEN m.sub_module_code || ':DELETE' END))
        FROM dat_mcp_tool t WHERE t.tool_code=$1 AND t.is_active FOR SHARE OF t",
    )
    .bind(name)
    .bind(ctx.user_id)
    .bind(ctx.company_id)
    .bind(ctx.role_id)
    .fetch_optional(&mut *tx)
    .await?;
    let result = if recent >= i64::from(rpm) {
        Err(Fault::LIMIT)
    } else if !allowed {
        Err(Fault::DENIED)
    } else {
        match &tool {
            None => Err(Fault::UNKNOWN),
            Some((_, _, _, false)) => Err(Fault::DENIED),
            Some((_, schema, permission, true)) => match validate(schema, args) {
                Err(e) => Err(e),
                Ok(()) => {
                    let mut work = tx.begin().await?;
                    let outcome = dispatch(&mut work, ctx, name, permission, args).await;
                    if outcome.is_ok() {
                        work.commit().await?
                    } else {
                        work.rollback().await?
                    }
                    outcome
                }
            },
        }
    };
    let fault = result.as_ref().err();
    sqlx::query(
        "INSERT INTO log_mcp_execution(session_id,client_id,tool_id,tool_code,input_parameters,
         execution_status,output_result_json,error_message,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(session)
    .bind(client)
    .bind(tool.as_ref().map(|row| row.0))
    .bind(if tool.is_some() { name } else { "<unknown>" })
    .bind(json!({"argument_count":args.as_object().map(|args| args.len())}))
    .bind(fault.map_or("SUCCESS", |error| error.status))
    .bind(result.as_ref().ok())
    .bind(fault.map(|error| error.message))
    .bind(start.elapsed().as_millis() as i64)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_registry_constraints() {
        let schema = json!({"type":"object","properties":{"port":{"type":"integer","minimum":1,"maximum":65535}},"required":["port"],"additionalProperties":false});
        assert!(validate(&schema, &json!({"port":443})).is_ok());
        for args in [
            json!({"port":0}),
            json!({}),
            json!({"port":"443"}),
            json!({"port":443,"extra":0}),
            json!([]),
        ] {
            assert_eq!(validate(&schema, &args).unwrap_err().code, -32602);
        }
        assert_eq!(
            validate(&json!({"type":42}), &json!({})).unwrap_err().code,
            -32603
        );
    }
}
