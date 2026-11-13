//! Choose model, prompt and observation fields from OTLP attributes.
//!
//! `events::build::build_event` calls these extractors to populate `OwnedEvent`.
//! `rules` declares attribute precedence, field mappings and observation-type aliases.
//! The functions here apply those rules and handle provider-specific conversions.

use std::borrow::Cow;

use super::{is_meaningful, parse_javascript_number, select_first, trim_javascript};

use crate::otel::attributes::{
    is_js_truthy, javascript_string, value_as_f64, value_as_string, JsonParseCache,
};
use crate::otel::types::JsonObject;
use crate::otel::value::{JsString, Value};

mod rules;
use rules::{
    AI_PARAM_RULES, DECLARED_OBSERVATION_TYPES, FIRST_CHUNK_MS_KEYS, GENERATION_MODEL_KEYS,
    GENKIT_CONFIG_SOURCES, GOOGLE_METADATA_KEYS, INFERRED_OBSERVATION_TYPES,
    LEGACY_GENERATION_KEYS, LEGACY_PARAM_KEYS, MODEL_NAME_KEYS, NAME_RULES, PARAM_PREFIXES,
    PROMPT_VERSION_KEYS, PUBLIC_KEYS, TAG_RULES, VERCEL_MODEL_KEYS, VERCEL_MODEL_OPERATIONS,
};

struct NameRule {
    key: &'static str,
    require_truthy: bool,
}

struct TagRule {
    key: &'static str,
    decode_metadata: bool,
    require_truthy: bool,
}

pub fn extract_name(
    span_name: &str,
    attributes: &JsonObject,
    observation_type: &str,
    scope_name: &str,
) -> String {
    for rule in NAME_RULES {
        if let Some(value) = attributes
            .get(rule.key)
            .filter(|value| !rule.require_truthy || is_js_truthy(value))
        {
            return value_as_string(value).unwrap_or_default();
        }
    }
    if let Some(operation) = attributes.get("ai.operationId") {
        let prefix = attributes
            .get("ai.telemetry.functionId")
            .filter(|value| is_js_truthy(value))
            .and_then(value_as_string)
            .map(|value| format!("{value}:"))
            .unwrap_or_default();
        return format!("{prefix}{}", value_as_string(operation).unwrap_or_default());
    }
    if span_name == "anthropic.session.turn"
        && observation_type == "AGENT"
        && scope_name == "com.anthropic.claude-platform"
        && attributes
            .get("gen_ai.operation.name")
            .and_then(Value::as_str)
            == Some("invoke_agent")
        && claude_managed_agent_session_id(attributes, scope_name).is_some()
    {
        if let Some(name) = attributes
            .get("gen_ai.agent.name")
            .and_then(Value::as_str)
            .filter(|name| !trim_javascript(name).is_empty())
        {
            return name.to_owned();
        }
    }
    span_name.to_owned()
}

pub fn extract_model_name(attributes: &JsonObject) -> Option<String> {
    if let Some(value) = select_first(attributes, MODEL_NAME_KEYS, is_js_truthy) {
        return value_as_string(value);
    }
    if attributes.get("genkit:metadata:subtype") == Some(&Value::String("model".into())) {
        return attributes
            .get("genkit:name")
            .filter(|value| is_js_truthy(value))
            .and_then(value_as_string);
    }
    None
}

pub fn extract_model_parameters(
    attributes: &JsonObject,
    scope_name: &str,
    parse_cache: &mut JsonParseCache,
) -> Option<Value> {
    let explicit = attributes
        .get("langfuse.observation.model.parameters")
        .and_then(|value| parse_json_argument(value, parse_cache))
        .map(|value| sanitize_model_params(&value));
    if scope_name != "ai" && explicit.as_ref().is_some_and(is_js_truthy) {
        return explicit;
    }
    match scope_name {
        "genkit-tracer" => {
            if let Some(config) = genkit_model_parameters(attributes, parse_cache) {
                return Some(config);
            }
        }
        "ai" => return Some(ai_model_parameters(attributes, explicit, parse_cache)),
        _ => {}
    }

    for &key in LEGACY_PARAM_KEYS {
        if let Some(value) = attributes
            .get(key)
            .and_then(|value| parse_json_argument(value, parse_cache))
            .map(|value| sanitize_model_params(&value))
        {
            return Some(value);
        }
    }
    let mut params = JsonObject::new();
    for &prefix in PARAM_PREFIXES {
        for (key, value) in attributes {
            if let Some(parameter) = key.strip_prefix(prefix) {
                if parameter.as_utf8() != Some("model") {
                    params.insert(parameter, value.clone());
                }
            }
        }
    }
    Some(sanitize_model_params(&Value::Object(params)))
}

pub fn extract_tags(
    attributes: &JsonObject,
    parse_cache: &mut JsonParseCache,
    decode_metadata_values: bool,
) -> Vec<String> {
    let value = TAG_RULES.iter().find_map(|rule| {
        let raw = attributes.get(rule.key);
        let decoded = (decode_metadata_values && rule.decode_metadata)
            .then(|| parse_cache.parse(raw))
            .flatten()
            .or(raw);
        decoded
            .filter(|value| !rule.require_truthy || is_js_truthy(value))
            .cloned()
    });
    let Some(tag_value) = value else {
        return Vec::new();
    };
    match &tag_value {
        Value::Array(values) => values.iter().map(javascript_string).collect(),
        Value::String(text) => {
            if trim_javascript(text.as_str()).starts_with('[') {
                if let Some(values) = parse_cache
                    .parse(Some(&tag_value))
                    .and_then(Value::as_array)
                {
                    return values.iter().map(javascript_string).collect();
                }
            }
            if text.as_str().contains(',') {
                text.as_str()
                    .split(',')
                    .map(|value| trim_javascript(value).to_owned())
                    .collect()
            } else {
                vec![text.as_str().to_owned()]
            }
        }
        // Strings and arrays produce tags. Array members use JS String coercion; tag extraction
        // ignores other top-level value kinds.
        _ => Vec::new(),
    }
}

pub fn extract_completion_start_time(
    attributes: &JsonObject,
    start_time: &str,
    parse_cache: &mut JsonParseCache,
) -> Option<String> {
    if let Some(value) = attributes.get("langfuse.observation.completion_start_time") {
        // Accept a date string or a JSON-encoded date string; otherwise derive the time
        // from first-chunk latency below.
        if let Some(value) = valid_date_string_with_cache(value, parse_cache) {
            return Some(value);
        }
    }
    let primary_offset = select_first(attributes, FIRST_CHUNK_MS_KEYS, |_| true);
    let offset = match primary_offset {
        Some(value) if is_js_truthy(value) => value_as_f64(Some(value)),
        Some(_) => None,
        None => attributes
            .get("gen_ai.client.operation.time_to_first_chunk")
            .filter(|value| is_js_truthy(value))
            .and_then(|value| value_as_f64(Some(value)))
            .map(|seconds| seconds * 1000.0)
            .filter(|milliseconds| milliseconds.is_finite()),
    }?;
    let start = chrono::DateTime::parse_from_rfc3339(start_time).ok()?;
    let milliseconds = offset.ceil();
    if !milliseconds.is_finite() || milliseconds < i64::MIN as f64 || milliseconds > i64::MAX as f64
    {
        return None;
    }
    let duration = chrono::TimeDelta::try_milliseconds(milliseconds as i64)?;
    let timestamp = start.checked_add_signed(duration)?;
    Some(timestamp.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

/// Read the prompt version used by the event processor. Accept an integer JSON number or a string
/// containing only decimal digits. This boundary filters values such as `"12foo"` and `1.5` before
/// the later IngestionService lookup runs `parseInt` on an accepted value.
pub fn extract_prompt_version_lookup(
    attributes: &JsonObject,
    parse_cache: &mut JsonParseCache,
) -> Option<f64> {
    let prompt = parse_cache.parse(attributes.get("ai.telemetry.metadata.langfusePrompt"));
    let value =
        select_first(attributes, PROMPT_VERSION_KEYS, |value| !value.is_null()).or_else(|| {
            prompt
                .and_then(|value| value.get("version"))
                .filter(|value| !value.is_null())
        })?;
    match value {
        Value::Number(value) => value
            .as_f64()
            .filter(|value| value.is_finite() && value.fract() == 0.0),
        Value::String(value) => {
            let value = value.as_str();
            let value = value.trim();
            if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
                return None;
            }
            value.parse::<f64>().ok()
        }
        _ => None,
    }
}

/// Convert the accepted prompt version to the UInt16 storage field. Lookup keeps the wider
/// number separately because prompt resolution happens before ClickHouse's UInt16 constraint.
pub fn extract_prompt_version(
    attributes: &JsonObject,
    parse_cache: &mut JsonParseCache,
) -> Option<u16> {
    extract_prompt_version_lookup(attributes, parse_cache).and_then(|value| {
        (value >= 0.0 && value <= u16::MAX as f64 && value.fract() == 0.0).then_some(value as u16)
    })
}

fn is_true(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Bool(true))) || value.and_then(Value::as_str) == Some("true")
}

pub fn extract_public(attributes: &JsonObject) -> bool {
    is_true(select_first(attributes, PUBLIC_KEYS, |_| true))
}

pub fn extract_is_app_root(attributes: &JsonObject) -> bool {
    is_true(attributes.get("langfuse.internal.is_app_root"))
}

/// A session ID distinguishes managed-agent traces from ordinary Anthropic API calls.
pub fn claude_managed_agent_session_id<'a>(
    attributes: &'a JsonObject,
    scope_name: &str,
) -> Option<&'a str> {
    if scope_name != "com.anthropic.claude-platform"
        && !scope_name.starts_with("com.anthropic.sdk.")
    {
        return None;
    }
    attributes
        .get("anthropic.session.id")
        .and_then(Value::as_str)
        .filter(|id| !trim_javascript(id).is_empty())
}

fn is_claude_session_creation(attributes: &JsonObject, scope_name: &str, span_name: &str) -> bool {
    span_name == "anthropic.sessions.create"
        && !attributes
            .get("gen_ai.operation.name")
            .is_some_and(is_meaningful)
        && claude_managed_agent_session_id(attributes, scope_name).is_some()
}

pub fn should_skip_model_usage_and_cost(
    attributes: &JsonObject,
    scope_name: &str,
    span_name: &str,
    observation_type: &str,
) -> bool {
    matches!(
        attributes
            .get("gen_ai.operation.name")
            .and_then(Value::as_str),
        Some("invoke_agent" | "agent_step")
    ) || (observation_type == "SPAN"
        && is_claude_session_creation(attributes, scope_name, span_name))
}

fn declared_observation_type(attributes: &JsonObject) -> Option<&'static str> {
    DECLARED_OBSERVATION_TYPES
        .iter()
        .find_map(|(key, aliases)| {
            let value = attributes.get(*key)?.as_str()?;
            aliases
                .iter()
                .find_map(|(alias, kind)| (*alias == value).then_some(*kind))
        })
}

fn legacy_python_generation(
    attributes: &JsonObject,
    resource: &JsonObject,
    scope_name: &str,
    scope_version: Option<&str>,
) -> bool {
    if attributes
        .get("langfuse.observation.type")
        .and_then(Value::as_str)
        != Some("span")
        || scope_name != "langfuse-sdk"
        || resource
            .get("telemetry.sdk.language")
            .and_then(Value::as_str)
            != Some("python")
    {
        return false;
    }
    // Compare major and minor components only; every 3.3.x patch release uses this compatibility
    // path.
    let mut version = scope_version.unwrap_or_default().split('.');
    let major = version.next().and_then(parse_javascript_number);
    let minor = version.next().and_then(parse_javascript_number);
    if major.is_some_and(|major| {
        major > 3.0 || (major == 3.0 && minor.is_some_and(|minor| minor > 3.0))
    }) {
        return false;
    }
    LEGACY_GENERATION_KEYS
        .iter()
        .any(|key| attributes.contains_key(*key))
}

fn has_meaningful_attribute(attributes: &JsonObject, keys: &[&str]) -> bool {
    select_first(attributes, keys, is_meaningful).is_some()
}

fn vercel_observation_type(attributes: &JsonObject) -> Option<&'static str> {
    let matches = |operations: &[&str]| {
        attributes
            .get("operation.name")
            .and_then(Value::as_str)
            .is_some_and(|name| {
                operations
                    .iter()
                    .any(|operation| name.starts_with(operation))
            })
            || attributes
                .get("ai.operationId")
                .and_then(Value::as_str)
                .is_some_and(|id| operations.contains(&id))
    };
    for &(operations, kind) in VERCEL_MODEL_OPERATIONS {
        if matches(operations) {
            return has_meaningful_attribute(attributes, VERCEL_MODEL_KEYS).then_some(kind);
        }
    }
    matches(&["ai.toolCall"]).then_some("TOOL")
}

pub fn observation_type(
    attributes: &JsonObject,
    resource: &JsonObject,
    scope_name: &str,
    scope_version: Option<&str>,
    span_name: &str,
) -> String {
    legacy_python_generation(attributes, resource, scope_name, scope_version)
        .then_some("GENERATION")
        .or_else(|| declared_observation_type(attributes))
        .or_else(|| vercel_observation_type(attributes))
        .or_else(|| {
            INFERRED_OBSERVATION_TYPES.iter().find_map(|(keys, kind)| {
                has_meaningful_attribute(attributes, keys).then_some(*kind)
            })
        })
        .or(match (scope_name, span_name) {
            ("livekit-agents", "agent_turn" | "start_agent_activity") => Some("AGENT"),
            ("livekit-agents", "function_tool") => Some("TOOL"),
            _ => None,
        })
        .or_else(|| is_claude_session_creation(attributes, scope_name, span_name).then_some("SPAN"))
        // Treat ai.model.id as a generation signal only when the Vercel operation marker is set.
        .or_else(|| {
            has_meaningful_attribute(attributes, GENERATION_MODEL_KEYS).then_some("GENERATION")
        })
        .unwrap_or("SPAN")
        .to_owned()
}
fn valid_date_string_with_cache(value: &Value, parse_cache: &mut JsonParseCache) -> Option<String> {
    let candidate = match value {
        Value::String(value) => Some(value.as_str().to_owned()),
        _ => None,
    }?;
    if is_valid_date_string(&candidate) {
        return Some(candidate);
    }
    let parsed = parse_cache.parse(Some(value))?.as_str()?.to_owned();
    is_valid_date_string(&parsed).then_some(parsed)
}

fn is_valid_date_string(value: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(value).is_ok()
        || chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f").is_ok()
        || chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

fn genkit_model_parameters(
    attributes: &JsonObject,
    parse_cache: &mut JsonParseCache,
) -> Option<Value> {
    for (key, path) in GENKIT_CONFIG_SOURCES {
        let config = parse_cache
            .parse_or_self(attributes.get(*key))
            .and_then(|value| path.iter().try_fold(value, |value, key| value.get(key)))
            .filter(|value| !value.is_null());
        if let Some(config) = config {
            // A selected false, zero or empty-string config blocks the other Genkit source;
            // extraction falls through to legacy model-parameter attributes.
            return is_js_truthy(config).then(|| sanitize_model_params(config));
        }
    }
    None
}

fn ai_model_parameters(
    attributes: &JsonObject,
    explicit: Option<Value>,
    parse_cache: &mut JsonParseCache,
) -> Value {
    let mut params = AI_PARAM_RULES
        .iter()
        .map(|(output, inputs)| {
            let value = select_first(attributes, inputs, |_| true);
            let value = value.map_or(Value::Null, |value| match value {
                Value::Null | Value::String(_) => value.clone(),
                _ => Value::String(javascript_string(value).into()),
            });
            ((*output).into(), value)
        })
        .collect::<JsonObject>();
    if let Some(tier @ Value::String(_)) = parse_cache
        .parse(attributes.get("ai.response.providerMetadata"))
        .and_then(response_service_tier)
    {
        params.insert("service_tier".into(), tier.clone());
    }
    if let Some(explicit) = explicit {
        extend_ai_model_parameters(&mut params, explicit);
    }
    Value::Object(params)
}

fn response_service_tier(metadata: &Value) -> Option<&Value> {
    metadata
        .path(["openai", "serviceTier"])
        .filter(|value| !value.is_null())
        .or_else(|| {
            // Select the provider object before its tier. For example, googleVertex: {}
            // blocks vertex.serviceTier; a flat list of tier paths would change that.
            let google = select_first(metadata.as_object()?, GOOGLE_METADATA_KEYS, |value| {
                !value.is_null()
            })?;
            google
                .get("serviceTier")
                .filter(|value| !value.is_null())
                .or_else(|| google.path(["usageMetadata", "trafficType"]))
        })
}

/// Apply the TypeScript parameter conversion: top-level arrays become indexed objects, while
/// each object/array member keeps strings/numbers and JSON-stringifies other member values.
fn sanitize_model_params(value: &Value) -> Value {
    let entries = match value {
        Value::Object(object) => object
            .iter()
            .map(|(key, value)| (key.clone(), sanitize_model_param_value(value)))
            .collect(),
        // Object.entries(array) exposes enumerable numeric properties. This is
        // how JavaScript turns a JSON array of parameters into {"0": ..., ...}.
        Value::Array(values) => values
            .iter()
            .enumerate()
            .map(|(index, value)| (index.to_string().into(), sanitize_model_param_value(value)))
            .collect(),
        _ => return value.clone(),
    };
    Value::Object(entries)
}

fn sanitize_model_param_value(value: &Value) -> Value {
    match value {
        Value::String(_) | Value::Number(_) => value.clone(),
        _ => Value::String(crate::otel::attributes::javascript_json_stringify(value).into()),
    }
}

/// Match `JSON.parse(attribute as string)` for the legacy model-parameter fields.
/// OTLP normally supplies strings, but JavaScript also coerces truthy arrays and
/// scalars before parsing them. Cached string parses are borrowed until sanitization.
fn parse_json_argument<'a>(
    value: &'a Value,
    parse_cache: &'a mut JsonParseCache,
) -> Option<Cow<'a, Value>> {
    if !is_js_truthy(value) {
        return None;
    }
    match value {
        Value::String(_) => parse_cache.parse(Some(value)).map(Cow::Borrowed),
        value => Value::parse(&javascript_string(value)).ok().map(Cow::Owned),
    }
}

fn extend_ai_model_parameters(parameters: &mut JsonObject, value: Value) {
    match value {
        Value::Object(object) => {
            parameters.extend(object);
        }
        Value::String(text) => {
            for (index, unit) in text.utf16_units().enumerate() {
                parameters.insert(
                    index.to_string().into(),
                    Value::String(JsString::from_utf16_unit(unit)),
                );
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::Array(_) => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::otel::value::json;

    #[test]
    fn completion_start_time_accepts_gen_ai_time_to_first_chunk_seconds() {
        let attributes = json!({
            "gen_ai.client.operation.time_to_first_chunk": 1.18922124899996
        });

        assert_eq!(
            extract_completion_start_time(
                attributes.as_object().unwrap(),
                "2024-01-01T00:00:00.000Z",
                &mut JsonParseCache::default(),
            ),
            Some("2024-01-01T00:00:01.190Z".to_owned())
        );
    }

    #[test]
    fn completion_start_time_ignores_zero_time_to_first_chunk() {
        let attributes = json!({
            "ai.response.msToFirstChunk": 0,
        });

        assert_eq!(
            extract_completion_start_time(
                attributes.as_object().unwrap(),
                "2024-01-01T00:00:00.000Z",
                &mut JsonParseCache::default(),
            ),
            None
        );
    }

    #[test]
    fn names_follow_attribute_precedence() {
        let attrs = json!({
            "gen_ai.request.model": "requested-model",
            "litellm.provider.model": "served-model",
        });
        assert_eq!(
            extract_model_name(attrs.as_object().unwrap()).as_deref(),
            Some("served-model")
        );
        let names = [
            "gen_ai.tool.name",
            "genkit:name",
            "logfire.msg",
            "ai.toolCall.name",
        ];
        for first in 0..names.len() {
            let attributes = names[first..]
                .iter()
                .map(|name| ((*name).into(), json!(name)))
                .collect();
            assert_eq!(
                extract_name("span", &attributes, "SPAN", "ai"),
                names[first]
            );
        }
    }

    #[test]
    fn ai_model_parameters_read_provider_response_tiers() {
        for provider in ["openai", "googleVertex", "vertex", "google"] {
            for metadata in [
                json!({"serviceTier": "flex"}),
                json!({"usageMetadata": {"trafficType": "flex"}}),
            ] {
                if provider == "openai" && metadata.get("serviceTier").is_none() {
                    continue;
                }
                let attributes = json!({
                    "ai.response.providerMetadata": json!({provider: metadata}).to_string(),
                    "gen_ai.request.service_tier": "standard",
                });
                let params = extract_model_parameters(
                    attributes.as_object().unwrap(),
                    "ai",
                    &mut JsonParseCache::default(),
                )
                .unwrap();
                assert_eq!(params["service_tier"], json!("flex"), "{attributes:?}");
            }
        }
    }

    #[test]
    fn model_parameters_keep_js_coercion_and_prefix_precedence() {
        let attributes = json!({
            "gen_ai.request.temperature": [1, 2],
            "llm.invocation_parameters.temperature": "llm",
            "ai.settings.maxRetries": null,
        });
        let params = extract_model_parameters(
            attributes.as_object().unwrap(),
            "other",
            &mut JsonParseCache::default(),
        )
        .unwrap();
        assert_eq!(params["temperature"], json!("llm"));
        assert_eq!(params["maxRetries"], Value::Null);
        for (config, temperature) in [
            (json!(null), 0.9),
            (json!(false), 0.5),
            (json!(0), 0.5),
            (json!(""), 0.5),
        ] {
            let attributes = json!({
                "genkit:input": {"config": config},
                "genkit:output": {"request": {"config": {"temperature": 0.9}}},
                "gen_ai.request.temperature": 0.5,
            });
            assert_eq!(
                extract_model_parameters(
                    attributes.as_object().unwrap(),
                    "genkit-tracer",
                    &mut JsonParseCache::default()
                ),
                Some(json!({"temperature": temperature})),
            );
        }
    }

    #[test]
    fn model_parameters_follow_json_argument_coercion_and_fallback() {
        for (key, value, expected) in [
            (
                "langfuse.observation.model.parameters",
                json!("[1,2]"),
                json!({"0": 1, "1": 2}),
            ),
            (
                "langfuse.observation.model.parameters",
                json!("0"),
                json!({"temperature": "0.5"}),
            ),
            (
                "langfuse.observation.model.parameters",
                json!("null"),
                json!({"temperature": "0.5"}),
            ),
            (
                "langfuse.observation.model.parameters",
                json!([1]),
                json!(1),
            ),
            ("llm.invocation_parameters", json!([1]), json!(1)),
            ("model_config", json!(true), json!(true)),
        ] {
            let attributes = JsonObject::from_iter([
                (key.into(), value),
                ("gen_ai.request.temperature".into(), json!("0.5")),
            ]);
            assert_eq!(
                extract_model_parameters(&attributes, "other", &mut JsonParseCache::default())
                    .unwrap(),
                expected,
                "{key}",
            );
        }
    }

    #[test]
    fn ai_model_parameters_spread_string_code_units() {
        for (encoded, expected) in [
            (
                r#""text""#,
                [r#""t""#, r#""e""#, r#""x""#, r#""t""#].as_slice(),
            ),
            (r#""😀""#, [r#""\ud83d""#, r#""\ude00""#].as_slice()),
            (r#""\ud800""#, [r#""\ud800""#].as_slice()),
        ] {
            let attributes = json!({
                "langfuse.observation.model.parameters": encoded,
            });
            let params = extract_model_parameters(
                attributes.as_object().unwrap(),
                "ai",
                &mut JsonParseCache::default(),
            )
            .unwrap();
            for (index, expected) in expected.iter().enumerate() {
                assert_eq!(
                    params.get(&index.to_string()).unwrap().to_json_string(),
                    *expected
                );
            }
        }
    }

    #[test]
    fn prompt_version_accepts_only_the_event_shape_and_preserves_lookup_range() {
        for (primary, fallback, lookup, stored) in [
            (None, json!("70000"), Some(70000.0), None),
            (None, json!(12.5), None, None),
            (None, json!("12foo"), None, None),
            (None, json!(12), Some(12.0), Some(12)),
            (Some(json!(null)), json!("12"), Some(12.0), Some(12)),
            (Some(json!("")), json!("12"), None, None),
        ] {
            let mut attributes =
                JsonObject::from_iter([("langfuse.prompt.version".into(), fallback)]);
            if let Some(primary) = primary {
                attributes.insert("langfuse.observation.prompt.version".into(), primary);
            }
            let mut cache = JsonParseCache::default();
            assert_eq!(
                extract_prompt_version_lookup(&attributes, &mut cache),
                lookup,
                "{attributes:?}"
            );
            assert_eq!(
                extract_prompt_version(&attributes, &mut cache),
                stored,
                "{attributes:?}"
            );
        }
    }

    #[test]
    fn a_model_attribute_is_a_generation_fallback() {
        let attributes = json!({"langfuse.observation.model.name": "claude"});
        assert_eq!(
            observation_type(
                attributes.as_object().unwrap(),
                &JsonObject::new(),
                "langfuse-sdk",
                None,
                "run"
            ),
            "GENERATION"
        );
        for (operation, operation_id, expected) in [
            (Some("unrelated"), "ai.embed.doEmbed", "EMBEDDING"),
            (None, "ai.embed.doEmbed function-id", "GENERATION"),
        ] {
            let attributes = json!({
                "gen_ai.request.model": "embedding-model",
                "operation.name": operation,
                "ai.operationId": operation_id,
            });
            assert_eq!(
                observation_type(
                    attributes.as_object().unwrap(),
                    &JsonObject::new(),
                    "ai",
                    None,
                    "run"
                ),
                expected,
                "{operation:?}, {operation_id:?}",
            );
        }
    }

    #[test]
    fn tags_use_javascript_fallback_and_string_coercion() {
        let attributes = json!({
            "langfuse.trace.tags": 0,
            "langfuse.tags": [null, false, 1, {"kind": "object"}],
        });
        assert_eq!(
            extract_tags(
                attributes.as_object().unwrap(),
                &mut JsonParseCache::default(),
                false,
            ),
            ["null", "false", "1", "[object Object]"]
        );

        let attributes = json!({"langfuse.trace.tags": 42});
        assert!(extract_tags(
            attributes.as_object().unwrap(),
            &mut JsonParseCache::default(),
            false,
        )
        .is_empty());
    }

    #[test]
    fn tags_keep_plain_text_and_decode_structured_metadata() {
        for (attributes, decode, expected) in [
            (json!({"tag.tags": ""}), false, vec![String::new()]),
            (json!({"langfuse.tags": ""}), false, vec![]),
            (
                json!({"langfuse.trace.tags": "[draft], prod"}),
                false,
                vec!["[draft]".to_owned(), "prod".to_owned()],
            ),
            (
                json!({"langfuse.trace.tags": "production"}),
                false,
                vec!["production".to_owned()],
            ),
            (
                json!({"langfuse.observation.metadata.langfuse_tags": "\"prod,blue\""}),
                true,
                vec!["prod".to_owned(), "blue".to_owned()],
            ),
            (
                json!({"ai.telemetry.metadata.tags": "null"}),
                true,
                vec!["null".to_owned()],
            ),
            (
                json!({"ai.telemetry.metadata.tags": "false"}),
                true,
                vec!["false".to_owned()],
            ),
        ] {
            assert_eq!(
                extract_tags(
                    attributes.as_object().unwrap(),
                    &mut JsonParseCache::default(),
                    decode,
                ),
                expected,
            );
        }
    }
}
