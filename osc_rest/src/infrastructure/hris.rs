use crate::domain::auth::hris_client::{HrisReply, LoginError};
use quick_xml::{events::Event, name::ResolveResult, NsReader};
use reqwest::{redirect::Policy, Client, StatusCode, Url};
use std::{collections::HashSet, time::Duration};

pub struct HrisClient {
    client: Client,
    hosts: HashSet<String>,
}

impl HrisClient {
    pub fn new(allowed_hosts: &str) -> Result<Self, LoginError> {
        let hosts = allowed_hosts
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_ascii_lowercase)
            .collect();
        let client = Client::builder()
            .timeout(Duration::from_secs(3))
            .redirect(Policy::none())
            .no_proxy()
            .build()
            .map_err(|_| LoginError::Configuration)?;
        Ok(Self { client, hosts })
    }

    pub(crate) async fn login(
        &self,
        endpoint: &str,
        username: &str,
        password: &str,
    ) -> Result<HrisReply, LoginError> {
        let url = Url::parse(endpoint).map_err(|_| LoginError::Configuration)?;
        let local_http = url.scheme() == "http"
            && url
                .host_str()
                .and_then(|host| host.parse::<std::net::IpAddr>().ok())
                .is_some_and(|ip| ip.is_loopback());
        if (url.scheme() != "https" && !local_http)
            || !url.host_str().is_some_and(|host| self.hosts.contains(host))
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(LoginError::Configuration);
        }
        let request = self
            .client
            .get(url)
            .query(&[("uLogin", username), ("uPaswd", password)]);
        let mut response = match request.send().await {
            Ok(r) if r.status() == StatusCode::OK => r,
            Ok(r) if !r.status().is_server_error() => return Ok(HrisReply::Denied),
            _ => return Ok(HrisReply::Unavailable),
        };
        let mut body = Vec::new();
        loop {
            match response.chunk().await {
                Ok(Some(chunk)) if chunk.len() <= 16_384 - body.len() => {
                    body.extend_from_slice(&chunk)
                }
                Ok(None) => return Ok(parse_reply(&body)),
                _ => return Ok(HrisReply::Unavailable),
            }
        }
    }
}

fn parse_reply(body: &[u8]) -> HrisReply {
    let Ok(xml) = std::str::from_utf8(body) else {
        return HrisReply::Unavailable;
    };
    let mut reader = NsReader::from_str(xml.trim_start_matches('\u{feff}'));
    let mut opened = false;
    let mut closed = false;
    let mut payload = String::new();
    loop {
        let position = reader.buffer_position();
        match reader.read_event() {
            Ok(Event::Decl(_)) if position == 0 && !opened => {}
            Ok(Event::Comment(_)) => {}
            Ok(Event::Start(root)) if !opened => {
                let (namespace, local) = reader.resolve_element(root.name());
                if !matches!(namespace, ResolveResult::Bound(ns) if ns.as_ref() == b"App.Login")
                    || local.as_ref() != b"string"
                    || root.attributes().any(|a| a.is_err())
                {
                    return HrisReply::Unavailable;
                }
                opened = true;
            }
            Ok(Event::Text(text)) if opened && !closed => match text.unescape() {
                Ok(value) => payload.push_str(&value),
                Err(_) => return HrisReply::Unavailable,
            },
            Ok(Event::Text(text)) if text.as_ref().iter().all(u8::is_ascii_whitespace) => {}
            Ok(Event::CData(text)) if opened && !closed => match std::str::from_utf8(text.as_ref())
            {
                Ok(value) => payload.push_str(value),
                Err(_) => return HrisReply::Unavailable,
            },
            Ok(Event::End(_)) if opened && !closed => closed = true,
            Ok(Event::Eof) if closed => return HrisReply::from_payload(&payload),
            _ => return HrisReply::Unavailable,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_complete_login_envelope() {
        assert!(
            matches!(parse_reply(br#"<string xmlns="App.Login">1|---|a&amp;b</string>"#), HrisReply::Accepted(t) if t=="a&b")
        );
        assert!(matches!(
            parse_reply(br#"<string xmlns="App.Login">0|---|NONE</string>"#),
            HrisReply::Denied
        ));
        assert!(matches!(
            parse_reply(
                br#"<h:string xmlns:h="App.Login" extra="1"><![CDATA[0|---|NONE]]></h:string>"#
            ),
            HrisReply::Denied
        ));
        for xml in [
            "<!DOCTYPE string><string xmlns=\"App.Login\">1|---|abc</string>",
            "<string>1|---|abc</string>",
            "<broken",
            "<string xmlns=\"App.Login\">1|---|abc</string><extra/>",
        ] {
            assert!(matches!(
                parse_reply(xml.as_bytes()),
                HrisReply::Unavailable
            ));
        }
    }
}
