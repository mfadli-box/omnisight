use std::{collections::HashSet, net::SocketAddr, sync::Arc};

use base64::{
    Engine,
    engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE_NO_PAD},
};
use osc_rest::{
    application::{
        auth::AuthService,
        ports::{AuthRepository, HrisPort, MailPort},
        token::TokenService,
    },
    infrastructure::{
        email::HttpEmailNotifier, hris::HrisClient, postgres::PgAuthRepository,
        redis_cache::RedisCache,
    },
    presentation::{
        auth_http::{AppState, router},
        heartbeat_http, telemetry_http,
    },
};
use tracing_subscriber::{EnvFilter, filter::filter_fn, prelude::*};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let log_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    // HRIS uses query credentials, so network-level diagnostics must never print request URIs.
    let network_redaction = filter_fn(|metadata| {
        !matches!(
            metadata.target().split("::").next(),
            Some("reqwest" | "hyper" | "hyper_util" | "hyper_rustls" | "h2" | "tower_http")
        )
    });
    tracing_subscriber::registry()
        .with(log_filter)
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_filter(network_redaction),
        )
        .init();

    let database_url = required("DATABASE_URL")?;
    let cache_url = required("CACHE_URL")?;
    let jwt_secret = required("JWT_SECRET")?.into_bytes();
    let encryption_key = parse_key(&required("MFA_ENCRYPTION_KEY")?)?;
    let hris_allowed_hosts: HashSet<String> = std::env::var("HRIS_ALLOWED_HOSTS")?
        .split(',')
        .map(|host| host.trim().trim_end_matches('.').to_ascii_lowercase())
        .filter(|host| !host.is_empty())
        .collect();

    let pg = PgAuthRepository::connect(&database_url).await?;
    let tenant_pool = PgAuthRepository::connect(&database_url).await?.pool();
    let repository: Arc<dyn AuthRepository> = Arc::new(pg);
    let cache = Arc::new(RedisCache::new(&cache_url)?);
    let heartbeat_secrets = match std::env::var("AGENT_HEARTBEAT_SECRETS") {
        Ok(value) => value,
        Err(std::env::VarError::NotPresent) => String::new(),
        Err(err) => return Err(err.into()),
    };
    let heartbeat_router = heartbeat_http::router(cache.clone(), &heartbeat_secrets)?;
    let telemetry_scopes = match std::env::var("AGENT_TELEMETRY_SCOPES") {
        Ok(value) => value,
        Err(std::env::VarError::NotPresent) => String::new(),
        Err(err) => return Err(err.into()),
    };
    let telemetry_router = telemetry_http::router(
        tenant_pool.clone(),
        cache.clone(),
        &heartbeat_secrets,
        &telemetry_scopes,
    )?;
    let hris: Arc<dyn HrisPort> = Arc::new(HrisClient::new(hris_allowed_hosts)?);
    let mailer: Option<Arc<dyn MailPort>> =
        HttpEmailNotifier::from_env().map(|client| Arc::new(client) as Arc<dyn MailPort>);
    let tokens = Arc::new(TokenService::new(jwt_secret)?);
    let auth = Arc::new(AuthService::new(
        repository,
        cache.clone(),
        hris,
        mailer,
        tokens.clone(),
        encryption_key,
    ));
    let storage = osc_rest::infrastructure::storage::RustFsStorage::from_env().await?;
    let app_state = Arc::new(AppState {
        auth,
        tokens,
        tenant_pool,
        cache,
        storage: Arc::new(storage),
    });
    let app = router(app_state)
        .merge(heartbeat_router)
        .merge(telemetry_router);

    let address: SocketAddr = std::env::var("BIND_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_owned())
        .parse()?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!(event="http_server_started", address=%address);
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn required(name: &str) -> Result<String, Box<dyn std::error::Error>> {
    std::env::var(name)
        .map_err(|_| format!("required environment variable {name} is missing").into())
}

fn parse_key(value: &str) -> Result<[u8; 32], Box<dyn std::error::Error>> {
    let decoded = URL_SAFE_NO_PAD
        .decode(value)
        .or_else(|_| STANDARD_NO_PAD.decode(value))
        .or_else(|_| STANDARD.decode(value))?;
    let key: [u8; 32] = decoded
        .try_into()
        .map_err(|_| "MFA_ENCRYPTION_KEY must decode to exactly 32 bytes")?;
    Ok(key)
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install Ctrl-C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}
