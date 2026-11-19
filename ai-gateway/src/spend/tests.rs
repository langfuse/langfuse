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
        charged_cost_details: None,
        rejection: None,
        inference,
    }
}

fn model(pricing_tiers: Vec<PricingTierWithPrices>) -> ModelWithPrices {
    ModelWithPrices {
        model: None,
        pricing_tiers,
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
    let inferred = generation_cost(
        &xai_chat_completion(usage.clone()),
        &Map::new(),
        &model(tiers()),
    )
    .unwrap();
    // Priority tier: 60 input, 40 cached, 20 output and 30 reasoning tokens.
    let total = inferred.total.unwrap();
    assert!((total - 0.328).abs() < 1e-12, "{total}");
    assert!(!inferred.provided);
    assert_eq!(inferred.details.get("total"), Some(&total));

    let mut billed = usage;
    billed["cost_in_usd_ticks"] = json!(2_000_000_000_u64);
    let provided =
        generation_cost(&xai_chat_completion(billed), &Map::new(), &model(tiers())).unwrap();
    let total = provided.total.unwrap();
    assert!((total - 0.2).abs() < 1e-12, "{total}");
    assert!(provided.provided);
}

#[test]
fn matches_metadata_tiers_against_the_ingested_generation_metadata() {
    let tiers: Vec<PricingTierWithPrices> = serde_json::from_value(json!([
        { "id": "standard", "name": "Standard", "is_default": true, "priority": 0, "conditions": [], "prices": { "input": 0.001 } },
        {
            "id": "team", "name": "Team", "is_default": false, "priority": 1,
            "conditions": [{ "source": "metadata", "key": "langfuse.gateway.api_key.metadata.team", "values": ["research"] }],
            "prices": { "input": 0.01 },
        },
    ]))
    .unwrap();
    let facts = xai_chat_completion(json!({
        "prompt_tokens": 100,
        "completion_tokens": 0,
        "total_tokens": 100,
    }));
    let metadata = json!({ "langfuse.gateway.api_key.metadata.team": "research" });
    let cost = generation_cost(&facts, metadata.as_object().unwrap(), &model(tiers))
        .and_then(|cost| cost.total)
        .unwrap();
    assert!((cost - 1.0).abs() < 1e-12, "{cost}");
}

#[test]
fn a_spent_user_limit_rejects_the_key_and_counts_across_the_users_keys() {
    let limit = |id: &str, scope: &str| -> SpendLimit {
        serde_json::from_value(json!({
            "id": id, "scope": scope, "interval": "total", "limit_usd": 10,
            "counting_started_at": 0,
        }))
        .unwrap()
    };
    let key_limit = limit("key-limit", "api_key");
    let user_limit = limit("user-limit", "user");
    let now = DateTime::<Utc>::from(SystemTime::now());
    let usage = |limit, counted| {
        LimitUsage::new(
            limit,
            Window::current("org", limit, now),
            Some(counted),
            false,
        )
    };

    let key = usage(&key_limit, 2.0);
    let user = usage(&user_limit, 12.0);
    // The counter is keyed by the limit alone, so every key of the user adds to it.
    assert_eq!(
        user.window.counter.key,
        "gateway-spend:{org}:user-limit:0:0"
    );
    let exceeded = [key, user]
        .into_iter()
        .find(LimitUsage::is_exceeded)
        .unwrap();
    assert_eq!(exceeded.limit.id, "user-limit");
    assert_eq!(
        exceeded.rejection(now).message(),
        "This key's user has spent $12.00 of its $10.00 total budget. An admin can raise or remove the budget."
    );
}

#[test]
fn a_spent_organization_limit_rejects_every_key_of_the_organization() {
    let limit: SpendLimit = serde_json::from_value(json!({
        "id": "org-limit", "scope": "organization", "interval": "total", "limit_usd": 10,
        "counting_started_at": 0,
    }))
    .unwrap();
    let now = DateTime::<Utc>::from(SystemTime::now());
    let usage = LimitUsage::new(
        &limit,
        Window::current("org", &limit, now),
        Some(10.0),
        false,
    );
    assert!(usage.is_exceeded());
    assert_eq!(
        usage.rejection(now).message(),
        "This organization has spent $10.00 of its $10.00 total budget. An admin can raise or remove the budget."
    );
}

#[test]
fn prices_anthropic_token_names_with_the_generic_prices_of_older_claude_models() {
    let mut facts = xai_chat_completion(json!({ "input_tokens": 100, "output_tokens": 20 }));
    facts.api_format = ApiFormat::AnthropicMessages;
    facts.metadata = json!({ "provider": "anthropic" });
    facts.inference.model_parameters.clear();
    let tiers: Vec<PricingTierWithPrices> = serde_json::from_value(json!([
        { "id": "standard", "name": "Standard", "is_default": true, "priority": 0, "conditions": [], "prices": { "input": 0.001, "output": 0.002 } },
    ]))
    .unwrap();
    let cost = generation_cost(&facts, &Map::new(), &model(tiers)).unwrap();
    let total = cost.total.unwrap();
    assert!((total - 0.14).abs() < 1e-12, "{total}");
}
