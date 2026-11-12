//! Store PostgreSQL — implementasi repository (`infrastructure`).
//! Semua query runtime + parameterized (`$n` bind), tanpa macro compile-time
//! agar kompilasi tidak butuh database. Tenant isolation: kolom `company_id`
//! selalu leading pada filter (RequestContext, bab 5.6).

pub mod files;
pub mod identity;
pub mod itam;
pub mod netbox;
pub mod studio;

use crate::domain::error::DomainError;
use sqlx::PgPool;

/// Facade repository — dibagikan via `Arc<Store>` pada AppState.
#[derive(Clone)]
pub struct Store {
    pool: PgPool,
}

impl Store {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}

/// Pemetaan sqlx::Error → DomainError (unique → 409, lainnya internal).
pub(crate) fn db_err(err: sqlx::Error) -> DomainError {
    match &err {
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            DomainError::Conflict("data sudah ada (pelanggaran unique)".into())
        }
        sqlx::Error::Database(db) if db.is_foreign_key_violation() => {
            DomainError::Validation("referensi terkait tidak ditemukan".into())
        }
        _ => DomainError::Unavailable(format!("db error: {err}")),
    }
}

/// `?` langsung pada `row.try_get::<T,_>(...)` / eksekusi query di closure
/// yang mengembalikan Result<_, DomainError>.
impl From<sqlx::Error> for DomainError {
    fn from(err: sqlx::Error) -> Self {
        db_err(err)
    }
}
