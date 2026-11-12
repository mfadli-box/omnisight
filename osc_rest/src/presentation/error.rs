//! Pemetaan error -> respons HTTP.
//!
//! Prinsip: detail internal (SQL error, stack trace, path bucket) HANYA masuk
//! log — dengan redaksi secret via `infrastructure::logging::redact()` — dan
//! klien menerima envelope generik `{status, error: {code, message}}` yang
//! disisipi `correlation_id` oleh middleware correlation.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::domain::error::DomainError;
use crate::infrastructure::logging;

#[derive(Debug, thiserror::Error)]
#[allow(dead_code)] // varian lain dipakai mulai fase fitur (auth/excel)
pub enum AppError {
    #[error("{0}")]
    Validation(String),

    #[error("resource not found")]
    NotFound,

    #[error("{0}")]
    /// Pesan detail aman dikonsumsi (tidak memuat data internal).
    Unauthorized(String),

    #[error("{0}")]
    Forbidden(String),

    #[error("{0}")]
    Conflict(String),

    #[error("payload exceeds allowed size")]
    PayloadTooLarge,

    #[error("too many requests")]
    RateLimited,

    #[error("{0}")]
    /// Error upstream terkontrol (mis. HRIS invalid) — pesan aman.
    Upstream(String),

    #[error("{0}")]
    /// Sudah dimask oleh `AppError::internal()` — tidak berisi detail internal.
    Internal(String),
}

impl AppError {
    /// Bungkus error internal: detail di-redaksi lalu dicatat di log, klien
    /// menerima pesan generik. Gunakan ini untuk SEMUA error yang berasal
    /// dari infrastruktur (sqlx, aws-sdk, io) agar tidak ada kebocoran.
    #[allow(dead_code)] // dipakai mulai fase fitur (auth/excel)
    pub fn internal<E: std::fmt::Display>(err: E) -> Self {
        tracing::error!(error = %logging::redact(&err.to_string()), "internal error");
        AppError::Internal("internal server error".to_owned())
    }
}

/// Jembatan error domain -> error presentasi (dipakai handler via `?`).
/// Varian `Unavailable` membawa detail infrastruktur: di-redaksi saat masuk
/// log, klien tetap menerima pesan generik.
impl From<DomainError> for AppError {
    fn from(err: DomainError) -> Self {
        match err {
            DomainError::NotFound => AppError::NotFound,
            DomainError::Validation(message) => AppError::Validation(message),
            DomainError::Unauthorized(message) => AppError::Unauthorized(message),
            DomainError::Forbidden(message) => AppError::Forbidden(message),
            DomainError::Conflict(message) => AppError::Conflict(message),
            DomainError::RateLimited => AppError::RateLimited,
            DomainError::Upstream(message) => AppError::Upstream(message),
            DomainError::Unavailable(detail) => AppError::internal(detail),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, "VALIDATION_ERROR", msg),
            AppError::NotFound => (
                StatusCode::NOT_FOUND,
                "NOT_FOUND",
                "resource tidak ditemukan".to_owned(),
            ),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, "FORBIDDEN", msg),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, "CONFLICT", msg),
            AppError::PayloadTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "PAYLOAD_TOO_LARGE",
                "payload melebihi batas".to_owned(),
            ),
            AppError::RateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMITED",
                "terlalu banyak permintaan".to_owned(),
            ),
            AppError::Upstream(msg) => (
                StatusCode::BAD_GATEWAY,
                "HRIS_UPSTREAM_INVALID_RESPONSE",
                msg,
            ),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", msg),
        };

        let body = json!({
            "status": "error",
            "error": { "code": code, "message": message }
        });

        (status, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;

    async fn assert_envelope(err: AppError, expected_status: StatusCode, expected_code: &str) {
        let res = err.into_response();
        assert_eq!(res.status(), expected_status);

        let bytes = to_bytes(res.into_body(), 4096).await.unwrap();
        let envelope: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(envelope["status"], json!("error"));
        assert_eq!(envelope["error"]["code"], json!(expected_code));
        assert!(envelope["error"]["message"].is_string());
    }

    #[tokio::test]
    async fn pemetaan_status_dan_kode() {
        assert_envelope(
            AppError::Validation("x".into()),
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
        )
        .await;
        assert_envelope(AppError::NotFound, StatusCode::NOT_FOUND, "NOT_FOUND").await;
        assert_envelope(
            AppError::Unauthorized("kredensial tidak valid".into()),
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
        )
        .await;
        assert_envelope(
            AppError::Forbidden("izin tidak memadai".into()),
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
        )
        .await;
        assert_envelope(
            AppError::Conflict("data sudah ada".into()),
            StatusCode::CONFLICT,
            "CONFLICT",
        )
        .await;
        assert_envelope(
            AppError::Upstream("hris upstream gagal".into()),
            StatusCode::BAD_GATEWAY,
            "HRIS_UPSTREAM_INVALID_RESPONSE",
        )
        .await;
        assert_envelope(
            AppError::PayloadTooLarge,
            StatusCode::PAYLOAD_TOO_LARGE,
            "PAYLOAD_TOO_LARGE",
        )
        .await;
        assert_envelope(
            AppError::RateLimited,
            StatusCode::TOO_MANY_REQUESTS,
            "RATE_LIMITED",
        )
        .await;
        assert_envelope(
            AppError::Internal("internal server error".into()),
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
        )
        .await;
    }

    #[test]
    fn dari_domain_error() {
        assert!(matches!(
            AppError::from(DomainError::NotFound),
            AppError::NotFound
        ));
        assert!(matches!(
            AppError::from(DomainError::Validation("bad".into())),
            AppError::Validation(_)
        ));
        assert!(matches!(
            AppError::from(DomainError::Upstream("0|NONE".into())),
            AppError::Upstream(_)
        ));
        // Unavailable -> Internal generik (detail tidak ikut ke klien).
        let mapped = AppError::from(DomainError::Unavailable("koneksi gagal".into()));
        assert!(matches!(mapped, AppError::Internal(_)));
    }

    #[test]
    fn internal_menyembunyikan_detail_dari_klien() {
        let err = AppError::internal("dsn postgresql://dbe:password@host");
        assert!(matches!(err, AppError::Internal(msg) if msg == "internal server error"));
    }
}
