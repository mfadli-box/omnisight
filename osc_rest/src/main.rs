use osc_rest::{
    api::{auth, tenant},
    middleware::audit,
};
use sqlx::postgres::PgPoolOptions;
use std::{env, error::Error, net::SocketAddr};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let pool = PgPoolOptions::new().connect_lazy(&env::var("DATABASE_URL")?)?;
    let jwt = env::var("JWT_SECRET")?;
    let hosts = env::var("HRIS_ALLOWED_HOSTS").unwrap_or_default();
    let app = auth::router(pool.clone(), &jwt, &hosts)?
        .merge(tenant::router(pool.clone(), &jwt)?)
        .layer(axum::middleware::from_fn_with_state(
            audit::AuditState::new(pool, &jwt)?,
            audit::intercept,
        ));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}
