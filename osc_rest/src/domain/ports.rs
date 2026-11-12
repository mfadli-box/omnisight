//! Port (trait) milik `domain/`, diimplementasikan oleh `infrastructure/`.
//! Async fn in trait (RPITIT) — dipakai lewat static dispatch (generik),
//! sehingga tidak perlu crate `async-trait`.

use crate::domain::error::DomainError;

/// Probe kesiapan database (dipakai use case health/readiness).
pub trait DatabaseProbe {
    async fn ping(&self) -> Result<(), DomainError>;
}

/// Probe kesiapan object storage RustFS (S3-compatible).
pub trait StorageProbe {
    async fn probe(&self) -> Result<(), DomainError>;
}
