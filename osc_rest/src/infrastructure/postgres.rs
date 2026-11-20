use async_trait::async_trait;
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use uuid::Uuid;

use crate::{
    application::ports::AuthRepository,
    domain::{AuthError, CompanyAuth, HrisProfile, LoginPrincipal, PublicCompany, UserAuth},
};

#[derive(Clone)]
pub struct PgAuthRepository {
    pool: PgPool,
}

impl PgAuthRepository {
    pub async fn connect(url: &str) -> Result<Self, AuthError> {
        let pool = PgPoolOptions::new()
            .max_connections(20)
            .connect(url)
            .await
            .map_err(|_| AuthError::Configuration)?;
        Ok(Self { pool })
    }

    pub fn pool(&self) -> PgPool {
        self.pool.clone()
    }

    async fn user_by_id(&self, id: Uuid) -> Result<UserAuth, AuthError> {
        let row = sqlx::query("SELECT id, username, email, full_name, password_hash, auth_source, last_hris_sync_at, mfa_enabled, mfa_secret_encrypted, mfa_last_verified_step, mfa_last_verified_at, mfa_backup_codes_hash FROM public.osc_user WHERE id=$1")
            .bind(id).fetch_optional(&self.pool).await.map_err(|_| AuthError::DependencyUnavailable)?
            .ok_or(AuthError::InvalidCredentials)?;
        row_to_user(&row)
    }

    async fn find_login_user(
        &self,
        username: &str,
        company_id: Option<Uuid>,
        source: &str,
    ) -> Result<(UserAuth, LoginPrincipal), AuthError> {
        let row = sqlx::query(r#"
            SELECT u.id,u.username,u.email,u.full_name,u.password_hash,u.auth_source,u.last_hris_sync_at,
                   u.mfa_enabled,u.mfa_secret_encrypted,u.mfa_last_verified_step,u.mfa_last_verified_at,u.mfa_backup_codes_hash,
                   ua.company_id,ua.area_id,
                   CASE WHEN ua.area_id IS NULL THEN
                     COALESCE((SELECT array_agg(a.id ORDER BY a.id) FROM public.osc_area a WHERE a.company_id=ua.company_id AND a.is_active), ARRAY[]::uuid[])
                   ELSE ARRAY[ua.area_id] END AS allowed_area_ids
            FROM public.osc_user u
            JOIN public.osc_user_access ua ON ua.user_id=u.id AND ua.is_active
            JOIN public.osc_company c ON c.id=ua.company_id AND c.is_active
            JOIN public.osc_role r ON r.id=ua.role_id AND r.company_id=ua.company_id AND r.is_active
            LEFT JOIN public.osc_area a ON a.id=ua.area_id AND a.company_id=ua.company_id
            WHERE lower(u.username)=lower($1) AND u.is_active AND ($2::uuid IS NULL OR ua.company_id=$2)
              AND (ua.area_id IS NULL OR a.is_active)
              AND u.auth_source = $3 AND c.auth_provider = $3
              AND ($3 <> 'HRIS_ASMX' OR
                u.company_id = c.id OR (u.company_id IS NULL AND NOT EXISTS (
                    SELECT 1 FROM public.osc_user_access other_access
                    JOIN public.osc_company other_company ON other_company.id = other_access.company_id
                    WHERE other_access.user_id = u.id AND other_company.id <> c.id
                      AND other_company.auth_provider = 'HRIS_ASMX'
                )))
            ORDER BY (ua.company_id=$2) DESC NULLS LAST, ua.is_default DESC, ua.area_id NULLS FIRST, ua.company_id
            LIMIT 1
        "#).bind(username).bind(company_id).bind(source).fetch_optional(&self.pool).await.map_err(|_| AuthError::DependencyUnavailable)?
            .ok_or(AuthError::InvalidCredentials)?;
        let user = row_to_user(&row)?;
        let allowed_area_ids: Vec<Uuid> = row
            .try_get("allowed_area_ids")
            .map_err(|_| AuthError::Internal)?;
        let principal = LoginPrincipal {
            user_id: user.id,
            username: user.username.clone(),
            full_name: user.full_name.clone(),
            email: user.email.clone(),
            company_id: row.try_get("company_id").map_err(|_| AuthError::Internal)?,
            area_id: row.try_get("area_id").map_err(|_| AuthError::Internal)?,
            allowed_area_ids,
            mfa_enabled: user.mfa_enabled,
            mfa_last_verified_at: user.mfa_last_verified_at,
        };
        Ok((user, principal))
    }

    async fn activity_insert(
        &self,
        company_id: Uuid,
        area_id: Option<Uuid>,
        actor: Option<Uuid>,
        action: &str,
        outcome: &str,
        target: Option<Uuid>,
    ) -> Result<(), AuthError> {
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        let areas = match area_id {
            Some(id) => id.to_string(),
            None => {
                let ids: Vec<Uuid> = sqlx::query_scalar(
                    "SELECT id FROM public.osc_area WHERE company_id=$1 AND is_active",
                )
                .bind(company_id)
                .fetch_all(&mut *tx)
                .await
                .map_err(|_| AuthError::DependencyUnavailable)?;
                ids.iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join(",")
            }
        };
        let allowed_area_ids = if areas.is_empty() {
            "{}"
        } else {
            areas.as_str()
        };
        sqlx::query("SELECT set_config('app.current_company_id',$1,true), set_config('app.allowed_area_ids',$2,true)")
            .bind(company_id.to_string())
            .bind(allowed_area_ids)
            .execute(&mut *tx)
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        sqlx::query("INSERT INTO public.osc_activity_log(company_id,area_id,actor_user_id,action,target_type,target_id,outcome,request_id) VALUES($1,$2,$3,$4,CASE WHEN $5::uuid IS NULL THEN NULL ELSE 'osc_user' END,$5::text,$6,$7)")
            .bind(company_id).bind(area_id).bind(actor).bind(action).bind(target).bind(outcome).bind(Uuid::new_v4().to_string())
            .execute(&mut *tx).await.map_err(|_| AuthError::DependencyUnavailable)?;
        tx.commit()
            .await
            .map_err(|_| AuthError::DependencyUnavailable)
    }
}

fn row_to_user(row: &sqlx::postgres::PgRow) -> Result<UserAuth, AuthError> {
    let hashes: sqlx::types::Json<Vec<String>> = row
        .try_get("mfa_backup_codes_hash")
        .map_err(|_| AuthError::Internal)?;
    Ok(UserAuth {
        id: row.try_get("id").map_err(|_| AuthError::Internal)?,
        username: row.try_get("username").map_err(|_| AuthError::Internal)?,
        email: row.try_get("email").map_err(|_| AuthError::Internal)?,
        full_name: row.try_get("full_name").map_err(|_| AuthError::Internal)?,
        password_hash: row
            .try_get("password_hash")
            .map_err(|_| AuthError::Internal)?,
        auth_source: row
            .try_get("auth_source")
            .map_err(|_| AuthError::Internal)?,
        last_hris_sync_at: row
            .try_get("last_hris_sync_at")
            .map_err(|_| AuthError::Internal)?,
        mfa_enabled: row
            .try_get("mfa_enabled")
            .map_err(|_| AuthError::Internal)?,
        mfa_secret_encrypted: row
            .try_get("mfa_secret_encrypted")
            .map_err(|_| AuthError::Internal)?,
        mfa_last_verified_step: row
            .try_get("mfa_last_verified_step")
            .map_err(|_| AuthError::Internal)?,
        mfa_last_verified_at: row
            .try_get("mfa_last_verified_at")
            .map_err(|_| AuthError::Internal)?,
        mfa_backup_codes_hash: hashes.0,
    })
}

#[async_trait]
impl AuthRepository for PgAuthRepository {
    async fn public_companies(&self) -> Result<Vec<PublicCompany>, AuthError> {
        let companies = sqlx::query_as::<_, (Uuid, String, String)>(
            "SELECT id, code, name FROM public.osc_company WHERE is_active ORDER BY name, code",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(companies
            .into_iter()
            .map(|(id, code, name)| PublicCompany { id, code, name })
            .collect())
    }

    async fn auth_user_by_id(&self, user_id: Uuid) -> Result<UserAuth, AuthError> {
        self.user_by_id(user_id).await
    }

    async fn principal_for_user(
        &self,
        user_id: Uuid,
        company_id: Uuid,
        area_id: Option<Uuid>,
    ) -> Result<LoginPrincipal, AuthError> {
        let row = sqlx::query(r#"
          SELECT u.id,u.username,u.full_name,u.email,u.mfa_enabled,u.mfa_last_verified_at,
            CASE WHEN $3::uuid IS NOT NULL THEN ARRAY[$3::uuid] ELSE
              COALESCE((SELECT array_agg(a.id ORDER BY a.id) FROM public.osc_area a WHERE a.company_id=ua.company_id AND a.is_active),
                       ARRAY[]::uuid[]) END AS allowed_area_ids
          FROM public.osc_user u
          JOIN public.osc_user_access ua ON ua.user_id=u.id AND ua.is_active AND ua.company_id=$2
          JOIN public.osc_company c ON c.id=ua.company_id AND c.is_active
          JOIN public.osc_role r ON r.id=ua.role_id AND r.company_id=ua.company_id AND r.is_active
          WHERE u.id=$1 AND u.is_active AND (ua.area_id IS NULL OR ua.area_id=$3)
            AND ($3::uuid IS NULL OR EXISTS (
                SELECT 1 FROM public.osc_area a WHERE a.id=$3 AND a.company_id=$2 AND a.is_active))
          ORDER BY ua.area_id NULLS LAST LIMIT 1
        "#).bind(user_id).bind(company_id).bind(area_id).fetch_optional(&self.pool)
            .await.map_err(|_| AuthError::DependencyUnavailable)?.ok_or(AuthError::NoActiveAccess)?;
        Ok(LoginPrincipal {
            user_id: row.try_get("id").map_err(|_| AuthError::Internal)?,
            username: row.try_get("username").map_err(|_| AuthError::Internal)?,
            full_name: row.try_get("full_name").map_err(|_| AuthError::Internal)?,
            email: row.try_get("email").map_err(|_| AuthError::Internal)?,
            company_id,
            area_id,
            allowed_area_ids: row
                .try_get("allowed_area_ids")
                .map_err(|_| AuthError::Internal)?,
            mfa_enabled: row
                .try_get("mfa_enabled")
                .map_err(|_| AuthError::Internal)?,
            mfa_last_verified_at: row
                .try_get("mfa_last_verified_at")
                .map_err(|_| AuthError::Internal)?,
        })
    }

    async fn company_auth(&self, company_id: Uuid) -> Result<CompanyAuth, AuthError> {
        let row = sqlx::query("SELECT id, auth_provider, hris_login_url, hris_cache_ttl_hours FROM public.osc_company WHERE id=$1 AND is_active")
            .bind(company_id).fetch_optional(&self.pool).await.map_err(|_| AuthError::DependencyUnavailable)?
            .ok_or(AuthError::CompanyUnavailable)?;
        Ok(CompanyAuth {
            id: row.try_get("id").map_err(|_| AuthError::Internal)?,
            provider: row
                .try_get("auth_provider")
                .map_err(|_| AuthError::Internal)?,
            hris_login_url: row
                .try_get("hris_login_url")
                .map_err(|_| AuthError::Internal)?,
            hris_cache_ttl_hours: row
                .try_get("hris_cache_ttl_hours")
                .map_err(|_| AuthError::Internal)?,
        })
    }

    async fn find_local_user(
        &self,
        username: &str,
        company_id: Option<Uuid>,
    ) -> Result<(UserAuth, LoginPrincipal), AuthError> {
        self.find_login_user(username, company_id, "LOCAL").await
    }

    async fn sync_hris_user(
        &self,
        company_id: Uuid,
        profile: &HrisProfile,
        password_hash: &str,
    ) -> Result<(), AuthError> {
        let result = sqlx::query(r#"
            INSERT INTO public.osc_user AS u
                (username, email, full_name, password_hash, company_id, auth_source, last_hris_sync_at)
            VALUES ($1, $2, $3, $4, $5, 'HRIS_ASMX', now())
            ON CONFLICT (lower(username)) DO UPDATE SET
                email = EXCLUDED.email, full_name = EXCLUDED.full_name,
                password_hash = EXCLUDED.password_hash, company_id = EXCLUDED.company_id,
                last_hris_sync_at = now(), updated_at = now()
            WHERE u.is_active AND u.auth_source = 'HRIS_ASMX'
              AND (u.company_id = $5 OR (
                  u.company_id IS NULL
                  AND EXISTS (
                      SELECT 1 FROM public.osc_user_access own_access
                      WHERE own_access.user_id = u.id AND own_access.company_id = $5
                        AND own_access.is_active
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM public.osc_user_access other_access
                      JOIN public.osc_company other_company ON other_company.id = other_access.company_id
                      WHERE other_access.user_id = u.id AND other_company.id <> $5
                        AND other_company.auth_provider = 'HRIS_ASMX'
                  )
              ))
        "#)
        .bind(&profile.username)
        .bind(&profile.email)
        .bind(&profile.full_name)
        .bind(password_hash)
        .bind(company_id)
        .execute(&self.pool)
        .await
        .map_err(|error| match &error {
            sqlx::Error::Database(db) if db.is_unique_violation() => AuthError::InvalidCredentials,
            _ => AuthError::DependencyUnavailable,
        })?;
        if result.rows_affected() == 0 {
            return Err(AuthError::InvalidCredentials);
        }
        Ok(())
    }

    async fn find_hris_context(
        &self,
        username: &str,
        company_id: Uuid,
    ) -> Result<(UserAuth, LoginPrincipal), AuthError> {
        self.find_login_user(username, Some(company_id), "HRIS_ASMX")
            .await
            .map_err(|error| match error {
                AuthError::InvalidCredentials => AuthError::NoActiveAccess,
                other => other,
            })
    }

    async fn disable_mfa_with_backup_code(
        &self,
        user_id: Uuid,
        expected_hashes: &[String],
    ) -> Result<bool, AuthError> {
        let result = sqlx::query("UPDATE public.osc_user SET mfa_enabled=false,mfa_secret_encrypted=NULL,mfa_last_verified_step=NULL,mfa_last_verified_at=NULL,mfa_backup_codes_hash='[]'::jsonb,updated_at=now() WHERE id=$1 AND mfa_enabled AND mfa_backup_codes_hash=$2::jsonb")
            .bind(user_id).bind(serde_json::to_value(expected_hashes).map_err(|_| AuthError::Internal)?)
            .execute(&self.pool).await.map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(result.rows_affected() == 1)
    }

    async fn enable_mfa(
        &self,
        user_id: Uuid,
        encrypted: &[u8],
        backup_hashes: &[String],
        step: i64,
    ) -> Result<(), AuthError> {
        let result = sqlx::query("UPDATE public.osc_user SET mfa_enabled=true,mfa_secret_encrypted=$2,mfa_backup_codes_hash=$3,mfa_last_verified_step=$4,mfa_last_verified_at=now(),updated_at=now() WHERE id=$1 AND is_active AND NOT mfa_enabled")
            .bind(user_id).bind(encrypted).bind(serde_json::to_value(backup_hashes).map_err(|_| AuthError::Internal)?).bind(step)
            .execute(&self.pool).await.map_err(|_| AuthError::DependencyUnavailable)?;
        if result.rows_affected() != 1 {
            return Err(AuthError::Forbidden);
        }
        Ok(())
    }

    async fn mark_mfa_step(
        &self,
        user_id: Uuid,
        step: i64,
        encrypted: &[u8],
    ) -> Result<bool, AuthError> {
        let result = sqlx::query("UPDATE public.osc_user SET mfa_last_verified_step=$2,mfa_last_verified_at=now(),updated_at=now() WHERE id=$1 AND is_active AND mfa_enabled AND mfa_secret_encrypted=$3 AND COALESCE(mfa_last_verified_step,-1)<$2")
            .bind(user_id).bind(step).bind(encrypted).execute(&self.pool).await.map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(result.rows_affected() == 1)
    }

    async fn mfa_secret(&self, user_id: Uuid) -> Result<Vec<u8>, AuthError> {
        sqlx::query_scalar(
            "SELECT mfa_secret_encrypted FROM public.osc_user WHERE id=$1 AND is_active AND mfa_enabled"
        ).bind(user_id).fetch_optional(&self.pool).await
            .map_err(|_| AuthError::DependencyUnavailable)?.ok_or(AuthError::MfaNotEnabled)
    }

    async fn clear_mfa(&self, user_id: Uuid, expected_secret: &[u8]) -> Result<bool, AuthError> {
        let result = sqlx::query(
            "UPDATE public.osc_user SET mfa_enabled=false,mfa_secret_encrypted=NULL,mfa_last_verified_step=NULL,
                mfa_last_verified_at=NULL,mfa_backup_codes_hash='[]'::jsonb,updated_at=now()
             WHERE id=$1 AND is_active AND mfa_enabled AND mfa_secret_encrypted=$2"
        ).bind(user_id).bind(expected_secret).execute(&self.pool).await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(result.rows_affected() == 1)
    }

    async fn find_user_by_email(&self, email: &str) -> Result<Option<Uuid>, AuthError> {
        sqlx::query_scalar(
            "SELECT id FROM public.osc_user WHERE lower(email)=lower($1) AND is_active",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| AuthError::DependencyUnavailable)
    }

    async fn admin_can_reset_mfa(
        &self,
        admin_id: Uuid,
        target_id: Uuid,
        company_id: Uuid,
        allowed_area_ids: &[Uuid],
        area_id: Option<Uuid>,
    ) -> Result<bool, AuthError> {
        use crate::{application::modules::Action, infrastructure::modules::permission};
        let can_reset = permission(Action::Update, "$1", "$3", "g.area_id", "'SA02'");
        let sql = format!(
            "SELECT EXISTS (SELECT 1 FROM public.osc_user_access g
                WHERE g.user_id=$2 AND g.company_id=$3 AND g.is_active)
             AND NOT EXISTS (SELECT 1 FROM public.osc_user_access g
                WHERE g.user_id=$2 AND g.is_active AND (g.company_id<>$3
                    OR (g.area_id IS NULL AND $5::uuid IS NOT NULL)
                    OR (g.area_id IS NOT NULL AND NOT g.area_id=ANY($4))
                    OR NOT {can_reset}))"
        );
        sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
            .bind(admin_id)
            .bind(target_id)
            .bind(company_id)
            .bind(allowed_area_ids)
            .bind(area_id)
            .fetch_one(&self.pool)
            .await
            .map_err(|_| AuthError::DependencyUnavailable)
    }

    async fn record_activity(
        &self,
        principal: &LoginPrincipal,
        action: &str,
        outcome: &str,
    ) -> Result<(), AuthError> {
        self.activity_insert(
            principal.company_id,
            principal.area_id,
            Some(principal.user_id),
            action,
            outcome,
            None,
        )
        .await
    }

    async fn record_admin_reset(
        &self,
        admin_id: Uuid,
        target_id: Uuid,
        company_id: Uuid,
    ) -> Result<(), AuthError> {
        self.activity_insert(
            company_id,
            None,
            Some(admin_id),
            "MFA_RESET",
            "SUCCESS",
            Some(target_id),
        )
        .await
    }

    async fn record_user_event(&self, user_id: Uuid, action: &str) -> Result<(), AuthError> {
        let user = self.user_by_id(user_id).await?;
        let (_, principal) = self.find_local_user(&user.username, None).await?;
        self.record_activity(&principal, action, "SUCCESS").await
    }
}
