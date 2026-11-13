//! Repository ITAM (Snipe-IT/GLPI): assets, checkout/checkin atomik
//! (`FOR UPDATE` + re-check), licenses, tickets (ITIL), dan bulk import.

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;
use crate::domain::filter::{FieldMap, FilterNode, push_where};

use super::Store;

pub(crate) struct AssetNew<'a> {
    pub company_id: Uuid,
    pub name: &'a str,
    pub asset_tag: &'a str,
    pub node_type: &'a str,
    pub status: &'a str,
    pub hostname: Option<&'a str>,
    pub mgmt_ip: Option<&'a str>,
    pub serial_number: Option<&'a str>,
    pub asset_model_id: Uuid,
    pub status_label_id: Uuid,
    pub site_id: Option<Uuid>,
    pub department_id: Option<Uuid>,
    pub location_id: Option<Uuid>,
    pub supplier_id: Option<Uuid>,
    pub assigned_to_user_id: Option<Uuid>,
    pub purchase_date: Option<chrono::NaiveDate>,
    pub purchase_cost: Option<f64>,
    pub notes: Option<&'a str>,
    pub source: Option<&'a str>,
}

impl Store {
    // ------------------------------------------------------------------
    // Assets
    // ------------------------------------------------------------------

    fn asset_field_map() -> FieldMap {
        FieldMap::from([
            ("asset_tag".to_owned(), crate::domain::filter::FieldKind::Text("a.asset_tag".into())),
            ("name".to_owned(), crate::domain::filter::FieldKind::Text("a.name".into())),
            ("hostname".to_owned(), crate::domain::filter::FieldKind::Text("a.hostname".into())),
            ("serial_number".to_owned(), crate::domain::filter::FieldKind::Text("a.serial_number".into())),
            ("node_type".to_owned(), crate::domain::filter::FieldKind::Text("a.node_type::text".into())),
            ("status".to_owned(), crate::domain::filter::FieldKind::Text("a.status::text".into())),
            ("mgmt_ip".to_owned(), crate::domain::filter::FieldKind::Text("a.mgmt_ip::text".into())),
            ("purchase_cost".to_owned(), crate::domain::filter::FieldKind::Numeric("a.purchase_cost".into())),
        ])
    }

    pub async fn assets_list(
        &self,
        company_id: Uuid,
        filter: Option<&FilterNode>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let mut qb = sqlx::query_builder::QueryBuilder::new(
            "SELECT a.id, a.name, a.asset_tag, a.node_type::text AS node_type,
                    a.status::text AS status, a.hostname, a.mgmt_ip::text AS mgmt_ip,
                    a.serial_number, a.assigned_to_user_id, a.last_seen_at,
                    a.purchase_cost::float8 AS purchase_cost, a.is_dynamic, a.source,
                    m.name AS model_name, sl.name AS status_label_name, sl.type::text AS status_label_type
             FROM assets a
             JOIN asset_models m ON m.id = a.asset_model_id
             JOIN status_labels sl ON sl.id = a.status_label_id
             WHERE a.company_id = ",
        );
        qb.push_bind(company_id);
        qb.push(" AND a.deleted_at IS NULL");
        if let Some(filter) = filter {
            qb.push(" AND ");
            push_where(&mut qb, filter, &Self::asset_field_map())?;
        }
        qb.push(" ORDER BY a.created_at DESC LIMIT ");
        qb.push_bind(limit.clamp(1, 500));
        qb.push(" OFFSET ");
        qb.push_bind(offset.max(0));

        let rows = qb.build().fetch_all(self.pool()).await.map_err(super::db_err)?;
        rows.iter().map(row_to_asset).collect()
    }

    pub async fn asset_get(&self, company_id: Uuid, asset_id: Uuid) -> Result<Value, DomainError> {
        let row = sqlx::query(
            "SELECT a.id, a.name, a.asset_tag, a.node_type::text AS node_type,
                    a.status::text AS status, a.hostname, a.fqdn, a.mgmt_ip::text AS mgmt_ip,
                    a.serial_number, a.assigned_to_user_id, a.last_seen_at, a.location_path,
                    a.purchase_date, a.purchase_cost::float8 AS purchase_cost,
                    a.warranty_months, a.notes, a.metadata, a.custom_fields,
                    m.name AS model_name, sl.name AS status_label_name,
                    a.created_at, a.updated_at
             FROM assets a
             JOIN asset_models m ON m.id = a.asset_model_id
             JOIN status_labels sl ON sl.id = a.status_label_id
             WHERE a.id = $2 AND a.company_id = $1 AND a.deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(asset_id)
        .fetch_optional(self.pool())
        .await
        .map_err(super::db_err)?
        .ok_or(DomainError::NotFound)?;

        row_to_asset_full(&row)
    }

    /// Buat aset (model & status label wajib milik company yang sama — anti IDOR).
    pub async fn asset_create(&self, asset: AssetNew<'_>) -> Result<Uuid, DomainError> {
        if !matches!(
            asset.node_type,
            "HOST" | "NETWORK" | "VIRTUAL" | "CONTAINER" | "RACK_MOUNTED" | "SERVICE"
        ) {
            return Err(DomainError::validation("node_type tidak valid"));
        }
        if !matches!(
            asset.status,
            "ACTIVE" | "PLANNED" | "STAGED" | "OFFLINE" | "FAILED" | "DECOMMISSIONED"
        ) {
            return Err(DomainError::validation("status tidak valid"));
        }
        self.assert_in_company(asset.company_id, "asset_models", asset.asset_model_id)
            .await?;
        self.assert_in_company(asset.company_id, "status_labels", asset.status_label_id)
            .await?;
        if let Some(user) = asset.assigned_to_user_id {
            self.assert_user_exists(user).await?;
        }

        let row = sqlx::query(
            "INSERT INTO assets (company_id, name, asset_tag, node_type, status, hostname,
                 mgmt_ip, serial_number, asset_model_id, status_label_id, site_id,
                 department_id, location_id, supplier_id, assigned_to_user_id,
                 purchase_date, purchase_cost, notes, source)
             VALUES ($1, $2, $3, CAST($4 AS node_type), CAST($5 AS asset_status), $6,
                 CAST($7 AS inet), $8, $9, $10, $11, $12, $13, $14, $15,
                 $16, $17, $18, $19)
             RETURNING id",
        )
        .bind(asset.company_id)
        .bind(asset.name)
        .bind(asset.asset_tag)
        .bind(asset.node_type)
        .bind(asset.status)
        .bind(asset.hostname)
        .bind(asset.mgmt_ip)
        .bind(asset.serial_number)
        .bind(asset.asset_model_id)
        .bind(asset.status_label_id)
        .bind(asset.site_id)
        .bind(asset.department_id)
        .bind(asset.location_id)
        .bind(asset.supplier_id)
        .bind(asset.assigned_to_user_id)
        .bind(asset.purchase_date)
        .bind(asset.purchase_cost)
        .bind(asset.notes)
        .bind(asset.source)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    /// Verifikasi baris master milik company (anti IDOR, bab 5.6).
    async fn assert_in_company(
        &self,
        company_id: Uuid,
        table: &str,
        id: Uuid,
    ) -> Result<(), DomainError> {
        // table berasal dari pemanggilan internal literal — bukan input klien.
        let found = match table {
            "asset_models" => {
                sqlx::query("SELECT 1 FROM asset_models WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL")
                    .bind(company_id).bind(id).fetch_optional(self.pool()).await.map_err(super::db_err)?
            }
            "status_labels" => {
                sqlx::query("SELECT 1 FROM status_labels WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL")
                    .bind(company_id).bind(id).fetch_optional(self.pool()).await.map_err(super::db_err)?
            }
            _ => None,
        };
        if found.is_none() {
            return Err(DomainError::validation(format!(
                "referensi {table} tidak ditemukan pada company aktif"
            )));
        }
        Ok(())
    }

    async fn assert_user_exists(&self, user_id: Uuid) -> Result<(), DomainError> {
        sqlx::query("SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL AND is_active")
            .bind(user_id)
            .fetch_optional(self.pool())
            .await
            .map_err(super::db_err)?
            .ok_or_else(|| DomainError::validation("user penerima tidak ditemukan"))?;
        Ok(())
    }

    /// Get-or-create master default per company (import Excel tanpa master).
    pub async fn asset_defaults_ensure(&self, company_id: Uuid) -> Result<(Uuid, Uuid), DomainError> {
        let category = sqlx::query(
            "INSERT INTO categories (company_id, name, type)
             VALUES ($1, 'General', 'ASSET')
             ON CONFLICT (company_id, type, name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id",
        )
        .bind(company_id)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        let manufacturer = sqlx::query(
            "INSERT INTO manufacturers (company_id, name)
             VALUES ($1, 'Generic')
             ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id",
        )
        .bind(company_id)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        let category_id: Uuid = category.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;
        let manufacturer_id: Uuid = manufacturer.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;

        let model = sqlx::query(
            "INSERT INTO asset_models (company_id, name, category_id, manufacturer_id)
             VALUES ($1, 'Generic Model', $2, $3)
             ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id",
        )
        .bind(company_id)
        .bind(category_id)
        .bind(manufacturer_id)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        let label = sqlx::query(
            "INSERT INTO status_labels (company_id, name, type)
             VALUES ($1, 'Deployable', 'DEPLOYABLE')
             ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id",
        )
        .bind(company_id)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        let model_id: Uuid = model.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;
        let label_id: Uuid = label.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;
        Ok((model_id, label_id))
    }

    /// Cari model per nama (import); bila tidak ada → `None` (pemanggil
    /// memutuskan pakai default atau menandai error baris).
    pub async fn asset_model_id_by_name(&self, company_id: Uuid, name: &str) -> Option<Uuid> {
        sqlx::query("SELECT id FROM asset_models WHERE company_id = $1 AND name = $2 AND deleted_at IS NULL")
            .bind(company_id)
            .bind(name)
            .fetch_optional(self.pool())
            .await
            .ok()
            .flatten()
            .and_then(|row| row.try_get("id").ok())
    }

    /// Status label per nama (case-insensitive); fallback label deployable.
    pub async fn status_label_id_by_name(&self, company_id: Uuid, name: &str) -> Option<Uuid> {
        sqlx::query(
            "SELECT id FROM status_labels
             WHERE company_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL",
        )
        .bind(company_id)
        .bind(name)
        .fetch_optional(self.pool())
        .await
        .ok()
        .flatten()
        .and_then(|row| row.try_get("id").ok())
    }

    /// Checkout atomik (pola Snipe-IT `lockForUpdate + re-check`):
    /// transaksi + `SELECT … FOR UPDATE` + validasi availability.
    pub async fn asset_checkout(
        &self,
        company_id: Uuid,
        asset_id: Uuid,
        actor_user_id: Uuid,
        target_user_id: Option<Uuid>,
        target_location_id: Option<Uuid>,
        expected_checkin_at: Option<DateTime<Utc>>,
    ) -> Result<(), DomainError> {
        if let Some(target) = target_user_id {
            self.assert_user_exists(target).await?;
        }

        let mut tx = self.pool().begin().await.map_err(super::db_err)?;

        let row = sqlx::query(
            "SELECT a.assigned_to_user_id, sl.type::text AS label_type
             FROM assets a
             JOIN status_labels sl ON sl.id = a.status_label_id
             WHERE a.id = $2 AND a.company_id = $1 AND a.deleted_at IS NULL
             FOR UPDATE OF a",
        )
        .bind(company_id)
        .bind(asset_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(super::db_err)?
        .ok_or(DomainError::NotFound)?;

        let assigned: Option<Uuid> = row.try_get("assigned_to_user_id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;
        let label_type: String = row.try_get("label_type").map_err(|e| DomainError::Unavailable(format!("{e}")))?;

        // Re-check dalam lock: harus bebas & deployable.
        if assigned.is_some() {
            return Err(DomainError::Conflict("aset sedang dipinjam (assigned)".into()));
        }
        if label_type != "DEPLOYABLE" {
            return Err(DomainError::validation("status label aset tidak deployable"));
        }

        sqlx::query("UPDATE assets SET assigned_to_user_id = $3, updated_at = now() WHERE id = $2 AND company_id = $1")
            .bind(company_id)
            .bind(asset_id)
            .bind(target_user_id)
            .execute(&mut *tx)
            .await
            .map_err(super::db_err)?;

        sqlx::query(
            "INSERT INTO asset_checkout_logs (asset_id, action, actor_user_id, target_user_id, target_location_id, expected_checkin_at)
             VALUES ($1, 'CHECKOUT', $2, $3, $4, $5)",
        )
        .bind(asset_id)
        .bind(actor_user_id)
        .bind(target_user_id)
        .bind(target_location_id)
        .bind(expected_checkin_at)
        .execute(&mut *tx)
        .await
        .map_err(super::db_err)?;

        tx.commit().await.map_err(super::db_err)
    }

    /// Checkin atomik — aset wajib sedang assigned.
    pub async fn asset_checkin(
        &self,
        company_id: Uuid,
        asset_id: Uuid,
        actor_user_id: Uuid,
    ) -> Result<(), DomainError> {
        let mut tx = self.pool().begin().await.map_err(super::db_err)?;

        let row = sqlx::query(
            "SELECT assigned_to_user_id
             FROM assets
             WHERE id = $2 AND company_id = $1 AND deleted_at IS NULL
             FOR UPDATE",
        )
        .bind(company_id)
        .bind(asset_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(super::db_err)?
        .ok_or(DomainError::NotFound)?;

        let assigned: Option<Uuid> = row.try_get("assigned_to_user_id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;
        if assigned.is_none() {
            return Err(DomainError::validation("aset tidak sedang dipinjam"));
        }

        sqlx::query("UPDATE assets SET assigned_to_user_id = NULL, updated_at = now() WHERE id = $2 AND company_id = $1")
            .bind(company_id)
            .bind(asset_id)
            .execute(&mut *tx)
            .await
            .map_err(super::db_err)?;

        sqlx::query(
            "INSERT INTO asset_checkout_logs (asset_id, action, actor_user_id, target_user_id)
             VALUES ($1, 'CHECKIN', $2, $3)",
        )
        .bind(asset_id)
        .bind(actor_user_id)
        .bind(assigned)
        .execute(&mut *tx)
        .await
        .map_err(super::db_err)?;

        tx.commit().await.map_err(super::db_err)
    }

    // ------------------------------------------------------------------
    // Licenses
    // ------------------------------------------------------------------

    pub async fn licenses_list(
        &self,
        company_id: Uuid,
        filter: Option<&FilterNode>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let mut map = FieldMap::new();
        map.insert("name".into(), crate::domain::filter::FieldKind::Text("l.name".into()));
        map.insert("type".into(), crate::domain::filter::FieldKind::Text("l.type::text".into()));
        map.insert("expiry_date".into(), crate::domain::filter::FieldKind::Text("l.expiry_date::text".into()));
        map.insert("seats_total".into(), crate::domain::filter::FieldKind::Numeric("l.seats_total".into()));

        let mut qb = sqlx::query_builder::QueryBuilder::new(
            "SELECT l.id, l.name, l.type::text AS type, l.seats_total,
                    l.purchase_date, l.expiry_date, l.license_key IS NOT NULL AS has_key,
                    (SELECT count(*) FROM license_seats s WHERE s.license_id = l.id AND s.assigned_user_id IS NOT NULL AND s.assigned_asset_id IS NOT NULL) AS seats_used
             FROM software_licenses l
             WHERE l.company_id = ",
        );
        qb.push_bind(company_id);
        qb.push(" AND l.deleted_at IS NULL");
        if let Some(filter) = filter {
            qb.push(" AND ");
            push_where(&mut qb, filter, &map)?;
        }
        qb.push(" ORDER BY l.created_at DESC LIMIT ");
        qb.push_bind(limit.clamp(1, 500));
        qb.push(" OFFSET ");
        qb.push_bind(offset.max(0));

        let rows = qb.build().fetch_all(self.pool()).await.map_err(super::db_err)?;
        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "name": row.try_get::<String, _>("name")?,
                    "type": row.try_get::<String, _>("type")?,
                    "seats_total": row.try_get::<i32, _>("seats_total")?,
                    "seats_used": row.try_get::<i64, _>("seats_used")?,
                    "purchase_date": row.try_get::<Option<chrono::NaiveDate>, _>("purchase_date")?,
                    "expiry_date": row.try_get::<Option<chrono::NaiveDate>, _>("expiry_date")?,
                    "has_key": row.try_get::<bool, _>("has_key")?,
                }))
            })
            .collect()
    }

    // ------------------------------------------------------------------
    // Tickets (ITIL ala GLPI)
    // ------------------------------------------------------------------

    pub async fn tickets_list(
        &self,
        company_id: Uuid,
        filter: Option<&FilterNode>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let mut map = FieldMap::new();
        map.insert("code".into(), crate::domain::filter::FieldKind::Text("t.code".into()));
        map.insert("title".into(), crate::domain::filter::FieldKind::Text("t.title".into()));
        map.insert("status".into(), crate::domain::filter::FieldKind::Text("t.status::text".into()));
        map.insert("priority".into(), crate::domain::filter::FieldKind::Text("t.priority::text".into()));
        map.insert("ticket_type".into(), crate::domain::filter::FieldKind::Text("t.type::text".into()));
        map.insert("assignee_user_id".into(), crate::domain::filter::FieldKind::Text("t.assignee_user_id::text".into()));

        let mut qb = sqlx::query_builder::QueryBuilder::new(
            "SELECT t.id, t.code, t.title, t.type::text AS type, t.status::text AS status,
                    t.priority::text AS priority, t.requester_user_id, t.assignee_user_id,
                    t.asset_id, t.opened_at, t.due_at, t.resolved_at, t.closed_at
             FROM tickets t
             WHERE t.company_id = ",
        );
        qb.push_bind(company_id);
        qb.push(" AND t.deleted_at IS NULL");
        if let Some(filter) = filter {
            qb.push(" AND ");
            push_where(&mut qb, filter, &map)?;
        }
        qb.push(" ORDER BY t.opened_at DESC LIMIT ");
        qb.push_bind(limit.clamp(1, 500));
        qb.push(" OFFSET ");
        qb.push_bind(offset.max(0));

        let rows = qb.build().fetch_all(self.pool()).await.map_err(super::db_err)?;
        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "code": row.try_get::<String, _>("code")?,
                    "title": row.try_get::<String, _>("title")?,
                    "type": row.try_get::<String, _>("type")?,
                    "status": row.try_get::<String, _>("status")?,
                    "priority": row.try_get::<String, _>("priority")?,
                    "requester_user_id": row.try_get::<Option<Uuid>, _>("requester_user_id")?,
                    "assignee_user_id": row.try_get::<Option<Uuid>, _>("assignee_user_id")?,
                    "asset_id": row.try_get::<Option<Uuid>, _>("asset_id")?,
                    "opened_at": row.try_get::<DateTime<Utc>, _>("opened_at")?,
                    "due_at": row.try_get::<Option<DateTime<Utc>>, _>("due_at")?,
                }))
            })
            .collect()
    }

    /// Tiket baru dengan kode per-company `TK-NNNNNN` (sequence app-generated).
    pub async fn ticket_create(&self, ticket: TicketNew<'_>) -> Result<Value, DomainError> {
        if !matches!(ticket.ticket_type, "INCIDENT" | "REQUEST") {
            return Err(DomainError::validation("ticket type tidak valid"));
        }
        if !matches!(
            ticket.priority,
            "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH"
        ) {
            return Err(DomainError::validation("priority tidak valid"));
        }
        if let Some(asset) = ticket.asset_id {
            self.asset_get(ticket.company_id, asset).await?; // tenant match
        }

        let mut tx = self.pool().begin().await.map_err(super::db_err)?;
        let next: i64 = sqlx::query(
            "SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::bigint), 0) + 1 AS next
             FROM tickets WHERE company_id = $1",
        )
        .bind(ticket.company_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(super::db_err)?
        .try_get("next")
        .map_err(|e| DomainError::Unavailable(format!("{e}")))?;

        let code = format!("TK-{next:06}");
        let row = sqlx::query(
            "INSERT INTO tickets (company_id, code, title, description, type, priority,
                 requester_user_id, assignee_user_id, asset_id, category_id, due_at)
             VALUES ($1, $2, $3, $4, CAST($5 AS ticket_type), CAST($6 AS ticket_priority),
                 $7, $8, $9, $10, $11)
             RETURNING id, code",
        )
        .bind(ticket.company_id)
        .bind(&code)
        .bind(ticket.title)
        .bind(ticket.description)
        .bind(ticket.ticket_type)
        .bind(ticket.priority)
        .bind(ticket.requester_user_id)
        .bind(ticket.assignee_user_id)
        .bind(ticket.asset_id)
        .bind(ticket.category_id)
        .bind(ticket.due_at)
        .fetch_one(&mut *tx)
        .await
        .map_err(super::db_err)?;

        let id: Uuid = row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))?;
        let code: String = row.try_get("code").map_err(|e| DomainError::Unavailable(format!("{e}")))?;
        tx.commit().await.map_err(super::db_err)?;

        Ok(json!({ "id": id, "code": code }))
    }
}

/// Paket parameter tiket baru (menghindari fungsi >7 argumen).
pub(crate) struct TicketNew<'a> {
    pub company_id: Uuid,
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub ticket_type: &'a str,
    pub priority: &'a str,
    pub requester_user_id: Option<Uuid>,
    pub assignee_user_id: Option<Uuid>,
    pub asset_id: Option<Uuid>,
    pub category_id: Option<Uuid>,
    pub due_at: Option<DateTime<Utc>>,
}

fn row_to_asset(row: &sqlx::postgres::PgRow) -> Result<Value, DomainError> {
    Ok(json!({
        "id": row.try_get::<Uuid, _>("id").map_err(row_err)?,
        "name": row.try_get::<String, _>("name").map_err(row_err)?,
        "asset_tag": row.try_get::<String, _>("asset_tag").map_err(row_err)?,
        "node_type": row.try_get::<String, _>("node_type").map_err(row_err)?,
        "status": row.try_get::<String, _>("status").map_err(row_err)?,
        "hostname": row.try_get::<Option<String>, _>("hostname").map_err(row_err)?,
        "mgmt_ip": row.try_get::<Option<String>, _>("mgmt_ip").map_err(row_err)?,
        "serial_number": row.try_get::<Option<String>, _>("serial_number").map_err(row_err)?,
        "assigned_to_user_id": row.try_get::<Option<Uuid>, _>("assigned_to_user_id").map_err(row_err)?,
        "last_seen_at": row.try_get::<Option<DateTime<Utc>>, _>("last_seen_at").map_err(row_err)?,
        "purchase_cost": row.try_get::<Option<f64>, _>("purchase_cost").map_err(row_err)?,
        "is_dynamic": row.try_get::<bool, _>("is_dynamic").map_err(row_err)?,
        "source": row.try_get::<Option<String>, _>("source").map_err(row_err)?,
        "model_name": row.try_get::<String, _>("model_name").map_err(row_err)?,
        "status_label_name": row.try_get::<String, _>("status_label_name").map_err(row_err)?,
        "status_label_type": row.try_get::<String, _>("status_label_type").map_err(row_err)?,
    }))
}

fn row_to_asset_full(row: &sqlx::postgres::PgRow) -> Result<Value, DomainError> {
    row_to_asset(row).map(|mut value| {
        if let Some(obj) = value.as_object_mut() {
            let extra = json!({
                "fqdn": row.try_get::<Option<String>, _>("fqdn").map_err(row_err).ok().flatten(),
                "location_path": row.try_get::<Option<String>, _>("location_path").map_err(row_err).ok().flatten(),
                "purchase_date": row.try_get::<Option<chrono::NaiveDate>, _>("purchase_date").map_err(row_err).ok().flatten(),
                "warranty_months": row.try_get::<Option<i32>, _>("warranty_months").map_err(row_err).ok().flatten(),
                "notes": row.try_get::<Option<String>, _>("notes").map_err(row_err).ok().flatten(),
                "metadata": row.try_get::<Option<Value>, _>("metadata").map_err(row_err).ok().flatten(),
                "custom_fields": row.try_get::<Option<Value>, _>("custom_fields").map_err(row_err).ok().flatten(),
                "model_name": row.try_get::<String, _>("model_name").map_err(row_err).ok(),
                "status_label_name": row.try_get::<String, _>("status_label_name").map_err(row_err).ok(),
            });
            for (key, val) in extra.as_object().into_iter().flatten() {
                obj.insert(key.clone(), val.clone());
            }
            obj.insert("created_at".into(), json!(row.try_get::<DateTime<Utc>, _>("created_at").map_err(row_err).ok()));
            obj.insert("updated_at".into(), json!(row.try_get::<Option<DateTime<Utc>>, _>("updated_at").map_err(row_err).ok()));
        }
        value
    })
}

fn row_err(err: sqlx::Error) -> DomainError {
    DomainError::Unavailable(format!("row mapping: {err}"))
}
