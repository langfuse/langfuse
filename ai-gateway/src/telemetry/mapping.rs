//! Pure mapping from finalized execution facts to a Langfuse generation span.
use chrono::{DateTime, SecondsFormat};
use serde_json::{Map, Value, json};

use super::context::GenerationContext;
use crate::capture::{InferenceFacts, RelayOutcome};

pub(super) fn span(facts: InferenceFacts, context: &GenerationContext) -> Value {
    let full = facts.metadata.get("ingestion_mode").and_then(Value::as_str) == Some("full");
    let (level, message) = observation_status(&facts);
    let mut metadata: Map<String, Value> = context
        .metadata
        .iter()
        .filter(|(key, _)| !reserved_metadata(key))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    // Trusted key attribution and gateway facts take precedence over caller metadata.
    metadata.extend(generation_metadata(&facts));
    let inference = facts.inference;
    let mut attributes = vec![attribute("langfuse.observation.type", "generation")];
    attributes.extend(context.attributes.iter().map(|(key, value)| {
        attribute(
            key,
            value
                .as_str()
                .map_or_else(|| value.to_string(), str::to_owned),
        )
    }));
    if let Some(model) = inference.model.or(inference.requested_model) {
        attributes.push(attribute("langfuse.observation.model.name", model));
    }
    if !inference.model_parameters.is_empty() {
        attributes.push(attribute(
            "langfuse.observation.model.parameters",
            Value::Object(inference.model_parameters).to_string(),
        ));
    }
    if let Some(usage) = inference.usage_details
        && let Some(projected) = usage_projection(facts.api_format, &usage)
    {
        attributes.push(attribute(
            "langfuse.observation.usage_details",
            projected.to_string(),
        ));
    }
    if full {
        if let Some(input) = inference.input {
            attributes.push(attribute("langfuse.observation.input", input.to_string()));
        }
        if let Some(output) = inference.output {
            attributes.push(attribute("langfuse.observation.output", output.to_string()));
        }
    }
    if let Some(completion_start) = facts
        .completion_start_ms
        .and_then(|elapsed| facts.start_time_unix_ms.checked_add(elapsed))
        .and_then(|timestamp| i64::try_from(timestamp).ok())
        .and_then(DateTime::from_timestamp_millis)
    {
        attributes.push(attribute(
            "langfuse.observation.completion_start_time",
            completion_start.to_rfc3339_opts(SecondsFormat::Millis, true),
        ));
    }
    attributes.push(attribute("langfuse.observation.level", level));
    if let Some(message) = message {
        attributes.push(attribute("langfuse.observation.status_message", message));
    }
    attributes.push(attribute(
        "langfuse.observation.metadata",
        Value::Object(metadata).to_string(),
    ));
    let mut span = json!({
        "traceId": context.trace_id,
        "spanId": context.observation_id,
        // Generation capture is independent of the caller's sampling decision.
        "flags": 1,
        "name": facts.api_format,
        "kind": 3,
        "startTimeUnixNano": facts.start_time_unix_ms.saturating_mul(1_000_000).to_string(),
        "endTimeUnixNano": facts.start_time_unix_ms.saturating_add(facts.duration_ms).saturating_mul(1_000_000).to_string(),
        "attributes": attributes,
        "status": { "code": if level == "ERROR" { 2 } else { 0 } },
    });
    if let Some(parent) = &context.parent_span_id {
        span["parentSpanId"] = json!(parent);
    }
    if !context.trace_state.is_empty() {
        span["traceState"] = json!(context.trace_state);
    }
    span
}

fn reserved_metadata(key: &str) -> bool {
    [
        "langfuse.gateway",
        "scope",
        "resourceAttributes",
        "attributes",
    ]
    .iter()
    .any(|reserved| key == *reserved || key.starts_with(&format!("{reserved}.")))
}

fn generation_metadata(facts: &InferenceFacts) -> Map<String, Value> {
    let mut metadata = Map::new();
    if let Some(attribution) = facts
        .metadata
        .get("key_metadata")
        .and_then(Value::as_object)
    {
        for (key, value) in attribution {
            // Attribution remains searchable, but cannot impersonate gateway, agent or OTEL fields.
            if !reserved_metadata(key) && !agent_metadata(key) {
                metadata.insert(key.clone(), value.clone());
            }
            metadata.insert(
                format!("langfuse.gateway.api_key.metadata.{key}"),
                value.clone(),
            );
        }
    }
    for (source, target) in [
        ("project_id", "project.id"),
        ("organization_id", "organization.id"),
        ("ingestion_mode", "ingestion.mode"),
        ("key_id", "api_key.id"),
        ("provider_connection_id", "connection.id"),
    ] {
        if let Some(value) = facts.metadata.get(source) {
            metadata.insert(format!("langfuse.gateway.{target}"), value.clone());
        }
    }
    metadata.insert(
        "langfuse.gateway.request.api_format".into(),
        json!(facts.api_format),
    );
    // Before upstream headers, transport failures become gateway HTTP errors.
    // Once headers arrive, later stream failures cannot change the HTTP status.
    let response_status = facts.http_status.or(match facts.outcome {
        RelayOutcome::Timeout => Some(504),
        RelayOutcome::TransportError => Some(502),
        RelayOutcome::Eof | RelayOutcome::Cancelled => None,
    });
    metadata.insert(
        "langfuse.gateway.response.status_code".into(),
        json!(response_status),
    );
    for (key, value) in [
        ("response.id", &facts.inference.provider_response_id),
        ("upstream.request.id", &facts.inference.provider_request_id),
    ] {
        if let Some(value) = value {
            metadata.insert(format!("langfuse.gateway.{key}"), json!(value));
        }
    }
    for (key, value) in &facts.inference.request_metadata {
        metadata.insert(format!("langfuse.gateway.request.{key}"), value.clone());
    }
    metadata
}

fn agent_metadata(key: &str) -> bool {
    key == "agent" || key.starts_with("agent.")
}

fn observation_status(facts: &InferenceFacts) -> (&'static str, Option<String>) {
    let failure = if let Some(status) = facts.http_status.filter(|status| *status >= 400) {
        Some(format!("Provider HTTP error ({status})"))
    } else if facts.inference.provider_status.as_deref() == Some("failed") {
        Some("Provider response failed".into())
    } else {
        match facts.outcome {
            RelayOutcome::Timeout => Some("Provider response timed out".into()),
            RelayOutcome::TransportError => Some("Provider transport error".into()),
            RelayOutcome::Eof | RelayOutcome::Cancelled => None,
        }
    };
    if let Some(mut message) = failure {
        if let Some(status) = facts.http_status.filter(|status| *status < 400) {
            message = format!("{message} (HTTP {status})");
        }
        if let Some(error) = &facts.inference.error_message {
            message.push_str(": ");
            message.push_str(error);
        }
        ("ERROR", Some(message))
    } else if facts.outcome == RelayOutcome::Cancelled
        && facts.inference.provider_status.as_deref() != Some("completed")
    {
        ("WARNING", Some("Client cancelled the response".into()))
    } else if facts.inference.provider_status.as_deref() == Some("incomplete") {
        ("WARNING", Some("Provider response incomplete".into()))
    } else {
        ("DEFAULT", None)
    }
}

fn attribute(key: &str, value: impl Into<String>) -> Value {
    json!({"key": key, "value": {"stringValue": value.into()}})
}

/// Project native usage into the shape Langfuse ingestion prices for that API.
/// Each format keeps its own counters; nothing is renamed across providers.
fn usage_projection(api_format: &str, usage: &Value) -> Option<Value> {
    match api_format {
        "openai.responses" => openai_usage(usage),
        "anthropic.messages" => anthropic_usage(usage),
        _ => None,
    }
}

/// Ingestion prices flat integer counters and derives the total by summing them,
/// which matches Anthropic's semantics: `input_tokens` excludes cached tokens.
/// Cache writes are split by TTL when the breakdown is present so the 1-hour
/// price applies; the aggregate `cache_creation_input_tokens` is emitted only
/// without the breakdown, never alongside it. Nested objects and strings such as
/// `server_tool_use`, `output_tokens_details` and `service_tier` are dropped
/// because ingestion cannot price them.
fn anthropic_usage(usage: &Value) -> Option<Value> {
    let usage = usage.as_object()?;
    let counter = |source: &Map<String, Value>, key: &str| {
        source.get(key).and_then(Value::as_u64).map(Value::from)
    };
    let mut projected = Map::new();
    for key in ["input_tokens", "output_tokens"] {
        projected.insert(key.into(), counter(usage, key)?);
    }
    if let Some(value) = counter(usage, "cache_read_input_tokens") {
        projected.insert("cache_read_input_tokens".into(), value);
    }
    let breakdown = usage.get("cache_creation").and_then(Value::as_object);
    let mut split = false;
    for (source, target) in [
        ("ephemeral_5m_input_tokens", "input_cache_creation_5m"),
        ("ephemeral_1h_input_tokens", "input_cache_creation_1h"),
    ] {
        if let Some(value) = breakdown.and_then(|details| counter(details, source)) {
            projected.insert(target.into(), value);
            split = true;
        }
    }
    if !split && let Some(value) = counter(usage, "cache_creation_input_tokens") {
        projected.insert("cache_creation_input_tokens".into(), value);
    }
    Some(Value::Object(projected))
}

/// The receiver's native `OpenAI` usage schema is strict at the top level, but
/// accepts new numeric detail counters.
fn openai_usage(usage: &Value) -> Option<Value> {
    let usage = usage.as_object()?;
    let mut projected = Map::new();
    for key in ["input_tokens", "output_tokens", "total_tokens"] {
        let value = usage.get(key).filter(|value| value.as_u64().is_some())?;
        projected.insert(key.into(), value.clone());
    }
    for key in ["input_tokens_details", "output_tokens_details"] {
        match usage.get(key) {
            Some(Value::Null) => {
                projected.insert(key.into(), Value::Null);
            }
            Some(Value::Object(details)) => {
                projected.insert(
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
    Some(Value::Object(projected))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> GenerationContext {
        GenerationContext {
            trace_id: "0123456789abcdef0123456789abcdef".into(),
            observation_id: "0123456789abcdef".into(),
            ..GenerationContext::from_headers(&axum::http::HeaderMap::new())
        }
    }

    fn facts() -> InferenceFacts {
        let mut facts = InferenceFacts {
            api_format: "openai.responses",
            start_time_unix_ms: 1_735_689_600_000,
            duration_ms: 900,
            first_byte_ms: Some(50),
            completion_start_ms: Some(125),
            http_status: Some(200),
            metadata: json!({"ingestion_mode": "full", "project_id": "project", "key_id": "key", "key_metadata": {"team": "search"}}),
            outcome: RelayOutcome::Eof,
            inference: crate::capture::ProviderFacts::default(),
        };
        facts.inference.model = Some("actual-model".into());
        facts.inference.requested_model = Some("requested-model".into());
        facts
            .inference
            .model_parameters
            .insert("service_tier".into(), json!("priority"));
        facts.inference.input = Some(json!({"input": "hello", "tools": [{"type": "function"}]}));
        facts.inference.output = Some(json!([{ "type": "message", "content": "world" }]));
        facts.inference.capture_complete = true;
        facts.inference.output_complete = true;
        facts.inference.input_complete = true;
        facts
    }

    fn attributes(span: &Value) -> Map<String, Value> {
        span["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|attribute| {
                (
                    attribute["key"].as_str().unwrap().into(),
                    attribute["value"]["stringValue"].clone(),
                )
            })
            .collect()
    }

    fn metadata(attributes: &Map<String, Value>) -> Value {
        serde_json::from_str(
            attributes["langfuse.observation.metadata"]
                .as_str()
                .unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn response_status_distinguishes_failures_before_and_after_headers() {
        for (http_status, outcome, expected) in [
            (None, RelayOutcome::Timeout, json!(504)),
            (None, RelayOutcome::TransportError, json!(502)),
            (Some(200), RelayOutcome::Timeout, json!(200)),
            (Some(200), RelayOutcome::TransportError, json!(200)),
            (Some(429), RelayOutcome::Eof, json!(429)),
            (None, RelayOutcome::Cancelled, Value::Null),
        ] {
            let mut facts = facts();
            facts.http_status = http_status;
            facts.outcome = outcome;
            let metadata = metadata(&attributes(&span(facts, &context())));
            assert_eq!(
                metadata["langfuse.gateway.response.status_code"], expected,
                "{outcome:?}"
            );
        }
    }

    #[test]
    fn caller_attributes_and_metadata_cannot_replace_trusted_gateway_fields() {
        let mut context = context();
        context.attributes = serde_json::from_value(json!({
            "user.id": "user", "session.id": "session",
            "langfuse.trace.name": "caller workflow", "langfuse.trace.tags": ["tag,one", "tag-two"]
        }))
        .unwrap();
        context.metadata = serde_json::from_value(json!({
            "custom": "value", "team": "untrusted", "langfuse.gateway.response.status_code": "fake",
            "langfuse.gateway.project.id": "wrong-project",
            "langfuse.gateway.api_key.id": "wrong-key",
            "langfuse.gateway.api_key.metadata.team": "wrong-team",
            "langfuse.gateway.request.fake": "fake",
            "scope": "fake", "resourceAttributes.secret": "fake", "attributes": "fake"
        }))
        .unwrap();
        let attrs = attributes(&span(facts(), &context));
        assert_eq!(attrs["user.id"], "user");
        assert_eq!(attrs["session.id"], "session");
        assert_eq!(attrs["langfuse.trace.name"], "caller workflow");
        assert_eq!(
            serde_json::from_str::<Value>(attrs["langfuse.trace.tags"].as_str().unwrap()).unwrap(),
            json!(["tag,one", "tag-two"])
        );
        let metadata = metadata(&attrs);
        assert_eq!(metadata["custom"], "value");
        assert_eq!(metadata["team"], "search");
        assert_eq!(metadata["langfuse.gateway.response.status_code"], 200);
        assert_eq!(metadata["langfuse.gateway.project.id"], "project");
        assert_eq!(metadata["langfuse.gateway.api_key.id"], "key");
        assert_eq!(metadata["langfuse.gateway.api_key.metadata.team"], "search");
        for key in [
            "scope",
            "resourceAttributes.secret",
            "attributes",
            "langfuse.gateway.request.fake",
        ] {
            assert!(metadata.get(key).is_none(), "caller forged {key}");
        }
        assert!(!attrs.contains_key("langfuse.trace.metadata"));
    }

    #[test]
    fn full_generation_preserves_native_content_attribution_and_completion_time() {
        let span = span(facts(), &context());
        assert_eq!(span["traceId"], "0123456789abcdef0123456789abcdef");
        assert_eq!(span["spanId"], "0123456789abcdef");
        assert!(span.get("parentSpanId").is_none());
        assert_eq!(span["startTimeUnixNano"], "1735689600000000000");
        assert_eq!(span["endTimeUnixNano"], "1735689600900000000");
        let attrs = attributes(&span);
        assert_eq!(attrs["langfuse.observation.type"], "generation");
        assert_eq!(attrs["langfuse.observation.model.name"], "actual-model");
        assert_eq!(
            attrs["langfuse.observation.completion_start_time"],
            "2025-01-01T00:00:00.125Z"
        );
        assert_eq!(
            serde_json::from_str::<Value>(attrs["langfuse.observation.input"].as_str().unwrap())
                .unwrap()["tools"][0]["type"],
            "function"
        );
        assert!(attrs.contains_key("langfuse.observation.output"));
        let metadata = metadata(&attrs);
        assert_eq!(
            metadata,
            json!({
                "langfuse.gateway.response.status_code": 200,
                "team": "search",
                "langfuse.gateway.api_key.metadata.team": "search",
                "langfuse.gateway.api_key.id": "key",
                "langfuse.gateway.project.id": "project",
                "langfuse.gateway.ingestion.mode": "full",
                "langfuse.gateway.request.api_format": "openai.responses",
            })
        );
    }

    #[test]
    fn attribution_is_searchable_without_overwriting_gateway_or_otel_metadata() {
        let mut facts = facts();
        facts.metadata["organization_id"] = json!("org");
        facts.metadata["provider_connection_id"] = json!("connection");
        facts.metadata["key_metadata"] = json!({
            "team": "search", "enabled": true, "cost_center": 42,
            "langfuse.gateway.response.status_code": 500,
            "langfuse.gateway.api_key.id": "spoofed-key",
            "langfuse.gateway.upstream.request.id": "spoofed-request",
            "langfuse.gateway.future_field": "spoofed-future",
            "langfuse.gateway.api_key.metadata.team": "spoofed-team",
            "agent.name": "spoofed-agent",
            "scope": "spoofed-scope", "scope.name": "spoofed-scope-name",
            "resourceAttributes": "spoofed-resource",
            "attributes": "spoofed-attributes"
        });
        facts.inference.provider_response_id = Some("response".into());
        let mut context = context();
        context
            .metadata
            .insert("agent.name".into(), json!("opencode"));
        let attrs = attributes(&span(facts, &context));
        let metadata = metadata(&attrs);
        assert_eq!(metadata["team"], "search");
        assert_eq!(metadata["enabled"], true);
        assert_eq!(metadata["cost_center"], 42);
        assert_eq!(metadata["langfuse.gateway.api_key.metadata.team"], "search");
        assert_eq!(
            metadata["langfuse.gateway.api_key.metadata.langfuse.gateway.response.status_code"],
            500
        );
        assert_eq!(metadata["langfuse.gateway.response.status_code"], 200);
        assert_eq!(metadata["langfuse.gateway.api_key.id"], "key");
        assert_eq!(metadata["langfuse.gateway.connection.id"], "connection");
        assert_eq!(metadata["langfuse.gateway.response.id"], "response");
        assert_eq!(metadata["langfuse.gateway.organization.id"], "org");
        assert_eq!(metadata["agent.name"], "opencode");
        assert_eq!(
            metadata["langfuse.gateway.api_key.metadata.agent.name"],
            "spoofed-agent"
        );
        for key in [
            "scope",
            "scope.name",
            "resourceAttributes",
            "attributes",
            "langfuse.gateway.future_field",
        ] {
            assert!(metadata.get(key).is_none(), "{key}");
        }
        assert_ne!(
            metadata["langfuse.gateway.upstream.request.id"],
            "spoofed-request"
        );
        assert_eq!(
            metadata["langfuse.gateway.api_key.metadata.langfuse.gateway.api_key.metadata.team"],
            "spoofed-team"
        );
    }

    #[test]
    fn usage_mode_omits_content_and_missing_usage_and_uses_requested_model() {
        let mut facts = facts();
        facts.metadata["ingestion_mode"] = json!("usage");
        facts.inference.model = None;
        facts.completion_start_ms = None;
        let attrs = attributes(&span(facts, &context()));
        for key in ["input", "output", "usage_details", "completion_start_time"] {
            assert!(!attrs.contains_key(&format!("langfuse.observation.{key}")));
        }
        assert_eq!(attrs["langfuse.observation.model.name"], "requested-model");
        assert!(metadata(&attrs).get("native_usage").is_none());
    }

    #[test]
    fn usage_projection_preserves_new_numeric_details_without_unknown_top_level_fields() {
        let mut facts = facts();
        let usage = json!({
            "input_tokens": 20, "output_tokens": 10, "total_tokens": 30,
            "input_tokens_details": {"cached_tokens": 4, "future_counter": 3, "optional": null, "future_object": {}},
            "output_tokens_details": null,
            "future_usage": {"cost": 123},
        });
        facts.inference.usage_details = Some(usage.clone());
        let attrs = attributes(&span(facts, &context()));
        assert!(metadata(&attrs).get("native_usage").is_none());
        let projected: Value = serde_json::from_str(
            attrs["langfuse.observation.usage_details"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            projected,
            json!({
                "input_tokens": 20, "output_tokens": 10, "total_tokens": 30,
                "input_tokens_details": {"cached_tokens": 4, "future_counter": 3, "optional": null},
                "output_tokens_details": null,
            })
        );
    }

    #[test]
    fn unsupported_usage_omits_usage_without_invented_totals() {
        let mut facts = facts();
        facts.inference.usage_details = Some(json!({"input_tokens": 9}));
        let attrs = attributes(&span(facts, &context()));
        assert!(!attrs.contains_key("langfuse.observation.usage_details"));
        assert!(metadata(&attrs).get("native_usage").is_none());
    }

    fn projected_usage(api_format: &'static str, usage: Value) -> Option<Value> {
        let mut facts = facts();
        facts.api_format = api_format;
        facts.inference.usage_details = Some(usage);
        let attrs = attributes(&span(facts, &context()));
        attrs
            .get("langfuse.observation.usage_details")
            .map(|value| serde_json::from_str(value.as_str().unwrap()).unwrap())
    }

    #[test]
    fn anthropic_usage_is_flat_splits_cache_writes_by_ttl_and_drops_unpriceable_fields() {
        // Claude Code's typical cached turn: uncached input, both cache buckets, thinking.
        assert_eq!(
            projected_usage(
                "anthropic.messages",
                json!({
                    "input_tokens": 7, "output_tokens": 445,
                    "cache_creation_input_tokens": 2089, "cache_read_input_tokens": 16399,
                    "cache_creation": {"ephemeral_5m_input_tokens": 2000, "ephemeral_1h_input_tokens": 89},
                    "output_tokens_details": {"thinking_tokens": 300},
                    "server_tool_use": {"web_search_requests": 1},
                    "service_tier": "standard", "inference_geo": null
                })
            ),
            Some(json!({
                "input_tokens": 7, "output_tokens": 445, "cache_read_input_tokens": 16399,
                "input_cache_creation_5m": 2000, "input_cache_creation_1h": 89
            }))
        );
        // Without the TTL breakdown the aggregate write counter prices at the 5-minute rate.
        assert_eq!(
            projected_usage(
                "anthropic.messages",
                json!({"input_tokens": 7, "output_tokens": 1, "cache_creation_input_tokens": 50, "cache_read_input_tokens": null, "cache_creation": null})
            ),
            Some(json!({"input_tokens": 7, "output_tokens": 1, "cache_creation_input_tokens": 50}))
        );
        // Truncated streams may lack output counts; nothing is invented.
        assert_eq!(
            projected_usage("anthropic.messages", json!({"input_tokens": 7})),
            None
        );
        // The Anthropic shape never projects through the OpenAI rules and vice versa.
        assert_eq!(
            projected_usage(
                "openai.responses",
                json!({"input_tokens": 7, "output_tokens": 1, "cache_read_input_tokens": 5})
            ),
            None
        );
    }

    #[test]
    fn provider_request_metadata_is_namespaced_and_keeps_native_types() {
        let mut facts = facts();
        facts.inference.request_metadata = serde_json::from_value(json!({
            "metadata": {"customer": "customer-1"},
            "prompt_cache_key": "cache-key",
            "safety_identifier": "safety-id",
            "user": "legacy-user"
        }))
        .unwrap();
        let attrs = attributes(&span(facts, &context()));
        let metadata = metadata(&attrs);
        assert_eq!(
            metadata["langfuse.gateway.request.metadata"],
            json!({"customer": "customer-1"})
        );
        assert_eq!(
            metadata["langfuse.gateway.request.prompt_cache_key"],
            "cache-key"
        );
        assert_eq!(
            metadata["langfuse.gateway.request.safety_identifier"],
            "safety-id"
        );
        assert_eq!(metadata["langfuse.gateway.request.user"], "legacy-user");
        for key in ["metadata", "prompt_cache_key", "safety_identifier", "user"] {
            assert!(metadata.get(key).is_none());
        }
    }

    #[test]
    fn provider_errors_include_http_status_and_available_details() {
        for (status, provider_status, error, expected) in [
            (429, None, None, "Provider HTTP error (429)"),
            (
                429,
                None,
                Some("rate_limit_exceeded: Too many requests"),
                "Provider HTTP error (429): rate_limit_exceeded: Too many requests",
            ),
            (
                200,
                Some("failed"),
                Some("server_error: Please retry"),
                "Provider response failed (HTTP 200): server_error: Please retry",
            ),
        ] {
            let mut facts = facts();
            facts.http_status = Some(status);
            facts.inference.provider_status = provider_status.map(str::to_owned);
            facts.inference.error_message = error.map(str::to_owned);
            let attrs = attributes(&span(facts, &context()));
            assert_eq!(attrs["langfuse.observation.status_message"], expected);
            assert_eq!(attrs["langfuse.observation.level"], "ERROR");
        }
    }

    #[test]
    fn provider_and_transport_failures_are_errors_while_cancellation_stays_distinct() {
        for (http_status, provider_status, outcome, level, code) in [
            (Some(429), None, RelayOutcome::Eof, "ERROR", 2),
            (Some(200), Some("failed"), RelayOutcome::Eof, "ERROR", 2),
            (None, None, RelayOutcome::TransportError, "ERROR", 2),
            (Some(200), None, RelayOutcome::Timeout, "ERROR", 2),
            (Some(200), None, RelayOutcome::Cancelled, "WARNING", 0),
            (
                Some(200),
                Some("completed"),
                RelayOutcome::Cancelled,
                "DEFAULT",
                0,
            ),
            (
                Some(200),
                Some("failed"),
                RelayOutcome::Cancelled,
                "ERROR",
                2,
            ),
            (
                Some(200),
                Some("incomplete"),
                RelayOutcome::Cancelled,
                "WARNING",
                0,
            ),
            (
                Some(200),
                Some("completed"),
                RelayOutcome::Timeout,
                "ERROR",
                2,
            ),
            (
                Some(200),
                Some("completed"),
                RelayOutcome::TransportError,
                "ERROR",
                2,
            ),
            (
                Some(200),
                Some("incomplete"),
                RelayOutcome::Eof,
                "WARNING",
                0,
            ),
        ] {
            let mut facts = facts();
            facts.http_status = http_status;
            facts.inference.provider_status = provider_status.map(str::to_owned);
            facts.outcome = outcome;
            let span = span(facts, &context());
            let attrs = attributes(&span);
            assert_eq!(attrs["langfuse.observation.level"], level);
            assert_eq!(span["status"]["code"], code);
            assert_eq!(
                attrs.contains_key("langfuse.observation.status_message"),
                level != "DEFAULT"
            );
            assert!(metadata(&attrs).get("relay_outcome").is_none());
        }
    }
}
