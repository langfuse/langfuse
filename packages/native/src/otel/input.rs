//! `otlp_object!` defines the OTLP structs and JSON fields used by event construction.
//!
//! Its implementation is in `decode`. Attributes and other fields with varying
//! JSON structure use `JsonField`, which decodes each field independently.
//! Decoding copies retained fields into owned Rust values and skips unknown fields.
//! Envelope names follow OTLP JSON's camelCase spelling.
//! `events::process_to_events` selects the ordinary Serde decoder or
//! `CompatibleContainerDeserializer` for retries.

mod decode;

use super::value::Value;
pub use decode::{Array, CompatibleContainerDeserializer, JsonField};
use decode::{ATTRIBUTES, SCOPE};

decode::otlp_object!(ResourceSpan {
    resource: Resource => "resource",
    scope_spans: Array<ScopeSpan> => "scopeSpans",
});

decode::otlp_object!(Resource {
    attributes: JsonField<ATTRIBUTES> => "attributes",
});

decode::otlp_object!(ScopeSpan {
    scope: JsonField<SCOPE> => "scope",
    spans: Array<Span> => "spans",
});

decode::otlp_object!(Span {
    trace_id: JsonField => "traceId",
    span_id: JsonField => "spanId",
    parent_span_id: JsonField => "parentSpanId",
    start_time: JsonField => "startTimeUnixNano",
    end_time: JsonField => "endTimeUnixNano",
    name: JsonField => "name",
    attributes: JsonField<ATTRIBUTES> => "attributes",
    events: Array<SpanEvent> => "events",
    status: Status => "status",
});

decode::otlp_object!(SpanEvent {
    name: JsonField => "name",
    attributes: JsonField<ATTRIBUTES> => "attributes",
});

impl SpanEvent {
    pub fn name(&self) -> Option<&str> {
        self.name.as_deref().and_then(Value::as_str)
    }
}
decode::otlp_object!(Status {
    code: JsonField => "code",
    message: JsonField => "message",
});

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[test]
    fn container_decoding_keeps_last_fields_and_skips_wrong_shapes() {
        for ignored in ["null", r#""\ud800""#, "1e309"] {
            let input = format!(
                r#"{{"scopeSpans":[{ignored},{{"spans":[false,{{"name":"old","name":"current","attributes":{{"\ud800":1,"\t":2}},"status":{ignored}}}]}}]}}"#
            );
            let compatible = ResourceSpan::deserialize(
                CompatibleContainerDeserializer::from_bytes(input.as_bytes()).unwrap(),
            )
            .unwrap();
            let fast = serde_json::from_str::<ResourceSpan>(&input);
            if ignored == "null" {
                assert!(fast.is_ok(), "attribute keys must not force a batch retry");
            }
            let fast = fast.ok();
            for resource in Some(compatible).into_iter().chain(fast) {
                let scopes = resource.scope_spans.unwrap().0;
                assert_eq!(scopes.len(), 1);
                let spans = scopes.into_iter().next().unwrap().spans.unwrap().0;
                assert_eq!(spans.len(), 1);
                let span = spans.into_iter().next().unwrap();
                assert_eq!(
                    span.name.as_deref().and_then(Value::as_str),
                    Some("current")
                );
                assert!(span.status.unwrap().code.is_none());
            }
        }
        let input = r#"{"scopeSpans":{"\ud800":1}}"#;
        let resource = ResourceSpan::deserialize(
            CompatibleContainerDeserializer::from_bytes(input.as_bytes()).unwrap(),
        )
        .unwrap();
        assert!(resource.scope_spans.unwrap().0.is_empty());
    }

    #[test]
    fn deep_attributes_preserve_text_and_siblings_at_each_envelope_boundary() {
        let nested = "[".repeat(128) + "0" + &"]".repeat(128);
        let entries = format!(
            r#"[{{"key":"deep","value":{nested}}},{{"key":"kept","value":{{"stringValue":"yes"}}}}]"#
        );
        let malformed_values = format!(r#"[{{"key":"deep","value":{nested}}},false]"#);
        for (attributes, expected_key, expected_text) in [
            (entries.clone(), "deep", nested.as_str()),
            (
                format!(r#"{{"deep":{nested},"kept":"yes"}}"#),
                "deep",
                nested.as_str(),
            ),
            (
                format!(r#"{{"values":{entries}}}"#),
                "deep",
                nested.as_str(),
            ),
            (
                format!(r#"{{"kept":"yes","values":{malformed_values}}}"#),
                "values",
                malformed_values.as_str(),
            ),
        ] {
            let input = format!(
                r#"{{"resource":{{"attributes":{attributes}}},"scopeSpans":[{{
                    "scope":{{"name":"sdk","version":"1","schemaUrl":"schema","attributes":{attributes}}},
                    "spans":[{{"traceId":"trace","spanId":"span","attributes":{attributes},
                        "events":[{{"name":"event","attributes":{attributes}}}]}}]
                }}]}}"#
            );
            let resource = ResourceSpan::deserialize(
                CompatibleContainerDeserializer::from_bytes(input.as_bytes()).unwrap(),
            )
            .unwrap();
            let scopes = resource.scope_spans.unwrap().0;
            let scope = &scopes[0];
            let scope_fields = scope.scope.as_ref().unwrap();
            assert_eq!(
                scope_fields.get("name").and_then(Value::as_str),
                Some("sdk")
            );
            assert_eq!(
                scope_fields.get("version").and_then(Value::as_str),
                Some("1")
            );
            assert_eq!(
                scope_fields.get("schemaUrl").and_then(Value::as_str),
                Some("schema")
            );
            let spans = &scope.spans.as_ref().unwrap().0;
            let events = &spans[0].events.as_ref().unwrap().0;
            for attributes in [
                &**resource
                    .resource
                    .as_ref()
                    .unwrap()
                    .attributes
                    .as_ref()
                    .unwrap(),
                scope_fields.get("attributes").unwrap(),
                &**spans[0].attributes.as_ref().unwrap(),
                &**events[0].attributes.as_ref().unwrap(),
            ] {
                let normalized = super::super::attributes::attributes_to_map(attributes.clone());
                assert_eq!(normalized.get("kept").and_then(Value::as_str), Some("yes"));
                assert_eq!(
                    normalized.get(expected_key).and_then(Value::as_str),
                    Some(expected_text)
                );
            }
        }
    }

    proptest::proptest! {
        #[test]
        fn fields_recover_locally_and_preserve_deep_attribute_wrappers(
            depth in 128usize..192,
            leaf in proptest::sample::select(vec!["null", r#""\ud800""#, "1e309"]),
        ) {
            let nested = "[ ".repeat(depth) + leaf + &" ]".repeat(depth);
            for value in [
                format!(r#"{{"kvlistValue":{{"values":[{{"key":"nested","value":{nested}}}]}}}}"#),
                format!(r#"{{"arrayValue":{{"values":[{nested}]}}}}"#),
            ] {
                let text = format!(r#"{{"attributes":[{{"key":"kept","value":{value}}}]}}"#);
                let resource: Resource = serde_json::from_str(&text).unwrap();
                let attributes = super::super::attributes::attributes_to_map(resource.attributes.unwrap().into_value());
                proptest::prop_assert_eq!(attributes.get("kept").and_then(Value::as_str), Some(value.as_str()));
                proptest::prop_assert!(serde_json::from_str::<Resource>(&text.replace(leaf, "invalid")).is_err());
            }
            let text = format!(r#"{{"attributes":[{{"key":"scalar","value":{{"stringValue":{leaf}}}}}]}}"#);
            proptest::prop_assert!(serde_json::from_str::<Resource>(&text).is_ok());
        }
    }

    #[test]
    fn deep_dynamic_field_is_dropped_without_rejecting_sibling_span() {
        let nested = "[".repeat(128) + "0" + &"]".repeat(128);
        let input = format!(
            r#"{{"scopeSpans":[{{"spans":[
                {{"traceId":"trace-1","spanId":"span-1","name":{nested}}},
                {{"traceId":"trace-2","spanId":"span-2","name":"kept"}}
            ]}}]}}"#
        );
        let resource = ResourceSpan::deserialize(
            CompatibleContainerDeserializer::from_bytes(input.as_bytes()).unwrap(),
        )
        .expect("one deep field must not reject its resource span");
        let scopes = resource.scope_spans.unwrap().0;
        let spans = &scopes[0].spans.as_ref().unwrap().0;
        assert!(spans[0].name.as_ref().unwrap().is_null());
        assert_eq!(
            spans[1].span_id.as_deref().and_then(Value::as_str),
            Some("span-2")
        );
    }
}
