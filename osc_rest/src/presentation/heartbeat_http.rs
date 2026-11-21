use std::{collections::HashMap, sync::Arc};

use axum::{
    Router,
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use chrono::Utc;
use data_encoding::HEXLOWER;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::infrastructure::redis_cache::RedisCache;

const CLOCK_SKEW_SECONDS: u64 = 120;

struct HeartbeatState {
    secrets: HashMap<String, String>,
    cache: Arc<RedisCache>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Heartbeat {
    os: String,
    uptime_seconds: u64,
    cpu_percent: f64,
    ram_percent: f64,
    disk_percent: f64,
}

pub fn router(cache: Arc<RedisCache>, secrets_json: &str) -> Result<Router, &'static str> {
    let secrets = parse_secrets(secrets_json)?;
    Ok(Router::new()
        .route("/baas/v1/agents/heartbeat", post(receive))
        .layer(DefaultBodyLimit::max(4096))
        .with_state(Arc::new(HeartbeatState { secrets, cache })))
}

pub(super) fn parse_secrets(secrets_json: &str) -> Result<HashMap<String, String>, &'static str> {
    let secrets = if secrets_json.is_empty() {
        HashMap::new()
    } else {
        serde_json::from_str::<HashMap<String, String>>(secrets_json)
            .map_err(|_| "AGENT_HEARTBEAT_SECRETS must be a JSON object")?
    };
    if secrets
        .iter()
        .any(|(id, secret)| !valid_id(id) || !(32..=512).contains(&secret.len()))
    {
        return Err("AGENT_HEARTBEAT_SECRETS contains an invalid node ID or secret length");
    }
    Ok(secrets)
}

fn valid_id(id: &str) -> bool {
    (1..=128).contains(&id.len())
        && id.as_bytes()[0].is_ascii_alphanumeric()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
}

pub(super) fn authenticate<'a>(
    headers: &'a HeaderMap,
    body: &[u8],
    secrets: &HashMap<String, String>,
    now: i64,
    signed_path: Option<&str>,
) -> Option<(&'a str, i64)> {
    let header = |name: &str| {
        let mut values = headers.get_all(name).iter();
        let value = values.next()?.to_str().ok()?;
        values.next().is_none().then_some(value)
    };
    let id = header("x-agent-id")?;
    let timestamp = header("x-timestamp")?;
    let seconds = timestamp.parse::<i64>().ok()?;
    if timestamp != seconds.to_string() || seconds.abs_diff(now) > CLOCK_SKEW_SECONDS {
        return None;
    }
    let mut signature = [0u8; 32];
    if HEXLOWER.decode_len(header("x-signature")?.len()).ok()? != signature.len() {
        return None;
    }
    HEXLOWER
        .decode_mut(header("x-signature")?.as_bytes(), &mut signature)
        .ok()?;
    let mut mac = Hmac::<Sha256>::new_from_slice(secrets.get(id)?.as_bytes()).ok()?;
    if let Some(path) = signed_path {
        mac.update(path.as_bytes());
        mac.update(b"\n");
    }
    mac.update(id.as_bytes());
    mac.update(b"\n");
    mac.update(timestamp.as_bytes());
    mac.update(b"\n");
    mac.update(body);
    mac.verify_slice(&signature).ok()?;
    Some((id, seconds))
}

async fn receive(
    State(state): State<Arc<HeartbeatState>>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some((id, timestamp)) = authenticate(
        &headers,
        &body,
        &state.secrets,
        Utc::now().timestamp(),
        None,
    ) else {
        return StatusCode::UNAUTHORIZED;
    };
    let Ok(metrics) = serde_json::from_slice::<Heartbeat>(&body) else {
        return StatusCode::BAD_REQUEST;
    };
    if !matches!(metrics.os.as_str(), "linux" | "windows")
        || [
            metrics.cpu_percent,
            metrics.ram_percent,
            metrics.disk_percent,
        ]
        .iter()
        .any(|percent| !(0.0..=100.0).contains(percent))
    {
        return StatusCode::BAD_REQUEST;
    }
    let payload = serde_json::json!({ "timestamp": timestamp, "metrics": metrics });
    match state
        .cache
        .record_agent_heartbeat(id, timestamp, &payload.to_string())
        .await
    {
        Ok(true) => StatusCode::NO_CONTENT,
        Ok(false) => StatusCode::CONFLICT,
        Err(_) => StatusCode::SERVICE_UNAVAILABLE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telemetry_signature_binds_path_identity_timestamp_and_body() {
        const ID: &str = "5b1cd41c-fc12-4d9a-add5-b77a12ce2434";
        const PATH: &str = "/baas/v1/agents/telemetry";
        const TIME: i64 = 1795222800;
        let secrets = HashMap::from([(
            ID.to_owned(),
            "test-secret-for-agent-signing-only".to_owned(),
        )]);
        let mut headers = HeaderMap::new();
        headers.insert("x-agent-id", ID.parse().unwrap());
        headers.insert("x-timestamp", TIME.to_string().parse().unwrap());
        headers.insert(
            "x-signature",
            "e7150d925355b854938e95a40f688cba4c0ff53678381f94c55132a4b63719d5"
                .parse()
                .unwrap(),
        );
        assert_eq!(
            authenticate(&headers, b"{}", &secrets, TIME, Some(PATH)),
            Some((ID, TIME))
        );
        assert!(authenticate(&headers, b"{}", &secrets, TIME, None).is_none());
        assert!(authenticate(&headers, b"[]", &secrets, TIME, Some(PATH)).is_none());
        assert!(authenticate(&headers, b"{}", &secrets, TIME + 121, Some(PATH)).is_none());
        headers.append("x-agent-id", ID.parse().unwrap());
        assert!(authenticate(&headers, b"{}", &secrets, TIME, Some(PATH)).is_none());
    }
}
