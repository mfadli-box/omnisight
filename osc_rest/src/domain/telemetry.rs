use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HostMetrics {
    pub cpu_pct: f64,
    pub ram_used_mb: f64,
    pub ram_total_mb: f64,
    pub disk_json: Vec<Disk>,
    pub disk_io_json: Vec<DiskIo>,
    pub net_json: Vec<NetworkIo>,
    pub load_avg: Option<[f64; 3]>,
    pub temp_c: Option<f64>,
    pub smart_json: Vec<SmartHealth>,
    pub containers_json: Vec<Container>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Disk {
    mount: String,
    used_bytes: u64,
    total_bytes: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DiskIo {
    device: String,
    read_bytes: u64,
    write_bytes: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NetworkIo {
    interface: String,
    rx_bytes: u64,
    tx_bytes: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SmartHealth {
    device: String,
    model: String,
    passed: Option<bool>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Container {
    id: String,
    name: String,
    cpu_pct: f64,
    memory: String,
    network: String,
    block_io: String,
}

impl HostMetrics {
    pub fn valid(&self) -> bool {
        let label = |value: &str, max: usize| {
            !value.is_empty() && value.len() <= max && !value.contains('\0')
        };
        (0.0..=100.0).contains(&self.cpu_pct)
            && (0.0..=1e12).contains(&self.ram_used_mb)
            && (0.0..=1e12).contains(&self.ram_total_mb)
            && self.ram_total_mb > 0.0
            && self.ram_used_mb <= self.ram_total_mb
            && self
                .load_avg
                .is_none_or(|load| load.iter().all(|n| (0.0..=1e6).contains(n)))
            && self
                .temp_c
                .is_none_or(|temp| (-273.15..=250.0).contains(&temp))
            && (1..=64).contains(&self.disk_json.len())
            && self.disk_json.iter().all(|d| {
                label(&d.mount, 1024) && d.total_bytes > 0 && d.used_bytes <= d.total_bytes
            })
            && self.disk_io_json.len() <= 64
            && self.disk_io_json.iter().all(|d| label(&d.device, 256))
            && self.net_json.len() <= 64
            && self.net_json.iter().all(|n| label(&n.interface, 256))
            && self.smart_json.len() <= 64
            && self
                .smart_json
                .iter()
                .all(|s| label(&s.device, 256) && s.model.len() <= 256 && !s.model.contains('\0'))
            && self.containers_json.len() <= 64
            && self.containers_json.iter().all(|c| {
                label(&c.id, 128)
                    && label(&c.name, 256)
                    && (0.0..=1e6).contains(&c.cpu_pct)
                    && [&c.memory, &c.network, &c.block_io]
                        .iter()
                        .all(|s| s.len() <= 128 && !s.contains('\0'))
            })
    }

    pub fn ram_pct(&self) -> f64 {
        100.0 * (self.ram_used_mb / self.ram_total_mb)
    }

    pub fn disk_pct(&self) -> f64 {
        self.disk_json
            .iter()
            .map(|d| 100.0 * (d.used_bytes as f64 / d.total_bytes as f64))
            .fold(0.0, f64::max)
    }

    pub fn smart_failed(&self) -> Option<f64> {
        if self
            .smart_json
            .iter()
            .any(|disk| disk.passed == Some(false))
        {
            Some(1.0)
        } else if !self.smart_json.is_empty()
            && self.smart_json.iter().all(|disk| disk.passed == Some(true))
        {
            Some(0.0)
        } else {
            None
        }
    }
}
