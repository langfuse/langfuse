use serde_json::{Map, Value, json};

use super::{ProviderUsage, UsageDetails};
use crate::resolution::ApiFormat;

pub(super) fn usage(api_format: ApiFormat, usage: &Value) -> ProviderUsage {
    let mut reported = ProviderUsage::standard(api_format, usage);
    if let Some(UsageDetails::OpenAiCompletion(details)) = &mut reported.usage_details {
        count_thinking_as_output(details);
    }
    reported
}

/// Google's `completion_tokens` leaves out thinking tokens, which it bills as
/// output; only `total_tokens` counts them. Vertex AI's OpenAI-compatible
/// endpoint serves the same Gemini models; where the counts already add up,
/// usage passes through unchanged.
/// <https://discuss.ai.google.dev/t/gemini-3-6-flash-openai-compatible-token-limits-response-fields-and-auth-keys/183372>
fn count_thinking_as_output(usage: &mut Map<String, Value>) {
    let count = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
    let (prompt, total) = (count("prompt_tokens"), count("total_tokens"));
    if total > prompt + count("completion_tokens") {
        usage.insert("completion_tokens".into(), json!(total - prompt));
    }
}
