use sqlx::PgPool;
use std::{
    collections::HashSet,
    error::Error,
    fs::{self, File},
    io::{self, Write},
    net::{IpAddr, SocketAddr},
    path::Path,
    process::Command,
};
use tempfile::NamedTempFile;

type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;
const CONFIG: &str = "/etc/nginx/conf.d/omnisight.conf";
const LIVE: &str = "/etc/letsencrypt/live";

fn render(
    domain: &str,
    upstream: SocketAddr,
    allowed: &HashSet<SocketAddr>,
    live: &Path,
) -> Result<String> {
    let valid_domain = !domain.is_empty()
        && domain.len() <= 253
        && domain.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        });
    if !valid_domain || !allowed.contains(&upstream) || upstream.port() == 0 {
        return Err("invalid proxy domain or unapproved upstream".into());
    }
    let cert = live.join(domain);
    let cert = cert.display();
    Ok(format!(
        r#"server {{
    listen 443 ssl;
    server_name {domain};
    ssl_certificate {cert}/fullchain.pem;
    ssl_certificate_key {cert}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {{
        proxy_pass http://{upstream};
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header X-Frame-Options;
        proxy_hide_header X-Content-Type-Options;
        proxy_hide_header X-XSS-Protection;
    }}
}}
"#
    ))
}

fn install(config: &Path, contents: &[u8]) -> io::Result<()> {
    let mut staged = NamedTempFile::new_in(config.parent().unwrap())?;
    staged.write_all(contents)?;
    staged.as_file().sync_all()?;
    staged.persist(config)?;
    Ok(())
}

fn apply(
    config: &Path,
    contents: &str,
    mut nginx: impl FnMut(&[&str]) -> io::Result<()>,
) -> io::Result<()> {
    let previous = match fs::read(config) {
        Ok(bytes) => Some(bytes),
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => return Err(e),
    };
    install(config, contents.as_bytes())?;
    if let Err(error) = nginx(&["-t"]).and_then(|()| nginx(&["-s", "reload"])) {
        match previous {
            Some(bytes) => install(config, &bytes)?,
            None => fs::remove_file(config)?,
        }
        return Err(error);
    }
    Ok(())
}

pub async fn sync(pool: &PgPool, allowed: &HashSet<SocketAddr>) -> Result<()> {
    let config = Path::new(CONFIG);
    let lock = File::options()
        .create(true)
        .truncate(false)
        .write(true)
        .open(config.with_extension("lock"))?;
    lock.try_lock()?;
    let hosts = sqlx::query_as::<_, (String, String, i32)>(
        "SELECT domain_name, host(upstream_address), upstream_port FROM dat_proxy_host WHERE is_active ORDER BY domain_name",
    ).fetch_all(pool).await?;
    let mut contents = String::new();
    for (domain, address, port) in hosts {
        let upstream = SocketAddr::new(address.parse::<IpAddr>()?, port.try_into()?);
        contents.push_str(&render(&domain, upstream, allowed, Path::new(LIVE))?);
    }
    tokio::task::spawn_blocking(move || {
        let _lock = lock;
        apply(config, &contents, |args| {
            let status = Command::new("nginx")
                .args(args)
                .args(["-c", "/etc/nginx/nginx.conf"])
                .status()?;
            if status.success() {
                Ok(())
            } else {
                Err(io::Error::other(format!(
                    "nginx {args:?} failed ({status})"
                )))
            }
        })
    })
    .await??;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn template(domain: &str, port: u16, live: &Path) -> Result<String> {
        let allowed = "[::1]:8080".parse::<SocketAddr>()?;
        render(
            domain,
            SocketAddr::new(allowed.ip(), port),
            &HashSet::from([allowed]),
            live,
        )
    }

    #[test]
    fn tls_headers_and_acme_files() {
        let config = template("app.example.test", 8080, Path::new(LIVE)).unwrap();
        for directive in [
            "add_header X-Frame-Options SAMEORIGIN always;",
            "add_header X-Content-Type-Options nosniff always;",
            "add_header X-XSS-Protection \"1; mode=block\" always;",
            "ssl_protocols TLSv1.2 TLSv1.3;",
            "ssl_certificate /etc/letsencrypt/live/app.example.test/fullchain.pem;",
            "ssl_certificate_key /etc/letsencrypt/live/app.example.test/privkey.pem;",
            "proxy_pass http://[::1]:8080;",
        ] {
            assert!(config.lines().any(|line| line.trim() == directive));
        }
    }

    #[test]
    fn rejects_unsafe_identifiers_and_unapproved_targets() {
        for domain in [
            "",
            "../other",
            "x;include",
            "x\ny",
            "x..y",
            "*.test",
            "-bad",
        ] {
            assert!(template(domain, 8080, Path::new(LIVE)).is_err());
        }
        assert!(template("app.test", 8081, Path::new(LIVE)).is_err());
    }

    #[test]
    fn failed_validation_restores_previous_config_and_skips_reload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("managed.conf");
        fs::write(&path, "previous").unwrap();
        let result = apply(&path, "candidate", |args| {
            assert_eq!(args, ["-t"]);
            assert_eq!(fs::read_to_string(&path)?, "candidate");
            Err(io::Error::other("invalid configuration"))
        });
        assert!(result.is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "previous");
    }

    #[test]
    fn successful_validation_precedes_reload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("managed.conf");
        let mut calls = Vec::new();
        apply(&path, "candidate", |args| {
            calls.push(args.join(" "));
            Ok(())
        })
        .unwrap();
        assert_eq!(calls, ["-t", "-s reload"]);
        assert_eq!(fs::read_to_string(path).unwrap(), "candidate");
    }

    #[test]
    #[ignore = "requires nginx with SSL support and openssl"]
    fn nginx_accepts_generated_config() -> Result<()> {
        let dir = tempfile::tempdir()?;
        fs::create_dir(dir.path().join("logs"))?;
        let cert = dir.path().join("app.example.test");
        fs::create_dir(&cert)?;
        let keypair = Command::new("openssl")
            .current_dir(&cert)
            .args([
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=app.example.test",
                "-keyout",
                "privkey.pem",
                "-out",
                "fullchain.pem",
            ])
            .output()?;
        assert!(keypair.status.success());
        fs::write(
            dir.path().join("managed.conf"),
            template("app.example.test", 8080, dir.path())?,
        )?;
        fs::write(dir.path().join("nginx.conf"), "error_log stderr; pid nginx.pid; events {} http { access_log off; client_body_temp_path body; proxy_temp_path proxy; fastcgi_temp_path fastcgi; uwsgi_temp_path uwsgi; scgi_temp_path scgi; include managed.conf; }")?;
        let status = Command::new("nginx")
            .arg("-p")
            .arg(dir.path())
            .args(["-c", "nginx.conf", "-t"])
            .status()?;
        assert!(status.success());
        Ok(())
    }
}
