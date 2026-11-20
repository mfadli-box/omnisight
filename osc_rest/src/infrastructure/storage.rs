use std::time::Duration;

use aws_credential_types::Credentials;
use aws_sdk_s3::{Client, config::Region, primitives::ByteStream};

#[derive(Clone)]
pub struct RustFsStorage {
    client: Client,
    bucket: String,
}

impl RustFsStorage {
    pub async fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let endpoint = std::env::var("RUSTFS_ENDPOINT")?;
        let bucket = std::env::var("RUSTFS_BUCKET")?;
        let access = std::env::var("RUSTFS_ACCESS_KEY")?;
        let secret = std::env::var("RUSTFS_SECRET_KEY")?;
        let region = std::env::var("RUSTFS_REGION").unwrap_or_else(|_| "us-east-1".into());
        let credentials = Credentials::new(access, secret, None, None, "omnisight-rustfs");
        let shared = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region(Region::new(region))
            .credentials_provider(credentials)
            .timeout_config(
                aws_sdk_s3::config::timeout::TimeoutConfig::builder()
                    .connect_timeout(Duration::from_secs(3))
                    .operation_timeout(Duration::from_secs(30))
                    .build(),
            )
            .endpoint_url(endpoint)
            .load()
            .await;
        let config = aws_sdk_s3::config::Builder::from(&shared)
            .force_path_style(true)
            .build();
        let client = Client::from_conf(config);
        if client.head_bucket().bucket(&bucket).send().await.is_err() {
            client.create_bucket().bucket(&bucket).send().await?;
        }
        Ok(Self { client, bucket })
    }

    pub async fn put(&self, key: &str, bytes: Vec<u8>, content_type: &str) -> Result<(), String> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .content_type(content_type)
            .body(ByteStream::from(bytes))
            .send()
            .await
            .map(|_| ())
            .map_err(|_| "RustFS upload failed".to_owned())
    }

    pub async fn remove(&self, key: &str) {
        if self
            .client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .is_err()
        {
            tracing::warn!(event = "storage_rollback_cleanup_failed");
        }
    }

    pub async fn get(&self, key: &str) -> Result<Vec<u8>, String> {
        let result = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|_| "RustFS download failed".to_owned())?;
        if result
            .content_length()
            .is_some_and(|size| size > 64 * 1024 * 1024)
        {
            return Err("RustFS object exceeds download limit".to_owned());
        }
        let mut body = result.body;
        let mut bytes = Vec::new();
        let read = async {
            while let Some(chunk) = body.next().await {
                let chunk = chunk.map_err(|_| "RustFS download failed".to_owned())?;
                if bytes.len() + chunk.len() > 64 * 1024 * 1024 {
                    return Err("RustFS object exceeds download limit".to_owned());
                }
                bytes.extend_from_slice(&chunk);
            }
            Ok::<(), String>(())
        };
        tokio::time::timeout(Duration::from_secs(30), read)
            .await
            .map_err(|_| "RustFS download timed out".to_owned())??;
        Ok(bytes)
    }
}
