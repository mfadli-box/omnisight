use serde_json::{Map, Value, json};
use sqlx::{PgConnection, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    application::modules::{Action, Resource, ValidatedFields},
    domain::{AuthError, SessionClaims},
};

pub fn database_error(error: sqlx::Error) -> AuthError {
    match error
        .as_database_error()
        .and_then(|error| error.code())
        .as_deref()
    {
        Some("23505" | "23503") => AuthError::Conflict,
        Some("23502" | "23514" | "22001" | "22P02" | "22003") => AuthError::InvalidInput,
        _ => {
            tracing::warn!(event = "module_query_failed", sqlstate = ?error.as_database_error().and_then(|err| err.code()));
            AuthError::DependencyUnavailable
        }
    }
}

pub fn company(claims: &SessionClaims) -> Result<Uuid, AuthError> {
    claims.company_id.ok_or(AuthError::InvalidChallenge)
}

// Area and actor expressions are server-owned SQL. Values from HTTP are bound separately.
pub fn permission(action: Action, actor: &str, company: &str, area: &str, menu: &str) -> String {
    let flag = action.flag();
    format!("EXISTS (
        SELECT 1 FROM public.osc_user_access grant_row
        JOIN public.osc_role role_row ON role_row.id=grant_row.role_id
            AND role_row.company_id=grant_row.company_id AND role_row.is_active
        JOIN public.osc_company_menu role_menu ON role_menu.company_id=grant_row.company_id
            AND role_menu.role_id=grant_row.role_id
        JOIN public.osc_company_menu_entitlement entitlement
            ON entitlement.company_id=role_menu.company_id AND entitlement.module_code=role_menu.menu_code
        JOIN public.osc_menu menu_row ON menu_row.code=role_menu.menu_code AND menu_row.is_active
        WHERE grant_row.user_id={actor} AND grant_row.company_id={company} AND grant_row.is_active
            AND (grant_row.area_id IS NULL OR grant_row.area_id={area})
            AND role_menu.menu_code={menu} AND entitlement.is_enabled
            AND role_menu.{flag} AND entitlement.{flag}
    )")
}

pub async fn require(
    db: &mut PgConnection,
    claims: &SessionClaims,
    area: Option<Uuid>,
    menu: &str,
    action: Action,
) -> Result<(), AuthError> {
    if area.is_some_and(|area| !claims.allowed_area_ids.contains(&area))
        || (area.is_none() && claims.area_id.is_some())
    {
        return Err(AuthError::Forbidden);
    }
    let allowed: bool = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT public.osc_rls_scope_allowed($2,$3) AND {}",
        permission(action, "$1", "$2", "$3", "$4")
    )))
    .bind(claims.sub)
    .bind(company(claims)?)
    .bind(area)
    .bind(menu)
    .fetch_one(db)
    .await
    .map_err(database_error)?;
    if !allowed {
        return Err(AuthError::Forbidden);
    }
    Ok(())
}

impl Resource {
    pub fn table(self) -> &'static str {
        match self {
            Self::Nodes => "osc_agent_node",
            Self::Targets => "osc_pam_target",
            Self::Documents => "osc_sop_document",
            Self::Companies => "osc_company",
            Self::Areas => "osc_area",
            Self::Stores => "osc_store",
        }
    }

    fn company_column(self) -> &'static str {
        if self == Self::Companies {
            "t.id"
        } else {
            "t.company_id"
        }
    }

    fn area_column(self) -> &'static str {
        match self {
            Self::Companies => "NULL::uuid",
            Self::Areas => "t.id",
            _ => "t.area_id",
        }
    }

    fn projection(self) -> &'static str {
        match self {
            Self::Nodes => "(to_jsonb(t) - ARRAY['agent_secret_hash','credential_ref'])
                || jsonb_build_object('status', CASE
                    WHEN t.status='ONLINE' AND t.last_seen_at <= now() - interval '15 minutes'
                    THEN 'STALE' ELSE t.status END)",
            Self::Targets => "to_jsonb(t) - 'credential_ref'",
            Self::Companies => {
                "to_jsonb(t) - ARRAY['hris_login_url','ad_ldap_url','oidc_tenant_id']"
            }
            Self::Documents => "to_jsonb(t) - 'rustfs_object_key'",
            _ => "to_jsonb(t)",
        }
    }

    fn visible(self) -> &'static str {
        if self == Self::Documents {
            "t.is_active AND t.approval_status <> 'ARCHIVED'"
        } else {
            "t.is_active"
        }
    }
}

pub async fn agent_status(
    db: &mut PgConnection,
    claims: &SessionClaims,
    limit: i64,
    offset: i64,
) -> Result<Vec<Value>, AuthError> {
    read_for_menu(db, claims, Resource::Nodes, None, (limit, offset), "OP02").await
}

pub async fn read(
    db: &mut PgConnection,
    claims: &SessionClaims,
    resource: Resource,
    id: Option<Uuid>,
    limit: i64,
    offset: i64,
) -> Result<Vec<Value>, AuthError> {
    read_for_menu(db, claims, resource, id, (limit, offset), resource.menu()).await
}

pub(super) async fn read_for_menu(
    db: &mut PgConnection,
    claims: &SessionClaims,
    resource: Resource,
    id: Option<Uuid>,
    (limit, offset): (i64, i64),
    menu: &str,
) -> Result<Vec<Value>, AuthError> {
    let tenant = resource.company_column();
    let area = resource.area_column();
    let sql = format!(
        "SELECT {} FROM public.{} t
         WHERE {tenant}=$2 AND {} AND ($5::uuid IS NULL OR t.id=$5)
             AND ({area} IS NULL OR {area}=ANY($3))
             AND ($8::uuid IS NULL OR {area} IS NOT NULL)
             AND public.osc_rls_scope_allowed({tenant},{area}) AND {}
         ORDER BY t.id LIMIT $6 OFFSET $7",
        resource.projection(),
        resource.table(),
        resource.visible(),
        permission(Action::View, "$1", tenant, area, "$4")
    );
    let rows = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(claims.sub)
        .bind(company(claims)?)
        .bind(&claims.allowed_area_ids)
        .bind(menu)
        .bind(id)
        .bind(limit)
        .bind(offset)
        .bind(claims.area_id)
        .fetch_all(db)
        .await
        .map_err(database_error)?;
    Ok(rows)
}

fn scoped_area(
    input: &mut Map<String, Value>,
    claims: &SessionClaims,
) -> Result<Option<Uuid>, AuthError> {
    match input.remove("area_id") {
        Some(Value::String(value)) => Uuid::parse_str(&value)
            .map(Some)
            .map_err(|_| AuthError::InvalidInput),
        Some(Value::Null) => Ok(None),
        Some(_) => Err(AuthError::InvalidInput),
        None => Ok(claims.area_id),
    }
}

pub async fn create(
    db: &mut PgConnection,
    claims: &SessionClaims,
    resource: Resource,
    input: ValidatedFields,
) -> Result<Value, AuthError> {
    let mut input = input.into_map();
    let company_id = company(claims)?;
    let area = match resource {
        Resource::Companies | Resource::Areas => None,
        Resource::Nodes => {
            let store = input["store_id"]
                .as_str()
                .and_then(|value| Uuid::parse_str(value).ok())
                .ok_or(AuthError::InvalidInput)?;
            Some(sqlx::query_scalar::<_, Uuid>(
                "SELECT area_id FROM public.osc_store WHERE id=$1 AND company_id=$2 AND is_active FOR SHARE"
            ).bind(store).bind(company_id).fetch_optional(&mut *db).await.map_err(database_error)?
                .ok_or(AuthError::NotFound)?)
        }
        _ => scoped_area(&mut input, claims)?,
    };
    require(db, claims, area, resource.menu(), Action::Create).await?;
    if resource != Resource::Companies {
        input.insert("company_id".into(), json!(company_id));
    }
    if matches!(
        resource,
        Resource::Documents | Resource::Nodes | Resource::Stores | Resource::Targets
    ) {
        input.insert("area_id".into(), json!(area));
    }
    if resource == Resource::Documents {
        input.insert("created_by".into(), json!(claims.sub));
    }
    let columns = input
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(", ");
    let table = resource.table();
    let sql = format!(
        "INSERT INTO public.{table} AS t ({columns})
         SELECT {columns} FROM jsonb_populate_record(NULL::public.{table},$1)
         RETURNING {}",
        resource.projection()
    );
    let row: Value = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(Value::Object(input))
        .fetch_one(&mut *db)
        .await
        .map_err(database_error)?;
    let id = serde_json::from_value(row["id"].clone()).map_err(|_| AuthError::Internal)?;
    if resource == Resource::Companies {
        bootstrap_company(db, claims.sub, company_id, id).await?;
    }
    audit(db, claims, area, "RESOURCE_CREATED", table, id).await?;
    Ok(row)
}

async fn bootstrap_company(
    db: &mut PgConnection,
    actor: Uuid,
    source: Uuid,
    target: Uuid,
) -> Result<(), AuthError> {
    let role: Uuid = sqlx::query_scalar(
        "INSERT INTO public.osc_role(company_id,role_code,role_name)
         VALUES($1,'FOUNDING_ADMIN','Founding administrator') RETURNING id",
    )
    .bind(target)
    .fetch_one(&mut *db)
    .await
    .map_err(database_error)?;
    sqlx::query(
        "INSERT INTO public.osc_company_menu_entitlement
             (company_id,module_code,is_enabled,can_view,can_create,can_update,can_delete)
         SELECT $1,module_code,is_enabled,can_view,can_create,can_update,can_delete
         FROM public.osc_company_menu_entitlement WHERE company_id=$2",
    )
    .bind(target)
    .bind(source)
    .execute(&mut *db)
    .await
    .map_err(database_error)?;
    sqlx::query(
        "INSERT INTO public.osc_company_menu(company_id,role_id,menu_code,can_view,can_create,can_update,can_delete)
         SELECT $1,$2,m.menu_code,m.can_view,m.can_create,m.can_update,m.can_delete
         FROM public.osc_user_access ua
         JOIN public.osc_role r ON r.id=ua.role_id AND r.is_active
         JOIN public.osc_company_menu m ON m.company_id=ua.company_id AND m.role_id=ua.role_id
         WHERE ua.company_id=$3 AND ua.user_id=$4 AND ua.area_id IS NULL AND ua.is_active"
    ).bind(target).bind(role).bind(source).bind(actor).execute(&mut *db).await.map_err(database_error)?;
    sqlx::query("INSERT INTO public.osc_user_access(user_id,company_id,role_id) VALUES($1,$2,$3)")
        .bind(actor)
        .bind(target)
        .bind(role)
        .execute(db)
        .await
        .map_err(database_error)?;
    Ok(())
}

pub async fn change(
    db: &mut PgConnection,
    claims: &SessionClaims,
    resource: Resource,
    id: Uuid,
    input: Option<ValidatedFields>,
) -> Result<Value, AuthError> {
    let table = resource.table();
    let tenant = resource.company_column();
    let area = resource.area_column();
    let action = if input.is_some() {
        Action::Update
    } else {
        Action::Delete
    };
    let sql = format!(
        "SELECT {area} FROM public.{table} t
         WHERE t.id=$1 AND {tenant}=$2 AND {} FOR UPDATE",
        resource.visible()
    );
    let scope: Option<Uuid> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .bind(company(claims)?)
        .fetch_optional(&mut *db)
        .await
        .map_err(database_error)?
        .ok_or(AuthError::NotFound)?;
    require(db, claims, scope, resource.menu(), action).await?;
    if let Some(input) = input {
        let input = input.into_map();
        let mut query = QueryBuilder::<Postgres>::new(format!("UPDATE public.{table} AS t SET "));
        let mut assignments = query.separated(", ");
        for key in input.keys() {
            assignments.push(format!("{key}=v.{key}"));
        }
        assignments.push("updated_at=now()");
        query.push(format!(" FROM jsonb_populate_record(NULL::public.{table},"));
        query.push_bind(Value::Object(input));
        query.push(") v WHERE t.id=");
        query.push_bind(id);
        query.push(format!(" RETURNING {}", resource.projection()));
        let result = query
            .build_query_scalar()
            .fetch_one(&mut *db)
            .await
            .map_err(database_error)?;
        audit(db, claims, scope, "RESOURCE_UPDATED", table, id).await?;
        return Ok(result);
    }

    // Audit while the company/area still satisfies the activity-log RLS policy.
    audit(db, claims, scope, "RESOURCE_DELETED", table, id).await?;
    let sql = match resource {
        Resource::Companies => format!(
            "UPDATE public.{table} SET is_active=false,updated_at=now() WHERE id=$1 AND EXISTS (
                SELECT 1 FROM public.osc_company other WHERE other.id<>$1 AND other.is_active AND {}
             )",
            permission(Action::Update, "$2", "other.id", "NULL::uuid", "'SA01'")
        ),
        Resource::Areas => format!(
            "UPDATE public.{table} SET is_active=false,updated_at=now() WHERE id=$1
             AND NOT EXISTS (SELECT 1 FROM public.osc_user_access WHERE area_id=$1 AND is_active)
             AND NOT EXISTS (SELECT 1 FROM public.osc_store WHERE area_id=$1 AND is_active)"
        ),
        Resource::Stores => {
            format!("UPDATE public.{table} SET is_active=false,updated_at=now() WHERE id=$1")
        }
        Resource::Documents => format!(
            "UPDATE public.{table} SET approval_status='ARCHIVED',approved_by=NULL,approved_at=NULL,updated_at=now() WHERE id=$1"
        ),
        _ => format!("DELETE FROM public.{table} WHERE id=$1"),
    };
    let mut query = sqlx::query(sqlx::AssertSqlSafe(sql)).bind(id);
    if resource == Resource::Companies {
        query = query.bind(claims.sub);
    }
    if query
        .execute(db)
        .await
        .map_err(database_error)?
        .rows_affected()
        != 1
    {
        return Err(AuthError::Conflict);
    }
    Ok(json!({"id":id,"deleted":true}))
}

pub async fn audit(
    db: &mut PgConnection,
    claims: &SessionClaims,
    area: Option<Uuid>,
    action: &str,
    object: &str,
    id: Uuid,
) -> Result<(), AuthError> {
    sqlx::query(
        "INSERT INTO public.osc_activity_log(company_id,area_id,actor_user_id,action,target_type,target_id,request_id)
         VALUES($1,$2,$3,$4,$5,$6,$7)"
    )
    .bind(company(claims)?).bind(area).bind(claims.sub).bind(action).bind(object)
    .bind(id.to_string()).bind(Uuid::new_v4().to_string())
    .execute(db).await.map_err(database_error)?;
    Ok(())
}
