use std::{collections::HashMap, io::ErrorKind, net::Ipv4Addr, time::Duration};
use tokio::{
    net::TcpStream,
    time::{sleep, timeout},
};
use uuid::Uuid;

pub(crate) fn hosts(network: &str) -> Option<Vec<Ipv4Addr>> {
    let (ip, prefix) = network.split_once('/')?;
    let ip: Ipv4Addr = ip.parse().ok()?;
    let prefix: u32 = prefix.parse().ok()?;
    if !ip.is_private() || !(24..=32).contains(&prefix) {
        return None;
    }
    let start = u32::from(ip);
    let size = 1 << (32 - prefix);
    if start % size != 0 {
        return None;
    }
    let skip = u32::from(prefix <= 30);
    Some(
        (skip..size - skip)
            .map(|offset| (start + offset).into())
            .collect(),
    )
}

pub(crate) struct Assignment {
    pub id: Uuid,
    pub ip: Option<String>,
    pub mac: Option<String>,
    pub allocation: String,
}

pub(crate) fn classify<'a>(
    rows: &'a [Assignment],
    ip: &str,
    mac: Option<&str>,
    active: bool,
) -> (Option<&'a str>, Option<Uuid>) {
    let fixed = rows.iter().find(|r| r.ip.as_deref() == Some(ip));
    let matched = fixed
        .filter(|r| !active || r.mac.is_none() || r.mac.as_deref() == mac)
        .or_else(|| {
            if fixed.is_none() && active {
                rows.iter()
                    .find(|r| r.ip.is_none() && mac.is_some() && r.mac.as_deref() == mac)
            } else {
                None
            }
        });
    if let Some(r) = matched {
        return (Some(&r.allocation), Some(r.id));
    }
    // Alamat terdaftar dengan identitas MAC yang belum teramati belum membuktikan pelanggaran.
    let missing_identity =
        mac.is_none() && (fixed.is_some() || rows.iter().any(|r| r.ip.is_none()));
    if active && !missing_identity {
        (Some("UNAUTHORIZED_IP"), None)
    } else {
        (None, None)
    }
}

pub(crate) async fn probe(addresses: Vec<Ipv4Addr>) -> std::io::Result<Vec<(Ipv4Addr, bool)>> {
    let mut observations = Vec::with_capacity(addresses.len());
    for ip in addresses {
        sleep(Duration::from_millis(250)).await;
        let active = responds((ip, 443)).await?;
        observations.push((ip, active));
    }
    Ok(observations)
}

async fn responds(target: (Ipv4Addr, u16)) -> std::io::Result<bool> {
    match timeout(Duration::from_millis(350), TcpStream::connect(target)).await {
        Ok(Ok(_)) => Ok(true),
        Ok(Err(err)) if err.kind() == ErrorKind::ConnectionRefused => Ok(true),
        Err(_) => Ok(false),
        Ok(Err(err)) if matches!(err.kind(), ErrorKind::TimedOut | ErrorKind::HostUnreachable) => {
            Ok(false)
        }
        Ok(Err(err)) => Err(err),
    }
}

pub(crate) fn neighbors(data: &str) -> HashMap<Ipv4Addr, String> {
    let mut result = HashMap::new();
    for line in data.lines().skip(1) {
        let cols: Vec<_> = line.split_whitespace().collect();
        if cols.len() != 6 || cols[2] != "0x2" {
            continue;
        }
        if let Ok(ip) = cols[0].parse() {
            result.insert(ip, cols[3].to_ascii_lowercase());
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_hosts() {
        let h = hosts("10.20.1.0/24").unwrap();
        assert_eq!(
            (h.len(), h[0].octets()[3], h[253].octets()[3]),
            (254, 1, 254)
        );
        for n in ["10.0.0.0/8", "127.0.0.1/32", "10.1.0.1/30", "bad"] {
            assert!(hosts(n).is_none());
        }
        assert_eq!(hosts("192.168.1.0/31").unwrap().len(), 2);
        assert_eq!(hosts("172.31.255.255/32").unwrap().len(), 1);
    }
    #[tokio::test]
    async fn open_and_refused_tcp_connections_indicate_presence() {
        let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let target = (Ipv4Addr::LOCALHOST, listener.local_addr().unwrap().port());
        assert!(responds(target).await.unwrap());
        drop(listener);
        assert!(responds(target).await.unwrap());
    }

    #[test]
    fn inventory_identity() {
        let ip = "10.0.0.1";
        let mut rows = [Assignment {
            id: Uuid::nil(),
            ip: Some(ip.into()),
            mac: Some("aa".into()),
            allocation: "RESERVED".into(),
        }];
        assert_eq!(classify(&rows, ip, Some("aa"), true).0, Some("RESERVED"));
        assert_eq!(
            classify(&rows, ip, Some("bb"), true).0,
            Some("UNAUTHORIZED_IP")
        );
        assert_eq!(classify(&rows, ip, None, true).0, None);
        assert_eq!(classify(&rows, ip, None, false).0, Some("RESERVED"));
        rows[0].ip = None;
        rows[0].allocation = "DHCP_DYNAMIC".into();
        assert_eq!(
            classify(&rows, ip, Some("aa"), true).0,
            Some("DHCP_DYNAMIC")
        );
        assert_eq!(classify(&rows, ip, None, true).0, None);
        assert_eq!(classify(&[], ip, None, true).0, Some("UNAUTHORIZED_IP"));
        assert_eq!(classify(&[], ip, None, false).0, None);
    }
}
