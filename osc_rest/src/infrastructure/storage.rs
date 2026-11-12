//! Adapter RustFS (S3-compatible object storage) via aws-sdk-s3.
//!
//! Seluruh operasi object storage WAJIB melalui tipe ini — jangan pernah
//! membocorkan `Client` SDK mentah ke layer application/presentation.

use aws_sdk_s3::Client;
use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};

use crate::domain::error::DomainError;
use crate::domain::ports::StorageProbe;

/// Wrapper aws-sdk-s3 yang menunjuk ke RustFS (endpoint dapat di-override).
#[derive(Clone)]
pub struct RustfsClient {
    client: Client,
    bucket: String,
}

impl RustfsClient {
    pub fn new(endpoint: &str, access_key: &str, secret_key: &str, bucket: &str) -> Self {
        let config = aws_sdk_s3::config::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            // SigV4 wajib memiliki region; RustFS tidak memvalidasi nilainya.
            .region(Region::new("us-east-1"))
            .endpoint_url(endpoint)
            .credentials_provider(Credentials::new(
                access_key,
                secret_key,
                None,              // session token (tidak dipakai)
                None,              // expiry (kredensial statis, tanpa expired)
                "osc-rest-static", // provider name
            ))
            .build();

        Self {
            client: Client::from_conf(config),
            bucket: bucket.to_owned(),
        }
    }

    /// Nama bucket target (dipakai key pattern di fase excel).
    #[allow(dead_code)] // dipakai mulai fase excel (key naming)
    pub fn bucket(&self) -> &str {
        &self.bucket
    }

    /// `HeadBucket` — verifikasi bucket spesifik ada & dapat diakses.
    /// Dipakai diagnostik startup dan pipeline excel di fase berikutnya.
    pub async fn head_bucket(&self) -> Result<(), DomainError> {
        self.client
            .head_bucket()
            .bucket(self.bucket.clone())
            .send()
            .await
            .map(|_| ())
            .map_err(|e| DomainError::Unavailable(format!("rustfs probe gagal: {e}")))
    }
}

impl StorageProbe for RustfsClient {
    /// Readiness storage: layanan RustFS terjangkau + kredensial valid
    /// (`ListBuckets` — murah dan tidak tergantung keberadaan bucket).
    /// Verifikasi per-bucket (`head_bucket`) dipakai pipeline excel nanti.
    async fn probe(&self) -> Result<(), DomainError> {
        self.client
            .list_buckets()
            .send()
            .await
            .map(|_| ())
            .map_err(|e| DomainError::Unavailable(format!("rustfs probe gagal: {e}")))
    }
}
