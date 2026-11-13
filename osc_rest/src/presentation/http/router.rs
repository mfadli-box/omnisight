//! Definisi router — satu-satunya tempat pemetaan route.
//!
//! Topologi:
//! - Publik: health, `auth/companies`, `auth/login`, `mfa/reset-request`,
//!   `status-pages/{slug}` (status page publik), `agents/enroll`.
//! - Agent (HMAC per-request — bukan JWT): `agents/{inventory,metrics,uptime}/ingest`,
//!   `agents/logs`, Wave 3: `agents/security/ingest`, `agents/retention/purge`,
//!   `agents/pam/ticket/redeem`, `pam/sessions/{id}/recording`.
//! - Terproteksi (RequestContext middleware): MFA, switch-company, navigation,
//!   studio/items, ITAM, DCIM/IPAM, files, excel, monitors, status-pages,
//!   docker stacks, nginx vhosts, SSE logs, Wave 3: PAM accounts/sessions,
//!   notification channels, secops overview.
//! - Middleware global: correlation_id (X-Correlation-ID) + security headers.

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::{Router, middleware as axum_middleware};

use crate::presentation::http::agent_auth::MAX_AGENT_BODY;
use crate::presentation::http::handlers;
use crate::presentation::http::middleware::correlation_id::correlation_id;
use crate::presentation::http::middleware::request_context::request_context;
use crate::presentation::http::middleware::security_headers::security_headers;
use crate::presentation::http::state::AppState;

pub fn build_router(state: AppState) -> Router {
    // --- Router terproteksi: RequestContext (JWT + tenant guard) ---
    let protected = Router::new()
        // MFA (setup/enable/disable = access; verify juga menerima mfa_pending)
        .route("/api/v1/auth/mfa/setup", post(handlers::mfa::setup))
        .route("/api/v1/auth/mfa/enable", post(handlers::mfa::enable))
        .route("/api/v1/auth/mfa/verify", post(handlers::mfa::verify))
        .route("/api/v1/auth/mfa/disable", post(handlers::mfa::disable))
        .route("/api/v1/auth/mfa/reset-confirm", post(handlers::mfa::reset_confirm))
        // Company switcher & navigasi
        .route("/api/v1/auth/switch-company", post(handlers::auth::switch_company))
        .route("/api/v1/me/navigation", get(handlers::me::navigation))
        // Admin reset MFA
        .route("/api/v1/users/{id}/mfa/reset", post(handlers::mfa::admin_reset))
        // Studio koleksi dinamis + items
        .route("/api/v1/collections", get(handlers::studio::list).post(handlers::studio::create))
        .route(
            "/api/v1/collections/{collection}/fields",
            get(handlers::studio::fields).post(handlers::studio::add_field),
        )
        .route(
            "/api/v1/items/{collection}",
            get(handlers::studio::items_list).post(handlers::studio::items_create),
        )
        // ITAM
        .route(
            "/api/v1/assets",
            get(handlers::itam::list_assets).post(handlers::itam::create_asset),
        )
        .route("/api/v1/assets/import", post(handlers::excel::import))
        .route("/api/v1/assets/export", get(handlers::excel::export))
        .route("/api/v1/assets/{id}", get(handlers::itam::get_asset))
        .route("/api/v1/assets/{id}/checkout", post(handlers::itam::checkout))
        .route("/api/v1/assets/{id}/checkin", post(handlers::itam::checkin))
        .route("/api/v1/licenses", get(handlers::itam::list_licenses))
        .route(
            "/api/v1/tickets",
            get(handlers::itam::list_tickets).post(handlers::itam::create_ticket),
        )
        // DCIM / IPAM
        .route("/api/v1/dcim/racks", get(handlers::net::list_racks))
        .route(
            "/api/v1/ipam/prefixes",
            get(handlers::net::list_prefixes).post(handlers::net::create_prefix),
        )
        .route(
            "/api/v1/ipam/addresses",
            get(handlers::net::list_addresses).post(handlers::net::create_address),
        )
        // Files (RustFS)
        .route(
            "/api/v1/files",
            get(handlers::files::list).post(handlers::files::upload),
        )
        .route("/api/v1/files/{id}", get(handlers::files::get))
        // --- Wave 2: Uptime monitors & status pages ---
        .route(
            "/api/v1/monitors",
            get(handlers::uptime::list_monitors).post(handlers::uptime::create_monitor),
        )
        .route(
            "/api/v1/monitors/{id}",
            get(handlers::uptime::get_monitor)
                .put(handlers::uptime::update_monitor)
                .delete(handlers::uptime::delete_monitor),
        )
        .route(
            "/api/v1/status-pages",
            get(handlers::uptime::list_status_pages).post(handlers::uptime::create_status_page),
        )
        .route(
            "/api/v1/status-pages/{id}",
            get(handlers::uptime::get_status_page)
                .put(handlers::uptime::update_status_page)
                .delete(handlers::uptime::delete_status_page),
        )
        // --- Wave 2: Docker stack control plane ---
        .route(
            "/api/v1/docker/hosts",
            get(handlers::infra::list_docker_hosts),
        )
        .route(
            "/api/v1/docker/stacks",
            get(handlers::infra::list_stacks).post(handlers::infra::create_stack),
        )
        .route(
            "/api/v1/docker/stacks/{id}",
            get(handlers::infra::get_stack)
                .put(handlers::infra::update_stack)
                .delete(handlers::infra::delete_stack),
        )
        .route("/api/v1/docker/stacks/{id}/dispatch", post(handlers::infra::dispatch_stack))
        // --- Wave 2: Nginx reverse proxy control plane ---
        .route("/api/v1/nginx/nodes", get(handlers::infra::list_nginx_nodes))
        .route(
            "/api/v1/nginx/vhosts",
            get(handlers::infra::list_vhosts).post(handlers::infra::create_vhost),
        )
        .route(
            "/api/v1/nginx/vhosts/{id}",
            get(handlers::infra::get_vhost)
                .put(handlers::infra::update_vhost)
                .delete(handlers::infra::delete_vhost),
        )
        .route("/api/v1/nginx/vhosts/{id}/dispatch", post(handlers::infra::dispatch_vhost))
        // --- Wave 2: Live logs (SSE) ---
        .route("/api/v1/infra/logs/stream", get(handlers::infra::stream_logs))
        // --- Wave 2: Agent enrollment (admin) ---
        .route(
            "/api/v1/agents/enrollment-tokens",
            post(handlers::agents::create_enrollment_token),
        )
        // --- Wave 3: PAM vault & session authorization (bab 5.3 + 5.6) ---
        .route(
            "/api/v1/pam/accounts",
            get(handlers::pam::list_accounts).post(handlers::pam::create_account),
        )
        .route(
            "/api/v1/pam/accounts/{id}",
            get(handlers::pam::get_account)
                .put(handlers::pam::update_account)
                .delete(handlers::pam::delete_account),
        )
        .route(
            "/api/v1/pam/sessions/authorize",
            post(handlers::pam::authorize),
        )
        .route("/api/v1/pam/sessions", get(handlers::pam::sessions_list))
        .route("/api/v1/pam/sessions/{id}", get(handlers::pam::session_get))
        // --- Wave 3: Notification channels (dispatcher bab 5.8) ---
        .route(
            "/api/v1/notifications/channels",
            get(handlers::notifications::list_channels)
                .post(handlers::notifications::create_channel),
        )
        .route(
            "/api/v1/notifications/channels/{id}",
            get(handlers::notifications::get_channel)
                .put(handlers::notifications::update_channel)
                .delete(handlers::notifications::delete_channel),
        )
        // --- Wave 3: SOC overview (FIM/CVE/alerts tenant) ---
        .route("/api/v1/secops/overview", get(handlers::secops::secops_overview))
        .route_layer(axum_middleware::from_fn_with_state(state.clone(), request_context))
        .layer(axum::extract::DefaultBodyLimit::max(handlers::files::MAX_UPLOAD_BYTES));

    // --- Router agent (HMAC per-request, bukan JWT) ---
    let agent = Router::new()
        .route(
            "/api/v1/agents/inventory/ingest",
            post(handlers::agents::inventory_ingest),
        )
        .route(
            "/api/v1/agents/metrics/ingest",
            post(handlers::agents::metrics_ingest),
        )
        .route(
            "/api/v1/agents/uptime/ingest",
            post(handlers::agents::uptime_ingest),
        )
        .route("/api/v1/agents/logs", post(handlers::agents::logs_ingest))
        // --- Wave 3: security telemetry ingest (FIM/anomali/CVE/SCA) ---
        .route(
            "/api/v1/agents/security/ingest",
            post(handlers::secops::security_ingest),
        )
        // --- Wave 3: redeem ticket PAM (pam_bastion_gateway) ---
        .route(
            "/api/v1/agents/pam/ticket/redeem",
            post(handlers::pam::ticket_redeem),
        )
        // --- Wave 3: purge retensi internal (flow_worker_agent + allowlist env) ---
        .route(
            "/api/v1/agents/retention/purge",
            post(handlers::secops::retention_purge),
        )
        .layer(DefaultBodyLimit::max(MAX_AGENT_BODY));

    // --- Router agent ber-body besar: rekaman sesi PAM (bucket privat) ---
    let agent_recording = Router::new()
        .route(
            "/api/v1/pam/sessions/{id}/recording",
            post(handlers::pam::recording_upload),
        )
        .layer(DefaultBodyLimit::max(state.config.pam_recording_max_bytes));

    // --- Router publik ---
    let public = Router::new()
        .route("/api/v1/health", get(handlers::health::health))
        .route("/api/v1/auth/companies", get(handlers::auth::companies))
        .route("/api/v1/auth/login", post(handlers::auth::login))
        .route("/api/v1/auth/mfa/reset-request", post(handlers::mfa::reset_request))
        .route("/api/v1/agents/enroll", post(handlers::agents::enroll))
        // Status page publik (tanpa auth; hanya `is_published`).
        .route("/api/v1/status-pages/{slug}", get(handlers::uptime::public_status_page));

    let app = public
        .merge(protected)
        .merge(agent)
        .merge(agent_recording)
        .with_state(state);

    app.layer(axum_middleware::from_fn(correlation_id))
        .layer(axum_middleware::from_fn(security_headers))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regresi: axum panic saat `.route()` bila pattern tumpang-tindih —
    /// registrasi seluruh route Wave 3 (statik vs `{id}` vs nested) harus
    /// lolos tanpa panic. Tidak butuh state nyata (cek pola, bukan eksekusi).
    #[test]
    fn route_wave3_tidak_tumpang_tindih() {
        use crate::presentation::http::handlers;

        let _ = Router::new()
            // Protected (JWT)
            .route(
                "/api/v1/pam/accounts",
                get(handlers::pam::list_accounts).post(handlers::pam::create_account),
            )
            .route(
                "/api/v1/pam/accounts/{id}",
                get(handlers::pam::get_account)
                    .put(handlers::pam::update_account)
                    .delete(handlers::pam::delete_account),
            )
            .route("/api/v1/pam/sessions/authorize", post(handlers::pam::authorize))
            .route("/api/v1/pam/sessions", get(handlers::pam::sessions_list))
            .route("/api/v1/pam/sessions/{id}", get(handlers::pam::session_get))
            .route(
                "/api/v1/notifications/channels",
                get(handlers::notifications::list_channels)
                    .post(handlers::notifications::create_channel),
            )
            .route(
                "/api/v1/notifications/channels/{id}",
                get(handlers::notifications::get_channel)
                    .put(handlers::notifications::update_channel)
                    .delete(handlers::notifications::delete_channel),
            )
            .route("/api/v1/secops/overview", get(handlers::secops::secops_overview))
            // Agent (HMAC)
            .route("/api/v1/agents/security/ingest", post(handlers::secops::security_ingest))
            .route("/api/v1/agents/retention/purge", post(handlers::secops::retention_purge))
            .route("/api/v1/agents/pam/ticket/redeem", post(handlers::pam::ticket_redeem))
            // Agent body besar (recording — path nested, bukan merge `{id}`)
            .route(
                "/api/v1/pam/sessions/{id}/recording",
                post(handlers::pam::recording_upload),
            );
    }
}
