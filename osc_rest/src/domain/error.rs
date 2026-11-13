//! Error domain — framework-agnostic, tidak pernah dipetakan langsung
//! ke HTTP di layer ini (pemetaan dilakukan `presentation/error.rs`).

#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("resource not found")]
    NotFound,

    #[error("validation failed: {0}")]
    Validation(String),

    #[error("unauthorized: {0}")]
    /// Detail HANYA untuk log/diagnostik — klien menerima pesan generik.
    Unauthorized(String),

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("too many attempts")]
    RateLimited,

    #[error("dependency unavailable: {0}")]
    /// Pesan detail HANYA untuk log/diagnostik — jangan pernah
    /// diteruskan apa adanya ke respons klien.
    Unavailable(String),

    #[error("upstream invalid response: {0}")]
    /// Dependensi upstream (HRIS ASMX) gagal/invalid — dipetakan ke 502,
    /// berbeda dari 401 ("kredensial salah") dan 500 ("bug internal").
    Upstream(String),

    #[error("mfa is mandatory for pam access")]
    /// PAM bastion menolak user tanpa MFA aktif (bab 5.3 mandatory MFA) —
    /// dipetakan ke 403 `MFA_REQUIRED_FOR_PAM` (bukan FORBIDDEN generik).
    PamMfaRequired,

    #[error("pam step-up otp required: {0}")]
    /// Verifikasi OTP terakhir lebih tua dari window step-up policy —
    /// klien wajib mengirim OTP baru. Dipetakan ke 403 `PAM_STEP_UP_REQUIRED`.
    PamStepUpRequired(String),

    #[error("pam policy denied: {0}")]
    /// Pelanggaran ACL policy PAM (CIDR, approval, tiket) — dipetakan ke
    /// 403 `PAM_POLICY_DENIED`.
    PolicyDenied(String),
}

impl DomainError {
    /// Helper validasi singkat.
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }
}
