//! Orkestrasi use case — HANYA bergantung pada trait di `domain/`.
//! Dilarang meng-import axum/sqlx/aws_sdk/calamine di layer ini.

pub mod health;
