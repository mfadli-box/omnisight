//! Handler RustFS Files: upload multipart → objek privat (key acak UUIDv7
//! per-tenant), daftar metadata, presigned URL TTL pendek (bukan URL publik).

use axum::Json;
use axum::extract::{Multipart, Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;
use uuid::Uuid;

use crate::infrastructure::store::files::FileMetaNew;
use crate::presentation::error::AppError;
use crate::presentation::http::middleware::request_context::AuthContext;
use crate::presentation::http::state::AppState;

/// Batas ukuran upload file (25 MB) — dipasang via DefaultBodyLimit.
pub const MAX_UPLOAD_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Deserialize)]
pub struct FileListQuery {
    pub limit: Option<i64>,
}

/// `GET /api/v1/files` — metadata file tenant aktif.
pub async fn list(
    State(state): State<AppState>,
    ctx: AuthContext,
    Query(query): Query<FileListQuery>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let rows = state
        .store
        .file_list(company_id, query.limit.unwrap_or(50))
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": { "files": rows, "count": rows.len() }
    })))
}

/// `POST /api/v1/files` (multipart `file`) — MIME allowlist + key acak
/// `company/uuid.ext` (anti path-traversal), ukuran ≤ 25 MB.
pub async fn upload(
    State(state): State<AppState>,
    ctx: AuthContext,
    mut multipart: Multipart,
) -> Result<Response, AppError> {
    let company_id = ctx.require_company()?;

    let mut stored: Option<Value> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| AppError::Validation("multipart tidak valid".into()))?
    {
        if field.name() != Some("file") {
            continue;
        }
        let file_name = field.file_name().unwrap_or("upload.bin").to_owned();
        let mime_type = field
            .content_type()
            .map(str::to_owned)
            .unwrap_or_else(|| "application/octet-stream".into());

        // MIME allowlist (attachments umum; PAM record masuk lewat agent W3).
        let allowed = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/zip",
            "image/png",
            "image/jpeg",
            "text/plain",
            "text/csv",
        ];
        if !allowed.iter().any(|a| mime_type.starts_with(a)) {
            return Err(AppError::Validation(format!("mime-type `{mime_type}` tidak diizinkan")));
        }

        let bytes = field
            .bytes()
            .await
            .map_err(|_| AppError::PayloadTooLarge)?;
        if bytes.len() > MAX_UPLOAD_BYTES {
            return Err(AppError::PayloadTooLarge);
        }
        if bytes.is_empty() {
            return Err(AppError::Validation("file kosong".into()));
        }

        // SHA-256 integritas + object key acak (UUIDv7, ext aman).
        let sha256 = crate::infrastructure::crypto::sha256_hex(&bytes);
        let object_key = format!(
            "{company_id}/{}{ext}",
            Uuid::now_v7().simple(),
            ext = safe_extension(&file_name),
        );

        state
            .storage
            .put_object(&object_key, bytes.to_vec(), &mime_type)
            .await
            .map_err(AppError::from)?;

        let file_id = state
            .store
            .file_create(FileMetaNew {
                company_id,
                category: "ATTACHMENT",
                bucket: state.storage.bucket().to_owned(),
                object_key,
                file_name: sanitize_file_name(&file_name),
                mime_type: Some(mime_type),
                size_bytes: bytes.len() as i64,
                sha256: Some(sha256),
                uploaded_by_user_id: Some(ctx.user_id),
            })
            .await
            .map_err(AppError::from)?;

        stored = Some(json!({
            "id": file_id,
            "size_bytes": bytes.len(),
            "category": "ATTACHMENT"
        }));
        break; // satu file per request (simple & predictable)
    }

    let stored = stored.ok_or(AppError::Validation("field `file` wajib diisi".into()))?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "status": "success", "data": { "file": stored } })),
    )
        .into_response())
}

/// `GET /api/v1/files/{id}` — metadata + presigned URL (TTL 5 menit).
pub async fn get(
    State(state): State<AppState>,
    ctx: AuthContext,
    Path(file_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let company_id = ctx.require_company()?;
    let meta = state
        .store
        .file_get(company_id, file_id)
        .await
        .map_err(AppError::from)?;
    let object_key = meta
        .get("object_key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();

    let presigned = state
        .storage
        .presign_get(&object_key, Duration::from_secs(300))
        .await
        .map_err(AppError::from)?;

    Ok(Json(json!({
        "status": "success",
        "data": {
            "file": meta,
            "presigned_url": presigned,
            "expires_in": 300
        }
    })))
}

/// Ekstensi file aman: hanya huruf/angka ≤ 8 char, tanpa path.
fn safe_extension(file_name: &str) -> String {
    match file_name.rsplit_once('.') {
        Some((_, ext)) if !ext.is_empty() && ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric()) => {
            format!(".{ext}")
        }
        _ => String::new(),
    }
}

/// Nama file tampilan: buang karakter path/ kontrol.
fn sanitize_file_name(file_name: &str) -> String {
    let cleaned: String = file_name
        .chars()
        .filter(|c| {
            c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ' | '(' | ')')
        })
        .take(255)
        .collect();
    if cleaned.is_empty() {
        "upload.bin".into()
    } else {
        cleaned.trim().to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_extension_menolak_path_traversal() {
        assert_eq!(safe_extension("laporan.xlsx"), ".xlsx");
        assert_eq!(safe_extension("evil.php.txt"), ".txt");
        assert_eq!(safe_extension("../../etc/passwd"), "");
        assert_eq!(safe_extension("noext"), "");
        assert_eq!(safe_extension("terlalupanjang.xxxxxxxx9"), "");
    }

    #[test]
    fn sanitize_file_name_membersihkan_karakter_berbahaya() {
        assert_eq!(sanitize_file_name("a/b\\c?d"), "abcd");
        assert_eq!(sanitize_file_name(""), "upload.bin");
    }
}
