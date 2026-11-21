use serde::{Deserialize, Serialize};

pub const MAX_COMPOSE_BYTES: usize = 64 * 1024;
pub const MAX_ENV_BYTES: usize = 16 * 1024;
pub const TERMINAL: &str = "terminal";

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Input {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compose: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
}

impl Input {
    pub fn valid(&self, action: &str) -> bool {
        match action {
            "save" => {
                self.command.is_none()
                    && self.compose.as_ref().is_some_and(|s| {
                        !s.trim().is_empty() && s.len() <= MAX_COMPOSE_BYTES && !s.contains('\0')
                    })
                    && self
                        .env
                        .as_ref()
                        .is_none_or(|s| s.len() <= MAX_ENV_BYTES && !s.contains('\0'))
            }
            "convert" => {
                self.compose.is_none()
                    && self.env.is_none()
                    && self.command.as_ref().is_some_and(|s| {
                        s.starts_with("docker run ")
                            && s.len() <= 4096
                            && !s.contains(['\0', '\n', '\r'])
                    })
            }
            TERMINAL => {
                self.compose.is_none()
                    && self.env.is_none()
                    && matches!(self.command.as_deref(), Some("uptime" | "df" | "docker ps"))
            }
            "read" | "up" | "down" | "pull" | "restart" => {
                self.compose.is_none() && self.env.is_none() && self.command.is_none()
            }
            _ => false,
        }
    }
}

pub fn valid_stack_name(name: &str) -> bool {
    (1..=63).contains(&name.len())
        && name.as_bytes()[0].is_ascii_alphanumeric()
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
}
