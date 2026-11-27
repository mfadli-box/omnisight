use osc_rest::api::{
    docker_engine, ipam, pam_ssh, rbac_permission, store_asset, store_cmdb, tenant_master,
};
use osc_rest::{api::system_setting, middleware::audit, service::log_rotator};
use sqlx::postgres::PgPoolOptions;
use std::{env, error::Error};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let pool = PgPoolOptions::new().connect_lazy(&env::var("DATABASE_URL")?)?;
    let project = env::var("COMPOSE_PROJECT_NAME").unwrap_or_else(|_| "omnisight".into());
    let jwt = env::var("JWT_SECRET")?;
    let vault_key = env::var("STORE_ACCOUNT_ENCRYPTION_KEY").ok();
    let company = env::var("AG02_COMPANY_ID")
        .ok()
        .map(|s| s.parse())
        .transpose()?;
    let cms = match (
        env::var("DIRECTUS_URL").ok(),
        env::var("DIRECTUS_STATIC_TOKEN").ok(),
    ) {
        (Some(base), Some(token)) => Some(osc_rest::service::directus_client::Directus::new(
            &base, token,
        )?),
        (None, None) => None,
        _ => return Err("incomplete Directus configuration".into()),
    };
    let root = match env::var_os("AG02_WORKSPACE") {
        Some(path) => std::path::PathBuf::from(path),
        None => {
            let cwd = env::current_dir()?;
            if cwd.ends_with("osc_rest") {
                cwd.parent().unwrap().to_owned()
            } else {
                cwd
            }
        }
    };
    let logger = osc_rest::service::work_logger::WorkLogger { root, cms };
    let app = docker_engine::router(pool.clone(), &jwt, project.clone())?
        .merge(osc_rest::api::container_terminal::router(
            pool.clone(),
            &jwt,
            project,
            env::var("CT02_SERVER_ID")
                .ok()
                .filter(|id| !id.is_empty())
                .map(|id| id.parse())
                .transpose()?,
            env::var("CT02_AUDIT_KEY")
                .ok()
                .filter(|key| !key.is_empty())
                .as_deref(),
        )?)
        .merge(osc_rest::api::auth::router(
            pool.clone(), &jwt, &env::var("HRIS_ALLOWED_HOSTS").unwrap_or_default(),
        )?)
        .merge(store_asset::router(
            pool.clone(),
            &jwt,
            vault_key.as_deref(),
        )?)
        .merge(store_cmdb::router(pool.clone(), &jwt)?)
        .merge(osc_rest::api::directus::router(
            pool.clone(),
            &jwt,
            logger.clone(),
            company,
        )?)
        .merge(osc_rest::api::mcp::router(pool.clone(), &jwt)?)
        .merge(osc_rest::api::ticket::router(pool.clone(), &jwt)?)
        .merge(osc_rest::api::sla::router(pool.clone(), &jwt)?)
        .merge(osc_rest::api::dcim::router(pool.clone(), &jwt)?)
        .merge(ipam::router(pool.clone(), &jwt)?)
        .merge(osc_rest::api::alert::router(pool.clone(), &jwt)?)
        .merge(osc_rest::api::snmp::router(pool.clone(), &jwt)?)
        .merge(osc_rest::api::uptime::router(pool.clone(), &jwt)?)
        .merge(tenant_master::router(pool.clone(), &jwt)?)
        .merge(pam_ssh::router(
            pool.clone(),
            &jwt,
            env::var("PAM_ENCRYPTION_KEY").ok().as_deref(),
        )?)
        .merge(rbac_permission::router(pool.clone(), &jwt)?)
        .merge(system_setting::router(pool.clone(), &jwt)?)
        .layer(axum::middleware::from_fn_with_state(
            audit::AuditState::new(pool.clone(), &jwt)?,
            audit::intercept,
        ));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    osc_rest::service::snmp_poller::start(pool.clone())?;
    tokio::spawn(osc_rest::service::uptime_checker::run(pool.clone()));
    tokio::spawn(osc_rest::service::alert_engine::run(pool.clone()));
    tokio::spawn(osc_rest::service::sla_worker::run(pool.clone()));
    tokio::spawn(logger.run());
    tokio::spawn(log_rotator::run(pool));
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}
