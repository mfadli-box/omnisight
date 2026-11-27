use serde_json::json;
use sqlx::{PgPool, Postgres, Row, Transaction};
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use uuid::Uuid;

fn clock_state(target: f64, elapsed: f64, completed: bool) -> &'static str {
    if elapsed > target {
        "BREACHED"
    } else if completed {
        "MET"
    } else if elapsed > target * 0.75 {
        "WARNING"
    } else {
        "PENDING"
    }
}

fn promote(priority: &str, breaches: i32) -> &str {
    match (priority, breaches) {
        (_, 0) => priority,
        ("LOW", 1) => "MEDIUM",
        ("LOW", 2) | ("MEDIUM", 1) => "HIGH",
        _ => "CRITICAL",
    }
}

async fn event(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    name: &str,
    details: serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO log_ticket_activity(ticket_id,event_type,details) VALUES ($1,$2,$3)")
        .bind(id)
        .bind(name)
        .bind(&details)
        .execute(&mut **tx)
        .await?;
    let payload = json!({"ticket_id":id,"event":name,"details":details});
    sqlx::query("SELECT pg_notify('sla_events',$1)")
        .bind(payload.to_string())
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn evaluate(db: &PgPool) -> Result<(), sqlx::Error> {
    let mut cursor: Option<Uuid> = None;
    loop {
        let mut tx = db.begin().await?;
        let rows = sqlx::query("SELECT id,priority,status,response_sla_state,resolve_sla_state,
            escalation_level,assigned_escalation_level,first_response_at IS NOT NULL AS responded,
            resolved_at IS NOT NULL AS resolved,
            extract(epoch from response_due_at-created_at)::float8 AS response_target,
            extract(epoch from sla_due_at-created_at)::float8 AS resolve_target,
            extract(epoch from coalesce(first_response_at,now())-created_at)::float8 AS response_elapsed,
            extract(epoch from coalesce(resolved_at,now())-created_at)::float8 AS resolve_elapsed
            FROM trx_ticket_issue WHERE ($1::uuid IS NULL OR id>$1) AND
            (response_sla_state IN ('PENDING','WARNING') OR resolve_sla_state IN ('PENDING','WARNING')
             OR (assigned_escalation_level<escalation_level AND status NOT IN ('RESOLVED','CLOSED')))
            ORDER BY id LIMIT 128 FOR UPDATE SKIP LOCKED")
            .bind(cursor).fetch_all(&mut *tx).await?;
        for row in &rows {
            let id = row.get("id");
            cursor = Some(id);
            let active = !matches!(row.get::<&str, _>("status"), "RESOLVED" | "CLOSED");
            let mut breaches = 0;
            let mut states = Vec::with_capacity(2);
            for (clock, target, elapsed, completed, previous) in [
                (
                    "response",
                    "response_target",
                    "response_elapsed",
                    "responded",
                    "response_sla_state",
                ),
                (
                    "resolution",
                    "resolve_target",
                    "resolve_elapsed",
                    "resolved",
                    "resolve_sla_state",
                ),
            ] {
                let old: &str = row.get(previous);
                let state = if !active && !row.get::<bool, _>(completed) {
                    if old == "BREACHED" {
                        old
                    } else {
                        "UNKNOWN"
                    }
                } else {
                    clock_state(row.get(target), row.get(elapsed), row.get(completed))
                };
                if state != old && matches!(state, "WARNING" | "BREACHED") {
                    breaches += i32::from(state == "BREACHED");
                    event(
                        &mut tx,
                        id,
                        if state == "WARNING" {
                            "SLA_WARNING"
                        } else {
                            "SLA_BREACHED"
                        },
                        json!({"clock":clock}),
                    )
                    .await?;
                }
                states.push(state);
            }
            let previous_level: i32 = row.get("escalation_level");
            let level = if active {
                (previous_level + breaches).min(3)
            } else {
                previous_level
            };
            let assigned: i32 = row.get("assigned_escalation_level");
            let mut assignee: Option<Uuid> = None;
            if active && level > assigned {
                assignee = sqlx::query_scalar("SELECT g.user_id FROM trx_ticket_issue t
                    JOIN trx_user_company g ON g.company_id=t.company_id JOIN dat_role r USING(role_id)
                    JOIN dat_user u ON u.user_id=g.user_id AND u.is_active
                    WHERE t.id=$1 AND r.role_code=$2 AND (t.area_id IS NULL OR EXISTS (
                    SELECT FROM trx_user_area a WHERE a.company_id=t.company_id AND a.area_id=t.area_id AND a.user_id=g.user_id))
                    ORDER BY g.user_id LIMIT 1 FOR SHARE OF g,u,r")
                    .bind(id).bind(format!("SRE_L{level}")).fetch_optional(&mut *tx).await?;
                if level != previous_level || assignee.is_some() {
                    event(
                        &mut tx,
                        id,
                        "SLA_ESCALATION",
                        json!({"level":level,"assignee_id":assignee}),
                    )
                    .await?;
                }
            }
            if states[0] != row.get::<&str, _>("response_sla_state")
                || states[1] != row.get::<&str, _>("resolve_sla_state")
                || assignee.is_some()
            {
                let priority = promote(row.get("priority"), level - previous_level);
                sqlx::query("UPDATE trx_ticket_issue SET response_sla_state=$2,resolve_sla_state=$3,
                    is_sla_breached=is_sla_breached OR $2='BREACHED' OR $3='BREACHED',
                    priority=$4,escalation_level=$5,assignee_id=coalesce($6,assignee_id),
                    assigned_escalation_level=CASE WHEN $6 IS NULL THEN assigned_escalation_level ELSE $5 END,
                    updated_at=clock_timestamp() WHERE id=$1")
                    .bind(id).bind(states[0]).bind(states[1]).bind(priority).bind(level).bind(assignee).execute(&mut *tx).await?;
            }
        }
        tx.commit().await?;
        if rows.len() < 128 {
            return Ok(());
        }
    }
}

pub async fn run(db: PgPool) {
    let mut timer = interval(Duration::from_secs(60));
    timer.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        timer.tick().await;
        if let Err(err) = evaluate(&db).await {
            tracing::warn!(error=%err,"SLA evaluation failed");
        } else if let Err(err) = refresh_monthly(&db).await {
            tracing::warn!(error=%err,"SLA monthly summary failed");
        }
    }
}

async fn refresh_monthly(db: &PgPool) -> Result<(), sqlx::Error> {
    let mut tx = db.begin().await?;
    if sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_xact_lock(834602)")
        .fetch_one(&mut *tx)
        .await?
    {
        sqlx::query(include_str!("sla_monthly.sql"))
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_thresholds_and_completed_clocks() {
        for target in [900., 1800., 7200., 14400., 28800., 86400.] {
            assert_eq!(clock_state(target, target * 0.75, false), "PENDING");
            assert_eq!(clock_state(target, target * 0.75 + 0.001, false), "WARNING");
            assert_eq!(clock_state(target, target, false), "WARNING");
            assert_eq!(clock_state(target, target, true), "MET");
            assert_eq!(clock_state(target, target + 0.001, true), "BREACHED");
        }
    }

    #[test]
    fn escalation_caps_at_critical() {
        assert_eq!(promote("LOW", 2), "HIGH");
        assert_eq!(promote("MEDIUM", 1), "HIGH");
        assert_eq!(promote("URGENT", 1), "CRITICAL");
        assert_eq!(promote("CRITICAL", 2), "CRITICAL");
    }

    #[tokio::test]
    #[ignore = "Memerlukan PostgreSQL kosong khusus SD02"]
    async fn postgres_lifecycle() {
        let db = PgPool::connect(&std::env::var("SD02_TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        for migration in [
            include_str!("../../../osc_base/migrations/01_data_master.sql"),
            include_str!("../../../osc_base/migrations/02_data_transaction.sql"),
            include_str!("../../migrations/sd01_tickets.sql"),
            include_str!("../../migrations/sd02_sla.sql"),
        ] {
            sqlx::raw_sql(migration).execute(&db).await.unwrap();
        }
        sqlx::raw_sql("INSERT INTO dat_company(company_code,company_name) VALUES ('SD','SD');
            INSERT INTO dat_user(username,email) VALUES ('l2','l2@example.invalid'),('l3','l3@example.invalid');
            INSERT INTO dat_role(role_name,role_code) VALUES ('l2','SRE_L2'),('l3','SRE_L3');
            INSERT INTO trx_user_company(user_id,company_id,role_id)
            SELECT user_id,company_id,role_id FROM dat_company CROSS JOIN dat_user JOIN dat_role ON role_name=username;
            INSERT INTO trx_ticket_issue(ticket_number,company_id,reporter_id,category,title,description,priority,created_at)
            SELECT 'TEST',company_id,user_id,'NETWORK','Test','Test','HIGH',now()-interval '24 minutes'
            FROM dat_company CROSS JOIN dat_user WHERE username='l3';")
            .execute(&db).await.unwrap();
        evaluate(&db).await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT response_sla_state FROM trx_ticket_issue")
                .fetch_one(&db)
                .await
                .unwrap(),
            "WARNING"
        );
        for (delta, expected) in [("10 minutes", "l2"), ("4 hours", "l3")] {
            sqlx::query("UPDATE trx_ticket_issue SET created_at=created_at-$1::text::interval,
                response_due_at=response_due_at-$1::text::interval,sla_due_at=sla_due_at-$1::text::interval")
                .bind(delta).execute(&db).await.unwrap();
            evaluate(&db).await.unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, String>(
                    "SELECT username FROM trx_ticket_issue JOIN dat_user ON assignee_id=user_id
                WHERE is_sla_breached AND priority='CRITICAL'"
                )
                .fetch_one(&db)
                .await
                .unwrap(),
                expected
            );
        }
        evaluate(&db).await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT count(*) FROM log_ticket_activity WHERE event_type='SLA_ESCALATION'"
            )
            .fetch_one(&db)
            .await
            .unwrap(),
            2
        );
        refresh_monthly(&db).await.unwrap();
        refresh_monthly(&db).await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i32>("SELECT sla_compliance_pct::int FROM trx_summary_monthly")
                .fetch_all(&db)
                .await
                .unwrap(),
            vec![0]
        );
        verify_api(&db).await;
    }

    async fn verify_api(db: &PgPool) {
        use axum::{body::Body, http::Request};
        use base64::{engine::general_purpose::STANDARD, Engine};
        use http_body_util::BodyExt;
        use jsonwebtoken::{encode, EncodingKey, Header};
        use tower::ServiceExt;
        let (user, company, role): (Uuid, Uuid, Uuid) =
            sqlx::query_as("SELECT user_id,company_id,role_id FROM trx_user_company LIMIT 1")
                .fetch_one(db)
                .await
                .unwrap();
        sqlx::query(
            "INSERT INTO dat_permission(role_id,menu_id,can_read,can_update)
            SELECT $1,menu_id,true,true FROM dat_menu WHERE sub_module_code='SD02'",
        )
        .bind(role)
        .execute(db)
        .await
        .unwrap();
        let key = [Uuid::new_v4().into_bytes(), Uuid::new_v4().into_bytes()].concat();
        let token = encode(
            &Header::default(),
            &json!({"user_id":user,"company_id":company,"role_id":role,"exp":4_000_000_000_u64}),
            &EncodingKey::from_secret(&key),
        )
        .unwrap();
        let router = crate::api::sla::router(db.clone(), &STANDARD.encode(key)).unwrap();
        let send = |method: &str, path: &str, body: &str| {
            router.clone().oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .header("Authorization", format!("Bearer {token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(body.to_owned()))
                    .unwrap(),
            )
        };
        for (path, field, expected) in [
            ("policies", "target_response_m", json!(15)),
            ("compliance?period=day", "compliance_rate", json!(0.0)),
            ("breached", "is_sla_breached", json!(true)),
        ] {
            let res = send("GET", &format!("/api/v1/sla/{path}"), "")
                .await
                .unwrap();
            assert_eq!(res.status(), 200);
            let body: serde_json::Value =
                serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(body[0][field], expected);
        }
        let path = "/api/v1/sla/policies/HIGH";
        let valid = r#"{"target_response_m":20,"target_resolve_m":90}"#;
        assert_eq!(send("PUT", path, valid).await.unwrap().status(), 204);
        assert_eq!(
            send(
                "PUT",
                path,
                r#"{"target_response_m":0,"target_resolve_m":90}"#
            )
            .await
            .unwrap()
            .status(),
            400
        );
        sqlx::query("UPDATE dat_permission SET can_update=false WHERE role_id=$1")
            .bind(role)
            .execute(db)
            .await
            .unwrap();
        assert_eq!(send("PUT", path, valid).await.unwrap().status(), 403);
        assert!(sqlx::query_scalar::<_,bool>("SELECT response_due_at-created_at=interval '30 minutes' FROM trx_ticket_issue WHERE ticket_number='TEST'").fetch_one(db).await.unwrap());
        sqlx::query("INSERT INTO trx_ticket_issue(ticket_number,company_id,reporter_id,category,title,description,priority)
            VALUES ('NEW',$1,$2,'NETWORK','Test','Test','HIGH')").bind(company).bind(user).execute(db).await.unwrap();
        sqlx::query("INSERT INTO log_ticket_activity(ticket_id,actor_id,event_type,details)
            SELECT id,$1,'STATUS_CHANGED',jsonb_build_object('to','IN_PROGRESS') FROM trx_ticket_issue WHERE ticket_number='NEW'").bind(user).execute(db).await.unwrap();
        evaluate(db).await.unwrap();
        assert!(sqlx::query_scalar::<_,bool>("SELECT response_due_at-created_at=interval '20 minutes' AND first_response_at IS NOT NULL
            AND response_sla_state='MET' FROM trx_ticket_issue WHERE ticket_number='NEW'").fetch_one(db).await.unwrap());
    }
}
