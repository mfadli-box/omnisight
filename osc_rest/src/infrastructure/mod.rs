//! Adapter teknologi — implementasi port `domain/` + konfigurasi runtime.
//! Layer ini yang boleh menyentuh sqlx / aws-sdk-s3 / std env.

pub mod config;
pub mod logging;
pub mod persistence;
pub mod storage;
