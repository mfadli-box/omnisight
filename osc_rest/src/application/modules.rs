use serde_json::{Map, Value};

use crate::domain::AuthError;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Resource {
    Nodes,
    Targets,
    Documents,
    Companies,
    Areas,
    Stores,
}

#[derive(Clone, Copy)]
pub enum Action {
    View,
    Create,
    Update,
    Delete,
}

impl Action {
    pub fn flag(self) -> &'static str {
        match self {
            Self::View => "can_view",
            Self::Create => "can_create",
            Self::Update => "can_update",
            Self::Delete => "can_delete",
        }
    }
}

pub struct ValidatedFields(Map<String, Value>);

impl ValidatedFields {
    pub(crate) fn into_map(self) -> Map<String, Value> {
        self.0
    }
}

impl Resource {
    pub fn menu(self) -> &'static str {
        match self {
            Self::Nodes => "CT01",
            Self::Targets => "OP01",
            Self::Documents => "KB01",
            Self::Companies | Self::Areas | Self::Stores => "SA01",
        }
    }

    pub fn validate(
        self,
        mut input: Map<String, Value>,
        create: bool,
    ) -> Result<ValidatedFields, AuthError> {
        let (required, optional): (&[&str], &[&str]) = match self {
            Self::Nodes => (
                &["store_id", "os_type"],
                &[
                    "node_code",
                    "display_name",
                    "hostname",
                    "ip_address",
                    "agent_version",
                ],
            ),
            Self::Targets => (
                &[
                    "target_code",
                    "display_name",
                    "hostname",
                    "port",
                    "protocol",
                ],
                &["credential_ref"],
            ),
            Self::Documents => (&["document_code", "title"], &["markdown_content"]),
            Self::Companies | Self::Areas => (&["code", "name"], &[]),
            Self::Stores => (&["code", "name", "network_ip_cidr"], &["status"]),
        };
        let area_input = create && matches!(self, Self::Documents | Self::Stores | Self::Targets);
        if input.is_empty() || (create && required.iter().any(|key| !input.contains_key(*key))) {
            return Err(AuthError::InvalidInput);
        }
        for (key, value) in &mut input {
            if area_input && key == "area_id" {
                continue;
            }
            if !required.contains(&key.as_str()) && !optional.contains(&key.as_str())
                || !create && key == "store_id"
            {
                return Err(AuthError::InvalidInput);
            }
            if key == "port" {
                if !value
                    .as_u64()
                    .is_some_and(|port| (1..=65535).contains(&port))
                {
                    return Err(AuthError::InvalidInput);
                }
                continue;
            }
            if value.is_null()
                && optional.contains(&key.as_str())
                && !matches!(key.as_str(), "markdown_content" | "status")
            {
                continue;
            }
            let text = value.as_str().ok_or(AuthError::InvalidInput)?;
            let limit = match key.as_str() {
                "markdown_content" => 256 * 1024,
                "credential_ref" => 512,
                _ => 255,
            };
            if text.len() > limit || text.contains('\0') {
                return Err(AuthError::InvalidInput);
            }
            if key != "markdown_content" {
                if text.trim().is_empty() {
                    return Err(AuthError::InvalidInput);
                }
                *value = Value::String(text.trim().to_owned());
            }
        }
        Ok(ValidatedFields(input))
    }
}
