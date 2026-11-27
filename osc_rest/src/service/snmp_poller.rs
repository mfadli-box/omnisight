//! Polling UDP dibatasi pada alamat IP perangkat aktif dalam inventaris MN03.
use crate::infrastructure::store_vault::Vault;
use futures_util::{stream, StreamExt};
use serde::Deserialize;
use snmp2::{v3, AsyncSession, Oid, Value};
use sqlx::{types::Json, PgPool, Postgres, Transaction};
use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use tokio::time::{timeout, Instant};
use uuid::Uuid;

const IF_STATUS: &str = "1.3.6.1.2.1.2.2.1.8";
const CPU_IDLE: &str = "1.3.6.1.4.1.2021.11.11.0";
const MEM_TOTAL: &str = "1.3.6.1.4.1.2021.4.5.0";
const MEM_FREE: &str = "1.3.6.1.4.1.2021.4.6.0";
const UPS_TEMP: &str = "1.3.6.1.2.1.33.1.2.7.0";
const UPS_STATUS: &str = "1.3.6.1.2.1.33.1.2.1.0";
const UPS_CHARGE: &str = "1.3.6.1.2.1.33.1.2.4.0";

#[derive(Deserialize)]
struct Target {
    device_id: Uuid,
    company_id: Uuid,
    address: IpAddr,
    snmp_port: i32,
    snmp_version: String,
    community_encrypted: Option<String>,
    v3_auth_user: Option<String>,
    v3_auth_protocol: Option<String>,
    v3_priv_protocol: Option<String>,
    v3_auth_pass_enc: Option<String>,
    v3_priv_pass_enc: Option<String>,
    timeout_s: i32,
    uptime_oid: String,
    cpu_oid: Option<String>,
    memory_oid: Option<String>,
    temp_oid: Option<String>,
    battery_status_oid: Option<String>,
}

#[derive(Clone, Copy)]
enum Failure {
    Configuration,
    Network,
}

impl Target {
    async fn session(&self, vault: &Vault) -> Result<AsyncSession, Failure> {
        let open = |value: &Option<String>| {
            vault
                .open(
                    self.company_id,
                    self.device_id,
                    value.as_deref().ok_or(Failure::Configuration)?,
                )
                .ok()
                .filter(|s| !s.is_empty())
                .ok_or(Failure::Configuration)
        };
        let port = u16::try_from(self.snmp_port)
            .ok()
            .filter(|n| *n != 0)
            .ok_or(Failure::Configuration)?;
        let addr = SocketAddr::new(self.address, port);
        let id = (Uuid::new_v4().as_u128() as i32) & 0x3fff_ffff;
        match self.snmp_version.as_str() {
            "v2c" => {
                AsyncSession::new_v2c(addr, open(&self.community_encrypted)?.as_bytes(), id).await
            }
            "v3" => {
                let auth = match self.v3_auth_protocol.as_deref() {
                    Some("SHA" | "SHA1") => v3::AuthProtocol::Sha1,
                    Some("SHA256") => v3::AuthProtocol::Sha256,
                    _ => return Err(Failure::Configuration),
                };
                let cipher = match self.v3_priv_protocol.as_deref() {
                    Some("AES" | "AES128") => v3::Cipher::Aes128,
                    Some("AES256") => v3::Cipher::Aes256,
                    _ => return Err(Failure::Configuration),
                };
                let user = self
                    .v3_auth_user
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .ok_or(Failure::Configuration)?;
                let password = open(&self.v3_auth_pass_enc)?;
                let privacy_password = open(&self.v3_priv_pass_enc)?.into_bytes();
                if password.len() < 8 || privacy_password.len() < 8 {
                    return Err(Failure::Configuration);
                }
                let security = v3::Security::new(user.as_bytes(), password.as_bytes())
                    .with_auth_protocol(auth)
                    .with_auth(v3::Auth::AuthPriv {
                        cipher,
                        privacy_password,
                    });
                AsyncSession::new_v3(addr, id, security).await
            }
            _ => return Err(Failure::Configuration),
        }
        .map_err(|_| Failure::Network)
    }
}

fn number(value: Value<'_>) -> Option<i128> {
    Some(match value {
        Value::Integer(n) => n.into(),
        Value::Counter32(n) | Value::Unsigned32(n) | Value::Timeticks(n) => n.into(),
        Value::Counter64(n) => n.into(),
        _ => return None,
    })
}

fn oid(path: &str) -> Result<Oid<'static>, Failure> {
    path.strip_prefix('.')
        .unwrap_or(path)
        .parse()
        .map_err(|_| Failure::Configuration)
}

async fn values(session: &mut AsyncSession, paths: &[&str]) -> Result<Vec<Option<i128>>, Failure> {
    let oids = paths
        .iter()
        .map(|p| oid(p))
        .collect::<Result<Vec<_>, _>>()?;
    let refs = oids.iter().collect::<Vec<_>>();
    let mut pdu = match session.get_many(&refs).await {
        Err(snmp2::Error::AuthUpdated) => session.get_many(&refs).await,
        response => response,
    }
    .map_err(|_| Failure::Network)?;
    if pdu.error_status != 0 {
        return Err(Failure::Network);
    }
    let mut result = Vec::with_capacity(paths.len());
    for expected in oids {
        let (returned, value) = pdu.varbinds.next().ok_or(Failure::Network)?;
        if returned != expected {
            return Err(Failure::Network);
        }
        result.push(number(value));
    }
    Ok(result)
}

struct Port {
    index: i32,
    status: &'static str,
    rx: Option<u64>,
    tx: Option<u64>,
}
struct Sample {
    uptime: i64,
    cpu: Option<f64>,
    memory: Option<f64>,
    temp: Option<f64>,
    battery: Option<i32>,
    charge: Option<f64>,
    ports: Vec<Port>,
}

async fn ports(session: &mut AsyncSession) -> Result<Vec<Port>, Failure> {
    let prefix = format!("{IF_STATUS}.");
    let mut cursor = oid(IF_STATUS)?;
    let mut indices = Vec::new();
    'walk: loop {
        let pdu = session
            .getbulk(&[&cursor], 0, 16)
            .await
            .map_err(|_| Failure::Network)?;
        if pdu.error_status != 0 {
            return Err(Failure::Network);
        }
        let mut advanced = false;
        for (name, value) in pdu.varbinds {
            let path = name.to_string();
            let Some(suffix) = path.strip_prefix(&prefix) else {
                break 'walk;
            };
            if matches!(value, Value::EndOfMibView) {
                break 'walk;
            }
            let index: i32 = suffix.parse().map_err(|_| Failure::Network)?;
            if index <= indices.last().map_or(0, |(prev, _)| *prev) || indices.len() >= 4096 {
                return Err(Failure::Network);
            }
            let status = match number(value) {
                Some(1) => "UP",
                Some(2) => "DOWN",
                Some(3) => "TESTING",
                Some(4) => "UNKNOWN",
                Some(5) => "DORMANT",
                Some(6) => "ABSENT",
                Some(7) => "LOWER_DOWN",
                _ => return Err(Failure::Network),
            };
            indices.push((index, status));
            cursor = oid(&path)?;
            advanced = true;
        }
        if !advanced {
            return Err(Failure::Network);
        }
    }
    let mut ports = Vec::with_capacity(indices.len());
    for (index, status) in indices {
        let counters = values(
            session,
            &[
                &format!("1.3.6.1.2.1.31.1.1.1.6.{index}"),
                &format!("1.3.6.1.2.1.31.1.1.1.10.{index}"),
                &format!("1.3.6.1.2.1.2.2.1.10.{index}"),
                &format!("1.3.6.1.2.1.2.2.1.16.{index}"),
            ],
        )
        .await?;
        let counter = |high: usize, low: usize| {
            counters[high]
                .or(counters[low])
                .and_then(|v| u64::try_from(v).ok())
        };
        ports.push(Port {
            index,
            status,
            rx: counter(0, 2),
            tx: counter(1, 3),
        });
    }
    Ok(ports)
}

fn pct(n: Option<i128>) -> Option<f64> {
    n.filter(|v| (0..=100).contains(v)).map(|v| v as f64)
}

async fn poll(target: &Target, vault: &Vault) -> Result<Sample, Failure> {
    let mut session = target.session(vault).await?;
    session.init().await.map_err(|_| Failure::Network)?;
    let result = values(
        &mut session,
        &[
            &target.uptime_oid,
            target.cpu_oid.as_deref().unwrap_or(CPU_IDLE),
            target.memory_oid.as_deref().unwrap_or(MEM_TOTAL),
            MEM_FREE,
            target.temp_oid.as_deref().unwrap_or(UPS_TEMP),
            target.battery_status_oid.as_deref().unwrap_or(UPS_STATUS),
            UPS_CHARGE,
        ],
    )
    .await?;
    let cpu = pct(result[1]).map(|v| {
        if target.cpu_oid.is_some() {
            v
        } else {
            100.0 - v
        }
    });
    let memory = if target.memory_oid.is_some() {
        pct(result[2])
    } else {
        result[2]
            .zip(result[3])
            .filter(|(total, free)| *total > 0 && (0..=*total).contains(free))
            .map(|(total, free)| 100.0 * (total - free) as f64 / total as f64)
    };
    Ok(Sample {
        uptime: result[0]
            .and_then(|v| u32::try_from(v).ok())
            .ok_or(Failure::Network)?
            .into(),
        cpu,
        memory,
        temp: result[4]
            .filter(|v| (-999..=999).contains(v))
            .map(|v| v as f64),
        battery: result[5].filter(|v| (1..=4).contains(v)).map(|v| v as i32),
        charge: pct(result[6]),
        ports: ports(&mut session).await?,
    })
}

async fn persist(
    tx: &mut Transaction<'_, Postgres>,
    target: &Target,
    sample: Sample,
) -> Result<(), sqlx::Error> {
    let id = target.device_id;
    sqlx::query("INSERT INTO log_snmp_telemetry(device_id,company_id,cpu_pct,memory_pct,temp_celsius,battery_pct,battery_status)
        VALUES($1,$2,$3,$4,$5,$6,$7)").bind(id).bind(target.company_id).bind(sample.cpu).bind(sample.memory)
        .bind(sample.temp).bind(sample.charge).bind(sample.battery).execute(&mut **tx).await?;
    for port in sample.ports {
        let interface:Option<Uuid>=sqlx::query_scalar("INSERT INTO trx_snmp_interface(device_id,if_index,if_name,if_oper_status)
          VALUES($1,$2,$3,$4) ON CONFLICT(device_id,if_index) DO UPDATE SET if_oper_status=excluded.if_oper_status,updated_at=now()
          WHERE trx_snmp_interface.is_monitored RETURNING interface_id")
          .bind(id).bind(port.index).bind(format!("if{}",port.index)).bind(port.status).fetch_optional(&mut **tx).await?;
        let Some(interface) = interface else { continue };
        sqlx::query("WITH counters AS (SELECT $4::text::numeric AS rx,$5::text::numeric AS tx),
            previous AS (SELECT h.rx_octets,h.tx_octets,extract(epoch FROM now()-h.created_at) AS elapsed
              FROM log_snmp_telemetry h JOIN trx_snmp_device_status s USING(device_id)
              WHERE h.device_id=$1 AND h.company_id=$3 AND h.interface_id=$2 AND h.created_at=s.last_successful_poll
              AND s.sys_uptime_ticks <= $7 AND h.created_at < now() LIMIT 1)
            INSERT INTO log_snmp_telemetry(device_id,interface_id,company_id,rx_octets,tx_octets,oper_status,rx_octets_rate,tx_octets_rate)
            SELECT $1,$2,$3,rx,tx,$6,
             CASE WHEN rx>=rx_octets AND (rx-rx_octets)/elapsed < 9223372036854775807 THEN trunc((rx-rx_octets)/elapsed)::bigint END,
             CASE WHEN tx>=tx_octets AND (tx-tx_octets)/elapsed < 9223372036854775807 THEN trunc((tx-tx_octets)/elapsed)::bigint END
            FROM counters LEFT JOIN previous ON true")
          .bind(id).bind(interface).bind(target.company_id).bind(port.rx.map(|v|v.to_string()))
          .bind(port.tx.map(|v|v.to_string())).bind(port.status).bind(sample.uptime).execute(&mut **tx).await?;
    }
    sqlx::query("INSERT INTO trx_snmp_device_status(device_id,current_status,sys_uptime_ticks,cpu_usage_pct,memory_usage_pct,
          temp_celsius,battery_pct,battery_status,last_successful_poll,last_attempt_at)
        VALUES($1,'ONLINE',$2,$3,$4,$5,$6,$7,now(),clock_timestamp()) ON CONFLICT(device_id) DO UPDATE SET
          current_status='ONLINE',sys_uptime_ticks=excluded.sys_uptime_ticks,cpu_usage_pct=excluded.cpu_usage_pct,
          memory_usage_pct=excluded.memory_usage_pct,temp_celsius=excluded.temp_celsius,battery_pct=excluded.battery_pct,
          battery_status=excluded.battery_status,last_successful_poll=now(),last_attempt_at=clock_timestamp(),failed_poll_count=0,updated_at=now()")
        .bind(id).bind(sample.uptime).bind(sample.cpu).bind(sample.memory).bind(sample.temp).bind(sample.charge)
        .bind(sample.battery).execute(&mut **tx).await?;
    Ok(())
}

const DUE:&str=" FROM dat_snmp_device d JOIN dat_snmp_oid_template t USING(template_id)
    LEFT JOIN trx_snmp_device_status s USING(device_id)
    WHERE d.is_active AND t.is_active AND d.snmp_version IN ('v2c','v3') AND
    (s.last_attempt_at IS NULL OR s.last_attempt_at <= now()-make_interval(secs=>greatest(1,d.polling_interval_s)))";

async fn attempt(pool: &PgPool, vault: &Vault, id: Uuid) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let query=format!("SELECT to_jsonb(d)||jsonb_build_object('address',host(d.ip_address),'uptime_oid',t.uptime_oid,
      'cpu_oid',t.cpu_oid,'memory_oid',t.memory_oid,'temp_oid',t.temp_oid,'battery_status_oid',t.battery_status_oid)
      {DUE} AND d.device_id=$1 FOR UPDATE OF d SKIP LOCKED");
    let row: Option<Json<Target>> = sqlx::query_scalar(&query)
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    if let Some(Json(target)) = row {
        // Periksa ulang jadwal setelah lock didapat. Replika lain dapat baru saja menyelesaikan polling.
        let eligible: bool =
            sqlx::query_scalar(&format!("SELECT EXISTS(SELECT 1 {DUE} AND d.device_id=$1)"))
                .bind(id)
                .fetch_one(&mut *tx)
                .await?;
        if eligible {
            let deadline = Duration::from_secs(target.timeout_s.clamp(1, 120) as u64);
            match timeout(deadline, poll(&target, vault))
                .await
                .unwrap_or(Err(Failure::Network))
            {
                Ok(sample) => persist(&mut tx, &target, sample).await?,
                Err(error) => {
                    let status = match error {
                        Failure::Network => "UNREACHABLE",
                        Failure::Configuration => "DEGRADED",
                    };
                    sqlx::query("INSERT INTO trx_snmp_device_status(device_id,current_status,last_attempt_at,failed_poll_count)
                        VALUES($1,$2,clock_timestamp(),1) ON CONFLICT(device_id) DO UPDATE SET current_status=$2,
                        last_attempt_at=clock_timestamp(),updated_at=now(),failed_poll_count=least(2147483646,trx_snmp_device_status.failed_poll_count)+1")
                        .bind(id).bind(status).execute(&mut *tx).await?;
                }
            }
        }
    }
    tx.commit().await
}

pub fn start(pool: PgPool) -> Result<(), &'static str> {
    let key = match std::env::var("SNMP_ENCRYPTION_KEY") {
        Ok(value) => value,
        Err(std::env::VarError::NotPresent) => {
            tracing::warn!("SNMP poller disabled: missing encryption key");
            return Ok(());
        }
        Err(_) => return Err("invalid SNMP encryption key"),
    };
    let vault = Vault::new(&key).map_err(|_| "invalid SNMP encryption key")?;
    tokio::spawn(async move {
        let mut prepare = Instant::now();
        loop {
            if Instant::now() >= prepare {
                if sqlx::query("SELECT mn03_prepare_partitions()")
                    .execute(&pool)
                    .await
                    .is_err()
                {
                    tracing::error!("SNMP partition preparation failed");
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    continue;
                }
                prepare = Instant::now() + Duration::from_secs(3600);
            }
            let query = format!(
                "SELECT d.device_id {DUE} ORDER BY s.last_attempt_at NULLS FIRST,d.device_id"
            );
            match sqlx::query_scalar::<_, Uuid>(&query).fetch_all(&pool).await {
                Ok(ids) => {
                    stream::iter(ids)
                        .for_each_concurrent(4, |id| {
                            let pool = &pool;
                            let vault = &vault;
                            async move {
                                if attempt(pool, vault, id).await.is_err() {
                                    tracing::error!(%id,"SNMP persistence failed")
                                }
                            }
                        })
                        .await
                }
                Err(_) => tracing::error!("SNMP inventory query failed"),
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};

    #[test]
    fn decodes_counters_signed_temperature_and_missing_instances() {
        assert_eq!(
            number(Value::Counter64(u64::MAX)),
            Some(i128::from(u64::MAX))
        );
        assert_eq!(number(Value::Integer(-3)), Some(-3));
        assert_eq!(number(Value::NoSuchInstance), None);
        assert_eq!(pct(Some(101)), None);
    }

    async fn verify_routes(db: &PgPool, company: Uuid, device: Uuid) -> sqlx::Result<()> {
        use axum::{
            body::{to_bytes, Body},
            http::{Request, StatusCode},
        };
        use tower::ServiceExt;
        let user:Uuid=sqlx::query_scalar("INSERT INTO dat_user(username,email) VALUES ('reader','reader@example.test') RETURNING user_id").fetch_one(db).await?;
        let role: Uuid = sqlx::query_scalar(
            "INSERT INTO dat_role(role_code,role_name) VALUES ('MN','MN') RETURNING role_id",
        )
        .fetch_one(db)
        .await?;
        sqlx::query("INSERT INTO trx_user_company(user_id,company_id,role_id) VALUES($1,$2,$3)")
            .bind(user)
            .bind(company)
            .bind(role)
            .execute(db)
            .await?;
        let key: Vec<u8> = sqlx::query_scalar("SELECT gen_random_bytes(32)")
            .fetch_one(db)
            .await?;
        let app = crate::api::snmp::router(db.clone(), &STANDARD.encode(&key)).unwrap();
        let exp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 60;
        let token = jsonwebtoken::encode(
            &jsonwebtoken::Header::default(),
            &serde_json::json!({"user_id":user,"role_id":role,"company_id":company,"exp":exp}),
            &jsonwebtoken::EncodingKey::from_secret(&key),
        )
        .unwrap();
        let get = |path: &str| {
            app.clone().oneshot(
                Request::get(path)
                    .header("Authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
        };
        let list = "/api/v1/snmp/devices";
        let path = format!("{list}/{device}/metrics");
        assert_eq!(get(list).await.unwrap().status(), StatusCode::FORBIDDEN);
        sqlx::query("INSERT INTO dat_permission(role_id,menu_id,can_read) SELECT $1,menu_id,true FROM dat_menu WHERE sub_module_code='MN03'").bind(role).execute(db).await?;
        let response = get(list).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let json: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 65536).await.unwrap()).unwrap();
        assert_eq!(json.as_array().unwrap().len(), 1);
        assert!(json[0].get("community_encrypted").is_none());
        let response = get(&path).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let json: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 65536).await.unwrap()).unwrap();
        assert_eq!(json["status"]["current_status"], "ONLINE");
        assert!(!json["interfaces"].as_array().unwrap().is_empty());
        let area:Uuid=sqlx::query_scalar("INSERT INTO dat_area(company_id,area_code,area_name) VALUES($1,'A','Area') RETURNING area_id").bind(company).fetch_one(db).await?;
        sqlx::query("UPDATE dat_snmp_device SET area_id=$1 WHERE device_id=$2")
            .bind(area)
            .bind(device)
            .execute(db)
            .await?;
        assert_eq!(get(&path).await.unwrap().status(), StatusCode::NOT_FOUND);
        sqlx::query("INSERT INTO trx_user_area(user_id,company_id,area_id) VALUES($1,$2,$3)")
            .bind(user)
            .bind(company)
            .bind(area)
            .execute(db)
            .await?;
        assert_eq!(get(&path).await.unwrap().status(), StatusCode::OK);
        let other:Uuid=sqlx::query_scalar("INSERT INTO dat_company(company_code,company_name) VALUES('OTHER','Other') RETURNING company_id").fetch_one(db).await?;
        sqlx::query("UPDATE dat_snmp_device SET area_id=NULL, company_id=$1 WHERE device_id=$2")
            .bind(other)
            .bind(device)
            .execute(db)
            .await?;
        assert_eq!(get(&path).await.unwrap().status(), StatusCode::NOT_FOUND);
        Ok(())
    }

    #[sqlx::test(migrations = false)]
    #[ignore = "Memerlukan PostgreSQL sementara dan agen Net-SNMP v2c/v3 melalui MN03_TEST_*"]
    async fn polls_net_snmp_and_persists_history(db: PgPool) -> sqlx::Result<()> {
        for migration in [
            include_str!("../../../osc_base/migrations/01_data_master.sql"),
            include_str!("../../../osc_base/migrations/02_data_transaction.sql"),
            include_str!("../../migrations/mn03_snmp.sql"),
        ] {
            sqlx::raw_sql(migration).execute(&db).await?;
        }
        let company:Uuid=sqlx::query_scalar("INSERT INTO dat_company(company_code,company_name) VALUES('MN','Monitor') RETURNING company_id")
            .fetch_one(&db).await?;
        let template:Uuid=sqlx::query_scalar("INSERT INTO dat_snmp_oid_template(vendor_name,template_name) VALUES('GENERIC','Test') RETURNING template_id")
            .fetch_one(&db).await?;
        let key = [*Uuid::new_v4().as_bytes(), *Uuid::new_v4().as_bytes()].concat();
        let vault = Vault::new(&STANDARD.encode(key)).unwrap();
        let id = Uuid::new_v4();
        let secret = |name| {
            vault
                .seal(company, id, &std::env::var(name).unwrap())
                .unwrap()
        };
        let port: i32 = std::env::var("MN03_TEST_PORT").unwrap().parse().unwrap();
        sqlx::query("INSERT INTO dat_snmp_device(device_id,company_id,template_id,device_name,ip_address,snmp_port,
            community_encrypted,v3_auth_user,v3_auth_protocol,v3_priv_protocol,v3_auth_pass_enc,v3_priv_pass_enc)
            VALUES($1,$2,$3,'Test','127.0.0.1',$4,$5,'monitor','SHA','AES128',$6,$7)")
            .bind(id).bind(company).bind(template).bind(port).bind(secret("MN03_TEST_COMMUNITY"))
            .bind(secret("MN03_TEST_AUTH")).bind(secret("MN03_TEST_PRIV")).execute(&db).await?;
        for version in ["v2c", "v3"] {
            sqlx::query("UPDATE dat_snmp_device SET snmp_version=$1 WHERE device_id=$2")
                .bind(version)
                .bind(id)
                .execute(&db)
                .await?;
            sqlx::query(
                "UPDATE trx_snmp_device_status SET last_attempt_at=NULL WHERE device_id=$1",
            )
            .bind(id)
            .execute(&db)
            .await?;
            attempt(&db, &vault, id).await?;
            let (status,temperature,battery):(String,Option<i32>,Option<i32>)=sqlx::query_as(
                "SELECT current_status,temp_celsius::int,battery_status FROM trx_snmp_device_status WHERE device_id=$1")
                .bind(id).fetch_one(&db).await?;
            assert_eq!(status, "ONLINE", "{version}");
            assert_eq!((temperature, battery), (Some(31), Some(2)));
        }
        let counters: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM log_snmp_telemetry WHERE device_id=$1
          AND oper_status='UP' AND rx_octets_rate IS NOT NULL AND tx_octets_rate IS NOT NULL)",
        )
        .bind(id)
        .fetch_one(&db)
        .await?;
        assert!(counters);
        assert!(sqlx::query_scalar::<_,bool>("SELECT EXISTS(SELECT 1 FROM log_snmp_telemetry WHERE device_id=$1 AND cpu_pct=25 AND memory_pct=60)")
            .bind(id).fetch_one(&db).await?);
        verify_routes(&db, company, id).await?;
        Ok(())
    }
}
