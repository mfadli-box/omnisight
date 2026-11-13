//! Observability: log JSON terstruktur + redaksi rahasia.
//!
//! Standar skill ai-rest:
//! - Log terstruktur JSON (siap dikonsumsi collector/SIEM), level via `RUST_LOG`.
//! - Token, password, dan secret TIDAK PERNAH tertulis apa adanya:
//!   `redact()` menutup nilai yang teregistrasi dari env + pola kredensial
//!   umum (`password=…`, `token=…`, `Bearer …`) sebelum pesan masuk log.
//!
//! Aturan pemakaian: SELURUH pesan log yang menyertakan teks dari luar
//! (error infrastruktur, payload klien) wajib melewati `redact()` —
//! titik pusatnya `AppError::internal()` di `presentation/error.rs`.

use std::sync::OnceLock;

use tracing_subscriber::EnvFilter;

/// Nilai rahasia yang teregistrasi saat startup (sekali), dipakai
/// `redact()` untuk menutup kemunculannya di pesan log.
static SECRETS: OnceLock<Vec<String>> = OnceLock::new();

/// Penanda hasil redaksi.
const MASK: &str = "[REDACTED]";

/// Pasang subscriber global JSON. Panggil TEPAT SEKALI di `main.rs`.
pub fn init() {
    register_secrets_from_env();

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .init();
}

/// Kumpulkan secret dari env yang layak disembunyikan: password DATABASE_URL,
/// `RUSTFS_SECRET_KEY`, `RUSTFS_ACCESS_KEY`. Nilai pendek (< 8 byte) tidak
/// diregistrasi agar redaksi tidak merusak pesan yang tidak bersangkutan.
fn register_secrets_from_env() {
    let mut values = Vec::new();

    if let Ok(url) = std::env::var("DATABASE_URL")
        && let Some(password) = password_from_database_url(&url)
    {
        values.push(password);
    }
    for key in ["RUSTFS_SECRET_KEY", "RUSTFS_ACCESS_KEY"] {
        if let Ok(value) = std::env::var(key) {
            values.push(value);
        }
    }

    let secrets: Vec<String> = values
        .into_iter()
        .filter(|value| value.len() >= 8)
        .collect();
    if !secrets.is_empty() {
        let _ = SECRETS.set(secrets);
    }
}

/// Ambil segmen password dari `postgresql://user:pass@host/db`.
/// Tanpa dependensi eksternal — cukup untuk redaksi, bukan parser URL.
/// Kredensial hanya ada bila authority mengandung '@'; colon pada
/// `host:port` tidak boleh salah dibaca sebagai pemisah password.
fn password_from_database_url(url: &str) -> Option<String> {
    let scheme_end = url.find("://")? + 3;
    let authority = &url[scheme_end..];
    let at = authority.find('@')?;
    let credentials = &authority[..at];
    let colon = credentials.find(':')?;
    Some(credentials[colon + 1..].to_owned())
}

/// Tutup secret teregistrasi + pola kredensial umum pada `input`.
/// Murni fungsi teks — tanpa I/O, aman dipanggil di request path.
pub fn redact(input: &str) -> String {
    let secrets: &[String] = SECRETS.get().map_or(&[], Vec::as_slice);
    redact_with(input, secrets)
}

/// Varian `redact` yang dapat disuntik daftar secret-nya (unit-testable
/// tanpa menyentuh state global).
fn redact_with(input: &str, secrets: &[String]) -> String {
    let mut out = input.to_owned();

    for secret in secrets {
        replace_all(&mut out, secret, MASK);
    }
    for key in [
        "password",
        "passwd",
        "secret",
        "token",
        "api_key",
        "access_key",
        // Sensor khusus HRIS ASMX (bab 5.1): field uPaswd tidak pernah
        // boleh muncul di log — case-insensitive sehingga `uPaswd=` tertutup.
        "upaswd",
        "ulogin",
    ] {
        mask_key_value(&mut out, key);
    }
    mask_bearer(&mut out);

    out
}

/// Ganti seluruh kemunculan `needle` (case-sensitive) dengan `replacement`.
fn replace_all(text: &mut String, needle: &str, replacement: &str) {
    if needle.is_empty() {
        return;
    }
    let mut start = 0;
    while let Some(found) = text[start..].find(needle) {
        let at = start + found;
        text.replace_range(at..at + needle.len(), replacement);
        start = at + replacement.len();
    }
}

/// Tutup nilai pada pola `key=value` / `key: value` (case-insensitive
/// pada `key`). Kemunculan `key` tanpa pemisah `=`/`:` (kata biasa,
/// mis. "tokenization") tidak disentuh.
fn mask_key_value(text: &mut String, key: &str) {
    let mut start = 0;
    while let Some(found) = find_ci(&text[start..], key) {
        let key_end = start + found + key.len();
        let bytes = text.as_bytes();

        let mut cursor = key_end;
        while cursor < bytes.len() && bytes[cursor] == b' ' {
            cursor += 1;
        }
        // Wajib pemisah '=' atau ':' — kalau tidak, ini sekadar kata.
        if cursor >= bytes.len() || (bytes[cursor] != b'=' && bytes[cursor] != b':') {
            start = key_end;
            continue;
        }
        cursor += 1;
        while cursor < bytes.len() && matches!(bytes[cursor], b' ' | b'"' | b'\'') {
            cursor += 1;
        }

        let end = bytes[cursor..]
            .iter()
            .position(|b| {
                matches!(
                    b,
                    b'&' | b' ' | b'"' | b'\'' | b',' | b';' | b'\t' | b'\n' | b'\r'
                )
            })
            .map_or(text.len(), |offset| cursor + offset);

        text.replace_range(cursor..end, MASK);
        start = cursor + MASK.len();
    }
}

/// Tutup nilai setelah skema `Bearer …` (case-insensitive).
fn mask_bearer(text: &mut String) {
    let mut start = 0;
    while let Some(found) = find_ci(&text[start..], "bearer") {
        let word_end = start + found + "bearer".len();
        let bytes = text.as_bytes();

        let mut cursor = word_end;
        while cursor < bytes.len() && bytes[cursor] == b' ' {
            cursor += 1;
        }
        // Tanpa nilai sesudah skema ("bearer=xyz") — biarkan, cakup
        // mask_key_value yang menuntut pemisah.
        if cursor >= bytes.len() || bytes[cursor] == b'=' || bytes[cursor] == b':' {
            start = word_end;
            continue;
        }

        let end = bytes[cursor..]
            .iter()
            .position(|b| matches!(b, b' ' | b'"' | b'\'' | b',' | b';' | b'\t' | b'\n' | b'\r'))
            .map_or(text.len(), |offset| cursor + offset);

        text.replace_range(cursor..end, MASK);
        start = cursor + MASK.len();
    }
}

/// Posisi kemunculan pertama `needle` pada `haystack` (case-insensitive,
/// ASCII). `needle` kosong tidak pernah match.
fn find_ci(haystack: &str, needle: &str) -> Option<usize> {
    let (hay, nee) = (haystack.as_bytes(), needle.as_bytes());
    if nee.is_empty() || hay.len() < nee.len() {
        return None;
    }
    (0..=hay.len() - nee.len()).find(|&i| hay[i..i + nee.len()].eq_ignore_ascii_case(nee))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menutup_secret_teregistrasi() {
        let secrets = vec!["password_osc_rustfs".to_owned()];
        let out = redact_with(
            "rustfs probe gagal: auth error password_osc_rustfs",
            &secrets,
        );
        assert_eq!(out, "rustfs probe gagal: auth error [REDACTED]");
    }

    #[test]
    fn menutup_password_dalam_bentuk_kv() {
        let out = redact_with("auth failed password=S3cr3tValue error; retry", &[]);
        assert_eq!(out, "auth failed password=[REDACTED] error; retry");
    }

    #[test]
    fn menutup_token_api_key_dan_bearer() {
        let out = redact_with(
            r#"token: "abc-123", api_key=xy1234567890, Authorization=Bearer eyJhbGciOi.x.y"#,
            &[],
        );
        assert!(out.contains(r#"token: "[REDACTED]""#), "hasil: {out}");
        assert!(out.contains("api_key=[REDACTED]"), "hasil: {out}");
        assert!(out.contains("Bearer [REDACTED]"), "hasil: {out}");
        assert!(!out.contains("eyJhbGciOi"), "token bocor: {out}");
    }

    #[test]
    fn kata_biasa_tidak_ikut_ditutup() {
        let out = redact_with("tokenization of tokens; the password policy", &[]);
        assert_eq!(out, "tokenization of tokens; the password policy");
    }

    #[test]
    fn password_from_database_url_mengambil_segmen_password() {
        let url = "postgresql://dbe:password_osc_dbe@localhost:36661/osc?sslmode=disable";
        assert_eq!(
            password_from_database_url(url).as_deref(),
            Some("password_osc_dbe")
        );

        let tanpa_kredensial = "postgresql://localhost:36661/osc";
        assert_eq!(password_from_database_url(tanpa_kredensial), None);

        let tanpa_password = "postgresql://dbe@localhost:36661/osc";
        assert_eq!(password_from_database_url(tanpa_password), None);
    }

    #[test]
    fn redact_dengan_daftar_kosong_tetap_menutup_pola() {
        let out = redact_with("password=short", &[]);
        assert_eq!(out, "password=[REDACTED]");
    }

    #[test]
    fn upaswd_hris_tertutup_case_insensitive() {
        let out = redact_with("GET hris.check?uLogin=budi&uPaswd=Secret123", &[]);
        assert!(out.contains("uLogin=[REDACTED]"), "hasil: {out}");
        assert!(out.contains("uPaswd=[REDACTED]"), "hasil: {out}");
        assert!(!out.contains("Secret123"), "password bocor: {out}");
    }
}
