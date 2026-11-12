//! Error domain — framework-agnostic, tidak pernah dipetakan langsung
//! ke HTTP di layer ini (pemetaan dilakukan `presentation/error.rs`).

#[derive(Debug, thiserror::Error)]
#[allow(dead_code)] // varian lain dipakai mulai fase fitur (auth/excel)
pub enum DomainError {
    #[error("resource not found")]
    NotFound,

    #[error("validation failed: {0}")]
    Validation(String),

    #[error("dependency unavailable: {0}")]
    /// Pesan detail HANYA untuk log/diagnostik — jangan pernah
    /// diteruskan apa adanya ke respons klien.
    Unavailable(String),
}
