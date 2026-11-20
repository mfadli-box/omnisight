use serde_json::{Value, json};
use sqlx::PgConnection;
use uuid::Uuid;

use super::modules::{audit, company, database_error, permission, require};
use crate::{
    application::modules::Action,
    domain::{AuthError, SessionClaims},
};

const USER_FIELDS: &str = "jsonb_build_object('id',u.id,'username',u.username,'full_name',u.full_name,
    'email',u.email,'auth_source',u.auth_source,'mfa_enabled',u.mfa_enabled,'is_active',u.is_active)";

pub async fn users(
    db: &mut PgConnection,
    claims: &SessionClaims,
    id: Option<Uuid>,
    limit: i64,
    offset: i64,
) -> Result<Vec<Value>, AuthError> {
    let sql = format!(
        "SELECT {USER_FIELDS} FROM public.osc_user u WHERE u.is_active AND ($4::uuid IS NULL OR u.id=$4)
         AND EXISTS (SELECT 1 FROM public.osc_user_access g
             WHERE g.user_id=u.id AND g.company_id=$2 AND g.is_active
             AND (g.area_id=ANY($3) OR (g.area_id IS NULL AND $7::uuid IS NULL))
             AND {})
         ORDER BY u.id LIMIT $5 OFFSET $6",
        permission(Action::View, "$1", "g.company_id", "g.area_id", "'SA02'")
    );
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(claims.sub)
        .bind(company(claims)?)
        .bind(&claims.allowed_area_ids)
        .bind(id)
        .bind(limit)
        .bind(offset)
        .bind(claims.area_id)
        .fetch_all(db)
        .await
        .map_err(database_error)
}

pub async fn audit_logs(
    db: &mut PgConnection,
    claims: &SessionClaims,
    limit: i64,
    offset: i64,
) -> Result<Vec<Value>, AuthError> {
    let sql = format!(
        "SELECT to_jsonb(t)-'details' FROM public.osc_activity_log t
         WHERE t.company_id=$2 AND ($3::uuid IS NULL OR t.area_id=$3) AND {}
         ORDER BY t.id DESC LIMIT $4 OFFSET $5",
        permission(Action::View, "$1", "t.company_id", "t.area_id", "'SA03'")
    );
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(claims.sub)
        .bind(company(claims)?)
        .bind(claims.area_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(db)
        .await
        .map_err(database_error)
}

pub struct NewUser {
    pub username: String,
    pub full_name: String,
    pub email: Option<String>,
    pub hash: String,
    pub role_id: Uuid,
    pub area_id: Option<Uuid>,
}

pub async fn create_user(
    db: &mut PgConnection,
    claims: &SessionClaims,
    user: NewUser,
) -> Result<Value, AuthError> {
    let tenant = company(claims)?;
    require(db, claims, user.area_id, "SA02", Action::Create).await?;
    check_role(db, claims, user.role_id, user.area_id).await?;
    let sql = format!(
        "INSERT INTO public.osc_user AS u (company_id,username,full_name,email,password_hash)
         SELECT id,$2,$3,$4,$5 FROM public.osc_company WHERE id=$1 AND auth_provider='LOCAL'
         RETURNING {USER_FIELDS}"
    );
    let row: Value = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(tenant)
        .bind(user.username)
        .bind(user.full_name)
        .bind(user.email)
        .bind(user.hash)
        .fetch_optional(&mut *db)
        .await
        .map_err(database_error)?
        .ok_or(AuthError::Conflict)?;
    let id: Uuid = serde_json::from_value(row["id"].clone()).map_err(|_| AuthError::Internal)?;
    sqlx::query(
        "INSERT INTO public.osc_user_access(user_id,company_id,role_id,area_id,is_default)
                 VALUES($1,$2,$3,$4,true)",
    )
    .bind(id)
    .bind(tenant)
    .bind(user.role_id)
    .bind(user.area_id)
    .execute(&mut *db)
    .await
    .map_err(database_error)?;
    audit(db, claims, user.area_id, "USER_CREATED", "osc_user", id).await?;
    Ok(row)
}

async fn check_role(
    db: &mut PgConnection,
    claims: &SessionClaims,
    role: Uuid,
    area: Option<Uuid>,
) -> Result<(), AuthError> {
    let unauthorized = [Action::View, Action::Create, Action::Update, Action::Delete]
        .map(|action| {
            let flag = action.flag();
            let actor_permission = permission(action, "$1", "$2", "$4", "m.menu_code");
            format!("(m.{flag} AND NOT {actor_permission})")
        })
        .join(" OR ");
    let sql = format!(
        "SELECT EXISTS (SELECT 1 FROM public.osc_role r WHERE r.id=$3 AND r.company_id=$2 AND r.is_active)
            AND NOT EXISTS (SELECT 1 FROM public.osc_company_menu m
                WHERE m.company_id=$2 AND m.role_id=$3 AND ({unauthorized}))"
    );
    let allowed: bool = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(claims.sub)
        .bind(company(claims)?)
        .bind(role)
        .bind(area)
        .fetch_one(db)
        .await
        .map_err(database_error)?;
    if !allowed {
        return Err(AuthError::Forbidden);
    }
    Ok(())
}

pub async fn change_user(
    db: &mut PgConnection,
    claims: &SessionClaims,
    id: Uuid,
    changes: Option<Value>,
) -> Result<Value, AuthError> {
    let tenant = company(claims)?;
    let deleting = changes.is_none();
    let action = if !deleting {
        Action::Update
    } else {
        Action::Delete
    };
    if id == claims.sub {
        return Err(AuthError::Forbidden);
    }
    let locked: Option<Uuid> = sqlx::query_scalar(
        "SELECT u.id FROM public.osc_user u WHERE u.id=$1 AND u.is_active AND EXISTS (
           SELECT 1 FROM public.osc_user_access g WHERE g.user_id=u.id AND g.company_id=$2 AND g.is_active
         ) FOR UPDATE"
    ).bind(id).bind(tenant).fetch_optional(&mut *db).await.map_err(database_error)?;
    if locked.is_none() {
        return Err(AuthError::NotFound);
    }
    let grants: Vec<(Uuid, Option<Uuid>, Uuid)> = sqlx::query_as(
        "SELECT company_id,area_id,role_id FROM public.osc_user_access WHERE user_id=$1 AND is_active FOR UPDATE"
    ).bind(id).fetch_all(&mut *db).await.map_err(database_error)?;
    for (company_id, area_id, role_id) in grants {
        if company_id != tenant {
            return Err(AuthError::Forbidden);
        }
        require(db, claims, area_id, "SA02", action).await?;
        check_role(db, claims, role_id, area_id).await?;
    }
    let result = if let Some(changes) = changes {
        let sql = format!(
            "UPDATE public.osc_user u SET full_name=coalesce($2->>'full_name',u.full_name),
             email=CASE WHEN $2 ? 'email' THEN $2->>'email' ELSE u.email END,updated_at=now()
             WHERE u.id=$1 RETURNING {USER_FIELDS}"
        );
        sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
            .bind(id)
            .bind(changes)
            .fetch_one(&mut *db)
            .await
            .map_err(database_error)?
    } else {
        sqlx::query("UPDATE public.osc_user SET is_active=false,updated_at=now() WHERE id=$1")
            .bind(id)
            .execute(&mut *db)
            .await
            .map_err(database_error)?;
        sqlx::query(
            "UPDATE public.osc_user_access SET is_active=false,updated_at=now() WHERE user_id=$1",
        )
        .bind(id)
        .execute(&mut *db)
        .await
        .map_err(database_error)?;
        json!({"id":id,"deleted":true})
    };
    audit(
        db,
        claims,
        claims.area_id,
        if deleting {
            "USER_DISABLED"
        } else {
            "USER_UPDATED"
        },
        "osc_user",
        id,
    )
    .await?;
    Ok(result)
}

pub async fn roles(
    db: &mut PgConnection,
    claims: &SessionClaims,
    limit: i64,
    offset: i64,
) -> Result<Vec<Value>, AuthError> {
    require(db, claims, None, "SA03", Action::View).await?;
    sqlx::query_scalar(
        "SELECT to_jsonb(r) FROM public.osc_role r WHERE company_id=$1 AND is_active
                        ORDER BY role_code LIMIT $2 OFFSET $3",
    )
    .bind(company(claims)?)
    .bind(limit)
    .bind(offset)
    .fetch_all(db)
    .await
    .map_err(database_error)
}

pub async fn create_role(
    db: &mut PgConnection,
    claims: &SessionClaims,
    code: String,
    name: String,
) -> Result<Value, AuthError> {
    require(db, claims, None, "SA03", Action::Create).await?;
    let row: Value = sqlx::query_scalar(
        "INSERT INTO public.osc_role AS r(company_id,role_code,role_name) VALUES($1,$2,$3) RETURNING to_jsonb(r)"
    ).bind(company(claims)?).bind(code).bind(name).fetch_one(&mut *db).await.map_err(database_error)?;
    let id = serde_json::from_value(row["id"].clone()).map_err(|_| AuthError::Internal)?;
    audit(db, claims, None, "ROLE_CREATED", "osc_role", id).await?;
    Ok(row)
}

pub async fn company_menus(
    db: &mut PgConnection,
    claims: &SessionClaims,
) -> Result<Vec<Value>, AuthError> {
    require(db, claims, None, "SA03", Action::View).await?;
    sqlx::query_scalar(
        "SELECT to_jsonb(e) || jsonb_build_object('title',m.title,'role_grants',coalesce((
            SELECT jsonb_agg(to_jsonb(rm) ORDER BY rm.role_id)
            FROM public.osc_company_menu rm WHERE rm.company_id=e.company_id AND rm.menu_code=e.module_code
         ),'[]'::jsonb)) FROM public.osc_company_menu_entitlement e
         JOIN public.osc_menu m ON m.code=e.module_code AND m.is_active
         WHERE e.company_id=$1 ORDER BY m.sort_order,m.code"
    ).bind(company(claims)?).fetch_all(db).await.map_err(database_error)
}

pub async fn set_role_menu(
    db: &mut PgConnection,
    claims: &SessionClaims,
    role: Uuid,
    menu: &str,
    flags: [bool; 4],
) -> Result<Value, AuthError> {
    let tenant = company(claims)?;
    require(db, claims, None, "SA03", Action::Update).await?;
    let role_found: Option<Uuid> = sqlx::query_scalar(
        "SELECT r.id FROM public.osc_role r WHERE r.id=$1 AND r.company_id=$2 AND r.is_active AND NOT r.is_system
         AND NOT EXISTS (SELECT 1 FROM public.osc_user_access g WHERE g.role_id=r.id AND g.user_id=$3)
         FOR UPDATE"
    ).bind(role).bind(tenant).bind(claims.sub).fetch_optional(&mut *db).await.map_err(database_error)?;
    if role_found.is_none() {
        return Err(AuthError::Forbidden);
    }
    for (enabled, action) in
        flags
            .into_iter()
            .zip([Action::View, Action::Create, Action::Update, Action::Delete])
    {
        if enabled {
            require(db, claims, None, menu, action).await?;
        }
    }
    let previous: Option<Value> = sqlx::query_scalar(
        "SELECT to_jsonb(g) FROM public.osc_company_menu g WHERE company_id=$1 AND role_id=$2 AND menu_code=$3"
    ).bind(tenant).bind(role).bind(menu).fetch_optional(&mut *db).await.map_err(database_error)?;
    let result: Value = sqlx::query_scalar(
        "INSERT INTO public.osc_company_menu AS g(company_id,role_id,menu_code,can_view,can_create,can_update,can_delete)
         SELECT company_id,$2,module_code,$4,$5,$6,$7 FROM public.osc_company_menu_entitlement
         WHERE company_id=$1 AND module_code=$3 AND is_enabled
         ON CONFLICT(company_id,role_id,menu_code) DO UPDATE SET can_view=excluded.can_view,
           can_create=excluded.can_create,can_update=excluded.can_update,can_delete=excluded.can_delete,updated_at=now()
         RETURNING to_jsonb(g)"
    ).bind(tenant).bind(role).bind(menu).bind(flags[0]).bind(flags[1]).bind(flags[2]).bind(flags[3])
        .fetch_optional(&mut *db).await.map_err(database_error)?.ok_or(AuthError::NotFound)?;
    sqlx::query(
        "INSERT INTO public.osc_activity_log(company_id,actor_user_id,action,target_type,target_id,request_id,details)
         VALUES($1,$2,'ROLE_MENU_UPDATED','osc_company_menu',$3,$4,$5)"
    ).bind(tenant).bind(claims.sub).bind(format!("{role}/{menu}")).bind(Uuid::new_v4().to_string())
        .bind(json!({"before":previous,"after":result})).execute(db).await.map_err(database_error)?;
    Ok(result)
}

pub async fn connector(
    db: &mut PgConnection,
    claims: &SessionClaims,
    id: Uuid,
    update: Option<(&str, Option<&str>, i32)>,
) -> Result<Value, AuthError> {
    if id != company(claims)? {
        return Err(AuthError::NotFound);
    }
    let fields = "jsonb_build_object('company_id',id,'auth_provider',auth_provider,
                          'configured',hris_login_url IS NOT NULL,'hris_cache_ttl_hours',hris_cache_ttl_hours)";
    let action = if update.is_some() {
        Action::Update
    } else {
        Action::View
    };
    require(db, claims, None, "SA04", action).await?;
    let row = if let Some((provider, endpoint, ttl)) = update {
        let sql = format!(
            "UPDATE public.osc_company SET auth_provider=$2,hris_login_url=$3,hris_cache_ttl_hours=$4,updated_at=now()
             WHERE id=$1 AND is_active AND (auth_provider=$2 OR NOT EXISTS (
               SELECT 1 FROM public.osc_user_access g JOIN public.osc_user u ON u.id=g.user_id
               WHERE g.company_id=$1 AND g.is_active AND u.is_active AND u.auth_source<>$2
               AND NOT EXISTS (SELECT 1 FROM public.osc_user_access other
                   JOIN public.osc_company c ON c.id=other.company_id AND c.is_active
                   WHERE other.user_id=u.id AND other.company_id<>$1 AND other.is_active AND c.auth_provider=u.auth_source)
             )) RETURNING {fields}"
        );
        let row = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
            .bind(id)
            .bind(provider)
            .bind(endpoint)
            .bind(ttl)
            .fetch_optional(&mut *db)
            .await
            .map_err(database_error)?
            .ok_or(AuthError::Conflict)?;
        audit(db, claims, None, "CONNECTOR_UPDATED", "osc_company", id).await?;
        row
    } else {
        sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT {fields} FROM public.osc_company WHERE id=$1 AND is_active"
        )))
        .bind(id)
        .fetch_optional(db)
        .await
        .map_err(database_error)?
        .ok_or(AuthError::NotFound)?
    };
    Ok(row)
}
