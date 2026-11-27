use super::notifier::{self, Notification};
use futures_util::StreamExt;
use sqlx::{PgPool, Row};
use std::{env, sync::Arc, time::Duration};
use tokio::sync::Notify;
use uuid::Uuid;

// Membaca ulang antrean PostgreSQL setelah koneksi pub/sub terputus.
async fn subscribe(client: redis::Client, wake: Arc<Notify>) {
    loop {
        if let Ok(mut conn) = client.get_async_pubsub().await {
            if conn.subscribe("mn04:observations").await.is_ok() {
                let mut messages = conn.on_message();
                while messages.next().await.is_some() {
                    wake.notify_one();
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}

async fn evaluate(db: &PgPool) -> Result<bool, sqlx::Error> {
    let mut tx = db.begin().await?;
    if !sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_xact_lock(26041101)")
        .fetch_one(&mut *tx)
        .await?
    {
        return Ok(false);
    }
    let samples=sqlx::query("SELECT s.id,s.value > r.threshold_value AS breached
        FROM trx_alert_sample s JOIN dat_alert_rule r ON r.id=s.rule_id ORDER BY s.id LIMIT 128 FOR SHARE OF r")
        .fetch_all(&mut *tx).await?;
    for sample in &samples {
        let id: i64 = sample.get("id");
        let fresh=sqlx::query("INSERT INTO trx_alert_cursor AS c
            SELECT rule_id,source_id,observed_at,id FROM trx_alert_sample WHERE id=$1
            ON CONFLICT(rule_id,source_id) DO UPDATE SET observed_at=excluded.observed_at,sample_id=excluded.sample_id
            WHERE (c.observed_at,c.sample_id)<(excluded.observed_at,excluded.sample_id)")
            .bind(id).execute(&mut *tx).await?.rows_affected()>0;
        if fresh && sample.get::<bool, _>("breached") {
            sqlx::query("INSERT INTO trx_alert_history(rule_id,source_id,company_id,area_id,server_id,alert_rule_name,
                    severity,metric_name,actual_value,threshold_value,description,triggered_at,next_dispatch_at,policy_steps)
                SELECT r.id,s.source_id,r.company_id,r.area_id,s.server_id,r.name,r.severity,r.metric_name,s.value,r.threshold_value,
                    r.name,s.observed_at,s.observed_at+make_interval(secs=>r.grace_seconds),
                    coalesce(p.steps,'[{\"channels\":[\"webhook\"],\"delay_seconds\":0},{\"channels\":[\"webhook\"],\"delay_seconds\":900}]'::jsonb)
                FROM trx_alert_sample s JOIN dat_alert_rule r ON r.id=s.rule_id
                LEFT JOIN dat_escalation_policy p USING(company_id,area_id,severity) WHERE s.id=$1
                ON CONFLICT(rule_id,source_id) WHERE rule_id IS NOT NULL AND status IN ('FIRING','ACKNOWLEDGED')
                DO UPDATE SET actual_value=excluded.actual_value")
                .bind(id).execute(&mut *tx).await?;
        } else if fresh {
            sqlx::query("UPDATE trx_alert_history h SET status='RESOLVED',resolved_at=s.observed_at,next_dispatch_at=NULL
                FROM trx_alert_sample s WHERE s.id=$1 AND h.rule_id=s.rule_id AND h.source_id=s.source_id
                AND h.status IN ('FIRING','ACKNOWLEDGED')").bind(id).execute(&mut *tx).await?;
        }
        sqlx::query("DELETE FROM trx_alert_sample WHERE id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(samples.len() == 128)
}

async fn escalate(db: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("WITH due AS (
            SELECT id FROM trx_alert_history h WHERE status='FIRING' AND next_dispatch_at<=now()
            AND (silenced_until IS NULL OR silenced_until<=now())
            AND NOT EXISTS (SELECT 1 FROM trx_alert_sample s WHERE s.rule_id=h.rule_id AND s.source_id=h.source_id)
            ORDER BY next_dispatch_at LIMIT 128 FOR UPDATE SKIP LOCKED
        ), advanced AS (
            UPDATE trx_alert_history h SET escalation_level=escalation_level+1,
                next_dispatch_at=now()+make_interval(secs=>(policy_steps->(escalation_level+1)->>'delay_seconds')::int)
            FROM due WHERE h.id=due.id RETURNING h.id,h.escalation_level,h.policy_steps
        ) INSERT INTO trx_alert_delivery(incident_id,level,channel)
        SELECT id,escalation_level,jsonb_array_elements_text(policy_steps->(escalation_level-1)->'channels') FROM advanced")
        .execute(db).await?;
    Ok(())
}

async fn deliver(db: &PgPool, client: &reqwest::Client) -> Result<bool, sqlx::Error> {
    let mut tx = db.begin().await?;
    let Some(row)=sqlx::query("SELECT h.id,h.company_id,h.area_id,h.alert_rule_name,h.severity,h.metric_name,
            h.actual_value::text,h.threshold_value::text,d.level,d.channel
        FROM trx_alert_delivery d JOIN trx_alert_history h ON h.id=d.incident_id
        WHERE d.delivered_at IS NULL AND d.retry_at<=now() AND h.status='FIRING' AND h.rule_id IS NOT NULL
        AND (h.silenced_until IS NULL OR h.silenced_until<=now())
        AND NOT EXISTS (SELECT 1 FROM trx_alert_sample s WHERE s.rule_id=h.rule_id AND s.source_id=h.source_id)
        ORDER BY d.retry_at LIMIT 1 FOR UPDATE OF d,h SKIP LOCKED").fetch_optional(&mut *tx).await? else {return Ok(false)};
    let n = Notification {
        id: row.get::<Uuid, _>("id"),
        company: row.get("company_id"),
        area: row.get("area_id"),
        level: row.get("level"),
        name: row.get("alert_rule_name"),
        severity: row.get("severity"),
        metric: row.get("metric_name"),
        actual: row.get("actual_value"),
        threshold: row.get("threshold_value"),
    };
    let channel: String = row.get("channel");
    let sent = notifier::send(client, &channel, &n).await.is_ok();
    if !sent {
        tracing::warn!(incident=%n.id,channel,level=n.level,"Pengiriman notifikasi tertunda");
    }
    sqlx::query("UPDATE trx_alert_delivery SET attempts=attempts+1,delivered_at=CASE WHEN $4 THEN now() END,
        retry_at=now()+interval '5 seconds'*(1 << least(attempts,8))
        WHERE incident_id=$1 AND level=$2 AND channel=$3").bind(n.id).bind(n.level).bind(channel).bind(sent)
        .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(true)
}

pub async fn run(db: PgPool) {
    let wake = Arc::new(Notify::new());
    if let Some(client) = env::var("CACHE_URL")
        .ok()
        .and_then(|url| redis::Client::open(url).ok())
    {
        tokio::spawn(subscribe(client, wake.clone()));
    }
    let dispatch_db = db.clone();
    tokio::spawn(async move {
        let Ok(client) = notifier::client() else {
            tracing::error!("Inisialisasi dispatcher gagal");
            return;
        };
        loop {
            match deliver(&dispatch_db, &client).await {
                Ok(true) => continue,
                Err(_) => tracing::warn!("Antrean pengiriman MN04 tidak tersedia"),
                Ok(false) => (),
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
    loop {
        let backlog = evaluate(&db).await;
        if backlog.is_err() || escalate(&db).await.is_err() {
            tracing::warn!("Evaluasi atau eskalasi MN04 tertunda");
        }
        if matches!(backlog, Ok(true)) {
            continue;
        }
        tokio::select! {_=wake.notified()=>(),_=tokio::time::sleep(Duration::from_secs(1))=>()}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[sqlx::test(migrations = false)]
    #[ignore = "Memerlukan database PostgreSQL sementara"]
    async fn incident_lifecycle(db: PgPool) -> sqlx::Result<()> {
        for sql in [
            include_str!("../../../osc_base/migrations/01_data_master.sql"),
            include_str!("../../../osc_base/migrations/02_data_transaction.sql"),
            include_str!("../../migrations/mn02_uptime.sql"),
            include_str!("../../migrations/np02_ipam.sql"),
            include_str!("../../migrations/mn04_alerts.sql"),
            include_str!("../../migrations/mn04_silence.sql"),
        ] {
            sqlx::raw_sql(sql).execute(&db).await?;
        }
        let server: Uuid = sqlx::query_scalar(
            "WITH company AS (INSERT INTO dat_company(company_code,company_name)
                VALUES ('MN','Monitor') RETURNING company_id),
            area AS (INSERT INTO dat_area(company_id,area_code,area_name)
                SELECT company_id,'A','Area' FROM company RETURNING company_id,area_id)
            INSERT INTO dat_server(company_id,area_id,server_hostname,ip_address)
            SELECT company_id,area_id,'test','127.0.0.1' FROM area RETURNING server_id",
        )
        .fetch_one(&db)
        .await?;
        sqlx::query("INSERT INTO dat_alert_rule(company_id,area_id,name,severity,metric_name,threshold_value,grace_seconds)
            SELECT company_id,area_id,'CPU','CRITICAL','cpu_usage',90,180 FROM dat_server WHERE server_id=$1")
            .bind(server).execute(&db).await?;
        sqlx::query("INSERT INTO dat_escalation_policy SELECT company_id,area_id,'CRITICAL',
            '[{\"delay_seconds\":0,\"channels\":[\"webhook\",\"email\"]},{\"delay_seconds\":900,\"channels\":[\"telegram\"]}]'::jsonb
            FROM dat_server WHERE server_id=$1").bind(server).execute(&db).await?;
        let observe = |cpu: i32| {
            sqlx::query("INSERT INTO log_agent_telemetry(server_id,cpu_usage_pct,mem_used_bytes,mem_total_bytes,disk_used_pct)
            VALUES ($1,$2,0,1,1)").bind(server).bind(cpu).execute(&db)
        };
        observe(90).await?;
        observe(91).await?;
        observe(98).await?;
        evaluate(&db).await?;
        let rows: Vec<(Uuid, i32)> = sqlx::query_as(
            "SELECT id,actual_value::int FROM trx_alert_history WHERE status='FIRING'",
        )
        .fetch_all(&db)
        .await?;
        assert_eq!(rows.len(), 1);
        let (incident, actual) = rows[0];
        assert_eq!(actual, 98);
        let channels = || {
            sqlx::query_scalar::<_, String>(
                "SELECT channel FROM trx_alert_delivery ORDER BY level,channel",
            )
            .fetch_all(&db)
        };
        escalate(&db).await?;
        assert!(channels().await?.is_empty());
        let due = || {
            sqlx::query("UPDATE trx_alert_history SET next_dispatch_at=now() WHERE id=$1")
                .bind(incident)
                .execute(&db)
        };
        due().await?;
        tokio::try_join!(escalate(&db), escalate(&db))?;
        assert_eq!(channels().await?, ["email", "webhook"]);
        let wait:bool=sqlx::query_scalar("SELECT next_dispatch_at>now()+interval '14 minutes' FROM trx_alert_history WHERE id=$1")
            .bind(incident).fetch_one(&db).await?;
        assert!(wait);
        use axum::{
            body::Body,
            http::{Request, StatusCode},
        };
        use base64::{engine::general_purpose::STANDARD, Engine};
        use tower::ServiceExt;
        let (company, area): (Uuid, Uuid) =
            sqlx::query_as("SELECT company_id,area_id FROM dat_server")
                .fetch_one(&db)
                .await?;
        let user:Uuid=sqlx::query_scalar("INSERT INTO dat_user(username,email) VALUES ('operator','operator@example.test') RETURNING user_id").fetch_one(&db).await?;
        let role: Uuid = sqlx::query_scalar(
            "INSERT INTO dat_role(role_code,role_name) VALUES ('MN','MN') RETURNING role_id",
        )
        .fetch_one(&db)
        .await?;
        sqlx::query("INSERT INTO trx_user_company(user_id,company_id,role_id) VALUES ($1,$2,$3)")
            .bind(user)
            .bind(company)
            .bind(role)
            .execute(&db)
            .await?;
        sqlx::query(
            "INSERT INTO dat_permission(role_id,menu_id,can_create,can_read,can_update,can_delete)
            SELECT $1,menu_id,true,true,true,true FROM dat_menu WHERE sub_module_code='MN04'",
        )
        .bind(role)
        .execute(&db)
        .await?;
        let key: Vec<u8> = sqlx::query_scalar("SELECT gen_random_bytes(32)")
            .fetch_one(&db)
            .await?;
        let app = crate::api::alert::router(db.clone(), &STANDARD.encode(&key)).unwrap();
        let exp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 60;
        let jwt = jsonwebtoken::encode(
            &jsonwebtoken::Header::default(),
            &serde_json::json!({"user_id":user,"company_id":company,"role_id":role,"exp":exp}),
            &jsonwebtoken::EncodingKey::from_secret(&key),
        )
        .unwrap();
        let call = |method: &str, path: String, body: String| {
            app.clone().oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .header("Authorization", format!("Bearer {jwt}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(body))
                    .unwrap(),
            )
        };
        let ack = format!("/api/v1/alerts/{incident}/acknowledge");
        assert_eq!(
            call("POST", ack.clone(), String::new())
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
        sqlx::query("INSERT INTO trx_user_area(user_id,company_id,area_id) VALUES ($1,$2,$3)")
            .bind(user)
            .bind(company)
            .bind(area)
            .execute(&db)
            .await?;
        let silence = format!("/api/v1/alerts/{incident}/silence");
        let duration = serde_json::json!({"duration_seconds": 900}).to_string();
        assert_eq!(
            call("POST", silence, duration).await.unwrap().status(),
            StatusCode::NO_CONTENT
        );
        let history = call("GET", "/api/v1/alerts".into(), String::new())
            .await
            .unwrap();
        let bytes = axum::body::to_bytes(history.into_body(), 16384)
            .await
            .unwrap();
        let rows: Vec<serde_json::Value> = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(rows[0]["status"], "SILENCED");
        due().await?;
        escalate(&db).await?;
        assert_eq!(channels().await?, ["email", "webhook"]);
        assert!(!deliver(&db, &notifier::client().unwrap()).await?);
        sqlx::query("UPDATE trx_alert_history SET silenced_until=now() WHERE id=$1")
            .bind(incident)
            .execute(&db)
            .await?;
        due().await?;
        escalate(&db).await?;
        assert_eq!(channels().await?, ["email", "webhook", "telegram"]);
        assert!(deliver(&db, &notifier::client().unwrap()).await?);
        assert_eq!(
            call("POST", ack, String::new()).await.unwrap().status(),
            StatusCode::NO_CONTENT
        );
        let path = "/api/v1/alerts/rules";
        let body=serde_json::json!({"name":"Disk","metric_name":"disk_usage","severity":"WARNING","area_id":area,
            "threshold_value":75,"grace_seconds":5}).to_string();
        let response = call("POST", path.into(), body.clone()).await.unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
        let bytes = axum::body::to_bytes(response.into_body(), 16384)
            .await
            .unwrap();
        let rule: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let item = format!("{path}/{}", rule["id"].as_str().unwrap());
        assert_eq!(
            call("PUT", item.clone(), body).await.unwrap().status(),
            StatusCode::OK
        );
        assert_eq!(
            call("DELETE", item, String::new()).await.unwrap().status(),
            StatusCode::NO_CONTENT
        );
        let policy_path = "/api/v1/escalation-policies";
        let policy=serde_json::json!({"area_id":area,"severity":"INFO","steps":[{"delay_seconds":0,"channels":["email"]}]}).to_string();
        for (method, expected) in [("POST", StatusCode::CREATED), ("PUT", StatusCode::OK)] {
            assert_eq!(
                call(method, policy_path.into(), policy.clone())
                    .await
                    .unwrap()
                    .status(),
                expected
            );
        }
        for list in [path, policy_path, "/api/v1/alerts", "/api/v1/alerts/areas"] {
            assert_eq!(
                call("GET", list.into(), String::new())
                    .await
                    .unwrap()
                    .status(),
                StatusCode::OK
            );
        }
        observe(97).await?;
        evaluate(&db).await?;
        assert!(!deliver(&db, &notifier::client().unwrap()).await?);
        observe(85).await?;
        observe(95).await?;
        evaluate(&db).await?;
        let statuses: Vec<String> =
            sqlx::query_scalar("SELECT status FROM trx_alert_history ORDER BY triggered_at")
                .fetch_all(&db)
                .await?;
        assert_eq!(statuses, ["RESOLVED", "FIRING"]);
        sqlx::raw_sql("INSERT INTO dat_alert_rule(company_id,area_id,name,severity,metric_name,threshold_value,grace_seconds)
            SELECT company_id,area_id,metric,'WARNING',metric,0,0 FROM dat_server CROSS JOIN
            (VALUES ('ping_down'),('hris_down'),('rogue_ip')) AS m(metric);
            INSERT INTO dat_monitor_target(server_id,protocol,endpoint) SELECT server_id,'TCP','localhost' FROM dat_server;
            UPDATE dat_monitor_target SET checked_at=now(),status='DOWN';
            INSERT INTO log_hris_auth_sync(company_id,username,auth_source,hris_status)
            SELECT company_id,'test','HRIS_PRIMARY','UNAVAILABLE' FROM dat_company;
            WITH store AS (INSERT INTO dat_store(company_id,area_id,store_code,store_name)
               SELECT company_id,area_id,'S','Store' FROM dat_server RETURNING store_id),
            subnet AS (INSERT INTO dat_ipam_subnet(store_id,network) SELECT store_id,'10.1.1.0/24'::cidr FROM store RETURNING id)
            INSERT INTO log_network_scan(subnet_id,scanned_by,host_count,active_count,rogue_count)
               SELECT id,gen_random_uuid(),1,1,1 FROM subnet").execute(&db).await?;
        evaluate(&db).await?;
        let metrics: Vec<String> = sqlx::query_scalar(
            "SELECT metric_name FROM trx_alert_history WHERE status='FIRING' ORDER BY metric_name",
        )
        .fetch_all(&db)
        .await?;
        assert_eq!(metrics, ["cpu_usage", "hris_down", "ping_down", "rogue_ip"]);
        Ok(())
    }
}
