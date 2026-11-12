//! State bersama handlers — hasil wiring `infrastructure/` saat startup.

use std::sync::Arc;

use crate::infrastructure::persistence::PgHealth;
use crate::infrastructure::storage::RustfsClient;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<PgHealth>,
    pub storage: Arc<RustfsClient>,
}
