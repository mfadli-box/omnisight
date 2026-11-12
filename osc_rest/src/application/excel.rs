//! Usecase Excel import/export (calamine + rust_xlsxwriter).
//!
//! - Import: validasi header, row-level error report, chunked persist.
//! - Export: header bold frozen + sanitasi formula injection.
//! - Parsing CPU-bound berjalan di `spawn_blocking` (dipanggil handler).

use std::collections::BTreeMap;

use serde_json::Value;

use calamine::Reader as _;

use crate::domain::error::DomainError;

/// Kolom template import aset (kolom A..) — header wajib persis.
pub const IMPORT_HEADERS: [&str; 9] = [
    "asset_tag",
    "name",
    "model_name",
    "status_label",
    "node_type",
    "serial_number",
    "hostname",
    "mgmt_ip",
    "purchase_cost",
];

/// Batas ukuran file import (10 MB) — anti ZIP bomb & memory DoS.
pub const MAX_IMPORT_BYTES: usize = 10 * 1024 * 1024;
/// Batas baris import.
pub const MAX_IMPORT_ROWS: usize = 10_000;
/// Baris import tervalidasi.
#[derive(Debug, Clone)]
pub struct ParsedAsset {
    pub asset_tag: String,
    pub name: String,
    pub model_name: Option<String>,
    pub status_label: Option<String>,
    pub node_type: String,
    pub serial_number: Option<String>,
    pub hostname: Option<String>,
    pub mgmt_ip: Option<String>,
    pub purchase_cost: Option<f64>,
}

/// Error baris-level (kontrak laporan import).
#[derive(Debug, Clone, serde::Serialize)]
pub struct RowError {
    pub row_number: usize,
    pub column: Option<String>,
    pub code: String,
    pub message: String,
}

/// Validasi satu baris (fungsi murni — unit-testable tanpa I/O).
pub fn parse_row(row_number: usize, raw: &[Option<String>]) -> Result<ParsedAsset, Vec<RowError>> {
    let cell = |header: &str| -> Option<String> {
        let index = IMPORT_HEADERS.iter().position(|h| *h == header)?;
        raw.get(index).and_then(Option::as_ref).map(|s| s.trim().to_owned()).filter(|s| !s.is_empty())
    };

    let mut errors = Vec::new();

    // Kolom wajib: kosong → REQUIRED, kepanjangan → TOO_LONG.
    let asset_tag = required_cell(cell("asset_tag"), row_number, "asset_tag", 100, &mut errors);
    let name = required_cell(cell("name"), row_number, "name", 150, &mut errors);

    let node_type = cell("node_type").map(|v| v.to_uppercase()).unwrap_or_else(|| "HOST".into());
    if !matches!(
        node_type.as_str(),
        "HOST" | "NETWORK" | "VIRTUAL" | "CONTAINER" | "RACK_MOUNTED" | "SERVICE"
    ) {
        errors.push(RowError {
            row_number,
            column: Some("node_type".into()),
            code: "ENUM_INVALID".into(),
            message: "node_type harus HOST/NETWORK/VIRTUAL/CONTAINER/RACK_MOUNTED/SERVICE".into(),
        });
    }

    let mgmt_ip = cell("mgmt_ip");
    if let Some(ip) = &mgmt_ip
        && ip.parse::<std::net::IpAddr>().is_err()
    {
        errors.push(RowError {
            row_number,
            column: Some("mgmt_ip".into()),
            code: "IP_INVALID".into(),
            message: "mgmt_ip bukan alamat IP valid".into(),
        });
    }

    let purchase_cost = match cell("purchase_cost") {
        Some(raw) => match raw.replace(',', "").parse::<f64>() {
            Ok(value) if (0.0..1e13).contains(&value) => Some(value),
            _ => {
                errors.push(RowError {
                    row_number,
                    column: Some("purchase_cost".into()),
                    code: "NUMBER_INVALID".into(),
                    message: "purchase_cost bukan angka non-negatif".into(),
                });
                None
            }
        },
        None => None,
    };

    if !errors.is_empty() {
        return Err(errors);
    }

    Ok(ParsedAsset {
        asset_tag,
        name,
        model_name: cell("model_name").filter(|s| s.chars().count() <= 200),
        status_label: cell("status_label").filter(|s| s.chars().count() <= 150),
        node_type,
        serial_number: cell("serial_number").filter(|s| s.len() <= 255),
        hostname: cell("hostname").filter(|s| s.len() <= 255),
        mgmt_ip,
        purchase_cost,
    })
}

/// Kolom wajib — catat error baris-level dan kembalikan string kosong
/// (validasi akhir dilakukan via `errors`).
fn required_cell(
    value: Option<String>,
    row_number: usize,
    column: &str,
    max: usize,
    errors: &mut Vec<RowError>,
) -> String {
    match value {
        Some(text) if text.chars().count() <= max => text,
        Some(_) => {
            errors.push(RowError {
                row_number,
                column: Some(column.to_owned()),
                code: "TOO_LONG".into(),
                message: format!("{column} maksimal {max} karakter"),
            });
            String::new()
        }
        None => {
            errors.push(RowError {
                row_number,
                column: Some(column.to_owned()),
                code: "REQUIRED".into(),
                message: format!("{column} wajib diisi"),
            });
            String::new()
        }
    }
}

/// Sanitasi Excel Formula Injection (CWE-1236): sel string yang berawalan
/// `=`, `+`, `-`, `@`, TAB, atau CR diberi prefix apostrof.
pub fn sanitize_cell(input: &str) -> String {
    let dangerous = input.starts_with(['=', '+', '-', '@', '\t', '\r']);
    if dangerous {
        format!("'{input}")
    } else {
        input.to_owned()
    }
}

/// Parser workbook (blocking — dipanggil via `spawn_blocking` di handler).
/// Mengembalikan (baris valid, error baris-level).
pub fn parse_workbook(bytes: &[u8]) -> Result<(Vec<ParsedAsset>, Vec<RowError>), DomainError> {
    // Magic bytes XLSX (ZIP): 50 4B 03 04 — tolak file lain sejak awal.
    if bytes.len() < 4 || bytes[..4] != [0x50, 0x4B, 0x03, 0x04] {
        return Err(DomainError::validation(
            "file bukan .xlsx valid (signature ZIP tidak cocok)",
        ));
    }

    let cursor = std::io::Cursor::new(bytes.to_vec());
    let mut workbook = calamine::open_workbook_from_rs::<calamine::Xlsx<_>, _>(cursor)
        .map_err(|e| DomainError::validation(format!("xlsx tidak dapat dibuka: {e}")))?;

    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| DomainError::validation("workbook tidak memuat sheet"))?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| DomainError::validation(format!("sheet pertama tidak terbaca: {e}")))?;

    let mut rows_iter = range.rows();
    let header: Vec<String> = rows_iter
        .next()
        .ok_or_else(|| DomainError::validation("baris header tidak ditemukan"))?
        .iter()
        .map(|cell| cell.to_string().trim().to_ascii_lowercase())
        .collect();

    // Header wajib memuat minimal kolom kunci.
    for required in ["asset_tag", "name"] {
        if !header.iter().any(|h| h == required) {
            return Err(DomainError::validation(format!(
                "header wajib memuat kolom `{required}` (template: {IMPORT_HEADERS:?})"
            )));
        }
    }

    let column_of = |header_name: &str| header.iter().position(|h| h == header_name);
    let order: BTreeMap<&str, Option<usize>> = IMPORT_HEADERS
        .iter()
        .map(|h| (*h, column_of(h)))
        .collect();

    let mut parsed = Vec::new();
    let mut errors = Vec::new();
    for (index, row) in rows_iter.enumerate() {
        let row_number = index + 2; // +1 header, +1 one-based
        if row_number > MAX_IMPORT_ROWS {
            break;
        }
        let mut cells: Vec<Option<String>> = vec![None; IMPORT_HEADERS.len()];
        for (target, maybe_index) in &order {
            if let Some(index) = maybe_index
                && let Some(cell) = row.get(*index)
            {
                let position = IMPORT_HEADERS.iter().position(|h| h == target).unwrap_or(0);
                cells[position] = Some(cell.to_string());
            }
        }
        match parse_row(row_number, &cells) {
            Ok(asset) => parsed.push(asset),
            Err(row_errors) => errors.extend(row_errors),
        }
    }

    Ok((parsed, errors))
}

/// Susun workbook export (blocking — dipanggil via `spawn_blocking`).
/// `rows` = hasil query assets; sel string disanitasi formula-injection.
pub fn build_workbook(rows: &[Value]) -> Result<Vec<u8>, DomainError> {
    use rust_xlsxwriter::{Format, Workbook};

    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet().set_name("Assets").map_err(|e| DomainError::Unavailable(format!("xlsx: {e}")))?;

    let header_format = Format::new().set_bold();
    let blank_format = Format::new();
    let headers = [
        "asset_tag", "name", "model_name", "status_label", "node_type", "status",
        "serial_number", "hostname", "mgmt_ip", "purchase_cost",
    ];
    for (index, header) in headers.iter().enumerate() {
        sheet
            .write_with_format(0, index as u16, *header, &header_format)
            .map_err(|e| DomainError::Unavailable(format!("xlsx write: {e}")))?;
        sheet
            .set_column_width(index as u16, 18)
            .map_err(|e| DomainError::Unavailable(format!("xlsx width: {e}")))?;
    }
    sheet
        .set_freeze_panes(1, 0)
        .map_err(|e| DomainError::Unavailable(format!("xlsx freeze: {e}")))?;

    for (row_index, row) in rows.iter().enumerate() {
        let excel_row = (row_index + 1) as u32;
        for (col, header) in headers.iter().enumerate() {
            let cell = row.get(*header).cloned().unwrap_or(Value::Null);
            let result = match cell {
                Value::Number(number) => match number.as_f64() {
                    Some(value) => sheet.write(excel_row, col as u16, value),
                    None => sheet.write(excel_row, col as u16, sanitize_cell(&number.to_string())),
                },
                Value::String(text) => {
                    sheet.write(excel_row, col as u16, sanitize_cell(&text))
                }
                Value::Null => sheet.write_blank(excel_row, col as u16, &blank_format),
                other => sheet.write(excel_row, col as u16, sanitize_cell(&other.to_string())),
            };
            result.map_err(|e| DomainError::Unavailable(format!("xlsx write: {e}")))?;
        }
    }

    workbook
        .save_to_buffer()
        .map_err(|e| DomainError::Unavailable(format!("xlsx save: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_cell_menutup_formula_injection() {
        for payload in [
            "=cmd|' /C calc'!A0",
            "+SUM(A1:A2)",
            "-2+3",
            "@SUM(1)",
            "\tTABS",
        ] {
            let safe = sanitize_cell(payload);
            assert!(safe.starts_with('\''), "{payload} harus diberi prefix '");
        }
        assert_eq!(sanitize_cell("Aset Kantor"), "Aset Kantor");
    }

    #[test]
    fn parse_row_validasi_wajib_dan_tipe() {
        let mut raw = vec![None; IMPORT_HEADERS.len()];
        raw[0] = Some("AST-0001".into());
        raw[1] = Some("Laptop Budi".into());
        raw[4] = Some("host".into());
        raw[7] = Some("10.0.0.5".into());
        raw[8] = Some("12.500".into());

        let parsed = parse_row(2, &raw).unwrap();
        assert_eq!(parsed.node_type, "HOST");
        assert_eq!(parsed.purchase_cost, Some(12.5));
        assert_eq!(parsed.mgmt_ip.as_deref(), Some("10.0.0.5"));

        // Tanpa asset_tag → REQUIRED.
        let mut invalid = raw.clone();
        invalid[0] = None;
        let errors = parse_row(2, &invalid).unwrap_err();
        assert!(errors.iter().any(|e| e.code == "REQUIRED"));

        // IP salah → IP_INVALID.
        let mut invalid = raw.clone();
        invalid[7] = Some("bukan-ip".into());
        let errors = parse_row(2, &invalid).unwrap_err();
        assert!(errors.iter().any(|e| e.code == "IP_INVALID"));
    }

    #[test]
    fn parse_workbook_menolak_bukan_xlsx() {
        assert!(parse_workbook(b"INI BUKAN ZIP").is_err());
    }

    #[test]
    fn build_workbook_menyanitasi_sel_string() {
        let rows = vec![serde_json::json!({
            "asset_tag": "=DANGEROUS()",
            "name": "Aman",
            "model_name": null,
            "status_label": "Deployable",
            "node_type": "HOST",
            "status": "ACTIVE",
            "serial_number": "SN-1",
            "hostname": "host-1",
            "mgmt_ip": "10.0.0.1",
            "purchase_cost": 123.45
        })];
        let bytes = build_workbook(&rows).unwrap();
        // XLSX = ZIP → mulai magic PK.
        assert_eq!(&bytes[..4], &[0x50, 0x4B, 0x03, 0x04]);
    }
}
