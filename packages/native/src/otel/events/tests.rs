use super::super::value::json;
use super::build::AI_GATEWAY_SERVICE_NAME;
use super::*;
use crate::otel::input::Span;

#[test]
fn skips_ignored_envelope_values_without_materializing_them() {
    for ignored in [
        format!("{}null{}", "[".repeat(200), "]".repeat(200)),
        r#""\ud800""#.to_owned(),
        "1e309".to_owned(),
    ] {
        let input = format!(
            r#"[{{"ignored":{ignored},"resource":{{"ignored":{ignored}}},
              "scopeSpans":[{{"ignored":{ignored},"spans":[{{
                "traceId":"trace","spanId":"span","name":"kept",
                "ignored":{ignored},"status":{{"ignored":{ignored}}},
                "events":[{{"name":"gen_ai.user.message","ignored":{ignored},
                  "attributes":[{{"key":"content","value":{{"stringValue":"hello"}}}}]}}]
            }}]}}]}}]"#,
        );
        let events = process_to_events(input.as_bytes(), &EventBuildConfig::default()).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].name, "kept");
        assert_eq!(events[0].level, "DEFAULT");
        assert_eq!(
            events[0].input,
            Some(json!([{"role":"user", "content":"hello"}]))
        );
        assert_eq!(events[0].metadata["resourceAttributes"], json!({}));
    }
    assert!(process_to_events(br#"[{"ignored":[1,]}]"#, &EventBuildConfig::default()).is_err());

    // A materialized field can be skipped while its resource and following resource remain
    // processable.
    let nested = "[".repeat(200) + "null" + &"]".repeat(200);
    let input = format!(
        r#"[{{"scopeSpans":[{{"spans":[{{"traceId":"t","spanId":"deep","attributes":{nested}}}]}}]}},{{"scopeSpans":[{{"spans":[{{"traceId":"t","spanId":"kept"}}]}}]}}]"#
    );
    let events = process_to_events(input.as_bytes(), &EventBuildConfig::default()).unwrap();
    assert_eq!(
        events
            .iter()
            .map(|event| event.span_id.as_str())
            .collect::<Vec<_>>(),
        ["deep", "kept"]
    );
}

#[test]
fn ignores_unrepresentable_scalars_only_at_container_boundaries() {
    for scalar in [r#""\ud800""#, r#""\udfff""#, "1e309"] {
        let input = format!(
            r#"[{{"scopeSpans":[{{"spans":[{{"traceId":"t","spanId":"first"}}]}}]}},
            {scalar},{{"resource":{scalar},"scopeSpans":[{scalar},{{"spans":[{scalar},
            {{"traceId":"t","spanId":"second","status":{scalar},"events":{scalar},
              "attributes":[{{"key":"langfuse.observation.input","value":{{"stringValue":"\ud800"}}}}]}}
        ]}}]}}]"#
        );
        let events = process_to_events(input.as_bytes(), &EventBuildConfig::default()).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].span_id, "first");
        assert_eq!(events[1].span_id, "second");
        assert_eq!(
            events[1].input.as_ref().unwrap().to_json_string(),
            r#""\ud800""#
        );
    }
}

#[test]
fn keeps_duplicate_fields_and_ignores_non_otlp_names() {
    // The array keeps the one object with a supported field; explicit null fields remain present.
    let spans: crate::otel::input::Array<Span> =
        serde_json::from_str(r#"[null,false,0,[],{},{"ignored":0},{"spanId":null}]"#).unwrap();
    assert_eq!(spans.0.len(), 1);

    let span = r#"{"traceId":"trace","spanId":"old","spanId":"kept","span_id":"alias"}"#;
    let scopes = format!(r#"[null,{{"spans":[false,[],{span}]}}]"#);
    for (fields, count) in [
        (format!(r#""scopeSpans":[],"scopeSpans":{scopes}"#), 1),
        (format!(r#""scopeSpans":null,"scope_spans":{scopes}"#), 0),
        (format!(r#""scopeSpans":[],"scope_spans":{scopes}"#), 0),
        (format!(r#""scopeSpans":{scopes},"scopeSpans":false"#), 0),
        (
            format!(r#""scopeSpans":[{{"spans":[{span}]}}]"#)
                .replace(r#""spanId":"kept""#, r#""spanId":null"#),
            0,
        ),
    ] {
        let input = format!("[null,1,[],{{{fields}}}]");
        let events = process_to_events(input.as_bytes(), &EventBuildConfig::default()).unwrap();
        assert_eq!(events.len(), count, "{input}");
        if let Some(event) = events.first() {
            assert_eq!(event.span_id, "kept");
        }
    }

    let snake_only_ids = r#"[{"scopeSpans":[{"spans":[{"trace_id":"trace","span_id":"span"}]}]}]"#;
    assert!(
        process_to_events(snake_only_ids.as_bytes(), &EventBuildConfig::default())
            .unwrap()
            .is_empty()
    );

    let snake_only_fields = r#"[{"scopeSpans":[{"spans":[{
        "traceId":"trace","spanId":"span",
        "parent_span_id":"parent",
        "start_time_unix_nano":"1000000000",
        "end_time_unix_nano":"2000000000"
    }]}]}]"#;
    let events =
        process_to_events(snake_only_fields.as_bytes(), &EventBuildConfig::default()).unwrap();
    assert_eq!(events.len(), 1);
    assert!(events[0].parent_span_id.is_none());
    assert_eq!(events[0].start_time, "1970-01-01T00:00:00.000Z");
    assert_eq!(events[0].end_time, "1970-01-01T00:00:00.000Z");
}

fn process_json(value: &Value, config: &EventBuildConfig) -> Result<Vec<OwnedEvent>, String> {
    process_to_events(&serde_json::to_vec(value).unwrap(), config)
}

fn string_attribute(key: &str, value: &str) -> Value {
    json!({"key": key, "value": {"stringValue": value}})
}

fn metadata_event(
    attributes: Vec<Value>,
    sdk_name: &str,
    scope_name: &str,
    scope_version: &str,
    telemetry_sdk_language: Option<&str>,
) -> OwnedEvent {
    let resource_attributes = telemetry_sdk_language
        .map(|language| vec![string_attribute("telemetry.sdk.language", language)])
        .unwrap_or_default();
    let input = json!([{
        "resource": {"attributes": resource_attributes},
        "scopeSpans": [{
            "scope": {"name": scope_name, "version": scope_version},
            "spans": [{
                "traceId": "trace",
                "spanId": "span",
                "name": "chat",
                "startTimeUnixNano": "1000000000",
                "endTimeUnixNano": "2000000000",
                "attributes": attributes
            }]
        }]
    }]);
    process_json(
        &input,
        &EventBuildConfig {
            ingestion_sdk_name: sdk_name.to_owned(),
            ..Default::default()
        },
    )
    .unwrap()
    .into_iter()
    .next()
    .unwrap()
}

#[test]
fn claude_managed_agent_lifecycle_respects_provider_priority() {
    for (span_name, operation, explicit_type, expected_type, expected_name, skip_usage) in [
        (
            "anthropic.sessions.create",
            None,
            None,
            "SPAN",
            "anthropic.sessions.create",
            true,
        ),
        (
            "anthropic.messages.create",
            Some("chat"),
            None,
            "GENERATION",
            "anthropic.messages.create",
            false,
        ),
        (
            "anthropic.sessions.create",
            None,
            Some("generation"),
            "GENERATION",
            "anthropic.sessions.create",
            false,
        ),
        (
            "anthropic.session.turn",
            Some("invoke_agent"),
            None,
            "AGENT",
            "Researcher",
            true,
        ),
    ] {
        let mut attributes = vec![
            string_attribute("anthropic.session.id", "session"),
            string_attribute("gen_ai.conversation.id", "thread"),
            string_attribute("gen_ai.agent.name", "Researcher"),
            string_attribute("gen_ai.request.model", "claude"),
            json!({"key": "gen_ai.usage.input_tokens", "value": {"intValue": 4}}),
            json!({"key": "gen_ai.usage.cost", "value": {"doubleValue": 0.5}}),
        ];
        for (key, value) in [
            ("gen_ai.operation.name", operation),
            ("langfuse.observation.type", explicit_type),
        ] {
            if let Some(value) = value {
                attributes.push(string_attribute(key, value));
            }
        }
        let input = json!([{"scopeSpans": [{
            "scope": {"name": "com.anthropic.claude-platform"},
            "spans": [{"traceId": "trace", "spanId": "span", "name": span_name, "attributes": attributes}]
        }]}]);
        let event = process_json(&input, &EventBuildConfig::default())
            .unwrap()
            .remove(0);
        assert_eq!(
            event.event_type, expected_type,
            "{span_name}, {explicit_type:?}"
        );
        assert_eq!(event.name, expected_name);
        assert_eq!(event.session_id.as_deref(), Some("session"));
        assert_eq!(
            event.provided_model_name.as_deref(),
            (!skip_usage).then_some("claude")
        );
        assert_eq!(
            event.provided_usage_details.get("input"),
            (!skip_usage).then_some(&json!(4))
        );
        assert_eq!(
            event.provided_cost_details.get("total"),
            (!skip_usage).then_some(&json!(0.5))
        );
        if skip_usage {
            assert!(event.provided_usage_details.is_empty());
            assert!(event.provided_cost_details.is_empty());
        }
    }
}

#[test]
fn python_sdk_override_precedes_explicit_type_only_for_legacy_span() {
    for (version, language, explicit_type, expected) in [
        ("3.3.99", "python", "span", "GENERATION"),
        ("3.4.0", "python", "span", "SPAN"),
        ("3.3.0", "javascript", "span", "SPAN"),
        ("3.3.0", "python", "tool", "TOOL"),
    ] {
        let event = metadata_event(
            vec![
                string_attribute("langfuse.observation.type", explicit_type),
                string_attribute("langfuse.observation.model.name", ""),
            ],
            language,
            "langfuse-sdk",
            version,
            Some(language),
        );
        assert_eq!(
            event.event_type, expected,
            "{version}, {language}, {explicit_type}"
        );
    }
}

#[test]
fn builds_owned_events_without_reencoding_the_batch() {
    let input = json!([{
        "resource": {"attributes": [{"key":"service.name","value":{"stringValue":"svc"}}]},
        "scopeSpans": [{"scope":{"name":"ai","version":"1"},"spans":[{
            "traceId":"trace","spanId":"span","name":"chat",
            "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
            "attributes":[
                {"key":"gen_ai.operation.name","value":{"stringValue":"chat"}},
                {"key":"ai.prompt.messages","value":{"arrayValue":{"values":[]}}}
            ]
        }]}]
    }]);
    let events = process_json(
        &input,
        &EventBuildConfig {
            project_id: "p".into(),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].project_id, "p");
    assert_eq!(events[0].service_name.as_deref(), Some("svc"));
}

#[test]
fn trusted_gateway_attribution_uses_caller_key_and_scope_version() {
    let input = json!([{
        "resource": {"attributes": [
            {"key":"service.name","value":{"stringValue":"provider"}},
            {"key":"service.version","value":{"stringValue":"provider-v1"}}
        ]},
        "scopeSpans": [{"scope":{"name":"gateway","version":"gateway-v2"},"spans":[{
            "traceId":"trace","spanId":"span","name":"chat",
            "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
            "attributes":[{"key":"langfuse.observation.metadata.langfuse.gateway.api_key.id",
                "value":{"stringValue":"caller-key"}}]
        }]}]
    }]);
    let events = process_json(
        &input,
        &EventBuildConfig {
            ingestion_api_key: "gateway:grant".into(),
            ..Default::default()
        },
    )
    .unwrap();

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].ingestion_api_key, "caller-key");
    assert_eq!(
        events[0].service_name.as_deref(),
        Some(AI_GATEWAY_SERVICE_NAME)
    );
    assert_eq!(events[0].service_version.as_deref(), Some("gateway-v2"));
}

#[test]
fn missing_gateway_caller_key_skips_only_that_span() {
    let input = json!([{
        "resource": {"attributes": []},
        "scopeSpans": [{"scope":{"name":"gateway","version":"1"},"spans":[
            {"traceId":"trace","spanId":"missing","name":"chat",
             "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
             "attributes":[]},
            {"traceId":"trace","spanId":"kept","name":"chat",
             "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
             "attributes":[{"key":"langfuse.observation.metadata.langfuse.gateway.api_key.id",
                 "value":{"stringValue":"caller-key"}}]}
        ]}]
    }]);
    let events = process_json(
        &input,
        &EventBuildConfig {
            ingestion_api_key: "gateway:grant".into(),
            ..Default::default()
        },
    )
    .unwrap();

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].span_id, "kept");
}

#[test]
fn ordinary_auth_clears_a_spoofed_gateway_service() {
    let input = json!([{
        "resource": {"attributes": [
            {"key":"service.name","value":{"stringValue":AI_GATEWAY_SERVICE_NAME}},
            {"key":"service.version","value":{"stringValue":"spoofed"}}
        ]},
        "scopeSpans": [{"scope":{"name":"ordinary","version":"1"},"spans":[{
            "traceId":"trace","spanId":"span","name":"chat",
            "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
            "attributes":[]
        }]}]
    }]);
    let events = process_json(
        &input,
        &EventBuildConfig {
            ingestion_api_key: "project-key".into(),
            ..Default::default()
        },
    )
    .unwrap();

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].service_name, None);
    assert_eq!(events[0].service_version, None);
}

#[test]
fn preserves_legacy_metadata_nesting_and_environment_normalization() {
    let input = json!([{
        "resource": {"attributes": [{"key":"deployment.environment","value":{"stringValue":"Langfuse-Prod"}}]},
        "scopeSpans": [{"scope":{"name":"otel.scope","version":"1","schemaUrl":"schema"},"spans":[{
            "traceId":"trace","spanId":"span","name":"chat",
            "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
            "attributes":[{"key":"custom","value":{"stringValue":"value"}}]
        }]}]
    }]);
    let events = process_json(
        &input,
        &EventBuildConfig {
            project_id: "p".into(),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(events[0].environment, "prod");
    assert_eq!(events[0].metadata["attributes"]["custom"], json!("value"));
    assert_eq!(events[0].metadata.get("custom"), None);
    assert_eq!(events[0].metadata["scope"]["schemaUrl"], json!("schema"));
    assert_eq!(
        events[0].metadata["scope"]["attributes"]["custom"],
        Value::Null
    );
}

#[test]
fn non_string_environment_uses_default_and_ingestion_cannot_bookmark() {
    let input = json!([{
        "resource": {"attributes": [{"key":"deployment.environment","value":{"stringValue":"prod"}}]},
        "scopeSpans": [{"scope":{"name":"otel.scope"},"spans":[{
            "traceId":"trace","spanId":"span","name":"chat",
            "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
            "attributes":[
                {"key":"langfuse.environment","value":{"intValue":"42"}},
                {"key":"langfuse.trace.bookmarked","value":{"boolValue":true}}
            ]
        }]}]
    }]);
    let events = process_json(&input, &EventBuildConfig::default()).unwrap();
    assert_eq!(events[0].environment, "default");
    assert!(!events[0].bookmarked);
}

#[test]
fn nullish_prompt_name_does_not_fall_through_an_explicit_empty_alias() {
    let input = json!([{
        "resource": {"attributes": []},
        "scopeSpans": [{"scope":{"name":"otel.scope"},"spans":[{
            "traceId":"trace","spanId":"span","name":"chat",
            "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
            "attributes":[
                {"key":"langfuse.observation.type","value":{"stringValue":"generation"}},
                {"key":"langfuse.observation.prompt.name","value":{"stringValue":""}},
                {"key":"langfuse.prompt.name","value":{"stringValue":"alias"}}
            ]
        }]}]
    }]);
    let events = process_json(&input, &EventBuildConfig::default()).unwrap();
    assert_eq!(events[0].prompt_name.as_deref(), Some(""));
}

#[test]
fn recovers_internal_environment_from_failed_openrouter_request() {
    let input = json!([{
        "resource": {"attributes": [
            {"key":"service.name","value":{"stringValue":"openrouter"}}
        ]},
        "scopeSpans": [{"scope":{"name":"otel.scope"},"spans":[{
            "traceId":"trace","spanId":"span","name":"chat",
            "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
            "attributes":[
                {"key":"openrouter.source","value":{"stringValue":"openrouter"}},
                {"key":"gen_ai.completion","value":{"stringValue":"{\"completion\":null,\"rawRequest\":{\"trace\":{\"environment\":\"langfuse-llm-as-a-judge\"}}}"}}
            ]
    }]}]
    }]);
    let events = process_json(&input, &EventBuildConfig::default()).unwrap();
    assert_eq!(events[0].environment, "llm-as-a-judge");
}

#[test]
fn only_numeric_otlp_status_code_two_sets_error_level() {
    for (code, expected) in [
        (json!(2), "ERROR"),
        (json!("2"), "DEFAULT"),
        (json!("ERROR"), "DEFAULT"),
    ] {
        let input = json!([{
            "resource": {"attributes": []},
            "scopeSpans": [{"scope":{"name":"otel.scope"},"spans":[{
                "traceId":"trace","spanId":"span","name":"chat",
                "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
                "status":{"code": code}, "attributes": []
            }]}]
        }]);
        let events = process_json(&input, &EventBuildConfig::default()).unwrap();
        assert_eq!(events[0].level, expected);
    }
}

#[test]
fn resolves_user_identity_from_resource_and_span_values() {
    let identity_event = |span_attributes: Vec<Value>, resource_attributes: Vec<Value>| {
        let input = json!([{
            "resource": {"attributes": resource_attributes},
            "scopeSpans": [{"scope":{"name":"otel.scope"},"spans":[{
                "traceId":"trace","spanId":"span","name":"chat",
                "startTimeUnixNano":"1000000000","endTimeUnixNano":"2000000000",
                "attributes": span_attributes
            }]}]
        }]);
        process_json(&input, &EventBuildConfig::default())
            .unwrap()
            .into_iter()
            .next()
            .unwrap()
    };
    for (span, resource, expected) in [
        (
            vec![string_attribute("user.id", "span-id")],
            vec![string_attribute("user.id", "resource-id")],
            Some("span-id"),
        ),
        (
            vec![string_attribute("user.name", "span-name")],
            vec![string_attribute("langfuse.user.id", "resource-id")],
            Some("resource-id"),
        ),
        (
            vec![string_attribute("user.name", "span-name")],
            vec![string_attribute("user.name", "resource-name")],
            Some("span-name"),
        ),
        (
            Vec::new(),
            vec![string_attribute("user.name", "resource-name")],
            Some("resource-name"),
        ),
    ] {
        assert_eq!(identity_event(span, resource).user_id.as_deref(), expected);
    }
    let encoded = metadata_event(
        vec![string_attribute(
            "langfuse.observation.metadata.langfuse_user_id",
            "\"metadata-id\"",
        )],
        "python",
        "langfuse-sdk",
        "5.0.0",
        None,
    );
    assert_eq!(encoded.user_id.as_deref(), Some("metadata-id"));
}

#[test]
fn streaming_preserves_order_across_resources() {
    let input = json!([
        {
            "resource": {"attributes": []},
            "scopeSpans": [{
                "scope": {"name": "otel.scope"},
                "spans": [{
                    "traceId": "trace",
                    "spanId": "root",
                    "name": "root",
                    "startTimeUnixNano": "1000000000",
                    "endTimeUnixNano": "2000000000",
                    "attributes": []
                }]
            }]
        },
        {
            "resource": {"attributes": []},
            "scopeSpans": [{
                "scope": {"name": "otel.scope"},
                "spans": [{
                    "traceId": "trace",
                    "spanId": "child",
                    "parentSpanId": "root",
                    "name": "child",
                    "startTimeUnixNano": "3000000000",
                    "endTimeUnixNano": "4000000000",
                    "attributes": []
                }]
            }]
        }
    ]);
    let actual = process_json(&input, &EventBuildConfig::default()).unwrap();

    assert_eq!(actual[0].span_id, "root");
    assert_eq!(actual[1].span_id, "child");
}

#[test]
fn decodes_per_key_metadata_only_for_structured_langfuse_sdk_majors() {
    let cases = [
        ("Python 4", "python", "langfuse-sdk", "4.99.0", None, false),
        (
            "Python 5",
            "  LANGFUSE-PYTHON ",
            "langfuse-sdk",
            "5.0.0",
            None,
            true,
        ),
        (
            "Python PEP 440 release candidate",
            "python",
            "langfuse-sdk",
            "5.0.0rc1",
            None,
            true,
        ),
        (
            "JavaScript 5",
            "@langfuse/otel",
            "langfuse-sdk",
            "5.99.1",
            None,
            false,
        ),
        (
            "JavaScript 6",
            "typescript",
            "langfuse-sdk-v2",
            "6.0.0",
            None,
            true,
        ),
        (
            "uppercase v version is rejected",
            "python",
            "langfuse-sdk",
            "V5.0.0",
            None,
            false,
        ),
        (
            "header wins over resource language",
            "python",
            "langfuse-sdk",
            "5.0.0",
            Some("nodejs"),
            true,
        ),
        (
            "language fallback",
            "unknown",
            "langfuse-sdk",
            "6.0.0-beta.1",
            Some("nodejs"),
            true,
        ),
        (
            "non-Langfuse scope",
            "python",
            "openinference",
            "5.0.0",
            None,
            false,
        ),
    ];

    for (name, sdk_name, scope_name, scope_version, language, should_decode) in cases {
        let event = metadata_event(
            vec![string_attribute(
                "langfuse.observation.metadata.environment",
                "\"prod\"",
            )],
            sdk_name,
            scope_name,
            scope_version,
            language,
        );
        let expected = if should_decode {
            json!("prod")
        } else {
            json!("\"prod\"")
        };
        assert_eq!(event.metadata["environment"], expected, "{name}");
    }
}

#[test]
fn per_key_metadata_scalars_objects_and_arrays_match_a_blob() {
    let metadata = json!({
        "environment": "prod",
        "count": 42,
        "ratio": 1.5,
        "large": 9007199254740993u64,
        "enabled": true,
        "missing": null,
        "database": {"host": "localhost", "port": 5432},
        "steps": [{"name": "fetch", "args": {"url": "https://example.com"}}],
    });

    for domain in ["observation", "trace"] {
        let blob = metadata_event(
            vec![string_attribute(
                &format!("langfuse.{domain}.metadata"),
                &metadata.to_string(),
            )],
            "python",
            "langfuse-sdk",
            "5.0.0",
            None,
        );
        let per_key = metadata
            .as_object()
            .unwrap()
            .iter()
            .map(|(key, value)| {
                string_attribute(
                    &format!("langfuse.{domain}.metadata.{}", key.as_str()),
                    &serde_json::to_string(value).unwrap(),
                )
            })
            .collect();
        let decoded = metadata_event(per_key, "python", "langfuse-sdk", "5.0.0", None);

        assert_eq!(decoded.metadata, blob.metadata, "{domain}");
        assert_eq!(
            crate::otel::types::flatten_object_owned(decoded.metadata.clone()),
            crate::otel::types::flatten_object_owned(blob.metadata.clone()),
            "{domain} flattened metadata",
        );
    }
}

#[test]
fn preserves_truncated_per_key_values_while_decoding_valid_siblings() {
    let event = metadata_event(
        vec![
            string_attribute(
                "langfuse.observation.metadata.note",
                r#"{"message":"truncated"#,
            ),
            string_attribute("langfuse.observation.metadata.environment", "\"prod\""),
        ],
        "python",
        "langfuse-sdk",
        "5.0.0",
        None,
    );

    assert_eq!(event.metadata["note"], json!(r#"{"message":"truncated"#));
    assert_eq!(event.metadata["environment"], json!("prod"));
}
