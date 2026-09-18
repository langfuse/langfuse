use super::*;
use crate::capture::{ExecutionCapture, ProtocolCapture, RelayOutcome};
use crate::{
    providers::openai::{OpenAiProvider, ProviderLimits},
    test_support::{FakeServer, resolved_request_context_with_mode},
};
use axum::{
    body::{Body, Bytes, to_bytes},
    http::{HeaderValue, Response},
};
use serde_json::json;
use std::{
    convert::Infallible,
    future::pending,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::Notify;

fn captured(execution: &ExecutionCapture) -> &OpenAiResponsesCapture {
    let ProtocolCapture::OpenAiResponses(capture) = execution.protocol.as_ref().unwrap();
    capture
}

async fn observer(mode: &'static str) -> ExecutionCapture {
    let context = resolved_request_context_with_mode("provider-secret", mode).await;
    ExecutionCapture::for_openai_responses(&context, &HeaderMap::new(), br#"{"model":"requested","instructions":"prompt-canary","input":[{"role":"user","content":"hello"}],"tools":[{"type":"function","name":"weather","parameters":{"type":"object"}}],"text":{"format":{"type":"json_schema","schema":{"description":"schema-canary"}}},"service_tier":"auto","metadata":{"label":"request-metadata-canary"},"safety_identifier":"safety-id-canary","prompt_cache_key":"cache-id-canary","user":"user-id-canary"}"#)
}

fn record_response(observer: &mut ExecutionCapture, content_type: &'static str) {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    headers.insert(
        "x-request-id",
        HeaderValue::from_static("provider-request-1"),
    );
    observer.record_response(200, &headers);
}

fn event(kind: &str, fields: Value) -> String {
    let mut value = fields;
    value["type"] = kind.into();
    format!("event: {kind}\ndata: {value}\n\n")
}

fn completed_item(index: u64, text: &str) -> String {
    event(
        "response.output_item.done",
        json!({"output_index":index,"item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":text}],"future":{"preserved":true}}}),
    )
}

fn terminal(status: &str, count: usize) -> String {
    event(
        &format!("response.{status}"),
        json!({"response":{"id":"resp-1","model":"actual","status":status,"service_tier":"priority","usage":{"input_tokens":100,"output_tokens":30,"total_tokens":130,"input_tokens_details":{"cached_tokens":40},"output_tokens_details":{"reasoning_tokens":10}},"output":vec![json!({"text":"terminal-output-must-not-be-copied"});count]}}),
    )
}

#[tokio::test]
async fn captures_completed_items_only_in_order_without_duplication() {
    let mut observer = observer("full").await;
    record_response(&mut observer, "text/event-stream; charset=utf-8");
    let body = format!(
        ": ping\n\n{}{}{}{}{}",
        event(
            "response.output_text.delta",
            json!({"delta":"unfinished-canary"})
        ),
        completed_item(1, "second"),
        completed_item(0, "héllo 🌍"),
        completed_item(0, "héllo 🌍"),
        terminal("completed", 2)
    );
    for byte in body.as_bytes() {
        observer.push_bytes(&[*byte]);
    }
    observer.end_body();
    let capture = captured(&observer);
    assert_eq!(capture.items.len(), 2);
    assert_eq!(capture.items[&0]["content"][0]["text"], "héllo 🌍");
    assert_eq!(capture.items[&1]["content"][0]["text"], "second");
    assert_eq!(capture.items[&0]["future"]["preserved"], true);
    assert_eq!(capture.facts.model.as_deref(), Some("actual"));
    assert_eq!(capture.facts.model_parameters["service_tier"], "priority");
    assert_eq!(
        capture.facts.usage_details.as_ref().unwrap()["input_tokens_details"]["cached_tokens"],
        40
    );
    assert_eq!(
        capture.facts.input.as_ref().unwrap()["instructions"],
        "prompt-canary"
    );
    assert!(capture.facts.output_complete);
    let stored = json!({"record":capture.facts,"items":capture.items}).to_string();
    assert!(!stored.contains("unfinished-canary"));
    assert!(!stored.contains("terminal-output-must-not-be-copied"));
    let (_, facts) = observer.protocol.take().unwrap().into_facts();
    let output = facts.output.unwrap();
    assert_eq!(output[0]["content"][0]["text"], "héllo 🌍");
    assert_eq!(output[1]["content"][0]["text"], "second");
}

#[tokio::test]
async fn eof_and_item_completion_are_not_provider_completion() {
    let mut observer = observer("full").await;
    record_response(&mut observer, "text/event-stream");
    observer.push_bytes(completed_item(0, "completed item").as_bytes());
    observer
        .push_bytes(event("response.output_text.delta", json!({"delta":"unfinished"})).as_bytes());
    observer.end_body();
    let capture = captured(&observer);
    assert_eq!(capture.items.len(), 1);
    assert!(!capture.facts.output_complete);
    assert!(capture.facts.usage_details.is_none());
    assert!(capture.facts.provider_status.is_none());
}

#[tokio::test]
async fn failed_and_incomplete_responses_keep_usage_and_native_status() {
    for status in ["failed", "incomplete"] {
        let mut observer = observer("full").await;
        record_response(&mut observer, "text/event-stream");
        observer.push_bytes(terminal(status, 0).as_bytes());
        observer.end_body();
        let capture = captured(&observer);
        assert_eq!(capture.facts.provider_status.as_deref(), Some(status));
        assert_eq!(
            capture.facts.usage_details.as_ref().unwrap()["total_tokens"],
            130
        );
        assert!(capture.facts.output_complete);
    }
}

#[tokio::test]
async fn json_and_streaming_capture_equivalent_native_items_and_facts() {
    let item = json!({"type":"function_call","id":"item-1","call_id":"call-1","name":"weather","arguments":"{\"city\":\"Berlin\"}"});
    let mut json_observer = observer("full").await;
    record_response(&mut json_observer, "application/json");
    let body = json!({"id":"resp-1","model":"actual","status":"completed","output":[item.clone()],"usage":{"input_tokens":5,"output_tokens":2,"total_tokens":7}}).to_string();
    for chunk in body.as_bytes().chunks(3) {
        json_observer.push_bytes(chunk);
    }
    json_observer.end_body();
    let captured = captured(&json_observer);
    assert_eq!(captured.items[&0], item);
    assert!(captured.facts.output_complete);
    assert_eq!(
        captured.facts.usage_details.as_ref().unwrap()["total_tokens"],
        7
    );
}

#[tokio::test]
async fn usage_mode_excludes_content_and_context_credentials() {
    let mut observer = observer("usage").await;
    record_response(&mut observer, "text/event-stream");
    observer.push_bytes(completed_item(0, "output-canary").as_bytes());
    observer.push_bytes(terminal("completed", 1).as_bytes());
    observer.end_body();
    let capture = captured(&observer);
    assert!(capture.facts.input.is_none());
    assert!(capture.items.is_empty());
    assert!(capture.facts.usage_details.is_some());
    let text = json!(capture.facts).to_string();
    for secret in [
        "prompt-canary",
        "schema-canary",
        "request-metadata-canary",
        "safety-id-canary",
        "cache-id-canary",
        "user-id-canary",
        "output-canary",
        "provider-secret",
        "private-ingestion-token",
        "gateway-secret",
    ] {
        assert!(!text.contains(secret), "leaked {secret}");
    }
}

#[tokio::test]
async fn request_configuration_is_projected_out_of_input() {
    let request = json!({
        "model": "requested", "input": "hello", "instructions": "be brief",
        "tools": [{"type": "function", "name": "weather"}],
        "previous_response_id": "resp-previous", "future_field": {"keep": true},
        "temperature": 0.5, "stream": true, "parallel_tool_calls": false,
        "reasoning": {"effort": "high"}, "text": {"format": {"type": "json_object"}},
        "stream_options": {"include_obfuscation": false},
        "metadata": {"purpose": "test"}, "prompt_cache_key": "cache-key"
    });
    let capture = OpenAiResponsesCapture::new(
        &HeaderMap::new(),
        request.to_string().as_bytes(),
        IngestionMode::Full,
    )
    .into_facts();
    assert_eq!(
        capture.input.unwrap(),
        json!({
            "input": "hello", "instructions": "be brief",
            "tools": [{"type": "function", "name": "weather"}],
            "previous_response_id": "resp-previous", "future_field": {"keep": true}
        })
    );
    assert_eq!(capture.model_parameters["stream"], true);
    assert_eq!(capture.model_parameters["parallel_tool_calls"], false);
    assert_eq!(capture.model_parameters["reasoning"], request["reasoning"]);
    assert_eq!(capture.model_parameters["text"], request["text"]);
    assert_eq!(
        capture.model_parameters["stream_options"],
        request["stream_options"]
    );
    assert_eq!(capture.request_metadata["metadata"], request["metadata"]);
    assert_eq!(capture.request_metadata["prompt_cache_key"], "cache-key");
}

#[tokio::test]
async fn agent_client_metadata_is_projected_out_of_input_in_both_modes() {
    let codex = json!({
        "model": "requested", "input": "hello", "future_field": {"keep": true},
        "client_metadata": {
            "thread_id": "thread-1", "turn_id": "turn-1",
            "x-codex-installation-id": "install-1",
            "x-codex-turn-metadata": "{\"thread_id\":\"thread-1\",\"turn_id\":\"turn-1\",\"agent_name\":\"/root\"}"
        }
    });
    for mode in [IngestionMode::Full, IngestionMode::Usage] {
        let capture =
            OpenAiResponsesCapture::new(&HeaderMap::new(), codex.to_string().as_bytes(), mode);
        assert_eq!(
            capture.client_metadata().unwrap()["x-codex-installation-id"],
            "install-1"
        );
        let facts = capture.into_facts();
        if mode == IngestionMode::Full {
            assert_eq!(
                facts.input.unwrap(),
                json!({"input": "hello", "future_field": {"keep": true}})
            );
        } else {
            assert!(facts.input.is_none());
        }
    }

    let unknown = json!({
        "model": "requested", "input": "hello",
        "client_metadata": {"team": "search"}
    });
    let capture = OpenAiResponsesCapture::new(
        &HeaderMap::new(),
        unknown.to_string().as_bytes(),
        IngestionMode::Full,
    );
    assert!(capture.client_metadata().is_none());
    assert_eq!(
        capture.into_facts().input.unwrap(),
        json!({"input": "hello", "client_metadata": {"team": "search"}})
    );
}

#[tokio::test]
async fn completion_time_requires_sse_generated_content_in_either_ingestion_mode() {
    for mode in ["full", "usage"] {
        for (kind, field) in [
            ("response.output_text.delta", "delta"),
            ("response.function_call_arguments.delta", "delta"),
            ("response.reasoning_summary_text.delta", "delta"),
            ("response.custom_tool_call_input.delta", "delta"),
            ("response.audio.delta", "delta"),
            ("response.audio.transcript.delta", "delta"),
            ("response.shell_call_command.delta", "delta"),
            (
                "response.image_generation_call.partial_image",
                "partial_image_b64",
            ),
        ] {
            let mut observer = observer(mode).await;
            record_response(&mut observer, "text/event-stream; charset=utf-8");
            observer.push_bytes(b": keepalive\n\n");
            observer.push_bytes(
                event(
                    "response.created",
                    json!({"response":{"status":"in_progress"}}),
                )
                .as_bytes(),
            );
            observer.push_bytes(event(kind, json!({field:""})).as_bytes());
            assert!(observer.first_byte_ms.is_some());
            assert!(observer.completion_start_ms.is_none());
            let delta = event(kind, json!({field:"hello"}));
            let split = delta.len() - 1;
            observer.push_bytes(&delta.as_bytes()[..split]);
            assert!(observer.completion_start_ms.is_none());
            observer.push_bytes(&delta.as_bytes()[split..]);
            let first = observer.completion_start_ms.unwrap();
            observer.push_bytes(event(kind, json!({field:"later"})).as_bytes());
            assert_eq!(observer.completion_start_ms, Some(first));
        }
        // The upstream content type controls timing even if the request asks to stream.
        let context = resolved_request_context_with_mode("provider-secret", mode).await;
        let mut observer = ExecutionCapture::for_openai_responses(
            &context,
            &HeaderMap::new(),
            br#"{"stream":true,"input":"hello"}"#,
        );
        record_response(&mut observer, "application/json; charset=utf-8");
        observer.push_bytes(br#"{"output":[],"status":"completed"}"#);
        observer.end_body();
        assert!(observer.first_byte_ms.is_some());
        assert!(observer.completion_start_ms.is_none());
    }
}

#[tokio::test]
async fn provider_error_details_are_bounded_and_full_mode_only() {
    for mode in ["full", "usage"] {
        for streaming in [false, true] {
            let mut observer = observer(mode).await;
            record_response(
                &mut observer,
                if streaming {
                    "text/event-stream"
                } else {
                    "application/json"
                },
            );
            let error = json!({"code":"rate_limit_exceeded","message":"é".repeat(MAX_FACT_STRING)});
            let body = if streaming {
                event("error", error)
            } else {
                json!({"error":error}).to_string()
            };
            observer.push_bytes(body.as_bytes());
            observer.end_body();
            let facts = &captured(&observer).facts;
            if mode == "full" {
                let message = facts.error_message.as_ref().unwrap();
                assert!(message.starts_with("rate_limit_exceeded: é"));
                assert!(message.len() <= MAX_FACT_STRING);
            } else {
                assert!(facts.error_message.is_none());
            }
        }
    }
}

#[tokio::test]
async fn oversized_and_malformed_events_do_not_prevent_later_facts() {
    let mut observer = observer("full").await;
    record_response(&mut observer, "text/event-stream");
    observer.push_bytes(b"data: malformed\n\n");
    observer.push_bytes(format!("data: {}\n\n", "x".repeat(MAX_CAPTURE_BYTES + 1)).as_bytes());
    observer.push_bytes(terminal("completed", 0).as_bytes());
    observer.end_body();
    let capture = captured(&observer);
    assert!(!capture.facts.capture_complete);
    assert!(!capture.facts.output_complete);
    assert_eq!(capture.facts.provider_status.as_deref(), Some("completed"));
    assert_eq!(
        capture.facts.usage_details.as_ref().unwrap()["total_tokens"],
        130
    );
}

#[tokio::test]
async fn capture_limits_and_encoded_bodies_are_explicit() {
    let mut observer = observer("full").await;
    record_response(&mut observer, "text/event-stream");
    for index in 0..=MAX_ITEMS {
        observer.push_bytes(completed_item(index as u64, "x").as_bytes());
    }
    assert_eq!(captured(&observer).items.len(), MAX_ITEMS);
    assert!(!captured(&observer).facts.capture_complete);
    let mut encoded = observer;
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    headers.insert(header::CONTENT_ENCODING, HeaderValue::from_static("gzip"));
    encoded.record_response(200, &headers);
    encoded.push_bytes(b"opaque compressed bytes");
    encoded.end_body();
    assert!(matches!(captured(&encoded).body, ResponseBody::Unavailable));
    assert!(!captured(&encoded).facts.output_complete);
}

#[test]
fn sse_handles_crlf_multiline_data_and_truncated_eof() {
    let mut decoder = SseDecoder::default();
    let mut events = Vec::new();
    for byte in b": ping\r\nevent: anything\r\ndata: {\r\ndata: \"ok\": true}\r\n\r\n" {
        decoder.push(&[*byte], 1024, |event| events.push(event.to_vec()));
    }
    assert_eq!(events, vec![b"{\n\"ok\": true}".to_vec()]);
    assert!(decoder.finish());
    decoder.push(b"data: {\"unfinished\":true}", 1024, |_| {
        panic!("must wait for delimiter")
    });
    assert!(!decoder.finish());
}

#[derive(Clone, Default)]
struct LogWriter(Arc<Mutex<Vec<u8>>>);
impl std::io::Write for LogWriter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for LogWriter {
    type Writer = Self;
    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}

#[tokio::test]
async fn debug_record_is_emitted_once_and_only_at_debug_level() {
    for level in [tracing::Level::DEBUG, tracing::Level::INFO] {
        let mut observer = observer("full").await;
        record_response(&mut observer, "text/event-stream");
        observer.push_bytes(completed_item(0, "output-canary").as_bytes());
        observer.push_bytes(terminal("completed", 1).as_bytes());
        observer.end_body();
        observer.metadata["key_metadata"] = json!({"secret": "metadata-canary"});
        let ProtocolCapture::OpenAiResponses(capture) = observer.protocol.as_mut().unwrap();
        capture
            .facts
            .model_parameters
            .insert("user".into(), json!("parameter-canary"));
        let writer = LogWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .with_max_level(level)
            .with_writer(writer.clone())
            .finish();
        tracing::subscriber::with_default(subscriber, || {
            observer.finish(RelayOutcome::Eof);
            observer.finish(RelayOutcome::Cancelled);
            drop(observer);
        });
        let text = String::from_utf8(writer.0.lock().unwrap().clone()).unwrap();
        if level == tracing::Level::DEBUG {
            let events = records(&writer);
            assert_eq!(events.len(), 1);
            let capture = &events[0];
            assert_eq!(capture["outcome"], "eof");
            assert_eq!(capture["capture_complete"], true);
            for excluded in ["input", "output", "model_parameters", "metadata"] {
                assert!(capture.get(excluded).is_none());
            }
            for secret in [
                "prompt-canary",
                "schema-canary",
                "output-canary",
                "metadata-canary",
                "parameter-canary",
                "provider-secret",
                "private-ingestion-token",
                "gateway-secret",
            ] {
                assert!(!text.contains(secret), "operational logs leaked {secret}");
            }
        } else {
            assert!(records(&writer).is_empty());
        }
    }
}

fn records(writer: &LogWriter) -> Vec<Value> {
    String::from_utf8(writer.0.lock().unwrap().clone())
        .unwrap()
        .lines()
        .filter_map(|line| {
            let event: Value = serde_json::from_str(line).unwrap();
            (event["fields"]["message"] == "gateway response captured")
                .then(|| event["fields"].clone())
        })
        .collect()
}

#[tokio::test]
async fn upstream_read_timeout_is_logged_as_timeout() {
    let upstream = FakeServer::start(|_| async {
        Response::builder()
            .header("content-type", "text/event-stream")
            .body(Body::from_stream(futures_util::stream::pending::<
                Result<Bytes, Infallible>,
            >()))
            .unwrap()
    })
    .await;
    let context = resolved_request_context_with_mode("provider-secret", "full").await;
    let provider = OpenAiProvider::for_test(
        format!("{}/v1", upstream.url),
        ProviderLimits {
            active: 1,
            read_timeout: Duration::from_millis(50),
            ..ProviderLimits::default()
        },
    );
    let writer = LogWriter::default();
    let subscriber = tracing_subscriber::fmt()
        .json()
        .with_max_level(tracing::Level::DEBUG)
        .with_writer(writer.clone())
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);
    let response = provider
        .forward(
            provider.try_admit().unwrap(),
            context,
            &HeaderMap::new(),
            Bytes::from_static(b"{}"),
        )
        .await
        .unwrap();
    assert!(to_bytes(response.into_body(), 4096).await.is_err());
    let records = records(&writer);
    assert_eq!(records.len(), 1);
    assert_eq!(records[0]["outcome"], "timeout");
    assert!(provider.try_admit().is_ok());
}

#[tokio::test]
async fn native_http_relay_logs_once_on_eof_drop_and_unpolled_deadline() {
    for outcome in [
        RelayOutcome::Eof,
        RelayOutcome::Cancelled,
        RelayOutcome::Timeout,
    ] {
        let native = format!(
            "{}{}",
            completed_item(0, "native-result"),
            terminal("completed", 1)
        );
        let expected = native.clone();
        let upstream = FakeServer::start(move |_| {
            let native = native.clone();
            async move {
                Response::builder()
                    .header("content-type", "text/event-stream")
                    .body(Body::from(native))
                    .unwrap()
            }
        })
        .await;
        let context = resolved_request_context_with_mode("provider-secret", "full").await;
        let provider = OpenAiProvider::for_test(
            format!("{}/v1", upstream.url),
            ProviderLimits {
                active: 1,
                execution_timeout: Duration::from_secs(1),
                ..ProviderLimits::default()
            },
        );
        let writer = LogWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .with_max_level(tracing::Level::DEBUG)
            .with_writer(writer.clone())
            .finish();
        let _guard = tracing::subscriber::set_default(subscriber);
        let response = provider
            .forward(
                provider.try_admit().unwrap(),
                context,
                &HeaderMap::new(),
                Bytes::from_static(br#"{"input":"request-content"}"#),
            )
            .await
            .unwrap();
        match outcome {
            RelayOutcome::Eof => assert_eq!(
                to_bytes(response.into_body(), 4096).await.unwrap(),
                expected
            ),
            RelayOutcome::Cancelled => drop(response),
            RelayOutcome::Timeout => {
                tokio::time::sleep(Duration::from_millis(1100)).await;
                assert!(provider.try_admit().is_ok());
                drop(response);
            }
            RelayOutcome::TransportError => unreachable!(),
        }
        tokio::task::yield_now().await;
        let records = records(&writer);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0]["outcome"], json!(outcome));
        if outcome == RelayOutcome::Eof {
            assert_eq!(records[0]["output_complete"], true);
            assert!(records[0]["first_byte_ms"].is_number());
        }
        assert!(provider.try_admit().is_ok());
        assert_eq!(upstream.calls(), 1);
    }
}

#[tokio::test]
async fn provider_future_finalizes_on_timeout_and_cancellation_before_headers() {
    for cancel in [false, true] {
        let started = Arc::new(Notify::new());
        let signal = started.clone();
        let upstream = FakeServer::start(move |_| {
            let signal = signal.clone();
            async move {
                signal.notify_one();
                pending::<Response<Body>>().await
            }
        })
        .await;
        let context = resolved_request_context_with_mode("provider-secret", "full").await;
        let provider = OpenAiProvider::for_test(
            format!("{}/v1", upstream.url),
            ProviderLimits {
                active: 1,
                headers_timeout: Duration::from_millis(100),
                ..ProviderLimits::default()
            },
        );
        let writer = LogWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .with_max_level(tracing::Level::DEBUG)
            .with_writer(writer.clone())
            .finish();
        let _guard = tracing::subscriber::set_default(subscriber);
        let headers = HeaderMap::new();
        let call = provider.forward(
            provider.try_admit().unwrap(),
            context,
            &headers,
            Bytes::from_static(b"{}"),
        );
        if cancel {
            tokio::select! {
                _ = call => panic!("provider must still be waiting"),
                () = started.notified() => {},
            }
        } else {
            assert!(matches!(
                call.await,
                Err(crate::transport::ProviderError::Timeout)
            ));
        }
        let records = records(&writer);
        assert_eq!(records.len(), 1);
        assert_eq!(
            records[0]["outcome"],
            if cancel { "cancelled" } else { "timeout" }
        );
        assert!(records[0]["http_status"].is_null());
        assert!(provider.try_admit().is_ok());
    }
}

fn uploaded_attribute(upload: &Value, key: &str) -> Value {
    let attributes = upload["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"]
        .as_array()
        .unwrap();
    let attribute = attributes
        .iter()
        .find(|attribute| attribute["key"] == key)
        .unwrap();
    serde_json::from_str(attribute["value"]["stringValue"].as_str().unwrap()).unwrap()
}

#[tokio::test]
async fn client_compression_preferences_do_not_disable_capture() {
    for streaming in [false, true] {
        let native = if streaming {
            format!(
                "{}{}",
                completed_item(0, "captured output"),
                terminal("completed", 1)
            )
        } else {
            json!({"id":"resp-1","status":"completed","model":"actual","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"captured output"}]}],"usage":{"input_tokens":10,"output_tokens":21,"total_tokens":31}}).to_string()
        };
        let expected = native.clone();
        let upstream = FakeServer::start(move |request| {
            let native = native.clone();
            async move {
                assert_eq!(request.headers()[header::ACCEPT_ENCODING], "identity");
                Response::builder()
                    .header(
                        "content-type",
                        if streaming {
                            "text/event-stream"
                        } else {
                            "application/json"
                        },
                    )
                    .body(Body::from(native))
                    .unwrap()
            }
        })
        .await;
        let uploaded = Arc::new(Mutex::new(Value::Null));
        let received = uploaded.clone();
        let collector = FakeServer::start(move |request| {
            let received = received.clone();
            async move {
                let bytes = to_bytes(request.into_body(), 64 * 1024).await.unwrap();
                *received.lock().unwrap() = serde_json::from_slice(&bytes).unwrap();
                Response::new(Body::from("{}"))
            }
        })
        .await;
        let telemetry = crate::telemetry::Telemetry::new(
            &crate::resolution::ControlPlaneConfig::new(&collector.url, "test-service-key")
                .unwrap(),
        )
        .unwrap();
        let context = resolved_request_context_with_mode("provider-secret", "full").await;
        let provider =
            OpenAiProvider::for_test(format!("{}/v1", upstream.url), ProviderLimits::default())
                .with_telemetry(telemetry.clone());
        let mut headers = HeaderMap::new();
        headers.insert(
            header::ACCEPT_ENCODING,
            HeaderValue::from_static("gzip, deflate, br"),
        );
        let forwarded = provider
            .forward(
                provider.try_admit().unwrap(),
                context,
                &headers,
                Bytes::from(json!({"input":"hello","stream":streaming}).to_string()),
            )
            .await
            .unwrap();
        assert_eq!(
            to_bytes(forwarded.into_body(), 4096).await.unwrap(),
            expected
        );
        telemetry
            .shutdown(tokio::time::Instant::now() + Duration::from_secs(2))
            .await;
        assert_eq!(collector.calls(), 1);
        let upload = uploaded.lock().unwrap();
        let metadata = uploaded_attribute(&upload, "langfuse.observation.metadata");
        assert!(metadata.get("capture_complete").is_none());
        assert!(metadata.get("output_complete").is_none());
        assert!(metadata.get("provider_status").is_none());
        assert!(metadata.get("native_usage").is_none());
        assert_eq!(metadata["langfuse.gateway.provider.response.id"], "resp-1");
        assert!(
            uploaded_attribute(&upload, "langfuse.observation.usage_details")["input_tokens"]
                .is_number()
        );
        assert_eq!(
            uploaded_attribute(&upload, "langfuse.observation.output")[0]["content"][0]["text"],
            "captured output"
        );
    }
}

#[tokio::test]
async fn codex_body_metadata_reaches_the_generation_without_agent_headers() {
    let upstream = FakeServer::start(|_| async move {
        Response::builder()
            .header("content-type", "application/json")
            .body(Body::from(
                json!({"id":"resp-1","status":"completed","model":"actual","output":[],"usage":{"input_tokens":10,"output_tokens":21,"total_tokens":31}}).to_string(),
            ))
            .unwrap()
    })
    .await;
    let uploaded = Arc::new(Mutex::new(Value::Null));
    let received = uploaded.clone();
    let collector = FakeServer::start(move |request| {
        let received = received.clone();
        async move {
            let bytes = to_bytes(request.into_body(), 64 * 1024).await.unwrap();
            *received.lock().unwrap() = serde_json::from_slice(&bytes).unwrap();
            Response::new(Body::from("{}"))
        }
    })
    .await;
    let telemetry = crate::telemetry::Telemetry::new(
        &crate::resolution::ControlPlaneConfig::new(&collector.url, "test-service-key").unwrap(),
    )
    .unwrap();
    let context = resolved_request_context_with_mode("provider-secret", "full").await;
    let provider =
        OpenAiProvider::for_test(format!("{}/v1", upstream.url), ProviderLimits::default())
            .with_telemetry(telemetry.clone());
    let turn_metadata = json!({
        "installation_id": "install-1", "session_id": "routing-session",
        "thread_id": "thread-1", "agent_name": "/root", "turn_id": "turn-1",
        "request_kind": "turn", "root_turn_id": "turn-1", "sandbox_mode": "workspace-write",
        "tool_namespaces_info": {"functions": {"name": "functions", "functions": {}}}
    });
    let body = json!({
        "model": "requested", "input": "hello",
        "client_metadata": {
            "session_id": "routing-session", "thread_id": "thread-1", "turn_id": "turn-1",
            "x-codex-installation-id": "install-1", "x-codex-window-id": "thread-1:1",
            "x-codex-turn-metadata": turn_metadata.to_string()
        }
    });
    let forwarded = provider
        .forward(
            provider.try_admit().unwrap(),
            context,
            &HeaderMap::new(),
            Bytes::from(body.to_string()),
        )
        .await
        .unwrap();
    to_bytes(forwarded.into_body(), 4096).await.unwrap();
    telemetry
        .shutdown(tokio::time::Instant::now() + Duration::from_secs(2))
        .await;
    assert_eq!(collector.calls(), 1);
    let upload = uploaded.lock().unwrap();
    let attributes = upload["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"]
        .as_array()
        .unwrap();
    let attribute = |key: &str| {
        attributes
            .iter()
            .find(|attribute| attribute["key"] == key)
            .map(|attribute| attribute["value"]["stringValue"].clone())
    };
    assert_eq!(attribute("session.id").unwrap(), "codex:thread-1");
    assert_eq!(attribute("langfuse.trace.name").unwrap(), "codex");
    assert!(attribute("user.id").is_none());
    let metadata = uploaded_attribute(&upload, "langfuse.observation.metadata");
    assert_eq!(metadata["agent.name"], "codex");
    assert_eq!(metadata["agent.id"], "/root");
    assert_eq!(metadata["agent.installation_id"], "install-1");
    assert_eq!(metadata["agent.root_turn_id"], "turn-1");
    assert_eq!(metadata["agent.window_id"], "thread-1:1");
    assert_eq!(metadata["agent.request_kind"], "turn");
    assert_eq!(metadata["agent.sandbox_mode"], "workspace-write");
    assert!(metadata.get("agent.tool_namespaces_info").is_none());
    assert_eq!(metadata["langfuse.gateway.provider.response.id"], "resp-1");
    assert_eq!(
        uploaded_attribute(&upload, "langfuse.observation.input"),
        json!({"input": "hello"})
    );
}

#[tokio::test]
async fn capture_regression_large_request_does_not_invalidate_output() {
    let context = resolved_request_context_with_mode("provider-secret", "full").await;
    let request = json!({"input": "x".repeat(MAX_CAPTURE_BYTES)}).to_string();
    for streaming in [false, true] {
        let mut observer =
            ExecutionCapture::for_openai_responses(&context, &HeaderMap::new(), request.as_bytes());
        record_response(
            &mut observer,
            if streaming {
                "text/event-stream"
            } else {
                "application/json"
            },
        );
        let body = if streaming {
            terminal("completed", 0)
        } else {
            json!({"status":"completed","output":[]}).to_string()
        };
        observer.push_bytes(body.as_bytes());
        observer.end_body();
        let facts = &captured(&observer).facts;
        assert!(!facts.input_complete);
        assert!(
            facts.output_complete,
            "response capture must be independent of request size"
        );
    }
}

#[tokio::test]
async fn capture_regression_preserves_native_request_and_usage() {
    let usage = json!({"input_tokens":5,"output_tokens":2,"input_tokens_details":{"cached_tokens":3,"future_tokens":1},"future_usage_field":{"region":"eu"}});
    for mode in ["full", "usage"] {
        let context = resolved_request_context_with_mode("provider-secret", mode).await;
        for input in [
            json!("hello"),
            json!([{"type":"function_call_output","call_id":"call-1","output":"native result"}]),
        ] {
            let request = json!({"model":"requested","input":input,"instructions":"be brief","future_request_field":{"enabled":true}});
            for streaming in [false, true] {
                let mut execution = ExecutionCapture::for_openai_responses(
                    &context,
                    &HeaderMap::new(),
                    request.to_string().as_bytes(),
                );
                record_response(
                    &mut execution,
                    if streaming {
                        "text/event-stream"
                    } else {
                        "application/json"
                    },
                );
                let native = json!({"output":[],"usage":usage,"status":"completed"});
                let body = if streaming {
                    event("response.completed", json!({"response":native}))
                } else {
                    native.to_string()
                };
                execution.push_bytes(body.as_bytes());
                execution.end_body();
                let facts = &captured(&execution).facts;
                let mut expected_input = request.clone();
                expected_input.as_object_mut().unwrap().remove("model");
                assert_eq!(
                    facts.input.as_ref(),
                    if mode == "full" {
                        Some(&expected_input)
                    } else {
                        None
                    }
                );
                assert_eq!(facts.usage_details.as_ref(), Some(&usage));
                assert!(facts.capture_complete);
            }
        }
    }
}

#[tokio::test]
async fn downstream_cancellation_does_not_erase_completed_capture() {
    for (streaming, upstream_eof, mode) in [
        (false, true, "full"),
        (true, true, "full"),
        (true, false, "full"),
        (true, false, "usage"),
    ] {
        let mut execution = observer(mode).await;
        record_response(
            &mut execution,
            if streaming {
                "text/event-stream"
            } else {
                "application/json"
            },
        );
        let body = if streaming {
            format!("{}{}", completed_item(0, "hello"), terminal("completed", 1))
        } else {
            json!({"status":"completed","output":[]}).to_string()
        };
        execution.push_bytes(body.as_bytes());
        if upstream_eof {
            execution.end_body();
        }
        let writer = LogWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .with_max_level(tracing::Level::DEBUG)
            .with_writer(writer.clone())
            .finish();
        tracing::subscriber::with_default(subscriber, || execution.finish(RelayOutcome::Cancelled));
        let facts = records(&writer);
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0]["outcome"], "cancelled");
        assert_eq!(facts[0]["output_complete"], true);
        assert_eq!(facts[0]["capture_complete"], true);
    }
}
