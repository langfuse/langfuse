use super::{ResolveError, valid_token};
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{DeserializeOwned, IntoDeserializer},
};
use std::{collections::BTreeMap, fmt};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum ApiFormat {
    #[serde(rename = "openai.responses")]
    OpenAiResponses,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IngestionMode {
    Usage,
    Full,
}

#[derive(Clone, Deserialize)]
#[serde(untagged)]
pub enum MetadataValue {
    String(String),
    Number(serde_json::Number),
    Bool(bool),
}

#[derive(Deserialize)]
enum Provider {
    #[serde(rename = "openai")]
    OpenAi,
}

#[derive(Deserialize)]
enum TokenType {
    Bearer,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Auth {
    #[serde(rename = "type", deserialize_with = "string_enum")]
    _token_type: TokenType,
    token: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Connection {
    id: String,
    #[serde(rename = "provider", deserialize_with = "string_enum")]
    _provider: Provider,
    #[serde(deserialize_with = "string_enum")]
    api_format: ApiFormat,
    base_url: String,
    auth: Auth,
}

impl Connection {
    pub fn id(&self) -> &str {
        &self.id
    }
    pub fn api_format(&self) -> ApiFormat {
        self.api_format
    }
    pub fn base_url(&self) -> &str {
        &self.base_url
    }
    pub fn provider_token(&self) -> &str {
        &self.auth.token
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Attribution {
    organization_id: String,
    project_id: String,
    key_id: String,
    key_metadata: BTreeMap<String, MetadataValue>,
    provider_connection_id: String,
}

impl Attribution {
    pub fn organization_id(&self) -> &str {
        &self.organization_id
    }
    pub fn project_id(&self) -> &str {
        &self.project_id
    }
    pub fn key_id(&self) -> &str {
        &self.key_id
    }
    pub fn key_metadata(&self) -> &BTreeMap<String, MetadataValue> {
        &self.key_metadata
    }
    pub fn provider_connection_id(&self) -> &str {
        &self.provider_connection_id
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ingestion {
    access_token: String,
    #[serde(rename = "token_type", deserialize_with = "string_enum")]
    _token_type: TokenType,
    expires_at: u64,
}

impl Ingestion {
    pub fn access_token(&self) -> &str {
        &self.access_token
    }
    pub fn expires_at(&self) -> u64 {
        self.expires_at
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
    version: u8,
    connection: Connection,
    attribution: Attribution,
    #[serde(deserialize_with = "string_enum")]
    ingestion_mode: IngestionMode,
    ingestion: Ingestion,
}

/// A validated v1 execution. Construction is restricted to successful resolution.
pub struct ResolvedExecution(Response);

// Web enums are JSON strings. Serde's externally tagged enums also accept objects.
fn string_enum<'de, D: Deserializer<'de>, T: DeserializeOwned>(
    deserializer: D,
) -> Result<T, D::Error> {
    T::deserialize(String::deserialize(deserializer)?.into_deserializer())
}

impl ResolvedExecution {
    pub fn connection(&self) -> &Connection {
        &self.0.connection
    }
    pub fn attribution(&self) -> &Attribution {
        &self.0.attribution
    }
    pub fn ingestion_mode(&self) -> IngestionMode {
        self.0.ingestion_mode
    }
    pub fn ingestion(&self) -> &Ingestion {
        &self.0.ingestion
    }
}

impl fmt::Debug for ResolvedExecution {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ResolvedExecution").finish_non_exhaustive()
    }
}

pub(super) fn decode(
    bytes: &[u8],
    expected_format: ApiFormat,
    now: u64,
) -> Result<ResolvedExecution, ResolveError> {
    let response: Response =
        serde_json::from_slice(bytes).map_err(|_| ResolveError::InvalidResponse)?;
    let connection = &response.connection;
    let attribution = &response.attribution;
    if response.version != 1
        || connection.api_format != expected_format
        || connection.base_url != "https://api.openai.com/v1"
        || !valid_token(&connection.auth.token)
        || !valid_token(&response.ingestion.access_token)
        || response.ingestion.expires_at <= now
        || [
            &connection.id,
            &attribution.organization_id,
            &attribution.project_id,
            &attribution.key_id,
            &attribution.provider_connection_id,
        ]
        .iter()
        .any(|value| value.trim().is_empty())
    {
        return Err(ResolveError::InvalidResponse);
    }
    Ok(ResolvedExecution(response))
}
