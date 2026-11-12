//! HMAC-SHA256 (RFC 2104) + verifikasi tanda tangan agent `osc_auto`
//! (bab 5.8: HMAC per-request dengan anti-replay window ±30 detik).
//!
//! Implementasi manual di atas `sha2` (tanpa dependency baru): kunci > 64
//! byte di-hash dulu, lalu pad inner (0x36) / outer (0x5c) blok 64 byte.

use sha2::{Digest, Sha256};

/// Ukuran blok HMAC-SHA256 (byte).
const BLOCK_SIZE: usize = 64;

/// HMAC-SHA256 standar.
pub fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    // Normalisasi kunci: > block → hash; < block → pad nol.
    let mut normalized = [0u8; BLOCK_SIZE];
    if key.len() > BLOCK_SIZE {
        let digest: [u8; 32] = Sha256::digest(key).into();
        normalized[..32].copy_from_slice(&digest);
    } else {
        normalized[..key.len()].copy_from_slice(key);
    }

    let mut inner = Sha256::new();
    for byte in &normalized {
        inner.update([byte ^ 0x36]);
    }
    inner.update(message);
    let inner_digest = inner.finalize();

    let mut outer = Sha256::new();
    for byte in &normalized {
        outer.update([byte ^ 0x5c]);
    }
    outer.update(inner_digest);
    outer.finalize().into()
}

/// Perbandingan konstan-waktu (anti timing attack pada verifikasi signature).
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Jendela anti-replay tanda tangan agent (detik).
pub const REPLAY_WINDOW_SECS: i64 = 30;

/// Timestamp valid bila |now − ts| ≤ `REPLAY_WINDOW_SECS`.
pub fn timestamp_valid(ts: i64, now: i64) -> bool {
    (now - ts).abs() <= REPLAY_WINDOW_SECS
}

/// Kanonis pesan tanda tangan: `{ts}\n{method}\n{path}\n{sha256_hex(body)}` —
/// mengikat signature ke timestamp, verb, path, dan isi body.
pub fn signature_message(ts: i64, method: &str, path: &str, body_sha256_hex: &str) -> String {
    format!("{ts}\n{method}\n{path}\n{body_sha256_hex}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use data_encoding::HEXLOWER;

    /// Vektor RFC 4231 Test Case 2:
    /// key = "Jefe", data = "what do ya want for nothing?".
    #[test]
    fn rfc4231_test_case_2() {
        let out = hmac_sha256(b"Jefe", b"what do ya want for nothing?");
        assert_eq!(
            HEXLOWER.encode(&out),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }

    /// Vektor RFC 4231 Test Case 1: kunci 20x0x0b, data "Hi There".
    #[test]
    fn rfc4231_test_case_1() {
        let key = [0x0bu8; 20];
        let out = hmac_sha256(&key, b"Hi There");
        assert_eq!(
            HEXLOWER.encode(&out),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        )
    }

    /// Kunci > block size (RFC 4231 Test Case 6 — kunci 131 byte 0xaa).
    #[test]
    fn rfc4231_test_case_6() {
        let key = [0xaau8; 131];
        let out = hmac_sha256(&key, b"Test Using Larger Than Block-Size Key - Hash Key First");
        assert_eq!(
            HEXLOWER.encode(&out),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        )
    }

    #[test]
    fn perbandingan_konstan_waktu() {
        let a = [1u8, 2, 3];
        let b = [1u8, 2, 3];
        let c = [1u8, 2, 4];
        let d = [1u8, 2];
        assert!(constant_time_eq(&a, &b));
        assert!(!constant_time_eq(&a, &c));
        assert!(!constant_time_eq(&a, &d));
    }

    #[test]
    fn jendela_replay() {
        let now = 1_700_000_000;
        assert!(timestamp_valid(now, now));
        assert!(timestamp_valid(now - 30, now));
        assert!(timestamp_valid(now + 30, now));
        assert!(!timestamp_valid(now - 31, now));
        assert!(!timestamp_valid(now + 31, now));
    }

    #[test]
    fn kanonisasi_pesan() {
        assert_eq!(
            signature_message(5, "POST", "/api/v1/agents/metrics/ingest", "abc"),
            "5\nPOST\n/api/v1/agents/metrics/ingest\nabc"
        );
    }
}
