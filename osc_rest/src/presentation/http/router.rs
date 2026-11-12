//! Definisi router — satu-satunya tempat pemetaan route.
//!
//! Topologi:
//! - Publik: health, `auth/companies`, `auth/login`, `mfa/reset-request`.
//! - Terproteksi (RequestContext middleware): MFA, switch-company,
//!   navigation, studio/items, ITAM, DCIM/IPAM, files, excel.
//! - Middleware global: correlation_id (X-Correlation-ID) + security headers.

use axum::routing::{get, post};
use axum::{Router, middleware as axum_middleware};

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
        .route_layer(axum_middleware::from_fn_with_state(state.clone(), request_context))
        .layer(axum::extract::DefaultBodyLimit::max(handlers::files::MAX_UPLOAD_BYTES));

    // --- Router publik ---
    let public = Router::new()
        .route("/api/v1/health", get(handlers::health::health))
        .route("/api/v1/auth/companies", get(handlers::auth::companies))
        .route("/api/v1/auth/login", post(handlers::auth::login))
        .route("/api/v1/auth/mfa/reset-request", post(handlers::mfa::reset_request));

    let app = public.merge(protected).with_state(state);

    app.layer(axum_middleware::from_fn(correlation_id))
        .layer(axum_middleware::from_fn(security_headers))
}
