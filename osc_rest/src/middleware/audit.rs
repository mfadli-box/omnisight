//! Perekaman mutasi HTTP. Body hanya disalin saat dibaca handler.
use super::rbac::{Action, RbacState};
use axum::{
    body::Body,
    extract::{ConnectInfo, MatchedPath, Request, State},
    http::{header::CONTENT_TYPE, Method},
    middleware::Next,
    response::Response,
};
use http_body::Body as _;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::{
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::mpsc;
use uuid::Uuid;

const LIMIT: usize = 16 * 1024;

#[derive(Clone)]
pub struct AuditState {
    verifier: RbacState,
    sender: mpsc::Sender<Event>,
}

struct Event {
    actor: Option<(Uuid, Uuid)>,
    ip: Option<String>,
    endpoint: String,
    method: Method,
    status: u16,
    completed_at: SystemTime,
    capture: Option<Arc<Mutex<Capture>>>,
    resource_id: Option<Uuid>,
}

#[derive(Default)]
struct Capture {
    bytes: Vec<u8>,
    truncated: bool,
}

impl Capture {
    fn append(&mut self, data: &[u8]) {
        if self.truncated {
            return;
        }
        if data.len() > LIMIT - self.bytes.len() {
            self.truncated = true;
            self.bytes.clear();
        } else {
            self.bytes.extend_from_slice(data);
        }
    }

    fn delta(&self) -> Value {
        if self.truncated {
            return json!({"capture":"oversized"});
        }
        let Ok(Value::Object(fields)) = serde_json::from_slice(&self.bytes) else {
            return json!({"capture":"unavailable"});
        };
        let mut result = serde_json::Map::new();
        for (key, value) in fields {
            // Nama properti tingkat pertama menunjukkan field yang dimutasi.
            if key.len() > 64 || !key.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_') {
                continue;
            }
            let safe = match key.as_str() {
                "is_active" | "can_read" | "can_create" | "can_update" | "can_delete"
                | "can_execute"
                    if value.is_boolean() =>
                {
                    value
                }
                "user_id" | "company_id" | "role_id" | "area_id" | "server_id"
                    if value.as_str().is_some_and(|s| Uuid::parse_str(s).is_ok()) =>
                {
                    value
                }
                _ => json!("[REDACTED]"),
            };
            result.insert(key, safe);
        }
        Value::Object(result)
    }
}

impl AuditState {
    pub fn new(db: PgPool, secret: &str) -> Result<Self, &'static str> {
        let verifier = RbacState::new(db.clone(), secret, "CM03", Action::Read)?;
        let (sender, mut receiver) = mpsc::channel::<Event>(256);
        tokio::spawn(async move {
            while let Some(mut event) = receiver.recv().await {
                let delta = event.capture.take().map(|c| c.lock().unwrap().delta());
                let id = Uuid::new_v4();
                let mut delay = 1;
                loop {
                    if event.write(&db, id, &delta).await.is_ok() {
                        break;
                    }
                    tracing::error!(%id, "audit insert failed, retrying");
                    tokio::time::sleep(Duration::from_secs(delay)).await;
                    delay = (delay * 2).min(30);
                }
            }
        });
        Ok(Self { verifier, sender })
    }
}

impl Event {
    async fn write(&self, db: &PgPool, id: Uuid, delta: &Option<Value>) -> sqlx::Result<()> {
        let action = match self.method {
            Method::POST => "CREATE",
            Method::DELETE => "DELETE",
            _ => "UPDATE",
        };
        sqlx::query("INSERT INTO trx_audit_trail
            (id,user_id,company_id,ip_address,action,resource_name,resource_id,endpoint,http_status,new_values,created_at)
            VALUES ($1,(SELECT user_id FROM dat_user WHERE user_id=$2),(SELECT company_id FROM dat_company WHERE company_id=$3),
            $4::text::inet,$5,left($6,100),$7,$6,$8,$9,to_timestamp($10)) ON CONFLICT (id) DO NOTHING")
            .bind(id).bind(self.actor.map(|a| a.0)).bind(self.actor.map(|a| a.1)).bind(&self.ip)
            .bind(action).bind(&self.endpoint).bind(self.resource_id.map(|id| id.to_string())).bind(self.status as i16)
            .bind(json!({"method":self.method.as_str(),"delta":delta}))
            .bind(self.completed_at.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs_f64())
            .execute(db).await?;
        Ok(())
    }
}

pub async fn intercept(State(state): State<AuditState>, req: Request, next: Next) -> Response {
    let method = req.method().clone();
    if !matches!(
        method,
        Method::POST | Method::PATCH | Method::PUT | Method::DELETE
    ) {
        return next.run(req).await;
    }
    // Kendalikan tekanan balik sebelum handler mengubah data jika antrean penuh.
    let Ok(slot) = state.sender.reserve().await else {
        use axum::response::IntoResponse;
        return axum::http::StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let actor = state
        .verifier
        .claims(req.headers())
        .map(|c| (c.user_id, c.company_id));
    let endpoint = req
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str)
        .unwrap_or("<unmatched>")
        .to_owned();
    let resource_id = req
        .uri()
        .path()
        .split('/')
        .rev()
        .find_map(|s| Uuid::parse_str(s).ok());
    let ip = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|a| a.0.ip().to_string());
    let is_json = req
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .is_some_and(|v| {
            v.trim().eq_ignore_ascii_case("application/json") || v.trim().ends_with("+json")
        });
    let (parts, body) = req.into_parts();
    let mut capture = None;
    let body = if is_json && !body.is_end_stream() {
        let shared = Arc::new(Mutex::new(Capture::default()));
        capture = Some(shared.clone());
        Body::new(body.map_frame(move |frame| {
            if let Some(data) = frame.data_ref() {
                shared.lock().unwrap().append(data);
            }
            frame
        }))
    } else {
        body
    };
    let response = next.run(Request::from_parts(parts, body)).await;
    slot.send(Event {
        method,
        actor,
        ip,
        endpoint,
        resource_id,
        status: response.status().as_u16(),
        completed_at: SystemTime::now(),
        capture,
    });
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captures_changed_fields_without_free_text_or_nested_secrets() {
        let mut capture = Capture::default();
        capture.append(br#"{"is_active":false,"#);
        capture.append(br#""setting_value":{"nested":"private"},"password":"private"}"#);
        assert_eq!(
            capture.delta(),
            json!({"is_active":false,"setting_value":"[REDACTED]","password":"[REDACTED]"})
        );
        capture.append(&vec![32; LIMIT]);
        assert_eq!(capture.delta(), json!({"capture":"oversized"}));
        assert!(capture.bytes.is_empty());
    }
}
