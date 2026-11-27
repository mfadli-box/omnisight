use crate::{
    domain::auth::hris_client::{CredentialProof, HrisReply, LoginError},
    infrastructure::hris::HrisClient,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, SaltString},
    Argon2, PasswordHasher, PasswordVerifier,
};
use sqlx::{types::Uuid, PgPool};

/// Ambil identitas dan URL HRIS dari penempatan resmi pegawai.
pub async fn verify_credentials(
    db: &PgPool,
    hris: &HrisClient,
    username: &str,
    password: &str,
) -> Result<CredentialProof, LoginError> {
    verify_identity(db, hris, username, password)
        .await
        .map(|(_, proof)| proof)
}

pub(crate) async fn verify_identity(
    db: &PgPool,
    hris: &HrisClient,
    username: &str,
    password: &str,
) -> Result<(Uuid, CredentialProof), LoginError> {
    let (id, company, linked, endpoint, local, backup) = sqlx::query_as::<_, (Uuid, Uuid, bool, Option<String>, Option<String>, Option<String>)>(
        "SELECT u.user_id, c.company_id, c.has_hris_link, c.hris_login_url, u.password_hash, u.hris_backup_password
         FROM dat_user u JOIN dat_employee e ON e.user_id = u.user_id
         JOIN dat_company c ON c.company_id = e.home_company_id
         WHERE u.username = $1 AND u.is_active AND e.is_active AND c.is_active"
    ).bind(username).fetch_optional(db).await.map_err(|_| LoginError::Persistence)?.ok_or(LoginError::Denied)?;

    if !linked {
        verify_hash(local, password).await?;
        return Ok((id, CredentialProof::Local));
    }

    let reply = hris
        .login(
            endpoint.as_deref().ok_or(LoginError::Configuration)?,
            username,
            password,
        )
        .await?;
    let status = match &reply {
        HrisReply::Accepted(_) => "SUCCESS",
        HrisReply::Denied => "INVALID_PASS",
        HrisReply::Unavailable => "UNAVAILABLE",
    };
    if sqlx::query(
        "INSERT INTO log_hris_auth_sync(company_id,user_id,username,auth_source,hris_status)
        VALUES ($1,$2,$3,'HRIS_PRIMARY',$4)",
    )
    .bind(company)
    .bind(id)
    .bind(username)
    .bind(status)
    .execute(db)
    .await
    .is_err()
    {
        tracing::warn!("Pencatatan observasi HRIS tertunda");
    }
    let proof = resolve_reply(reply, backup.clone(), password).await?;
    if matches!(proof, CredentialProof::Hris { .. }) {
        let password = password.to_owned();
        let hash = tokio::task::spawn_blocking(move || {
            Argon2::default()
                .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
                .map(|hash| hash.to_string())
                .map_err(|_| LoginError::PasswordProcessing)
        })
        .await
        .map_err(|_| LoginError::PasswordProcessing)??;
        let updated = sqlx::query("UPDATE dat_user SET hris_backup_password = $1 WHERE user_id = $2 AND is_active AND hris_backup_password IS NOT DISTINCT FROM $3")
            .bind(hash).bind(id).bind(backup).execute(db).await.map_err(|_| LoginError::Persistence)?;
        if updated.rows_affected() != 1 {
            return Err(LoginError::Persistence);
        }
    }
    Ok((id, proof))
}

async fn resolve_reply(
    reply: HrisReply,
    backup: Option<String>,
    password: &str,
) -> Result<CredentialProof, LoginError> {
    match reply {
        HrisReply::Accepted(token) => Ok(CredentialProof::Hris { token }),
        HrisReply::Denied => Err(LoginError::Denied),
        HrisReply::Unavailable => {
            verify_hash(backup, password).await?;
            Ok(CredentialProof::Recovery)
        }
    }
}

async fn verify_hash(hash: Option<String>, password: &str) -> Result<(), LoginError> {
    let hash = hash.ok_or(LoginError::Denied)?;
    let password = password.to_owned();
    tokio::task::spawn_blocking(move || {
        let parsed = PasswordHash::new(&hash).map_err(|_| LoginError::Denied)?;
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| LoginError::Denied)
    })
    .await
    .map_err(|_| LoginError::PasswordProcessing)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hris_login_recovery_requires_matching_backup_and_explicit_denial_is_final() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        let secret = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(
                secret.as_str().as_bytes(),
                &SaltString::generate(&mut OsRng),
            )
            .unwrap()
            .to_string();
        rt.block_on(async {
            assert!(matches!(
                resolve_reply(HrisReply::Unavailable, Some(hash.clone()), secret.as_str()).await,
                Ok(CredentialProof::Recovery)
            ));
            assert!(matches!(
                resolve_reply(HrisReply::Denied, Some(hash.clone()), secret.as_str()).await,
                Err(LoginError::Denied)
            ));
            assert!(matches!(
                resolve_reply(HrisReply::Unavailable, Some(hash), "").await,
                Err(LoginError::Denied)
            ));
            assert!(matches!(
                resolve_reply(HrisReply::Unavailable, None, secret.as_str()).await,
                Err(LoginError::Denied)
            ));
        });
    }
}
