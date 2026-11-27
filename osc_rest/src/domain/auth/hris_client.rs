/// Hasil pemeriksaan kredensial. Pemanggil wajib menyelesaikan MFA sesuai
/// konfigurasi sebelum menerbitkan sesi OmniSight.
pub enum CredentialProof {
    Hris { token: String },
    Recovery,
    Local,
}

#[derive(Debug, PartialEq)]
pub enum LoginError {
    Denied,
    Configuration,
    Persistence,
    PasswordProcessing,
}

pub(crate) enum HrisReply {
    Accepted(String),
    Denied,
    Unavailable,
}

impl HrisReply {
    pub(crate) fn from_payload(payload: &str) -> Self {
        match payload.trim().split_once("|---|") {
            Some(("0", _)) => Self::Denied,
            Some(("1", token))
                if !token.trim().is_empty()
                    && token.trim() != "NONE"
                    && !token.contains("|---|") =>
            {
                Self::Accepted(token.trim().to_owned())
            }
            _ => Self::Unavailable,
        }
    }
}
