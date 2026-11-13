//! Util CIDR/IP untuk ACL `pam_access_policies.allowed_source_cidrs` (INET[]).
//!
//! Implementasi mandiri (tanpa crate tambahan): parser IPv4/IPv6 CIDR +
//! pengecekan keanggotaan. Deny-by-default dipakai pemanggil: allowlist
//! kosong = izinkan semua; tidak kosong = IP wajib cocok salah satu CIDR.

use std::net::IpAddr;

/// Prefix CIDR hasil parse.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cidr {
    V4 { addr: u32, bits: u8 },
    V6 { addr: u128, bits: u8 },
}

/// Parse `a.b.c.d/len` atau `xxxx::x/len` — `None` bila malformed.
/// Address tanpa prefix = host tunggal (/32 v4, /128 v6); prefix di luar
/// rentang keluarga address ditolak (tanpa panic, tanpa clamp diam-diam).
pub fn parse_cidr(raw: &str) -> Option<Cidr> {
    let raw = raw.trim();
    let (addr_part, bits_str) = match raw.split_once('/') {
        Some((addr, bits)) => (addr, Some(bits)),
        None => (raw, None),
    };
    let ip: IpAddr = addr_part.parse().ok()?;
    match ip {
        IpAddr::V4(v4) => {
            let bits = match bits_str {
                Some(bits) => bits.parse::<u8>().ok().filter(|b| *b <= 32)?,
                None => 32,
            };
            Some(Cidr::V4 {
                addr: u32::from(v4),
                bits,
            })
        }
        IpAddr::V6(v6) => {
            let bits = match bits_str {
                Some(bits) => bits.parse::<u8>().ok().filter(|b| *b <= 128)?,
                None => 128,
            };
            Some(Cidr::V6 {
                addr: u128::from(v6),
                bits,
            })
        }
    }
}

/// `true` bila `ip` berada di dalam `cidr` (IPv4-mapped dianggap v4 murni —
/// tidak dicocokkan silang antar keluarga address).
pub fn contains(cidr: &Cidr, ip: IpAddr) -> bool {
    match (cidr, ip) {
        (Cidr::V4 { addr, bits }, IpAddr::V4(v4)) => {
            let m = mask_v4(*bits);
            (*addr & m) == (u32::from(v4) & m)
        }
        (Cidr::V6 { addr, bits }, IpAddr::V6(v6)) => {
            let ip_bits = u128::from(v6);
            let m = mask_v6(*bits);
            (*addr & m) == (ip_bits & m)
        }
        _ => false,
    }
}

/// Cek IP terhadap daftar CIDR (string INET[] hasil cast `::text[]`).
/// `false` bila ada entri malformed — entri tidak valid tidak boleh
/// diam-diam dianggap "match".
pub fn ip_in_allowlist(cidrs: &[String], ip: IpAddr) -> bool {
    if cidrs.is_empty() {
        return true; // allowlist kosong = tanpa pembatasan sumber
    }
    cidrs
        .iter()
        .filter_map(|raw| parse_cidr(raw))
        .any(|cidr| contains(&cidr, ip))
}

fn mask_v4(bits: u8) -> u32 {
    if bits == 0 {
        return 0;
    }
    u32::MAX << (32 - bits)
}

fn mask_v6(bits: u8) -> u128 {
    if bits == 0 {
        return 0;
    }
    u128::MAX << (128 - bits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_dan_match_v4() {
        let cidr = parse_cidr("10.0.0.0/8").expect("cidr valid");
        assert!(contains(&cidr, "10.1.2.3".parse().expect("ip")));
        assert!(!contains(&cidr, "11.0.0.1".parse().expect("ip")));
        let host = parse_cidr("192.168.1.7").expect("host valid");
        assert_eq!(host, Cidr::V4 { addr: u32::from("192.168.1.7".parse::<std::net::Ipv4Addr>().expect("v4")), bits: 32 });
        assert!(contains(&host, "192.168.1.7".parse().expect("ip")));
        assert!(!contains(&host, "192.168.1.8".parse().expect("ip")));
    }

    #[test]
    fn parse_v6_dan_cross_family() {
        let cidr = parse_cidr("2001:db8::/32").expect("cidr v6 valid");
        assert!(contains(&cidr, "2001:db8::1".parse().expect("ip")));
        assert!(!contains(&cidr, "2001:db9::1".parse().expect("ip")));
        // Cross-family tidak match.
        assert!(!contains(&cidr, "10.0.0.1".parse().expect("ip")));
        let v4 = parse_cidr("10.0.0.0/8").expect("cidr v4 valid");
        assert!(!contains(&v4, "::1".parse().expect("ip")));
        // Prefix v6 /129 ditolak.
        assert!(parse_cidr("2001:db8::/129").is_none());
    }

    #[test]
    fn malformed_ditolak() {
        assert!(parse_cidr("bukan-cidr").is_none());
        assert!(parse_cidr("10.0.0.0/99").is_none());
        assert!(parse_cidr("10.0.0.0/halusinasi").is_none());
    }

    #[test]
    fn allowlist_semantik() {
        let allow = vec!["10.0.0.0/8".to_owned(), "192.168.0.0/16".to_owned()];
        assert!(ip_in_allowlist(&allow, "10.5.5.5".parse().expect("ip")));
        assert!(ip_in_allowlist(&allow, "192.168.9.9".parse().expect("ip")));
        assert!(!ip_in_allowlist(&allow, "8.8.8.8".parse().expect("ip")));
        // Kosong = izinkan semua.
        assert!(ip_in_allowlist(&[], "8.8.8.8".parse().expect("ip")));
        // Entri malformed tidak match (deny).
        let broken = vec!["tidak-valid".to_owned()];
        assert!(!ip_in_allowlist(&broken, "10.0.0.1".parse().expect("ip")));
    }
}
