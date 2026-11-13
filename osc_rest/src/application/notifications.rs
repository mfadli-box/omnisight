//! Usecase Notification Channel (bab 5.8 — Centralized Notification
//! Dispatcher): validasi config SMTP/Telegram/Webhook, enkripsi Envelope
//! AES-256-GCM seluruh config, dan masking secret pada ringkasan respons.
//!
//! `osc_rest` TIDAK mengirim notifikasi langsung — hanya menyimpan channel
//! terenkripsi; `flow_worker_agent` men-dispatch asinkron (poll event
//! `alert_histories`/`security_alert_events` sesuai `event_filter`).

use crate::domain::error::DomainError;
use serde_json::{Value, json};

/// Enum `notification_channel_type`.
pub const CHANNEL_TYPES: &[&str] = &["SMTP_EMAIL", "TELEGRAM", "WEBHOOK"];

/// Maksimum entri `event_filter` per channel.
pub const MAX_EVENT_FILTERS: usize = 32;

/// Hasil validasi channel: blob terenkripsi untuk DB + ringkasan aman
/// untuk respons API.
pub struct ChannelValidated {
    /// `{"enc": "<base64 Envelope AES-256-GCM>"}` — disimpan apa adanya.
    pub config_encrypted: Value,
    /// Ringkasan ter-sanitasi (secret di-mask → `has_*` boolean).
    pub summary: Value,
}

/// Validasi + enkripsi config channel.
pub fn validate_channel<C: crate::domain::ports::EnvelopeCrypto>(
    crypto: &C,
    channel_type: &str,
    config: &Value,
    event_filter: &[String],
) -> Result<ChannelValidated, DomainError> {
    let channel_type = channel_type.trim().to_uppercase();
    if !CHANNEL_TYPES.contains(&channel_type.as_str()) {
        return Err(DomainError::validation(format!(
            "type tidak valid (salah satu dari: {})",
            CHANNEL_TYPES.join(", ")
        )));
    }
    // Validasi event_filter (dikirim terpisah oleh handler ke store).
    validate_event_filter(event_filter)?;

    let summary = match channel_type.as_str() {
        "SMTP_EMAIL" => validate_smtp(config)?,
        "TELEGRAM" => validate_telegram(config)?,
        _ => validate_webhook(config)?,
    };

    // Seluruh config (termasuk secret) dienkripsi satu blob; JSONB hanya
    // menyimpan `{"enc": base64}` — plaintext tidak pernah menyentuh disk.
    let plaintext = serde_json::to_vec(config)
        .map_err(|_| DomainError::validation("config tidak serializable"))?;
    let ciphertext = crypto.envelope_encrypt(&plaintext)?;
    let config_encrypted = json!({ "enc": data_encoding::BASE64.encode(&ciphertext) });

    Ok(ChannelValidated { config_encrypted, summary })
}

/// Dekripsi blob `{"enc": ...}` kembali ke config plaintext (jalur
/// internal — dispatcher/flow_worker polling; tidak pernah di-echo API).
pub fn decrypt_config<C: crate::domain::ports::EnvelopeCrypto>(
    crypto: &C,
    stored: &Value,
) -> Result<Value, DomainError> {
    let encoded = stored
        .get("enc")
        .and_then(Value::as_str)
        .ok_or_else(|| DomainError::Unavailable("channel config korup: blob tidak dikenal".into()))?;
    let ciphertext = data_encoding::BASE64
        .decode(encoded.as_bytes())
        .map_err(|_| DomainError::Unavailable("channel config korup: base64 invalid".into()))?;
    let plaintext = crypto.envelope_decrypt(&ciphertext)?;
    serde_json::from_slice(&plaintext)
        .map_err(|_| DomainError::Unavailable("channel config korup: payload invalid".into()))
}

fn validate_event_filter(event_filter: &[String]) -> Result<Vec<String>, DomainError> {
    if event_filter.len() > MAX_EVENT_FILTERS {
        return Err(DomainError::validation(format!(
            "event_filter maksimal {MAX_EVENT_FILTERS} entri"
        )));
    }
    event_filter
        .iter()
        .map(|event| {
            let value = event.trim().to_uppercase();
            if value.is_empty() || value.len() > 100 {
                return Err(DomainError::validation(
                    "event_filter entri wajib 1–100 karakter",
                ));
            }
            Ok(value)
        })
        .collect()
}

fn str_field(config: &Value, key: &str) -> Option<String> {
    config.get(key).and_then(Value::as_str).map(|v| v.trim().to_owned())
}

fn validate_smtp(config: &Value) -> Result<Value, DomainError> {
    let host = str_field(config, "host").filter(|h| !h.is_empty());
    let host = host.filter(|h| h.len() <= 255 && !h.contains(|c: char| c.is_whitespace() || c == '/' || c == '@'))
        .ok_or_else(|| DomainError::validation("config SMTP wajib `host` (hostname/IP tanpa scheme)"))?;
    let port = config
        .get("port")
        .and_then(Value::as_i64)
        .unwrap_or(587)
        .clamp(1, 65_535);
    let from_email = str_field(config, "from_email")
        .filter(|e| e.contains('@') && e.len() >= 5 && e.len() <= 255)
        .ok_or_else(|| DomainError::validation("config SMTP wajib `from_email` valid"))?;
    let password = str_field(config, "password");

    Ok(json!({
        "host": host,
        "port": port,
        "username": str_field(config, "username"),
        "from_email": from_email,
        "use_tls": config.get("use_tls").and_then(Value::as_bool).unwrap_or(true),
        "has_password": password.is_some(),
    }))
}

fn validate_telegram(config: &Value) -> Result<Value, DomainError> {
    let bot_token = str_field(config, "bot_token")
        .filter(|t| !t.is_empty() && t.len() <= 64 && !t.contains(char::is_whitespace))
        .ok_or_else(|| DomainError::validation("config Telegram wajib `bot_token` (tanpa spasi)"))?;
    let chat_id = str_field(config, "chat_id")
        .filter(|c| !c.is_empty() && c.len() <= 64)
        .ok_or_else(|| DomainError::validation("config Telegram wajib `chat_id`"))?;
    let parse_mode = str_field(config, "parse_mode")
        .map(|m| m.to_uppercase())
        .filter(|m| matches!(m.as_str(), "HTML" | "MARKDOWN" | "MARKDOWNV2" | ""));

    Ok(json!({
        "chat_id": chat_id,
        "parse_mode": parse_mode,
        "has_bot_token": !bot_token.is_empty(),
    }))
}

fn validate_webhook(config: &Value) -> Result<Value, DomainError> {
    let url = str_field(config, "url").unwrap_or_default();
    let invalid = || DomainError::validation("config Webhook wajib `url` http(s) tanpa kredensial inline");

    if url.len() > 500 || url.contains(char::is_whitespace) || !url.contains("://") {
        return Err(invalid());
    }
    let (scheme, rest) = url.split_once("://").ok_or_else(invalid)?;
    if !matches!(scheme.to_ascii_lowercase().as_str(), "http" | "https") {
        return Err(invalid());
    }
    // Anti credential-leak: `user:pass@host` dilarang (kredensial masuk
    // blob terenkripsi, bukan URL).
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.contains('@') || authority.is_empty() {
        return Err(invalid());
    }
    let secret = str_field(config, "secret");

    Ok(json!({
        "url": url,
        "scheme": scheme.to_ascii_lowercase(),
        "has_secret": secret.is_some(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::ports::EnvelopeCrypto;

    /// Crypto stub deterministik untuk test murni (append marker byte).
    struct StubCrypto;

    impl EnvelopeCrypto for StubCrypto {
        fn envelope_encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, DomainError> {
            let mut out = plaintext.to_vec();
            out.push(0xA5);
            Ok(out)
        }
        fn envelope_decrypt(&self, blob: &[u8]) -> Result<Vec<u8>, DomainError> {
            let (marker, data) = blob.split_last().ok_or_else(|| {
                DomainError::Unavailable("blob rusak".into())
            })?;
            if *marker != 0xA5 {
                return Err(DomainError::Unavailable("blob tamper".into()));
            }
            Ok(data.to_vec())
        }
    }

    #[test]
    fn smtp_valid_dan_terenkripsi() {
        let crypto = StubCrypto;
        let config = json!({
            "host": "smtp.corp.local",
            "port": 25,
            "from_email": "noreply@corp.local",
            "password": "s3cret"
        });
        let validated = validate_channel(&crypto, "smtp_email", &config, &["alert.firing".to_owned()])
            .expect("smtp valid");
        assert!(validated.summary["has_password"].as_bool().unwrap());
        assert!(validated.summary.get("password").is_none(), "secret tidak boleh di summary");
        assert!(validated.config_encrypted["enc"].is_string());
        assert_ne!(
            validated.config_encrypted["enc"].as_str().unwrap(),
            config.to_string(),
            "ciphertext tidak menyimpan plaintext"
        );
    }

    #[test]
    fn smtp_host_dengan_scheme_ditolak() {
        let crypto = StubCrypto;
        let config = json!({ "host": "http://smtp.corp.local", "from_email": "a@b.co" });
        assert!(validate_channel(&crypto, "SMTP_EMAIL", &config, &[]).is_err());
    }

    #[test]
    fn telegram_wajib_token_chat() {
        let crypto = StubCrypto;
        assert!(validate_channel(&crypto, "TELEGRAM", &json!({ "bot_token": "12" }), &[]).is_err());
        assert!(validate_channel(&crypto, "TELEGRAM", &json!({ "bot_token": "abc", "chat_id": "-100" }), &[]).is_ok());
        assert!(validate_channel(&crypto, "TELEGRAM", &json!({ "bot_token": "a b", "chat_id": "-100" }), &[]).is_err());
    }

    #[test]
    fn webhook_url_keamanan() {
        let crypto = StubCrypto;
        assert!(validate_channel(&crypto, "WEBHOOK", &json!({ "url": "https://hooks.corp.local/abc" }), &[]).is_ok());
        assert!(validate_channel(&crypto, "WEBHOOK", &json!({ "url": "ftp://hooks.corp.local" }), &[]).is_err());
        assert!(validate_channel(&crypto, "WEBHOOK", &json!({ "url": "https://user:pass@hooks.local" }), &[]).is_err());
        assert!(validate_channel(&crypto, "WEBHOOK", &json!({ "url": "https://h.local x" }), &[]).is_err());
    }

    #[test]
    fn tipe_asing_dan_filter_berlebih() {
        let crypto = StubCrypto;
        assert!(validate_channel(&crypto, "SMS", &json!({}), &[]).is_err());
        let filter: Vec<String> = (0..33).map(|i| format!("EVENT_{i}")).collect();
        assert!(validate_channel(&crypto, "WEBHOOK", &json!({ "url": "https://x.local" }), &filter).is_err());
    }

    #[test]
    fn roundtrip_dekripsi() {
        let crypto = StubCrypto;
        let config = json!({
            "host": "smtp.corp.local",
            "from_email": "noreply@corp.local",
            "password": "rahasia"
        });
        let validated = validate_channel(&crypto, "SMTP_EMAIL", &config, &[]).unwrap();
        let decrypted = decrypt_config(&crypto, &validated.config_encrypted).unwrap();
        assert_eq!(decrypted["password"], json!("rahasia"));
    }
}
