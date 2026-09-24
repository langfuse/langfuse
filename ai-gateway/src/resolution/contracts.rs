use super::{ResolutionError, valid_token};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{DeserializeOwned, IntoDeserializer},
};
use std::{collections::BTreeMap, fmt};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum ApiFormat {
    #[serde(rename = "openai.responses")]
    OpenAiResponses,
    #[serde(rename = "anthropic.messages")]
    AnthropicMessages,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    OpenAi,
    Anthropic,
}

impl Provider {
    pub fn official_origin(self) -> &'static str {
        match self {
            Self::OpenAi => "https://api.openai.com/v1",
            Self::Anthropic => "https://api.anthropic.com/v1",
        }
    }

    fn supports(self, api_format: ApiFormat) -> bool {
        matches!(
            (self, api_format),
            (Self::OpenAi, ApiFormat::OpenAiResponses)
                | (Self::Anthropic, ApiFormat::AnthropicMessages)
        )
    }

    fn accepts(self, credential: ProviderCredential<'_>) -> bool {
        matches!(
            (self, credential),
            (Self::OpenAi, ProviderCredential::Bearer(_))
                | (Self::Anthropic, ProviderCredential::XApiKey(_))
        )
    }
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

#[derive(Clone, Copy)]
pub enum ProviderCredential<'a> {
    /// `Authorization: Bearer <token>`
    Bearer(&'a str),
    /// `x-api-key: <key>`
    XApiKey(&'a str),
}

impl<'a> ProviderCredential<'a> {
    fn secret(self) -> &'a str {
        match self {
            Self::Bearer(token) | Self::XApiKey(token) => token,
        }
    }
}

#[derive(Deserialize)]
enum BearerType {
    Bearer,
}

#[derive(Deserialize)]
enum XApiKeyType {
    #[serde(rename = "x-api-key")]
    XApiKey,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BearerAuth {
    #[serde(rename = "type", deserialize_with = "string_enum")]
    _token_type: BearerType,
    token: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct XApiKeyAuth {
    #[serde(rename = "type", deserialize_with = "string_enum")]
    _kind: XApiKeyType,
    #[serde(rename = "header", deserialize_with = "string_enum")]
    _header: XApiKeyType,
    value: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Auth {
    Bearer(BearerAuth),
    XApiKey(XApiKeyAuth),
}

impl Auth {
    fn credential(&self) -> ProviderCredential<'_> {
        match self {
            Self::Bearer(auth) => ProviderCredential::Bearer(&auth.token),
            Self::XApiKey(auth) => ProviderCredential::XApiKey(&auth.value),
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderConnection {
    id: String,
    #[serde(deserialize_with = "string_enum")]
    provider: Provider,
    #[serde(deserialize_with = "string_enum")]
    api_format: ApiFormat,
    base_url: String,
    auth: Auth,
}

impl ProviderConnection {
    pub fn id(&self) -> &str {
        &self.id
    }
    pub fn provider(&self) -> Provider {
        self.provider
    }
    pub fn api_format(&self) -> ApiFormat {
        self.api_format
    }
    pub fn base_url(&self) -> &str {
        &self.base_url
    }
    pub fn credential(&self) -> ProviderCredential<'_> {
        self.auth.credential()
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequestAttribution {
    organization_id: String,
    project_id: String,
    key_id: String,
    key_metadata: BTreeMap<String, MetadataValue>,
    provider_connection_id: String,
}

impl RequestAttribution {
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
pub struct IngestionGrant {
    access_token: String,
    #[serde(rename = "token_type", deserialize_with = "string_enum")]
    _token_type: BearerType,
    expires_at: u64,
}

impl IngestionGrant {
    pub fn access_token(&self) -> &str {
        &self.access_token
    }
    pub fn expires_at(&self) -> u64 {
        self.expires_at
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ResolutionResponse {
    version: u8,
    connection: ProviderConnection,
    attribution: RequestAttribution,
    #[serde(deserialize_with = "string_enum")]
    ingestion_mode: IngestionMode,
    ingestion: IngestionGrant,
}

/// A validated v1 execution. Construction is restricted to successful resolution.
pub struct ResolvedRequestContext(ResolutionResponse);

// Web enums are JSON strings. Serde's externally tagged enums also accept objects.
fn string_enum<'de, D: Deserializer<'de>, T: DeserializeOwned>(
    deserializer: D,
) -> Result<T, D::Error> {
    T::deserialize(String::deserialize(deserializer)?.into_deserializer())
}

impl ResolvedRequestContext {
    pub fn connection(&self) -> &ProviderConnection {
        &self.0.connection
    }
    pub fn attribution(&self) -> &RequestAttribution {
        &self.0.attribution
    }
    pub fn ingestion_mode(&self) -> IngestionMode {
        self.0.ingestion_mode
    }
    pub fn ingestion(&self) -> &IngestionGrant {
        &self.0.ingestion
    }
}

impl fmt::Debug for ResolvedRequestContext {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ResolvedRequestContext")
            .finish_non_exhaustive()
    }
}

/// The tenant an ingestion JWT authorizes.
#[derive(Deserialize)]
struct IngestionClaims {
    organization_id: String,
    project_id: String,
}

/// Web writes uploads into the token's project, while telemetry batches uploads by
/// `attribution`; any valid grant for a project may carry every record of that project.
/// A token for another tenant must therefore never be accepted. Web verifies the
/// signature on ingestion, so reading the payload is enough here.
fn ingestion_claims_match(token: &str, attribution: &RequestAttribution) -> bool {
    let mut segments = token.split('.');
    let (Some(_header), Some(payload), Some(_signature), None) = (
        segments.next(),
        segments.next(),
        segments.next(),
        segments.next(),
    ) else {
        return false;
    };
    URL_SAFE_NO_PAD
        .decode(payload)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<IngestionClaims>(&bytes).ok())
        .is_some_and(|claims| {
            claims.organization_id == attribution.organization_id
                && claims.project_id == attribution.project_id
        })
}

pub(super) fn decode(
    bytes: &[u8],
    expected_format: ApiFormat,
    now: u64,
) -> Result<ResolvedRequestContext, ResolutionError> {
    let response: ResolutionResponse =
        serde_json::from_slice(bytes).map_err(|_| ResolutionError::InvalidResponse)?;
    let connection = &response.connection;
    let attribution = &response.attribution;
    let provider = connection.provider;
    if response.version != 1
        || connection.api_format != expected_format
        || !provider.supports(connection.api_format)
        || connection.base_url != provider.official_origin()
        || !provider.accepts(connection.credential())
        || !valid_token(connection.credential().secret())
        || !valid_token(&response.ingestion.access_token)
        || !ingestion_claims_match(&response.ingestion.access_token, attribution)
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
        return Err(ResolutionError::InvalidResponse);
    }
    Ok(ResolvedRequestContext(response))
}
