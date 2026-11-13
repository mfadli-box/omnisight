//! Provider kriptografi terpusat: Argon2id (password), JWT HS256 (sesi &
//! challenge MFA), Envelope Encryption AES-256-GCM (secret at-rest), dan
//! wrapper TOTP (totp-rs) dengan anti-replay step.

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, SaltString};
use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation};
use rand::RngCore;
use uuid::Uuid;

use crate::domain::error::DomainError;
use crate::domain::model::{AuthClaims, OtpOutcome};
/// Panjang secret TOTP (bytes) — 160-bit, standar RFC 4226.
const TOTP_SECRET_LEN: usize = 20;
/// Langkah TOTP 30 detik (RFC 6238 standar aplikasi).
const TOTP_STEP: u64 = 30;

pub struct CryptoProvider {
    encoding: EncodingKey,
    decoding: DecodingKey,
    kek: [u8; 32],
}

impl CryptoProvider {
    /// Bangun provider dari secret JWT + KEK hex. Dipanggil sekali di startup.
    pub fn new(jwt_secret: &str, kek_hex: &str) -> Result<Self, DomainError> {
        let kek = decode_kek(kek_hex)?;
        Ok(Self {
            encoding: EncodingKey::from_secret(jwt_secret.as_bytes()),
            decoding: DecodingKey::from_secret(jwt_secret.as_bytes()),
            kek,
        })
    }

    // ------------------------------------------------------------------
    // Argon2id
    // ------------------------------------------------------------------

    /// Hash password (Argon2id, salt acak per-hash). Default cost
    /// (`Argon2::default()`): m=19 MiB, t=2, p=1 — standar OWASP.
    pub fn hash_password(&self, password: &str) -> Result<String, DomainError> {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|h| h.to_string())
            .map_err(|e| DomainError::Unavailable(format!("argon2 hash gagal: {e}")))
    }

    /// Verifikasi password terhadap hash Argon2id — `false` untuk hash
    /// rusak/tak dikenal (tidak pernah panic).
    pub fn verify_password(&self, password: &str, hash: &str) -> bool {
        let parsed = match PasswordHash::new(hash) {
            Ok(parsed) => parsed,
            Err(_) => return false,
        };
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    }

    // ------------------------------------------------------------------
    // JWT (access + mfa_pending)
    // ------------------------------------------------------------------

    pub fn issue_token(&self, claims: &AuthClaims) -> Result<String, DomainError> {
        jsonwebtoken::encode(&Header::new(Algorithm::HS256), claims, &self.encoding)
            .map_err(|e| DomainError::Unavailable(format!("jwt encode gagal: {e}")))
    }

    pub fn verify_token(&self, token: &str) -> Result<AuthClaims, DomainError> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.leeway = 30; // toleransi clock skew 30 detik
        jsonwebtoken::decode::<AuthClaims>(token, &self.decoding, &validation)
            .map(|data| data.claims)
            .map_err(|_| DomainError::Unauthorized("token invalid atau kedaluwarsa".into()))
    }

    /// Klaim access token standar (sesi penuh).
    pub fn access_claims(
        &self,
        user_id: uuid::Uuid,
        session_id: uuid::Uuid,
        company_id: Option<uuid::Uuid>,
        role_id: Option<uuid::Uuid>,
        hours: i64,
    ) -> AuthClaims {
        let now = chrono::Utc::now();
        AuthClaims {
            sub: user_id.to_string(),
            sid: Some(session_id.to_string()),
            company: company_id.map(|c| c.to_string()),
            role: role_id.map(|r| r.to_string()),
            scope: AuthClaims::SCOPE_ACCESS.to_owned(),
            iat: now.timestamp().max(0) as u64,
            exp: (now + chrono::Duration::hours(hours)).timestamp().max(0) as u64,
            jti: session_id.to_string(),
        }
    }

    /// Klaim challenge MFA — 5 menit, scope `mfa_pending` (tanpa hak akses).
    pub fn mfa_challenge_claims(&self, user_id: uuid::Uuid) -> AuthClaims {
        let now = chrono::Utc::now();
        AuthClaims {
            sub: user_id.to_string(),
            sid: None,
            company: None,
            role: None,
            scope: AuthClaims::SCOPE_MFA_PENDING.to_owned(),
            iat: now.timestamp().max(0) as u64,
            exp: (now + chrono::Duration::minutes(5)).timestamp().max(0) as u64,
            jti: uuid::Uuid::now_v7().to_string(),
        }
    }

    // ------------------------------------------------------------------
    // Envelope Encryption AES-256-GCM
    // ------------------------------------------------------------------

    /// Format blob: `OMS1` | nonce_dek(12) | dek_terenkripsi(48) |
    /// nonce_data(12) | ciphertext+tag. DEK acak per-secret; KEK dari env.
    pub fn envelope_encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, DomainError> {
        let dek = random_bytes(32);
        let cipher_data = Aes256Gcm::new_from_slice(&dek)
            .map_err(|e| DomainError::Unavailable(format!("aes-gcm key: {e}")))?;

        let cipher_kek = Aes256Gcm::new_from_slice(&self.kek)
            .map_err(|e| DomainError::Unavailable(format!("aes-gcm key: {e}")))?;
        let nonce_dek = random_bytes(12);
        let dek_blob = cipher_kek
            .encrypt(&nonce_12(&nonce_dek)?, dek.as_slice())
            .map_err(gcm_error)?;

        let nonce_data = random_bytes(12);
        let ciphertext = cipher_data
            .encrypt(&nonce_12(&nonce_data)?, plaintext)
            .map_err(gcm_error)?;

        let mut out = Vec::with_capacity(4 + 12 + dek_blob.len() + 12 + ciphertext.len());
        out.extend_from_slice(b"OMS1");
        out.extend_from_slice(&nonce_dek);
        out.extend_from_slice(&dek_blob);
        out.extend_from_slice(&nonce_data);
        out.extend_from_slice(&ciphertext);
        Ok(out)
    }

    pub fn envelope_decrypt(&self, blob: &[u8]) -> Result<Vec<u8>, DomainError> {
        const HEADER: usize = 4;
        const NONCE: usize = 12;
        const DEK_BLOB: usize = 32 + 16; // DEK 32B + tag GCM 16B

        if blob.len() < HEADER + NONCE + DEK_BLOB + NONCE + 16
            || &blob[..HEADER] != b"OMS1"
        {
            return Err(DomainError::Unavailable(
                "blob envelope rusak: header/panjang tak valid".into(),
            ));
        }

        let mut offset = HEADER;
        let nonce_dek = &blob[offset..offset + NONCE];
        offset += NONCE;
        let dek_blob = &blob[offset..offset + DEK_BLOB];
        offset += DEK_BLOB;
        let nonce_data = &blob[offset..offset + NONCE];
        offset += NONCE;
        let ciphertext = &blob[offset..];

        let cipher_kek = Aes256Gcm::new_from_slice(&self.kek)
            .map_err(|e| DomainError::Unavailable(format!("aes-gcm key: {e}")))?;
        let dek = cipher_kek
            .decrypt(&nonce_12(nonce_dek)?, dek_blob)
            .map_err(gcm_error)?;

        let cipher_data = Aes256Gcm::new_from_slice(&dek)
            .map_err(|e| DomainError::Unavailable(format!("aes-gcm key: {e}")))?;
        cipher_data
            .decrypt(&nonce_12_slice(nonce_data), ciphertext)
            .map_err(gcm_error)
    }

    // ------------------------------------------------------------------
    // TOTP (RFC 6238, SHA-1/6 digit/30 s) + anti-replay step
    // ------------------------------------------------------------------

    /// Secret TOTP acak 160-bit (kembalikan raw + representasi base32).
    pub fn generate_totp_secret(&self) -> Result<(Vec<u8>, String), DomainError> {
        let raw = random_bytes(TOTP_SECRET_LEN);
        let base32 = data_encoding::BASE32_NOPAD.encode(&raw);
        Ok((raw, base32))
    }

    /// URI `otpauth://` untuk QR authenticator (issuer omnisight).
    pub fn otpauth_url(&self, secret: &[u8], account: &str) -> Result<String, DomainError> {
        let totp = build_totp(secret, account)?;
        Ok(totp.get_url())
    }

    /// Verifikasi token dengan toleransi ±1 step (30 detik) DAN anti-replay:
    /// hanya step lebih besar dari `last_verified_step` yang diterima.
    pub fn verify_totp(
        &self,
        secret: &[u8],
        token: &str,
        last_verified_step: Option<i64>,
    ) -> OtpOutcome {
        let totp = match build_totp(secret, "verify") {
            Ok(totp) => totp,
            Err(_) => return OtpOutcome::Invalid,
        };
        let normalized = token.trim();
        let now_step = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() / TOTP_STEP)
            .unwrap_or(0) as i64;

        for step in [now_step, now_step - 1, now_step + 1] {
            if last_verified_step.is_some_and(|last| step <= last) {
                continue; // anti-replay: step sama/lebih lama ditolak
            }
            if totp.generate((step as u64) * TOTP_STEP) == normalized {
                return OtpOutcome::Valid { step };
            }
        }
        OtpOutcome::Invalid
    }

    // ------------------------------------------------------------------
    // Util
    // ------------------------------------------------------------------

    /// Hash backup code (Argon2id) — sekali pakai, tercairkan = dihapus.
    pub fn hash_backup_code(&self, code: &str) -> Result<String, DomainError> {
        self.hash_password(code)
    }

    /// Verifikasi backup code terhadap daftar hash → index yang cocok.
    pub fn match_backup_code(&self, code: &str, hashes: &[String]) -> Option<usize> {
        hashes
            .iter()
            .position(|hash| self.verify_password(code, hash))
    }
}

fn build_totp(secret: &[u8], account_name: &str) -> Result<totp_rs::TOTP, DomainError> {
    totp_rs::TOTP::new(
        totp_rs::Algorithm::SHA1,
        6,
        0,
        TOTP_STEP,
        secret.to_vec(),
        Some("omnisight".to_owned()),
        account_name.to_owned(),
    )
    .map_err(|e| DomainError::Unavailable(format!("totp init gagal: {e}")))
}


/// Nonce 12-byte dari Vec — tanpa API deprecated generic-array.
fn nonce_12(bytes: &[u8]) -> Result<aes_gcm::Nonce<aes_gcm::aead::consts::U12>, DomainError> {
    let arr: [u8; 12] = bytes
        .try_into()
        .map_err(|_| DomainError::Unavailable("panjang nonce tak valid".into()))?;
    Ok(aes_gcm::Nonce::from(arr))
}

/// Nonce dari `&[u8]` slice (pemanggil menjamin panjang 12 — layout blob).
fn nonce_12_slice(bytes: &[u8]) -> aes_gcm::Nonce<aes_gcm::aead::consts::U12> {
    let mut arr = [0u8; 12];
    arr.copy_from_slice(bytes);
    aes_gcm::Nonce::from(arr)
}

fn gcm_error(err: aes_gcm::Error) -> DomainError {
    DomainError::Unavailable(format!("aes-gcm gagal: {err}"))
}

/// Random bytes kriptografis (rand OsRng).
pub fn random_bytes(len: usize) -> Vec<u8> {
    let mut buf = vec![0u8; len];
    rand::rngs::OsRng.fill_bytes(&mut buf);
    buf
}

/// Hex acak (token reset MFA, backup code charset, dst.).
pub fn random_hex(len_bytes: usize) -> String {
    random_bytes(len_bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn decode_kek(kek_hex: &str) -> Result<[u8; 32], DomainError> {
    if kek_hex.starts_with("dev-only") {
        // KEK dev deterministik — hanya untuk lingkungan lokal (sudah diwarn).
        let mut kek = [0u8; 32];
        for (index, slot) in kek.iter_mut().enumerate() {
            *slot = kek_hex.as_bytes()[index % kek_hex.len()] ^ 0x5A;
        }
        return Ok(kek);
    }
    let bytes = data_encoding::HEXLOWER
        .decode(kek_hex.to_ascii_lowercase().as_bytes())
        .map_err(|_| DomainError::validation("APP_MASTER_ENCRYPTION_KEY harus hex 64 char"))?;
    let kek: [u8; 32] = bytes
        .try_into()
        .map_err(|_| DomainError::validation("APP_MASTER_ENCRYPTION_KEY harus 32 byte"))?;
    Ok(kek)
}

// ----------------------------------------------------------------------
// Implementasi port domain (dipakai usecase application via generik)
// ----------------------------------------------------------------------

impl crate::domain::ports::TokenIssuer for CryptoProvider {
    fn issue_token(&self, claims: &AuthClaims) -> Result<String, DomainError> {
        CryptoProvider::issue_token(self, claims)
    }
    fn access_claims(
        &self,
        user_id: Uuid,
        session_id: Uuid,
        company_id: Option<Uuid>,
        role_id: Option<Uuid>,
        hours: i64,
    ) -> AuthClaims {
        CryptoProvider::access_claims(self, user_id, session_id, company_id, role_id, hours)
    }
    fn mfa_challenge_claims(&self, user_id: Uuid) -> AuthClaims {
        CryptoProvider::mfa_challenge_claims(self, user_id)
    }
    fn fingerprint(&self, token: &str) -> String {
        sha256_hex(token.as_bytes())
    }
}

impl crate::domain::ports::PasswordCrypto for CryptoProvider {
    fn hash_password(&self, password: &str) -> Result<String, DomainError> {
        CryptoProvider::hash_password(self, password)
    }
    fn verify_password(&self, password: &str, hash: &str) -> bool {
        CryptoProvider::verify_password(self, password, hash)
    }
}

impl crate::domain::ports::EnvelopeCrypto for CryptoProvider {
    fn envelope_encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, DomainError> {
        CryptoProvider::envelope_encrypt(self, plaintext)
    }
    fn envelope_decrypt(&self, blob: &[u8]) -> Result<Vec<u8>, DomainError> {
        CryptoProvider::envelope_decrypt(self, blob)
    }
}

impl crate::domain::ports::MfaCrypto for CryptoProvider {
    fn generate_totp_secret(&self) -> Result<(Vec<u8>, String), DomainError> {
        CryptoProvider::generate_totp_secret(self)
    }
    fn otpauth_url(&self, secret: &[u8], account: &str) -> Result<String, DomainError> {
        CryptoProvider::otpauth_url(self, secret, account)
    }
    fn verify_totp(&self, secret: &[u8], token: &str, last_step: Option<i64>) -> OtpOutcome {
        CryptoProvider::verify_totp(self, secret, token, last_step)
    }
    fn hash_backup_code(&self, code: &str) -> Result<String, DomainError> {
        CryptoProvider::hash_backup_code(self, code)
    }
    fn match_backup_code(&self, code: &str, hashes: &[String]) -> Option<usize> {
        CryptoProvider::match_backup_code(self, code, hashes)
    }
}

/// SHA-256 hex (fingerprint token sesi — kolom `user_sessions.token_hash`).
pub fn sha256_hex(input: &[u8]) -> String {
    use sha2::Digest;
    let digest = sha2::Sha256::digest(input);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider() -> CryptoProvider {
        CryptoProvider::new("test-secret-panjang-untuk-jwt", "dev-only-test-kek").unwrap()
    }

    #[test]
    fn argon2_hash_dan_verifikasi() {
        let p = provider();
        let hash = p.hash_password("S3cret!pass").unwrap();
        assert!(hash.starts_with("$argon2id$"), "wajib argon2id: {hash}");
        assert!(p.verify_password("S3cret!pass", &hash));
        assert!(!p.verify_password("salah", &hash));
        assert!(!p.verify_password("x", "bukan-hash"));
    }

    #[test]
    fn envelope_roundtrip_dan_tamper() {
        let p = provider();
        let blob = p.envelope_encrypt(b"totp-secret-rahasia").unwrap();
        assert_ne!(blob, b"totp-secret-rahasia");
        assert_eq!(p.envelope_decrypt(&blob).unwrap(), b"totp-secret-rahasia");

        let mut tampered = blob.clone();
        tampered[20] ^= 0xFF;
        assert!(p.envelope_decrypt(&tampered).is_err(), "tamper harus gagal");
    }

    #[test]
    fn jwt_roundtrip_dan_expiry() {
        let p = provider();
        let user = uuid::Uuid::now_v7();
        let sid = uuid::Uuid::now_v7();
        let claims = p.access_claims(user, sid, Some(uuid::Uuid::now_v7()), None, 1);
        let token = p.issue_token(&claims).unwrap();
        let decoded = p.verify_token(&token).unwrap();
        assert_eq!(decoded.sub, user.to_string());
        assert_eq!(decoded.sid.as_deref(), Some(sid.to_string().as_str()));
        assert!(decoded.scope_is(AuthClaims::SCOPE_ACCESS));

        assert!(p.verify_token("tampered.token.here").is_err());
    }

    #[test]
    fn totp_verify_dengan_anti_replay_step() {
        let p = provider();
        let (secret, _base32) = p.generate_totp_secret().unwrap();

        // Kode saat ini (step now) — generate manual untuk determinisme.
        let totp = build_totp(&secret, "test").unwrap();
        let now_step = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            / 30;
        let code = totp.generate(now_step * 30);

        match p.verify_totp(&secret, &code, None) {
            OtpOutcome::Valid { step } => assert_eq!(step, now_step as i64),
            OtpOutcome::Invalid => panic!("kode saat ini harus valid"),
        }

        // Replay step yang sama harus ditolak.
        assert_eq!(
            p.verify_totp(&secret, &code, Some(now_step as i64)),
            OtpOutcome::Invalid,
            "anti-replay: step <= last_verified_step ditolak"
        );
    }

    #[test]
    fn otpauth_url_mengandung_parameter_standar() {
        let p = provider();
        let (secret, base32) = p.generate_totp_secret().unwrap();
        let url = p.otpauth_url(&secret, "budi@omnisight").unwrap();
        assert!(url.starts_with("otpauth://totp/"), "url: {url}");
        assert!(url.contains(&format!("secret={base32}")), "url: {url}");
    }
}
