use std::{collections::HashSet, time::Duration};

use async_trait::async_trait;
use url::{Host, Url};

use crate::{
    application::ports::HrisPort,
    domain::{AuthError, HrisProfile},
};

const MAX_RESPONSE_BYTES: usize = 64 * 1024;

pub struct HrisClient {
    client: reqwest::Client,
    allowed_hosts: HashSet<String>,
}

impl HrisClient {
    pub fn new(allowed_hosts: HashSet<String>) -> Result<Self, AuthError> {
        if allowed_hosts.is_empty() {
            return Err(AuthError::Configuration);
        }
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .build()
            .map_err(|_| AuthError::Configuration)?;
        Ok(Self {
            client,
            allowed_hosts,
        })
    }

    fn validate_template(&self, template: &str) -> Result<Url, AuthError> {
        let (_, after_scheme) = template
            .split_once("://")
            .ok_or(AuthError::HrisMisconfigured)?;
        let authority_end = after_scheme
            .find(['/', '?', '#'])
            .ok_or(AuthError::HrisMisconfigured)?;
        let (authority, suffix) = after_scheme.split_at(authority_end);
        if authority.is_empty()
            || authority.contains(['{', '}', '@'])
            || template.contains('\\')
            || template
                .chars()
                .any(|character| character.is_whitespace() || character.is_control())
            || !suffix.contains("{U}")
            || !suffix.contains("{P}")
        {
            return Err(AuthError::HrisMisconfigured);
        }
        let safe = template
            .replace("{U}", "username")
            .replace("{P}", "password");
        let parsed = Url::parse(&safe).map_err(|_| AuthError::HrisMisconfigured)?;
        if !matches!(parsed.scheme(), "https" | "http")
            || parsed.username() != ""
            || parsed.password().is_some()
            || parsed.fragment().is_some()
        {
            return Err(AuthError::HrisMisconfigured);
        }
        let Some(Host::Domain(host)) = parsed.host() else {
            return Err(AuthError::HrisMisconfigured);
        };
        if !self.allowed_hosts.contains(host.trim_end_matches('.')) {
            return Err(AuthError::HrisMisconfigured);
        }
        if !matches!(parsed.port_or_known_default(), Some(80 | 443)) {
            return Err(AuthError::HrisMisconfigured);
        }
        Ok(parsed)
    }
}

#[async_trait]
impl HrisPort for HrisClient {
    fn validate_endpoint(&self, template: &str) -> Result<(), AuthError> {
        self.validate_template(template).map(|_| ())
    }

    async fn authenticate(
        &self,
        template: &str,
        username: &str,
        password: &str,
    ) -> Result<Option<HrisProfile>, AuthError> {
        let validated = self.validate_template(template)?;
        // Encode substitutions for both query and path. Keep the full URL and upstream body out of diagnostics.
        let encode = |value: &str| {
            url::form_urlencoded::byte_serialize(value.as_bytes())
                .collect::<String>()
                .replace('+', "%20")
        };
        let encoded_user = encode(username);
        let encoded_pass = encode(password);
        let request_url = template
            .replace("{U}", &encoded_user)
            .replace("{P}", &encoded_pass);
        let url = Url::parse(&request_url).map_err(|_| AuthError::HrisMisconfigured)?;
        if url.origin() != validated.origin() {
            return Err(AuthError::HrisMisconfigured);
        }
        let mut response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| AuthError::HrisUnavailable)?;
        if matches!(
            response.status(),
            reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN
        ) {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(AuthError::HrisUnavailable);
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(AuthError::HrisInvalidResponse);
        }
        let mut body = Vec::with_capacity(1024);
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| AuthError::HrisUnavailable)?
        {
            if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err(AuthError::HrisInvalidResponse);
            }
            body.extend_from_slice(&chunk);
        }
        let xml = std::str::from_utf8(&body).map_err(|_| AuthError::HrisInvalidResponse)?;
        parse_hris_xml(xml)
    }
}

fn parse_hris_xml(xml: &str) -> Result<Option<HrisProfile>, AuthError> {
    if xml.len() > MAX_RESPONSE_BYTES || xml.contains("<!DOCTYPE") {
        return Err(AuthError::HrisInvalidResponse);
    }
    let options = roxmltree::ParsingOptions {
        allow_dtd: false,
        nodes_limit: 4096,
        ..Default::default()
    };
    let doc = roxmltree::Document::parse_with_options(xml, options)
        .map_err(|_| AuthError::HrisInvalidResponse)?;
    let root = doc.root_element();
    if root.tag_name().name() != "string" || root.tag_name().namespace().is_none() {
        return Err(AuthError::HrisInvalidResponse);
    }
    if root.children().any(|node| node.is_element()) {
        return Err(AuthError::HrisInvalidResponse);
    }
    let value = root
        .children()
        .filter(|node| node.is_text())
        .filter_map(|node| node.text())
        .collect::<String>();
    let value = value.trim();
    if value.starts_with("0|") && value.ends_with("|NONE") {
        return Ok(None);
    }
    let Some(profile) = value.strip_prefix("1|") else {
        return Err(AuthError::HrisInvalidResponse);
    };
    let mut fields = profile.splitn(3, '|');
    let username = fields.next().unwrap_or_default().trim();
    let full_name = fields.next().unwrap_or_default().trim();
    let email = fields
        .next()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned);
    if username.is_empty()
        || full_name.is_empty()
        || username.len() > 128
        || full_name.len() > 200
        || username
            .chars()
            .chain(full_name.chars())
            .any(char::is_control)
        || email.as_ref().is_some_and(|email| {
            email.len() > 320 || email.contains('|') || email.chars().any(char::is_control)
        })
    {
        return Err(AuthError::HrisInvalidResponse);
    }
    Ok(Some(HrisProfile {
        username: username.to_owned(),
        full_name: full_name.to_owned(),
        email,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_origin_before_substituting_credentials() {
        let client = HrisClient::new(HashSet::from(["hris.test".to_owned()])).unwrap();
        assert!(
            client
                .validate_endpoint("https://hris.test/signin?user={U}&uPaswd={P}")
                .is_ok()
        );
        for template in [
            "https://hris.{U}/signin?user={U}&uPaswd={P}",
            "https://hris.test.invalid/signin?user={U}&uPaswd={P}",
            "https://127.0.0.1/signin?user={U}&uPaswd={P}",
            "https://[::1]/signin?user={U}&uPaswd={P}",
            "https://hris.test:8080/signin?user={U}&uPaswd={P}",
            "https://user@hris.test/signin?user={U}&uPaswd={P}",
            "https://hris.test/signin?user={U}#uPaswd={P}",
        ] {
            assert!(matches!(
                client.validate_endpoint(template),
                Err(AuthError::HrisMisconfigured)
            ));
        }
    }

    #[test]
    fn parses_success_and_denial_and_rejects_dtd_and_oversize_xml() {
        let xml = r#"<string xmlns="urn:test">1|person|First &amp; Last|</string>"#;
        assert_eq!(
            parse_hris_xml(xml).unwrap().unwrap().full_name,
            "First & Last"
        );
        let denial = r#"<string xmlns="urn:test">0|person|NONE</string>"#;
        assert!(parse_hris_xml(denial).unwrap().is_none());
        assert!(matches!(
            parse_hris_xml(&format!("<!DOCTYPE string>{xml}")),
            Err(AuthError::HrisInvalidResponse)
        ));
        assert!(matches!(
            parse_hris_xml(&"x".repeat(MAX_RESPONSE_BYTES + 1)),
            Err(AuthError::HrisInvalidResponse)
        ));
    }
}
