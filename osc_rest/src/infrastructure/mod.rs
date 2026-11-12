//! Adapter teknologi — implementasi port `domain/` + konfigurasi runtime.
//! Layer ini yang boleh menyentuh sqlx / aws-sdk-s3 / std env.

pub mod config;
pub mod crypto;
pub mod hris;
pub mod logging;
pub mod persistence;
pub mod ratelimit;
pub mod storage;
pub mod store;

/// Token reset MFA sekali pakai (in-memory, TTL pendek) —
/// penggantinya tabel DB + dispatcher email menyusul di Wave 2
/// (`flow_worker_agent`, bab 5.8).
pub mod mfa_reset {
    use std::collections::HashMap;
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    use uuid::Uuid;

    const RESET_TTL: Duration = Duration::from_secs(600);

    #[derive(Default)]
    pub struct MfaResetStore {
        inner: Mutex<HashMap<String, (Uuid, Instant)>>,
    }

    impl MfaResetStore {
        /// Terbitkan token (kembalikan plaintext; simpan hash).
        pub fn issue(&self, user_id: Uuid) -> String {
            let token = crate::infrastructure::crypto::random_hex(24);
            let hash = Self::hash(&token);
            self.locked()
                .insert(hash, (user_id, Instant::now() + RESET_TTL));
            token
        }

        /// Konsumsi token sekali pakai → user id (bila valid).
        pub fn consume(&self, token: &str) -> Option<Uuid> {
            let hash = Self::hash(token);
            let mut map = self.locked();
            let now = Instant::now();
            map.retain(|_, (_, expiry)| *expiry > now);
            map.remove(&hash).map(|(user, _)| user)
        }

        fn hash(token: &str) -> String {
            // Hash non-kripto ok di sini: token acak 192-bit, TTL 10 menit,
            // dan map hidup in-process — hash hanya mencegah shoulder-surf
            // pada dump memori. Ganti Argon2id bila pindah ke DB.
            format!("rst_{:x}", md_like(token.as_bytes()))
        }

        fn locked(&self) -> std::sync::MutexGuard<'_, HashMap<String, (Uuid, Instant)>> {
            self.inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
        }
    }

    /// FNV-1a 64-bit — cukup untuk tujuan di atas.
    fn md_like(bytes: &[u8]) -> u64 {
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash
    }
}
