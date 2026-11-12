//! Rate limiter in-memory per-kunci (W1: percobaan MFA gagal per user).
//! Window geser sederhana dengan lockout sementara — distribusi penuh
//! (Redis) menyusul bersama sesi DB-backed di Wave berikutnya.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::domain::error::DomainError;

struct Entry {
    failures: u32,
    window_start: Instant,
    locked_until: Option<Instant>,
}

/// Limiter konfigurabel (default: 5 kegagalan / 15 menit → lockout 15 menit).
pub struct RateLimiter {
    inner: Mutex<HashMap<String, Entry>>,
    max_failures: u32,
    window: Duration,
    lockout: Duration,
}

impl RateLimiter {
    pub fn new(max_failures: u32, window: Duration, lockout: Duration) -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            max_failures,
            window,
            lockout,
        }
    }

    /// Gate: tolak bila kunci sedang terkunci.
    pub fn gate(&self, key: &str) -> Result<(), DomainError> {
        let mut map = self.locked();
        if let Some(entry) = map.get_mut(key) {
            if let Some(until) = entry.locked_until {
                if Instant::now() < until {
                    return Err(DomainError::RateLimited);
                }
                // Lockout selesai → reset penuh.
                *entry = Entry {
                    failures: 0,
                    window_start: Instant::now(),
                    locked_until: None,
                };
            }
            if entry.window_start.elapsed() > self.window {
                entry.failures = 0;
                entry.window_start = Instant::now();
            }
        }
        Ok(())
    }

    /// Catat kegagalan; bila ambih tercapai → kunci sementara.
    pub fn register_failure(&self, key: &str) {
        let mut map = self.locked();
        let entry = map.entry(key.to_owned()).or_insert_with(|| Entry {
            failures: 0,
            window_start: Instant::now(),
            locked_until: None,
        });
        if entry.window_start.elapsed() > self.window {
            entry.failures = 0;
            entry.window_start = Instant::now();
        }
        entry.failures += 1;
        if entry.failures >= self.max_failures {
            entry.locked_until = Some(Instant::now() + self.lockout);
        }
    }

    /// Hapus state kunci (verifikasi sukses / reset admin).
    pub fn clear(&self, key: &str) {
        self.locked().remove(key);
    }

    fn locked(&self) -> std::sync::MutexGuard<'_, HashMap<String, Entry>> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn limiter_mengunci_setelah_batas_kegagalan() {
        let limiter = RateLimiter::new(5, Duration::from_secs(60), Duration::from_secs(60));
        for _ in 0..5 {
            assert!(limiter.gate("user").is_ok());
            limiter.register_failure("user");
        }
        assert!(matches!(limiter.gate("user"), Err(DomainError::RateLimited)));
        // Kunci lain tidak terdampak.
        assert!(limiter.gate("lain").is_ok());
        limiter.clear("user");
        assert!(limiter.gate("user").is_ok());
    }
}
