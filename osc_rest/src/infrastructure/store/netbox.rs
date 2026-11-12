//! Repository DCIM/IPAM (NetBox): racks (+okupansi), ip_prefixes (validasi
//! overlap app-level), ip_addresses (unique per tenant).

use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;
use crate::domain::filter::{FieldKind, FieldMap, FilterNode, push_where};

use super::Store;

/// Parse CIDR IPv4 murni std → (addr, bits) untuk validasi overlap.
fn parse_ipv4_cidr(raw: &str) -> Option<(u32, u32)> {
    let (ip, bits) = raw.split_once('/')?;
    let bits: u32 = bits.parse().ok()?;
    if bits > 32 {
        return None;
    }
    let octets: Vec<u8> = ip
        .split('.')
        .map(|p| p.parse::<u8>().ok())
        .collect::<Option<_>>()?;
    if octets.len() != 4 {
        return None;
    }
    let addr = u32::from_be_bytes([octets[0], octets[1], octets[2], octets[3]]);
    let mask = if bits == 0 { 0 } else { u32::MAX << (32 - bits) };
    Some((addr & mask, bits))
}

fn subnet_of(candidate: (u32, u32), base: (u32, u32)) -> bool {
    let (_, base_bits) = base;
    if candidate.1 < base_bits {
        return false;
    }
    let mask = if base_bits == 0 {
        0
    } else {
        u32::MAX << (32 - base_bits)
    };
    (candidate.0 & mask) == base.0
}

impl Store {
    // ------------------------------------------------------------------
    // DCIM: racks
    // ------------------------------------------------------------------

    pub async fn racks_list(
        &self,
        company_id: Uuid,
        filter: Option<&FilterNode>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let mut map = FieldMap::new();
        map.insert("name".into(), FieldKind::Text("r.name".into()));
        map.insert("model".into(), FieldKind::Text("r.model".into()));
        map.insert("site_name".into(), FieldKind::Text("s.name".into()));
        map.insert("u_height".into(), FieldKind::Numeric("r.u_height".into()));

        let mut qb = sqlx::query_builder::QueryBuilder::new(
            "SELECT r.id, r.name, r.u_height, r.model, s.name AS site_name,
                    (SELECT count(*) FROM rack_unit_allocations x WHERE x.rack_id = r.id) AS occupied
             FROM racks r
             JOIN sites s ON s.id = r.site_id
             WHERE r.company_id = ",
        );
        qb.push_bind(company_id);
        qb.push(" AND r.deleted_at IS NULL");
        if let Some(filter) = filter {
            qb.push(" AND ");
            push_where(&mut qb, filter, &map)?;
        }
        qb.push(" ORDER BY s.name, r.name LIMIT ");
        qb.push_bind(limit.clamp(1, 500));
        qb.push(" OFFSET ");
        qb.push_bind(offset.max(0));

        let rows = qb.build().fetch_all(self.pool()).await.map_err(super::db_err)?;
        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "name": row.try_get::<String, _>("name")?,
                    "u_height": row.try_get::<i32, _>("u_height")?,
                    "model": row.try_get::<Option<String>, _>("model")?,
                    "site_name": row.try_get::<String, _>("site_name")?,
                    "occupied_units": row.try_get::<i64, _>("occupied")?,
                }))
            })
            .collect()
    }

    // ------------------------------------------------------------------
    // IPAM: prefixes & addresses
    // ------------------------------------------------------------------

    pub async fn prefixes_list(
        &self,
        company_id: Uuid,
        filter: Option<&FilterNode>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let mut map = FieldMap::new();
        map.insert("prefix".into(), FieldKind::Text("p.prefix".into()));
        map.insert("status".into(), FieldKind::Text("p.status::text".into()));
        map.insert("is_pool".into(), FieldKind::Text("p.is_pool::text".into()));

        let mut qb = sqlx::query_builder::QueryBuilder::new(
            "SELECT p.id, p.prefix, p.status::text AS status, p.is_pool,
                    p.site_id, p.vlan_id, s.name AS site_name,
                    (SELECT count(*) FROM ip_addresses i WHERE i.prefix_id = p.id AND i.deleted_at IS NULL) AS used_addresses
             FROM ip_prefixes p
             LEFT JOIN sites s ON s.id = p.site_id
             WHERE p.company_id = ",
        );
        qb.push_bind(company_id);
        qb.push(" AND p.deleted_at IS NULL");
        if let Some(filter) = filter {
            qb.push(" AND ");
            push_where(&mut qb, filter, &map)?;
        }
        qb.push(" ORDER BY p.prefix LIMIT ");
        qb.push_bind(limit.clamp(1, 500));
        qb.push(" OFFSET ");
        qb.push_bind(offset.max(0));

        let rows = qb.build().fetch_all(self.pool()).await.map_err(super::db_err)?;
        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "prefix": row.try_get::<String, _>("prefix")?,
                    "status": row.try_get::<String, _>("status")?,
                    "is_pool": row.try_get::<bool, _>("is_pool")?,
                    "site_id": row.try_get::<Option<Uuid>, _>("site_id")?,
                    "vlan_id": row.try_get::<Option<Uuid>, _>("vlan_id")?,
                    "site_name": row.try_get::<Option<String>, _>("site_name")?,
                    "used_addresses": row.try_get::<i64, _>("used_addresses")?,
                }))
            })
            .collect()
    }

    /// Prefix baru — validasi CIDR + cek overlap (containment dua arah,
    /// app-level; pola NetBox). IPv6 diteruskan tanpa overlap-check W1.
    pub async fn prefix_create(
        &self,
        company_id: Uuid,
        prefix: &str,
        status: &str,
        is_pool: bool,
        site_id: Option<Uuid>,
        vlan_id: Option<Uuid>,
    ) -> Result<Uuid, DomainError> {
        if !matches!(status, "ACTIVE" | "RESERVED" | "CONTAINER" | "DEPRECATED") {
            return Err(DomainError::validation("status prefix tidak valid"));
        }
        let parsed = parse_ipv4_cidr(prefix)
            .ok_or_else(|| DomainError::validation("prefix harus CIDR IPv4 valid (a.b.c.d/nn)"))?;

        // Overlap check app-level terhadap prefix company lain.
        let existing = sqlx::query("SELECT prefix FROM ip_prefixes WHERE company_id = $1 AND deleted_at IS NULL")
            .bind(company_id)
            .fetch_all(self.pool())
            .await
            .map_err(super::db_err)?;
        for row in existing {
            let other: String = row
                .try_get("prefix")
                .map_err(|e| DomainError::Unavailable(format!("{e}")))?;
            if let Some(other) = parse_ipv4_cidr(&other)
                && (subnet_of(parsed, other) || subnet_of(other, parsed))
            {
                return Err(DomainError::Conflict(format!(
                    "prefix tumpang tindih dengan {other:?}"
                )));
            }
        }

        let row = sqlx::query(
            "INSERT INTO ip_prefixes (company_id, prefix, status, is_pool, site_id, vlan_id)
             VALUES ($1, $2, CAST($3 AS prefix_status), $4, $5, $6)
             RETURNING id",
        )
        .bind(company_id)
        .bind(prefix)
        .bind(status)
        .bind(is_pool)
        .bind(site_id)
        .bind(vlan_id)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }

    pub async fn addresses_list(
        &self,
        company_id: Uuid,
        filter: Option<&FilterNode>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Value>, DomainError> {
        let mut map = FieldMap::new();
        map.insert("address".into(), FieldKind::Text("i.address::text".into()));
        map.insert("status".into(), FieldKind::Text("i.status::text".into()));
        map.insert("dns_name".into(), FieldKind::Text("i.dns_name".into()));
        map.insert("is_gateway".into(), FieldKind::Text("i.is_gateway::text".into()));

        let mut qb = sqlx::query_builder::QueryBuilder::new(
            "SELECT i.id, i.address::text AS address, i.status::text AS status,
                    i.prefix_id, i.interface_id, i.is_gateway, i.dns_name
             FROM ip_addresses i
             WHERE i.company_id = ",
        );
        qb.push_bind(company_id);
        qb.push(" AND i.deleted_at IS NULL");
        if let Some(filter) = filter {
            qb.push(" AND ");
            push_where(&mut qb, filter, &map)?;
        }
        qb.push(" ORDER BY i.address LIMIT ");
        qb.push_bind(limit.clamp(1, 500));
        qb.push(" OFFSET ");
        qb.push_bind(offset.max(0));

        let rows = qb.build().fetch_all(self.pool()).await.map_err(super::db_err)?;
        rows.iter()
            .map(|row| {
                Ok(json!({
                    "id": row.try_get::<Uuid, _>("id")?,
                    "address": row.try_get::<String, _>("address")?,
                    "status": row.try_get::<String, _>("status")?,
                    "prefix_id": row.try_get::<Option<Uuid>, _>("prefix_id")?,
                    "interface_id": row.try_get::<Option<Uuid>, _>("interface_id")?,
                    "is_gateway": row.try_get::<bool, _>("is_gateway")?,
                    "dns_name": row.try_get::<Option<String>, _>("dns_name")?,
                }))
            })
            .collect()
    }

    /// Alamat IP baru — validasi IP + tenant match interface (anti IDOR).
    pub async fn address_create(&self, address: AddressNew<'_>) -> Result<Uuid, DomainError> {
        address
            .address
            .parse::<std::net::IpAddr>()
            .map_err(|_| DomainError::validation("alamat IP tidak valid"))?;
        if !matches!(
            address.status,
            "ACTIVE" | "RESERVED" | "DEPRECATED" | "DHCP" | "SLAAC"
        ) {
            return Err(DomainError::validation("status IP tidak valid"));
        }
        if let Some(interface) = address.interface_id {
            let tenant_ok = sqlx::query(
                "SELECT 1
                 FROM device_interfaces di
                 JOIN assets a ON a.id = di.asset_id
                 WHERE di.id = $2 AND a.company_id = $1",
            )
            .bind(address.company_id)
            .bind(interface)
            .fetch_optional(self.pool())
            .await
            .map_err(super::db_err)?
            .is_some();
            if !tenant_ok {
                return Err(DomainError::validation("interface tidak milik company aktif"));
            }
        }

        let row = sqlx::query(
            "INSERT INTO ip_addresses (company_id, address, status, prefix_id, interface_id, is_gateway, dns_name)
             VALUES ($1, CAST($2 AS inet), CAST($3 AS ip_address_status), $4, $5, $6, $7)
             RETURNING id",
        )
        .bind(address.company_id)
        .bind(address.address)
        .bind(address.status)
        .bind(address.prefix_id)
        .bind(address.interface_id)
        .bind(address.is_gateway)
        .bind(address.dns_name)
        .fetch_one(self.pool())
        .await
        .map_err(super::db_err)?;

        row.try_get("id").map_err(|e| DomainError::Unavailable(format!("{e}")))
    }
}

/// Paket parameter alamat IP baru.
pub(crate) struct AddressNew<'a> {
    pub company_id: Uuid,
    pub address: &'a str,
    pub status: &'a str,
    pub prefix_id: Option<Uuid>,
    pub interface_id: Option<Uuid>,
    pub is_gateway: bool,
    pub dns_name: Option<&'a str>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cidr_parse_dan_overlap() {
        assert_eq!(parse_ipv4_cidr("10.10.0.0/24"), Some((0x0A0A0000, 24)));
        assert_eq!(parse_ipv4_cidr("10.10.0.1/24"), Some((0x0A0A0000, 24)), "host bits dimask");
        assert_eq!(parse_ipv4_cidr("bukan/24"), None);
        assert_eq!(parse_ipv4_cidr("10.0.0.0/40"), None);

        let parent = parse_ipv4_cidr("10.0.0.0/8").unwrap();
        let child = parse_ipv4_cidr("10.1.2.0/24").unwrap();
        let sibling = parse_ipv4_cidr("11.0.0.0/8").unwrap();
        assert!(subnet_of(child, parent));
        assert!(!subnet_of(parent, child));
        assert!(!subnet_of(sibling, parent));
    }
}
