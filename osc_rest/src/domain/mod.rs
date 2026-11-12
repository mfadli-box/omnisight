//! Layer paling dalam — entitas, error domain, dan port (trait).
//!
//! ATURAN: TIDAK BOLEH meng-import `axum`, `sqlx`, `aws_sdk_*`, atau crate
//! file-format (calamine/rust_xlsxwriter). Dependensi hanya std + derive
//! framework-agnostic (thiserror/serde bila diperlukan).

pub mod error;
pub mod filter;
pub mod model;
pub mod ports;
