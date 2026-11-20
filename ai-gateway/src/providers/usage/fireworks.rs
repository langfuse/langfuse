use serde_json::{Map, Value, json};

use super::ProviderUsage;
use crate::resolution::ApiFormat;

pub(super) fn usage(api_format: ApiFormat, usage: &Value) -> ProviderUsage {
    let reported = ProviderUsage::standard(api_format, usage);
    if api_format == ApiFormat::OpenAiResponses
        && reported.usage_details.is_none()
        && let Some(normalized) = normalized_responses_usage(usage)
    {
        return ProviderUsage::standard(api_format, &normalized);
    }
    reported
}

/// Fireworks' Responses API documents Chat Completions counter names
/// (`prompt_tokens`/`completion_tokens`) rather than `OpenAI`'s
/// `input_tokens`/`output_tokens`. Map them when the standard names are absent.
fn normalized_responses_usage(usage: &Value) -> Option<Value> {
    let usage = usage.as_object()?;
    let prompt = usage.get("prompt_tokens")?.as_u64()?;
    let completion = usage.get("completion_tokens")?.as_u64()?;
    let total = usage
        .get("total_tokens")
        .and_then(Value::as_u64)
        .or_else(|| prompt.checked_add(completion))?;
    let mut normalized = Map::from_iter([
        ("input_tokens".to_owned(), json!(prompt)),
        ("output_tokens".to_owned(), json!(completion)),
        ("total_tokens".to_owned(), json!(total)),
    ]);
    for (source, target) in [
        ("prompt_tokens_details", "input_tokens_details"),
        ("completion_tokens_details", "output_tokens_details"),
    ] {
        if let Some(details) = usage.get(source) {
            normalized.insert(target.to_owned(), details.clone());
        }
    }
    Some(Value::Object(normalized))
}
