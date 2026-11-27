use der::{
    asn1::{AnyRef, GeneralizedTime, UtcTime},
    Decode, Reader, SliceReader, Tag,
};
use futures_util::{stream, StreamExt};
use reqwest::{tls::TlsInfo, Client, Url};
use sqlx::{PgPool, Row};
use std::{
    collections::HashSet,
    process::Stdio,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::{
    net::{lookup_host, TcpStream},
    process::Command,
    time::{self, MissedTickBehavior},
};
use uuid::Uuid;

const PERIOD: Duration = Duration::from_secs(5);
#[cfg(test)]
const TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Default, Debug)]
struct Observation {
    available: bool,
    http_status: Option<i16>,
    ssl_days: Option<i32>,
}

// Rustls memverifikasi sertifikat sebelum reqwest menyediakan DER sertifikat peer.
fn expiry_days(cert: &[u8], now: Duration) -> Option<i32> {
    fn sequence(input: &[u8]) -> Option<SliceReader<'_>> {
        let value = AnyRef::from_der(input).ok()?;
        use der::Tagged;
        (value.tag() == Tag::Sequence)
            .then(|| SliceReader::new(value.value()).ok())
            .flatten()
    }
    let mut outer = sequence(cert)?;
    let mut tbs = sequence(outer.tlv_bytes().ok()?)?;
    if tbs.peek_byte() == Some(0xa0) {
        tbs.tlv_bytes().ok()?;
    }
    // serialNumber, signature, issuer, validity (RFC 5280).
    for _ in 0..3 {
        tbs.tlv_bytes().ok()?;
    }
    let mut validity = sequence(tbs.tlv_bytes().ok()?)?;
    validity.tlv_bytes().ok()?;
    let end = match validity.peek_tag().ok()? {
        Tag::UtcTime => validity.decode::<UtcTime>().ok()?.to_unix_duration(),
        Tag::GeneralizedTime => validity
            .decode::<GeneralizedTime>()
            .ok()?
            .to_unix_duration(),
        _ => return None,
    };
    let seconds = end.as_secs() as i64 - now.as_secs() as i64;
    i32::try_from(seconds.div_euclid(86400)).ok()
}

pub(crate) fn endpoint_url(protocol: &str, endpoint: &str) -> Option<Url> {
    let url = match protocol {
        "HTTP" | "HTTPS" => Url::parse(endpoint).ok()?,
        "TCP" => Url::parse(&format!("tcp://{endpoint}")).ok()?,
        "ICMP" => Url::parse(&format!("icmp://{endpoint}")).ok()?,
        _ => return None,
    };
    if !url.scheme().eq_ignore_ascii_case(protocol)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    if matches!(protocol, "TCP" | "ICMP") && (!url.path().is_empty() || url.query().is_some())
        || protocol == "TCP" && url.port().unwrap_or(0) == 0
        || protocol == "ICMP" && url.port().is_some()
    {
        return None;
    }
    url.host_str()?;
    Some(url)
}

fn host_name(url: &Url) -> &str {
    url.host_str().unwrap_or_default().trim_matches(['[', ']'])
}

pub(crate) fn allowed_hosts() -> HashSet<String> {
    std::env::var("UPTIME_ALLOWED_HOSTS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|host| !host.is_empty())
        .map(str::to_ascii_lowercase)
        .collect()
}

async fn probe(
    protocol: &str,
    endpoint: &str,
    allowed: &HashSet<String>,
    timeout: Duration,
) -> Option<Observation> {
    let url = endpoint_url(protocol, endpoint)?;
    let host = host_name(&url).to_ascii_lowercase();
    if !allowed.contains(&host) {
        return None;
    }
    let port = if protocol == "ICMP" {
        0
    } else {
        url.port_or_known_default()?
    };
    let addresses: Vec<_> = lookup_host((host.as_str(), port)).await.ok()?.collect();
    let first = addresses.first()?;
    let available = match protocol {
        "HTTP" | "HTTPS" => {
            let client = Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .resolve_to_addrs(&host, &addresses)
                .timeout(timeout)
                .tls_info(true)
                .build()
                .ok()?;
            let response = client.get(url).send().await.ok()?;
            let status = response.status();
            let days = response
                .extensions()
                .get::<TlsInfo>()
                .and_then(TlsInfo::peer_certificate)
                .and_then(|cert| {
                    expiry_days(cert, SystemTime::now().duration_since(UNIX_EPOCH).ok()?)
                });
            return Some(Observation {
                available: (status.is_success() || status.is_redirection())
                    && (protocol != "HTTPS" || days.is_some()),
                http_status: Some(status.as_u16() as i16),
                ssl_days: days,
            });
        }
        "TCP" => TcpStream::connect(addresses.as_slice()).await.is_ok(),
        "ICMP" if url.port().is_none() => Command::new("ping")
            .args(["-n", "-c", "1", "--"])
            .arg(first.ip().to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .status()
            .await
            .ok()?
            .success(),
        _ => return None,
    };
    Some(Observation {
        available,
        ..Default::default()
    })
}

fn transition(previous: &str, failures: i32, obs: &Observation) -> (i32, String) {
    if obs.available {
        let status = if obs.ssl_days.is_some_and(|d| d < 14) {
            "WARNING"
        } else {
            "UP"
        };
        (0, status.into())
    } else {
        let failures = (failures + 1).min(3);
        (
            failures,
            if failures == 3 { "DOWN" } else { previous }.into(),
        )
    }
}

async fn check(db: &PgPool, id: Uuid, allowed: &HashSet<String>) -> Result<(), sqlx::Error> {
    let mut tx = db.begin().await?;
    let Some(target) = sqlx::query(
        "SELECT t.*, s.company_id, s.area_id FROM dat_monitor_target t
        JOIN dat_server s USING (server_id) WHERE t.id=$1 AND t.is_active AND
        (t.checked_at IS NULL OR t.checked_at <= now() - make_interval(secs => t.interval_seconds))
        FOR UPDATE OF t SKIP LOCKED",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    else {
        return Ok(());
    };
    let started = Instant::now();
    let timeout = Duration::from_secs(target.get::<i32, _>("timeout_seconds") as u64);
    let observation = time::timeout(
        timeout,
        probe(
            target.get("protocol"),
            target.get("endpoint"),
            allowed,
            timeout,
        ),
    )
    .await
    .ok()
    .flatten()
    .unwrap_or_default();
    let elapsed = started.elapsed().as_millis().min(i32::MAX as u128) as i32;
    record(&mut tx, &target, &observation, elapsed).await?;
    tx.commit().await
}

async fn record(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    target: &sqlx::postgres::PgRow,
    observation: &Observation,
    elapsed: i32,
) -> Result<(), sqlx::Error> {
    let id: Uuid = target.get("id");
    let (failures, status) = transition(
        target.get("status"),
        target.get("consecutive_failures"),
        observation,
    );
    let company: Uuid = target.get("company_id");
    let area: Uuid = target.get("area_id");
    let server: Uuid = target.get("server_id");
    let mut alert: Option<Uuid> = target.get("ssl_alert_id");
    match (alert, observation.ssl_days) {
        (None, Some(days)) if days < 14 => {
            let alert_id: Uuid = sqlx::query_scalar("INSERT INTO trx_alert_history
                (company_id,area_id,server_id,alert_rule_name,severity,metric_name,threshold_value,actual_value,description)
                VALUES ($1,$2,$3,'MN02 SSL expiry','WARNING','ssl_days_remaining',14,$4::integer,$5) RETURNING id")
                .bind(company).bind(area).bind(server).bind(days).bind(format!("Sertifikat target {id} mendekati kedaluwarsa."))
                .fetch_one(&mut **tx).await?;
            alert = Some(alert_id);
            sqlx::query("SELECT pg_notify('mn02_ssl_expiry',$1)")
                .bind(alert_id.to_string())
                .execute(&mut **tx)
                .await?;
        }
        (Some(alert_id), Some(days)) if days >= 14 => {
            sqlx::query(
                "UPDATE trx_alert_history SET status='RESOLVED',resolved_at=now() WHERE id=$1",
            )
            .bind(alert_id)
            .execute(&mut **tx)
            .await?;
            alert = None;
        }
        _ => {}
    }
    sqlx::query(
        "UPDATE dat_monitor_target SET status=$2,consecutive_failures=$3,ssl_alert_id=$4,
        checked_at=statement_timestamp() WHERE id=$1",
    )
    .bind(id)
    .bind(status)
    .bind(failures)
    .bind(alert)
    .execute(&mut **tx)
    .await?;
    sqlx::query("INSERT INTO log_uptime_check (target_id,checked_at,available,latency_ms,http_status,ssl_days_remaining)
        SELECT id,checked_at,$2,$3,$4,$5 FROM dat_monitor_target WHERE id=$1")
        .bind(id).bind(observation.available).bind(elapsed).bind(observation.http_status).bind(observation.ssl_days)
        .execute(&mut **tx).await?;
    sqlx::query("INSERT INTO trx_summary_daily AS d
        (summary_date,company_id,area_id,server_id,uptime_checks,uptime_successes,uptime_percentage)
        SELECT (checked_at AT TIME ZONE 'UTC')::date,$2,$3,$4,1,$5::integer,100*$5::integer
        FROM dat_monitor_target WHERE id=$1
        ON CONFLICT (summary_date,company_id,area_id,server_id) DO UPDATE SET uptime_checks=d.uptime_checks+1,
        uptime_successes=d.uptime_successes+excluded.uptime_successes,
        uptime_percentage=100.0*(d.uptime_successes+excluded.uptime_successes)/(d.uptime_checks+1)")
        .bind(id).bind(company).bind(area).bind(server).bind(i32::from(observation.available)).execute(&mut **tx).await?;
    Ok(())
}

async fn poll(db: &PgPool, allowed: &HashSet<String>) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT mn02_prepare_partitions()")
        .execute(db)
        .await?;
    let targets: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM dat_monitor_target WHERE is_active AND (checked_at IS NULL OR checked_at <= now() - make_interval(secs => interval_seconds)) ORDER BY checked_at NULLS FIRST",
    )
    .fetch_all(db)
    .await?;
    stream::iter(targets)
        .for_each_concurrent(4, |id| async move {
            if let Err(error) = check(db, id, allowed).await {
                tracing::error!(%id, %error, "uptime check transaction failed");
            }
        })
        .await;
    Ok(())
}

pub async fn run(db: PgPool) {
    let allowed = allowed_hosts();
    if allowed.is_empty() {
        tracing::warn!("configure UPTIME_ALLOWED_HOSTS to enable uptime polling");
        return;
    }
    let mut interval = time::interval(PERIOD);
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        if let Err(error) = poll(&db, &allowed).await {
            tracing::error!(%error, "uptime poll failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[test]
    fn reads_leaf_expiry_and_ssl_threshold() {
        let leaf = include_bytes!("../../tests/fixtures/mn02-leaf.der");
        let expiry = 1_798_207_427;
        for (seconds, days, status) in [
            (14 * 86400, 14, "UP"),
            (14 * 86400 - 1, 13, "WARNING"),
            (1, 0, "WARNING"),
        ] {
            let remaining = expiry_days(leaf, Duration::from_secs(expiry - seconds));
            assert_eq!(remaining, Some(days));
            let observation = Observation {
                available: true,
                ssl_days: remaining,
                ..Default::default()
            };
            assert_eq!(transition("DOWN", 3, &observation), (0, status.into()));
        }
        assert_eq!(expiry_days(&leaf[..40], Duration::ZERO), None);
    }

    #[tokio::test]
    async fn probes_http_and_tcp_with_no_redirects() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let app = axum::Router::new()
            .route(
                "/",
                axum::routing::get(|| async { axum::response::Redirect::temporary("/failed") }),
            )
            .route(
                "/failed",
                axum::routing::get(|| async { axum::http::StatusCode::SERVICE_UNAVAILABLE }),
            );
        let task = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let allowed = HashSet::from([address.ip().to_string()]);
        let endpoint = format!("http://{address}/");
        let redirect = probe("HTTP", &endpoint, &allowed, TIMEOUT).await.unwrap();
        assert!(redirect.available);
        assert_eq!(redirect.http_status, Some(307));
        let failed = probe("HTTP", &format!("{endpoint}failed"), &allowed, TIMEOUT)
            .await
            .unwrap();
        assert!(!failed.available);
        assert_eq!(failed.http_status, Some(503));
        assert!(
            probe("TCP", &address.to_string(), &allowed, TIMEOUT)
                .await
                .unwrap()
                .available
        );
        assert!(probe("HTTP", &endpoint, &HashSet::new(), TIMEOUT)
            .await
            .is_none());
        task.abort();
    }

    #[tokio::test]
    #[ignore = "Memerlukan ping dengan izin ICMP pada loopback"]
    async fn icmp_loopback() {
        let allowed = HashSet::from(["127.0.0.1".to_owned()]);
        assert!(
            time::timeout(TIMEOUT, probe("ICMP", "127.0.0.1", &allowed, TIMEOUT))
                .await
                .unwrap()
                .unwrap()
                .available
        );
    }

    #[test]
    fn third_failure_then_recovery() {
        let failed = Observation::default();
        let (mut failures, mut status) = (0, "UP".to_string());
        for expected in ["UP", "UP", "DOWN", "DOWN"] {
            (failures, status) = transition(&status, failures, &failed);
            assert_eq!(status, expected);
        }
        let recovered = Observation {
            available: true,
            ..Default::default()
        };
        assert_eq!(transition(&status, failures, &recovered), (0, "UP".into()));
    }

    #[sqlx::test(migrations = false)]
    #[ignore = "Memerlukan PostgreSQL sementara melalui DATABASE_URL"]
    async fn persists_checks_across_pollers(db: PgPool) -> sqlx::Result<()> {
        for migration in [
            include_str!("../../../osc_base/migrations/01_data_master.sql"),
            include_str!("../../../osc_base/migrations/02_data_transaction.sql"),
            include_str!("../../migrations/mn02_uptime.sql"),
            include_str!("../../migrations/mn02_uptime_settings.sql"),
        ] {
            sqlx::raw_sql(migration).execute(&db).await?;
        }
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let allowed = HashSet::from([address.ip().to_string()]);
        let id:Uuid = sqlx::query_scalar("WITH c AS (INSERT INTO dat_company(company_code,company_name)
            VALUES ('MN','Monitor') RETURNING company_id),
            a AS (INSERT INTO dat_area(company_id,area_code,area_name) SELECT company_id,'MN','MN' FROM c
            RETURNING area_id,company_id),
            s AS (INSERT INTO dat_server(company_id,area_id,server_hostname,ip_address)
            SELECT company_id,area_id,'local','127.0.0.1' FROM a RETURNING server_id)
            INSERT INTO dat_monitor_target(server_id,protocol,endpoint) SELECT server_id,'TCP',$1 FROM s RETURNING id")
            .bind(address.to_string()).fetch_one(&db).await?;
        tokio::try_join!(poll(&db, &allowed), poll(&db, &allowed))?;
        drop(listener);
        for expected in ["UP", "UP", "DOWN"] {
            sqlx::query(
                "UPDATE dat_monitor_target SET checked_at=now()-interval '2 minutes' WHERE id=$1",
            )
            .bind(id)
            .execute(&db)
            .await?;
            check(&db, id, &allowed).await?;
            let status: String =
                sqlx::query_scalar("SELECT status FROM dat_monitor_target WHERE id=$1")
                    .bind(id)
                    .fetch_one(&db)
                    .await?;
            assert_eq!(status, expected);
        }
        let history: i64 =
            sqlx::query_scalar("SELECT count(*) FROM log_uptime_check WHERE target_id=$1")
                .bind(id)
                .fetch_one(&db)
                .await?;
        assert_eq!(history, 4);
        let summary:(i64,i64,i32) = sqlx::query_as("SELECT uptime_checks,uptime_successes,uptime_percentage::integer FROM trx_summary_daily").fetch_one(&db).await?;
        assert_eq!(summary, (4, 1, 25));
        let mut notifications = sqlx::postgres::PgListener::connect_with(&db).await?;
        notifications.listen("mn02_ssl_expiry").await?;
        for days in [13, 12, 14] {
            let mut tx = db.begin().await?;
            let row = sqlx::query(
                "SELECT t.*,s.company_id,s.area_id FROM dat_monitor_target t
                JOIN dat_server s USING(server_id) WHERE t.id=$1 FOR UPDATE OF t",
            )
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
            record(
                &mut tx,
                &row,
                &Observation {
                    available: true,
                    http_status: Some(200),
                    ssl_days: Some(days),
                },
                10,
            )
            .await?;
            tx.commit().await?;
        }
        let alerts: Vec<(Uuid, String)> = sqlx::query_as("SELECT id,status FROM trx_alert_history")
            .fetch_all(&db)
            .await?;
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].1, "RESOLVED");
        let event = time::timeout(TIMEOUT, notifications.recv())
            .await
            .unwrap()?;
        assert_eq!(event.payload(), alerts[0].0.to_string());
        Ok(())
    }
}
