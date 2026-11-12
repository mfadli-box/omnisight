//! osc_rest — Rust REST API (Clean Architecture bootstrap).
//!
//! Alur dependensi (hanya ke dalam):
//! `presentation/http` -> `application` -> `domain` (ports) -> `infrastructure`
//! (adapter PostgreSQL via sqlx, RustFS via aws-sdk-s3).

mod application;
mod domain;
mod infrastructure;
mod presentation;

use std::net::SocketAddr;
use std::sync::Arc;

use crate::infrastructure::config::AppConfig;
use crate::presentation::http::router;
use crate::presentation::http::state::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Observability: subscriber JSON + registrasi secret untuk redaksi
    // (RUST_LOG mengendalikan level, default `info`).
    infrastructure::logging::init();

    let config = AppConfig::from_env();

    // --- Wiring infrastructure (satu-satunya titik yang menyentuh adapter) ---
    let db = match infrastructure::persistence::PgHealth::connect(&config.database_url).await {
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

    let storage = infrastructure::storage::RustfsClient::new(
        &config.rustfs_endpoint,
        &config.rustfs_access_key,
        &config.rustfs_secret_key,
        &config.rustfs_bucket,
    );

    // Diagnostik startup: bucket mungkin belum dibuat pada fase bootstrap —
    // tidak fatal (pipeline excel yang mewajibkannya di fase berikutnya).
    if let Err(e) = storage.head_bucket().await {
        tracing::warn!(
            bucket = %config.rustfs_bucket,
            error = %e,
            "bucket RustFS belum terverifikasi"
        );
    }

    let state = AppState {
        db: Arc::new(db),
        storage: Arc::new(storage),
    };

    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
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
