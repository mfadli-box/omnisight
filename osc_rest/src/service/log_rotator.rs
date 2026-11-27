use sqlx::PgPool;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub async fn run(db: PgPool) {
    loop {
        let mut failed = false;
        for parent in [
            "log_security_guard",
            "log_agent_telemetry",
            "log_pam_session",
        ] {
            let result = sqlx::query("SELECT cm03_rotate_logs($1)")
                .bind(parent)
                .execute(&db)
                .await;
            if let Err(error) = result {
                tracing::error!(parent, %error, "log rotation failed");
                failed = true;
            }
        }
        let seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let until_midnight_utc = 86400 - seconds % 86400;
        let delay = if failed {
            until_midnight_utc.min(300)
        } else {
            until_midnight_utc
        };
        tokio::time::sleep(Duration::from_secs(delay)).await;
    }
}
