//! `build_event` converts one decoded `Span` into an `OwnedEvent`.
//!
//! It reads the span's attributes and the supplied resource/scope attributes to
//! set identity, timestamps, input/output, metadata, tools and skills. The returned
//! event stores its converted fields and copied resource/scope data, so later stages
//! process it independently of the decoded envelope.

use super::super::attributes::{
    attributes_to_map, is_js_truthy, parse_id, resolve_timestamps, value_as_string,
    AttributeSource, EventAttributes, JsonParseCache,
};
use super::super::event_skills::extract_skills;
use super::super::input::Span;
use super::super::metadata::{
    apply_context_fields, apply_evaluator_test_metadata_default, extract_metadata,
    should_decode_structured_metadata, MetadataDiagnostics, MetadataDomain,
};
use super::super::providers::{
    claude_managed_agent_session_id, extract_completion_start_time, extract_cost_details,
    extract_input_output, extract_is_app_root, extract_model_name, extract_model_parameters,
    extract_name, extract_prompt_version, extract_prompt_version_lookup, extract_public,
    extract_tags, extract_usage_details, observation_type, should_skip_model_usage_and_cost,
};
use super::super::tools::normalize_tools_for_observation;
use super::super::types::{JsonObject, OwnedEvent};
use super::super::value::{Object, Value};
use super::EventBuildConfig;

const INTERNAL_LLM_JUDGE_ENVIRONMENT: &str = "langfuse-llm-as-a-judge";
pub(super) const AI_GATEWAY_SERVICE_NAME: &str = "langfuse-ai-gateway";
const AI_GATEWAY_INGESTION_API_KEY_PREFIX: &str = "gateway:";
const AI_GATEWAY_KEY_ID_METADATA_KEY: &str = "langfuse.gateway.api_key.id";

pub(super) fn build_event(
    mut span: Span,
    resource_attributes: &JsonObject,
    scope: &Object,
    scope_name: &str,
    scope_version: Option<&str>,
    config: &EventBuildConfig,
) -> Result<Option<OwnedEvent>, String> {
    let trace_id = span.trace_id.as_deref().map(parse_id).unwrap_or_default();
    let span_id = span.span_id.as_deref().map(parse_id).unwrap_or_default();
    if trace_id.is_empty() || span_id.is_empty() {
        return Ok(None);
    }
    let parent_span_id = span
        .parent_span_id
        .as_deref()
        .filter(|value| !value.is_null())
        .map(parse_id)
        .filter(|value| !value.is_empty());

    let attributes = object_attributes(span.attributes.take().map(|value| value.into_value()));
    let span_name = span
        .name
        .as_deref()
        .and_then(Value::as_str)
        .unwrap_or_default();
    let event_type = observation_type(
        &attributes,
        resource_attributes,
        scope_name,
        scope_version,
        span_name,
    );
    let name = extract_name(span_name, &attributes, &event_type, scope_name);
    let (start_time_iso, end_time_iso) = resolve_timestamps(
        span.start_time.as_deref(),
        span.end_time.as_deref(),
        &config.fallback_time,
    );
    let events = span
        .events
        .take()
        .map(|events| events.0)
        .unwrap_or_default();
    let mut parse_cache = JsonParseCache::default();
    let mut metadata_diagnostics = MetadataDiagnostics::new(
        &config.project_id,
        &config.ingestion_sdk_name,
        &config.ingestion_sdk_version,
    );
    let decode_metadata_values = should_decode_structured_metadata(
        scope_name,
        scope_version,
        &config.ingestion_sdk_name,
        &config.ingestion_sdk_version,
        resource_attributes
            .get("telemetry.sdk.language")
            .and_then(Value::as_str),
    );
    let mut event_attributes = EventAttributes {
        span: &attributes,
        resource: resource_attributes,
        scope,
        cache: &mut parse_cache,
        decode_metadata: decode_metadata_values,
    };
    let mut row = crate::native_schema::OtelStorageRow::from_attributes(&mut event_attributes);
    if claude_managed_agent_session_id(&attributes, scope_name).is_some() {
        row.session_id = event_attributes.identity(&[
            AttributeSource::Span("langfuse.session.id"),
            AttributeSource::Span("session.id"),
            AttributeSource::Span("anthropic.session.id"),
        ]);
    }
    apply_context_fields(
        &mut row,
        &attributes,
        &mut parse_cache,
        &mut metadata_diagnostics,
    );
    let provider_io = extract_input_output(
        scope_name,
        &attributes,
        events,
        parent_span_id.as_deref().map(|_| "observation"),
        &mut parse_cache,
    );

    // Match processToEvent's object-spread order. The filtered span attributes and OTLP
    // resource/scope envelopes are inserted first; observation and trace metadata are spread on
    // top afterward. This order is visible in metadata_names because storage flattening preserves
    // insertion order.
    let mut metadata = JsonObject::new();
    // Non-SDK spans receive filtered attributes under `metadata.attributes`, matching the legacy
    // shape. `langfuse-sdk` scopes receive the v3 layout with resource and scope data at the root.
    if !scope_name.starts_with("langfuse-sdk") {
        metadata.insert(
            "attributes".into(),
            Value::Object(provider_io.filtered_attributes),
        );
    }
    metadata.insert(
        "resourceAttributes".into(),
        Value::Object(resource_attributes.clone()),
    );
    metadata.insert("scope".into(), Value::Object(scope.clone()));
    for (key, value) in extract_metadata(
        &attributes,
        MetadataDomain::Observation,
        &mut parse_cache,
        decode_metadata_values,
        &mut metadata_diagnostics,
    ) {
        metadata.insert(key, value);
    }
    for (key, value) in extract_metadata(
        &attributes,
        MetadataDomain::Trace,
        &mut parse_cache,
        decode_metadata_values,
        &mut metadata_diagnostics,
    ) {
        metadata.insert(key, value);
    }

    // Run this after provider extraction and metadata construction so metadata-carried
    // definitions move into input before definition/call extraction, matching production.
    let normalized_tools = normalize_tools_for_observation(
        provider_io.input,
        provider_io.output,
        metadata,
        &mut parse_cache,
    );
    let tools = normalized_tools.tools;
    let metadata = normalized_tools.metadata;
    let input = normalized_tools.input;
    let output = normalized_tools.output;
    apply_evaluator_test_metadata_default(&mut row, &attributes, &metadata);
    let can_link_prompt = event_type == "GENERATION";
    let skip_model_usage_and_cost =
        should_skip_model_usage_and_cost(&attributes, scope_name, span_name, &event_type);
    let status_error = span
        .status
        .as_ref()
        .map(|status| {
            // Read the numeric OTLP enum value exactly as the legacy processor's
            // `span.status?.code === 2` check; other representations leave status_error false.
            matches!(
                status.code.as_deref(),
                Some(Value::Number(value)) if value.as_i64() == Some(2)
            )
        })
        .unwrap_or(false);
    let level = parse_observation_level(attributes.get("langfuse.observation.level"))
        .or_else(|| status_error.then(|| "ERROR".to_owned()))
        .or_else(|| {
            (scope_name == "livekit-agents" && livekit_debug_span_name(span_name))
                .then(|| "DEBUG".to_owned())
        })
        .unwrap_or_else(|| "DEFAULT".to_owned());
    let (skills_available, skills_resource_loaded) = extract_skills(
        &attributes,
        &metadata,
        &event_type,
        &name,
        input.as_ref(),
        output.as_ref(),
        level == "ERROR",
    );
    row.status_message = row.status_message.or_else(|| {
        span.status
            .as_ref()
            .and_then(|status| status.message.as_deref())
            .and_then(value_as_string)
    });

    let environment = extract_environment(
        &attributes,
        resource_attributes,
        config.is_langfuse_internal,
        &mut parse_cache,
    );
    let prompt_name = if can_link_prompt {
        first_non_null_string(
            &attributes,
            &["langfuse.observation.prompt.name", "langfuse.prompt.name"],
        )
        .or_else(|| {
            parse_prompt(&attributes, &mut parse_cache)
                .and_then(|value| value.get("name").and_then(value_as_string))
        })
    } else {
        None
    };
    let prompt_version_lookup = can_link_prompt
        .then(|| extract_prompt_version_lookup(&attributes, &mut parse_cache))
        .flatten();
    let prompt_version = can_link_prompt
        .then(|| extract_prompt_version(&attributes, &mut parse_cache))
        .flatten();
    let provided_usage_details = if skip_model_usage_and_cost {
        Default::default()
    } else {
        extract_usage_details(&attributes, scope_name, &mut parse_cache)
    };
    let provided_cost_details = if skip_model_usage_and_cost {
        Default::default()
    } else {
        extract_cost_details(&attributes, &mut parse_cache)
    };
    let Some((ingestion_api_key, service_name, service_version)) = resolve_gateway_attribution(
        &config.ingestion_api_key,
        &metadata,
        row.service_name.take(),
        row.service_version.take(),
        scope_version,
    ) else {
        // A trusted gateway span without a caller key returns None here; its siblings continue
        // through the batch.
        tracing::warn!(
            project_id = %config.project_id,
            observation_id = %span_id,
            "Skipping AI gateway span without a caller API key"
        );
        return Ok(None);
    };
    // IngestionService defaults falsy parameters to {} and parses JSON text before
    // pricing and evaluation. Keep that normalized value through native storage too.
    let model_parameters = extract_model_parameters(&attributes, scope_name, &mut parse_cache)
        .filter(is_js_truthy)
        .unwrap_or_else(|| Value::Object(JsonObject::new()));
    let model_parameters = match &model_parameters {
        Value::String(text) => {
            super::super::value::parse_js_string(text).unwrap_or(model_parameters)
        }
        _ => model_parameters,
    };
    let event = OwnedEvent {
        row: crate::native_schema::OtelStorageRow {
            project_id: config.project_id.clone(),
            trace_id,
            span_id,
            parent_span_id,
            name,
            event_type,
            environment,
            level,
            start_time: start_time_iso.clone(),
            end_time: end_time_iso,
            completion_start_time: extract_completion_start_time(
                &attributes,
                &start_time_iso,
                &mut parse_cache,
            ),
            prompt_name,
            prompt_version,
            provided_model_name: if skip_model_usage_and_cost {
                None
            } else {
                extract_model_name(&attributes)
            },
            tags: extract_tags(&attributes, &mut parse_cache, decode_metadata_values),
            bookmarked: false,
            public: extract_public(&attributes),
            is_app_root: extract_is_app_root(&attributes),
            tool_definitions: tools.tool_definitions,
            tool_calls: tools.tool_calls,
            tool_call_names: tools.tool_call_names,
            service_name,
            service_version,
            source: config.source.clone(),
            ingestion_api_key,
            ingestion_sdk_name: config.ingestion_sdk_name.clone(),
            ingestion_sdk_version: config.ingestion_sdk_version.clone(),
            ..row
        },
        prompt_version_lookup,
        model_parameters: Some(model_parameters),
        provided_usage_details,
        provided_cost_details,
        input,
        output,
        metadata,
        skills_available,
        skills_resource_loaded,
    };
    Ok(Some(event))
}

/// Resolve the persisted key and service fields for one event.
///
/// A gateway grant authenticates the batch, while each span carries the caller key id in
/// metadata. The resolver returns None for a span without that id, allowing sibling spans in the
/// same OTLP request to continue.
fn resolve_gateway_attribution(
    ingestion_api_key: &str,
    metadata: &JsonObject,
    service_name: Option<String>,
    service_version: Option<String>,
    scope_version: Option<&str>,
) -> Option<(String, Option<String>, Option<String>)> {
    if !ingestion_api_key.starts_with(AI_GATEWAY_INGESTION_API_KEY_PREFIX) {
        if service_name.as_deref() == Some(AI_GATEWAY_SERVICE_NAME) {
            return Some((ingestion_api_key.to_owned(), None, None));
        }
        return Some((ingestion_api_key.to_owned(), service_name, service_version));
    }

    let key_id = metadata
        .get(AI_GATEWAY_KEY_ID_METADATA_KEY)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())?;
    Some((
        key_id.to_owned(),
        Some(AI_GATEWAY_SERVICE_NAME.to_owned()),
        scope_version.map(str::to_owned),
    ))
}

fn object_attributes(value: Option<Value>) -> JsonObject {
    value
        .map(|mut value| {
            value
                .as_object_mut()
                .and_then(|object| object.shift_remove("attributes"))
                .unwrap_or(value)
        })
        .map(attributes_to_map)
        .unwrap_or_default()
}

fn first_non_null_string(attributes: &JsonObject, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        attributes
            .get(*key)
            // Prompt names use `??` in the TypeScript processor: an explicit empty string is a
            // value and suppresses alias fallback.
            .filter(|value| !value.is_null())
            .and_then(value_as_string)
    })
}

fn parse_prompt(attributes: &JsonObject, parse_cache: &mut JsonParseCache) -> Option<Value> {
    match attributes.get("ai.telemetry.metadata.langfusePrompt")? {
        value @ Value::String(_) => parse_cache.parse(Some(value)).cloned(),
        value => Some(value.clone()),
    }
}

fn extract_environment(
    attributes: &JsonObject,
    resource: &JsonObject,
    internal: bool,
    parse_cache: &mut JsonParseCache,
) -> String {
    for key in [
        "langfuse.environment",
        "deployment.environment.name",
        "deployment.environment",
    ] {
        // Select a truthy span value first, then a truthy resource value, matching the
        // TypeScript `if (value)` fallback. Normalize the selected string and use `default` for
        // other selected shapes.
        let value = attributes
            .get(key)
            .filter(|value| is_js_truthy(value))
            .or_else(|| resource.get(key).filter(|value| is_js_truthy(value)));
        if let Some(value) = value {
            return value
                .as_str()
                .map(|value| normalize_environment(value, internal))
                .unwrap_or_else(|| "default".to_owned());
        }
    }

    // An OpenRouter failure payload with a null completion and the reserved raw-request
    // environment uses the internal evaluator environment from the legacy recovery rule.
    if resource.get("service.name").and_then(Value::as_str) == Some("openrouter")
        && attributes.get("openrouter.source").and_then(Value::as_str) == Some("openrouter")
    {
        let completion = attributes
            .get("gen_ai.completion")
            .and_then(|value| parse_json_value(value, parse_cache));
        if completion
            .as_ref()
            .and_then(|value| value.get("completion"))
            .is_some_and(Value::is_null)
            && completion
                .as_ref()
                .and_then(|value| value.path(["rawRequest", "trace", "environment"]))
                .and_then(Value::as_str)
                == Some(INTERNAL_LLM_JUDGE_ENVIRONMENT)
        {
            // The fallback normalizes the reserved environment with internal=false, matching the
            // public processor contract.
            return normalize_environment(INTERNAL_LLM_JUDGE_ENVIRONMENT, false);
        }
    }

    "default".to_owned()
}

fn parse_observation_level(value: Option<&Value>) -> Option<String> {
    let value = value?.as_str()?.trim().to_ascii_uppercase();
    let normalized = match value.as_str() {
        "DEBUG" | "TRACE" | "VERBOSE" => "DEBUG",
        "DEFAULT" | "INFO" | "LOG" | "NOTICE" | "OK" | "SUCCESS" => "DEFAULT",
        "WARNING" | "WARN" => "WARNING",
        "ERROR" | "FATAL" | "CRITICAL" => "ERROR",
        _ => return None,
    };
    Some(normalized.to_owned())
}

fn livekit_debug_span_name(name: &str) -> bool {
    matches!(
        name,
        "user_speaking"
            | "eou_detection"
            | "llm_request_run"
            | "tts_node"
            | "tts_request"
            | "tts_request_run"
            | "tts_stream_adapter"
            | "agent_speaking"
            | "drain_agent_activity"
            | "on_exit"
            | "on_enter"
            | "llm_fallback_adapter"
            | "tts_fallback_adapter"
            | "start_agent_activity"
    )
}

fn normalize_environment(value: &str, internal: bool) -> String {
    let mut value = value.to_owned();
    if !internal {
        value = value.to_ascii_lowercase();
        while let Some(rest) = value.strip_prefix("langfuse") {
            value = rest
                .strip_prefix('-')
                .or_else(|| rest.strip_prefix('_'))
                .unwrap_or(rest)
                .to_owned();
        }
    }
    let value = value.chars().take(40).collect::<String>();
    if value.is_empty()
        || !value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_'
        })
    {
        "default".to_owned()
    } else {
        value
    }
}

fn parse_json_value(value: &Value, parse_cache: &mut JsonParseCache) -> Option<Value> {
    match value {
        Value::String(_) => parse_cache.parse(Some(value)).cloned(),
        value => Some(value.clone()),
    }
}
