//! Usecase & orkestrasi bisnis — hanya bergantung pada port `domain/`
//! (generik static dispatch), TIDAK pada tipe infrastruktur konkret.

pub mod auth;
pub mod excel;
pub mod health;
pub mod mfa;
