use serde_json::Value;
use std::fmt::Write;

use crate::domain::AuthError;

pub fn excel(rows: &[Value]) -> Result<Vec<u8>, AuthError> {
    let mut workbook = rust_xlsxwriter::Workbook::new();
    let sheet = workbook.add_worksheet();
    let header = rows.first().and_then(Value::as_object);
    if let Some(header) = header {
        for (column, key) in header.keys().enumerate() {
            sheet
                .write_string(0, column as u16, key)
                .map_err(|_| AuthError::Internal)?;
            for (index, row) in rows.iter().enumerate() {
                let position = (index + 1) as u32;
                let column = column as u16;
                match &row[key] {
                    Value::String(value) => sheet.write_string(position, column, value),
                    Value::Number(value) => sheet.write_string(position, column, value.to_string()),
                    Value::Bool(value) => sheet.write_boolean(position, column, *value),
                    _ => continue,
                }
                .map_err(|_| AuthError::Internal)?;
            }
        }
    } else {
        sheet
            .write_string(0, 0, "No rows")
            .map_err(|_| AuthError::Internal)?;
    }
    workbook.save_to_buffer().map_err(|_| AuthError::Internal)
}

fn pdf_text(text: &str) -> String {
    let mut result = String::new();
    for character in text.chars() {
        match character {
            '(' | ')' | '\\' => {
                result.push('\\');
                result.push(character);
            }
            ' '..='~' => result.push(character),
            '\u{a0}'..='\u{ff}' => {
                let _ = write!(result, "\\{:03o}", character as u32);
            }
            _ => {
                let _ = write!(result, "\\\\u{{{:x}}}", character as u32);
            }
        }
    }
    result
}

pub fn pdf(title: &str, rows: &[Value]) -> Vec<u8> {
    let mut lines = Vec::new();
    for (index, row) in rows.iter().enumerate() {
        let Some(fields) = row.as_object() else {
            continue;
        };
        lines.push(format!("Record {}", index + 1));
        for (key, value) in fields {
            if value.is_null() {
                continue;
            }
            let display = value
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| value.to_string());
            for line in format!("  {key}: {display}").lines() {
                let characters: Vec<char> = line.chars().collect();
                for segment in characters.chunks(100) {
                    lines.push(segment.iter().collect());
                }
            }
        }
        lines.push(String::new());
    }
    if lines.is_empty() {
        lines.push("No rows".to_owned());
    }

    let pages = lines.chunks(60).collect::<Vec<_>>();
    let kids: Vec<String> = (0..pages.len())
        .map(|index| format!("{} 0 R", 4 + index * 2))
        .collect();
    let mut objects = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".to_owned(),
        format!(
            "<< /Type /Pages /Kids [{}] /Count {} >>",
            kids.join(" "),
            pages.len()
        ),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"
            .to_owned(),
    ];
    for (index, page) in pages.into_iter().enumerate() {
        let contents = 5 + index * 2;
        objects.push(format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {contents} 0 R >>"
        ));
        let mut stream = format!(
            "BT /F1 13 Tf 45 797 Td ({}) Tj /F1 8 Tf 0 -23 Td\n",
            pdf_text(title)
        );
        for line in page {
            let _ = writeln!(stream, "({}) Tj 0 -12 Td", pdf_text(line));
        }
        stream.push_str("ET");
        objects.push(format!(
            "<< /Length {} >>\nstream\n{stream}\nendstream",
            stream.len()
        ));
    }
    let mut pdf = b"%PDF-1.4\n".to_vec();
    let mut offsets = Vec::with_capacity(objects.len());
    for (index, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n{object}\nendobj\n", index + 1).as_bytes());
    }
    let xref = pdf.len();
    let size = objects.len() + 1;
    pdf.extend_from_slice(format!("xref\n0 {size}\n0000000000 65535 f \n").as_bytes());
    for offset in offsets {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!("trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n").as_bytes(),
    );
    pdf
}
