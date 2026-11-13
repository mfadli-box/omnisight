//! Handler `GET /api/v1/me/navigation` — daftar company user + pohon
//! MenuModule sesuai CompanyMenuPrivilege (bab 5.5).

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};
use std::collections::HashMap;
use uuid::Uuid;

use crate::domain::model::MenuEntry;
use crate::presentation::error::AppError;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

pub async fn navigation(
    State(state): State<AppState>,
    ctx: AuthContext,
) -> Result<Json<Value>, AppError> {
    let accesses = state.store.access_list(ctx.user_id).await.map_err(AppError::from)?;

    let companies = accesses
        .iter()
        .map(|access| {
            json!({
                "id": access.company.id,
                "name": access.company.name,
                "code": access.company.code,
                "hris_enabled": access.company.hris_enabled(),
                "role_id": access.role_id,
                "role_name": access.role_name,
                "is_default": access.is_default,
                "is_active_company": ctx.active_company_id == Some(access.company.id),
            })
        })
        .collect::<Vec<_>>();

    // Pohon menu untuk company aktif (butuh role konteks).
    let menus = match (ctx.active_company_id, ctx.role_id) {
        (Some(company_id), Some(role_id)) => {
            let entries = state
                .store
                .navigation_menus(company_id, role_id)
                .await
                .map_err(AppError::from)?;
            build_tree(entries)
        }
        // Tanpa company aktif → hanya daftar company (operator memilih dulu).
        _ => Vec::new(),
    };

    Ok(Json(json!({
        "status": "success",
        "data": {
            "active_company_id": ctx.active_company_id,
            "companies": companies,
            "menus": menus,
        }
    })))
}

/// Susun pohon dari daftar datar (parent yang tidak terlihat → item jadi root;
/// `can_view=false` tidak pernah dikirim — server-side filtering).
fn build_tree(entries: Vec<MenuEntry>) -> Vec<Value> {
    let visible: HashMap<Uuid, &MenuEntry> = entries
        .iter()
        .map(|entry| (entry.id, entry))
        .collect();

    // Node value + slot children.
    let mut nodes: HashMap<Uuid, Value> = HashMap::new();
    for entry in &entries {
        nodes.insert(
            entry.id,
            json!({
                "id": entry.id,
                "code": entry.code,
                "label": entry.label,
                "route_path": entry.route_path,
                "icon": entry.icon,
                "parent_id": entry.parent_id,
                "sort_order": entry.sort_order,
                "can_create": entry.can_create,
                "can_update": entry.can_update,
                "can_delete": entry.can_delete,
                "children": [],
            }),
        );
    }

    let mut roots: Vec<Value> = Vec::new();
    for entry in &entries {
        let is_root = entry
            .parent_id
            .is_none_or(|parent| !visible.contains_key(&parent));
        if is_root
            && let Some(node) = nodes.get(&entry.id) {
                roots.push(node.clone());
            }
    }

    // Tempelkan anak (rekursif terhadap visible set — depth terbatas oleh
    // jumlah node).
    fn attach(parent_value: &mut Value, nodes: &HashMap<Uuid, Value>, entries: &[MenuEntry], parent_id: Uuid) {
        let Some(parent_obj) = parent_value.as_object_mut() else {
            return;
        };
        let children: Vec<Value> = entries
            .iter()
            .filter(|entry| entry.parent_id == Some(parent_id))
            .filter_map(|entry| nodes.get(&entry.id).cloned())
            .collect();
        let mut child_values = children;
        for child in &mut child_values {
            if let Some(id) = child
                .get("id")
                .and_then(Value::as_str)
                .and_then(|raw| Uuid::parse_str(raw).ok())
            {
                attach(child, nodes, entries, id);
            }
        }
        parent_obj.insert("children".to_owned(), Value::Array(child_values));
    }

    for root in &mut roots {
        if let Some(id) = root
            .get("id")
            .and_then(Value::as_str)
            .and_then(|raw| Uuid::parse_str(raw).ok())
        {
            attach(root, &nodes, &entries, id);
        }
    }

    roots
}
