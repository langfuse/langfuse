use serde_json::{Value, json};

use super::*;
use crate::{
    capture::{ProviderFacts, RelayOutcome},
    resolution::ApiFormat,
};

fn xai_chat_completion(usage: Value) -> InferenceFacts {
    let mut inference = ProviderFacts {
        usage_details: Some(usage),
        ..ProviderFacts::default()
    };
    inference
        .model_parameters
        .insert("service_tier".into(), json!("priority"));
    InferenceFacts {
        api_format: ApiFormat::OpenAiChatCompletions,
        start_time_unix_ms: 0,
        duration_ms: 0,
        first_byte_ms: None,
        completion_start_ms: None,
        http_status: Some(200),
        retry_after_ms: None,
        upstream_model: None,
        request_body_bytes: 0,
        response_body_bytes: 0,
        metadata: json!({ "provider": "xai" }),
        outcome: RelayOutcome::Eof,
        inference,
    }
}

fn tiers() -> Vec<PricingTierWithPrices> {
    let prices = |factor: f64| {
        json!({
            "input": 0.001 * factor,
            "input_cached_tokens": 0.0001 * factor,
            "output": 0.002 * factor,
            "output_reasoning_tokens": 0.002 * factor,
        })
    };
    serde_json::from_value(json!([
        { "id": "standard", "name": "Standard", "is_default": true, "priority": 0, "conditions": [], "prices": prices(1.0) },
        {
            "id": "priority", "name": "Priority", "is_default": false, "priority": 1,
            "conditions": [{ "source": "model_parameters", "key": "service_tier", "values": ["priority"] }],
            "prices": prices(2.0),
        },
    ]))
    .unwrap()
}

#[test]
fn prices_provider_usage_as_langfuse_ingests_it() {
    // xAI leaves reasoning out of `completion_tokens` and overlaps `text_tokens`
    // with `cached_tokens`; both are corrected before pricing.
    let usage = json!({
        "prompt_tokens": 100,
        "completion_tokens": 20,
        "total_tokens": 150,
        "prompt_tokens_details": { "cached_tokens": 40, "text_tokens": 60 },
        "completion_tokens_details": { "reasoning_tokens": 30 },
    });
    let inferred = generation_cost(&xai_chat_completion(usage.clone()), &tiers()).unwrap();
    // Priority tier: 60 input, 40 cached, 20 output and 30 reasoning tokens.
    assert!((inferred - 0.328).abs() < 1e-12, "{inferred}");

    let mut billed = usage;
    billed["cost_in_usd_ticks"] = json!(2_000_000_000_u64);
    let provided = generation_cost(&xai_chat_completion(billed), &tiers()).unwrap();
    assert!((provided - 0.2).abs() < 1e-12, "{provided}");
}
