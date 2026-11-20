use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash},
};
use subtle::ConstantTimeEq;
use totp_rs::{Algorithm, TOTP};

use crate::domain::AuthError;

pub async fn hash_password(password: String) -> Result<String, AuthError> {
    tokio::task::spawn_blocking(move || {
        Argon2::default()
            .hash_password(password.as_bytes())
            .map(|hash| hash.to_string())
            .map_err(|_| AuthError::Internal)
    })
    .await
    .map_err(|_| AuthError::Internal)?
}

pub async fn verify_password(password: String, encoded_hash: String) -> Result<bool, AuthError> {
    tokio::task::spawn_blocking(move || {
        let hash = PasswordHash::new(&encoded_hash).map_err(|_| AuthError::Internal)?;
        Ok(hash.algorithm.as_str() == "argon2id"
            && Argon2::default()
                .verify_password(password.as_bytes(), &hash)
                .is_ok())
    })
    .await
    .map_err(|_| AuthError::Internal)?
}

pub async fn hash_backup_codes(codes: Vec<String>) -> Result<Vec<String>, AuthError> {
    tokio::task::spawn_blocking(move || {
        let argon = Argon2::default();
        codes
            .into_iter()
            .map(|code| {
                argon
                    .hash_password(code.as_bytes())
                    .map(|hash| hash.to_string())
                    .map_err(|_| AuthError::Internal)
            })
            .collect()
    })
    .await
    .map_err(|_| AuthError::Internal)?
}

pub async fn verify_backup_code(
    code: String,
    hashes: Vec<String>,
) -> Result<Option<usize>, AuthError> {
    tokio::task::spawn_blocking(move || {
        for (index, encoded) in hashes.iter().enumerate() {
            let Ok(hash) = PasswordHash::new(encoded) else {
                continue;
            };
            if Argon2::default()
                .verify_password(code.as_bytes(), &hash)
                .is_ok()
            {
                return Ok(Some(index));
            }
        }
        Ok(None)
    })
    .await
    .map_err(|_| AuthError::Internal)?
}

pub fn encrypt_secret(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, AuthError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AuthError::Configuration)?;
    let mut nonce_bytes = [0u8; 12];
    getrandom::fill(&mut nonce_bytes).map_err(|_| AuthError::Internal)?;
    let nonce = Nonce::try_from(nonce_bytes.as_slice()).map_err(|_| AuthError::Internal)?;
    let encrypted = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| AuthError::Internal)?;
    let mut envelope = Vec::with_capacity(1 + nonce_bytes.len() + encrypted.len());
    envelope.push(1); // versi amplop
    envelope.extend_from_slice(&nonce_bytes);
    envelope.extend_from_slice(&encrypted);
    Ok(envelope)
}

pub fn decrypt_secret(key: &[u8; 32], envelope: &[u8]) -> Result<Vec<u8>, AuthError> {
    if envelope.len() < 29 || envelope[0] != 1 {
        return Err(AuthError::Internal);
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AuthError::Configuration)?;
    cipher
        .decrypt(
            &Nonce::try_from(&envelope[1..13]).map_err(|_| AuthError::Internal)?,
            &envelope[13..],
        )
        .map_err(|_| AuthError::Internal)
}

pub fn verify_totp(
    secret: &[u8],
    code: &str,
    now_step: i64,
    last_step: Option<i64>,
) -> Result<Option<i64>, AuthError> {
    if code.len() != 6 || !code.bytes().all(|b| b.is_ascii_digit()) {
        return Ok(None);
    }
    let totp =
        TOTP::new(Algorithm::SHA1, 6, 0, 30, secret.to_vec()).map_err(|_| AuthError::Internal)?;
    let mut matched = None;
    for step in [now_step - 1, now_step, now_step + 1] {
        if step < 0 || last_step.is_some_and(|last| step <= last) {
            continue;
        }
        let expected = totp.generate(step as u64 * 30);
        if bool::from(expected.as_bytes().ct_eq(code.as_bytes())) {
            matched = Some(step);
        }
    }
    Ok(matched)
}

pub fn random_secret() -> Result<Vec<u8>, AuthError> {
    let mut bytes = vec![0u8; 20];
    getrandom::fill(&mut bytes).map_err(|_| AuthError::Internal)?;
    Ok(bytes)
}

pub fn random_backup_codes() -> Result<Vec<String>, AuthError> {
    let mut codes = Vec::with_capacity(10);
    for _ in 0..10 {
        let mut bytes = [0u8; 8];
        getrandom::fill(&mut bytes).map_err(|_| AuthError::Internal)?;
        codes.push(format!("{:016x}", u64::from_be_bytes(bytes)));
    }
    Ok(codes)
}

#[cfg(test)]
mod tests {
    use super::verify_totp;

    #[test]
    fn returns_the_matching_step_and_rejects_replay() {
        // RFC 6238 SHA-1 test vector at Unix time 59, reduced to six digits.
        let seed = b"12345678901234567890";
        assert_eq!(verify_totp(seed, "287082", 1, None).unwrap(), Some(1));
        assert_eq!(verify_totp(seed, "287082", 1, Some(1)).unwrap(), None);
    }
}
