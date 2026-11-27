use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Device {
    pub server_id: Uuid,
    pub server_hostname: Option<String>,
    pub rack_unit_start: i32,
    pub rack_unit_end: i32,
    pub power_draw_watts: i32,
}

#[derive(Serialize)]
pub struct Capacity {
    pub used_u: usize,
    pub free_u: usize,
    pub space_utilization_percent: f64,
    pub total_power_watts: i64,
    pub power_utilization_percent: Option<f64>,
    pub assumed_power_factor: f64,
    pub estimated_kva: f64,
    pub heat_btu_per_hour: f64,
}

pub fn valid_range(start: i32, end: i32, height: i32) -> bool {
    start >= 1 && start <= end && end <= height
}

pub fn calculate(
    height: i32,
    max_watts: i32,
    devices: &[Device],
) -> (Capacity, Vec<Option<&Device>>) {
    let mut slots = vec![None; height as usize];
    let mut watts = 0_i64;
    for device in devices {
        watts += i64::from(device.power_draw_watts);
        for unit in device.rack_unit_start.max(1)..=device.rack_unit_end.min(height) {
            slots[(unit - 1) as usize] = Some(device);
        }
    }
    let used = slots.iter().flatten().count();
    let power_factor = 1.0;
    let capacity = Capacity {
        used_u: used,
        free_u: slots.len() - used,
        space_utilization_percent: 100.0 * used as f64 / f64::from(height),
        total_power_watts: watts,
        power_utilization_percent: (max_watts > 0)
            .then(|| 100.0 * watts as f64 / f64::from(max_watts)),
        assumed_power_factor: power_factor,
        estimated_kva: watts as f64 / (1000.0 * power_factor),
        heat_btu_per_hour: watts as f64 * 3.412141633,
    };
    (capacity, slots)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(start: i32, end: i32, watts: i32) -> Device {
        Device {
            server_id: Uuid::nil(),
            server_hostname: None,
            rack_unit_start: start,
            rack_unit_end: end,
            power_draw_watts: watts,
        }
    }

    #[test]
    fn maps_both_ends_and_counts_power_once_per_device() {
        let devices = [device(1, 2, 400), device(42, 42, 600)];
        let (capacity, slots) = calculate(42, 8000, &devices);
        assert_eq!(slots.len(), 42);
        assert!(slots[0].is_some() && slots[1].is_some() && slots[41].is_some());
        assert!(slots[2..41].iter().all(Option::is_none));
        assert_eq!(
            (capacity.used_u, capacity.free_u, capacity.total_power_watts),
            (3, 39, 1000)
        );
        assert_eq!(capacity.estimated_kva, 1.0);
        assert!((capacity.heat_btu_per_hour - 3412.14).abs() < 0.01);
        assert_eq!(capacity.power_utilization_percent, Some(12.5));
    }

    #[test]
    fn validates_inclusive_range_against_actual_height() {
        assert!(valid_range(1, 42, 42));
        assert!(valid_range(52, 52, 52));
        for (start, end) in [(0, 1), (1, 43), (2, 1), (1, i32::MAX)] {
            assert!(!valid_range(start, end, 42));
        }
        assert_eq!(calculate(12, 100, &[]).0.free_u, 12);
    }
}
