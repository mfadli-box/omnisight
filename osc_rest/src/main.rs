//! osc_rest — Rust REST API (Clean Architecture).
//!
//! Alur dependensi (hanya ke dalam):
//! `presentation/http` -> `application` -> `domain` (ports) -> `infrastructure`
//! (adapter PostgreSQL via sqlx, RustFS via aws-sdk-s3, HRIS via reqwest,
//! kripto Argon2id/JWT/AES-256-GCM/TOTP).

mod application;
mod domain;
mod infrastructure;
mod presentation;

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use crate::infrastructure::config::AppConfig;
use crate::infrastructure::crypto::CryptoProvider;
use crate::infrastructure::hris::HrisClient;
use crate::infrastructure::logstream::LogBroker;
use crate::infrastructure::mfa_reset::MfaResetStore;
use crate::infrastructure::persistence::PgHealth;
use crate::infrastructure::ratelimit::RateLimiter;
use crate::infrastructure::storage::RustfsClient;
use crate::infrastructure::store::Store;
use crate::presentation::http::router;
use crate::presentation::http::state::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Observability: subscriber JSON + registrasi secret untuk redaksi
    // (RUST_LOG mengendalikan level, default `info`).
    infrastructure::logging::init();

    let config = AppConfig::from_env();

    // --- Wiring infrastructure (satu-satunya titik yang menyentuh adapter) ---
    let db = match PgHealth::connect(&config.database_url).await {
        Ok(db) => db,
        // Startup failure dicatat via tracing (JSON + redaksi), bukan
        // lewat return value yang lolos tanpa penyaringan.
        Err(e) => {
            tracing::error!(
                error = %infrastructure::logging::redact(&e.to_string()),
                "gagal koneksi PostgreSQL"
            );
            std::process::exit(1);
        }
    };
    let pool = db.pool().clone();

    let storage = RustfsClient::new(
        &config.rustfs_endpoint,
        &config.rustfs_access_key,
        &config.rustfs_secret_key,
        &config.rustfs_bucket,
    );

    // Diagnostik startup: bucket mungkin belum dibuat — tidak fatal
    // (pipeline files/excel yang mewajibkannya saat dipakai).
    if let Err(e) = storage.head_bucket().await {
        tracing::warn!(
            bucket = %config.rustfs_bucket,
            error = %e,
            "bucket RustFS belum terverifikasi"
        );
    }
    // Bucket privat rekaman PAM (Wave 3) — diagnostik non-fatal yang sama.
    if let Err(e) = storage.head_bucket_named(&config.rustfs_bucket_pam).await {
        tracing::warn!(
            bucket = %config.rustfs_bucket_pam,
            error = %e,
            "bucket RustFS PAM belum terverifikasi"
        );
    }

    let crypto = match CryptoProvider::new(&config.jwt_secret, &config.master_key_hex) {
        Ok(crypto) => Arc::new(crypto),
        Err(e) => {
            tracing::error!(
                error = %infrastructure::logging::redact(&e.to_string()),
                "konfigurasi kripto tidak valid"
            );
            std::process::exit(1);
        }
    };

    let hris = Arc::new(HrisClient::new(
        &config.hris_allowlist_cidrs,
        &config.hris_allowlist_hosts,
    ));

    let state = AppState {
        db: Arc::new(db),
        storage: Arc::new(storage),
        config: Arc::new(config),
        crypto,
        hris,
        store: Arc::new(Store::new(pool)),
        // MFA: 5 kegagalan / 15 menit → lockout 15 menit (bab 5.3).
        mfa_limiter: Arc::new(RateLimiter::new(5, Duration::from_secs(900), Duration::from_secs(900))),
        // Login: 10 kegagalan / 15 menit → lockout 15 menit per username.
        login_limiter: Arc::new(RateLimiter::new(10, Duration::from_secs(900), Duration::from_secs(900))),
        mfa_resets: Arc::new(MfaResetStore::default()),
        // Broker log live (SSE Wave 2) — in-process broadcast.
        logs: Arc::new(LogBroker::new()),
    };

    let addr: SocketAddr = format!("{}:{}", state.config.host, state.config.port).parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "osc_rest listening");

    axum::serve(listener, router::build_router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

/// Graceful shutdown: SIGINT (Ctrl+C) / SIGTERM (`docker stop`).
async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{SignalKind, signal};
        match signal(SignalKind::terminate()) {
            Ok(mut sig) => {
                let _ = sig.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
