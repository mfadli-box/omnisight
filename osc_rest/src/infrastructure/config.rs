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
}

impl AppConfig {
    /// Hanya boleh dipanggil saat startup — bukan di request path.
    pub fn from_env() -> Self {
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
        }
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}
