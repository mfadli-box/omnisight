//! HRIS ASMX client (server-to-server) — reengineering.md bab 5.1–5.2:
//!
//! - Template URL `hris_login_url` (`{\(U}` → username, `{\)P}` → password,
//!   keduanya percent-encoded; plaintext tidak pernah disimpan/dilog).
//! - Anti-SSRF: host wajib IP-literal dalam allowlist CIDR intranet ATAU
//!   hostname dalam allowlist deployment; redirect TIDAK diikuti.
//! - Batas body 64 KB (streaming), timeout connect 3 s / total 8 s.
//! - Circuit breaker: 5 kegagalan dalam 30 s → OPEN 60 s → HALF-OPEN (1 probe).
//!   Respons `0|…|NONE` BUKAN kegagalan (upstream sehat).
//! - Parser XML `quick-xml` non-DTD: `<!DOCTYPE` / entity ref → ditolak.

use std::collections::VecDeque;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::json;

use crate::domain::error::DomainError;
use crate::domain::model::HrisDecision;

/// Batas body respons HRIS (bab 5.1 poin 2).
pub const MAX_HRIS_BODY: usize = 64 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(8);
/// 5 kegagalan …
const FAILURE_THRESHOLD: usize = 5;
/// … dalam 30 detik …
const FAILURE_WINDOW: Duration = Duration::from_secs(30);
/// … → OPEN selama 60 detik.
const OPEN_COOLDOWN: Duration = Duration::from_secs(60);

/// Placeholder template sesuai blueprint (dengan backslash literal).
const PLACEHOLDER_USER: &str = r"{\(U}";
const PLACEHOLDER_PASSWORD: &str = r"{\)P}";

/// State machine circuit breaker (per client — satu host HRIS per company
/// template, agregasi per-proses cukup untuk Wave 1).
#[derive(Debug)]
struct BreakerState {
    failures: VecDeque<Instant>,
    open_until: Option<Instant>,
    probe_in_flight: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BreakerStatus {
    Closed,
    HalfOpen,
    Open,
}

impl BreakerState {
    fn new() -> Self {
        Self {
            failures: VecDeque::new(),
            open_until: None,
            probe_in_flight: false,
        }
    }

    fn status(&mut self) -> BreakerStatus {
        let now = Instant::now();
        if let Some(until) = self.open_until {
            if now < until {
                return BreakerStatus::Open;
            }
            // Cooldown selesai → HALF-OPEN: izinkan tepat satu probe.
            self.open_until = None;
            self.probe_in_flight = true;
            return BreakerStatus::HalfOpen;
        }
        if self.probe_in_flight {
            return BreakerStatus::HalfOpen;
        }
        BreakerStatus::Closed
    }

    fn prune(&mut self) {
        let now = Instant::now();
        while let Some(front) = self.failures.front() {
            if now.duration_since(*front) > FAILURE_WINDOW {
                self.failures.pop_front();
            } else {
                break;
            }
        }
    }

    fn record_failure(&mut self) -> BreakerStatus {
        let status_before = self.status();
        if status_before == BreakerStatus::HalfOpen {
            // Probe gagal → kembali OPEN penuh.
            self.open_until = Some(Instant::now() + OPEN_COOLDOWN);
            self.probe_in_flight = false;
            self.failures.clear();
            return BreakerStatus::Open;
        }
        self.prune();
        self.failures.push_back(Instant::now());
        if self.failures.len() >= FAILURE_THRESHOLD {
            self.open_until = Some(Instant::now() + OPEN_COOLDOWN);
            self.failures.clear();
            self.probe_in_flight = false;
            BreakerStatus::Open
        } else {
            BreakerStatus::Closed
        }
    }

    fn record_success(&mut self) {
        self.failures.clear();
        self.open_until = None;
        self.probe_in_flight = false;
    }
}

/// Klien HRIS — satu instance dibagikan seluruh handler (dibangun di startup).
pub struct HrisClient {
    http: reqwest::Client,
    allowlist_cidrs: Vec<cidr_entry::Cidr>,
    allowlist_hosts: Vec<String>,
    breaker: Mutex<BreakerState>,
}

/// Entri allowlist CIDR (IPv4 saja; IPv6 literal ditangani exact-match).
mod cidr_entry {
    #[derive(Debug, Clone, Copy)]
    pub struct Cidr {
        pub addr: u32,
        pub bits: u32,
    }

    impl Cidr {
        pub fn parse(raw: &str) -> Option<Self> {
            let (ip, prefix) = raw.split_once('/')?;
            let prefix: u32 = prefix.parse().ok()?;
            let addr = parse_ipv4(ip)?;
            if prefix > 32 {
                return None;
            }
            Some(Self {
                addr: addr & mask(prefix),
                bits: prefix,
            })
        }

        pub fn contains(&self, addr: u32) -> bool {
            (addr & mask(self.bits)) == self.addr
        }
    }

    fn mask(bits: u32) -> u32 {
        if bits == 0 {
            0
        } else {
            u32::MAX << (32 - bits)
        }
    }

    /// Parser IPv4 murni std — tanpa dependensi tambahan.
    pub fn parse_ipv4(raw: &str) -> Option<u32> {
        let octets: Vec<u8> = raw
            .split('.')
            .map(|part| part.parse::<u8>().ok())
            .collect::<Option<_>>()?;
        if octets.len() != 4 {
            return None;
        }
        Some(u32::from_be_bytes([
            octets[0], octets[1], octets[2], octets[3],
        ]))
    }
}

impl HrisClient {
    /// Bangun klien dari konfigurasi allowlist (dipisah koma).
    pub fn new(allowlist_cidrs: &str, allowlist_hosts: &str) -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(TOTAL_TIMEOUT)
            // Anti-SSRF: redirect TIDAK diikuti (3xx = respons utuh → gagal
            // status non-200; tidak ada kesempatan bypass allowlist).
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap_or_default();

        let cidrs = allowlist_cidrs
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .filter_map(cidr_entry::Cidr::parse)
            .collect::<Vec<_>>();
        if cidrs.is_empty() {
            tracing::warn!("HRIS_ALLOWLIST_CIDRS kosong/tidak valid — semua host ditolak");
        }

        Self {
            http,
            allowlist_cidrs: cidrs,
            allowlist_hosts: allowlist_hosts
                .split(',')
                .map(|s| s.trim().to_ascii_lowercase())
                .filter(|s| !s.is_empty())
                .collect(),
            breaker: Mutex::new(BreakerState::new()),
        }
    }

    /// Status breaker saat ini (diagnostik + unit test).
    #[allow(dead_code)] // konsumen: diagnostik admin & unit test
    pub fn breaker_status(&self) -> BreakerStatus {
        self.locked().status()
    }

    fn locked(&self) -> std::sync::MutexGuard<'_, BreakerState> {
        // Mutex poisoning hanya terjadi bila thread lain panic di kritikal
        // section — state breaker boleh di-reset aman.
        self.breaker.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Jalankan login HRIS penuh: template → SSRF check → GET → cap → parse.
    /// Kegagalan infrastruktur menaikkan breaker; `0|` tidak.
    pub async fn login(
        &self,
        template_url: &str,
        username: &str,
        password: &str,
    ) -> Result<HrisDecision, DomainError> {
        // 1) Circuit breaker gate (open → tanpa koneksi keluar).
        match self.locked().status() {
            BreakerStatus::Open => {
                tracing::warn!("circuit breaker HRIS OPEN — request ditolak cepat");
                return Err(DomainError::Upstream("circuit open".into()));
            }
            BreakerStatus::HalfOpen => {
                tracing::info!("circuit breaker HRIS HALF-OPEN — percobaan probe");
            }
            BreakerStatus::Closed => {}
        }

        // 2) Substitusi template + validasi anti-SSRF.
        let url = self.build_url(template_url, username, password)?;
        let host = url.host_str().unwrap_or_default().to_owned();

        // 3) GET server-to-server. URL lengkap TIDAK PERNAH di-log —
        //    hanya host allowlisted (sensor uPaswd tetap menyala global).
        tracing::info!(hris_host = %host, "login HRIS attempt");
        let response = match self.http.get(url.clone()).send().await {
            Ok(response) => response,
            Err(err) => {
                self.record_failure_and_log("http", &err.to_string());
                return Err(DomainError::Upstream("hris request gagal".into()));
            }
        };

        if !response.status().is_success() {
            self.record_failure_and_log("status", response.status().as_str());
            return Err(DomainError::Upstream(format!(
                "hris status {}",
                response.status().as_u16()
            )));
        }

        // 4) Streaming dengan cap 64 KB (anti DoS body raksasa).
        let body = match read_capped(response, MAX_HRIS_BODY).await {
            Ok(body) => body,
            Err(err) => {
                self.record_failure_and_log("body", &err);
                return Err(DomainError::Upstream(err));
            }
        };

        // 5) Parse XML `<string>…</string>` — kegagalan parse = kegagalan
        //    upstream (masuk metrik breaker).
        let value = match parse_asmx_string(&body) {
            Ok(value) => value,
            Err(err) => {
                self.record_failure_and_log("xml", &err.to_string());
                return Err(err);
            }
        };

        // 6) Kontrak payload (bab 5.2). `0|` = keputusan bisnis upstream
        //    → BUKAN kegagalan circuit; `1|` sukses; lainnya invalid.
        if let Some(profile) = value.strip_prefix("1|") {
            self.locked().record_success();
            tracing::info!(hris_host = %host, "login HRIS sukses");
            return Ok(HrisDecision::Accepted {
                profile: profile.to_owned(),
            });
        }
        if value.starts_with("0|") {
            self.locked().record_success();
            tracing::info!(hris_host = %host, "login HRIS ditolak upstream");
            return Ok(HrisDecision::Rejected);
        }

        self.record_failure_and_log("payload", &value.chars().take(24).collect::<String>());
        Err(DomainError::Upstream("hris payload tidak dikenal".into()))
    }

    fn record_failure_and_log(&self, kind: &str, detail: &str) {
        // Detail hanya masuk log ter-redaksi; klien menerima pesan generik.
        tracing::warn!(
            kind,
            detail = %crate::infrastructure::logging::redact(detail),
            "HRIS upstream gagal — breaker diperbarui"
        );
        let status = self.locked().record_failure();
        if status == BreakerStatus::Open {
            tracing::error!(
                threshold = FAILURE_THRESHOLD,
                window_s = FAILURE_WINDOW.as_secs(),
                cooldown_s = OPEN_COOLDOWN.as_secs(),
                "circuit breaker HRIS terbuka (60 s)"
            );
        }
    }

    /// Substitusi template + validasi URL & host (anti-SSRF).
    fn build_url(
        &self,
        template_url: &str,
        username: &str,
        password: &str,
    ) -> Result<reqwest::Url, DomainError> {
        if !template_url.contains(PLACEHOLDER_USER) || !template_url.contains(PLACEHOLDER_PASSWORD)
        {
            return Err(DomainError::Unavailable(
                "hris_login_url template tidak memuat placeholder uLogin/uPaswd".into(),
            ));
        }
        let raw = template_url
            .replace(PLACEHOLDER_USER, &percent_encode(username))
            .replace(PLACEHOLDER_PASSWORD, &percent_encode(password));

        let url = reqwest::Url::parse(&raw)
            .map_err(|_| DomainError::Unavailable("hris_login_url tidak dapat diparse".into()))?;

        if !matches!(url.scheme(), "http" | "https") {
            return Err(DomainError::Unavailable("skema HRIS harus http/https".into()));
        }
        let host = url.host_str().unwrap_or_default();
        if host.is_empty() || !self.host_allowed(host) {
            tracing::warn!(host_allowlisted = false, "target HRIS di luar allowlist (SSRF)");
            return Err(DomainError::Unavailable(
                "host HRIS di luar allowlist intranet".into(),
            ));
        }
        Ok(url)
    }

    /// Host diizinkan bila: IP literal dalam CIDR intranet, ATAU hostname
    /// (suffix exact per komponen) terdaftar di allowlist deployment.
    /// Hostname yang butuh DNS resolution tidak pernah di-resolve di sini —
    /// mencegah DNS rebinding; wajib allowlist eksplisit.
    fn host_allowed(&self, host: &str) -> bool {
        let host_lower = host.trim_end_matches('.').to_ascii_lowercase();

        // 1) IP literal → cek CIDR.
        if let Ok(ip) = host_lower.parse::<IpAddr>() {
            return match ip {
                IpAddr::V4(v4) => {
                    let raw = u32::from_be_bytes(v4.octets());
                    self.allowlist_cidrs
                        .iter()
                        .any(|cidr| cidr.contains(raw))
                }
                // IPv6: hanya loopback eksplisit (allowlist CIDR W1 = IPv4).
                IpAddr::V6(_) => host_lower == "::1",
            };
        }

        // 2) Hostname → suffix match exact component.
        self.allowlist_hosts
            .iter()
            .any(|allowed| host_lower == *allowed || host_lower.ends_with(&format!(".{allowed}")))
    }
}

/// Baca body dengan batas keras — lebih besar = error upstream.
async fn read_capped(response: reqwest::Response, cap: usize) -> Result<Vec<u8>, String> {
    let mut out: Vec<u8> = Vec::new();
    let mut response = response;
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if out.len() + chunk.len() > cap {
                    return Err(format!("body HRIS melebihi {cap} byte"));
                }
                out.extend_from_slice(&chunk);
            }
            Ok(None) => return Ok(out),
            Err(err) => return Err(format!("baca body HRIS gagal: {err}")),
        }
    }
}

/// Parse XML ASMX: ambil nilai elemen `<string …>…</string>` (namespace-
/// agnostic via local name). Non-DTD/XXE: DocType & GeneralRef ditolak;
/// entity expansion tidak pernah di-expand. Tanpa `.unwrap()` di jalur ini.
pub fn parse_asmx_string(body: &[u8]) -> Result<String, DomainError> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_reader(body);
    reader.config_mut().check_end_names = true;

    let mut in_string = false;
    let mut out: Vec<u8> = Vec::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(start)) => {
                let name = start.name();
                let local = name.local_name();
                if local.as_ref() == b"string" {
                    in_string = true;
                    out.clear();
                }
            }
            Ok(Event::Text(text)) => {
                if in_string {
                    let unescaped = text
                        .unescape()
                        .map_err(|e| DomainError::Upstream(format!("xml escape invalid: {e}")))?;
                    out.extend_from_slice(unescaped.as_bytes());
                }
            }
            Ok(Event::End(end)) => {
                let end_name = end.name();
                if end_name.local_name().as_ref() == b"string" && in_string {
                    break;
                }
            }
            // XXE / entity expansion ditolak keras (bab 5.2): referensi
            // entitas tetap mentah pada Text → `unescape()` gagal → error.
            Ok(Event::DocType(_)) => {
                return Err(DomainError::Upstream(
                    "XML HRIS memuat DOCTYPE — ditolak".into(),
                ));
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(err) => {
                return Err(DomainError::Upstream(format!("XML HRIS parse gagal: {err}")));
            }
        }
    }

    if !in_string {
        return Err(DomainError::Upstream(
            "elemen <string> tidak ditemukan pada respons HRIS".into(),
        ));
    }
    String::from_utf8(out)
        .map_err(|_| DomainError::Upstream("XML HRIS bukan UTF-8".into()))
}

/// Percent-encode komponen query (uLogin/uPaswd) — subset aman RFC 3986.
fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Diagnostik JSON (endpoint admin/health, tanpa secret).
#[allow(dead_code)] // konsumen: endpoint health Wave 2
pub fn breaker_diagnostics(client: &HrisClient) -> serde_json::Value {
    json!({
        "breaker_status": format!("{:?}", client.breaker_status()),
    })
}

impl crate::domain::ports::HrisGateway for HrisClient {
    async fn hris_login(
        &self,
        template_url: &str,
        username: &str,
        password: &str,
    ) -> Result<HrisDecision, DomainError> {
        HrisClient::login(self, template_url, username, password).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> HrisClient {
        HrisClient::new(
            "127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
            "hris.internal.corp",
        )
    }

    #[test]
    fn template_substitusi_dan_encoding() {
        let c = client();
        let url = c
            .build_url(
                r"http://10.1.2.3/hris/check?uLogin={\(U}&uPaswd={\)P}",
                "budi",
                "pa/ss word",
            )
            .unwrap();
        assert_eq!(
            url.as_str(),
            "http://10.1.2.3/hris/check?uLogin=budi&uPaswd=pa%2Fss%20word"
        );
    }

    #[test]
    fn ssrf_target_luar_allowlist_ditolak() {
        let c = client();
        let template = r"http://169.254.169.254/latest?u={\(U}&p={\)P}";
        assert!(c.build_url(template, "x", "y").is_err(), "metadata IP ditolak");

        let template_dns = r"http://evil.example.com/?u={\(U}&p={\)P}";
        assert!(c.build_url(template_dns, "x", "y").is_err(), "DNS luar allowlist ditolak");

        let template_intranet = r"http://hris.internal.corp/cek?u={\(U}&p={\)P}";
        assert!(c.build_url(template_intranet, "x", "y").is_ok());
    }

    #[test]
    fn template_tanpa_placeholder_ditolak() {
        let c = client();
        assert!(c.build_url("http://10.0.0.1/statik", "u", "p").is_err());
    }

    #[test]
    fn parser_xml_asmx_mengambil_nilai_string() {
        let body = br#"<?xml version="1.0" encoding="utf-8"?>
<string xmlns="http://tempuri.org/">1|Budi Santoso|budi@corp.id|IT</string>"#;
        let value = parse_asmx_string(body).unwrap();
        assert_eq!(value, "1|Budi Santoso|budi@corp.id|IT");
    }

    #[test]
    fn parser_menolak_dtd_dan_entity_expansion() {
        let xxe = br#"<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><string>&xxe;</string>"#;
        assert!(parse_asmx_string(xxe).is_err(), "DOCTYPE ditolak");

        let bomb = br#"<string>&boom;</string>"#;
        assert!(parse_asmx_string(bomb).is_err(), "entity ref ditolak");
    }

    #[test]
    fn parser_menolak_body_bukan_xml() {
        assert!(parse_asmx_string(b"Portal HRIS sedang maintenance").is_err());
        assert!(parse_asmx_string(b"").is_err());
    }

    #[test]
    fn circuit_breaker_state_machine() {
        let c = client();
        // 4 kegagalan: masih Closed.
        for _ in 0..4 {
            assert_eq!(c.locked().record_failure(), BreakerStatus::Closed);
        }
        // Ke-5 membuka sirkuit.
        assert_eq!(c.locked().record_failure(), BreakerStatus::Open);
        assert_eq!(c.breaker_status(), BreakerStatus::Open);
        // Sukses menutup kembali.
        c.locked().record_success();
        assert_eq!(c.breaker_status(), BreakerStatus::Closed);
    }

    #[test]
    fn breaker_kegagalan_dalam_window_dan_reset() {
        let c = client();
        for _ in 0..FAILURE_THRESHOLD {
            c.locked().record_failure();
        }
        assert_eq!(c.breaker_status(), BreakerStatus::Open);
        c.locked().record_success();
        assert_eq!(c.locked().record_failure(), BreakerStatus::Closed);
    }
}
