//! Usecase SecOps (Wave 3 — ingest SIEM/FIM/CVE): validasi & normalisasi
//! batch telemetri keamanan sebelum persist. Murni (tanpa I/O) — handler
//! memanggil di sini lalu menyimpan via `infrastructure::store::secops`.

use crate::domain::error::DomainError;

/// Enum `fim_event_type` (dual-event Wazuh).
pub const FIM_EVENT_TYPES: &[&str] = &["CREATED", "MODIFIED", "DELETED", "ATTRIBUTE_CHANGED"];
/// Enum `fim_detection_source`.
pub const FIM_SOURCES: &[&str] = &["REALTIME", "SCHEDULED"];
/// Enum `security_severity`.
pub const SEVERITIES: &[&str] = &["LOW", "MEDIUM", "HIGH", "CRITICAL"];
/// Enum `compliance_status`.
pub const COMPLIANCE_STATUSES: &[&str] = &["PASS", "FAIL", "ERROR", "SKIPPED"];

/// Trim + batasi panjang string (anti payload bomb per kolom).
pub fn bounded(raw: &str, max: usize) -> String {
    raw.trim().chars().take(max).collect()
}

/// Enum string validasi terhadap konstanta (uppercase-normalized).
pub fn enum_or(raw: Option<&str>, allowed: &[&str], default: &str, field: &str) -> Result<String, DomainError> {
    let value = match raw {
        None => return Ok(default.to_owned()),
        Some(value) => value.trim().to_uppercase(),
    };
    if value.is_empty() {
        return Ok(default.to_owned());
    }
    if allowed.contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(DomainError::validation(format!(
            "{field} tidak valid (salah satu dari: {})",
            allowed.join(", ")
        )))
    }
}

/// Validasi format CVE ID (`CVE-YYYY-NNNN`, ≤ 20 char — kolom VARCHAR(20)).
pub fn validate_cve_id(raw: &str) -> Result<String, DomainError> {
    let cve = raw.trim().to_uppercase();
    let invalid = || DomainError::validation(format!("cve_id tidak valid: {raw}"));
    if cve.len() > 20 || !cve.starts_with("CVE-") {
        return Err(invalid());
    }
    let parts: Vec<&str> = cve.split('-').collect();
    if parts.len() != 3 {
        return Err(invalid());
    }
    let year_ok = parts[1].len() == 4 && parts[1].bytes().all(|b| b.is_ascii_digit());
    let seq_ok = !parts[2].is_empty()
        && parts[2].len() <= 7
        && parts[2].bytes().all(|b| b.is_ascii_digit());
    if !year_ok || !seq_ok {
        return Err(invalid());
    }
    Ok(cve)
}

/// CVSS 0.0–10.0 (None = tidak diketahui).
pub fn validate_cvss(score: Option<f64>) -> Result<Option<f64>, DomainError> {
    match score {
        None => Ok(None),
        Some(value) if (0.0..=10.0).contains(&value) => Ok(Some(value)),
        Some(_) => Err(DomainError::validation("cvss_score wajib 0.0–10.0")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cve_id_valid_dan_invalid() {
        assert_eq!(validate_cve_id(" cve-2026-12345 ").unwrap(), "CVE-2026-12345");
        assert!(validate_cve_id("CVE-2026-").is_err());
        assert!(validate_cve_id("CVE-26-1").is_err());
        assert!(validate_cve_id("NOTACVE-2026-1").is_err());
        assert!(validate_cve_id("CVE-2026-1234567890123").is_err());
    }

    #[test]
    fn cvss_range() {
        assert!(validate_cvss(Some(9.8)).is_ok());
        assert!(validate_cvss(Some(10.0)).is_ok());
        assert!(validate_cvss(Some(-0.1)).is_err());
        assert!(validate_cvss(Some(10.1)).is_err());
        assert!(validate_cvss(None).is_ok());
    }

    #[test]
    fn enum_ambil_default_dan_tolak_asing() {
        assert_eq!(enum_or(None, SEVERITIES, "MEDIUM", "severity").unwrap(), "MEDIUM");
        assert_eq!(enum_or(Some("high"), SEVERITIES, "MEDIUM", "severity").unwrap(), "HIGH");
        assert!(enum_or(Some("apocalyptic"), SEVERITIES, "MEDIUM", "severity").is_err());
    }

    #[test]
    fn bounded_memangkas_dan_membersihkan() {
        assert_eq!(bounded("  hello  ", 3), "hel");
        assert_eq!(bounded("x".repeat(2000).as_str(), 1000).len(), 1000);
    }
}
