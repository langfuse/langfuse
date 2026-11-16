//! A generation's usage as the provider that served it reports it. Providers
//! whose usage or billing departs from their API format have their own file.
mod gemini;
mod openrouter;
mod vercel;
mod xai;

use serde_json::Value;

use crate::{
    resolution::ApiFormat,
    spend::{UsageCostType, provided_usage_details},
};

#[derive(Debug, Default, PartialEq)]
pub(crate) struct ProviderUsage {
    /// The usage projected by its API format and brought to `OpenAI`'s meaning, as
    /// Langfuse ingests it; `None` when the format's usage could not be projected.
    pub usage: Option<Value>,
    /// What the provider says it billed, in USD. Langfuse then records it, with its
    /// breakdown, instead of inferring costs from model prices.
    pub provided_cost_details: Option<UsageCostType>,
}

impl ProviderUsage {
    /// Usage as the API format reports it, without a billed amount.
    fn reported(usage: Option<Value>) -> Self {
        Self {
            usage,
            provided_cost_details: None,
        }
    }

    /// The usage details `calculateModelUsageCosts` takes, as ingestion parses them.
    pub(crate) fn usage_details(&self) -> UsageCostType {
        self.usage
            .as_ref()
            .map(provided_usage_details)
            .unwrap_or_default()
    }
}

pub(crate) fn provider_usage(
    api_format: ApiFormat,
    provider: Option<&str>,
    usage: &Value,
    provider_metadata: Option<&Value>,
) -> ProviderUsage {
    let projected = crate::capture::project_usage(api_format, usage);
    match provider {
        Some("xai") => xai::usage(api_format, projected, usage),
        Some("google_ai_studio" | "vertex") => gemini::usage(api_format, projected),
        Some("openrouter") => openrouter::usage(projected, usage),
        Some("vercel") => vercel::usage(projected, usage, provider_metadata),
        _ => ProviderUsage::reported(projected),
    }
}
