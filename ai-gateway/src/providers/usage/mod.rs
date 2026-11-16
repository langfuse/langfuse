//! A generation's usage as the provider that served it reports it. Every
//! provider starts from the usage its API format reports; providers whose usage
//! or billing departs from it adjust that in their own file.
mod formats;
mod gemini;
mod ingestion;
mod openrouter;
mod vercel;
mod xai;

pub(crate) use ingestion::UsageDetails;
use serde_json::Value;

use crate::{resolution::ApiFormat, spend::UsageCostType};

#[derive(Debug, Default, PartialEq)]
pub(crate) struct ProviderUsage {
    /// Uploaded as the generation's `usage_details`; `None` when the usage lacks
    /// its format's counters.
    pub usage_details: Option<UsageDetails>,
    /// What the provider says it billed, in USD. Langfuse then records it, with its
    /// breakdown, instead of inferring costs from model prices.
    pub provided_cost_details: Option<UsageCostType>,
}

impl ProviderUsage {
    /// Usage as the API format reports it, without a billed amount.
    fn standard(api_format: ApiFormat, usage: &Value) -> Self {
        Self {
            usage_details: formats::standard_usage(api_format, usage),
            provided_cost_details: None,
        }
    }
}

pub(crate) fn provider_usage(
    api_format: ApiFormat,
    provider: Option<&str>,
    usage: &Value,
    provider_metadata: Option<&Value>,
) -> ProviderUsage {
    match provider {
        Some("xai") => xai::usage(api_format, usage),
        Some("google_ai_studio" | "vertex") => gemini::usage(api_format, usage),
        Some("openrouter") => openrouter::usage(api_format, usage),
        Some("vercel") => vercel::usage(api_format, usage, provider_metadata),
        _ => ProviderUsage::standard(api_format, usage),
    }
}
