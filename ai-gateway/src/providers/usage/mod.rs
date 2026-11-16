//! Where an upstream provider's usage or billing departs from its API format.
//! Each provider's quirks live in its own file.
mod gemini;
mod openrouter;
mod vercel;
mod xai;

use serde_json::Value;

/// Bring a provider's projected Chat Completions usage to `OpenAI`'s meaning.
pub(crate) fn adjust_chat_completions_usage(provider: Option<&str>, usage: Value) -> Value {
    match provider {
        Some("xai") => xai::chat_completions_usage(usage),
        Some("google_ai_studio" | "vertex") => gemini::chat_completions_usage(usage),
        _ => usage,
    }
}

/// Some providers report the amount they billed inline in their usage. Langfuse
/// then records it, with its breakdown, instead of inferring costs from model prices.
pub(crate) fn provided_cost_details(
    provider: Option<&str>,
    usage: &Value,
    provider_metadata: Option<&Value>,
) -> Option<Value> {
    match provider? {
        "openrouter" => openrouter::cost_details(usage),
        "xai" => xai::cost_details(usage),
        "vercel" => vercel::cost_details(usage)
            .or_else(|| provider_metadata.and_then(vercel::gateway_cost_details)),
        _ => None,
    }
}
