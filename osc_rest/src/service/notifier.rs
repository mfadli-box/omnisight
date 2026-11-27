use reqwest::{redirect::Policy, Client, Url};
use serde_json::{json, Value};
use std::{env, time::Duration};
use uuid::Uuid;

pub(super) struct Notification {
    pub id: Uuid,
    pub company: Uuid,
    pub area: Uuid,
    pub level: i32,
    pub severity: String,
    pub name: String,
    pub metric: String,
    pub actual: String,
    pub threshold: String,
}

impl Notification {
    fn text(&self) -> String {
        format!(
            "[{}] {} — {} {} > {} (L{}, {})",
            self.severity, self.name, self.metric, self.actual, self.threshold, self.level, self.id
        )
    }

    fn key(&self, key: &str) -> String {
        format!(
            "MN04_{}_{}_L{}_{}",
            self.company.simple(),
            self.area.simple(),
            self.level,
            key
        )
    }
}

fn html(text: &str) -> String {
    format!(
        "<html><body><h1>OmniSight Alert</h1><p>{}</p></body></html>",
        text.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
    )
}

fn webhook(value: &str) -> Result<Url, ()> {
    let url = Url::parse(value).map_err(|_| ())?;
    (url.scheme() == "https"
        && url.host().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none())
    .then_some(url)
    .ok_or(())
}

pub(super) fn client() -> reqwest::Result<Client> {
    Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(Policy::none())
        .build()
}

fn request(
    client: &Client,
    channel: &str,
    n: &Notification,
    get: impl Fn(&str) -> Result<String, ()>,
) -> Result<reqwest::Request, ()> {
    let setting = |key: &str| get(&n.key(key));
    let text = n.text();
    let (request, body): (_, Value) = match channel {
        "webhook" => (
            client
                .post(webhook(&setting("WEBHOOK_URL")?)?)
                .header("Idempotency-Key", format!("{}-{}", n.id, n.level)),
            json!({"incident_id":n.id,"severity":n.severity,"level":n.level,"metric":n.metric,"message":text}),
        ),
        "telegram" => {
            let token = setting("TELEGRAM_TOKEN")?;
            if !token
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b":_-".contains(&b))
            {
                return Err(());
            }
            (
                client.post(format!("https://api.telegram.org/bot{token}/sendMessage")),
                json!({"chat_id":setting("TELEGRAM_CHAT_ID")?,"text":text}),
            )
        }
        "email" => (
            client
                .post(webhook(&get("EMAIL_API_ENDPOINT")?)?)
                .bearer_auth(get("EMAIL_API_TOKEN")?),
            json!({"to":setting("EMAIL_TO")?,"subject":format!("OmniSight {} L{}",n.severity,n.level),
                   "html":html(&text)}),
        ),
        _ => return Err(()),
    };
    request
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .build()
        .map_err(|_| ())
}

pub(super) async fn send(client: &Client, channel: &str, n: &Notification) -> Result<(), ()> {
    let response = client
        .execute(request(client, channel, n, |key| {
            env::var(key)
                .ok()
                .filter(|v| !v.trim().is_empty())
                .ok_or(())
        })?)
        .await
        .map_err(|_| ())?;
    response.status().is_success().then_some(()).ok_or(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn posts_all_channel_payloads_to_receiver() {
        use axum::{routing::post, Json, Router};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let local = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
        let (tx, mut rx) = tokio::sync::mpsc::channel(3);
        let app = Router::new().route(
            "/",
            post(move |Json(body): Json<Value>| {
                let tx = tx.clone();
                async move {
                    tx.send(body).await.unwrap();
                }
            }),
        );
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = client().unwrap();
        let n = Notification {
            id: Uuid::new_v4(),
            company: Uuid::new_v4(),
            area: Uuid::new_v4(),
            level: 2,
            name: "CPU <edge>".into(),
            severity: "CRITICAL".into(),
            metric: "cpu_usage".into(),
            actual: "98".into(),
            threshold: "90".into(),
        };
        let get = |k: &str| {
            Ok(if k.ends_with("URL") || k.ends_with("ENDPOINT") {
                "https://alerts.example.test".into()
            } else if k.ends_with("EMAIL_TO") {
                "sre@example.test".into()
            } else {
                Uuid::new_v4().simple().to_string()
            })
        };
        for channel in ["webhook", "telegram", "email"] {
            let mut req = request(&client, channel, &n, get).unwrap();
            assert_eq!(req.url().scheme(), "https");
            if channel == "telegram" {
                assert_eq!(req.url().host_str(), Some("api.telegram.org"));
            }
            *req.url_mut() = local.clone();
            assert!(client.execute(req).await.unwrap().status().is_success());
            let body = rx.recv().await.unwrap();
            match channel {
                "webhook" => assert_eq!(body["incident_id"], n.id.to_string()),
                "telegram" => assert_eq!(body["text"], n.text()),
                _ => assert!(body["html"].as_str().unwrap().contains("CPU &lt;edge&gt;")),
            }
        }
        server.abort();
    }
    #[test]
    fn escapes_untrusted_alert_names_in_email() {
        assert!(html("A&B <tag>").contains("A&amp;B &lt;tag&gt;"));
    }
    #[test]
    fn webhook_only_accepts_configured_https_destinations() {
        assert!(webhook("https://hooks.example.test/alerts").is_ok());
        for invalid in [
            "http://hooks.example.test",
            "https://u@hooks.example.test",
            "file:///tmp/msg",
        ] {
            assert!(webhook(invalid).is_err());
        }
    }
}
