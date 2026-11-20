use std::time::Duration;

use async_trait::async_trait;
use redis::{AsyncCommands, AsyncConnectionConfig, Script, aio::MultiplexedConnection};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    application::ports::{CachePort, MfaReset},
    domain::AuthError,
};

#[derive(Clone)]
pub struct RedisCache {
    client: redis::Client,
}

impl RedisCache {
    pub fn new(url: &str) -> Result<Self, AuthError> {
        Ok(Self {
            client: redis::Client::open(url).map_err(|_| AuthError::Configuration)?,
        })
    }
    async fn connection(&self) -> Result<MultiplexedConnection, AuthError> {
        self.client
            .get_multiplexed_async_connection_with_config(
                &AsyncConnectionConfig::new()
                    .set_connection_timeout(Some(Duration::from_secs(2)))
                    .set_response_timeout(Some(Duration::from_secs(2))),
            )
            .await
            .map_err(|_| AuthError::DependencyUnavailable)
    }
    pub async fn record_agent_heartbeat(
        &self,
        node_id: &str,
        timestamp: i64,
        payload: &str,
    ) -> Result<bool, AuthError> {
        let accepted: i64 = Script::new(
            r#"
            local previous = redis.call('GET', KEYS[1])
            if previous and cjson.decode(previous).timestamp >= tonumber(ARGV[1]) then
                return 0
            end
            redis.call('SET', KEYS[1], ARGV[2], 'EX', 900)
            return 1
            "#,
        )
        .key(format!("osc:agent:heartbeat:{node_id}"))
        .arg(timestamp)
        .arg(payload)
        .invoke_async(&mut self.connection().await?)
        .await
        .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(accepted == 1)
    }

    async fn reserve_attempt(&self, key: String, limit: i64, ttl: i64) -> Result<bool, AuthError> {
        let count: i64 = Script::new(
            "local n=tonumber(redis.call('GET',KEYS[1]) or '0')
             if n >= tonumber(ARGV[1]) then return 0 end
             n=redis.call('INCR',KEYS[1])
             if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[2]) end
             return n",
        )
        .key(key)
        .arg(limit)
        .arg(ttl)
        .invoke_async(&mut self.connection().await?)
        .await
        .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(count > 0)
    }
}

#[async_trait]
impl CachePort for RedisCache {
    async fn login_attempt_allowed(&self, username: &str) -> Result<bool, AuthError> {
        let mut con = self.connection().await?;
        let digest = Sha256::digest(username.to_lowercase().as_bytes());
        let allowed: i64 = Script::new(
            r#"
            local count = tonumber(redis.call('GET', KEYS[1]) or '0')
            if count >= 20 then return 0 end
            if redis.call('INCR', KEYS[1]) == 1 then redis.call('EXPIRE', KEYS[1], 60) end
            return 1
            "#,
        )
        .key(format!("osc:auth:login_attempts:{digest:x}"))
        .invoke_async(&mut con)
        .await
        .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(allowed == 1)
    }

    async fn circuit_is_open(&self, company_id: Uuid) -> Result<bool, AuthError> {
        let mut con = self.connection().await?;
        let key = format!("osc:hris:open:{company_id}");
        let exists: bool = con
            .exists(key)
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(exists)
    }
    async fn record_hris_failure(&self, company_id: Uuid) -> Result<(), AuthError> {
        let mut con = self.connection().await?;
        let failures = format!("osc:hris:failures:{company_id}");
        let open = format!("osc:hris:open:{company_id}");
        let script = Script::new(
            r#"
            if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
            local t = redis.call('TIME')
            local now = (tonumber(t[1]) * 1000) + math.floor(tonumber(t[2]) / 1000)
            redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 30000)
            redis.call('ZADD', KEYS[1], now, ARGV[1])
            redis.call('PEXPIRE', KEYS[1], 30000)
            local n = redis.call('ZCARD', KEYS[1])
            if n >= 5 then
              redis.call('SET', KEYS[2], '1', 'EX', 60)
              redis.call('DEL', KEYS[1])
            end
            return n
        "#,
        );
        let _: i64 = script
            .key(failures)
            .key(open)
            .arg(Uuid::new_v4().to_string())
            .invoke_async(&mut con)
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(())
    }
    async fn clear_hris_failures(&self, company_id: Uuid) -> Result<(), AuthError> {
        let mut con = self.connection().await?;
        let _: () = con
            .del(format!("osc:hris:failures:{company_id}"))
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(())
    }
    async fn mfa_attempt_allowed(&self, user_id: Uuid) -> Result<bool, AuthError> {
        self.reserve_attempt(format!("osc:mfa:failures:{user_id}"), 5, 900)
            .await
    }

    async fn reset_email_allowed(&self, email: &str) -> Result<bool, AuthError> {
        let digest = Sha256::digest(email.to_lowercase().as_bytes());
        self.reserve_attempt(format!("osc:mfa:email_attempts:{digest:x}"), 5, 900)
            .await
    }

    async fn record_step_up(&self, session_id: Uuid, timestamp: i64) -> Result<(), AuthError> {
        self.connection()
            .await?
            .set_ex(format!("osc:mfa:step_up:{session_id}"), timestamp, 900)
            .await
            .map_err(|_| AuthError::DependencyUnavailable)
    }

    async fn step_up_at(&self, session_id: Uuid) -> Result<Option<i64>, AuthError> {
        self.connection()
            .await?
            .get(format!("osc:mfa:step_up:{session_id}"))
            .await
            .map_err(|_| AuthError::DependencyUnavailable)
    }

    async fn clear_mfa_failures(&self, user_id: Uuid) -> Result<(), AuthError> {
        let mut con = self.connection().await?;
        let _: () = con
            .del(format!("osc:mfa:failures:{user_id}"))
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(())
    }
    async fn put_pending_mfa(&self, session_id: Uuid, secret: &str) -> Result<(), AuthError> {
        let mut con = self.connection().await?;
        let _: () = con
            .set_ex(format!("osc:mfa:pending:{session_id}"), secret, 600)
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(())
    }
    async fn get_pending_mfa(&self, session_id: Uuid) -> Result<Option<String>, AuthError> {
        let mut con = self.connection().await?;
        con.get(format!("osc:mfa:pending:{session_id}"))
            .await
            .map_err(|_| AuthError::DependencyUnavailable)
    }
    async fn clear_pending_mfa(&self, session_id: Uuid) -> Result<(), AuthError> {
        let mut con = self.connection().await?;
        let _: () = con
            .del(format!("osc:mfa:pending:{session_id}"))
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(())
    }
    async fn put_reset_token(&self, token_hash: &str, reset: &MfaReset) -> Result<(), AuthError> {
        let value = serde_json::to_string(reset).map_err(|_| AuthError::Internal)?;
        self.connection()
            .await?
            .set_ex(format!("osc:mfa:reset:{token_hash}"), value, 900)
            .await
            .map_err(|_| AuthError::DependencyUnavailable)
    }

    async fn consume_reset_token(&self, token_hash: &str) -> Result<Option<MfaReset>, AuthError> {
        let value: Option<String> = redis::cmd("GETDEL")
            .arg(format!("osc:mfa:reset:{token_hash}"))
            .query_async(&mut self.connection().await?)
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(value.and_then(|value| serde_json::from_str(&value).ok()))
    }

    async fn consume_mfa_challenge(&self, challenge_id: Uuid) -> Result<bool, AuthError> {
        let result: Option<String> = redis::cmd("SET")
            .arg(format!("osc:mfa:used_challenge:{challenge_id}"))
            .arg("1")
            .arg("NX")
            .arg("EX")
            .arg(300)
            .query_async(&mut self.connection().await?)
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(result.is_some())
    }

    async fn revoke_sessions(&self, user_id: Uuid, timestamp: i64) -> Result<(), AuthError> {
        let mut con = self.connection().await?;
        let _: i64 = Script::new(
            "local previous=tonumber(redis.call('GET',KEYS[1]) or '0')
             if tonumber(ARGV[1]) > previous then redis.call('SET',KEYS[1],ARGV[1]) end
             return 1",
        )
        .key(format!("osc:auth:revoked_before:{user_id}"))
        .arg(timestamp)
        .invoke_async(&mut con)
        .await
        .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(())
    }
    async fn session_is_revoked(&self, user_id: Uuid, issued_at: i64) -> Result<bool, AuthError> {
        let mut con = self.connection().await?;
        let revoked: Option<i64> = con
            .get(format!("osc:auth:revoked_before:{user_id}"))
            .await
            .map_err(|_| AuthError::DependencyUnavailable)?;
        Ok(revoked.is_some_and(|ts| {
            if ts < 10_000_000_000 {
                issued_at / 1_000_000 <= ts
            } else {
                issued_at <= ts
            }
        }))
    }
}
