//! Otorisasi per aksi. Pasang satu kebijakan pada setiap handler yang dilindungi.
use axum::{
    extract::{ConnectInfo, FromRequestParts, MatchedPath, RawPathParams, Request, State},
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use sqlx::PgPool;
use std::{net::SocketAddr, sync::Arc};
use uuid::Uuid;

#[derive(Clone, Copy, Debug)]
pub enum Action {
    Create,
    Read,
    Update,
    Delete,
    Execute,
}

#[derive(Clone, Debug)]
pub struct Permissions {
    pub can_create: bool,
    pub can_read: bool,
    pub can_update: bool,
    pub can_delete: bool,
    pub can_execute: bool,
}

impl Permissions {
    fn allows(&self, action: Action) -> bool {
        match action {
            Action::Create => self.can_create,
            Action::Read => self.can_read,
            Action::Update => self.can_update,
            Action::Delete => self.can_delete,
            Action::Execute => self.can_execute,
        }
    }
}

#[derive(Clone, Debug)]
pub struct TenantContext {
    pub user_id: Uuid,
    pub company_id: Uuid,
    pub role_id: Uuid,
    pub permissions: Permissions,
}

#[derive(Clone, Copy)]
pub(crate) struct TokenExpiry(pub i64);

#[derive(Deserialize)]
pub(crate) struct Claims {
    pub(crate) user_id: Uuid,
    pub(crate) company_id: Uuid,
    pub(crate) role_id: Uuid,
    pub(crate) exp: i64,
}

#[derive(Clone)]
pub struct RbacState {
    db: PgPool,
    key: Arc<DecodingKey>,
    module: &'static str,
    action: Action,
    superadmin_only: bool,
}

impl RbacState {
    /// Gunakan JWT_SECRET (Base64 standar) yang sama dengan penerbit token HS256.
    pub fn new(
        db: PgPool,
        secret: &str,
        module: &'static str,
        action: Action,
    ) -> Result<Self, &'static str> {
        let bytes = STANDARD
            .decode(secret)
            .map_err(|_| "invalid JWT key encoding")?;
        if bytes.len() < 32 {
            return Err("JWT key requires at least 32 bytes");
        }
        Ok(Self {
            db,
            key: Arc::new(DecodingKey::from_secret(&bytes)),
            module,
            action,
            superadmin_only: false,
        })
    }

    pub fn require_superadmin(mut self) -> Self {
        self.superadmin_only = true;
        self
    }

    pub(crate) fn claims(&self, headers: &HeaderMap) -> Option<Claims> {
        let mut headers = headers.get_all(AUTHORIZATION).iter();
        let (scheme, token) = headers.next()?.to_str().ok()?.split_once(' ')?;
        if headers.next().is_some() || !scheme.eq_ignore_ascii_case("Bearer") {
            return None;
        }
        let mut validation = Validation::new(Algorithm::HS256);
        validation.leeway = 0;
        validation.validate_nbf = true;
        decode::<Claims>(token, &self.key, &validation)
            .ok()
            .map(|jwt| jwt.claims)
    }

    async fn permissions(&self, claims: &Claims) -> Result<Option<Permissions>, sqlx::Error> {
        let row = sqlx::query_as::<_, (bool, bool, bool, bool, bool)>(
            "SELECT p.can_create, p.can_read, p.can_update, p.can_delete, p.can_execute
             FROM trx_user_company g
             JOIN dat_user u ON u.user_id = g.user_id AND u.is_active
             JOIN dat_company c ON c.company_id = g.company_id AND c.is_active
             JOIN dat_role r ON r.role_id = g.role_id
             JOIN dat_permission p ON p.role_id = g.role_id
             JOIN dat_menu m ON m.menu_id = p.menu_id AND m.is_active
             WHERE g.user_id = $1 AND g.company_id = $2 AND g.role_id = $3
               AND m.sub_module_code = $4 AND (NOT $5 OR r.role_code = 'SUPERADMIN')",
        )
        .bind(claims.user_id)
        .bind(claims.company_id)
        .bind(claims.role_id)
        .bind(self.module)
        .bind(self.superadmin_only)
        .fetch_optional(&self.db)
        .await?;
        Ok(row.map(
            |(can_create, can_read, can_update, can_delete, can_execute)| Permissions {
                can_create,
                can_read,
                can_update,
                can_delete,
                can_execute,
            },
        ))
    }
}

/// Gunakan dengan from_fn_with_state pada rute per metode. Parameter rute
/// company_id, jika ada, harus cocok dengan tenant JWT. Handler membatasi
/// seluruh akses objek dengan company_id dari TenantContext.
pub async fn authorize(
    State(state): State<RbacState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let (mut parts, body) = req.into_parts();
    let denial = if let Some(claims) = state.claims(&parts.headers) {
        let params = RawPathParams::from_request_parts(&mut parts, &()).await;
        let target_matches = params.is_ok_and(|params| {
            params.iter().all(|(name, value)| {
                name != "company_id" || Uuid::parse_str(value).ok() == Some(claims.company_id)
            })
        });
        if target_matches {
            let permissions = state.permissions(&claims).await.map_err(|_| {
                tracing::error!("RBAC permission query failed");
                StatusCode::SERVICE_UNAVAILABLE
            })?;
            if let Some(permissions) = permissions.filter(|p| p.allows(state.action)) {
                parts.extensions.insert(TokenExpiry(claims.exp));
                parts.extensions.insert(TenantContext {
                    user_id: claims.user_id,
                    company_id: claims.company_id,
                    role_id: claims.role_id,
                    permissions,
                });
                return Ok(next.run(Request::from_parts(parts, body)).await);
            }
            "membership_or_permission_denied"
        } else {
            "tenant_path_mismatch"
        }
    } else {
        "invalid_credentials"
    };
    let peer = parts
        .extensions
        .get::<ConnectInfo<SocketAddr>>()
        .map(|peer| peer.0.ip().to_string())
        .unwrap_or_else(|| "0.0.0.0".into());
    let route = parts
        .extensions
        .get::<MatchedPath>()
        .map(MatchedPath::as_str);
    let detail = format!("{} {:?} {}", state.module, state.action, denial);
    if sqlx::query("INSERT INTO log_security_guard (event_type, source_ip, request_uri, payload_dump, action_taken)
                    VALUES ('UNAUTHORIZED_ACCESS', $1::text::inet, $2, $3, 'BLOCKED')")
        .bind(peer).bind(route).bind(detail).execute(&state.db).await.is_err() {
        tracing::error!(module = state.module, action = ?state.action, reason = denial, "RBAC audit insert failed");
    }
    Err(StatusCode::FORBIDDEN)
}
