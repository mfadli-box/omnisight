//! Use case readiness: agregasi probe database & storage via port `domain/`.

use serde::Serialize;

use crate::domain::error::DomainError;
use crate::domain::ports::{DatabaseProbe, StorageProbe};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckStatus {
    Up,
    Down,
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthChecks {
    pub database: CheckStatus,
    pub storage: CheckStatus,
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthReport {
    /// `"ok"` bila semua probe naik, `"degraded"` bila ada yang turun.
    pub status: &'static str,
    pub checks: HealthChecks,
}

/// Menjalankan seluruh probe readiness secara paralel. Tidak pernah panic;
/// kegagalan dependensi dilaporkan sebagai status (503), bukan error 500.
pub async fn check<D, S>(db: &D, storage: &S) -> HealthReport
where
    D: DatabaseProbe,
    S: StorageProbe,
{
    let (db_res, storage_res) = tokio::join!(db.ping(), storage.probe());

    let database = status_of(db_res);
    let storage = status_of(storage_res);
    let all_up = database == CheckStatus::Up && storage == CheckStatus::Up;

    HealthReport {
        status: if all_up { "ok" } else { "degraded" },
        checks: HealthChecks { database, storage },
    }
}

fn status_of(result: Result<(), DomainError>) -> CheckStatus {
    match result {
        Ok(()) => CheckStatus::Up,
        Err(_) => CheckStatus::Down,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Probe tiruan: hasil dikontrol per komponen tanpa I/O nyata.
    struct FakeProbes {
        db_ok: bool,
        storage_ok: bool,
    }

    impl DatabaseProbe for FakeProbes {
        async fn ping(&self) -> Result<(), DomainError> {
            self.db_ok
                .then_some(())
                .ok_or_else(|| DomainError::Unavailable("db down".to_owned()))
        }
    }

    impl StorageProbe for FakeProbes {
        async fn probe(&self) -> Result<(), DomainError> {
            self.storage_ok
                .then_some(())
                .ok_or_else(|| DomainError::Unavailable("rustfs down".to_owned()))
        }
    }

    #[tokio::test]
    async fn semua_naik_menghasilkan_ok() {
        let fakes = FakeProbes {
            db_ok: true,
            storage_ok: true,
        };
        let report = check(&fakes, &fakes).await;

        assert_eq!(report.status, "ok");
        assert_eq!(report.checks.database, CheckStatus::Up);
        assert_eq!(report.checks.storage, CheckStatus::Up);
    }

    #[tokio::test]
    async fn database_turun_menghasilkan_degraded() {
        let fakes = FakeProbes {
            db_ok: false,
            storage_ok: true,
        };
        let report = check(&fakes, &fakes).await;

        assert_eq!(report.status, "degraded");
        assert_eq!(report.checks.database, CheckStatus::Down);
        assert_eq!(report.checks.storage, CheckStatus::Up);
    }

    #[tokio::test]
    async fn storage_turun_menghasilkan_degraded() {
        let fakes = FakeProbes {
            db_ok: true,
            storage_ok: false,
        };
        let report = check(&fakes, &fakes).await;

        assert_eq!(report.status, "degraded");
        assert_eq!(report.checks.database, CheckStatus::Up);
        assert_eq!(report.checks.storage, CheckStatus::Down);
    }

    #[test]
    fn serialisasi_mengikuti_kontrak_snake_case() {
        let report = HealthReport {
            status: "ok",
            checks: HealthChecks {
                database: CheckStatus::Up,
                storage: CheckStatus::Down,
            },
        };
        let json = serde_json::to_value(&report).unwrap();

        assert_eq!(
            json,
            serde_json::json!({
                "status": "ok",
                "checks": { "database": "up", "storage": "down" }
            })
        );
    }
}
