use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Path, Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Transaction};
use std::sync::Arc as StdArc;
use tokio::sync::Mutex;
use uuid::Uuid;

use super::report_http::{download_report_archive, export_excel, generate_pdf};

use crate::{
    application::{auth::AuthService, modules::Action, token::TokenService},
    domain::{AuthError, SessionClaims},
    infrastructure::modules,
};

pub struct AppState {
    pub auth: Arc<AuthService>,
    pub tokens: Arc<TokenService>,
    pub tenant_pool: PgPool,
    pub cache: Arc<crate::infrastructure::redis_cache::RedisCache>,
    pub storage: Arc<crate::infrastructure::storage::RustFsStorage>,
}

#[derive(Clone)]
pub struct TenantTransaction {
    pub claims: SessionClaims,
    pub transaction: StdArc<Mutex<Option<Transaction<'static, Postgres>>>>,
    pub uploaded_objects: StdArc<Mutex<Vec<String>>>,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub company_id: Option<String>,
    pub username: String,
    pub password: String,
    pub backup_code: Option<String>,
}
#[derive(Deserialize)]
pub struct MfaCodeRequest {
    pub otp: String,
}
#[derive(Deserialize)]
pub struct MfaVerifyRequest {
    pub mfa_challenge_token: String,
    pub otp: String,
}
#[derive(Deserialize)]
pub struct MfaDisableRequest {
    pub password: String,
    pub otp: String,
}
#[derive(Deserialize)]
pub struct ResetRequest {
    pub email: String,
}
#[derive(Deserialize)]
pub struct ResetConfirmRequest {
    pub token: String,
}
#[derive(Deserialize)]
struct SwitchCompanyRequest {
    company_id: Uuid,
    area_id: Option<Uuid>,
}
#[derive(Deserialize)]
struct PamAuthorizeRequest {
    target_id: Uuid,
    #[serde(alias = "requested_reason")]
    reason: String,
    otp: Option<String>,
}

#[derive(Serialize)]
struct ErrorBody {
    error: ErrorDetail,
    meta: Meta,
}
#[derive(Serialize)]
struct ErrorDetail {
    code: &'static str,
    message: &'static str,
}
#[derive(Serialize)]
struct Meta {
    request_id: Uuid,
}

pub fn router(state: Arc<AppState>) -> Router {
    let protected = super::modules_http::routes()
        .route("/baas/v1/auth/mfa/setup", post(setup_mfa))
        .route("/baas/v1/auth/mfa/enable", post(enable_mfa))
        .route("/baas/v1/auth/mfa/disable", post(disable_mfa))
        .route("/baas/v1/users/{user_id}/mfa/reset", post(admin_reset))
        .route("/baas/v1/auth/switch-company", post(switch_company))
        .route("/baas/v1/me/navigation", get(navigation))
        .route("/baas/v1/me/contexts", get(contexts))
        .route("/baas/v1/pam/sessions/authorize", post(pam_authorize))
        .route(
            "/baas/v1/sop-documents/{document_id}/attachment",
            post(upload_sop)
                .get(download_sop)
                .layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
        .route(
            "/baas/v1/sop/documents/{document_id}/attachment",
            post(upload_sop)
                .get(download_sop)
                .layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
        .route(
            "/baas/v1/reports/export-excel/{table_name}",
            get(export_excel),
        )
        .route(
            "/baas/v1/reports/archives/{archive_id}",
            get(download_report_archive),
        )
        .route("/baas/v1/reports/generate-pdf", post(generate_pdf))
        .route_layer(middleware::from_fn_with_state(state.clone(), tenant_auth));

    Router::new()
        .route("/health", get(health))
        .route("/baas/v1/health", get(health))
        .route("/baas/v1/public/companies", get(public_companies))
        .route("/baas/v1/auth/login", post(login))
        .route("/baas/v1/auth/mfa/verify", post(verify_mfa))
        .route("/baas/v1/auth/mfa/reset-request", post(reset_request))
        .route("/baas/v1/auth/mfa/reset-confirm", post(reset_confirm))
        .merge(protected)
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}

async fn public_companies(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, ApiError> {
    let companies = state.auth.public_companies().await?;
    Ok(Json(
        serde_json::json!({"data":companies,"meta":{"request_id":Uuid::new_v4()}}),
    ))
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(input): Json<LoginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if input.username.is_empty()
        || input.username.len() > 128
        || input.password.is_empty()
        || input.password.len() > 1024
    {
        return Err(ApiError(AuthError::InvalidCredentials));
    }
    let company_id = input
        .company_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(Uuid::parse_str)
        .transpose()
        .map_err(|_| ApiError(AuthError::InvalidCredentials))?;
    let result = state
        .auth
        .login(
            company_id,
            input.username,
            input.password,
            input.backup_code,
        )
        .await?;
    Ok((
        StatusCode::OK,
        Json(serde_json::json!({"data":result,"meta":{"request_id":Uuid::new_v4()}})),
    ))
}

async fn setup_mfa(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
) -> Result<impl IntoResponse, ApiError> {
    Ok(Json(
        serde_json::json!({"data":state.auth.setup_mfa(&tenant.claims).await?,"meta":{"request_id":Uuid::new_v4()}}),
    ))
}

async fn enable_mfa(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Json(input): Json<MfaCodeRequest>,
) -> Result<impl IntoResponse, ApiError> {
    Ok(Json(
        serde_json::json!({"data":state.auth.enable_mfa(&tenant.claims,&input.otp).await?,"meta":{"request_id":Uuid::new_v4()}}),
    ))
}

async fn verify_mfa(
    State(state): State<Arc<AppState>>,
    Json(input): Json<MfaVerifyRequest>,
) -> Result<impl IntoResponse, ApiError> {
    Ok(Json(
        serde_json::json!({"data":state.auth.verify_mfa(&input.mfa_challenge_token,&input.otp).await?,"meta":{"request_id":Uuid::new_v4()}}),
    ))
}

async fn disable_mfa(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Json(input): Json<MfaDisableRequest>,
) -> Result<impl IntoResponse, ApiError> {
    state
        .auth
        .disable_mfa(&tenant.claims, &input.password, &input.otp)
        .await?;
    Ok(Json(
        serde_json::json!({"data":{"disabled":true},"meta":{"request_id":Uuid::new_v4()}}),
    ))
}

async fn reset_request(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ResetRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if input.email.len() > 320 {
        return Err(ApiError(AuthError::InvalidCredentials));
    }
    state.auth.reset_request(&input.email).await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(serde_json::json!({"data":{"accepted":true},"meta":{"request_id":Uuid::new_v4()}})),
    ))
}

async fn reset_confirm(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ResetConfirmRequest>,
) -> Result<impl IntoResponse, ApiError> {
    state.auth.reset_confirm(&input.token).await?;
    Ok(Json(
        serde_json::json!({"data":{"reset":true},"meta":{"request_id":Uuid::new_v4()}}),
    ))
}

async fn admin_reset(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path(user_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    state.auth.admin_reset(&tenant.claims, user_id).await?;
    Ok(Json(
        serde_json::json!({"data":{"reset":true},"meta":{"request_id":Uuid::new_v4()}}),
    ))
}

async fn tenant_auth(
    State(state): State<Arc<AppState>>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    let token = extract_token(request.headers());
    let Some(token) = token else {
        return ApiError(AuthError::InvalidChallenge).into_response();
    };
    let mut claims = match state.tokens.decode(&token, "session") {
        Ok(claims) => claims,
        Err(error) => return ApiError(error).into_response(),
    };
    if let Err(error) = state.auth.validate_session(&claims).await {
        return ApiError(error).into_response();
    }
    let principal = match state.auth.principal_from_claims(&claims).await {
        Ok(principal) => principal,
        Err(error) => return ApiError(error).into_response(),
    };
    let company_id = principal.company_id;
    claims
        .allowed_area_ids
        .retain(|area| principal.allowed_area_ids.contains(area));
    if claims
        .area_id
        .is_some_and(|area| !claims.allowed_area_ids.contains(&area))
    {
        return ApiError(AuthError::NoActiveAccess).into_response();
    }
    let mut tx = match state.tenant_pool.begin().await {
        Ok(tx) => tx,
        Err(_) => return ApiError(AuthError::DependencyUnavailable).into_response(),
    };
    let areas = claims
        .allowed_area_ids
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let allowed_area_ids = if areas.is_empty() {
        "{}"
    } else {
        areas.as_str()
    };
    if sqlx::query("SELECT set_config('app.current_company_id',$1,true), set_config('app.allowed_area_ids',$2,true)")
        .bind(company_id.to_string())
        .bind(allowed_area_ids)
        .execute(&mut *tx)
        .await
        .is_err()
    {
        let _ = tx.rollback().await;
        return ApiError(AuthError::DependencyUnavailable).into_response();
    }
    let tenant = TenantTransaction {
        claims,
        transaction: StdArc::new(Mutex::new(Some(tx))),
        uploaded_objects: StdArc::new(Mutex::new(Vec::new())),
    };
    request.extensions_mut().insert(tenant.clone());
    let response = next.run(request).await;
    // Transaksi hanya berlaku untuk satu request. Operasi HTTP yang gagal di-rollback.
    // Handler hanya boleh mengambilnya melalui mutex bersama ini dan tidak boleh melakukan commit.
    let mut guard = tenant.transaction.lock().await;
    let Some(tx) = guard.take() else {
        return ApiError(AuthError::Internal).into_response();
    };
    if response.status().is_success() {
        if tx.commit().await.is_ok() {
            return response;
        }
        // A connection failure can leave the commit outcome unknown. Leave objects intact.
        return ApiError(AuthError::DependencyUnavailable).into_response();
    }
    let _ = tx.rollback().await;
    for key in tenant.uploaded_objects.lock().await.drain(..) {
        state.storage.remove(&key).await;
    }
    response
}

fn extract_token(headers: &HeaderMap) -> Option<String> {
    if let Some(value) = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
    {
        if let Some(token) = value.strip_prefix("Bearer ") {
            return Some(token.to_owned());
        }
    }
    let cookie = headers.get(header::COOKIE)?.to_str().ok()?;
    cookie
        .split(';')
        .map(str::trim)
        .find_map(|part| part.strip_prefix("omnisight_session=").map(str::to_owned))
}

async fn switch_company(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Json(input): Json<SwitchCompanyRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let (principal, token, expires_in) = state
        .auth
        .switch_context(&tenant.claims, input.company_id, input.area_id)
        .await?;
    let mut guard = tenant.transaction.lock().await;
    let tx = guard.as_mut().ok_or(AuthError::Internal)?;
    modules::audit(
        tx,
        &tenant.claims,
        tenant.claims.area_id,
        "CONTEXT_SWITCH",
        "osc_company",
        input.company_id,
    )
    .await?;
    Ok(super::modules_http::envelope(serde_json::json!({
        "access_token": token, "expires_in": expires_in, "company_id": principal.company_id,
        "area_id": principal.area_id, "allowed_area_ids": principal.allowed_area_ids
    })))
}

async fn contexts(
    Extension(tenant): Extension<TenantTransaction>,
) -> Result<impl IntoResponse, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    let tx = guard.as_mut().ok_or(AuthError::Internal)?;
    let entries = sqlx::query_scalar::<_, serde_json::Value>(
        "WITH grants AS (
             SELECT g.company_id, bool_or(g.area_id IS NULL) AS company_wide,
                    array_agg(g.area_id) AS area_ids
             FROM public.osc_user_access g
             JOIN public.osc_role r ON r.id=g.role_id AND r.company_id=g.company_id AND r.is_active
             WHERE g.user_id=$1 AND g.is_active
               AND (g.area_id IS NULL OR EXISTS (
                    SELECT 1 FROM public.osc_area a
                    WHERE a.id=g.area_id AND a.company_id=g.company_id AND a.is_active))
             GROUP BY g.company_id
         )
         SELECT jsonb_build_object('id', c.id, 'name', c.name,
                 'company_wide', g.company_wide,
                 'areas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name)
                                   ORDER BY a.name, a.id)
                                    FROM public.osc_area a
                                    WHERE a.company_id=c.id AND a.is_active
                                      AND (g.company_wide OR a.id=ANY(g.area_ids))),
                                   '[]'::jsonb))
         FROM grants g
         JOIN public.osc_company c ON c.id=g.company_id AND c.is_active
         ORDER BY c.name, c.id",
    )
    .bind(tenant.claims.sub)
    .fetch_all(&mut **tx)
    .await
    .map_err(modules::database_error)?;
    Ok(super::modules_http::envelope(entries))
}

async fn navigation(
    Extension(tenant): Extension<TenantTransaction>,
) -> Result<impl IntoResponse, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    let tx = guard.as_mut().ok_or(AuthError::Internal)?;
    let view = modules::permission(Action::View, "$1", "$2", "scope.area_id", "m.code");
    let sql = format!(
        "SELECT jsonb_build_object('group_code',m.group_code,
            'group_name',coalesce(m.group_name,m.group_code::text),'module_code',m.code,
            'module_name',m.title,'route_path',m.route_path,'icon',m.icon,'sort_order',m.sort_order)
         FROM public.osc_menu m WHERE m.is_active AND EXISTS (
            SELECT 1 FROM unnest($3::uuid[] || CASE WHEN $4::uuid IS NULL THEN ARRAY[NULL::uuid]
              ELSE ARRAY[]::uuid[] END) scope(area_id) WHERE {view}
         ) ORDER BY m.group_code,m.sort_order,m.code"
    );
    let items: Vec<serde_json::Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(tenant.claims.sub)
        .bind(modules::company(&tenant.claims)?)
        .bind(&tenant.claims.allowed_area_ids)
        .bind(tenant.claims.area_id)
        .fetch_all(&mut **tx)
        .await
        .map_err(modules::database_error)?;
    Ok(super::modules_http::envelope(items))
}

async fn pam_authorize(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Json(input): Json<PamAuthorizeRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let reason = input.reason.trim();
    if reason.is_empty() || reason.len() > 1000 || reason.contains('\0') {
        return Err(AuthError::InvalidInput.into());
    }
    let company = modules::company(&tenant.claims)?;
    let mut guard = tenant.transaction.lock().await;
    let tx = guard.as_mut().ok_or(AuthError::Internal)?;
    let area: Uuid = sqlx::query_scalar(
        "SELECT area_id FROM public.osc_pam_target WHERE id=$1 AND company_id=$2 AND is_active FOR SHARE"
    ).bind(input.target_id).bind(company).fetch_optional(&mut **tx).await
        .map_err(modules::database_error)?.ok_or(AuthError::NotFound)?;
    modules::require(tx, &tenant.claims, Some(area), "OP01", Action::Create).await?;
    state
        .auth
        .require_step_up(&tenant.claims, input.otp.as_deref())
        .await?;
    let session = Uuid::new_v4();
    let expiry: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "INSERT INTO public.osc_pam_session(id,company_id,area_id,target_id,user_id,state,requested_reason,expires_at)
         SELECT $1,$2,$3,$4,u.id,'AUTHORIZED',$6,now()+interval '1 hour'
         FROM public.osc_user u WHERE u.id=$5 AND u.is_active AND u.mfa_enabled
           AND u.mfa_last_verified_at >= clock_timestamp() - interval '15 minutes'
         FOR SHARE OF u RETURNING expires_at"
    ).bind(session).bind(company).bind(area).bind(input.target_id).bind(tenant.claims.sub).bind(reason)
        .fetch_optional(&mut **tx).await.map_err(modules::database_error)?;
    let expiry = expiry.ok_or(AuthError::StepUpRequired)?;
    modules::audit(
        tx,
        &tenant.claims,
        Some(area),
        "PAM_SESSION_AUTHORIZED",
        "osc_pam_session",
        session,
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        super::modules_http::envelope(serde_json::json!({
            "session_id":session,"state":"AUTHORIZED","expires_in":3600,"expires_at":expiry
        })),
    ))
}

async fn upload_sop(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path(document_id): Path<Uuid>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, ApiError> {
    if body.is_empty() {
        return Err(AuthError::InvalidInput.into());
    }
    let ctype = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .unwrap_or("application/octet-stream");
    if !matches!(
        ctype,
        "application/pdf"
            | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            | "text/plain"
    ) {
        return Err(AuthError::UnsupportedAttachment.into());
    }
    let signature_ok = match ctype {
        "application/pdf" => body.starts_with(b"%PDF-"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => {
            body.starts_with(b"PK\x03\x04")
        }
        "text/plain" => std::str::from_utf8(&body).is_ok() && !body.contains(&0),
        _ => false,
    };
    if !signature_ok {
        return Err(AuthError::UnsupportedAttachment.into());
    }
    let company = tenant
        .claims
        .company_id
        .ok_or(ApiError(AuthError::InvalidChallenge))?;
    let mut guard = tenant.transaction.lock().await;
    let tx = guard
        .as_mut()
        .ok_or(ApiError(AuthError::DependencyUnavailable))?;
    let area: Option<Uuid> = sqlx::query_scalar(
        "SELECT area_id FROM public.osc_sop_document WHERE id=$1 AND company_id=$2 AND is_active
         AND approval_status<>'ARCHIVED' FOR UPDATE",
    )
    .bind(document_id)
    .bind(company)
    .fetch_optional(&mut **tx)
    .await
    .map_err(modules::database_error)?
    .ok_or(AuthError::NotFound)?;
    modules::require(tx, &tenant.claims, area, "KB01", Action::Update).await?;
    let key = format!("sop/{company}/{document_id}/{}", Uuid::new_v4());
    state
        .storage
        .put(&key, body.to_vec(), ctype)
        .await
        .map_err(|_| ApiError(AuthError::DependencyUnavailable))?;
    tenant.uploaded_objects.lock().await.push(key.clone());
    sqlx::query(
        "UPDATE public.osc_sop_document SET rustfs_object_key=$2,updated_at=now() WHERE id=$1",
    )
    .bind(document_id)
    .bind(&key)
    .execute(&mut **tx)
    .await
    .map_err(|_| ApiError(AuthError::DependencyUnavailable))?;
    modules::audit(
        tx,
        &tenant.claims,
        area,
        "SOP_ATTACHMENT_UPLOADED",
        "osc_sop_document",
        document_id,
    )
    .await?;
    Ok(Json(
        serde_json::json!({"data":{"document_id":document_id,"uploaded":true},"meta":{"request_id":Uuid::new_v4()}}),
    ))
}

async fn download_sop(
    State(state): State<Arc<AppState>>,
    Extension(tenant): Extension<TenantTransaction>,
    Path(document_id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let mut guard = tenant.transaction.lock().await;
    let tx = guard
        .as_mut()
        .ok_or(ApiError(AuthError::DependencyUnavailable))?;
    let (area, key): (Option<Uuid>, Option<String>) = sqlx::query_as(
        "SELECT area_id,rustfs_object_key FROM public.osc_sop_document
         WHERE id=$1 AND company_id=$2 AND is_active AND approval_status<>'ARCHIVED'",
    )
    .bind(document_id)
    .bind(modules::company(&tenant.claims)?)
    .fetch_optional(&mut **tx)
    .await
    .map_err(modules::database_error)?
    .ok_or(AuthError::NotFound)?;
    modules::require(tx, &tenant.claims, area, "KB01", Action::View).await?;
    let key = key.ok_or(AuthError::NotFound)?;
    let bytes = state
        .storage
        .get(&key)
        .await
        .map_err(|_| ApiError(AuthError::DependencyUnavailable))?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (header::CACHE_CONTROL, "private, no-store"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"sop-document\"",
            ),
        ],
        Body::from(bytes),
    )
        .into_response())
}

pub(super) struct ApiError(AuthError);
impl From<AuthError> for ApiError {
    fn from(value: AuthError) -> Self {
        Self(value)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self.0 {
            AuthError::InvalidInput => (
                StatusCode::BAD_REQUEST,
                "INVALID_INPUT",
                "Invalid request data",
            ),
            AuthError::NotFound => (StatusCode::NOT_FOUND, "NOT_FOUND", "Resource not found"),
            AuthError::Conflict => (StatusCode::CONFLICT, "CONFLICT", "Resource conflict"),
            AuthError::UnsupportedAttachment => (
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "UNSUPPORTED_FILE_TYPE",
                "Unsupported attachment",
            ),
            AuthError::InvalidCredentials => (
                StatusCode::UNAUTHORIZED,
                "INVALID_CREDENTIALS",
                "Invalid credentials",
            ),
            AuthError::CompanyUnavailable => (
                StatusCode::NOT_FOUND,
                "COMPANY_UNAVAILABLE",
                "Company unavailable",
            ),
            AuthError::NoActiveAccess => (
                StatusCode::FORBIDDEN,
                "NO_ACTIVE_ACCESS",
                "No active access grant",
            ),
            AuthError::ProviderUnsupported => (
                StatusCode::NOT_IMPLEMENTED,
                "AUTH_PROVIDER_UNSUPPORTED",
                "Configured authentication provider is not available",
            ),
            AuthError::HrisUnavailable
            | AuthError::HrisInvalidResponse
            | AuthError::HrisMisconfigured => (
                StatusCode::BAD_GATEWAY,
                "HRIS_UPSTREAM_INVALID_RESPONSE",
                "Authentication service unavailable",
            ),
            AuthError::InvalidChallenge | AuthError::InvalidResetToken => (
                StatusCode::UNAUTHORIZED,
                "INVALID_CHALLENGE",
                "Challenge is invalid or expired",
            ),
            AuthError::InvalidOtp => (
                StatusCode::UNAUTHORIZED,
                "INVALID_OTP",
                "OTP verification failed",
            ),
            AuthError::RateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "MFA_RATE_LIMITED",
                "Too many verification attempts",
            ),
            AuthError::LoginRateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMITED",
                "Too many login attempts",
            ),
            AuthError::OtpReplay => (
                StatusCode::CONFLICT,
                "TOTP_REPLAY",
                "OTP has already been used",
            ),
            AuthError::MfaNotEnabled => (
                StatusCode::CONFLICT,
                "MFA_NOT_ENABLED",
                "MFA is not enabled",
            ),
            AuthError::MfaRequired => (
                StatusCode::FORBIDDEN,
                "MFA_REQUIRED_FOR_PAM",
                "MFA is required",
            ),
            AuthError::StepUpRequired => (
                StatusCode::FORBIDDEN,
                "MFA_STEP_UP_REQUIRED",
                "Fresh MFA verification is required",
            ),
            AuthError::Forbidden => (StatusCode::FORBIDDEN, "PERMISSION_DENIED", "Not authorized"),
            AuthError::DependencyUnavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "DEPENDENCY_UNAVAILABLE",
                "A required service is unavailable",
            ),
            AuthError::Configuration | AuthError::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "Request could not be completed",
            ),
        };
        (
            status,
            Json(ErrorBody {
                error: ErrorDetail { code, message },
                meta: Meta {
                    request_id: Uuid::new_v4(),
                },
            }),
        )
            .into_response()
    }
}
