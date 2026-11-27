use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use jsonwebtoken::{encode, EncodingKey, Header};
use osc_rest::api::tenant;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::time::{SystemTime, UNIX_EPOCH};
use tower::ServiceExt;
use uuid::Uuid;

async fn request(app: &Router, key: &[u8], claims: &Value, query: &str) -> (StatusCode, Vec<u8>) {
    let token = encode(&Header::default(), claims, &EncodingKey::from_secret(key)).unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("/baas/v1/tenant/context{query}"))
                .header("Authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    (
        response.status(),
        to_bytes(response.into_body(), 4096).await.unwrap().to_vec(),
    )
}

#[sqlx::test]
#[ignore = "Memerlukan DATABASE_URL PostgreSQL dengan hak membuat basis data uji"]
async fn tenant_context_requires_current_membership_and_permission(db: PgPool) -> sqlx::Result<()> {
    for schema in [
        include_str!("../../osc_base/init/01_dat.sql"),
        include_str!("../../osc_base/init/02_tsx.sql"),
        include_str!("../../osc_base/init/03_log.sql"),
    ] {
        sqlx::raw_sql(schema).execute(&db).await?;
    }
    let user: Uuid = sqlx::query_scalar("INSERT INTO dat_user(username,email) VALUES ('tester','tester@example.invalid') RETURNING user_id").fetch_one(&db).await?;
    let company: Uuid = sqlx::query_scalar(
        "INSERT INTO dat_company(company_code,company_name) VALUES ('A','A') RETURNING company_id",
    )
    .fetch_one(&db)
    .await?;
    let area: Uuid = sqlx::query_scalar("INSERT INTO dat_area(company_id,area_code,area_name) VALUES ($1,'A','A') RETURNING area_id").bind(company).fetch_one(&db).await?;
    let role: Uuid = sqlx::query_scalar(
        "INSERT INTO dat_role(role_code,role_name) VALUES ('TEST','Test') RETURNING role_id",
    )
    .fetch_one(&db)
    .await?;
    let menu: Uuid = sqlx::query_scalar("INSERT INTO dat_menu(group_code,sub_module_code,menu_name,route_path) VALUES ('CM','CM02','CM02','/') RETURNING menu_id").fetch_one(&db).await?;
    sqlx::query("INSERT INTO dat_permission(role_id,menu_id) VALUES ($1,$2)")
        .bind(role)
        .bind(menu)
        .execute(&db)
        .await?;
    sqlx::query("INSERT INTO trx_user_company(user_id,company_id,role_id) VALUES ($1,$2,$3)")
        .bind(user)
        .bind(company)
        .bind(role)
        .execute(&db)
        .await?;
    let key = [*Uuid::new_v4().as_bytes(), *Uuid::new_v4().as_bytes()].concat();
    let app = tenant::router(db.clone(), &STANDARD.encode(&key)).unwrap();
    let expires = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 300;
    let flags = json!({"can_create":true,"can_read":true,"can_update":false,"can_delete":false,"can_execute":false});
    let claims = json!({"user_id":user,"company_id":company,"role_id":role,"exp":expires,"permissions":{"CM02":flags}});
    assert_eq!(request(&app, &key, &claims, "").await.0, StatusCode::OK);
    let query = format!("?area_id={area}");
    assert_eq!(
        request(&app, &key, &claims, &query).await.0,
        StatusCode::FORBIDDEN
    );
    sqlx::query("INSERT INTO trx_user_area(user_id,company_id,area_id) VALUES ($1,$2,$3)")
        .bind(user)
        .bind(company)
        .bind(area)
        .execute(&db)
        .await?;
    let (status, body) = request(&app, &key, &claims, &query).await;
    assert_eq!(status, StatusCode::OK);
    let context: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(context["area_id"], json!(area));
    assert_eq!(context["company_id"], json!(company));
    assert_eq!(context["permissions"]["can_create"], false);
    assert_eq!(
        request(
            &app,
            &key,
            &claims,
            &format!("?company_id={}", Uuid::new_v4())
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let mut restricted = claims.clone();
    restricted["permissions"]["CM02"]["can_read"] = json!(false);
    assert_eq!(
        request(&app, &key, &restricted, "").await.0,
        StatusCode::FORBIDDEN
    );
    restricted.as_object_mut().unwrap().remove("permissions");
    assert_eq!(
        request(&app, &key, &restricted, "").await.0,
        StatusCode::FORBIDDEN
    );
    sqlx::query("DELETE FROM trx_user_company WHERE user_id=$1")
        .bind(user)
        .execute(&db)
        .await?;
    assert_eq!(
        request(&app, &key, &claims, &query).await.0,
        StatusCode::FORBIDDEN
    );
    Ok(())
}
