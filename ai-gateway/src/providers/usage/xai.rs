use serde_json::{Map, Value, json};

use super::{ProviderUsage, UsageDetails};
use crate::{resolution::ApiFormat, spend::UsageCostType};

pub(super) fn usage(api_format: ApiFormat, usage: &Value) -> ProviderUsage {
    let mut reported = ProviderUsage::standard(api_format, usage);
    if let Some(UsageDetails::OpenAiCompletion(details)) = &mut reported.usage_details {
        count_reasoning_as_output(details);
    }
    reported.provided_cost_details = cost_details(usage);
    reported
}

/// xAI bills in integer ticks of 10^-10 USD, server-side tool calls included.
fn cost_details(usage: &Value) -> Option<UsageCostType> {
    const TICKS_PER_USD: f64 = 1e10;
    let ticks = usage.get("cost_in_usd_ticks")?.as_u64()?;
    #[expect(
        clippy::cast_precision_loss,
        reason = "ticks stay far below 2^53, so the conversion is exact"
    )]
    Some(UsageCostType::from([(
        "total".into(),
        ticks as f64 / TICKS_PER_USD,
    )]))
}

/// xAI's Chat Completions `completion_tokens` leaves out reasoning tokens, and
/// its `text_tokens` overlaps `cached_tokens`. The receiver subtracts every
/// detail from its parent count, so both are brought to `OpenAI`'s meaning.
fn count_reasoning_as_output(usage: &mut Map<String, Value>) {
    if let Some(details) = usage
        .get_mut("prompt_tokens_details")
        .and_then(Value::as_object_mut)
    {
        details.remove("text_tokens");
    }
    let reasoning = usage
        .get("completion_tokens_details")
        .and_then(|details| details.get("reasoning_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if let Some(completion) = usage.get("completion_tokens").and_then(Value::as_u64) {
        usage.insert("completion_tokens".into(), json!(completion + reasoning));
    }
}
