use serde_json::{Value, json};

/// Google's `completion_tokens` leaves out thinking tokens, which it bills as
/// output; only `total_tokens` counts them. Vertex AI's OpenAI-compatible
/// endpoint serves the same Gemini models; where the counts already add up,
/// usage passes through unchanged.
/// <https://discuss.ai.google.dev/t/gemini-3-6-flash-openai-compatible-token-limits-response-fields-and-auth-keys/183372>
pub(super) fn chat_completions_usage(mut usage: Value) -> Value {
    let count = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
    let (prompt, total) = (count("prompt_tokens"), count("total_tokens"));
    if total > prompt + count("completion_tokens") {
        usage["completion_tokens"] = json!(total - prompt);
    }
    usage
}
