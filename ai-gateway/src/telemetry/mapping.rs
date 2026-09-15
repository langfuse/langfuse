//! Pure mapping from finalized execution facts to a Langfuse generation span.
use chrono::{DateTime, SecondsFormat};
use serde_json::{Map, Value, json};

use crate::capture::{InferenceFacts, RelayOutcome};

pub(super) fn span(facts: InferenceFacts, trace_id: &str, observation_id: &str) -> Value {
    let full = facts.metadata.get("ingestion_mode").and_then(Value::as_str) == Some("full");
    let (level, message) = observation_status(&facts);
    let inference = facts.inference;
    let mut metadata = facts.metadata.as_object().cloned().unwrap_or_default();
    metadata.extend([
        ("api_format".into(), json!(facts.api_format)),
        ("relay_outcome".into(), json!(facts.outcome)),
        ("http_status".into(), json!(facts.http_status)),
        ("first_byte_ms".into(), json!(facts.first_byte_ms)),
        ("requested_model".into(), json!(inference.requested_model)),
        (
            "provider_response_id".into(),
            json!(inference.provider_response_id),
        ),
        (
            "provider_request_id".into(),
            json!(inference.provider_request_id),
        ),
        ("provider_status".into(), json!(inference.provider_status)),
        ("input_complete".into(), json!(inference.input_complete)),
        ("output_complete".into(), json!(inference.output_complete)),
        ("capture_complete".into(), json!(inference.capture_complete)),
    ]);
    let mut attributes = vec![attribute("langfuse.observation.type", "generation")];
    if let Some(model) = inference.model.or(inference.requested_model) {
        attributes.push(attribute("langfuse.observation.model.name", model));
    }
    if !inference.model_parameters.is_empty() {
        attributes.push(attribute(
            "langfuse.observation.model.parameters",
            Value::Object(inference.model_parameters).to_string(),
        ));
    }
    if let Some(usage) = inference.usage_details {
        if let Some(projected) = openai_usage(&usage) {
            attributes.push(attribute(
                "langfuse.observation.usage_details",
                projected.to_string(),
            ));
        }
        metadata.insert("native_usage".into(), usage);
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
        .first_byte_ms
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
    json!({
        "traceId": trace_id,
        "spanId": observation_id,
        "name": facts.api_format,
        "kind": 3,
        "startTimeUnixNano": facts.start_time_unix_ms.saturating_mul(1_000_000).to_string(),
        "endTimeUnixNano": facts.start_time_unix_ms.saturating_add(facts.duration_ms).saturating_mul(1_000_000).to_string(),
        "attributes": attributes,
        "status": { "code": if level == "ERROR" { 2 } else { 0 } },
    })
}

fn observation_status(facts: &InferenceFacts) -> (&'static str, Option<&'static str>) {
    let failure = if facts.http_status.is_some_and(|status| status >= 400) {
        Some("Provider HTTP error")
    } else if facts.inference.provider_status.as_deref() == Some("failed") {
        Some("Provider response failed")
    } else {
        match facts.outcome {
            RelayOutcome::Timeout => Some("Provider response timed out"),
            RelayOutcome::TransportError => Some("Provider transport error"),
            RelayOutcome::Eof | RelayOutcome::Cancelled => None,
        }
    };
    if let Some(message) = failure {
        ("ERROR", Some(message))
    } else if facts.outcome == RelayOutcome::Cancelled {
        ("WARNING", Some("Client cancelled the response"))
    } else if facts.inference.provider_status.as_deref() == Some("incomplete") {
        ("WARNING", Some("Provider response incomplete"))
    } else {
        ("DEFAULT", None)
    }
}

fn attribute(key: &str, value: impl Into<String>) -> Value {
    json!({"key": key, "value": {"stringValue": value.into()}})
}

/// The receiver's native `OpenAI` usage schema is strict at the top level, but
/// accepts new numeric detail counters. Keep the original payload in metadata.
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

    fn facts() -> InferenceFacts {
        let mut facts = InferenceFacts {
            api_format: "openai.responses",
            start_time_unix_ms: 1_735_689_600_000,
            duration_ms: 900,
            first_byte_ms: Some(125),
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
    fn full_generation_preserves_native_content_attribution_and_first_byte_time() {
        let span = span(
            facts(),
            "0123456789abcdef0123456789abcdef",
            "0123456789abcdef",
        );
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
        assert_eq!(metadata["project_id"], "project");
        assert_eq!(metadata["key_metadata"]["team"], "search");
        assert_eq!(metadata["requested_model"], "requested-model");
        assert_eq!(metadata["capture_complete"], true);
    }

    #[test]
    fn usage_mode_omits_content_and_missing_usage_and_uses_requested_model() {
        let mut facts = facts();
        facts.metadata["ingestion_mode"] = json!("usage");
        facts.inference.model = None;
        facts.first_byte_ms = None;
        let attrs = attributes(&span(facts, "trace", "span"));
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
        let attrs = attributes(&span(facts, "trace", "span"));
        assert_eq!(metadata(&attrs)["native_usage"], usage);
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
    fn unsupported_usage_remains_metadata_without_invented_totals() {
        let mut facts = facts();
        facts.inference.usage_details = Some(json!({"input_tokens": 9}));
        let attrs = attributes(&span(facts, "trace", "span"));
        assert!(!attrs.contains_key("langfuse.observation.usage_details"));
        assert_eq!(metadata(&attrs)["native_usage"], json!({"input_tokens": 9}));
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
            let span = span(facts, "trace", "span");
            let attrs = attributes(&span);
            assert_eq!(attrs["langfuse.observation.level"], level);
            assert_eq!(span["status"]["code"], code);
            assert_eq!(metadata(&attrs)["relay_outcome"], json!(outcome));
        }
    }
}
