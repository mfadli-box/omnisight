//! Store PostgreSQL — implementasi repository (`infrastructure`).
//! Semua query runtime + parameterized (`$n` bind), tanpa macro compile-time
//! agar kompilasi tidak butuh database. Tenant isolation: kolom `company_id`
//! selalu leading pada filter (RequestContext, bab 5.6).

pub mod agents;
pub mod files;
pub mod identity;
pub mod itam;
pub mod netbox;
pub mod studio;
pub mod telemetry;
pub mod uptime;
pub mod infra;

use crate::domain::error::DomainError;
use sqlx::PgPool;
use uuid::Uuid;

/// Referensi master/operasional yang wajib terverifikasi milik tenant
/// sebelum dipakai sebagai FK (anti IDOR, bab 5.6). Type-safe — bukan
/// string bebas, sehingga tidak ada permukaan SQL injection.
#[derive(Debug, Clone, Copy)]
pub(crate) enum RefTable {
    Asset,
    AssetModel,
    StatusLabel,
    DockerHost,
    NginxNode,
    UptimeMonitor,
    ComposeStack,
    NginxVhost,
}

/// `true` bila baris ada pada company tsb (dan belum di-soft-delete).
pub(crate) async fn ref_in_company(
    pool: &PgPool,
    company_id: Uuid,
    table: RefTable,
    id: Uuid,
) -> Result<bool, DomainError> {
    let sql = match table {
        RefTable::Asset => {
            "SELECT 1 FROM assets WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL"
        }
        RefTable::AssetModel => {
            "SELECT 1 FROM asset_models WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL"
        }
        RefTable::StatusLabel => {
            "SELECT 1 FROM status_labels WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL"
        }
        RefTable::DockerHost => {
            "SELECT 1 FROM docker_hosts WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL"
        }
        RefTable::NginxNode => {
            "SELECT 1 FROM nginx_nodes WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL"
        }
        RefTable::UptimeMonitor => {
            "SELECT 1 FROM uptime_monitors WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL"
        }
        RefTable::ComposeStack => {
            "SELECT 1 FROM compose_stacks WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL"
        }
        RefTable::NginxVhost => {
            "SELECT 1 FROM nginx_virtual_hosts WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL"
        }
    };
    let found = sqlx::query(sql)
        .bind(company_id)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(db_err)?;
    Ok(found.is_some())
}

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
