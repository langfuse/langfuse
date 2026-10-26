use super::*;
use crate::config::ExecutionLimits;
use crate::test_support::{
    FakeServer, ingestion_token, resolved_request_context, resolved_request_context_for,
};
use axum::{
    body::to_bytes,
    http::{HeaderName, StatusCode},
};
use futures_util::{StreamExt, stream};
use std::{convert::Infallible, future::pending, sync::Arc};
use tokio::sync::Notify;

fn provider(server: &FakeServer) -> ProviderTransport {
    ProviderTransport::for_test(format!("{}/v1", server.url), ProviderLimits::default())
}

/// Consumed as generation context; never forwarded upstream.
const CALLER_CONTEXT_HEADERS: [(&str, &str); 9] = [
    (
        "traceparent",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    ),
    ("tracestate", "caller=private"),
    ("baggage", "langfuse_user_id=private"),
    ("langfuse-trace-name", "private-trace"),
    ("langfuse-session-id", "private-session"),
    ("langfuse-user-id", "private-user"),
    ("langfuse-environment", "private-environment"),
    ("langfuse-tags", "private-tag"),
    ("langfuse-metadata", "private:value"),
];

#[test]
fn model_rewrite_changes_only_the_top_level_model_bytes() {
    let original = Bytes::from_static(
        br#"{ "z": {"second":2, "first":1}, "model" : "connection:model", "number": 1.0e2, "escaped":"\u00e9" }"#,
    );
    let expected = Bytes::from_static(
        br#"{ "z": {"second":2, "first":1}, "model" : "provider-model", "number": 1.0e2, "escaped":"\u00e9" }"#,
    );
    let model_range = model_range(&original).unwrap();
    assert_eq!(
        rewrite_model(original, model_range, "provider-model").unwrap(),
        expected
    );
}

#[test]
fn model_rewrite_fails_closed_for_an_invalid_model_range() {
    let missing = Bytes::from_static(br#"{"input":{"model":"nested-model"}}"#);
    assert!(matches!(
        rewrite_model(missing, 100..110, "provider-model"),
        Err(ProviderError::Configuration)
    ));
}

#[tokio::test]
async fn invalid_model_rewrite_never_reaches_the_provider() {
    let upstream = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let relay = provider(&upstream);
    let result = relay
        .forward_route(
            relay.admit(),
            resolved_request_context("provider-secret").await,
            &HeaderMap::new(),
            RequestBody {
                bytes: Bytes::from_static(br#"{"model":"requested"}"#),
                model_range: 100..110,
                streaming: true,
                reservation: None,
            },
            Route::OpenAiResponses,
            &mut RequestCorrelation::default(),
        )
        .await;

    assert!(matches!(result, Err(ProviderError::Configuration)));
    assert_eq!(upstream.calls(), 0);
}

#[test]
fn model_rewrite_accepts_a_shorter_provider_model() {
    let original = Bytes::from_static(br#"{"model":"connection:model","input":"large"}"#);
    let model_range = model_range(&original).unwrap();
    assert_eq!(
        rewrite_model(original, model_range, "m").unwrap(),
        r#"{"model":"m","input":"large"}"#
    );
}

#[tokio::test]
async fn missing_provider_model_fails_resolution() {
    let web = FakeServer::start(|_| async {
        let bytes = to_bytes(
            crate::test_support::resolution_response("provider-secret").into_body(),
            4096,
        )
        .await
        .unwrap();
        let mut body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        body["connection"]
            .as_object_mut()
            .unwrap()
            .remove("provider_model");
        Response::new(Body::from(body.to_string()))
    })
    .await;
    let result = web
        .control_plane()
        .resolve(
            "gateway-secret",
            ApiFormat::OpenAiResponses,
            "Production key:gpt-4o",
            "test-request-id",
        )
        .await;

    assert!(matches!(
        result,
        Err(crate::resolution::ResolutionError::InvalidResponse)
    ));
}

#[tokio::test]
async fn rewrites_the_model_and_isolates_request_and_response_headers() {
    const REQUEST: &[u8] =
        br#"{ "model": "opaque", "future_field": {"model":"opaque","values":[true,3]} }"#;
    const UPSTREAM_REQUEST: &[u8] =
        br#"{ "model": "provider-model", "future_field": {"model":"opaque","values":[true,3]} }"#;
    const RESPONSE: &[u8] = b"\x1f\x8b\x08\x00opaque-encoded-response";
    let upstream = FakeServer::start(|request| async move {
        assert_eq!(request.uri(), "/v1/responses");
        assert_eq!(request.method(), "POST");
        assert_eq!(
            request.headers()[header::AUTHORIZATION],
            "Bearer provider-secret"
        );
        assert_eq!(request.headers()[header::CONTENT_TYPE], "application/json");
        assert_eq!(request.headers()[header::ACCEPT_ENCODING], "identity");
        assert_eq!(
            request.headers()[header::CONTENT_LENGTH].to_str().unwrap(),
            UPSTREAM_REQUEST.len().to_string()
        );
        for name in [
            "cookie",
            "langfuse-gateway-authorization",
            "openai-organization",
            "openai-project",
            "x-api-key",
            "x-forwarded-host",
        ]
        .into_iter()
        .chain(CALLER_CONTEXT_HEADERS.map(|(name, _)| name))
        {
            assert!(!request.headers().contains_key(name), "forwarded {name}");
        }
        assert_eq!(
            to_bytes(request.into_body(), 1024).await.unwrap(),
            UPSTREAM_REQUEST
        );
        Response::builder()
            .status(201)
            .header("content-type", "application/json")
            .header("content-encoding", "gzip")
            .header("x-request-id", "request-123")
            .header("set-cookie", "private-cookie")
            .header("connection", "openai-version")
            .header("openai-version", "private-hop-value")
            .body(Body::from(RESPONSE))
            .unwrap()
    })
    .await;
    let relay = provider(&upstream);
    let mut headers = HeaderMap::new();
    for (name, value) in [
        ("authorization", "Bearer gateway-secret"),
        ("cookie", "session=secret"),
        ("langfuse-gateway-authorization", "service-signature"),
        ("openai-organization", "wrong-org"),
        ("openai-project", "wrong-project"),
        ("x-api-key", "wrong-key"),
        ("x-forwarded-host", "attacker.example"),
        ("content-type", "application/json"),
        ("accept-encoding", "gzip"),
        ("connection", "accept-encoding"),
    ]
    .into_iter()
    .chain(CALLER_CONTEXT_HEADERS)
    {
        headers.insert(
            axum::http::HeaderName::from_static(name),
            HeaderValue::from_static(value),
        );
    }
    let response = relay
        .forward(
            relay.admit(),
            resolved_request_context("provider-secret").await,
            &headers,
            Bytes::from_static(REQUEST),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    assert_eq!(response.headers()["content-encoding"], "gzip");
    assert_eq!(response.headers()["x-request-id"], "request-123");
    for name in [
        "set-cookie",
        "connection",
        "openai-version",
        "content-length",
        "transfer-encoding",
    ] {
        assert!(!response.headers().contains_key(name));
    }
    assert_eq!(
        to_bytes(response.into_body(), 1024).await.unwrap(),
        RESPONSE
    );
    assert_eq!(upstream.calls(), 1);
}

#[tokio::test]
async fn preserves_provider_failures_without_retries_or_redirects() {
    let target = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    for status in [307, 429, 500, 503] {
        let location = target.url.clone();
        let upstream = FakeServer::start(move |_| {
            let location = location.clone();
            async move {
                Response::builder()
                    .status(status)
                    .header("location", location)
                    .header("retry-after", "7")
                    .body(Body::from("native-provider-body"))
                    .unwrap()
            }
        })
        .await;
        let relay = provider(&upstream);
        let response = relay
            .forward(
                relay.admit(),
                resolved_request_context("provider-secret").await,
                &HeaderMap::new(),
                Bytes::from_static(br#"{"model":"requested"}"#),
            )
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), status);
        assert_eq!(response.headers()["retry-after"], "7");
        assert!(!response.headers().contains_key("location"));
        assert_eq!(
            to_bytes(response.into_body(), 1024).await.unwrap(),
            "native-provider-body"
        );
        assert_eq!(upstream.calls(), 1);
    }
    assert_eq!(target.calls(), 0);
}

#[tokio::test]
async fn streams_sse_incrementally() {
    let release = Arc::new(Notify::new());
    let upstream_release = release.clone();
    let upstream = FakeServer::start(move |_| {
        let release = upstream_release.clone();
        async move {
            let chunks = stream::once(async { Ok::<_, Infallible>("data: first\n\n") }).chain(
                stream::once(async move {
                    release.notified().await;
                    Ok("data: [DONE]\n\n")
                }),
            );
            Response::builder()
                .header("content-type", "text/event-stream")
                .body(Body::from_stream(chunks))
                .unwrap()
        }
    })
    .await;
    let relay = provider(&upstream);
    let response = relay
        .forward(
            relay.admit(),
            resolved_request_context("provider-secret").await,
            &HeaderMap::new(),
            Bytes::from_static(br#"{"model":"requested"}"#),
        )
        .await
        .unwrap();
    assert_eq!(response.headers()["content-type"], "text/event-stream");
    let mut body = response.into_body().into_data_stream();
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(1), body.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap(),
        "data: first\n\n"
    );
    release.notify_one();
    let mut remaining = Vec::new();
    while let Some(chunk) = body.next().await {
        remaining.extend_from_slice(&chunk.unwrap());
    }
    assert_eq!(remaining, b"data: [DONE]\n\n");
}

#[tokio::test]
async fn simultaneous_requests_keep_provider_credentials_and_bodies_isolated() {
    let upstream = FakeServer::start(|request| async move {
        let authorization = request.headers()[header::AUTHORIZATION]
            .to_str()
            .unwrap()
            .to_owned();
        let body = to_bytes(request.into_body(), 1024).await.unwrap();
        Response::new(Body::from(format!(
            "{authorization}:{}",
            String::from_utf8(body.to_vec()).unwrap()
        )))
    })
    .await;
    let relay = provider(&upstream);
    let alice = resolved_request_context("alice-secret").await;
    let bob = resolved_request_context("bob-secret").await;
    let headers = HeaderMap::new();
    let (alice, bob) = tokio::join!(
        relay.forward(
            relay.admit(),
            alice,
            &headers,
            Bytes::from_static(br#"{"model":"requested","owner":"alice"}"#)
        ),
        relay.forward(
            relay.admit(),
            bob,
            &headers,
            Bytes::from_static(br#"{"model":"requested","owner":"bob"}"#)
        ),
    );
    assert_eq!(
        to_bytes(alice.unwrap().into_body(), 1024).await.unwrap(),
        r#"Bearer alice-secret:{"model":"provider-model","owner":"alice"}"#
    );
    assert_eq!(
        to_bytes(bob.unwrap().into_body(), 1024).await.unwrap(),
        r#"Bearer bob-secret:{"model":"provider-model","owner":"bob"}"#
    );
    assert_eq!(upstream.calls(), 2);
}

struct Dropped(Arc<Notify>);
impl Drop for Dropped {
    fn drop(&mut self) {
        self.0.notify_one();
    }
}

async fn stalled_provider(dropped: Arc<Notify>) -> FakeServer {
    FakeServer::start(move |_| {
        let guard = Dropped(dropped.clone());
        async move {
            let tail = stream::once(async move {
                let _guard = guard;
                pending::<Result<&str, Infallible>>().await
            });
            Response::new(Body::from_stream(
                stream::once(async { Ok::<_, Infallible>("first") }).chain(tail),
            ))
        }
    })
    .await
}

#[tokio::test]
async fn dropping_downstream_cancels_upstream() {
    let dropped = Arc::new(Notify::new());
    let upstream = stalled_provider(dropped.clone()).await;
    let relay = provider(&upstream);
    let response = relay
        .forward(
            relay.admit(),
            resolved_request_context("provider-secret").await,
            &HeaderMap::new(),
            Bytes::from_static(br#"{"model":"requested"}"#),
        )
        .await
        .unwrap();
    let mut body = response.into_body().into_data_stream();
    assert_eq!(body.next().await.unwrap().unwrap(), "first");
    drop(body);
    tokio::time::timeout(Duration::from_secs(1), dropped.notified())
        .await
        .expect("upstream body should be dropped on cancellation");
}

#[tokio::test]
async fn deadlines_bound_headers_and_stalled_bodies_without_exposing_transport_details() {
    let upstream = FakeServer::start(|_| async {
        pending::<()>().await;
        Response::new(Body::empty())
    })
    .await;
    let relay = ProviderTransport::for_test(
        upstream.url.clone(),
        ProviderLimits {
            execution: ExecutionLimits {
                stall_timeout: Duration::from_millis(30),
                ..ExecutionLimits::default()
            },
        },
    );
    let response = relay
        .forward(
            relay.admit(),
            resolved_request_context("provider-secret").await,
            &HeaderMap::new(),
            Bytes::from_static(br#"{"model":"requested"}"#),
        )
        .await;
    assert!(matches!(response, Err(ProviderError::Timeout)));

    let dropped = Arc::new(Notify::new());
    let upstream = stalled_provider(dropped.clone()).await;
    let relay = ProviderTransport::for_test(
        upstream.url.clone(),
        ProviderLimits {
            execution: ExecutionLimits {
                max_execution_time: Duration::from_millis(100),
                ..ExecutionLimits::default()
            },
        },
    );
    let context = resolved_request_context("provider-secret").await;
    let response = relay
        .forward(
            relay.admit(),
            context,
            &HeaderMap::new(),
            Bytes::from_static(br#"{"model":"requested"}"#),
        )
        .await
        .unwrap();
    // The deadline must cancel upstream even when downstream does not poll its body.
    tokio::time::timeout(Duration::from_secs(1), dropped.notified())
        .await
        .expect("deadline must run without downstream polling");
    let error = to_bytes(response.into_body(), 1024).await.unwrap_err();
    assert!(!error.to_string().contains(&upstream.url));
    assert!(!error.to_string().contains("provider-secret"));
}

#[tokio::test]
async fn completed_json_and_sse_upload_once_without_waiting_for_ingestion() {
    use crate::{
        resolution::ControlPlaneConfig, telemetry::Telemetry,
        test_support::resolved_request_context_with_mode,
    };

    const JSON: &str = r#"{"id":"resp-1","model":"actual","status":"completed","output":[],"usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}"#;
    const SSE: &str = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"hello\"}\n\ndata: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp-1\",\"model\":\"actual\",\"status\":\"completed\",\"output\":[],\"usage\":{\"input_tokens\":2,\"output_tokens\":1,\"total_tokens\":3}}}\n\n";
    for (content_type, native, sink_status, close_before_eof) in [
        ("application/json", JSON, 200, false),
        ("text/event-stream", SSE, 503, false),
        ("text/event-stream", SSE, 200, true),
    ] {
        let (sent, mut received) = tokio::sync::mpsc::channel(2);
        let release = Arc::new(Notify::new());
        let sink_release = release.clone();
        let sink = FakeServer::start(move |request| {
            let sent = sent.clone();
            let release = sink_release.clone();
            async move {
                let bytes = to_bytes(request.into_body(), 65536).await.unwrap();
                sent.send(crate::test_support::upload_json(&bytes))
                    .await
                    .unwrap();
                release.notified().await;
                Response::builder()
                    .status(sink_status)
                    .body(Body::from("{}"))
                    .unwrap()
            }
        })
        .await;
        let telemetry =
            Telemetry::for_test(&ControlPlaneConfig::new(&sink.url, "service-key").unwrap());
        let upstream = FakeServer::start(move |_| async move {
            let body = if close_before_eof {
                Body::from_stream(
                    stream::iter([Ok::<_, Infallible>(Bytes::from_static(native.as_bytes()))])
                        .chain(stream::pending()),
                )
            } else {
                Body::from(native)
            };
            Response::builder()
                .header("content-type", content_type)
                .header("x-request-id", "req-1")
                .body(body)
                .unwrap()
        })
        .await;
        let relay = provider(&upstream).with_telemetry(telemetry.clone());
        let headers = HeaderMap::from_iter([
            (
                axum::http::HeaderName::from_static("traceparent"),
                HeaderValue::from_static("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00"),
            ),
            (
                axum::http::HeaderName::from_static("tracestate"),
                HeaderValue::from_static("caller=state"),
            ),
            (
                axum::http::HeaderName::from_static("langfuse-user-id"),
                HeaderValue::from_static("caller-user"),
            ),
        ]);
        let response = relay
            .forward(
                relay.admit(),
                resolved_request_context_with_mode("provider-secret", "full").await,
                &headers,
                Bytes::from_static(br#"{"model":"requested","input":"hello"}"#),
            )
            .await
            .unwrap();
        // Neither the last byte nor the provider permit waits for the sink response.
        let mut body = response.into_body().into_data_stream();
        let mut forwarded = Vec::new();
        while let Some(chunk) = tokio::time::timeout(Duration::from_secs(1), body.next())
            .await
            .unwrap()
        {
            forwarded.extend_from_slice(&chunk.unwrap());
            if close_before_eof && forwarded.len() == native.len() {
                break;
            }
        }
        drop(body);
        assert_eq!(forwarded, native.as_bytes());
        let payload = tokio::time::timeout(Duration::from_secs(1), received.recv())
            .await
            .unwrap()
            .unwrap();
        assert_completed_upload(&payload, content_type == "text/event-stream");
        release.notify_one();
        telemetry
            .shutdown(Instant::now() + Duration::from_secs(1))
            .await;
        assert!(received.try_recv().is_err());
        assert_eq!(sink.calls(), 1);
        assert_eq!(upstream.calls(), 1);
    }
}

#[tokio::test]
async fn ingestion_mode_none_relays_without_uploading() {
    use crate::{
        resolution::ControlPlaneConfig, telemetry::Telemetry,
        test_support::resolved_request_context_with_mode,
    };

    const JSON: &str = r#"{"id":"resp-1","model":"actual","status":"completed","output":[],"usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}"#;
    let sink = FakeServer::start(|_| async { Response::new(Body::from("{}")) }).await;
    let telemetry =
        Telemetry::for_test(&ControlPlaneConfig::new(&sink.url, "service-key").unwrap());
    let upstream = FakeServer::start(|_| async {
        Response::builder()
            .header("content-type", "application/json")
            .body(Body::from(JSON))
            .unwrap()
    })
    .await;
    let relay = provider(&upstream).with_telemetry(telemetry.clone());
    let response = relay
        .forward(
            relay.admit(),
            resolved_request_context_with_mode("provider-secret", "none").await,
            &HeaderMap::new(),
            Bytes::from_static(br#"{"model":"requested","input":"prompt-canary"}"#),
        )
        .await
        .unwrap();
    assert_eq!(to_bytes(response.into_body(), 4096).await.unwrap(), JSON);
    telemetry
        .shutdown(Instant::now() + Duration::from_secs(1))
        .await;
    assert_eq!(upstream.calls(), 1);
    assert_eq!(sink.calls(), 0);
}

#[tokio::test]
async fn cancelled_and_timed_out_executions_upload_after_provider_context_is_released() {
    use crate::{resolution::ControlPlaneConfig, telemetry::Telemetry};
    use serde_json::Value;

    for cancelled in [true, false] {
        let (sent, mut received) = tokio::sync::mpsc::channel(2);
        let sink = FakeServer::start(move |request| {
            let sent = sent.clone();
            async move {
                assert_eq!(
                    request.headers()[header::AUTHORIZATION],
                    format!("Bearer {}", ingestion_token("org-1", "project-1")).as_str()
                );
                let bytes = to_bytes(request.into_body(), 65536).await.unwrap();
                sent.send(crate::test_support::upload_json(&bytes))
                    .await
                    .unwrap();
                Response::new(Body::from("{}"))
            }
        })
        .await;
        let telemetry =
            Telemetry::for_test(&ControlPlaneConfig::new(&sink.url, "service-key").unwrap());
        let dropped = Arc::new(Notify::new());
        let upstream = stalled_provider(dropped).await;
        let relay = ProviderTransport::for_test(
            upstream.url.clone(),
            ProviderLimits {
                execution: ExecutionLimits {
                    max_execution_time: Duration::from_millis(150),
                    ..ExecutionLimits::default()
                },
            },
        )
        .with_telemetry(telemetry.clone());
        let context = resolved_request_context("provider-secret").await;
        let response = relay
            .forward(
                relay.admit(),
                context,
                &HeaderMap::new(),
                Bytes::from_static(br#"{"model":"requested","input":"prompt-canary"}"#),
            )
            .await
            .unwrap();
        let mut body = response.into_body().into_data_stream();
        assert_eq!(body.next().await.unwrap().unwrap(), "first");
        assert_eq!(sink.calls(), 0);
        if cancelled {
            drop(body);
        } else {
            assert!(body.next().await.unwrap().is_err());
            drop(body);
        }
        let payload = tokio::time::timeout(Duration::from_secs(1), received.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(!payload.to_string().contains("prompt-canary"));
        let attrs = payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"]
            .as_array()
            .unwrap();
        let metadata: Value = serde_json::from_str(
            attrs
                .iter()
                .find(|a| a["key"] == "langfuse.observation.metadata")
                .unwrap()["value"]["stringValue"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            attrs
                .iter()
                .find(|a| a["key"] == "langfuse.observation.level")
                .unwrap()["value"]["stringValue"],
            if cancelled { "WARNING" } else { "ERROR" }
        );
        assert_eq!(
            attrs
                .iter()
                .find(|a| a["key"] == "langfuse.observation.model.name")
                .unwrap()["value"]["stringValue"],
            "provider-model"
        );
        assert_eq!(metadata["langfuse.gateway.response.status_code"], 200);
        assert!(metadata.get("relay_outcome").is_none());
        telemetry
            .shutdown(Instant::now() + Duration::from_secs(1))
            .await;
        assert!(received.try_recv().is_err());
        assert_eq!(sink.calls(), 1);
    }
}

#[tokio::test]
async fn compact_posts_compact_path_and_captures_ingestion() {
    use crate::{resolution::ControlPlaneConfig, telemetry::Telemetry};

    const COMPACT: &[u8] =
        br#"{"model":"gpt-4.1","input":[{"encrypted_content":"opaque-ciphertext"}]}"#;
    const UPSTREAM_COMPACT: &[u8] =
        br#"{"model":"provider-model","input":[{"encrypted_content":"opaque-ciphertext"}]}"#;
    const COMPACT_RESPONSE: &str =
        r#"{"id":"comp_1","output":[{"encrypted_content":"opaque-ciphertext"}]}"#;
    let (sent, mut received) = tokio::sync::mpsc::channel(2);
    let sink = FakeServer::start(move |request| {
        let sent = sent.clone();
        async move {
            let bytes = to_bytes(request.into_body(), 65536).await.unwrap();
            sent.send(crate::test_support::upload_json(&bytes))
                .await
                .unwrap();
            Response::new(Body::from("{}"))
        }
    })
    .await;
    let telemetry =
        Telemetry::for_test(&ControlPlaneConfig::new(&sink.url, "service-key").unwrap());
    let upstream = FakeServer::start(|request| async move {
        assert_eq!(request.uri(), "/v1/responses/compact");
        assert_eq!(request.method(), "POST");
        let body = to_bytes(request.into_body(), 4096).await.unwrap();
        assert_eq!(body, UPSTREAM_COMPACT);
        Response::builder()
            .header("content-type", "application/json")
            .body(Body::from(COMPACT_RESPONSE))
            .unwrap()
    })
    .await;
    let relay = provider(&upstream).with_telemetry(telemetry.clone());
    let compact = relay
        .forward_route(
            relay.admit(),
            resolved_request_context("provider-secret").await,
            &HeaderMap::new(),
            RequestBody {
                bytes: Bytes::from_static(COMPACT),
                model_range: model_range(COMPACT).unwrap(),
                streaming: true,
                reservation: None,
            },
            Route::OpenAiResponsesCompact,
            &mut RequestCorrelation::default(),
        )
        .await
        .unwrap();
    assert_eq!(
        to_bytes(compact.into_body(), 4096).await.unwrap(),
        COMPACT_RESPONSE
    );
    let payload = tokio::time::timeout(Duration::from_secs(1), received.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["name"],
        "openai.responses"
    );
    assert!(received.try_recv().is_err());
    telemetry
        .shutdown(Instant::now() + Duration::from_secs(1))
        .await;
    assert_eq!(sink.calls(), 1);
    assert_eq!(upstream.calls(), 1);
}

fn assert_completed_upload(payload: &serde_json::Value, streaming: bool) {
    use serde_json::{Value, json};

    let generation = &payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0];
    assert_eq!(generation["traceId"], "4bf92f3577b34da6a3ce929d0e0e4736");
    assert_eq!(generation["parentSpanId"], "00f067aa0ba902b7");
    assert_eq!(generation["traceState"], "caller=state");
    assert!(
        generation["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|attribute| {
                attribute["key"] == "user.id" && attribute["value"]["stringValue"] == "caller-user"
            })
    );
    let span = &payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0];
    let attrs = span["attributes"].as_array().unwrap();
    assert!(attrs.iter().any(
        |a| a["key"] == "langfuse.observation.level" && a["value"]["stringValue"] == "DEFAULT"
    ));
    assert!(
        !attrs
            .iter()
            .any(|a| a["key"] == "langfuse.observation.status_message")
    );
    assert!(
        attrs
            .iter()
            .any(|a| a["key"] == "langfuse.observation.model.name"
                && a["value"]["stringValue"] == "actual")
    );
    assert_eq!(
        attrs
            .iter()
            .any(|a| a["key"] == "langfuse.observation.completion_start_time"),
        streaming,
    );
    let metadata: Value = serde_json::from_str(
        attrs
            .iter()
            .find(|a| a["key"] == "langfuse.observation.metadata")
            .unwrap()["value"]["stringValue"]
            .as_str()
            .unwrap(),
    )
    .unwrap();
    assert!(metadata.get("relay_outcome").is_none());
    assert!(metadata.get("native_usage").is_none());
    assert_eq!(metadata["langfuse.gateway.upstream.response.id"], "resp-1");
    assert_eq!(metadata["langfuse.gateway.upstream.request.id"], "req-1");
    assert!(metadata["langfuse.gateway.request.id"].is_string());
    assert!(metadata.get("langfuse.gateway.client.request.id").is_none());
    let usage: Value = serde_json::from_str(
        attrs
            .iter()
            .find(|a| a["key"] == "langfuse.observation.usage_details")
            .unwrap()["value"]["stringValue"]
            .as_str()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        usage,
        json!({"input_tokens":2,"output_tokens":1,"total_tokens":3})
    );
    for secret in [
        "provider-secret",
        "private-ingestion-token",
        "gateway-secret",
        "service-key",
    ] {
        assert!(!payload.to_string().contains(secret));
    }
}

fn transport(server: &FakeServer) -> ProviderTransport {
    ProviderTransport::for_test(format!("{}/v1", server.url), ProviderLimits::default())
}

/// Headers the gateway consumes for attribution or that belong to the client
/// hop; none may reach the provider.
const CONSUMED_HEADERS: &[(&str, &str)] = &[
    ("x-claude-code-session-id", "session-1"),
    ("x-claude-code-agent-id", "agent-1"),
    ("cookie", "session=secret"),
    ("langfuse-gateway-authorization", "service-signature"),
    (
        "traceparent",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    ),
    ("baggage", "langfuse_user_id=private"),
    ("langfuse-session-id", "private-session"),
    ("x-forwarded-host", "attacker.example"),
    ("x-stainless-retry-count", "0"),
];

fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in pairs {
        headers.append(
            HeaderName::from_static(name),
            HeaderValue::from_static(value),
        );
    }
    headers
}

#[tokio::test]
async fn sends_the_x_api_key_credential_and_forwards_the_open_anthropic_header_family() {
    const REQUEST: &[u8] = br#"{"model":"claude-sonnet-4-5","system":[{"type":"text","text":"attribution","cache_control":{"type":"ephemeral"}}],"future_field":true}"#;
    const UPSTREAM_REQUEST: &[u8] = br#"{"model":"provider-model","system":[{"type":"text","text":"attribution","cache_control":{"type":"ephemeral"}}],"future_field":true}"#;
    let upstream = FakeServer::start(|request| async move {
        assert_eq!(request.uri(), "/v1/messages");
        assert_eq!(request.method(), "POST");
        assert_eq!(request.headers()["x-api-key"], "provider-secret");
        assert!(!request.headers().contains_key(header::AUTHORIZATION));
        assert_eq!(request.headers()["anthropic-version"], "2023-06-01");
        assert_eq!(
            request.headers()["anthropic-beta"],
            "interleaved-thinking-2025-05-14,context-1m-2025-08-07"
        );
        assert_eq!(request.headers()["anthropic-future-capability"], "on");
        assert_eq!(request.headers()[header::ACCEPT_ENCODING], "identity");
        for (name, _) in CONSUMED_HEADERS {
            assert!(!request.headers().contains_key(*name), "forwarded {name}");
        }
        assert_eq!(
            to_bytes(request.into_body(), 1024).await.unwrap(),
            UPSTREAM_REQUEST
        );
        Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "application/json")
            .header("request-id", "req_123")
            .header("x-should-retry", "false")
            .header("anthropic-ratelimit-unified-status", "allowed")
            .header("anthropic-ratelimit-input-tokens-remaining", "1000")
            .header("anthropic-organization-id", "org_456")
            .header("retry-after", "7")
            .header("set-cookie", "private-cookie")
            .header("cf-ray", "edge-private")
            .body(Body::from(r#"{"type":"message","content":[]}"#))
            .unwrap()
    })
    .await;
    let relay = transport(&upstream);
    let context =
        resolved_request_context_for(ApiFormat::AnthropicMessages, "provider-secret", "usage")
            .await;
    let response = relay
        .forward_route(
            relay.admit(),
            context,
            &headers(
                &[
                    &[
                        ("x-api-key", "gateway-secret"),
                        ("authorization", "Bearer gateway-secret"),
                        ("anthropic-version", "2023-06-01"),
                        (
                            "anthropic-beta",
                            "interleaved-thinking-2025-05-14,context-1m-2025-08-07",
                        ),
                        ("anthropic-future-capability", "on"),
                        ("content-type", "application/json"),
                        ("accept-encoding", "gzip"),
                    ],
                    CONSUMED_HEADERS,
                ]
                .concat(),
            ),
            RequestBody {
                bytes: Bytes::from_static(REQUEST),
                model_range: model_range(REQUEST).unwrap(),
                streaming: true,
                reservation: None,
            },
            Route::AnthropicMessages,
            &mut RequestCorrelation::default(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let response_headers = response.headers().clone();
    for (name, value) in [
        ("request-id", "req_123"),
        ("x-should-retry", "false"),
        ("anthropic-ratelimit-unified-status", "allowed"),
        ("anthropic-ratelimit-input-tokens-remaining", "1000"),
        ("anthropic-organization-id", "org_456"),
        ("retry-after", "7"),
        ("content-type", "application/json"),
    ] {
        assert_eq!(response_headers[name], value, "missing {name}");
    }
    for name in ["set-cookie", "cf-ray"] {
        assert!(!response_headers.contains_key(name), "retained {name}");
    }
    assert_eq!(
        to_bytes(response.into_body(), 1024).await.unwrap(),
        r#"{"type":"message","content":[]}"#
    );
    assert_eq!(upstream.calls(), 1);
}

#[tokio::test]
async fn count_tokens_relays_the_body() {
    let upstream = FakeServer::start(|request| async move {
        assert_eq!(request.uri(), "/v1/messages/count_tokens");
        assert_eq!(request.method(), "POST");
        assert_eq!(
            to_bytes(request.into_body(), 1024).await.unwrap(),
            r#"{"model":"provider-model","messages":[]}"#
        );
        Response::builder()
            .header("content-type", "application/json")
            .body(Body::from(r#"{"input_tokens":42}"#))
            .unwrap()
    })
    .await;
    let relay = transport(&upstream);
    let context =
        resolved_request_context_for(ApiFormat::AnthropicMessages, "provider-secret", "usage")
            .await;
    let response = relay
        .forward_route(
            relay.admit(),
            context,
            &headers(&[("content-type", "application/json")]),
            RequestBody {
                bytes: Bytes::from_static(br#"{"model":"claude-sonnet-4-5","messages":[]}"#),
                model_range: model_range(br#"{"model":"claude-sonnet-4-5","messages":[]}"#)
                    .unwrap(),
                streaming: true,
                reservation: None,
            },
            Route::AnthropicCountTokens,
            &mut RequestCorrelation::default(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        to_bytes(response.into_body(), 1024).await.unwrap(),
        r#"{"input_tokens":42}"#
    );
    assert_eq!(upstream.calls(), 1);
}

const CHAT_CONTENT_CHUNK: &str = "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-4.1-mini-2025-04-14\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"Hello\"},\"finish_reason\":\"stop\"}],\"usage\":null}\n\n";
const CHAT_USAGE_CHUNK: &str = "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-4.1-mini-2025-04-14\",\"choices\":[],\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":1,\"total_tokens\":10,\"prompt_tokens_details\":{\"cached_tokens\":4},\"completion_tokens_details\":{\"reasoning_tokens\":0}}}\n\n";
const CHAT_DONE: &str = "data: [DONE]\n\n";

/// Generation context headers in the shape SDK users send them.
const CHAT_CONTEXT_HEADERS: [(&str, &str); 8] = [
    (
        "traceparent",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    ),
    ("langfuse-user-id", "chat-user"),
    ("langfuse-session-id", "chat-session"),
    ("langfuse-trace-name", "chat-trace"),
    ("langfuse-environment", "staging"),
    ("langfuse-tags", "tag-a,tag-b"),
    ("langfuse-metadata", "team:search"),
    ("content-type", "application/json"),
];

#[tokio::test]
async fn chat_completions_streams_request_usage_and_relay_the_usage_chunk() {
    use crate::{resolution::ControlPlaneConfig, telemetry::Telemetry, test_support::upload_json};

    const UNREQUESTED: &str = r#"{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"Say hello"}],"stream":true}"#;
    const REQUESTED: &str = r#"{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"Say hello"}],"stream":true,"stream_options":{"include_usage":true}}"#;
    // Callers receive the usage chunk whether or not they asked for it.
    let relayed = [CHAT_CONTENT_CHUNK, CHAT_USAGE_CHUNK, CHAT_DONE].concat();
    for request in [UNREQUESTED, REQUESTED] {
        let (sent, mut received) = tokio::sync::mpsc::channel(2);
        let sink = FakeServer::start(move |request| {
            let sent = sent.clone();
            async move {
                let bytes = to_bytes(request.into_body(), 65536).await.unwrap();
                sent.send(upload_json(&bytes)).await.unwrap();
                Response::new(Body::from("{}"))
            }
        })
        .await;
        let telemetry =
            Telemetry::for_test(&ControlPlaneConfig::new(&sink.url, "service-key").unwrap());
        let upstream = FakeServer::start(move |request| async move {
            assert_eq!(request.uri(), "/v1/chat/completions");
            assert_eq!(
                request.headers()[header::AUTHORIZATION],
                "Bearer provider-secret"
            );
            for (name, _) in CHAT_CONTEXT_HEADERS {
                if name != "content-type" {
                    assert!(!request.headers().contains_key(name), "forwarded {name}");
                }
            }
            assert_eq!(
                to_bytes(request.into_body(), 4096).await.unwrap(),
                r#"{"model":"provider-model","messages":[{"role":"user","content":"Say hello"}],"stream":true,"stream_options":{"include_usage":true}}"#
            );
            // Arrive split mid-event, as a provider stream may.
            let native = [CHAT_CONTENT_CHUNK, CHAT_USAGE_CHUNK, CHAT_DONE].concat();
            let (head, tail) = native.split_at(CHAT_CONTENT_CHUNK.len() + 20);
            Response::builder()
                .header("content-type", "text/event-stream; charset=utf-8")
                .header("x-request-id", "req-chat")
                .body(Body::from_stream(stream::iter([
                    Ok::<_, Infallible>(head.to_owned()),
                    Ok(tail.to_owned()),
                ])))
                .unwrap()
        })
        .await;
        let relay = provider(&upstream).with_telemetry(telemetry.clone());
        let response = relay
            .forward_route(
                relay.admit(),
                resolved_request_context_for(
                    ApiFormat::OpenAiChatCompletions,
                    "provider-secret",
                    "full",
                )
                .await,
                &headers(
                    &[
                        CHAT_CONTEXT_HEADERS.as_slice(),
                        &[("authorization", "Bearer gateway-secret")],
                    ]
                    .concat(),
                ),
                RequestBody {
                    bytes: Bytes::from_static(request.as_bytes()),
                    model_range: model_range(request.as_bytes()).unwrap(),
                    streaming: true,
                    reservation: None,
                },
                Route::OpenAiChatCompletions,
                &mut RequestCorrelation::default(),
            )
            .await
            .unwrap();
        assert_eq!(response.headers()["x-request-id"], "req-chat");
        assert_eq!(
            to_bytes(response.into_body(), 65536).await.unwrap(),
            relayed
        );
        let payload = tokio::time::timeout(Duration::from_secs(5), received.recv())
            .await
            .unwrap()
            .unwrap();
        assert_chat_upload(&payload, request);
        telemetry
            .shutdown(Instant::now() + Duration::from_secs(1))
            .await;
    }
}

#[tokio::test]
async fn chat_completions_rewrite_non_streamed_models() {
    const JSON_REQUEST: &str = r#"{"model":"gpt-4.1-mini", "messages":[]}"#;
    let upstream = FakeServer::start(|request| async move {
        assert_eq!(
            to_bytes(request.into_body(), 4096).await.unwrap(),
            r#"{"model":"provider-model", "messages":[]}"#
        );
        Response::builder()
            .header("content-type", "application/json")
            .body(Body::from(r#"{"id":"chatcmpl-1","choices":[]}"#))
            .unwrap()
    })
    .await;
    let relay = transport(&upstream);
    let response = relay
        .forward_route(
            relay.admit(),
            resolved_request_context_for(
                ApiFormat::OpenAiChatCompletions,
                "provider-secret",
                "usage",
            )
            .await,
            &headers(&[("content-type", "application/json")]),
            RequestBody {
                bytes: Bytes::from_static(JSON_REQUEST.as_bytes()),
                model_range: model_range(JSON_REQUEST.as_bytes()).unwrap(),
                streaming: true,
                reservation: None,
            },
            Route::OpenAiChatCompletions,
            &mut RequestCorrelation::default(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        to_bytes(response.into_body(), 4096).await.unwrap(),
        r#"{"id":"chatcmpl-1","choices":[]}"#
    );
    assert_eq!(upstream.calls(), 1);
}

fn assert_chat_upload(payload: &serde_json::Value, request: &str) {
    use serde_json::{Value, json};

    let span = &payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0];
    assert_eq!(span["name"], "openai.chat-completions");
    assert_eq!(span["traceId"], "4bf92f3577b34da6a3ce929d0e0e4736");
    assert_eq!(span["parentSpanId"], "00f067aa0ba902b7");
    let attribute = |key: &str| {
        let attribute = span["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|attribute| attribute["key"] == key)
            .unwrap_or_else(|| panic!("missing {key}"));
        attribute["value"]["stringValue"].clone()
    };
    let parsed =
        |key: &str| -> Value { serde_json::from_str(attribute(key).as_str().unwrap()).unwrap() };
    for (key, value) in [
        ("user.id", "chat-user"),
        ("session.id", "chat-session"),
        ("langfuse.trace.name", "chat-trace"),
        ("langfuse.environment", "staging"),
        ("langfuse.observation.level", "DEFAULT"),
        ("langfuse.observation.model.name", "gpt-4.1-mini-2025-04-14"),
    ] {
        assert_eq!(attribute(key), value, "{key}");
    }
    assert_eq!(parsed("langfuse.trace.tags"), json!(["tag-a", "tag-b"]));
    assert_eq!(
        parsed("langfuse.observation.usage_details"),
        json!({"prompt_tokens":9,"completion_tokens":1,"total_tokens":10,"prompt_tokens_details":{"cached_tokens":4},"completion_tokens_details":{"reasoning_tokens":0}})
    );
    // The recorded input is the caller's request, not the upstream rewrite.
    assert_eq!(
        parsed("langfuse.observation.input"),
        json!({"messages":[{"role":"user","content":"Say hello"}]})
    );
    assert_eq!(
        parsed("langfuse.observation.model.parameters").get("stream_options"),
        serde_json::from_str::<Value>(request)
            .unwrap()
            .get("stream_options")
    );
    assert_eq!(
        parsed("langfuse.observation.output"),
        json!({"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"Hello"}}]})
    );
    attribute("langfuse.observation.completion_start_time");
    let metadata = parsed("langfuse.observation.metadata");
    assert_eq!(metadata["team"], "search");
    assert_eq!(
        metadata["langfuse.gateway.request.api_format"],
        "openai.chat-completions"
    );
    assert_eq!(
        metadata["langfuse.gateway.upstream.response.id"],
        "chatcmpl-1"
    );
    assert_eq!(metadata["langfuse.gateway.upstream.request.id"], "req-chat");
    for (key, value) in [
        ("langfuse.gateway.model.requested", json!("gpt-4.1-mini")),
        ("langfuse.gateway.model.upstream", json!("provider-model")),
        (
            "langfuse.gateway.model.response",
            json!("gpt-4.1-mini-2025-04-14"),
        ),
        ("langfuse.gateway.connection.name", json!("Production key")),
        ("langfuse.gateway.connection.provider", json!("openai")),
        ("langfuse.gateway.upstream.status_code", json!(200)),
        ("langfuse.gateway.request.body_bytes", json!(request.len())),
    ] {
        assert_eq!(metadata[key], value, "{key}");
    }
    assert!(metadata["langfuse.gateway.response.body_bytes"].as_u64() > Some(0));
    for secret in [
        "provider-secret",
        "gateway-secret",
        "private-ingestion-token",
    ] {
        assert!(!payload.to_string().contains(secret));
    }
}
