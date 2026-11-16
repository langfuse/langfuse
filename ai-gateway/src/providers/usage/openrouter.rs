use serde_json::Value;

use super::ProviderUsage;
use crate::{resolution::ApiFormat, spend::UsageCostType};

pub(super) fn usage(api_format: ApiFormat, usage: &Value) -> ProviderUsage {
    ProviderUsage {
        provided_cost_details: cost_details(usage),
        ..ProviderUsage::standard(api_format, usage)
    }
}

/// `cost` is what `OpenRouter` charged, in USD. With a bring-your-own provider key
/// it is only `OpenRouter`'s fee, and the provider bills the inference itself, so
/// the total adds that upstream charge or is left to price inference without it.
fn cost_details(usage: &Value) -> Option<UsageCostType> {
    let usd = |pointer: &str| {
        usage
            .pointer(pointer)?
            .as_f64()
            .filter(|usd| usd.is_finite() && *usd >= 0.0)
    };
    let cost = usd("/cost")?;
    let mut details = UsageCostType::new();
    // Responses names the split input/output; Chat Completions and Messages
    // name it prompt/completions.
    for (key, pointers) in [
        (
            "input",
            [
                "/cost_details/upstream_inference_input_cost",
                "/cost_details/upstream_inference_prompt_cost",
            ],
        ),
        (
            "output",
            [
                "/cost_details/upstream_inference_output_cost",
                "/cost_details/upstream_inference_completions_cost",
            ],
        ),
    ] {
        if let Some(usd) = pointers.into_iter().find_map(usd) {
            details.insert(key.into(), usd);
        }
    }
    let total = if usage.get("is_byok").and_then(Value::as_bool) == Some(true) {
        details.insert("openrouter_fee".into(), cost);
        cost + usd("/cost_details/upstream_inference_cost")?
    } else {
        cost
    };
    details.insert("total".into(), total);
    Some(details)
}
