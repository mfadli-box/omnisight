use async_trait::async_trait;
use serde::Serialize;

use crate::{application::ports::MailPort, domain::AuthError};

#[derive(Clone)]
pub struct HttpEmailNotifier {
    client: reqwest::Client,
    endpoint: String,
    token: String,
    public_app_url: String,
}

impl HttpEmailNotifier {
    pub fn from_env() -> Option<Self> {
        let endpoint = std::env::var("EMAIL_API_ENDPOINT").ok()?;
        let token = std::env::var("EMAIL_API_TOKEN").ok()?;
        let public_app_url = std::env::var("PUBLIC_APP_URL").ok()?;
        let parsed = url::Url::parse(&endpoint).ok()?;
        if parsed.scheme() != "https" {
            return None;
        }
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .ok()?;
        Some(Self {
            client,
            endpoint,
            token,
            public_app_url,
        })
    }
}

#[derive(Serialize)]
struct EmailPayload<'a> {
    to: &'a str,
    subject: &'static str,
    text: String,
}

#[async_trait]
impl MailPort for HttpEmailNotifier {
    async fn send_reset_link(&self, email: &str, token: &str) -> Result<(), AuthError> {
        let link = format!(
            "{}/mfa/reset?token={}",
            self.public_app_url.trim_end_matches('/'),
            token
        );
        let payload = EmailPayload {
            to: email,
            subject: "OmniSight MFA reset",
            text: format!("Use this one-time link to reset MFA. It expires in 15 minutes: {link}"),
        };
        let response = self
            .client
            .post(&self.endpoint)
            .bearer_auth(&self.token)
            .json(&payload)
            .send()
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        if !response.status().is_success() {
            return Err(AuthError::DependencyUnavailable);
        }
        Ok(())
    }
}
