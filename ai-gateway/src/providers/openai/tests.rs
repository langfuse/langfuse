use super::*;
use crate::test_support::{FakeServer, resolved_request_context};
use axum::{body::to_bytes, http::StatusCode};
use futures_util::{StreamExt, stream};
use std::{convert::Infallible, future::pending};
use tokio::sync::Notify;

fn provider(server: &FakeServer, active: usize) -> OpenAiProvider {
    OpenAiProvider::for_test(
        format!("{}/v1", server.url),
        ProviderLimits {
            active,
            ..ProviderLimits::default()
        },
    )
}

#[tokio::test]
async fn preserves_opaque_bytes_and_isolates_request_and_response_headers() {
    const REQUEST: &[u8] = b"{ \"model\": \"opaque\", \"future_field\": [true, 3] }\n";
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
        for name in [
            "cookie",
            "langfuse-gateway-authorization",
            "openai-organization",
            "openai-project",
            "x-api-key",
            "x-forwarded-host",
        ] {
            assert!(!request.headers().contains_key(name), "forwarded {name}");
        }
        assert_eq!(to_bytes(request.into_body(), 1024).await.unwrap(), REQUEST);
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
    let relay = provider(&upstream, 1);
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
    ] {
        headers.insert(
            axum::http::HeaderName::from_static(name),
            HeaderValue::from_static(value),
        );
    }
    let response = relay
        .forward(
            relay.try_admit().unwrap(),
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
    assert!(relay.try_admit().is_ok());
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
        let relay = provider(&upstream, 1);
        let response = relay
            .forward(
                relay.try_admit().unwrap(),
                resolved_request_context("provider-secret").await,
                &HeaderMap::new(),
                Bytes::new(),
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
async fn streams_sse_incrementally_and_holds_admission_until_eof() {
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
    let relay = provider(&upstream, 1);
    let response = relay
        .forward(
            relay.try_admit().unwrap(),
            resolved_request_context("provider-secret").await,
            &HeaderMap::new(),
            Bytes::new(),
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
    assert!(matches!(relay.try_admit(), Err(ProviderError::Busy)));
    release.notify_one();
    let mut remaining = Vec::new();
    while let Some(chunk) = body.next().await {
        remaining.extend_from_slice(&chunk.unwrap());
    }
    assert_eq!(remaining, b"data: [DONE]\n\n");
    assert!(relay.try_admit().is_ok());
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
    let relay = provider(&upstream, 2);
    let alice = resolved_request_context("alice-secret").await;
    let bob = resolved_request_context("bob-secret").await;
    let headers = HeaderMap::new();
    let (alice, bob) = tokio::join!(
        relay.forward(
            relay.try_admit().unwrap(),
            alice,
            &headers,
            Bytes::from_static(b"alice-body")
        ),
        relay.forward(
            relay.try_admit().unwrap(),
            bob,
            &headers,
            Bytes::from_static(b"bob-body")
        ),
    );
    assert_eq!(
        to_bytes(alice.unwrap().into_body(), 1024).await.unwrap(),
        "Bearer alice-secret:alice-body"
    );
    assert_eq!(
        to_bytes(bob.unwrap().into_body(), 1024).await.unwrap(),
        "Bearer bob-secret:bob-body"
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
async fn dropping_downstream_cancels_upstream_and_releases_admission() {
    let dropped = Arc::new(Notify::new());
    let upstream = stalled_provider(dropped.clone()).await;
    let relay = provider(&upstream, 1);
    let response = relay
        .forward(
            relay.try_admit().unwrap(),
            resolved_request_context("provider-secret").await,
            &HeaderMap::new(),
            Bytes::new(),
        )
        .await
        .unwrap();
    let mut body = response.into_body().into_data_stream();
    assert_eq!(body.next().await.unwrap().unwrap(), "first");
    assert!(matches!(relay.try_admit(), Err(ProviderError::Busy)));
    drop(body);
    assert!(relay.try_admit().is_ok());
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
    let relay = OpenAiProvider::for_test(
        upstream.url.clone(),
        ProviderLimits {
            headers_timeout: Duration::from_millis(30),
            ..ProviderLimits::default()
        },
    );
    let response = relay
        .forward(
            relay.try_admit().unwrap(),
            resolved_request_context("provider-secret").await,
            &HeaderMap::new(),
            Bytes::new(),
        )
        .await;
    assert!(matches!(response, Err(ProviderError::Timeout)));
    assert!(relay.try_admit().is_ok());

    let dropped = Arc::new(Notify::new());
    let upstream = stalled_provider(dropped.clone()).await;
    let relay = OpenAiProvider::for_test(
        upstream.url.clone(),
        ProviderLimits {
            execution_timeout: Duration::from_millis(100),
            ..ProviderLimits::default()
        },
    );
    let context = resolved_request_context("provider-secret").await;
    let response = relay
        .forward(
            relay.try_admit().unwrap(),
            context,
            &HeaderMap::new(),
            Bytes::new(),
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
    assert!(relay.try_admit().is_ok());
}

#[tokio::test]
async fn completed_json_and_sse_upload_once_without_waiting_for_ingestion() {
    use crate::{
        resolution::ControlPlaneConfig, telemetry::Telemetry,
        test_support::resolved_request_context_with_mode,
    };
    use serde_json::Value;

    for (content_type, native, sink_status) in [
        (
            "application/json",
            r#"{"id":"resp-1","model":"actual","status":"completed","output":[],"usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}"#,
            200,
        ),
        (
            "text/event-stream",
            "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp-1\",\"model\":\"actual\",\"status\":\"completed\",\"output\":[],\"usage\":{\"input_tokens\":2,\"output_tokens\":1,\"total_tokens\":3}}}\n\n",
            503,
        ),
    ] {
        let (sent, mut received) = tokio::sync::mpsc::channel(2);
        let release = Arc::new(Notify::new());
        let sink_release = release.clone();
        let sink = FakeServer::start(move |request| {
            let sent = sent.clone();
            let release = sink_release.clone();
            async move {
                let bytes = to_bytes(request.into_body(), 65536).await.unwrap();
                sent.send(serde_json::from_slice::<Value>(&bytes).unwrap())
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
            Telemetry::new(&ControlPlaneConfig::new(&sink.url, "service-key").unwrap()).unwrap();
        let upstream = FakeServer::start(move |_| async move {
            Response::builder()
                .header("content-type", content_type)
                .body(Body::from(native))
                .unwrap()
        })
        .await;
        let relay = provider(&upstream, 1).with_telemetry(telemetry.clone());
        let context = resolved_request_context_with_mode("provider-secret", "full").await;
        let response = relay
            .forward(
                relay.try_admit().unwrap(),
                context,
                &HeaderMap::new(),
                Bytes::from_static(br#"{"model":"requested","input":"hello"}"#),
            )
            .await
            .unwrap();
        // Neither the last byte nor the provider permit waits for the sink response.
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(1), to_bytes(response.into_body(), 4096))
                .await
                .unwrap()
                .unwrap(),
            native
        );
        assert!(relay.try_admit().is_ok());
        let payload = tokio::time::timeout(Duration::from_secs(1), received.recv())
            .await
            .unwrap()
            .unwrap();
        assert_completed_upload(&payload);
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
                    "Bearer private-ingestion-token"
                );
                let bytes = to_bytes(request.into_body(), 65536).await.unwrap();
                sent.send(serde_json::from_slice::<Value>(&bytes).unwrap())
                    .await
                    .unwrap();
                Response::new(Body::from("{}"))
            }
        })
        .await;
        let telemetry =
            Telemetry::new(&ControlPlaneConfig::new(&sink.url, "service-key").unwrap()).unwrap();
        let dropped = Arc::new(Notify::new());
        let upstream = stalled_provider(dropped).await;
        let relay = OpenAiProvider::for_test(
            upstream.url.clone(),
            ProviderLimits {
                active: 1,
                execution_timeout: Duration::from_millis(150),
                ..ProviderLimits::default()
            },
        )
        .with_telemetry(telemetry.clone());
        let context = resolved_request_context("provider-secret").await;
        let response = relay
            .forward(
                relay.try_admit().unwrap(),
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
        assert!(relay.try_admit().is_ok());
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
            metadata["relay_outcome"],
            if cancelled { "cancelled" } else { "timeout" }
        );
        telemetry
            .shutdown(Instant::now() + Duration::from_secs(1))
            .await;
        assert!(received.try_recv().is_err());
        assert_eq!(sink.calls(), 1);
    }
}

#[tokio::test]
async fn compact_posts_compact_path_and_models_get_skips_ingestion() {
    use crate::{resolution::ControlPlaneConfig, telemetry::Telemetry};
    use serde_json::Value;

    const COMPACT: &[u8] =
        br#"{"model":"gpt-4.1","input":[{"encrypted_content":"opaque-ciphertext"}]}"#;
    const COMPACT_RESPONSE: &str =
        r#"{"id":"comp_1","output":[{"encrypted_content":"opaque-ciphertext"}]}"#;
    const MODELS: &str = r#"{"object":"list","data":[{"id":"gpt-4.1","object":"model"}]}"#;

    let (sent, mut received) = tokio::sync::mpsc::channel(2);
    let sink = FakeServer::start(move |request| {
        let sent = sent.clone();
        async move {
            let bytes = to_bytes(request.into_body(), 65536).await.unwrap();
            sent.send(serde_json::from_slice::<Value>(&bytes).unwrap())
                .await
                .unwrap();
            Response::new(Body::from("{}"))
        }
    })
    .await;
    let telemetry =
        Telemetry::new(&ControlPlaneConfig::new(&sink.url, "service-key").unwrap()).unwrap();
    let upstream = FakeServer::start(|request| async move {
        let uri = request.uri().to_string();
        let method = request.method().clone();
        let body = to_bytes(request.into_body(), 4096).await.unwrap();
        match (method.as_str(), uri.as_str()) {
            ("POST", "/v1/responses/compact") => {
                assert_eq!(body, COMPACT);
                Response::builder()
                    .header("content-type", "application/json")
                    .body(Body::from(COMPACT_RESPONSE))
                    .unwrap()
            }
            ("GET", "/v1/models") => {
                assert!(body.is_empty());
                Response::builder()
                    .header("content-type", "application/json")
                    .body(Body::from(MODELS))
                    .unwrap()
            }
            other => panic!("unexpected provider request {other:?}"),
        }
    })
    .await;
    let relay = provider(&upstream, 1).with_telemetry(telemetry.clone());
    let compact = relay
        .forward_route(
            relay.try_admit().unwrap(),
            resolved_request_context("provider-secret").await,
            &HeaderMap::new(),
            Bytes::from_static(COMPACT),
            OpenAiRoute::ResponsesCompact,
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
    let models = relay
        .forward_route(
            relay.try_admit().unwrap(),
            resolved_request_context("provider-secret").await,
            &HeaderMap::new(),
            Bytes::new(),
            OpenAiRoute::Models,
        )
        .await
        .unwrap();
    assert_eq!(to_bytes(models.into_body(), 4096).await.unwrap(), MODELS);
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(received.try_recv().is_err());
    telemetry
        .shutdown(Instant::now() + Duration::from_secs(1))
        .await;
    assert_eq!(sink.calls(), 1);
    assert_eq!(upstream.calls(), 2);
}

fn assert_completed_upload(payload: &serde_json::Value) {
    use serde_json::{Value, json};
    let span = &payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0];
    let attrs = span["attributes"].as_array().unwrap();
    assert!(
        attrs
            .iter()
            .any(|a| a["key"] == "langfuse.observation.model.name"
                && a["value"]["stringValue"] == "actual")
    );
    assert!(
        attrs
            .iter()
            .any(|a| a["key"] == "langfuse.observation.completion_start_time")
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
    assert_eq!(metadata["relay_outcome"], "eof");
    assert_eq!(
        metadata["native_usage"],
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
