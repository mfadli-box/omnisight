use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use serde::Serialize;
use sha2::Sha256;
use uuid::Uuid;

use crate::domain::{AuthError, LoginPrincipal, SessionClaims};

pub struct TokenService {
    key: Vec<u8>,
}

impl TokenService {
    pub fn new(key: Vec<u8>) -> Result<Self, AuthError> {
        if key.len() < 32 {
            return Err(AuthError::Configuration);
        }
        Ok(Self { key })
    }

    pub fn issue_pending(
        &self,
        user_id: Uuid,
        company_id: Option<Uuid>,
        area_id: Option<Uuid>,
    ) -> Result<String, AuthError> {
        let issued = chrono::Utc::now();
        let now = issued.timestamp();
        self.issue(&SessionClaims {
            sub: user_id,
            scope: "mfa_pending".to_owned(),
            exp: now + 300,
            iat: now,
            issued_at_micros: Some(issued.timestamp_micros()),
            company_id,
            area_id,
            allowed_area_ids: Vec::new(),
            jti: Uuid::new_v4(),
        })
    }

    pub fn issue_session(&self, principal: &LoginPrincipal) -> Result<(String, i64), AuthError> {
        let issued = chrono::Utc::now();
        let now = issued.timestamp();
        let claims = SessionClaims {
            sub: principal.user_id,
            scope: "session".to_owned(),
            exp: now + 900,
            iat: now,
            issued_at_micros: Some(issued.timestamp_micros()),
            company_id: Some(principal.company_id),
            area_id: principal.area_id,
            allowed_area_ids: principal.allowed_area_ids.clone(),
            jti: Uuid::new_v4(),
        };
        Ok((self.issue(&claims)?, claims.exp))
    }

    pub fn decode(&self, token: &str, expected_scope: &str) -> Result<SessionClaims, AuthError> {
        let mut parts = token.split('.');
        let header = parts.next().ok_or(AuthError::InvalidChallenge)?;
        let payload = parts.next().ok_or(AuthError::InvalidChallenge)?;
        let signature = parts.next().ok_or(AuthError::InvalidChallenge)?;
        if parts.next().is_some() {
            return Err(AuthError::InvalidChallenge);
        }
        let header_bytes = URL_SAFE_NO_PAD
            .decode(header)
            .map_err(|_| AuthError::InvalidChallenge)?;
        let header_value: serde_json::Value =
            serde_json::from_slice(&header_bytes).map_err(|_| AuthError::InvalidChallenge)?;
        if header_value.get("alg").and_then(|v| v.as_str()) != Some("HS256") {
            return Err(AuthError::InvalidChallenge);
        }
        let mut mac =
            Hmac::<Sha256>::new_from_slice(&self.key).map_err(|_| AuthError::Configuration)?;
        mac.update(format!("{header}.{payload}").as_bytes());
        let signature_bytes = URL_SAFE_NO_PAD
            .decode(signature)
            .map_err(|_| AuthError::InvalidChallenge)?;
        mac.verify_slice(&signature_bytes)
            .map_err(|_| AuthError::InvalidChallenge)?;
        let claims: SessionClaims = serde_json::from_slice(
            &URL_SAFE_NO_PAD
                .decode(payload)
                .map_err(|_| AuthError::InvalidChallenge)?,
        )
        .map_err(|_| AuthError::InvalidChallenge)?;
        if claims.scope != expected_scope || claims.exp <= chrono::Utc::now().timestamp() {
            return Err(AuthError::InvalidChallenge);
        }
        Ok(claims)
    }

    fn issue<T: Serialize>(&self, payload: &T) -> Result<String, AuthError> {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"HS256","typ":"JWT"}"#);
        let body =
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(payload).map_err(|_| AuthError::Internal)?);
        let signing_input = format!("{header}.{body}");
        let mut mac =
            Hmac::<Sha256>::new_from_slice(&self.key).map_err(|_| AuthError::Configuration)?;
        mac.update(signing_input.as_bytes());
        let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
        Ok(format!("{signing_input}.{signature}"))
    }
}
