//! Broker log live (in-process broadcast) — sumber stream SSE
//! `/api/v1/infra/logs/stream` (Wave 2: live logs docker/nginx).
//!
//! Agent `infra_control` meng-push baris log via
//! `POST /api/v1/agents/logs` (HMAC) → `publish()` → seluruh subscriber SSE
//! milik company yang sama menerima event. Batas kapasitas channel 1024 —
//! subscriber lambat menerima `Lagged` (dilewati, bukan panic).

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

/// Kapasitas channel broadcast per broker.
const CHANNEL_CAPACITY: usize = 1024;

/// Satu event log live. `reference` = id stack docker / vhost nginx.
#[derive(Debug, Clone, Serialize)]
pub struct LogEvent {
    pub ts: DateTime<Utc>,
    /// `docker_stack` | `nginx_vhost`.
    pub scope: String,
    /// Tenant owner — subscriber hanya menerima event company-nya sendiri.
    pub company_id: Uuid,
    pub reference: Uuid,
    /// `DEBUG` | `INFO` | `WARN` | `ERROR` (dibatasi handler).
    pub level: String,
    /// Sumber baris (mis. `compose`, `agent`, `nginx`).
    pub source: String,
    /// Isi baris — sudah di-cap panjang di handler ingest.
    pub message: String,
}

/// Broker broadcast — di-clone via `Arc<LogBroker>` pada `AppState`.
#[derive(Clone)]
pub struct LogBroker {
    tx: Arc<broadcast::Sender<LogEvent>>,
}

impl LogBroker {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        Self { tx: Arc::new(tx) }
    }

    /// Publish event; tanpa subscriber = event dibuang (tidak error).
    pub fn publish(&self, event: LogEvent) {
        // Err hanya saat tidak ada receiver — bukan kondisi galat.
        let _ = self.tx.send(event);
    }

    /// Berlangganan stream (receiver broadcast; siap dipakai SSE).
    pub fn subscribe(&self) -> broadcast::Receiver<LogEvent> {
        self.tx.subscribe()
    }
}

impl Default for LogBroker {
    fn default() -> Self {
        Self::new()
    }
}
