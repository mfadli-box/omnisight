//! Usecase PAM (Wave 3 — pola JumpServer): vault akun, mandatory MFA +
//! step-up (bab 5.3), penerbitan ephemeral WS ticket untuk
//! `pam_bastion_gateway`. Murni (tanpa I/O) — keputusan dihitung di sini,
//! persist/diakses lewat `infrastructure::store::pam`.

use crate::domain::error::DomainError;

/// Enum `pam_account_type`.
pub const ACCOUNT_TYPES: &[&str] = &["SSH_PASSWORD", "SSH_KEY", "DATABASE", "HTTP_ENDPOINT"];

/// Durasi langkah TOTP (detik) — RFC 6238 standar aplikasi (konsisten
/// `infrastructure::crypto::TOTP_STEP`).
const TOTP_STEP_SECONDS: i64 = 30;

/// Batas durasi sesi absolut (jam → menit) — policy tetap boleh lebih ketat.
pub const MAX_SESSION_MINUTES_CAP: i32 = 480;

/// Hasil evaluasi step-up berbasis `mfa_last_verified_step` (derived
/// timestamp — kolom tersimpan adalah step TOTP terakhir yang lolos).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StepUpState {
    /// `true` = wajib OTP baru pada authorize (verifikasi terakhir di
    /// luar window policy).
    pub required: bool,
    /// Usia verifikasi terakhir (detik; `i64::MAX` bila belum pernah lolos).
    pub age_seconds: i64,
    /// Window policy (detik) — default 15 menit.
    pub window_seconds: i64,
}

/// Derivasi usia verifikasi MFA terakhir dari step tersimpan.
/// `now_step = unix_epoch_secs / 30`; usia = (now_step − last_step) × 30s.
pub fn step_up_state(last_verified_step: Option<i64>, window_minutes: i32) -> StepUpState {
    let window_seconds = i64::from(window_minutes.clamp(1, 120)) * 60;
    let now_step = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64 / TOTP_STEP_SECONDS)
        .unwrap_or(0);

    let age_seconds = match last_verified_step {
        // Belum pernah verifikasi TOTP (login backup-code / token lama) —
        // perlakukan sebagai jauh di luar window.
        None => i64::MAX,
        Some(step) => ((now_step - step).max(0)) * TOTP_STEP_SECONDS,
    };

    StepUpState {
        required: age_seconds > window_seconds,
        age_seconds,
        window_seconds,
    }
}

/// Durasi sesi efektif: permintaan di-clamp ke policy (dan cap absolut).
pub fn effective_session_minutes(requested: Option<i32>, policy_max: i32) -> i32 {
    let policy_max = policy_max.clamp(1, MAX_SESSION_MINUTES_CAP);
    match requested {
        None => policy_max,
        Some(minutes) => minutes.clamp(1, policy_max),
    }
}

/// Ticket WS ephemeral baru (256-bit hex) — plaintext SEKALI tampil;
/// DB menyimpan SHA-256 (pola token enrollment/sesi).
pub fn new_ticket() -> String {
    crate::infrastructure::crypto::random_hex(32)
}

/// Hash ticket untuk `pam_session_logs.ws_ticket_hash`.
pub fn ticket_hash(ticket: &str) -> String {
    crate::infrastructure::crypto::sha256_hex(ticket.as_bytes())
}

/// Validasi tipe akun vault.
pub fn validate_account_type(raw: &str) -> Result<String, DomainError> {
    let value = raw.trim().to_uppercase();
    if ACCOUNT_TYPES.contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(DomainError::validation(format!(
            "account_type tidak valid (salah satu dari: {})",
            ACCOUNT_TYPES.join(", ")
        )))
    }
}

/// Endpoint target prioritas untuk gateway: fqdn → hostname → mgmt_ip.
pub fn target_host(fqdn: Option<&str>, hostname: Option<&str>, mgmt_ip: Option<&str>) -> Option<String> {
    [fqdn, hostname, mgmt_ip]
        .into_iter()
        .flatten()
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .map(str::to_owned)
        .next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn step_up_belum_pernah_verifikasi_selalu_required() {
        let state = step_up_state(None, 15);
        assert!(state.required);
        assert_eq!(state.age_seconds, i64::MAX);
    }

    #[test]
    fn step_up_dalam_window_tidak_required() {
        let now_step = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
            / TOTP_STEP_SECONDS;
        let state = step_up_state(Some(now_step), 15);
        assert!(!state.required, "usia {}/{} dtk", state.age_seconds, state.window_seconds);

        // 10 menit lalu (20 step) < window 15 menit → tidak required.
        let state = step_up_state(Some(now_step - 20), 15);
        assert!(!state.required);
    }

    #[test]
    fn step_up_lewat_window_wajib_otp() {
        let now_step = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
            / TOTP_STEP_SECONDS;
        // 16 menit lalu (32 step) > window 15 menit → required.
        let state = step_up_state(Some(now_step - 32), 15);
        assert!(state.required);
        assert_eq!(state.age_seconds, 32 * TOTP_STEP_SECONDS);
    }

    #[test]
    fn durasi_sesi_clamp_ke_policy() {
        assert_eq!(effective_session_minutes(None, 120), 120);
        assert_eq!(effective_session_minutes(Some(30), 120), 30);
        assert_eq!(effective_session_minutes(Some(500), 120), 120, "clamp ke policy");
        assert_eq!(effective_session_minutes(Some(0), 120), 1, "minimum 1 menit");
        assert_eq!(effective_session_minutes(None, 999_999), MAX_SESSION_MINUTES_CAP);
    }

    #[test]
    fn tipe_akun_dan_target() {
        assert_eq!(validate_account_type("ssh_key").unwrap(), "SSH_KEY");
        assert!(validate_account_type("telnet").is_err());
        assert_eq!(
            target_host(Some("srv.example.com"), Some("srv"), Some("10.0.0.1")).as_deref(),
            Some("srv.example.com")
        );
        assert_eq!(target_host(None, Some("srv"), Some("10.0.0.1")).as_deref(), Some("srv"));
        assert_eq!(target_host(None, Some("  "), None), None);
    }

    #[test]
    fn ticket_unik_dan_hash_stabil() {
        let a = new_ticket();
        let b = new_ticket();
        assert_ne!(a, b);
        assert_eq!(a.len(), 64);
        assert_eq!(ticket_hash(&a), ticket_hash(&a));
        assert_ne!(ticket_hash(&a), ticket_hash(&b));
    }
}
