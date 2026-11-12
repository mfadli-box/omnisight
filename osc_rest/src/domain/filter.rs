//! Filter AST (pola Directus/NetBox) — JSON rule dari klien di-parse ke
//! tree murni, lalu diterjemahkan ke SQL **terparameterisasi** via
//! `sqlx::QueryBuilder::push_bind` (nilainya selalu bind — identifier
//! kolom berasal dari peta field server-side, BUKAN input klien).

use std::collections::BTreeMap;

use serde_json::Value;
use sqlx::Postgres;
use sqlx::query_builder::QueryBuilder;

use crate::domain::error::DomainError;

/// Batas keamanan parser — mencegah stack deep / DoS payload raksasa.
const MAX_DEPTH: usize = 8;
const MAX_NODES: usize = 64;

/// Operator perbandingan yang diizinkan.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CmpOp {
    Eq,
    Ne,
    Gt,
    Gte,
    Lt,
    Lte,
    Like,
    In,
    Null,
    NotNull,
}

impl CmpOp {
    fn parse(raw: &str) -> Option<Self> {
        Some(match raw {
            "eq" => Self::Eq,
            "ne" | "neq" => Self::Ne,
            "gt" => Self::Gt,
            "gte" => Self::Gte,
            "lt" => Self::Lt,
            "lte" => Self::Lte,
            "like" => Self::Like,
            "in" => Self::In,
            "null" => Self::Null,
            "not_null" => Self::NotNull,
            _ => return None,
        })
    }
}

/// Node AST.
#[derive(Debug, Clone, PartialEq)]
pub enum FilterNode {
    And(Vec<FilterNode>),
    Or(Vec<FilterNode>),
    Cond {
        field: String,
        op: CmpOp,
        value: Value,
    },
}

/// Binding semantik sebuah field: bagaimana nilai klien diterjemahkan ke SQL.
/// Identifier/ekspresi kolom HANYA berasal dari peta server-side.
#[derive(Debug, Clone)]
pub enum FieldKind {
    /// Kunci JSON di kolom `data` (koleksi dinamis Studio). Key wajib lolos
    /// `valid_key` sebelum di-embed ke dalam literal kutip.
    DataKey(String),
    /// Kolom fisik dibanding sebagai teks (ekspresi SQL server-side).
    Text(String),
    /// Kolom fisik dibanding numerik (cast `float8`).
    Numeric(String),
}

pub type FieldMap = BTreeMap<String, FieldKind>;

/// Validasi kunci field/identifier koleksi: `[a-z][a-z0-9_]{0,62}`.
/// Menjamin aman di-embed sebagai identifier/literal JSON-key (tanpa kutip,
/// tanpa operator, tanpa path traversal).
pub fn valid_key(key: &str) -> bool {
    let bytes = key.as_bytes();
    !key.is_empty()
        && key.len() <= 63
        && bytes[0].is_ascii_lowercase()
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'_')
}

/// Parse rule JSON klien → AST (dengan batas depth/jumlah node).
pub fn parse(value: &Value) -> Result<Option<FilterNode>, DomainError> {
    if value.is_null() {
        return Ok(None);
    }
    let mut budget = MAX_NODES;
    let node = parse_node(value, 0, &mut budget)?;
    Ok(Some(node))
}

fn parse_node(value: &Value, depth: usize, budget: &mut usize) -> Result<FilterNode, DomainError> {
    if depth > MAX_DEPTH || *budget == 0 {
        return Err(DomainError::validation("filter terlalu kompleks"));
    }
    *budget -= 1;

    let obj = value
        .as_object()
        .ok_or_else(|| DomainError::validation("filter harus berupa objek JSON"))?;

    for (gate, ctor) in [("and", FilterNode::And as fn(Vec<_>) -> FilterNode), ("or", FilterNode::Or)] {
        if let Some(children) = obj.get(gate) {
            let list = children
                .as_array()
                .ok_or_else(|| DomainError::validation(format!("filter `{gate}` harus array")))?;
            if list.is_empty() {
                return Err(DomainError::validation(format!("filter `{gate}` tidak boleh kosong")));
            }
            let mut parsed = Vec::with_capacity(list.len().min(MAX_NODES));
            for child in list {
                parsed.push(parse_node(child, depth + 1, budget)?);
            }
            return Ok(ctor(parsed));
        }
    }

    // Bentuk eksplisit: {"field": "x", "op": "eq", "value": …}
    if let (Some(field), Some(op)) = (obj.get("field"), obj.get("op")) {
        let field = field
            .as_str()
            .ok_or_else(|| DomainError::validation("filter field harus string"))?;
        let op = op
            .as_str()
            .and_then(CmpOp::parse)
            .ok_or_else(|| DomainError::validation("operator filter tidak dikenal"))?;
        let value = obj.get("value").cloned().unwrap_or(Value::Null);
        return Ok(FilterNode::Cond {
            field: field.to_owned(),
            op,
            value,
        });
    }

    // Bentuk shorthand: {"field_x": {"eq": …}} — tepat satu field.
    if obj.len() == 1 {
        let (field, spec) = obj
            .iter()
            .next()
            .ok_or_else(|| DomainError::validation("filter kosong"))?;
        if let Some(spec_obj) = spec.as_object()
            && spec_obj.len() == 1
            && let Some((op, value)) = spec_obj.iter().next()
            && let Some(op) = CmpOp::parse(op)
        {
            return Ok(FilterNode::Cond {
                field: field.clone(),
                op,
                value: value.clone(),
            });
        }
        return Err(DomainError::validation(format!(
            "filter `{field}` harus berbentuk {{\"op\": value}}"
        )));
    }

    Err(DomainError::validation(
        "struktur filter tidak dikenal (pakai and/or/field+op)",
    ))
}

/// Terjemahkan AST ke SQL terparameterisasi dan tempel ke QueryBuilder
/// (termasuk `AND` pembuka bila `prefix` — pemanggil menentukan konteks).
pub fn push_where(
    qb: &mut QueryBuilder<Postgres>,
    node: &FilterNode,
    fields: &FieldMap,
) -> Result<(), DomainError> {
    match node {
        FilterNode::And(children) => push_group(qb, children, " AND ", fields),
        FilterNode::Or(children) => push_group(qb, children, " OR ", fields),
        FilterNode::Cond { field, op, value } => {
            let kind = fields.get(field).ok_or_else(|| {
                DomainError::validation(format!("field filter `{field}` tidak dikenal"))
            })?;
            push_cond(qb, kind, *op, value)
        }
    }
}

fn push_group(
    qb: &mut QueryBuilder<Postgres>,
    children: &[FilterNode],
    sep: &str,
    fields: &FieldMap,
) -> Result<(), DomainError> {
    qb.push("(");
    for (index, child) in children.iter().enumerate() {
        if index > 0 {
            qb.push(sep);
        }
        push_where(qb, child, fields)?;
    }
    qb.push(")");
    Ok(())
}

fn text_of(value: &Value, op: CmpOp) -> Result<String, DomainError> {
    match value {
        Value::String(s) => Ok(s.clone()),
        Value::Number(n) => Ok(n.to_string()),
        Value::Bool(b) => Ok(b.to_string()),
        _ => Err(DomainError::validation(format!(
            "nilai untuk operator {op:?} harus skalar"
        ))),
    }
}

fn push_cond(
    qb: &mut QueryBuilder<Postgres>,
    kind: &FieldKind,
    op: CmpOp,
    value: &Value,
) -> Result<(), DomainError> {
    match kind {
        FieldKind::DataKey(key) => {
            debug_assert!(valid_key(key), "DataKey wajib lolos valid_key");
            let path = format!("(data->'{key}')");
            push_json_cond(qb, &path, op, value)
        }
        FieldKind::Text(expr) => match op {
            CmpOp::Null | CmpOp::NotNull => push_null(qb, &format!("({expr})::text"), op),
            CmpOp::In => {
                push_in_chain(qb, &format!("({expr})::text"), value, |qb, v| {
                    qb.push_bind(text_of(v, op)?);
                    Ok(())
                })
            }
            CmpOp::Like => {
                qb.push(format!("({expr})::text LIKE "));
                qb.push_bind(text_of(value, op)?);
                Ok(())
            }
            _ => {
                qb.push(format!("({expr})::text "));
                push_op(qb, op);
                qb.push_bind(text_of(value, op)?);
                Ok(())
            }
        },
        FieldKind::Numeric(expr) => match op {
            CmpOp::Null | CmpOp::NotNull => push_null(qb, &format!("({expr})::float8"), op),
            CmpOp::Like => Err(DomainError::validation(
                "operator `like` tidak berlaku untuk field numerik",
            )),
            CmpOp::In => {
                push_in_chain(qb, &format!("({expr})::float8"), value, |qb, v| {
                    let number = v.as_f64().ok_or_else(|| {
                        DomainError::validation("nilai `in` numerik harus angka")
                    })?;
                    qb.push_bind(number);
                    Ok(())
                })
            }
            _ => {
                let number = value
                    .as_f64()
                    .ok_or_else(|| DomainError::validation("nilai filter harus angka"))?;
                qb.push(format!("({expr})::float8 "));
                push_op(qb, op);
                qb.push_bind(number);
                Ok(())
            }
        },
    }
}

/// Kondisi pada path JSON (jsonb): equality/ordered memakai perbandingan
/// jsonb native; like memakai bentuk teksnya.
fn push_json_cond(
    qb: &mut QueryBuilder<Postgres>,
    path: &str,
    op: CmpOp,
    value: &Value,
) -> Result<(), DomainError> {
    match op {
        CmpOp::Null | CmpOp::NotNull => {
            let sql = match op {
                CmpOp::Null => {
                    format!("{path} IS NULL OR jsonb_typeof{path} = 'null'")
                }
                CmpOp::NotNull => {
                    format!("{path} IS NOT NULL AND jsonb_typeof{path} <> 'null'")
                }
                _ => unreachable!("kondisi null ditangani lengan di atas"),
            };
            qb.push(sql);
            Ok(())
        }
        CmpOp::Like => {
            qb.push(format!("{path}::text LIKE "));
            qb.push_bind(text_of(value, op)?);
            Ok(())
        }
        CmpOp::In => push_in_chain(qb, path, value, |qb, v| {
            qb.push_bind(v.clone());
            Ok(())
        }),
        _ => {
            qb.push(path);
            push_op(qb, op);
            qb.push_bind(value.clone()); // jsonb typed — perbandingan native
            Ok(())
        }
    }
}

fn push_in_chain(
    qb: &mut QueryBuilder<Postgres>,
    path: &str,
    value: &Value,
    mut bind_one: impl FnMut(&mut QueryBuilder<Postgres>, &Value) -> Result<(), DomainError>,
) -> Result<(), DomainError> {
    let items = value
        .as_array()
        .ok_or_else(|| DomainError::validation("operator `in` membutuhkan array nilai"))?;
    if items.is_empty() {
        // `in []` → selalu false (literal aman, tanpa nilai klien).
        qb.push("false");
        return Ok(());
    }
    qb.push("(");
    for (index, item) in items.iter().enumerate() {
        if index > 0 {
            qb.push(" OR ");
        }
        qb.push(path);
        qb.push(" = ");
        bind_one(qb, item)?;
    }
    qb.push(")");
    Ok(())
}

fn push_op(qb: &mut QueryBuilder<Postgres>, op: CmpOp) {
    qb.push(match op {
        CmpOp::Eq => "= ",
        CmpOp::Ne => "<> ",
        CmpOp::Gt => "> ",
        CmpOp::Gte => ">= ",
        CmpOp::Lt => "< ",
        CmpOp::Lte => "<= ",
        _ => "",
    });
}

fn push_null(
    qb: &mut QueryBuilder<Postgres>,
    expr: &str,
    op: CmpOp,
) -> Result<(), DomainError> {
    qb.push(match op {
        CmpOp::Null => format!("{expr} IS NULL"),
        CmpOp::NotNull => format!("{expr} IS NOT NULL"),
        _ => String::new(),
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn field_map() -> FieldMap {
        BTreeMap::from([
            ("asset_tag".to_owned(), FieldKind::Text("a.asset_tag".to_owned())),
            ("purchase_cost".to_owned(), FieldKind::Numeric("a.purchase_cost".to_owned())),
            ("status".to_owned(), FieldKind::DataKey("status".to_owned())),
        ])
    }

    #[test]
    fn valid_key_menolak_injeksi_identifier() {
        for ok in ["status", "a1_b2", "x"] {
            assert!(valid_key(ok), "{ok} harus valid");
        }
        for bad in [
            "", "9lead", "Upper", "ada spasi", "kutip'", "semi;colon", "data->x", "a; DROP",
        ] {
            assert!(!valid_key(bad), "{bad} harus ditolak");
        }
        assert!(!valid_key(&"x".repeat(64)));
    }

    #[test]
    fn parse_menerima_bentuk_eksplisit_shorthand_dan_group() {
        let explicit = json!({"field": "asset_tag", "op": "eq", "value": "AST-1"});
        assert!(parse(&explicit).unwrap().is_some());

        let shorthand = json!({"status": {"eq": "ACTIVE"}});
        assert!(parse(&shorthand).unwrap().is_some());

        let group = json!({"and": [explicit, shorthand, {"or": []}]});
        assert!(parse(&group).is_err(), "or kosong ditolak");
    }

    #[test]
    fn parse_menolak_operator_dan_kedalaman_berlebih() {
        let bad_op = json!({"field": "x", "op": "; DROP TABLE", "value": 1});
        assert!(parse(&bad_op).is_err());

        let mut deep = json!({"field": "status", "op": "eq", "value": 1});
        for _ in 0..MAX_DEPTH + 2 {
            deep = json!({"and": [deep]});
        }
        assert!(parse(&deep).is_err(), "kedalaman harus dibatasi");
    }

    #[test]
    fn build_sql_tidak_menyisipkan_nilai_mentah() {
        let rule = parse(&json!({
            "and": [
                {"field": "asset_tag", "op": "like", "value": "AST-%"},
                {"status": {"in": ["ACTIVE", "STAGED"]}},
                {"field": "purchase_cost", "op": "lt", "value": 100.5}
            ]
        }))
        .unwrap()
        .unwrap();

        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new("select 1 where ");
        push_where(&mut qb, &rule, &field_map()).unwrap();
        let sql = qb.into_sql().as_str().to_owned();

        assert!(!sql.contains("AST-"), "nilai string tidak boleh mentah: {sql}");
        assert!(!sql.contains("100.5"), "nilai angka tidak boleh mentah: {sql}");
        assert!(sql.contains("LIKE "), "operator like harus ada: {sql}");
        assert_eq!(sql.matches('$').count(), 4, "semua nilai via bind: {sql}");
    }

    #[test]
    fn build_sql_menolak_field_tak_kenal() {
        let rule = parse(&json!({"field": "password_hash; --", "op": "eq", "value": "x"}))
            .unwrap()
            .unwrap();
        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new("select 1 where ");
        let err = push_where(&mut qb, &rule, &field_map()).unwrap_err();
        assert!(matches!(err, DomainError::Validation(_)));
    }
}
