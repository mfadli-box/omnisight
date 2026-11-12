//! Adapter PostgreSQL (sqlx) untuk port `DatabaseProbe`.
//!
//! Query memakai bentuk runtime + parameterized (bukan macro compile-time)
//! sehingga kompilasi tidak butuh database; SQL injection tertangani oleh
//! binding parameter — jangan pernah memformat string SQL dari input klien.

use std::time::Duration;

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

use crate::domain::error::DomainError;
use crate::domain::ports::DatabaseProbe;

/// Holder connection pooling PostgreSQL + implementasi probe readiness.
#[derive(Clone)]
pub struct PgHealth {
    pool: PgPool,
}

impl PgHealth {
    /// Bangun pool koneksi (max 10 koneksi, acquire timeout 5 detik).
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(Duration::from_secs(5))
            .connect(database_url)
            .await?;
        Ok(Self { pool })
    }

    /// Akses pool untuk repository (bulk UNNEST, transaksi, dsb.).
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}

impl DatabaseProbe for PgHealth {
    async fn ping(&self) -> Result<(), DomainError> {
        sqlx::query("SELECT 1")
            .execute(&self.pool)
            .await
            .map(|_| ())
            .map_err(|e| DomainError::Unavailable(format!("database probe gagal: {e}")))
    }
}
