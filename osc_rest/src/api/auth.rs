use crate::{
    application::verify_identity,
    domain::auth::hris_client::{CredentialProof, LoginError},
    infrastructure::hris::HrisClient,
};
use axum::{
    extract::{ConnectInfo, DefaultBodyLimit, State},
    http::StatusCode,
    routing::post,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use data_encoding::BASE32_NOPAD;
use jsonwebtoken::{encode, EncodingKey, Header};
use ring::hmac;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{types::Uuid, PgPool};
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

struct Auth {
    db: PgPool,
    hris: HrisClient,
    signing_key: EncodingKey,
    attempts: Mutex<HashMap<IpAddr, (Instant, u32)>>,
    challenges: Mutex<HashMap<Uuid, Challenge>>,
}
#[derive(Clone)]
struct Challenge {
    user: Uuid,
    company: Uuid,
    recovery: bool,
    expires: Instant,
    remaining: u8,
}

pub fn router(db: PgPool, secret: &str, hosts: &str) -> Result<Router, &'static str> {
    let bytes = STANDARD
        .decode(secret)
        .map_err(|_| "invalid JWT key encoding")?;
    if bytes.len() < 32 {
        return Err("JWT key requires at least 32 bytes");
    }
    let state = Arc::new(Auth {
        db,
        hris: HrisClient::new(hosts).map_err(|_| "invalid HRIS configuration")?,
        signing_key: EncodingKey::from_secret(&bytes),
        attempts: Mutex::default(),
        challenges: Mutex::default(),
    });
    let routes = Router::new()
        .route("/login", post(login))
        .route("/mfa/verify", post(verify_mfa));
    Ok(Router::new()
        .nest("/api/v1/auth", routes.clone())
        .nest("/baas/v1/auth", routes)
        .layer(DefaultBodyLimit::max(8192))
        .with_state(state))
}

#[derive(Deserialize)]
struct Login {
    company_id: Uuid,
    username: String,
    password: String,
}
#[derive(Deserialize)]
struct Verify {
    mfa_challenge_token: Uuid,
    otp: String,
}

type Reply = Result<Json<Value>, StatusCode>;

async fn login(
    State(auth): State<Arc<Auth>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Json(input): Json<Login>,
) -> Reply {
    if input.username.is_empty() || input.username.len() > 200 || input.password.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    {
        let now = Instant::now();
        let mut attempts = auth.attempts.lock().unwrap();
        attempts.retain(|_, (end, _)| *end > now);
        if attempts.len() >= 8192 && !attempts.contains_key(&peer.ip()) {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        let (_, count) = attempts
            .entry(peer.ip())
            .or_insert((now + Duration::from_secs(60), 0));
        if *count >= 30 {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        *count += 1;
    }
    let (user, proof) = verify_identity(&auth.db, &auth.hris, &input.username, &input.password)
        .await
        .map_err(|e| match e {
            LoginError::Denied => StatusCode::UNAUTHORIZED,
            _ => StatusCode::SERVICE_UNAVAILABLE,
        })?;
    let (role, mfa, _) = grant(&auth.db, user, input.company_id).await?;
    let recovery = matches!(proof, CredentialProof::Recovery);
    if !mfa {
        return session(&auth, user, input.company_id, role, recovery).await;
    }
    let now = Instant::now();
    let mut pending = auth.challenges.lock().unwrap();
    pending.retain(|_, c| c.expires > now);
    if pending.len() >= 8192 {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let token = Uuid::new_v4();
    pending.insert(
        token,
        Challenge {
            user,
            company: input.company_id,
            recovery,
            expires: now + Duration::from_secs(300),
            remaining: 5,
        },
    );
    Ok(Json(
        json!({"data":{"mfa_required":true, "mfa_challenge_token":token,"warning_flag":recovery}}),
    ))
}

async fn grant(
    db: &PgPool,
    user: Uuid,
    company: Uuid,
) -> Result<(Uuid, bool, Option<String>), StatusCode> {
    sqlx::query_as(
        "SELECT g.role_id, (u.is_mfa_enabled OR c.is_mfa_active OR home.is_mfa_active), u.mfa_secret FROM trx_user_company g
        JOIN dat_user u ON u.user_id=g.user_id AND u.is_active
        JOIN dat_company c ON c.company_id=g.company_id AND c.is_active
        JOIN dat_employee e ON e.user_id=u.user_id AND e.is_active
        JOIN dat_company home ON home.company_id=e.home_company_id AND home.is_active
        WHERE g.user_id=$1 AND g.company_id=$2",
    )
    .bind(user)
    .bind(company)
    .fetch_optional(db)
    .await
    .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
    .ok_or(StatusCode::UNAUTHORIZED)
}

async fn verify_mfa(State(auth): State<Arc<Auth>>, Json(input): Json<Verify>) -> Reply {
    let token = input.mfa_challenge_token;
    let challenge = {
        let mut pending = auth.challenges.lock().unwrap();
        let c = pending.get_mut(&token).ok_or(StatusCode::UNAUTHORIZED)?;
        if c.expires <= Instant::now() || c.remaining == 0 {
            pending.remove(&token);
            return Err(StatusCode::UNAUTHORIZED);
        }
        c.remaining -= 1;
        c.clone()
    };
    let (role, enabled, secret) = grant(&auth.db, challenge.user, challenge.company).await?;
    if !enabled || !secret.is_some_and(|s| valid_otp(&s, &input.otp, timestamp())) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let removed = auth.challenges.lock().unwrap().remove(&token);
    if !removed.is_some_and(|c| c.expires > Instant::now()) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    session(
        &auth,
        challenge.user,
        challenge.company,
        role,
        challenge.recovery,
    )
    .await
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn valid_otp(secret: &str, otp: &str, now: u64) -> bool {
    if otp.len() != 6 || !otp.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    let Ok(key) = BASE32_NOPAD.decode(secret.trim_end_matches('=').to_ascii_uppercase().as_bytes())
    else {
        return false;
    };
    if key.is_empty() {
        return false;
    }
    let key = hmac::Key::new(hmac::HMAC_SHA1_FOR_LEGACY_USE_ONLY, &key);
    let step = now / 30;
    (step.saturating_sub(1)..=step + 1).any(|counter| {
        let mac = hmac::sign(&key, &counter.to_be_bytes());
        let bytes = mac.as_ref();
        let offset = (bytes[19] & 15) as usize;
        let value = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) & 0x7fff_ffff;
        format!("{:06}", value % 1_000_000) == otp
    })
}

async fn session(auth: &Auth, user: Uuid, company: Uuid, role: Uuid, recovery: bool) -> Reply {
    let now = timestamp();
    let permissions: serde_json::Value = sqlx::query_scalar(
        "SELECT COALESCE(jsonb_object_agg(m.sub_module_code, jsonb_build_object(
            'can_create', p.can_create, 'can_read', p.can_read, 'can_update', p.can_update,
            'can_delete', p.can_delete, 'can_execute', p.can_execute)), '{}'::jsonb)
         FROM dat_permission p JOIN dat_menu m ON m.menu_id = p.menu_id AND m.is_active
         WHERE p.role_id = $1",
    )
    .bind(role)
    .fetch_one(&auth.db)
    .await
    .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let claims = json!({"user_id":user,"company_id":company,"role_id":role,"permissions":permissions,"iat":now,"exp":now+3600});
    let token = encode(&Header::default(), &claims, &auth.signing_key)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(
        json!({"data":{"access_token":token,"mfa_required":false,"warning_flag":recovery}}),
    ))
}
