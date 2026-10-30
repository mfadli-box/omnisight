use axum::{http::header, response::IntoResponse, routing::get, Router};
use std::net::SocketAddr;
use tokio::net::TcpListener;

const HEALTH: &str = "ok\n";
const METRICS: &str = concat!(
    "# HELP osc_build_info Static build information.\n",
    "# TYPE osc_build_info gauge\n",
    "osc_build_info{service=\"osc_rest\",version=\"0.1.0\"} 1\n",
);

async fn healthz() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        HEALTH,
    )
}

async fn metrics() -> impl IntoResponse {
    (
        [(
            header::CONTENT_TYPE,
            "text/plain; version=0.0.4; charset=utf-8",
        )],
        METRICS,
    )
}

fn router() -> Router {
    Router::new()
        .route("/internal/healthz", get(healthz))
        .route("/internal/metrics", get(metrics))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let bind = std::env::var("OSC_REST_BIND").unwrap_or_else(|_| "0.0.0.0:8080".to_string());
    let addr: SocketAddr = bind.parse()?;
    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, router()).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{HEALTH, METRICS};

    #[test]
    fn health_payload_is_ok() {
        assert_eq!(HEALTH, "ok\n");
    }

    #[test]
    fn metrics_expose_build_info() {
        assert!(METRICS.contains("osc_build_info{service=\"osc_rest\""));
    }
}
