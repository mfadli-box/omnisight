//! Validator deklaratif infrastruktur Wave 2 (pure logic — tanpa I/O).
//!
//! - `compose.yaml` (Docker Stack): validasi struktural app-level; parse
//!   penuh compose-go tetap dilakukan agent `infra_control` saat dispatch.
//! - Blok config nginx: keseimbangan brace + directive `server` wajib.
//! - `working_dir`: anti path traversal (komponen `..`, `~`, backslash,
//!   karakter kontrol ditolak).
//!
//! Validasi dijalankan pada create/update SEBELUM backup/dispatch
//! (pola pipeline nginx-ui: validasi -> backup -> dispatch -> rollback).

/// Batas ukuran konten compose.yaml (256 KB) — anti payload bomb.
pub const MAX_COMPOSE_BYTES: usize = 256 * 1024;
/// Batas ukuran konten server block nginx (128 KB).
pub const MAX_NGINX_BYTES: usize = 128 * 1024;
/// Batas panjang path kerja stack.
const MAX_PATH_LEN: usize = 500;

/// Top-level key compose spec yang diizinkan (allowlist; `include` sengaja
/// dilarang karena memuat file di luar konteks yang tervalidasi).
const COMPOSE_TOP_KEYS: &[&str] = &[
    "services", "networks", "volumes", "configs", "secrets", "name", "version",
];

/// Baris efektif: (indentasi spasi, teks tanpa komentar/whitespace).
type Line<'a> = (usize, &'a str);

/// Tokenisasi ringan: buang komentar & baris kosong; tab pada indentasi
/// ditolak (compose spec melarang tab).
fn tokenize(content: &str) -> Result<Vec<Line<'_>>, String> {
    let mut out = Vec::new();
    for raw in content.lines() {
        let no_comment = match raw.find(" #") {
            Some(idx) => &raw[..idx],
            None => raw,
        };
        let trimmed = no_comment.trim();
        if trimmed.is_empty() {
            continue;
        }
        let indent = no_comment.len() - no_comment.trim_start().len();
        if no_comment[..indent].contains('\t') {
            return Err("indentasi tab ditolak — compose.yaml wajib memakai spasi".into());
        }
        out.push((indent, trimmed));
    }
    Ok(out)
}

/// Key dari baris `key:` / `key: value` bila memang bentuk mapping key
/// (plain key tanpa kutip/bracket — cukup untuk gerbang struktural).
fn mapping_key(line: &str) -> Option<&str> {
    let (key, _rest) = line.split_once(':')?;
    let key = key.trim();
    let plain = !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    plain.then_some(key)
}

/// Validasi `working_dir` stack — path absolut host, tanpa traversal.
pub fn validate_working_dir(raw: &str) -> Result<String, String> {
    let path = raw.trim();
    if path.is_empty() {
        return Err("working_dir wajib diisi".into());
    }
    if path.len() > MAX_PATH_LEN {
        return Err("working_dir melebihi 500 karakter".into());
    }
    if !path.starts_with('/') {
        return Err("working_dir harus path absolut host (mulai dari /)".into());
    }
    if path.contains('\\') || path.contains('\0') || path.chars().any(char::is_control) {
        return Err("working_dir memuat karakter tidak sah".into());
    }
    let components: Vec<&str> = path.split('/').filter(|c| !c.is_empty()).collect();
    if components.is_empty() {
        return Err("working_dir tidak valid".into());
    }
    if components.iter().any(|c| *c == "." || *c == "..") {
        return Err(
            "working_dir tidak boleh memuat komponen '.' atau '..' (anti path traversal)".into(),
        );
    }
    if components.iter().any(|c| c.starts_with('~')) {
        return Err("working_dir tidak boleh memuat ekspansi '~'".into());
    }
    Ok(format!("/{}", components.join("/")))
}

/// Validasi struktural `compose.yaml`:
/// 1. ukuran ≤ `MAX_COMPOSE_BYTES`;
/// 2. top-level key hanya dari allowlist & wajib memuat `services`;
/// 3. minimal satu service dan tiap service punya `image:` atau `build:`.
pub fn validate_compose(content: &str) -> Result<(), String> {
    if content.len() > MAX_COMPOSE_BYTES {
        return Err(format!("compose.yaml melebihi {MAX_COMPOSE_BYTES} byte"));
    }
    if content.trim().is_empty() {
        return Err("compose.yaml kosong".into());
    }

    let lines = tokenize(content)?;
    let mut seen_services = false;
    let mut i = 0;
    while i < lines.len() {
        let (indent, text) = lines[i];
        if indent != 0 {
            i += 1;
            continue;
        }
        let Some(key) = mapping_key(text) else {
            i += 1;
            continue;
        };
        if !COMPOSE_TOP_KEYS.contains(&key) {
            return Err(format!("top-level key `{key}` tidak ada dalam compose spec"));
        }
        if key == "services" {
            seen_services = true;
            validate_services_block(&lines[i + 1..])?;
        }
        i += 1;
    }
    if !seen_services {
        return Err("compose.yaml wajib memuat top-level key `services:`".into());
    }
    Ok(())
}

/// Validasi blok services (baris setelah `services:` sampai top-level berikut).
fn validate_services_block(lines: &[Line<'_>]) -> Result<(), String> {
    let Some(&(svc_indent, _)) = lines.first() else {
        return Err("compose.yaml belum mendefinisikan service apa pun".into());
    };

    let mut service: Option<String> = None;
    let mut has_source = false;
    let mut idx = 0;
    while idx < lines.len() {
        let (indent, text) = lines[idx];
        if indent < svc_indent {
            // Keluar dari blok services (top-level key berikutnya).
            return finish_service(service.take(), has_source);
        }
        if indent == svc_indent {
            finish_service(service.take(), has_source)?;
            let key = mapping_key(text)
                .ok_or_else(|| format!("entry service tidak valid: `{text}`"))?;
            service = Some(key.to_owned());
            has_source = false;
        } else {
            // Properti di dalam service — cari sumber build.
            if let Some((prop, _)) = text.split_once(':')
                && (prop.trim() == "image" || prop.trim() == "build")
            {
                has_source = true;
            }
        }
        idx += 1;
    }
    finish_service(service.take(), has_source)
}

fn finish_service(service: Option<String>, has_source: bool) -> Result<(), String> {
    match service {
        Some(name) if !has_source => Err(format!(
            "service `{name}` wajib memuat `image:` atau `build:`"
        )),
        _ => Ok(()),
    }
}

/// Validasi blok config nginx (server block):
/// 1. ukuran ≤ `MAX_NGINX_BYTES`;
/// 2. brace seimbang (di luar komentar & string) — anti config malform
///    yang mematikan `nginx -t`;
/// 3. memuat directive `server {`;
/// 4. `include` tanpa path traversal & hanya path absolut/wildcard.
pub fn validate_nginx_config(content: &str) -> Result<(), String> {
    if content.len() > MAX_NGINX_BYTES {
        return Err(format!("config nginx melebihi {MAX_NGINX_BYTES} byte"));
    }
    if content.trim().is_empty() {
        return Err("config nginx kosong".into());
    }

    let mut depth: i64 = 0;
    let mut in_comment = false;
    let mut in_string: Option<char> = None;
    let mut prev: Option<char> = None;
    for ch in content.chars() {
        if in_comment {
            if ch == '\n' {
                in_comment = false;
            }
            prev = Some(ch);
            continue;
        }
        match in_string {
            Some(quote) => {
                if ch == quote && prev != Some('\\') {
                    in_string = None;
                }
            }
            None => match ch {
                '#' => in_comment = true,
                '"' | '\'' => in_string = Some(ch),
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth < 0 {
                        return Err("config nginx: brace `}}` tidak seimbang".into());
                    }
                }
                _ => {}
            },
        }
        prev = Some(ch);
    }
    if depth != 0 {
        return Err("config nginx: brace tidak seimbang (kurang `}}` atau `{{`)".into());
    }

    let has_server = content.lines().any(|raw| {
        let line = raw.split('#').next().unwrap_or(raw).trim_start();
        line == "server {" || line == "server{" || (line.starts_with("server ") || line.starts_with("server\t")) && line.contains('{')
    });
    if !has_server {
        return Err("config nginx wajib memuat blok `server { ... }`".into());
    }

    for raw in content.lines() {
        let line = raw.split('#').next().unwrap_or(raw).trim();
        let Some(rest) = line.strip_prefix("include ") else { continue };
        let target = rest.trim().trim_end_matches(';').trim();
        if target.contains("..") {
            return Err("config nginx: `include` dengan path traversal ditolak".into());
        }
        if !target.starts_with('/') && !target.contains('*') {
            return Err(format!("config nginx: `include {target}` harus path absolut atau wildcard"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn working_dir_menolak_traversal() {
        assert_eq!(
            validate_working_dir("/opt/stacks/monitoring"),
            Ok("/opt/stacks/monitoring".into())
        );
        assert_eq!(validate_working_dir("/opt//stacks/x"), Ok("/opt/stacks/x".into()));
        assert!(validate_working_dir("/opt/../etc").is_err());
        assert!(validate_working_dir("/opt/stacks/./x").is_err());
        assert!(validate_working_dir("opt/relative").is_err());
        assert!(validate_working_dir("/opt/~root").is_err());
        assert!(validate_working_dir("/opt/back\\slash").is_err());
        assert!(validate_working_dir("").is_err());
        assert!(validate_working_dir("/").is_err());
    }

    #[test]
    fn compose_menerima_stack_standar() {
        let ok = "services:\n  web:\n    image: nginx:1.27\n    ports:\n      - 80:80\nnetworks:\n  default: {}\n";
        assert_eq!(validate_compose(ok), Ok(()));

        let build = "services:\n  app:\n    build:\n      context: ./app\n";
        assert_eq!(validate_compose(build), Ok(()));
    }

    #[test]
    fn compose_menolak_top_level_asing_dan_service_tanpa_source() {
        let no_services = "version: \"3\"\nvolumes: {}\n";
        assert!(validate_compose(no_services).is_err());

        let foreign = "services:\n  web:\n    image: nginx\nx-include: ../etc\n";
        assert!(validate_compose(foreign).is_err());

        let no_image = "services:\n  web:\n    ports:\n      - 80\n";
        assert!(validate_compose(no_image).is_err());

        let second_bad = "services:\n  a:\n    image: nginx\n  b:\n    ports:\n      - 81\n";
        assert!(validate_compose(second_bad).is_err());

        let include = "include:\n  - /etc/passwd\nservices:\n  a:\n    image: b\n";
        assert!(validate_compose(include).is_err());

        assert!(validate_compose("").is_err());
        assert!(validate_compose(&"x".repeat(MAX_COMPOSE_BYTES + 1)).is_err());
        assert!(validate_compose("services:\n\tweb:\n\t  image: x\n").is_err());
    }

    #[test]
    fn nginx_menolak_brace_gagal_dan_traversal() {
        let ok = "server {\n  listen 80;\n  server_name app.example.com;\n  location / {\n    proxy_pass http://app;\n  }\n}\n";
        assert_eq!(validate_nginx_config(ok), Ok(()));

        let unbalanced = "server {\n  listen 80;\n";
        assert!(validate_nginx_config(unbalanced).is_err());

        let extra_close = "server {\n  listen 80;\n}}\n";
        assert!(validate_nginx_config(extra_close).is_err());

        let no_server = "upstream app { server 127.0.0.1:8080; }\n";
        assert!(validate_nginx_config(no_server).is_err());

        let traversal = "server {\n  listen 80;\n  include ../../etc/passwd;\n}\n";
        assert!(validate_nginx_config(traversal).is_err());

        let comment_server = "# server { \nproxy_pass x;\n";
        assert!(validate_nginx_config(comment_server).is_err());
    }
}
