//! Evaluasi `AlertRule` Wave 2 (pure logic — tanpa I/O sqlx).
//!
//! Pola histeresis ala Beszel (audit-c §4): rule aktif hanya firing bila
//! pelanggaran threshold bertahan ≥ `duration_seconds` berdasarkan timestamp
//! sampel ter-inject; state FIRING terakhir di-resolve ketika batch berikut
//! tidak lagi melanggar (anti-flapping). Dedup state disimpan di
//! `alert_histories` (per rule + target_ref).

use chrono::{DateTime, Utc};
use serde_json::Value;
use uuid::Uuid;

/// Baris rule aktif hasil query (NUMERIC di-cast `::float8` di SQL).
#[derive(Debug, Clone)]
pub struct AlertRule {
    pub id: Uuid,
    pub name: String,
    /// Dot-path metrik: `system.cpu_pct`, `system.mem_pct`,
    /// `system.disk_pct`, `container.cpu_pct`, `container.mem_pct`,
    /// `uptime.down`, `smart.reallocated_sectors`, `snmp.in_errors`.
    pub metric: String,
    /// `GT` | `GTE` | `LT` | `LTE` | `EQ` | `NEQ`.
    pub operator: String,
    pub threshold: f64,
    pub duration_seconds: i32,
    pub severity: String,
    /// Filter target JSONB: `{"host_id": ["…"], "container_ref": ["…"],
    /// "kind": ["system"]}` — semua key yang ada wajib cocok; kosong/NULL =
    /// semua target. Key tak dikenal → rule TIDAK match (deny-by-default).
    pub target_filter: Option<Value>,
}

/// Satu sampel metrik kandidat evaluasi.
#[derive(Debug, Clone)]
pub struct MetricSample {
    pub metric: String,
    /// Identitas state history (asset/stack/monitor UUID atau container ref).
    pub target_ref: String,
    /// Jenis sumber — dipakai juga oleh `target_filter.kind`.
    pub kind: &'static str,
    pub host_id: Option<Uuid>,
    pub container_ref: Option<String>,
    pub monitor_id: Option<Uuid>,
    pub value: f64,
    pub recorded_at: DateTime<Utc>,
}

/// Kandidat alert dari satu (rule, target).
#[derive(Debug, Clone)]
pub struct Breach {
    pub target_ref: String,
    /// Nilai sampel terbaru yang melanggar.
    pub value: f64,
    /// Sampel pelanggaran paling awal dalam batch (dasar durasi).
    pub earliest_at: DateTime<Utc>,
    /// Sampel pelanggaran paling baru dalam batch.
    pub latest_at: DateTime<Utc>,
}

/// Perbandingan operator rule. `None` = operator tak dikenal (rule dilewati,
/// bukan error — data lama tidak boleh menggagalkan ingest).
pub fn compare(operator: &str, value: f64, threshold: f64) -> Option<bool> {
    match operator {
        "GT" => Some(value > threshold),
        "GTE" => Some(value >= threshold),
        "LT" => Some(value < threshold),
        "LTE" => Some(value <= threshold),
        "EQ" => Some((value - threshold).abs() < f64::EPSILON),
        "NEQ" => Some((value - threshold).abs() >= f64::EPSILON),
        _ => None,
    }
}

/// Filter target deny-by-default.
fn filter_matches(filter: Option<&Value>, sample: &MetricSample) -> bool {
    let Some(filter) = filter else {
        return true;
    };
    let Some(obj) = filter.as_object() else {
        return false;
    };
    if obj.is_empty() {
        return true;
    }
    obj.iter().all(|(key, expected)| {
        let actual: Option<String> = match key.as_str() {
            "kind" => Some(sample.kind.to_owned()),
            "host_id" => sample.host_id.map(|v| v.to_string()),
            "container_ref" => sample.container_ref.clone(),
            "monitor_id" => sample.monitor_id.map(|v| v.to_string()),
            _ => None,
        };
        let expected: Vec<String> = expected
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default();
        !expected.is_empty() && expected.iter().any(|e| actual.as_deref() == Some(e.as_str()))
    })
}

/// Pelanggaran paling awal + terbaru untuk satu rule pada satu target.
pub fn breach_for(rule: &AlertRule, samples: &[MetricSample]) -> Option<Breach> {
    let mut earliest: Option<DateTime<Utc>> = None;
    let mut latest: Option<DateTime<Utc>> = None;
    let mut last_value: Option<f64> = None;

    for sample in samples {
        if sample.metric != rule.metric {
            continue;
        }
        if !filter_matches(rule.target_filter.as_ref(), sample) {
            continue;
        }
        if compare(&rule.operator, sample.value, rule.threshold) != Some(true) {
            continue;
        }
        if earliest.is_none_or(|current| sample.recorded_at < current) {
            earliest = Some(sample.recorded_at);
        }
        if latest.is_none_or(|current| sample.recorded_at > current) {
            latest = Some(sample.recorded_at);
        }
        last_value = Some(sample.value);
    }

    Some(Breach {
        target_ref: samples.first()?.target_ref.clone(),
        value: last_value?,
        earliest_at: earliest?,
        latest_at: latest?,
    })
}

/// Apakah pelanggaran sudah memenuhi `duration_seconds` (dihitung relatif
/// terhadap timestamp sampel terbaru — anti wall-clock skew agent).
pub fn duration_satisfied(rule: &AlertRule, breach: &Breach) -> bool {
    let elapsed = (breach.latest_at - breach.earliest_at).num_seconds();
    elapsed + 1 >= i64::from(rule.duration_seconds.max(1))
}

/// Pesan alert human-readable (tanpa secret; aman masuk log & channel).
pub fn message(rule: &AlertRule, breach: &Breach) -> String {
    format!(
        "{}: {}={} {} {} pada target {}",
        rule.name, rule.metric, breach.value, rule.operator, rule.threshold, breach.target_ref
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(1_700_000_000 + secs, 0).single().unwrap()
    }

    fn rule(metric: &str, operator: &str, threshold: f64, duration: i32) -> AlertRule {
        AlertRule {
            id: Uuid::nil(),
            name: "cpu tinggi".into(),
            metric: metric.into(),
            operator: operator.into(),
            threshold,
            duration_seconds: duration,
            severity: "WARNING".into(),
            target_filter: None,
        }
    }

    fn sample(metric: &str, value: f64, at: i64) -> MetricSample {
        MetricSample {
            metric: metric.into(),
            target_ref: "t1".into(),
            kind: "system",
            host_id: Some(Uuid::nil()),
            container_ref: None,
            monitor_id: None,
            value,
            recorded_at: ts(at),
        }
    }

    #[test]
    fn operator_lengkap() {
        assert_eq!(compare("GT", 90.0, 80.0), Some(true));
        assert_eq!(compare("GTE", 80.0, 80.0), Some(true));
        assert_eq!(compare("LT", 10.0, 20.0), Some(true));
        assert_eq!(compare("LTE", 20.0, 20.0), Some(true));
        assert_eq!(compare("EQ", 5.0, 5.0), Some(true));
        assert_eq!(compare("NEQ", 5.0, 6.0), Some(true));
        assert_eq!(compare("WAT", 1.0, 1.0), None);
    }

    #[test]
    fn breach_mengambil_rentang_dan_nilai_terbaru() {
        let r = rule("system.cpu_pct", "GT", 80.0, 60);
        let samples = vec![
            sample("system.cpu_pct", 90.0, 0),
            sample("system.cpu_pct", 95.0, 30),
            sample("system.cpu_pct", 97.0, 70),
            sample("system.disk_pct", 99.0, 80),
        ];
        let breach = breach_for(&r, &samples).unwrap();
        assert_eq!(breach.earliest_at, ts(0));
        assert_eq!(breach.latest_at, ts(70));
        assert_eq!(breach.value, 97.0);
        assert!(duration_satisfied(&r, &breach));
    }

    #[test]
    fn durasi_belum_terpenuhi() {
        let r = rule("system.cpu_pct", "GT", 80.0, 300);
        let samples = vec![sample("system.cpu_pct", 90.0, 0), sample("system.cpu_pct", 91.0, 120)];
        let breach = breach_for(&r, &samples).unwrap();
        assert!(!duration_satisfied(&r, &breach));
    }

    #[test]
    fn filter_target_deny_by_default() {
        let mut r = rule("system.cpu_pct", "GT", 80.0, 1);
        r.target_filter = Some(serde_json::json!({"host_id": ["11111111-1111-1111-1111-111111111111"]}));
        let samples = vec![sample("system.cpu_pct", 90.0, 0)];
        // host berbeda → tidak match → tanpa breach.
        assert!(breach_for(&r, &samples).is_none());

        r.target_filter = Some(serde_json::json!({"unknown_key": ["x"]}));
        assert!(breach_for(&r, &samples).is_none());

        r.target_filter = Some(serde_json::json!({}));
        assert!(breach_for(&r, &samples).is_some());
    }

    #[test]
    fn metrik_lain_tidak_mengganggu() {
        let r = rule("uptime.down", "GT", 0.5, 1);
        let samples = vec![sample("system.cpu_pct", 99.0, 0)];
        assert!(breach_for(&r, &samples).is_none());
    }
}
