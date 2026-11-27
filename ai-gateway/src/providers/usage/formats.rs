//! The usage each API format reports, kept to the fields Langfuse ingests.
use std::borrow::Cow;

use serde_json::{Map, Value, json};

use super::UsageDetails;
use crate::resolution::ApiFormat;

/// `None` when the usage lacks the format's counters.
pub(super) fn standard_usage(api_format: ApiFormat, usage: &Value) -> Option<UsageDetails> {
    match api_format {
        ApiFormat::OpenAiChatCompletions => openai_usage(
            &with_chat_total(usage),
            ["prompt_tokens", "completion_tokens", "total_tokens"],
            ["prompt_tokens_details", "completion_tokens_details"],
        )
        .map(UsageDetails::OpenAiCompletion),
        // Decisions reports usage in the Responses shape.
        ApiFormat::OpenAiResponses | ApiFormat::OpenAiDecisions => openai_usage(
            usage,
            ["input_tokens", "output_tokens", "total_tokens"],
            ["input_tokens_details", "output_tokens_details"],
        )
        .map(UsageDetails::OpenAiResponse),
        // Langfuse ingests native Messages usage as is.
        ApiFormat::AnthropicMessages => usage.as_object().cloned().map(UsageDetails::Raw),
        ApiFormat::OpenAiEmbeddings => embeddings_usage(usage).map(UsageDetails::Raw),
    }
}

/// Some OpenAI-compatible servers leave out `total_tokens`, which `OpenAI`
/// defines as prompt plus completion. Only Chat Completions names are distinct
/// enough to fill it: Anthropic usage arriving on Responses shares
/// `input_tokens` but leaves cache reads out of it, so it must stay unread.
fn with_chat_total(usage: &Value) -> Cow<'_, Value> {
    let count = |key: &str| usage.get(key).and_then(Value::as_u64);
    let total_missing = usage.get("total_tokens").is_none_or(Value::is_null);
    match (count("prompt_tokens"), count("completion_tokens")) {
        (Some(prompt), Some(completion)) if total_missing => {
            let mut filled = usage.clone();
            if let (Some(total), Some(fields)) =
                (prompt.checked_add(completion), filled.as_object_mut())
            {
                fields.insert("total_tokens".into(), json!(total));
            }
            Cow::Owned(filled)
        }
        _ => Cow::Borrowed(usage),
    }
}

/// The receiver's native `OpenAI` usage schemas are strict at the top level, but
/// accept new numeric detail counters.
fn openai_usage(
    usage: &Value,
    counters: [&str; 3],
    details: [&str; 2],
) -> Option<Map<String, Value>> {
    let usage = usage.as_object()?;
    let mut kept = Map::new();
    for key in counters {
        let value = usage.get(key).filter(|value| value.as_u64().is_some())?;
        kept.insert(key.into(), value.clone());
    }
    for key in details {
        match usage.get(key) {
            Some(Value::Null) => {
                kept.insert(key.into(), Value::Null);
            }
            Some(Value::Object(details)) => {
                kept.insert(
                    key.into(),
                    Value::Object(
                        details
                            .iter()
                            .filter(|(_, value)| value.is_null() || value.as_u64().is_some())
                            .map(|(key, value)| (key.clone(), value.clone()))
                            .collect(),
                    ),
                );
            }
            _ => {}
        }
    }
    Some(kept)
}

/// Embeddings report `prompt_tokens` and an equal `total_tokens`. Langfuse
/// would sum the two into its total and double the cost, so only the input
/// counter is kept and Langfuse derives the total from it.
fn embeddings_usage(usage: &Value) -> Option<Map<String, Value>> {
    let input = usage
        .get("prompt_tokens")
        .filter(|value| value.as_u64().is_some())?;
    Some(Map::from_iter([("input".to_owned(), input.clone())]))
}
