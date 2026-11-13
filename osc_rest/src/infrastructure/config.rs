//! Konfigurasi runtime dari environment variables (12-factor).
//! Default selaras dengan root `docker-compose.yml` + `.env.example`.

/// Konfigurasi aplikasi — di-parse sekali saat startup.
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub rustfs_endpoint: String,
    pub rustfs_access_key: String,
    pub rustfs_secret_key: String,
    pub rustfs_bucket: String,
    /// Secret HMAC JWT (HS256). Nilai dev bawaan hanya untuk lokal —
    /// startup mencatat peringatan bila dipakai.
    pub jwt_secret: String,
    /// KEK Envelope Encryption (hex 64 char = 32 byte) —
    /// env `APP_MASTER_ENCRYPTION_KEY`.
    pub master_key_hex: String,
    /// Allowlist CIDR target HRIS (anti-SSRF) — env `HRIS_ALLOWLIST_CIDRS`.
    pub hris_allowlist_cidrs: String,
    /// Allowlist hostname/domain HRIS — env `HRIS_ALLOWLIST_HOSTS`.
    pub hris_allowlist_hosts: String,
    /// Masa berlaku access token (jam).
    pub access_token_hours: i64,

    // --- Wave 3: SecOps & PAM ---
    /// Bucket privat rekaman sesi PAM — env `RUSTFS_BUCKET_PAM`.
    pub rustfs_bucket_pam: String,
    /// TTL ephemeral WS ticket PAM (detik; clamp 30–600) —
    /// env `PAM_TICKET_TTL_SECONDS`.
    pub pam_ticket_ttl_seconds: i64,
    /// Batas ukuran rekaman sesi PAM per upload (byte) —
    /// env `PAM_RECORDING_MAX_MB` (default 100 MB).
    pub pam_recording_max_bytes: usize,
    /// Retensi snapshot metrik tier 1 menit (hari, clamp 30–90) —
    /// env `RETENTION_METRIC_DAYS`.
    pub retention_metric_days: i32,
    /// Retensi snapshot metrik tier 10 menit (hari) — env `RETENTION_METRIC_TIER10_DAYS`.
    pub retention_metric_tier10_days: i32,
    /// Retensi raw heartbeat uptime (hari) — env `RETENTION_HEARTBEAT_DAYS`.
    pub retention_heartbeat_days: i32,
    /// Retensi event SecOps (FIM/alert/CVE/compliance, hari) — env `RETENTION_SECOPS_DAYS`.
    pub retention_secops_days: i32,
    /// CSV `agent_id` yang boleh memicu purge retensi (deny-by-default) —
    /// env `RETENTION_PURGE_AGENT_IDS`.
    pub retention_purge_agent_ids: String,
}

impl AppConfig {
    /// Hanya boleh dipanggil saat startup — bukan di request path.
    pub fn from_env() -> Self {
        let jwt_secret = env_or("JWT_SECRET", "dev-only-osc-rest-jwt-secret-change-me");
        if jwt_secret.starts_with("dev-only") {
            tracing::warn!("JWT_SECRET memakai nilai dev — WAJIB diganti di deployment");
        }
        Self {
            host: env_or("REST_HOST", "0.0.0.0"),
            port: env_or("REST_PORT", "8000").parse().unwrap_or(8000),
            database_url: env_or(
                "DATABASE_URL",
                "postgresql://dbe:password_osc_dbe@localhost:36661/osc?sslmode=disable",
            ),
            rustfs_endpoint: env_or("RUSTFS_ENDPOINT", "http://localhost:9000"),
            rustfs_access_key: env_or("RUSTFS_ACCESS_KEY", "oscadmin"),
            rustfs_secret_key: env_or("RUSTFS_SECRET_KEY", "password_osc_rustfs"),
            rustfs_bucket: env_or("RUSTFS_BUCKET", "osc"),
            jwt_secret,
            master_key_hex: env_or(
                "APP_MASTER_ENCRYPTION_KEY",
                "dev-only-osc-rest-kek-change-me-0000000000000000000000000000",
            ),
            hris_allowlist_cidrs: env_or(
                "HRIS_ALLOWLIST_CIDRS",
                "127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128",
            ),
            hris_allowlist_hosts: env_or("HRIS_ALLOWLIST_HOSTS", ""),
            access_token_hours: env_or("ACCESS_TOKEN_HOURS", "12").parse().unwrap_or(12),
            rustfs_bucket_pam: env_or("RUSTFS_BUCKET_PAM", "osc-pam-recordings"),
            pam_ticket_ttl_seconds: env_or("PAM_TICKET_TTL_SECONDS", "120")
                .parse()
                .map(|v: i64| v.clamp(30, 600))
                .unwrap_or(120),
            pam_recording_max_bytes: env_or("PAM_RECORDING_MAX_MB", "100")
                .parse()
                .map(|mb: usize| mb.clamp(1, 512) * 1024 * 1024)
                .unwrap_or(100 * 1024 * 1024),
            retention_metric_days: env_or("RETENTION_METRIC_DAYS", "30")
                .parse()
                .map(|v: i32| v.clamp(30, 90))
                .unwrap_or(30),
            retention_metric_tier10_days: env_or("RETENTION_METRIC_TIER10_DAYS", "90")
                .parse()
                .map(|v: i32| v.clamp(90, 365))
                .unwrap_or(90),
            retention_heartbeat_days: env_or("RETENTION_HEARTBEAT_DAYS", "30")
                .parse()
                .map(|v: i32| v.clamp(7, 90))
                .unwrap_or(30),
            retention_secops_days: env_or("RETENTION_SECOPS_DAYS", "365")
                .parse()
                .map(|v: i32| v.clamp(30, 1095))
                .unwrap_or(365),
            retention_purge_agent_ids: env_or("RETENTION_PURGE_AGENT_IDS", ""),
        }
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}
