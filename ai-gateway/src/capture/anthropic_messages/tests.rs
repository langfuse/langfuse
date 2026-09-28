use super::*;
use crate::{
    capture::{
        ExecutionCapture, InputOmission, InputOmissionReason, MAX_INPUT_CAPTURE_BYTES,
        ProtocolCapture, ProviderFacts,
    },
    providers::{ProviderLimits, ProviderTransport, Route},
    resolution::ApiFormat,
    test_support::{FakeServer, resolved_request_context_for},
};
use axum::{
    body::{Body, Bytes, to_bytes},
    http::{HeaderValue, Response, header},
};
use serde_json::json;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

const REQUEST: &[u8] = br#"{"model":"claude-sonnet-4-5","max_tokens":32000,"temperature":1,"stream":true,"speed":"fast","system":[{"type":"text","text":"system-canary","cache_control":{"type":"ephemeral"}}],"messages":[{"role":"user","content":"prompt-canary"}],"tools":[{"name":"Bash","input_schema":{"type":"object"}}],"thinking":{"type":"adaptive"},"tool_choice":{"type":"auto"},"metadata":{"user_id":"{\"session_id\":\"session-canary\"}"},"future_field":{"kept":true}}"#;

fn captured(execution: &ExecutionCapture) -> &AnthropicMessagesCapture {
    let ProtocolCapture::AnthropicMessages(capture) = execution.protocol.as_ref().unwrap() else {
        panic!("expected the Anthropic Messages adapter");
    };
    capture
}

async fn new_observer(mode: &'static str) -> ExecutionCapture {
    let context =
        resolved_request_context_for(ApiFormat::AnthropicMessages, "provider-secret", mode).await;
    ExecutionCapture::for_request(
        ApiFormat::AnthropicMessages,
        &context,
        &HeaderMap::new(),
        REQUEST,
    )
}

fn record_response(observer: &mut ExecutionCapture, status: u16, content_type: &'static str) {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    headers.insert("request-id", HeaderValue::from_static("req_provider_1"));
    observer.record_response(status, &headers);
}

fn event(kind: &str, fields: Value) -> String {
    let mut value = fields;
    value["type"] = kind.into();
    format!("event: {kind}\ndata: {value}\n\n")
}

fn message_start() -> String {
    event(
        "message_start",
        json!({"message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-4-5-20250929","content":[],"stop_reason":null,"usage":{"input_tokens":7,"output_tokens":1,"cache_creation_input_tokens":2089,"cache_read_input_tokens":16399,"cache_creation":{"ephemeral_5m_input_tokens":2089,"ephemeral_1h_input_tokens":0},"service_tier":"standard"}}}),
    )
}

fn text_stream() -> String {
    [
        message_start(),
        event("ping", json!({})),
        event(
            "content_block_start",
            json!({"index":0,"content_block":{"type":"text","text":""}}),
        ),
        event(
            "content_block_delta",
            json!({"index":0,"delta":{"type":"text_delta","text":"Hel"}}), // codespell:ignore
        ),
        event(
            "content_block_delta",
            json!({"index":0,"delta":{"type":"text_delta","text":"lo"}}),
        ),
        event("content_block_stop", json!({"index":0})),
        event(
            "message_delta",
            json!({"delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":7,"output_tokens":445,"cache_creation_input_tokens":2089,"cache_read_input_tokens":16399,"cache_creation":{"ephemeral_5m_input_tokens":2089,"ephemeral_1h_input_tokens":0}}}),
        ),
        event("message_stop", json!({})),
    ]
    .concat()
}

#[tokio::test]
async fn streaming_usage_is_replaced_by_cumulative_deltas_not_summed() {
    let mut observer = new_observer("usage").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(text_stream().as_bytes());
    observer.end_body();
    let facts = captured(&observer);
    assert_eq!(
        facts
            .usage
            .as_ref()
            .map(|usage| Value::Object(usage.clone())),
        Some(json!({
            "input_tokens":7,"output_tokens":445,"cache_creation_input_tokens":2089,
            "cache_read_input_tokens":16399,
            "cache_creation":{"ephemeral_5m_input_tokens":2089,"ephemeral_1h_input_tokens":0},
            "service_tier":"standard"
        }))
    );
    assert_eq!(facts.facts.provider_response_id.as_deref(), Some("msg_1"));
    assert_eq!(
        facts.facts.model.as_deref(),
        Some("claude-sonnet-4-5-20250929")
    );
    assert_eq!(
        facts.facts.requested_model.as_deref(),
        Some("claude-sonnet-4-5")
    );
    assert_eq!(facts.facts.provider_status.as_deref(), Some("completed"));
    assert_eq!(
        facts.facts.provider_request_id.as_deref(),
        Some("req_provider_1")
    );
    assert!(facts.facts.output_complete);
    assert!(facts.facts.capture_complete);
    assert!(facts.facts.input.is_none());
}

#[tokio::test]
async fn completion_starts_on_the_first_text_thinking_or_tool_input_delta_only() {
    for (delta, expected) in [
        (json!({"type":"text_delta","text":"x"}), true),
        (json!({"type":"thinking_delta","thinking":"x"}), true),
        (json!({"type":"input_json_delta","partial_json":"{"}), true),
        (json!({"type":"text_delta","text":""}), false),
        (json!({"type":"signature_delta","signature":"abc"}), false),
        (
            json!({"type":"citations_delta","citation":{"type":"char_location"}}),
            false,
        ),
    ] {
        let mut observer = new_observer("usage").await;
        record_response(&mut observer, 200, "text/event-stream");
        observer.push_bytes(message_start().as_bytes());
        observer.push_bytes(event("ping", json!({})).as_bytes());
        observer.push_bytes(
            event(
                "content_block_start",
                json!({"index":0,"content_block":{"type":"text","text":""}}),
            )
            .as_bytes(),
        );
        assert!(observer.completion_start_ms.is_none());
        observer
            .push_bytes(event("content_block_delta", json!({"index":0,"delta":delta})).as_bytes());
        assert_eq!(observer.completion_start_ms.is_some(), expected, "{delta}");
    }
}

#[tokio::test]
async fn json_responses_capture_the_same_facts_and_error_bodies_mark_failure() {
    let mut observer = new_observer("full").await;
    record_response(&mut observer, 200, "application/json");
    observer.push_bytes(br#"{"id":"msg_2","type":"message","role":"assistant","model":"claude-sonnet-4-5-20250929","content":[{"type":"text","text":"Hello"}],"stop_reason":"max_tokens","usage":{"input_tokens":10,"output_tokens":32000}}"#);
    observer.end_body();
    let facts = captured(&observer);
    assert_eq!(facts.facts.provider_response_id.as_deref(), Some("msg_2"));
    assert_eq!(facts.facts.provider_status.as_deref(), Some("incomplete"));
    assert_eq!(
        facts
            .usage
            .as_ref()
            .map(|usage| Value::Object(usage.clone())),
        Some(json!({"input_tokens":10,"output_tokens":32000}))
    );
    assert!(facts.facts.output_complete);
    assert_eq!(
        finalized(&mut observer).output,
        Some(
            json!({"role":"assistant","content":[{"type":"text","text":"Hello"}],"stop_reason":"max_tokens"})
        )
    );

    for (mode, expected_message) in [
        (
            "full",
            Some("invalid_request_error: messages.0.content: prompt-canary echoed"),
        ),
        ("usage", None),
    ] {
        let mut observer = new_observer(mode).await;
        record_response(&mut observer, 400, "application/json");
        observer.push_bytes(br#"{"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content: prompt-canary echoed"},"request_id":"req_x"}"#);
        observer.end_body();
        let facts = captured(&observer);
        assert_eq!(facts.facts.provider_status.as_deref(), Some("failed"));
        assert_eq!(facts.facts.error_message.as_deref(), expected_message);
        assert!(facts.usage.is_none());
        assert!(!facts.facts.output_complete);
    }
}

#[tokio::test]
async fn in_stream_errors_unknown_events_and_truncation_are_tolerated() {
    let mut observer = new_observer("full").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(message_start().as_bytes());
    observer.push_bytes(event("future_event", json!({"payload":[1,2,3]})).as_bytes());
    observer.push_bytes(
        event(
            "error",
            json!({"error":{"type":"overloaded_error","message":"Overloaded"}}),
        )
        .as_bytes(),
    );
    observer.end_body();
    let facts = captured(&observer);
    assert_eq!(facts.facts.provider_status.as_deref(), Some("failed"));
    assert_eq!(
        facts.facts.error_message.as_deref(),
        Some("overloaded_error: Overloaded")
    );
    // Usage from message_start survives the failure; nothing is invented.
    assert_eq!(facts.usage.as_ref().unwrap()["output_tokens"], json!(1));
    assert!(!facts.facts.output_complete);

    let mut observer = new_observer("usage").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(message_start().as_bytes());
    observer
        .push_bytes(b"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"ind");
    observer.end_body();
    let facts = captured(&observer);
    assert_eq!(facts.facts.provider_status, None);
    assert!(!facts.facts.output_complete);
    assert_eq!(facts.usage.as_ref().unwrap()["input_tokens"], json!(7));

    let mut observer = new_observer("usage").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(b"event: message_start\ndata: not json\n\n");
    observer.push_bytes(text_stream().as_bytes());
    observer.end_body();
    assert!(!captured(&observer).facts.output_complete);
    assert_eq!(
        captured(&observer).facts.provider_status.as_deref(),
        Some("completed")
    );
}

fn finalized(observer: &mut ExecutionCapture) -> ProviderFacts {
    observer.protocol.take().unwrap().into_facts().1
}

fn block_events(index: u64, start: &Value, deltas: &[Value]) -> String {
    let mut events = vec![event(
        "content_block_start",
        json!({"index":index,"content_block":start}),
    )];
    for delta in deltas {
        events.push(event(
            "content_block_delta",
            json!({"index":index,"delta":delta}),
        ));
    }
    events.push(event("content_block_stop", json!({"index":index})));
    events.concat()
}

fn stop_events() -> String {
    [
        event(
            "message_delta",
            json!({"delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":20}}),
        ),
        event("message_stop", json!({})),
    ]
    .concat()
}

#[tokio::test]
async fn request_configuration_and_metadata_are_projected_out_of_input_by_mode() {
    let observer = new_observer("full").await;
    let facts = &captured(&observer).facts;
    assert_eq!(
        facts.model_parameters,
        json!({"max_tokens":32000,"temperature":1,"stream":true,"speed":"fast","thinking":{"type":"adaptive"},"tool_choice":{"type":"auto"}})
            .as_object()
            .cloned()
            .unwrap()
    );
    assert_eq!(
        facts.request_metadata,
        json!({"metadata":{"user_id":"{\"session_id\":\"session-canary\"}"}})
            .as_object()
            .cloned()
            .unwrap()
    );
    let input = facts.input.as_ref().unwrap();
    assert_eq!(input["system"][0]["text"], json!("system-canary"));
    assert_eq!(
        input["system"][0]["cache_control"]["type"],
        json!("ephemeral")
    );
    assert_eq!(input["messages"][0]["content"], json!("prompt-canary"));
    assert_eq!(input["tools"][0]["name"], json!("Bash"));
    assert_eq!(input["future_field"], json!({"kept":true}));
    for projected in [
        "model",
        "max_tokens",
        "speed",
        "thinking",
        "tool_choice",
        "metadata",
    ] {
        assert!(input.get(projected).is_none(), "{projected} left in input");
    }
    assert!(facts.input_complete);

    let mut observer = new_observer("usage").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(text_stream().as_bytes());
    let facts = finalized(&mut observer);
    assert_eq!(
        facts.model_parameters,
        json!({"max_tokens":32000,"temperature":1,"stream":true,"speed":"fast"})
            .as_object()
            .cloned()
            .unwrap()
    );
    assert!(facts.request_metadata.is_empty());
    assert!(facts.input.is_none());
    assert!(facts.output.is_none());
    let serialized = serde_json::to_string(&facts).unwrap();
    let canaries = ["system-canary", "prompt-canary", "session-canary", "Hel"]; // codespell:ignore hel
    for canary in canaries {
        assert!(!serialized.contains(canary), "usage mode captured {canary}");
    }
}

#[tokio::test]
async fn full_mode_stitches_text_thinking_tool_and_citation_blocks_in_order() {
    let mut observer = new_observer("full").await;
    record_response(&mut observer, 200, "text/event-stream");
    let stream = [
        message_start(),
        block_events(
            0,
            &json!({"type":"thinking","thinking":"","signature":""}),
            &[
                json!({"type":"thinking_delta","thinking":"Let me "}),
                json!({"type":"thinking_delta","thinking":"check."}),
                json!({"type":"signature_delta","signature":"sig-"}),
                json!({"type":"signature_delta","signature":"opaque"}),
            ],
        ),
        event("ping", json!({})),
        block_events(
            1,
            &json!({"type":"text","text":""}),
            &[
                json!({"type":"text_delta","text":"See "}),
                json!({"type":"citations_delta","citation":{"type":"char_location","cited_text":"x"}}),
                json!({"type":"text_delta","text":"docs."}),
            ],
        ),
        block_events(
            2,
            &json!({"type":"tool_use","id":"toolu_1","name":"Bash","input":{}}),
            &[
                json!({"type":"input_json_delta","partial_json":"{\"command\":"}),
                json!({"type":"input_json_delta","partial_json":"\"ls -la\"}"}),
            ],
        ),
        block_events(3, &json!({"type":"redacted_thinking","data":"opaque"}), &[]),
        stop_events(),
    ]
    .concat();
    // Byte-at-a-time delivery must stitch identically to whole events.
    for chunk in stream.as_bytes().chunks(7) {
        observer.push_bytes(chunk);
    }
    observer.end_body();
    assert!(captured(&observer).facts.output_complete);
    assert_eq!(
        finalized(&mut observer).output,
        Some(json!({
            "role": "assistant",
            "content": [
                {"type":"thinking","thinking":"Let me check.","signature":"sig-opaque"},
                {"type":"text","text":"See docs.","citations":[{"type":"char_location","cited_text":"x"}]},
                {"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls -la"}},
                {"type":"redacted_thinking","data":"opaque"}
            ],
            "stop_reason": "tool_use"
        }))
    );
}

#[tokio::test]
async fn unfinished_malformed_or_unknown_blocks_are_not_recorded_and_mark_output_partial() {
    let text = |index: u64, value: &str| {
        block_events(
            index,
            &json!({"type":"text","text":""}),
            &[json!({"type":"text_delta","text":value})],
        )
    };
    let cases = [
        // A disconnect midway through a block keeps completed blocks only.
        [
            message_start(),
            text(0, "kept"),
            event(
                "content_block_start",
                json!({"index":1,"content_block":{"type":"text","text":""}}),
            ),
            event(
                "content_block_delta",
                json!({"index":1,"delta":{"type":"text_delta","text":"lost"}}),
            ),
        ]
        .concat(),
        // Tool input that never forms valid JSON.
        [
            message_start(),
            text(0, "kept"),
            block_events(
                1,
                &json!({"type":"tool_use","id":"t","name":"Bash","input":{}}),
                &[json!({"type":"input_json_delta","partial_json":"{\"cut"})],
            ),
            stop_events(),
        ]
        .concat(),
        // A delta type the adapter cannot reconstruct.
        [
            message_start(),
            text(0, "kept"),
            block_events(
                1,
                &json!({"type":"text","text":""}),
                &[json!({"type":"future_delta","value":"?"})],
            ),
            stop_events(),
        ]
        .concat(),
    ];
    for stream in cases {
        let mut observer = new_observer("full").await;
        record_response(&mut observer, 200, "text/event-stream");
        observer.push_bytes(stream.as_bytes());
        observer.end_body();
        assert!(!captured(&observer).facts.output_complete);
        let output = finalized(&mut observer).output.unwrap();
        assert_eq!(output["content"], json!([{"type":"text","text":"kept"}]));
    }
}

#[tokio::test]
async fn retained_output_is_bounded_without_affecting_the_relay() {
    let mut observer = new_observer("full").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(message_start().as_bytes());
    observer.push_bytes(
        event(
            "content_block_start",
            json!({"index":0,"content_block":{"type":"text","text":""}}),
        )
        .as_bytes(),
    );
    // Each delta fits the per-event inspection limit; together they exceed the
    // retained-output budget.
    let chunk = "x".repeat(200 * 1024);
    for _ in 0..6 {
        observer.push_bytes(
            event(
                "content_block_delta",
                json!({"index":0,"delta":{"type":"text_delta","text":chunk}}),
            )
            .as_bytes(),
        );
    }
    observer.push_bytes(event("content_block_stop", json!({"index":0})).as_bytes());
    observer.push_bytes(stop_events().as_bytes());
    observer.end_body();
    assert!(!captured(&observer).facts.output_complete);
    let facts = finalized(&mut observer);
    assert_eq!(facts.output.unwrap()["content"], json!([]));
    assert_eq!(facts.usage_details.unwrap()["output_tokens"], json!(20));
}

#[tokio::test]
async fn finalized_facts_carry_the_anthropic_api_format_and_native_usage() {
    let mut observer = new_observer("usage").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(text_stream().as_bytes());
    let (api_format, facts) = observer.protocol.take().unwrap().into_facts();
    assert_eq!(api_format, "anthropic.messages");
    assert_eq!(
        facts.usage_details.unwrap()["cache_read_input_tokens"],
        json!(16399)
    );
    assert!(facts.output_complete);
}

/// A fake ingestion endpoint that stores the last uploaded OTLP payload.
async fn collector() -> (FakeServer, Arc<Mutex<Value>>) {
    let uploaded = Arc::new(Mutex::new(Value::Null));
    let received = uploaded.clone();
    let collector = FakeServer::start(move |request| {
        let received = received.clone();
        async move {
            let bytes = to_bytes(request.into_body(), 64 * 1024).await.unwrap();
            *received.lock().unwrap() = crate::test_support::upload_json(&bytes);
            Response::new(Body::from("{}"))
        }
    })
    .await;
    (collector, uploaded)
}

fn span_attribute(span: &Value, key: &str) -> Value {
    let attribute = span["attributes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|attribute| attribute["key"] == key)
        .unwrap_or_else(|| panic!("missing {key}"));
    serde_json::from_str(attribute["value"]["stringValue"].as_str().unwrap()).unwrap()
}

#[tokio::test]
async fn streamed_messages_upload_one_generation_with_native_usage() {
    let upstream = FakeServer::start(|_| async {
        Response::builder()
            .header("content-type", "text/event-stream")
            .header("request-id", "req_upstream")
            .body(Body::from(text_stream()))
            .unwrap()
    })
    .await;
    let (collector, uploaded) = collector().await;
    let telemetry = crate::telemetry::Telemetry::new(
        &crate::resolution::ControlPlaneConfig::new(&collector.url, "test-service-key").unwrap(),
        crate::telemetry::DEFAULT_RETAINED_BYTES,
    )
    .unwrap();
    let context =
        resolved_request_context_for(ApiFormat::AnthropicMessages, "provider-secret", "usage")
            .await;
    let provider =
        ProviderTransport::for_test(format!("{}/v1", upstream.url), ProviderLimits::default())
            .with_telemetry(telemetry.clone());
    let mut headers = HeaderMap::new();
    headers.insert(
        "x-claude-code-session-id",
        HeaderValue::from_static("session-abc"),
    );
    let forwarded = provider
        .forward_route(
            provider.try_admit().unwrap(),
            context,
            &headers,
            Bytes::from_static(REQUEST),
            Route::AnthropicMessages,
            None,
        )
        .await
        .unwrap();
    assert_eq!(
        to_bytes(forwarded.into_body(), 8192).await.unwrap(),
        text_stream()
    );
    telemetry
        .shutdown(tokio::time::Instant::now() + Duration::from_secs(2))
        .await;
    assert_eq!(collector.calls(), 1);
    let upload = uploaded.lock().unwrap();
    let span = &upload["resourceSpans"][0]["scopeSpans"][0]["spans"][0];
    assert_eq!(span["name"], "anthropic.messages");
    assert_eq!(
        span_attribute(span, "langfuse.observation.usage_details"),
        json!({
            "input_tokens": 7, "output_tokens": 445,
            "cache_creation_input_tokens": 2089, "cache_read_input_tokens": 16399,
            "cache_creation": {"ephemeral_5m_input_tokens": 2089, "ephemeral_1h_input_tokens": 0},
            "service_tier": "standard"
        })
    );
    let metadata = span_attribute(span, "langfuse.observation.metadata");
    assert_eq!(
        metadata["langfuse.gateway.request.api_format"],
        "anthropic.messages"
    );
    assert_eq!(metadata["langfuse.gateway.response.id"], "msg_1");
    assert_eq!(
        metadata["langfuse.gateway.upstream.request.id"],
        "req_upstream"
    );
    assert_eq!(metadata["agent.name"], "claude-code");
    assert_eq!(metadata["agent.session_id"], "session-abc");
    let serialized = upload.to_string();
    for canary in [
        "system-canary",
        "prompt-canary",
        "session-canary",
        "provider-secret",
    ] {
        assert!(!serialized.contains(canary), "usage mode uploaded {canary}");
    }
}

#[tokio::test]
async fn full_mode_marks_requests_it_cannot_record_as_input() {
    let at_limit = format!(
        r#"{{"model":"claude-sonnet-4-5","messages":[{{"role":"user","content":"{}"}}]}}"#,
        "x".repeat(MAX_INPUT_CAPTURE_BYTES - 128)
    );
    let over_limit = format!(
        "{at_limit}{}",
        " ".repeat(MAX_INPUT_CAPTURE_BYTES - at_limit.len() + 1)
    );
    assert!(at_limit.len() <= MAX_INPUT_CAPTURE_BYTES);
    let mut gzip = HeaderMap::new();
    gzip.insert(header::CONTENT_ENCODING, HeaderValue::from_static("gzip"));
    for (mode, headers, body, omission) in [
        ("full", HeaderMap::new(), at_limit.as_str(), None),
        (
            "full",
            HeaderMap::new(),
            over_limit.as_str(),
            Some(InputOmissionReason::SizeLimit),
        ),
        (
            "full",
            gzip.clone(),
            at_limit.as_str(),
            Some(InputOmissionReason::ContentEncoding),
        ),
        (
            "full",
            HeaderMap::new(),
            "not json",
            Some(InputOmissionReason::InvalidJson),
        ),
        ("usage", HeaderMap::new(), over_limit.as_str(), None),
    ] {
        let context =
            resolved_request_context_for(ApiFormat::AnthropicMessages, "provider-secret", mode)
                .await;
        let observer = ExecutionCapture::for_request(
            ApiFormat::AnthropicMessages,
            &context,
            &headers,
            body.as_bytes(),
        );
        let facts = &captured(&observer).facts;
        assert_eq!(
            facts.input_omission,
            omission.map(|reason| InputOmission {
                reason,
                body_bytes: body.len(),
            }),
            "{mode} {} bytes",
            body.len()
        );
        assert_eq!(facts.input.is_some(), mode == "full" && omission.is_none());
    }
}
