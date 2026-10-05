use super::*;
use crate::{
    capture::{
        ExecutionCapture, InputOmission, InputOmissionReason, MAX_INPUT_CAPTURE_BYTES,
        ProtocolCapture, ProviderFacts,
    },
    resolution::ApiFormat,
    test_support::resolved_request_context_for,
};
use axum::http::{HeaderValue, header};
use serde_json::json;

const REQUEST: &[u8] = br#"{"model":"gpt-4.1-mini","messages":[{"role":"system","content":"system-canary"},{"role":"user","content":"prompt-canary"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"type":"object"}}}],"temperature":0.2,"n":1,"max_completion_tokens":256,"stream":true,"stop":["stop-canary"],"response_format":{"type":"text"},"tool_choice":"auto","stream_options":{"include_usage":true},"metadata":{"customer":"customer-1"},"user":"legacy-user","future_field":{"kept":true}}"#;

fn captured(execution: &ExecutionCapture) -> &OpenAiChatCompletionsCapture {
    let ProtocolCapture::OpenAiChatCompletions(capture) = execution.protocol.as_ref().unwrap()
    else {
        panic!("expected the Chat Completions adapter");
    };
    capture
}

async fn new_observer(mode: &'static str) -> ExecutionCapture {
    new_observer_for(mode, REQUEST).await
}

async fn new_observer_for(mode: &'static str, request: &[u8]) -> ExecutionCapture {
    let context =
        resolved_request_context_for(ApiFormat::OpenAiChatCompletions, "provider-secret", mode)
            .await;
    ExecutionCapture::for_request(
        ApiFormat::OpenAiChatCompletions,
        &context,
        &HeaderMap::new(),
        request,
    )
}

fn record_response(observer: &mut ExecutionCapture, status: u16, content_type: &'static str) {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    headers.insert("x-request-id", HeaderValue::from_static("req_provider_1"));
    observer.record_response(status, &headers);
}

fn finalized(observer: &mut ExecutionCapture) -> (&'static str, ProviderFacts) {
    observer.protocol.take().unwrap().into_facts()
}

fn chunk(choices: Value) -> String {
    let mut value = json!({
        "id": "chatcmpl-1", "object": "chat.completion.chunk", "created": 1,
        "model": "gpt-4.1-mini-2025-04-14", "service_tier": "default",
        "system_fingerprint": "fp_1", "usage": null,
    });
    value["choices"] = choices;
    format!("data: {value}\n\n")
}

fn delta(index: u64, delta: Value, finish_reason: Value) -> String {
    let mut choice = json!({"index": index, "logprobs": null});
    choice["delta"] = delta;
    choice["finish_reason"] = finish_reason;
    chunk(Value::Array(vec![choice]))
}

const USAGE: &str = "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-4.1-mini-2025-04-14\",\"choices\":[],\"usage\":{\"prompt_tokens\":19,\"completion_tokens\":10,\"total_tokens\":29,\"prompt_tokens_details\":{\"cached_tokens\":0,\"audio_tokens\":0},\"completion_tokens_details\":{\"reasoning_tokens\":0}}}\n\n";
const DONE: &str = "data: [DONE]\n\n";

fn text_stream() -> String {
    [
        delta(
            0,
            json!({"role":"assistant","content":"","refusal":null}),
            Value::Null,
        ),
        delta(0, json!({"content":"Hel"}), Value::Null), // codespell:ignore
        delta(0, json!({"content":"lo"}), Value::Null),
        delta(0, json!({}), json!("stop")),
        USAGE.to_owned(),
        DONE.to_owned(),
    ]
    .concat()
}

#[tokio::test]
async fn streamed_text_and_tool_calls_are_rebuilt_into_native_choices() {
    let mut observer = new_observer("full").await;
    record_response(&mut observer, 200, "text/event-stream");
    let stream = [
        delta(0, json!({"role":"assistant","content":null,"refusal":null}), Value::Null),
        delta(0, json!({"content":"Checking"}), Value::Null),
        delta(
            0,
            json!({"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"lookup","arguments":""}}]}),
            Value::Null,
        ),
        delta(
            0,
            json!({"tool_calls":[{"index":0,"function":{"arguments":"{\"q\":"}}]}),
            Value::Null,
        ),
        delta(
            0,
            json!({"tool_calls":[{"index":1,"id":"call_2","type":"function","function":{"name":"lookup","arguments":"{}"}}]}),
            Value::Null,
        ),
        delta(
            0,
            json!({"tool_calls":[{"index":0,"function":{"arguments":"\"x\"}"}}]}),
            Value::Null,
        ),
        delta(0, json!({}), json!("tool_calls")),
        USAGE.to_owned(),
        DONE.to_owned(),
    ]
    .concat();
    // Arbitrary byte splits must not change the capture.
    for piece in stream.as_bytes().chunks(7) {
        observer.push_bytes(piece);
    }
    observer.end_body();
    let capture = captured(&observer);
    assert!(capture.facts.output_complete);
    assert!(capture.facts.capture_complete);
    assert_eq!(capture.facts.provider_status.as_deref(), Some("completed"));
    let (api_format, facts) = finalized(&mut observer);
    assert_eq!(api_format, "openai.chat-completions");
    assert_eq!(
        facts.output,
        Some(json!({"choices": [{
            "index": 0,
            "finish_reason": "tool_calls",
            "message": {
                "role": "assistant",
                "content": "Checking",
                "tool_calls": [
                    {"id": "call_1", "type": "function", "function": {"name": "lookup", "arguments": "{\"q\":\"x\"}"}},
                    {"id": "call_2", "type": "function", "function": {"name": "lookup", "arguments": "{}"}},
                ],
            },
        }]}))
    );
    assert_eq!(facts.provider_response_id.as_deref(), Some("chatcmpl-1"));
    assert_eq!(facts.provider_request_id.as_deref(), Some("req_provider_1"));
    assert_eq!(facts.model.as_deref(), Some("gpt-4.1-mini-2025-04-14"));
    assert_eq!(facts.requested_model.as_deref(), Some("gpt-4.1-mini"));
    assert_eq!(facts.model_parameters["service_tier"], "default");
    assert_eq!(facts.usage_details.unwrap()["total_tokens"], 29);
}

#[tokio::test]
async fn json_and_streaming_capture_equivalent_choices_and_facts() {
    const JSON: &[u8] = br#"{"id":"chatcmpl-1","object":"chat.completion","created":1,"model":"gpt-4.1-mini-2025-04-14","service_tier":"default","choices":[{"index":0,"message":{"role":"assistant","content":"Hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":19,"completion_tokens":10,"total_tokens":29,"prompt_tokens_details":{"cached_tokens":0,"audio_tokens":0},"completion_tokens_details":{"reasoning_tokens":0}}}"#;
    let mut json_observer = new_observer("full").await;
    record_response(&mut json_observer, 200, "application/json");
    json_observer.push_bytes(JSON);
    json_observer.end_body();
    assert!(json_observer.completion_start_ms.is_none());
    assert!(captured(&json_observer).facts.output_complete);

    let mut sse_observer = new_observer("full").await;
    record_response(&mut sse_observer, 200, "text/event-stream");
    sse_observer.push_bytes(text_stream().as_bytes());
    sse_observer.end_body();
    assert!(sse_observer.completion_start_ms.is_some());

    let (_, json) = finalized(&mut json_observer);
    let (_, sse) = finalized(&mut sse_observer);
    assert_eq!(
        json.output,
        Some(
            json!({"choices":[{"index":0,"message":{"role":"assistant","content":"Hello"},"finish_reason":"stop"}]})
        )
    );
    assert_eq!(sse.output, json.output);
    assert_eq!(sse.usage_details, json.usage_details);
    assert_eq!(sse.model, json.model);
    assert_eq!(sse.provider_response_id, json.provider_response_id);
    assert_eq!(sse.provider_status.as_deref(), Some("completed"));
    assert_eq!(json.provider_status.as_deref(), Some("completed"));
}

#[tokio::test]
async fn request_configuration_and_metadata_are_projected_out_of_input() {
    let mut observer = new_observer("full").await;
    let (_, facts) = finalized(&mut observer);
    assert_eq!(
        facts.input,
        Some(json!({
            "messages": [{"role":"system","content":"system-canary"},{"role":"user","content":"prompt-canary"}],
            "tools": [{"type":"function","function":{"name":"lookup","parameters":{"type":"object"}}}],
            "future_field": {"kept": true},
        }))
    );
    assert!(facts.input_complete);
    assert_eq!(
        Value::Object(facts.model_parameters),
        json!({
            "temperature": 0.2, "n": 1, "max_completion_tokens": 256, "stream": true,
            "stop": ["stop-canary"], "response_format": {"type":"text"}, "tool_choice": "auto",
            "stream_options": {"include_usage": true},
        })
    );
    assert_eq!(
        Value::Object(facts.request_metadata),
        json!({"metadata": {"customer": "customer-1"}, "user": "legacy-user"})
    );
}

#[tokio::test]
async fn usage_mode_keeps_scalars_and_usage_but_no_content() {
    let mut observer = new_observer("usage").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(text_stream().as_bytes());
    observer.end_body();
    assert!(observer.completion_start_ms.is_some());
    assert!(captured(&observer).facts.output_complete);
    let (_, facts) = finalized(&mut observer);
    assert!(facts.input.is_none());
    assert!(facts.output.is_none());
    assert!(facts.request_metadata.is_empty());
    assert_eq!(
        Value::Object(facts.model_parameters.clone()),
        json!({"temperature": 0.2, "n": 1, "max_completion_tokens": 256, "stream": true, "service_tier": "default"})
    );
    let serialized = serde_json::to_string(&facts).unwrap();
    for canary in [
        "prompt-canary",
        "system-canary",
        "stop-canary",
        "customer-1",
        "provider-secret",
    ] {
        assert!(!serialized.contains(canary), "{canary}");
    }
    assert_eq!(facts.usage_details.unwrap()["prompt_tokens"], 19);
}

#[tokio::test]
async fn completion_starts_on_generated_content_not_role_or_tool_names() {
    for (delta_fields, expected) in [
        (json!({"content":"x"}), true),
        (json!({"refusal":"no"}), true),
        (
            json!({"tool_calls":[{"index":0,"function":{"arguments":"{"}}]}),
            true,
        ),
        (json!({"function_call":{"arguments":"{"}}), true),
        (json!({"audio":{"id":"audio_1","transcript":"hi"}}), true),
        (json!({"role":"assistant","content":""}), false),
        (
            json!({"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"lookup","arguments":""}}]}),
            false,
        ),
    ] {
        let mut observer = new_observer("usage").await;
        record_response(&mut observer, 200, "text/event-stream");
        observer.push_bytes(chunk(json!([])).as_bytes());
        assert!(observer.completion_start_ms.is_none());
        observer.push_bytes(delta(0, delta_fields.clone(), Value::Null).as_bytes());
        assert_eq!(
            observer.completion_start_ms.is_some(),
            expected,
            "{delta_fields}"
        );
    }
}

#[tokio::test]
async fn finish_reasons_errors_and_missing_done_set_status_and_completeness() {
    for (reason, status) in [
        ("length", "incomplete"),
        ("content_filter", "incomplete"),
        ("stop", "completed"),
    ] {
        let mut observer = new_observer("usage").await;
        record_response(&mut observer, 200, "text/event-stream");
        observer.push_bytes(delta(0, json!({"content":"x"}), json!(reason)).as_bytes());
        observer.push_bytes(DONE.as_bytes());
        observer.end_body();
        assert_eq!(
            captured(&observer).facts.provider_status.as_deref(),
            Some(status)
        );
        assert!(captured(&observer).facts.output_complete);
    }

    // A stream that never reaches `[DONE]` keeps its facts but is not complete.
    let mut observer = new_observer("full").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(delta(0, json!({"content":"partial"}), Value::Null).as_bytes());
    observer.end_body();
    assert!(!captured(&observer).facts.output_complete);
    let (_, facts) = finalized(&mut observer);
    assert_eq!(
        facts.output.unwrap()["choices"][0]["message"]["content"],
        "partial"
    );
    assert!(facts.usage_details.is_none());

    // `[DONE]` with an unfinished choice is not a complete full-mode output.
    let mut observer = new_observer("full").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(delta(0, json!({"content":"partial"}), Value::Null).as_bytes());
    observer.push_bytes(DONE.as_bytes());
    observer.end_body();
    assert!(!captured(&observer).facts.output_complete);

    for (mode, expected) in [
        ("full", Some("server_error: prompt-canary echoed")),
        ("usage", None),
    ] {
        let mut observer = new_observer(mode).await;
        record_response(&mut observer, 200, "text/event-stream");
        observer.push_bytes(delta(0, json!({"content":"x"}), json!("stop")).as_bytes());
        observer.push_bytes(
            b"data: {\"error\":{\"message\":\"prompt-canary echoed\",\"type\":\"server_error\",\"code\":\"server_error\"}}\n\n",
        );
        observer.end_body();
        let facts = &captured(&observer).facts;
        assert_eq!(facts.provider_status.as_deref(), Some("failed"));
        assert_eq!(facts.error_message.as_deref(), expected);

        let mut observer = new_observer(mode).await;
        record_response(&mut observer, 429, "application/json");
        observer.push_bytes(br#"{"error":{"message":"prompt-canary echoed","type":"requests","code":"rate_limit_exceeded"}}"#);
        observer.end_body();
        let facts = &captured(&observer).facts;
        assert_eq!(facts.provider_status.as_deref(), Some("failed"));
        assert!(!facts.output_complete);
        assert_eq!(
            facts.error_message.is_some(),
            mode == "full",
            "{:?}",
            facts.error_message
        );
    }
}

#[tokio::test]
async fn multiple_choices_merge_independently_and_a_gap_drops_only_its_choice() {
    let mut observer = new_observer("full").await;
    record_response(&mut observer, 200, "text/event-stream");
    observer.push_bytes(
        chunk(json!([
            {"index":0,"delta":{"role":"assistant","content":"A"},"finish_reason":null},
            {"index":1,"delta":{"role":"assistant","content":"B"},"finish_reason":null},
        ]))
        .as_bytes(),
    );
    // Fragments past the retained-output budget cannot be recorded exactly.
    let fragment = "x".repeat(MAX_OUTPUT_CAPTURE_BYTES * 2 / 5);
    for _ in 0..3 {
        observer.push_bytes(delta(1, json!({ "content": fragment }), Value::Null).as_bytes());
    }
    observer.push_bytes(delta(1, json!({"content":"!"}), json!("stop")).as_bytes());
    observer.push_bytes(delta(0, json!({"content":"a"}), json!("stop")).as_bytes());
    observer.push_bytes(DONE.as_bytes());
    observer.end_body();
    assert!(!captured(&observer).facts.output_complete);
    let (_, facts) = finalized(&mut observer);
    assert_eq!(
        facts.output,
        Some(json!({"choices":[{
            "index":0,"finish_reason":"stop",
            "message":{"role":"assistant","content":"Aa"},
        }]}))
    );
}

#[tokio::test]
async fn oversized_encoded_and_invalid_requests_explain_the_missing_input() {
    let mut large = br#"{"model":"gpt-4.1-mini","messages":[{"role":"user","content":""#.to_vec();
    large.resize(MAX_INPUT_CAPTURE_BYTES + 1 - br#""}]}"#.len(), b'x');
    large.extend_from_slice(br#""}]}"#);
    let mut observer = new_observer_for("full", &large).await;
    let (_, facts) = finalized(&mut observer);
    assert_eq!(
        facts.input_omission,
        Some(InputOmission {
            reason: InputOmissionReason::SizeLimit,
            body_bytes: MAX_INPUT_CAPTURE_BYTES + 1,
        })
    );
    assert!(facts.input.is_none());
    assert!(facts.requested_model.is_none());

    let mut observer = new_observer_for("full", b"not json").await;
    let (_, facts) = finalized(&mut observer);
    assert_eq!(
        facts.input_omission.map(|omission| omission.reason),
        Some(InputOmissionReason::InvalidJson)
    );

    let mut observer = new_observer_for("usage", b"not json").await;
    assert!(finalized(&mut observer).1.input_omission.is_none());
}
