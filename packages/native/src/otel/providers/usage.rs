//! Read supplied usage and costs from OTLP attributes.
//!
//! `extract_usage_details` maps SDK/provider fields to usage categories and retains
//! valid counts. `extract_cost_details` reads reported costs;
//! `otel_enrichment::enrich` calculates costs later when none were supplied.

use super::payload::{GENKIT_IO, VERTEX_IO};
use super::{parse_javascript_number, select_first, trim_javascript};
use crate::otel::attributes::{is_js_truthy, javascript_array_index, value_as_f64, JsonParseCache};
use crate::otel::types::JsonObject;
use crate::otel::value::{JsString, Number, Value};
use indexmap::IndexMap;
use std::collections::BTreeMap;

fn is_empty(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(value) => value.is_empty(),
        _ => false,
    }
}

type UsageRule = (&'static str, &'static [&'static str]);
type Usage = IndexMap<String, f64>;

/// Iterate object fields in the order used by JavaScript's `Object.entries`:
/// canonical array-index keys first, then all other keys in insertion order.
fn javascript_entries(object: &JsonObject) -> Vec<(&JsString, &Value)> {
    let mut entries = object.iter().collect::<Vec<_>>();
    entries.sort_by_key(|(key, _)| key.as_utf8().map_or((1, 0), javascript_array_index));
    entries
}

const GENKIT_USAGE_RULES: &[UsageRule] = &[
    ("input", &["inputTokens"]),
    ("output", &["outputTokens"]),
    ("total", &["totalTokens"]),
    ("output_reasoning", &["thoughtsTokens"]),
];
const AI_USAGE_RULES: &[UsageRule] = &[
    (
        "input",
        &["gen_ai.usage.prompt_tokens", "gen_ai.usage.input_tokens"],
    ),
    (
        "output",
        &[
            "gen_ai.usage.completion_tokens",
            "gen_ai.usage.output_tokens",
        ],
    ),
    ("total", &["ai.usage.tokens"]),
];

fn read_usage(
    attributes: &JsonObject,
    rules: &[UsageRule],
    coerce: impl Fn(f64) -> Option<f64>,
) -> Usage {
    rules
        .iter()
        .filter_map(|&(destination, sources)| {
            let value = value_as_f64(select_first(attributes, sources, |_| true))?;
            Some((destination.to_owned(), coerce(value)?))
        })
        .collect()
}

fn copy_missing_usage_fields(usage: &mut Usage, source: Option<&Value>, rules: &[(&str, &str)]) {
    for &(destination, source_key) in rules {
        if let Some(value) = value_as_f64(source.and_then(|value| value.get(source_key))) {
            usage.entry(destination.to_owned()).or_insert(value);
        }
    }
}

const OPENAI_USAGE_FIELDS: &[(&str, &str)] = &[
    ("input_cached_tokens", "cachedPromptTokens"),
    ("accepted_prediction_tokens", "acceptedPredictionTokens"),
    ("rejected_prediction_tokens", "rejectedPredictionTokens"),
    ("output_reasoning_tokens", "reasoningTokens"),
];
const ANTHROPIC_USAGE_FIELDS: &[(&str, &str)] = &[
    ("input_cache_creation", "cache_creation_input_tokens"),
    ("input_cached_tokens", "cache_read_input_tokens"),
];
const ANTHROPIC_CACHE_FIELDS: &[(&str, &str)] = &[
    ("input_cache_creation_5m", "ephemeral_5m_input_tokens"),
    ("input_cache_creation_1h", "ephemeral_1h_input_tokens"),
];
const BEDROCK_USAGE_FIELDS: &[(&str, &str)] = &[
    ("input_cache_read", "cacheReadInputTokens"),
    ("input_cache_write", "cacheWriteInputTokens"),
    ("input_cache_creation", "cacheCreationInputTokens"),
];

/// Compute provider token counts and derived totals, then retain valid non-negative integers.
pub fn extract_usage_details(
    attributes: &JsonObject,
    scope_name: &str,
    parse_cache: &mut JsonParseCache,
) -> IndexMap<String, Value> {
    let explicit = attributes
        .get("langfuse.observation.usage_details")
        .filter(|value| is_js_truthy(value));
    let mut usage = match explicit {
        Some(Value::String(_)) => match parse_cache.parse(explicit) {
            Some(Value::Object(value)) => normalize_explicit_usage(value),
            Some(_) => Usage::new(),
            None => provider_usage(attributes, scope_name, parse_cache),
        },
        Some(_) => Usage::new(),
        None => provider_usage(attributes, scope_name, parse_cache),
    };
    // Removing a provider prefix can turn a name into an array-index key.
    usage.sort_by_cached_key(|key, _| javascript_array_index(key));
    usage
        .into_iter()
        .filter(|(_, value)| valid_usage_count(*value))
        .map(|(key, value)| (key, number_value(value)))
        .collect()
}

fn provider_usage(
    attributes: &JsonObject,
    scope_name: &str,
    parse_cache: &mut JsonParseCache,
) -> Usage {
    if scope_name == "genkit-tracer" {
        let genkit_usage = parse_cache
            .parse_or_self(attributes.get(GENKIT_IO[1]))
            .and_then(|value| value.get("usage"))
            .filter(|value| is_js_truthy(value));
        if let Some(value) = genkit_usage {
            let Some(value) = value.as_object() else {
                return Usage::new();
            };
            let mut usage = read_usage(value, GENKIT_USAGE_RULES, |value| {
                (value != 0.0).then_some(value)
            });
            if let (Some(output), Some(reasoning)) = (
                value_as_f64(value.get("outputTokens")),
                value_as_f64(value.get("thoughtsTokens")),
            ) {
                usage.insert("output".to_owned(), (output - reasoning).max(0.0));
            }
            return usage;
        }
    }
    if scope_name == "ai" {
        let mut usage = read_usage(attributes, AI_USAGE_RULES, |value| Some(value.trunc()));
        for (destination, source) in [
            ("input_cached_tokens", "ai.usage.cachedInputTokens"),
            ("output_reasoning_tokens", "ai.usage.reasoningTokens"),
        ] {
            if let Some(value) = ai_usage_number(attributes.get(source), parse_cache) {
                usage.insert(destination.to_owned(), value);
            }
        }
        if let Some(provider) = parse_cache.parse(attributes.get("ai.response.providerMetadata")) {
            let anthropic = provider
                .get("anthropic")
                .and_then(|value| value.get("usage"));
            for (source, fields) in [
                (provider.get("openai"), OPENAI_USAGE_FIELDS),
                (anthropic, ANTHROPIC_USAGE_FIELDS),
                (
                    anthropic.and_then(|value| value.get("cache_creation")),
                    ANTHROPIC_CACHE_FIELDS,
                ),
            ] {
                copy_missing_usage_fields(&mut usage, source, fields);
            }
            if anthropic.is_some() {
                subtract_usage(
                    &mut usage,
                    "input_cache_creation",
                    &["input_cache_creation_5m", "input_cache_creation_1h"],
                );
            }
            copy_missing_usage_fields(
                &mut usage,
                provider.get("bedrock").and_then(|value| value.get("usage")),
                BEDROCK_USAGE_FIELDS,
            );
        }
        subtract_usage(
            &mut usage,
            "input",
            &[
                "input_cached_tokens",
                "input_cache_creation",
                "input_cache_creation_5m",
                "input_cache_creation_1h",
                "input_cache_read",
            ],
        );
        subtract_usage(&mut usage, "output", &["output_reasoning_tokens"]);
        // AI SDK adjustment always materializes input/output, including model-only spans.
        for key in ["input", "output"] {
            usage.entry(key.to_owned()).or_insert(0.0);
        }
        return usage;
    }
    let generic = javascript_entries(attributes)
        .into_iter()
        .filter_map(|(key, value)| {
            let key = key
                .as_str()
                .strip_prefix("gen_ai.usage.")
                .or_else(|| key.as_str().strip_prefix("llm.token_count."))?;
            (key != "cost").then_some((key.to_owned(), usage_number(Some(value))?))
        })
        .collect();
    let mut usage = normalize_generic_usage(generic);
    if scope_name == "gcp.vertex.agent" && !usage.contains_key("input_cached_tokens") {
        if let Some(cached) = parse_cache
            .parse_or_self(attributes.get(VERTEX_IO[0][1]))
            .and_then(|value| value.get("usage_metadata"))
            .and_then(|value| value_as_f64(value.get("cached_content_token_count")))
            .filter(|value| *value > 0.0)
        {
            usage.insert("input_cached_tokens".to_owned(), cached);
            subtract_usage(&mut usage, "input", &["input_cached_tokens"]);
        }
    }
    usage
}

fn sanitize_usage_value(value: &Value) -> Option<f64> {
    match value {
        Value::String(value) => parse_int_string(value.as_str()),
        value => nonnegative_integer(Some(value)),
    }
}

fn parse_int_string(value: &str) -> Option<f64> {
    let value = trim_javascript(value);
    let (negative, value) = match value.as_bytes().first() {
        Some(b'-') => (true, &value[1..]),
        Some(b'+') => (false, &value[1..]),
        _ => (false, value),
    };
    let digits = value
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .collect::<String>();
    if digits.is_empty() {
        return None;
    }
    let parsed = digits.parse::<f64>().ok()?;
    if (negative && parsed != 0.0) || !parsed.is_finite() {
        None
    } else {
        Some(parsed)
    }
}

fn usage_number(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::String(value)) => {
            parse_javascript_number(value.as_str()).filter(|value| value.is_finite())
        }
        value => value_as_f64(value),
    }
}

pub fn extract_cost_details(
    attributes: &JsonObject,
    parse_cache: &mut JsonParseCache,
) -> BTreeMap<String, Value> {
    let explicit = attributes
        .get("langfuse.observation.cost_details")
        .filter(|value| is_js_truthy(value));
    match explicit {
        Some(Value::String(_)) => match parse_cache.parse(explicit) {
            Some(Value::Object(value)) => {
                return value
                    .iter()
                    .filter_map(|(key, value)| {
                        numeric_cost_value(value).map(|value| (key.as_str().to_owned(), value))
                    })
                    .collect();
            }
            Some(_) => return BTreeMap::new(),
            None => {}
        },
        Some(_) => return BTreeMap::new(),
        None => {}
    }
    let mut result = BTreeMap::new();
    let value = ["gen_ai.usage.cost", "llm.cost.total"]
        .iter()
        .filter_map(|key| attributes.get(*key))
        .find(|value| !is_empty(value));
    if let Some(value) = value.and_then(numeric_cost_value) {
        result.insert("total".to_owned(), value);
    }
    result
}

fn numeric_cost_value(value: &Value) -> Option<Value> {
    let number = match value {
        Value::Number(value) => value.as_f64()?,
        Value::String(value) => parse_javascript_number(value.as_str())?,
        _ => return None,
    };
    number.is_finite().then(|| number_value(number))
}
fn number_value(value: f64) -> Value {
    if value.is_finite() && value.fract() == 0.0 {
        if value >= 0.0 {
            if let Ok(value) = u64::try_from(value as u128) {
                return Value::Number(Number::from(value));
            }
        } else if value >= i64::MIN as f64 {
            return Value::Number(Number::from(value as i64));
        }
    }
    Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

fn ai_usage_number(value: Option<&Value>, parse_cache: &mut JsonParseCache) -> Option<f64> {
    match parse_cache.parse(value)? {
        value @ (Value::Number(_) | Value::String(_)) => value_as_f64(Some(value)),
        Value::Object(value) => value_as_f64(value.get("intValue")),
        _ => None,
    }
}

/// Mirror the three branches of the TypeScript `UsageDetails` union for an explicit
/// `langfuse.observation.usage_details` object. OpenAI shapes normalize their known fields and
/// retain numeric extensions; other objects keep each field after accepting integer numbers and
/// `parseInt`-compatible strings.
fn normalize_explicit_usage(object: &JsonObject) -> Usage {
    for shape in [&OPENAI_COMPLETION_USAGE, &OPENAI_RESPONSE_USAGE] {
        if let Some(usage) = normalize_openai_usage(object, shape) {
            return usage;
        }
    }

    let mut result = javascript_entries(object)
        .into_iter()
        .filter_map(|(key, value)| {
            sanitize_usage_value(value).map(|value| (key.as_str().to_owned(), value))
        })
        .collect::<Usage>();

    split_anthropic_cache_creation(object.get("cache_creation"), &mut result);
    result
}

const OPENAI_COMPLETION_USAGE: [&str; 5] = [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "prompt_tokens_details",
    "completion_tokens_details",
];

const OPENAI_RESPONSE_USAGE: [&str; 5] = [
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "input_tokens_details",
    "output_tokens_details",
];

fn normalize_openai_usage(object: &JsonObject, fields: &[&str; 5]) -> Option<Usage> {
    let mut result = Usage::new();
    for (key, value) in javascript_entries(object) {
        if !fields.contains(&key.as_str()) {
            if let Some(value) = sanitize_usage_value(value) {
                result.insert(key.as_str().to_owned(), value);
            }
        }
    }
    split_anthropic_cache_creation(object.get("cache_creation"), &mut result);
    for (key, source) in [
        ("input", fields[0]),
        ("output", fields[1]),
        ("total", fields[2]),
    ] {
        result.insert(key.to_owned(), nonnegative_integer(object.get(source))?);
    }
    for (direction, count_key, detail_key) in [
        ("input", fields[0], fields[3]),
        ("output", fields[1], fields[4]),
    ] {
        let mut count = nonnegative_integer(object.get(count_key))?;
        for (key, value) in openai_detail_map(object.get(detail_key))? {
            result.insert(format!("{direction}_{key}"), value);
            count = (count - value).max(0.0);
        }
        result.insert(direction.to_owned(), count);
    }
    Some(result)
}

fn valid_usage_count(value: f64) -> bool {
    value.is_finite() && value >= 0.0 && value.fract() == 0.0
}

fn nonnegative_integer(value: Option<&Value>) -> Option<f64> {
    value?.as_f64().filter(|value| valid_usage_count(*value))
}

fn openai_detail_map(value: Option<&Value>) -> Option<Usage> {
    match value {
        None | Some(Value::Null) => Some(Usage::new()),
        Some(Value::Object(object)) => javascript_entries(object)
            .into_iter()
            .filter(|(_, value)| !value.is_null())
            .map(|(key, value)| Some((key.as_str().to_owned(), nonnegative_integer(Some(value))?)))
            .collect(),
        _ => None,
    }
}

fn split_anthropic_cache_creation(cache_creation: Option<&Value>, result: &mut Usage) {
    let Some(Value::Object(cache_creation)) = cache_creation else {
        return;
    };
    let counts = ANTHROPIC_CACHE_FIELDS
        .iter()
        .filter_map(|&(destination, source)| {
            nonnegative_integer(cache_creation.get(source))
                .map(|value| (destination.to_owned(), value))
        })
        .collect::<Usage>();
    if counts.is_empty() {
        return;
    }
    let attributed = counts.values().sum::<f64>();
    result.extend(counts);
    let remainder = result
        .get("cache_creation_input_tokens")
        .copied()
        .unwrap_or(0.0)
        - attributed;
    if remainder > 0.0 {
        result.insert("cache_creation_input_tokens".to_owned(), remainder);
    } else {
        result.shift_remove("cache_creation_input_tokens");
    }
}

fn subtract_usage(usage: &mut Usage, target: &str, terms: &[&str]) {
    let Some(value) = usage.get(target).copied().filter(|value| value.is_finite()) else {
        return;
    };
    let subtract = terms
        .iter()
        .filter_map(|key| usage.get(*key))
        .filter(|value| value.is_finite())
        .sum::<f64>();
    usage.insert(target.to_owned(), (value - subtract).max(0.0));
}

// Each alias list is ordered; its first matching source key supplies the canonical field. Keys
// outside the alias lists remain in the normalized details.
const GENERIC_USAGE: [UsageRule; 9] = [
    ("input", &["prompt_tokens", "input_tokens", "prompt"]),
    (
        "output",
        &["completion_tokens", "output_tokens", "completion"],
    ),
    ("total", &["total_tokens", "total"]),
    (
        "input_cached_tokens",
        &[
            "cache_read.input_tokens",
            "cache_read_input_tokens",
            "cache_read_tokens",
            "details.cache_read_tokens",
            "details.cache_read_input_tokens",
            "prompt_details.cache_read",
            "input_cached_tokens",
        ],
    ),
    (
        "input_cache_creation",
        &[
            "cache_creation.input_tokens",
            "cache_write.input_tokens",
            "cache_creation_input_tokens",
            "cache_write_tokens",
            "details.cache_write_tokens",
            "details.cache_creation_input_tokens",
            "prompt_details.cache_write",
            "input_cache_creation",
        ],
    ),
    (
        "input_cache_creation_5m",
        &["cache_creation.5m_input_tokens"],
    ),
    (
        "input_cache_creation_1h",
        &["cache_creation.1h_input_tokens"],
    ),
    (
        "output_reasoning_tokens",
        &["reasoning.output_tokens", "completion_details.reasoning"],
    ),
    ("output_audio_tokens", &["completion_details.audio"]),
];

fn normalize_generic_usage(raw: Usage) -> Usage {
    let mut values =
        GENERIC_USAGE.map(|(_, sources)| sources.iter().find_map(|key| raw.get(*key)).copied());
    let [input, output, _, cached, creation, five_minute, one_hour, reasoning, audio] = values;
    let breakdown = five_minute.unwrap_or(0.0) + one_hour.unwrap_or(0.0);
    let remainder = if creation.is_some() && (five_minute.is_some() || one_hour.is_some()) {
        (creation.unwrap_or(0.0) - breakdown).max(0.0)
    } else {
        creation.unwrap_or(0.0)
    };
    // Keep the arithmetic order: cache TTLs split the aggregate before reducing total input.
    values[0] = input.map(|value| (value - cached.unwrap_or(0.0) - remainder - breakdown).max(0.0));
    values[1] =
        output.map(|value| (value - reasoning.unwrap_or(0.0) - audio.unwrap_or(0.0)).max(0.0));
    values[4] = creation.map(|_| remainder);
    let mut result = raw
        .into_iter()
        .filter(|(key, _)| {
            !GENERIC_USAGE
                .iter()
                .any(|(_, sources)| sources.contains(&key.as_str()))
        })
        .map(|(key, value)| {
            (
                key.strip_prefix("details.").unwrap_or(&key).to_owned(),
                value,
            )
        })
        .collect::<Usage>();
    for ((key, _), value) in GENERIC_USAGE.into_iter().zip(values) {
        if let Some(value) = value {
            result.insert(key.to_owned(), value);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::otel::value::json;

    #[test]
    fn generic_usage_subtracts_cache_and_reasoning() {
        let attrs = json!({
            "gen_ai.usage.input_tokens": 10,
            "gen_ai.usage.cache_read_input_tokens": 3,
            "gen_ai.usage.output_tokens": 8,
            "gen_ai.usage.reasoning.output_tokens": 2,
        });
        let usage = extract_usage_details(
            attrs.as_object().unwrap(),
            "unknown",
            &mut JsonParseCache::default(),
        );
        assert_eq!(usage.get("input"), Some(&json!(7)));
        assert_eq!(usage.get("output"), Some(&json!(6)));
    }

    #[test]
    fn generic_usage_accepts_javascript_numeric_strings() {
        let attrs = json!({
            "gen_ai.usage.input_tokens": " 100 ",
            "gen_ai.usage.output_tokens": "0x10",
            "gen_ai.usage.cache_read_input_tokens": "\u{feff}3",
        });
        let usage = extract_usage_details(
            attrs.as_object().unwrap(),
            "unknown",
            &mut JsonParseCache::default(),
        );
        assert_eq!(usage.get("input"), Some(&json!(97)));
        assert_eq!(usage.get("output"), Some(&json!(16)));
        assert_eq!(usage.get("input_cached_tokens"), Some(&json!(3)));
    }

    #[test]
    fn genkit_without_usage_falls_back_to_generic_attributes() {
        let attrs = json!({
            "genkit:output": {"text": "done"},
            "gen_ai.usage.input_tokens": 7,
        });
        let usage = extract_usage_details(
            attrs.as_object().unwrap(),
            "genkit-tracer",
            &mut JsonParseCache::default(),
        );
        assert_eq!(usage.get("input"), Some(&json!(7)));

        for usage in [json!([]), json!("text")] {
            let attrs = json!({
                "genkit:output": {"usage": usage},
                "gen_ai.usage.input_tokens": 7,
            });
            assert!(extract_usage_details(
                attrs.as_object().unwrap(),
                "genkit-tracer",
                &mut JsonParseCache::default(),
            )
            .is_empty());
        }
    }

    #[test]
    fn explicit_usage_fallback_matches_javascript_truthiness() {
        let cases = [
            (None, true),
            (Some(json!(null)), true),
            (Some(json!(false)), true),
            (Some(json!(0)), true),
            (Some(json!("")), true),
            (Some(json!({})), false),
            (Some(json!([])), false),
            (Some(json!("null")), false),
            (Some(json!("[]")), false),
            (Some(json!("not-json")), true),
        ];
        for (explicit, should_fallback) in cases {
            let mut attrs = json!({
                "gen_ai.usage.input_tokens": 7,
                "gen_ai.usage.cost": 3,
            });
            if let Some(explicit) = explicit {
                let object = attrs.as_object_mut().unwrap();
                object.insert(
                    "langfuse.observation.usage_details".into(),
                    explicit.clone(),
                );
                object.insert("langfuse.observation.cost_details".into(), explicit);
            }
            let usage = extract_usage_details(
                attrs.as_object().unwrap(),
                "unknown",
                &mut JsonParseCache::default(),
            );
            assert_eq!(
                usage.contains_key("input"),
                should_fallback,
                "explicit={:?}",
                attrs.get("langfuse.observation.usage_details")
            );
            let costs =
                extract_cost_details(attrs.as_object().unwrap(), &mut JsonParseCache::default());
            assert_eq!(costs.contains_key("total"), should_fallback);
        }
    }

    #[test]
    fn generic_usage_subtracts_cache_write_ttl_breakdown_from_input() {
        let attrs = json!({
            "gen_ai.usage.input_tokens": 100,
            "gen_ai.usage.cache_creation.input_tokens": 30,
            "gen_ai.usage.cache_creation.5m_input_tokens": 20,
            "gen_ai.usage.cache_creation.1h_input_tokens": 5,
        });
        let usage = extract_usage_details(
            attrs.as_object().unwrap(),
            "unknown",
            &mut JsonParseCache::default(),
        );
        assert_eq!(usage.get("input"), Some(&json!(70)));
        assert_eq!(usage.get("input_cache_creation"), Some(&json!(5)));
        assert_eq!(usage.get("input_cache_creation_5m"), Some(&json!(20)));
        assert_eq!(usage.get("input_cache_creation_1h"), Some(&json!(5)));
    }

    #[test]
    fn anthropic_cache_creation_keeps_ttl_breakdown_out_of_aggregate() {
        let attributes = json!({
            "gen_ai.usage.input_tokens": 100,
            "gen_ai.usage.output_tokens": 50,
            "ai.response.providerMetadata": {
                "anthropic": {
                    "usage": {
                        "cache_creation_input_tokens": 30,
                        "cache_read_input_tokens": 10,
                        "cache_creation": {
                            "ephemeral_5m_input_tokens": 20,
                            "ephemeral_1h_input_tokens": 5
                        }
                    }
                }
            }
        });
        let usage = extract_usage_details(
            attributes.as_object().unwrap(),
            "ai",
            &mut JsonParseCache::default(),
        );
        assert_eq!(usage.get("input_cache_creation"), Some(&json!(5)));
        assert_eq!(usage.get("input_cache_creation_5m"), Some(&json!(20)));
        assert_eq!(usage.get("input_cache_creation_1h"), Some(&json!(5)));
        assert_eq!(usage.get("input_cached_tokens"), Some(&json!(10)));
        assert_eq!(usage.get("input"), Some(&json!(60)));
        assert_eq!(usage.get("output"), Some(&json!(50)));
    }

    #[test]
    fn ai_metadata_errors_preserve_independent_token_counts() {
        for metadata in ["{broken", "null", r#"{"openai":null}"#] {
            let attributes = json!({
                "gen_ai.usage.input_tokens": 100,
                "gen_ai.usage.output_tokens": 50,
                "ai.response.providerMetadata": metadata,
            });
            let usage = extract_usage_details(
                attributes.as_object().unwrap(),
                "ai",
                &mut JsonParseCache::default(),
            );
            assert_eq!(usage.get("input"), Some(&json!(100)));
            assert_eq!(usage.get("output"), Some(&json!(50)));
        }
    }

    #[test]
    fn usage_schema_discards_fractional_and_negative_counts_but_parses_strings() {
        let attributes = json!({"langfuse.observation.usage_details": json!({
            "integer": 3, "fractional": 3.5, "negative": -1,
            "string": " 12tokens", "decimal_string": "4.9",
            "bom": "\u{feff}12", "next_line": "\u{0085}12",
        }).to_string()});
        let sanitized = extract_usage_details(
            attributes.as_object().unwrap(),
            "langfuse-sdk",
            &mut JsonParseCache::default(),
        );
        assert_eq!(
            sanitized,
            IndexMap::from([
                ("integer".to_owned(), json!(3)),
                ("string".to_owned(), json!(12)),
                ("decimal_string".to_owned(), json!(4)),
                ("bom".to_owned(), json!(12)),
            ])
        );
    }

    #[test]
    fn openai_usage_keeps_valid_extension_fields() {
        let attributes = json!({
            "langfuse.observation.usage_details": json!({
                "prompt_tokens": 2,
                "completion_tokens": 3,
                "total_tokens": 5,
                "cost": 7,
                "prompt_tokens_details": {"cached_tokens": 1},
            }).to_string(),
        });
        let usage = extract_usage_details(
            attributes.as_object().unwrap(),
            "langfuse-sdk",
            &mut JsonParseCache::default(),
        );
        assert_eq!(usage.get("total"), Some(&json!(5)));
        assert_eq!(usage.get("cost"), Some(&json!(7)));
        assert_eq!(
            usage.keys().map(String::as_str).collect::<Vec<_>>(),
            ["cost", "input", "output", "total", "input_cached_tokens"]
        );
    }

    #[test]
    fn cost_details_keep_finite_numbers_and_numeric_strings() {
        let attributes = json!({
            "langfuse.observation.cost_details": json!({
                "number": 1.25,
                "string": "1.25",
                "trimmed": " 2.5 ",
                "hex": "0x10",
                "bom": "\u{feff}3.5",
                "infinity": "Infinity",
                "currency": "USD",
                "blank": " ",
                "null": null,
                "object": {"value": 1},
            }).to_string(),
        });
        let costs = extract_cost_details(
            attributes.as_object().unwrap(),
            &mut JsonParseCache::default(),
        );
        assert_eq!(
            costs,
            BTreeMap::from([
                ("number".to_owned(), json!(1.25)),
                ("string".to_owned(), json!(1.25)),
                ("trimmed".to_owned(), json!(2.5)),
                ("hex".to_owned(), json!(16)),
                ("bom".to_owned(), json!(3.5)),
            ])
        );

        let fallback = json!({"gen_ai.usage.cost": "\u{feff}4.5"});
        assert_eq!(
            extract_cost_details(
                fallback.as_object().unwrap(),
                &mut JsonParseCache::default(),
            ),
            BTreeMap::from([("total".to_owned(), json!(4.5))])
        );
        for value in [json!("USD"), json!(false), json!(" ")] {
            let attributes = json!({"gen_ai.usage.cost": value, "llm.cost.total": 9});
            assert!(extract_cost_details(
                attributes.as_object().unwrap(),
                &mut JsonParseCache::default(),
            )
            .is_empty());
        }
        for (text, bits) in [
            ("0x1000000000000081", 0x43b0000000000001),
            ("0x1000000000000080000000000000000001", 0x4830000000000001),
        ] {
            assert_eq!(parse_javascript_number(text).unwrap().to_bits(), bits);
        }
    }
}
