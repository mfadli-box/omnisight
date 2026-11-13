//! Adapter RustFS (S3-compatible object storage) via aws-sdk-s3.
//!
//! Seluruh operasi object storage WAJIB melalui tipe ini — jangan pernah
//! membocorkan `Client` SDK mentah ke layer application/presentation.

use std::time::Duration;

use aws_sdk_s3::Client;
use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::primitives::ByteStream;

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
    pub fn bucket(&self) -> &str {
        &self.bucket
    }

    /// `PutObject` — unggah bytes (upload file W1, arsip excel async).
    pub async fn put_object(
        &self,
        key: &str,
        bytes: Vec<u8>,
        content_type: &str,
    ) -> Result<(), DomainError> {
        self.put_object_in(&self.bucket, key, bytes, content_type)
            .await
    }

    /// `PutObject` ke bucket eksplisit — pemisahan bucket privat
    /// (mis. rekaman PAM di `RUSTFS_BUCKET_PAM`, policy akses terpisah).
    pub async fn put_object_in(
        &self,
        bucket: &str,
        key: &str,
        bytes: Vec<u8>,
        content_type: &str,
    ) -> Result<(), DomainError> {
        self.client
            .put_object()
            .bucket(bucket)
            .key(key)
            .content_type(content_type)
            .body(ByteStream::from(bytes))
            .send()
            .await
            .map(|_| ())
            .map_err(|e| DomainError::Unavailable(format!("rustfs put gagal: {e}")))
    }

    /// `GetObject` — unduh penuh dengan batas keras (proxy download W1).
    #[allow(dead_code)] // konsumen: proxy download konten file (follow-up)
    pub async fn get_object(&self, key: &str, max_bytes: usize) -> Result<Vec<u8>, DomainError> {
        let object = self
            .client
            .get_object()
            .bucket(self.bucket.clone())
            .key(key)
            .send()
            .await
            .map_err(|e| DomainError::Unavailable(format!("rustfs get gagal: {e}")))?;

        let data = object
            .body
            .collect()
            .await
            .map_err(|e| DomainError::Unavailable(format!("rustfs stream gagal: {e}")))?
            .into_bytes();
        if data.len() > max_bytes {
            return Err(DomainError::Unavailable("objek melebihi batas unduh".into()));
        }
        Ok(data.to_vec())
    }

    /// Presigned GET URL berumur pendek (default 5 menit) —
    /// objek privat tidak pernah diekspos publik permanen.
    pub async fn presign_get(&self, key: &str, ttl: Duration) -> Result<String, DomainError> {
        self.presign_get_in(&self.bucket, key, ttl).await
    }

    /// Presigned GET pada bucket eksplisit (mis. bucket rekaman PAM).
    pub async fn presign_get_in(
        &self,
        bucket: &str,
        key: &str,
        ttl: Duration,
    ) -> Result<String, DomainError> {
        let presigning = PresigningConfig::expires_in(ttl)
            .map_err(|e| DomainError::Unavailable(format!("presign config gagal: {e}")))?;
        self.client
            .get_object()
            .bucket(bucket)
            .key(key)
            .presigned(presigning)
            .await
            .map(|req| req.uri().to_string())
            .map_err(|e| DomainError::Unavailable(format!("presign gagal: {e}")))
    }

    /// `HeadBucket` — verifikasi bucket spesifik ada & dapat diakses.
    /// Dipakai diagnostik startup dan pipeline excel di fase berikutnya.
    pub async fn head_bucket(&self) -> Result<(), DomainError> {
        self.head_bucket_named(&self.bucket).await
    }

    /// `HeadBucket` untuk nama bucket eksplisit (diagnostik bucket PAM).
    pub async fn head_bucket_named(&self, bucket: &str) -> Result<(), DomainError> {
        self.client
            .head_bucket()
            .bucket(bucket)
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
