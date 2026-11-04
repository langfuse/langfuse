mod anthropic;
mod openai;

use serde::Deserialize;

use crate::resolution::{ApiFormat, ResolutionError};

#[derive(Deserialize)]
struct Catalog {
    data: Vec<CatalogEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogEntry {
    id: String,
    provider: CatalogProvider,
    #[serde(rename = "canonicalSlug")]
    _canonical_slug: String,
    display_name: String,
    created_at: String,
}

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
enum CatalogProvider {
    #[serde(rename = "OPENAI")]
    OpenAi,
    #[serde(rename = "ANTHROPIC")]
    Anthropic,
    /// Web lists a Bedrock model only on the routes it serves.
    #[serde(rename = "BEDROCK")]
    Bedrock,
}

pub(crate) fn provider_response(
    body: &[u8],
    api_format: ApiFormat,
) -> Result<Vec<u8>, ResolutionError> {
    let catalog: Catalog =
        serde_json::from_slice(body).map_err(|_| ResolutionError::InvalidResponse)?;
    let provider = match api_format {
        ApiFormat::OpenAiResponses | ApiFormat::OpenAiChatCompletions => CatalogProvider::OpenAi,
        ApiFormat::AnthropicMessages => CatalogProvider::Anthropic,
    };
    if catalog
        .data
        .iter()
        .any(|entry| entry.provider != provider && entry.provider != CatalogProvider::Bedrock)
    {
        return Err(ResolutionError::InvalidResponse);
    }
    match api_format {
        ApiFormat::OpenAiResponses | ApiFormat::OpenAiChatCompletions => {
            openai::response(&catalog.data)
        }
        ApiFormat::AnthropicMessages => anthropic::response(&catalog.data),
    }
}
