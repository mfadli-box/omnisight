//! Correlation tracing (standar observability skill ai-rest):
//!
//! - Setiap request (HTTP maupun WS) membawa `X-Correlation-ID`:
//!   di-ekstrak dari header klien bila valid, atau di-generate (UUIDv7).
//! - ID menempel pada tracing span — SEMUA log event dalam request
//!   otomatis membawa field `correlation_id` (log JSON).
//! - Header yang sama selalu dikirim balik ke klien.
//! - Envelope error JSON (`{status, error: {…}}`) disisipi field
//!   `correlation_id` agar konsumen API (osc_site/ai-test) dapat
//!   melaporkannya tanpa membaca header.

use axum::body::Body;
use axum::extract::Request;
use axum::http::HeaderValue;
use axum::http::header;
use axum::middleware::Next;
use axum::response::Response;
use serde_json::json;
use tracing::Instrument;
use uuid::Uuid;

pub const CORRELATION_ID_HEADER: &str = "X-Correlation-ID";

/// Batas aman: cukup untuk UUID/ULID, mencegah header raksasa masuk log.
const MAX_CORRELATION_ID_LEN: usize = 64;

/// Batas buffering saat menyisipkan `correlation_id` ke body error JSON.
const MAX_ERROR_BODY_BYTES: usize = 64 * 1024;

/// ID korelasi request — tersedia sebagai extractor untuk handler yang
/// perlu meneruskannya ke panggilan downstream.
#[derive(Debug, Clone)]
pub struct CorrelationId(
    #[allow(dead_code)] // dibaca handler fase fitur (auth/excel) via extractor
    pub  String,
);

impl CorrelationId {
    #[allow(dead_code)] // konsumennya fase fitur (auth/excel)
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Validasi nilai header dari klien: kosong, terlalu panjang, atau
/// mengandung karakter di luar whitelist ditolak → generate baru.
/// Whitelist menutup log injection (CRLF/karakter kontrol).
fn sanitize(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    let valid = !value.is_empty()
        && value.len() <= MAX_CORRELATION_ID_LEN
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'/'));
    valid.then(|| value.to_owned())
}

/// Middleware correlation ID — pasang pada router untuk SEMUA route.
pub async fn correlation_id(mut req: Request, next: Next) -> Response {
    let incoming = sanitize(
        req.headers()
            .get(CORRELATION_ID_HEADER)
            .and_then(|value| value.to_str().ok()),
    );
    let generated = incoming.is_none();
    let id = incoming.unwrap_or_else(|| Uuid::now_v7().to_string());

    let span = tracing::info_span!(
        "http_request",
        correlation_id = %id,
        generated = generated,
        http.method = %req.method(),
        http.path = %req.uri().path(),
    );
    req.extensions_mut().insert(CorrelationId(id.clone()));

    async move {
        let mut res = next.run(req).await;

        if let Ok(value) = HeaderValue::from_str(&id) {
            res.headers_mut().insert(CORRELATION_ID_HEADER, value);
        }

        if res.status().is_client_error() || res.status().is_server_error() {
            inject_into_error_body(&mut res, &id).await;
        }

        tracing::debug!(status = res.status().as_u16(), "request selesai");
        res
    }
    .instrument(span)
    .await
}

/// Sisipkan `correlation_id` ke envelope error JSON. Body di-buffer dengan
/// batas ketat; jalur streaming (SSE) dan upgrade WS (status 101) tidak
/// pernah menyentuh jalur ini karena statusnya bukan error.
async fn inject_into_error_body(res: &mut Response, id: &str) {
    let is_json = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("application/json"));
    if !is_json {
        return;
    }

    let bytes =
        match axum::body::to_bytes(std::mem::take(res.body_mut()), MAX_ERROR_BODY_BYTES).await {
            Ok(bytes) => bytes,
            // Body streaming/oversize — biarkan utuh tanpa field tambahan.
            Err(_) => return,
        };

    let mut envelope: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(value) => value,
        // Bukan JSON valid (mis. body kosong dari fallback router) —
        // kembalikan body asli apa adanya.
        Err(_) => {
            *res.body_mut() = Body::from(bytes.to_vec());
            return;
        }
    };

    if let Some(object) = envelope.as_object_mut() {
        object.insert("correlation_id".to_owned(), json!(id));
    }

    let encoded = serde_json::to_vec(&envelope).unwrap_or_else(|_| bytes.to_vec());
    let headers = res.headers_mut();
    // Content-length lama tidak lagi cocok — hyper menyetel ulang dari
    // ukuran body baru (body JSON error selalu berukuran pasti).
    headers.remove(header::CONTENT_LENGTH);
    *res.body_mut() = Body::from(encoded);
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Json;
    use axum::Router;
    use axum::http::StatusCode;
    use axum::middleware as axum_middleware;
    use axum::routing::post;
    use tower::ServiceExt;

    async fn error_handler() -> (StatusCode, Json<serde_json::Value>) {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "status": "error",
                "error": { "code": "VALIDATION_ERROR", "message": "x tidak valid" }
            })),
        )
    }

    async fn ok_handler() -> (StatusCode, Json<serde_json::Value>) {
        (StatusCode::OK, Json(json!({ "status": "ok" })))
    }

    fn app_error() -> Router {
        Router::new()
            .route("/fail", post(error_handler))
            .layer(axum_middleware::from_fn(correlation_id))
    }

    fn app_ok() -> Router {
        Router::new()
            .route("/ok", post(ok_handler))
            .layer(axum_middleware::from_fn(correlation_id))
    }

    fn request(header_value: Option<&str>) -> Request<Body> {
        let mut builder = axum::http::Request::builder().method("POST").uri("/fail");
        if let Some(value) = header_value {
            builder = builder.header(CORRELATION_ID_HEADER, value);
        }
        builder.body(Body::empty()).unwrap()
    }

    fn ok_request() -> Request<Body> {
        axum::http::Request::builder()
            .method("POST")
            .uri("/ok")
            .body(Body::empty())
            .unwrap()
    }

    async fn body_json(response: Response) -> serde_json::Value {
        let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    fn header_of(response: &Response) -> Option<&str> {
        response
            .headers()
            .get(CORRELATION_ID_HEADER)
            .and_then(|value| value.to_str().ok())
    }

    #[tokio::test]
    async fn tanpa_header_id_digenerate_dan_muncul_di_header_dan_body() {
        let res = app_error().oneshot(request(None)).await.unwrap();

        let header = header_of(&res)
            .expect("header X-Correlation-ID wajib ada")
            .to_owned();
        assert!(header.len() >= 16, "id generate terlalu pendek: {header}");
        assert!(
            header
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-'),
            "bukan UUID: {header}"
        );

        let body = body_json(res).await;
        assert_eq!(body["correlation_id"], json!(header));
    }

    #[tokio::test]
    async fn header_valid_echo_persis() {
        let res = app_error()
            .oneshot(request(Some("corr-abc_123.x")))
            .await
            .unwrap();
        assert_eq!(header_of(&res), Some("corr-abc_123.x"));

        let body = body_json(res).await;
        assert_eq!(body["correlation_id"], json!("corr-abc_123.x"));
    }

    #[tokio::test]
    async fn header_tidak_valid_digantikan_id_baru() {
        for invalid in ["<script>", "a b", &"x".repeat(65)] {
            let req = request(Some(invalid));
            let res = app_error().oneshot(req).await.unwrap();
            let header = header_of(&res).expect("harus digenerate").to_owned();
            assert_ne!(header, invalid, "harus ditolak: {invalid}");
            assert!(header.bytes().all(|b| b.is_ascii_graphic() && b != b' '));
        }
    }

    #[tokio::test]
    async fn respons_sukses_tidak_disisipi_field_body() {
        let res = app_ok().oneshot(ok_request()).await.unwrap();

        assert!(header_of(&res).is_some(), "header tetap dipasang");
        let body = body_json(res).await;
        assert!(
            body.get("correlation_id").is_none(),
            "200 tidak diubah: {body}"
        );
    }

    #[tokio::test]
    async fn respons_error_non_json_tidak_disentuh() {
        let app = Router::new()
            .route(
                "/plain",
                post(|| async { (StatusCode::BAD_REQUEST, "bad request text") }),
            )
            .layer(axum_middleware::from_fn(correlation_id));

        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/plain")
            .body(Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();

        assert!(header_of(&res).is_some());
        let bytes = axum::body::to_bytes(res.into_body(), 1024).await.unwrap();
        assert_eq!(bytes.as_ref(), b"bad request text");
    }

    #[test]
    fn sanitize_menerima_dan_menolak_dengan_benar() {
        assert_eq!(
            sanitize(Some("abc-DEF_0123")),
            Some("abc-DEF_0123".to_owned())
        );
        assert_eq!(
            sanitize(Some("  spasi-ditunggal  ")),
            Some("spasi-ditunggal".to_owned())
        );
        assert_eq!(sanitize(None), None);
        assert_eq!(sanitize(Some("")), None);
        assert_eq!(sanitize(Some("   ")), None);
        assert_eq!(sanitize(Some("ada spasi")), None);
        assert_eq!(sanitize(Some(&"x".repeat(65))), None);
        // CRLF / karakter non-ASCII — ditolak sebelum sampai log.
        assert_eq!(sanitize(Some("jelek\r\ninj")), None);
        assert_eq!(sanitize(Some("kode-ö")), None);
    }
}
