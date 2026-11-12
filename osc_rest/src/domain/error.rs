//! Error domain — framework-agnostic, tidak pernah dipetakan langsung
//! ke HTTP di layer ini (pemetaan dilakukan `presentation/error.rs`).

#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("resource not found")]
    NotFound,

    #[error("validation failed: {0}")]
    Validation(String),

    #[error("unauthorized: {0}")]
    /// Detail HANYA untuk log/diagnostik — klien menerima pesan generik.
    Unauthorized(String),

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("too many attempts")]
    RateLimited,

    #[error("dependency unavailable: {0}")]
    /// Pesan detail HANYA untuk log/diagnostik — jangan pernah
    /// diteruskan apa adanya ke respons klien.
    Unavailable(String),

    #[error("upstream invalid response: {0}")]
    /// Dependensi upstream (HRIS ASMX) gagal/invalid — dipetakan ke 502,
    /// berbeda dari 401 ("kredensial salah") dan 500 ("bug internal").
    Upstream(String),
}

impl DomainError {
    /// Helper validasi singkat.
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }
}
