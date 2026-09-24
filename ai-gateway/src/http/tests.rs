use super::*;
use crate::{
    providers::{ProviderLimits, ProviderTransport},
    resolution::ApiFormat,
    test_support::{FakeServer, resolution_response, resolution_response_for},
};
use futures_util::{StreamExt, stream};
use std::{convert::Infallible, task::Poll};
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle};
use tower::ServiceExt;

#[tokio::test]
async fn invalid_credentials_are_rejected_before_admission_or_body_reads() {
    let web = FakeServer::start(|_| async {
        Response::builder()
            .status(StatusCode::UNAUTHORIZED)
            .body(Body::empty())
            .unwrap()
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let provider_client = ProviderTransport::for_test(
        provider.url.clone(),
        ProviderLimits {
            active: 1,
            ..ProviderLimits::default()
        },
    );
    let permit = provider_client.try_admit().unwrap();
    let gateway = Gateway::start(Some(InferenceService::for_test(
        web.control_plane(),
        provider_client,
        1,
    )))
    .await;
    // Exercise both an exhausted and an available execution pool.
    for occupied in [Some(permit), None] {
        let body = Body::from_stream(stream::poll_fn(
            |_| -> Poll<Option<Result<&'static str, Infallible>>> {
                panic!("an invalid credential must be rejected before polling the body");
            },
        ));
        let response = tokio::time::timeout(
            Duration::from_secs(2),
            gateway.app.clone().oneshot(
                Request::post("/openai/v1/responses")
                    .header(header::AUTHORIZATION, "Bearer invalid-key")
                    .body(body)
                    .unwrap(),
            ),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        drop(occupied);
    }
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 0);
}

struct Gateway {
    url: String,
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<std::io::Result<()>>,
    app: Router,
}

#[tokio::test]
async fn resolution_capacity_is_bounded_and_released_on_cancellation_and_failure() {
    let entered = Arc::new(tokio::sync::Notify::new());
    let started = entered.clone();
    let web = FakeServer::start(move |request| {
        let started = started.clone();
        async move {
            match request.headers()[header::AUTHORIZATION].to_str().unwrap() {
                "Bearer stalled" => {
                    started.notify_one();
                    std::future::pending().await
                }
                "Bearer invalid" => Response::builder()
                    .status(StatusCode::UNAUTHORIZED)
                    .body(Body::empty())
                    .unwrap(),
                _ => resolution_response("provider"),
            }
        }
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let service = InferenceService::for_test(
        web.control_plane(),
        ProviderTransport::for_test(provider.url.clone(), ProviderLimits::default()),
        1,
    );
    let gateway = Gateway::start(Some(service)).await;
    let request = |key| {
        Request::post("/openai/v1/responses")
            .header(header::AUTHORIZATION, key)
            .body(Body::from("{}"))
            .unwrap()
    };
    let mut stalled = Box::pin(gateway.app.clone().oneshot(request("Bearer stalled")));
    tokio::time::timeout(Duration::from_secs(2), async {
        tokio::select! {
            () = entered.notified() => {},
            _ = &mut stalled => panic!("resolution should be pending"),
        }
    })
    .await
    .unwrap();
    let busy = tokio::time::timeout(
        Duration::from_secs(2),
        gateway.app.clone().oneshot(request("Bearer valid")),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(busy.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(web.calls(), 1);
    assert_eq!(provider.calls(), 0);

    drop(stalled);
    for (key, status) in [
        ("Bearer invalid", StatusCode::UNAUTHORIZED),
        ("Bearer valid", StatusCode::OK),
    ] {
        let response = tokio::time::timeout(
            Duration::from_secs(2),
            gateway.app.clone().oneshot(request(key)),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(response.status(), status);
    }
    assert_eq!(web.calls(), 3);
    assert_eq!(provider.calls(), 1);
}

impl Gateway {
    async fn start(inference: Option<InferenceService>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let state = if inference.is_some() {
            GatewayLifecycleState::default()
        } else {
            GatewayLifecycleState::unconfigured()
        };
        let app = crate::server::router(state.clone()).merge(router(inference, state.clone()));
        let (shutdown, signal) = oneshot::channel();
        let task = tokio::spawn(crate::server::serve(
            listener,
            app.clone(),
            state,
            async {
                let _ = signal.await;
            },
            Duration::from_secs(1),
        ));
        let client = reqwest::Client::new();
        for _ in 0..100 {
            if client.get(format!("{url}/health")).send().await.is_ok() {
                return Self {
                    url,
                    shutdown: Some(shutdown),
                    task,
                    app,
                };
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("gateway did not start");
    }

    fn post(&self) -> reqwest::RequestBuilder {
        reqwest::Client::new().post(format!("{}/openai/v1/responses", self.url))
    }

    fn compact(&self) -> reqwest::RequestBuilder {
        reqwest::Client::new().post(format!("{}/openai/v1/responses/compact", self.url))
    }

    fn models(&self) -> reqwest::RequestBuilder {
        reqwest::Client::new().get(format!("{}/openai/v1/models", self.url))
    }
}

impl Drop for Gateway {
    fn drop(&mut self) {
        self.task.abort();
    }
}

fn inference(web: &FakeServer, provider: &FakeServer) -> InferenceService {
    InferenceService::for_test(
        web.control_plane(),
        ProviderTransport::for_test(format!("{}/v1", provider.url), ProviderLimits::default()),
        128,
    )
}

#[tokio::test]
async fn native_json_and_sse_traverse_resolution_and_relay() {
    let web = FakeServer::start(|request| async move {
        assert_eq!(request.uri(), "/api/internal/ai-gateway/v1/resolve");
        assert!(
            request
                .headers()
                .contains_key("langfuse-gateway-authorization")
        );
        let key = request.headers()[header::AUTHORIZATION]
            .to_str()
            .unwrap()
            .to_owned();
        assert_eq!(
            to_bytes(request.into_body(), 1024).await.unwrap(),
            r#"{"apiFormat":"openai.responses"}"#
        );
        resolution_response(if key == "Bearer gateway-json" {
            "provider-json"
        } else {
            "provider-sse"
        })
    })
    .await;
    let provider = FakeServer::start(|request| async move {
        assert_eq!(request.uri(), "/v1/responses");
        assert!(!request.headers().contains_key("x-langfuse-project-id"));
        assert!(
            !request
                .headers()
                .contains_key("langfuse-gateway-authorization")
        );
        let key = request.headers()[header::AUTHORIZATION]
            .to_str()
            .unwrap()
            .to_owned();
        let body = to_bytes(request.into_body(), 4096).await.unwrap();
        if key == "Bearer provider-json" {
            assert_eq!(body, "{ \"model\":\"unchanged\", \"unknown\":true }");
            Response::builder()
                .header("content-type", "application/json")
                .body(Body::from("{\"output\":[]}"))
                .unwrap()
        } else {
            assert_eq!(key, "Bearer provider-sse");
            assert_eq!(body, r#"{"model":"anything","stream":true}"#);
            Response::builder()
                .header("content-type", "text/event-stream")
                .body(Body::from_stream(stream::iter([
                    Ok::<_, Infallible>("event: arbitrary\ndata: "),
                    Ok("hello\n\n"),
                ])))
                .unwrap()
        }
    })
    .await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let json = gateway
        .post()
        .bearer_auth("gateway-json")
        .header("x-langfuse-project-id", "attacker-project")
        .body("{ \"model\":\"unchanged\", \"unknown\":true }")
        .send();
    let sse = gateway
        .post()
        .bearer_auth("gateway-sse")
        .body(r#"{"model":"anything","stream":true}"#)
        .send();
    let (json, sse) = tokio::join!(json, sse);
    let json = json.unwrap();
    let sse = sse.unwrap();
    assert_eq!(json.status(), StatusCode::OK);
    assert_eq!(json.text().await.unwrap(), r#"{"output":[]}"#);
    assert_eq!(sse.headers()[header::CONTENT_TYPE], "text/event-stream");
    assert_eq!(
        sse.text().await.unwrap(),
        "event: arbitrary\ndata: hello\n\n"
    );
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 2);
}

#[tokio::test]
async fn compact_relays_opaque_json_and_models_proxies_openai_list_without_query() {
    let web = FakeServer::start(|_| async { resolution_response("provider-secret") }).await;
    let provider = FakeServer::start(|request| async move {
        let method = request.method().clone();
        let uri = request.uri().to_string();
        let body = to_bytes(request.into_body(), 4096).await.unwrap();
        match (method.as_str(), uri.as_str()) {
            ("POST", "/v1/responses/compact") => {
                assert_eq!(
                    body,
                    r#"{"model":"gpt-4.1","encrypted_content":"opaque-ciphertext"}"#
                );
                Response::builder()
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"id":"comp_1","object":"response.compaction","encrypted_content":"opaque-ciphertext"}"#,
                    ))
                    .unwrap()
            }
            ("GET", "/v1/models") => {
                assert!(body.is_empty());
                Response::builder()
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"object":"list","data":[{"id":"gpt-4.1","object":"model"}]}"#,
                    ))
                    .unwrap()
            }
            other => panic!("unexpected provider request {other:?}"),
        }
    })
    .await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let compact = gateway
        .compact()
        .bearer_auth("gateway-key")
        .body(r#"{"model":"gpt-4.1","encrypted_content":"opaque-ciphertext"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(compact.status(), StatusCode::OK);
    assert_eq!(
        compact.text().await.unwrap(),
        r#"{"id":"comp_1","object":"response.compaction","encrypted_content":"opaque-ciphertext"}"#
    );
    let models = reqwest::Client::new()
        .get(format!(
            "{}/openai/v1/models?secret=query-canary",
            gateway.url
        ))
        .bearer_auth("gateway-key")
        .send()
        .await
        .unwrap();
    assert_eq!(models.status(), StatusCode::OK);
    assert_eq!(
        models.text().await.unwrap(),
        r#"{"object":"list","data":[{"id":"gpt-4.1","object":"model"}]}"#
    );
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 2);
}

#[tokio::test]
async fn malformed_credentials_skip_resolution_and_oversized_body_releases_capacity() {
    let web = FakeServer::start(|_| async { resolution_response("provider-secret") }).await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let service = InferenceService::for_test(
        web.control_plane(),
        ProviderTransport::for_test(
            provider.url.clone(),
            ProviderLimits {
                active: 1,
                ..ProviderLimits::default()
            },
        ),
        1,
    );
    let gateway = Gateway::start(Some(service)).await;
    for authorization in [
        None,
        Some("Basic abc"),
        Some("Bearer "),
        Some("Bearer key,other"),
        Some("Bearer key extra"),
    ] {
        let mut request = gateway.post();
        if let Some(value) = authorization {
            request = request.header(header::AUTHORIZATION, value);
        }
        let response = request.send().await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body: serde_json::Value =
            serde_json::from_slice(&response.bytes().await.unwrap()).unwrap();
        assert_eq!(body["error"]["code"], "invalid_api_key");
    }
    let mut headers = HeaderMap::new();
    headers.append(header::AUTHORIZATION, "Bearer one".parse().unwrap());
    headers.append(header::AUTHORIZATION, "Bearer two".parse().unwrap());
    assert_eq!(
        gateway
            .post()
            .headers(headers)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(web.calls(), 0);
    let response = gateway
        .post()
        .bearer_auth("valid-key")
        .body(vec![b'x'; MAX_REQUEST_BYTES + 1])
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(web.calls(), 1);
    assert_eq!(provider.calls(), 0);
    let next = gateway
        .post()
        .bearer_auth("valid-key")
        .body("{}")
        .send()
        .await
        .unwrap();
    assert_eq!(next.status(), StatusCode::OK);
    assert_eq!(provider.calls(), 1);
}

#[tokio::test]
async fn resolution_failures_are_sanitized_and_never_call_provider() {
    let web = FakeServer::start(|request| async move {
        let key = request.headers()[header::AUTHORIZATION].to_str().unwrap();
        match key {
            "Bearer malformed" => Response::new(Body::from("secret malformed response")),
            "Bearer invalid-origin" => {
                let body = to_bytes(resolution_response("provider-secret").into_body(), 4096)
                    .await
                    .unwrap();
                let mut body: serde_json::Value = serde_json::from_slice(&body).unwrap();
                body["connection"]["base_url"] = "https://attacker.example/v1".into();
                Response::new(Body::from(body.to_string()))
            }
            _ => {
                let status: u16 = key.strip_prefix("Bearer ").unwrap().parse().unwrap();
                Response::builder()
                    .status(status)
                    .body(Body::from("secret upstream error"))
                    .unwrap()
            }
        }
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    for (key, status) in [
        ("401", 401),
        ("403", 403),
        ("404", 404),
        ("503", 503),
        ("malformed", 502),
        ("invalid-origin", 502),
    ] {
        let response = gateway
            .post()
            .bearer_auth(key)
            .body("{}")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), status);
        let body = response.text().await.unwrap();
        assert!(!body.contains("secret"));
        assert!(serde_json::from_str::<serde_json::Value>(&body).unwrap()["error"].is_object());
    }
    assert_eq!(provider.calls(), 0);
}

#[tokio::test]
async fn slow_request_body_and_resolution_have_bounded_waits() {
    let web = FakeServer::start(|request| async move {
        if request.headers()[header::AUTHORIZATION] != "Bearer slow-resolution" {
            return resolution_response("provider");
        }
        Response::new(Body::from_stream(stream::pending::<
            Result<&'static str, Infallible>,
        >()))
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let slow_body = gateway
        .post()
        .bearer_auth("key")
        .body(reqwest::Body::wrap_stream(stream::pending::<
            Result<&'static str, Infallible>,
        >()))
        .send();
    let slow_resolution = gateway
        .post()
        .bearer_auth("slow-resolution")
        .body("{}")
        .send();
    let (body, resolution) = tokio::time::timeout(Duration::from_secs(12), async {
        tokio::join!(slow_body, slow_resolution)
    })
    .await
    .unwrap();
    assert_eq!(body.unwrap().status(), StatusCode::REQUEST_TIMEOUT);
    assert_eq!(resolution.unwrap().status(), StatusCode::GATEWAY_TIMEOUT);
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 0);
}

#[tokio::test]
async fn pre_header_provider_failures_export_the_status_returned_to_the_caller() {
    use crate::{resolution::ControlPlaneConfig, telemetry::Telemetry};
    use serde_json::Value;

    for expected in [StatusCode::GATEWAY_TIMEOUT, StatusCode::BAD_GATEWAY] {
        let (sent, mut received) = tokio::sync::mpsc::channel(1);
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
            Telemetry::for_test(&ControlPlaneConfig::new(&sink.url, "service-key").unwrap());
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream_url = format!("http://{}", upstream.local_addr().unwrap());
        let upstream_task = tokio::spawn(async move {
            let (_connection, _) = upstream.accept().await.unwrap();
            if expected == StatusCode::GATEWAY_TIMEOUT {
                std::future::pending::<()>().await;
            }
        });
        let web = FakeServer::start(|_| async { resolution_response("provider-secret") }).await;
        let provider = ProviderTransport::for_test(
            upstream_url,
            ProviderLimits {
                headers_timeout: Duration::from_millis(100),
                ..ProviderLimits::default()
            },
        )
        .with_telemetry(telemetry.clone());
        let gateway = Gateway::start(Some(InferenceService::for_test(
            web.control_plane(),
            provider,
            1,
        )))
        .await;
        let response = gateway
            .post()
            .bearer_auth("gateway-key")
            .body(r#"{"model":"requested","input":"hello"}"#)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let payload = tokio::time::timeout(Duration::from_secs(2), received.recv())
            .await
            .unwrap()
            .unwrap();
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
            metadata["langfuse.gateway.response.status_code"],
            response.status().as_u16()
        );
        assert!(
            metadata
                .get("langfuse.gateway.upstream.request.id")
                .is_none()
        );
        telemetry
            .shutdown(tokio::time::Instant::now() + Duration::from_secs(1))
            .await;
        assert_eq!(sink.calls(), 1);
        upstream_task.abort();
    }
}

#[tokio::test]
async fn unconfigured_gateway_is_live_but_not_ready_and_inference_is_unavailable() {
    let gateway = Gateway::start(None).await;
    let client = reqwest::Client::new();
    assert_eq!(
        client
            .get(format!("{}/health", gateway.url))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        client
            .get(format!("{}/ready", gateway.url))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        gateway.post().send().await.unwrap().status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        gateway.models().send().await.unwrap().status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
}

#[tokio::test]
async fn active_admission_is_held_through_stream_and_shutdown_drains_it() {
    let (release, released) = tokio::sync::watch::channel(false);
    let web = FakeServer::start(|_| async { resolution_response("provider") }).await;
    let provider = FakeServer::start(move |_| {
        let mut released = released.clone();
        async move {
            let stream = stream::once(async { Ok::<_, Infallible>("data: first\n\n") }).chain(
                stream::once(async move {
                    released.wait_for(|done| *done).await.unwrap();
                    Ok("data: last\n\n")
                }),
            );
            Response::builder()
                .header("content-type", "text/event-stream")
                .body(Body::from_stream(stream))
                .unwrap()
        }
    })
    .await;
    let service = InferenceService::for_test(
        web.control_plane(),
        ProviderTransport::for_test(
            provider.url.clone(),
            ProviderLimits {
                active: 1,
                ..ProviderLimits::default()
            },
        ),
        1,
    );
    let mut gateway = Gateway::start(Some(service)).await;
    let mut response = gateway
        .post()
        .bearer_auth("key")
        .body("{}")
        .send()
        .await
        .unwrap();
    assert_eq!(response.chunk().await.unwrap().unwrap(), "data: first\n\n");
    assert_eq!(
        gateway
            .post()
            .bearer_auth("key")
            .body("{}")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 1);
    gateway.shutdown.take().unwrap().send(()).unwrap();
    assert!(!gateway.task.is_finished());
    release.send(true).unwrap();
    assert_eq!(response.text().await.unwrap(), "data: last\n\n");
    tokio::time::timeout(Duration::from_secs(2), &mut gateway.task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn client_disconnect_releases_capacity_for_the_next_request() {
    let web = FakeServer::start(|_| async { resolution_response("provider") }).await;
    let provider = FakeServer::start(|_| async {
        let stream =
            stream::once(async { Ok::<_, Infallible>("data: first\n\n") }).chain(stream::pending());
        Response::builder()
            .header("content-type", "text/event-stream")
            .body(Body::from_stream(stream))
            .unwrap()
    })
    .await;
    let service = InferenceService::for_test(
        web.control_plane(),
        ProviderTransport::for_test(
            provider.url.clone(),
            ProviderLimits {
                active: 1,
                ..ProviderLimits::default()
            },
        ),
        1,
    );
    let gateway = Gateway::start(Some(service)).await;
    let mut first = gateway
        .post()
        .bearer_auth("key")
        .body("{}")
        .send()
        .await
        .unwrap();
    assert_eq!(first.chunk().await.unwrap().unwrap(), "data: first\n\n");
    drop(first);
    let mut next = tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            let response = gateway
                .post()
                .bearer_auth("key")
                .body("{}")
                .send()
                .await
                .unwrap();
            if response.status() == StatusCode::OK {
                break response;
            }
            assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(next.chunk().await.unwrap().unwrap(), "data: first\n\n");
    assert!(web.calls() >= 2);
    assert_eq!(provider.calls(), 2);
}

fn anthropic_gateway_key(request: &Request<Body>) -> Option<String> {
    request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim_start_matches("Bearer ").to_owned())
}

#[tokio::test]
async fn anthropic_messages_accept_either_credential_header_and_relay_native_sse() {
    let web = FakeServer::start(|request| async move {
        let key = anthropic_gateway_key(&request).unwrap();
        assert_eq!(
            to_bytes(request.into_body(), 1024).await.unwrap(),
            r#"{"apiFormat":"anthropic.messages"}"#
        );
        if key == "gateway-anthropic" {
            resolution_response_for(ApiFormat::AnthropicMessages, "provider-anthropic")
        } else {
            Response::builder()
                .status(StatusCode::UNAUTHORIZED)
                .body(Body::empty())
                .unwrap()
        }
    })
    .await;
    let provider = FakeServer::start(|request| async move {
        assert_eq!(request.uri(), "/v1/messages");
        assert_eq!(request.headers()["x-api-key"], "provider-anthropic");
        assert_eq!(request.headers()["anthropic-version"], "2023-06-01");
        assert!(!request.headers().contains_key(header::AUTHORIZATION));
        Response::builder()
            .header("content-type", "text/event-stream")
            .header("request-id", "req_upstream")
            .body(Body::from_stream(stream::iter([
                Ok::<_, Infallible>("event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"usage\":{\"input_tokens\":3,\"output_tokens\":1}}}\n\n"),
                Ok("event: ping\ndata: {\"type\":\"ping\"}\n\n"),
                Ok("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"),
            ])))
            .unwrap()
    })
    .await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let client = reqwest::Client::new();
    // Claude Code sends x-api-key for ANTHROPIC_API_KEY, Authorization for
    // ANTHROPIC_AUTH_TOKEN, and both when a helper supplies one credential.
    for credential_headers in [
        vec![("x-api-key", "gateway-anthropic")],
        vec![("authorization", "Bearer gateway-anthropic")],
        vec![
            ("x-api-key", "gateway-anthropic"),
            ("authorization", "Bearer gateway-anthropic"),
        ],
    ] {
        let mut request = client
            .post(format!("{}/anthropic/v1/messages?beta=true", gateway.url))
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .body(r#"{"model":"claude-sonnet-4-5","stream":true,"messages":[]}"#);
        for (name, value) in credential_headers {
            request = request.header(name, value);
        }
        let response = request.send().await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["request-id"], "req_upstream");
        let body = response.text().await.unwrap();
        assert!(body.starts_with("event: message_start\n"));
        assert!(body.ends_with("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"));
    }
    assert_eq!(web.calls(), 3);
    assert_eq!(provider.calls(), 3);
}

type EnvelopeCase = (
    &'static [(&'static str, &'static str)],
    StatusCode,
    &'static str,
    Option<&'static str>,
);

#[tokio::test]
async fn anthropic_credential_conflicts_and_failures_use_the_native_error_envelope() {
    let web = FakeServer::start(|request| async move {
        let status = match anthropic_gateway_key(&request).as_deref() {
            Some("forbidden") => StatusCode::FORBIDDEN,
            Some("unrouted") => StatusCode::NOT_FOUND,
            _ => StatusCode::UNAUTHORIZED,
        };
        Response::builder()
            .status(status)
            .body(Body::from("private-web-body"))
            .unwrap()
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let client = reqwest::Client::new();
    let cases: [EnvelopeCase; 6] = [
        (
            &[
                ("x-api-key", "real-anthropic-key"),
                ("authorization", "Bearer gateway-key"),
            ],
            StatusCode::UNAUTHORIZED,
            "authentication_error",
            Some("Conflicting gateway credentials in the Authorization and x-api-key headers"),
        ),
        (&[], StatusCode::UNAUTHORIZED, "authentication_error", None),
        (
            &[("x-api-key", "bad key")],
            StatusCode::UNAUTHORIZED,
            "authentication_error",
            None,
        ),
        (
            &[("authorization", "Basic Zm9v")],
            StatusCode::UNAUTHORIZED,
            "authentication_error",
            None,
        ),
        (
            &[("x-api-key", "forbidden")],
            StatusCode::FORBIDDEN,
            "permission_error",
            None,
        ),
        (
            &[("x-api-key", "unrouted")],
            StatusCode::NOT_FOUND,
            "not_found_error",
            None,
        ),
    ];
    for (credential_headers, status, kind, message) in cases {
        let mut request = client
            .post(format!("{}/anthropic/v1/messages", gateway.url))
            .body("{}");
        for (name, value) in credential_headers {
            request = request.header(*name, *value);
        }
        let response = request.send().await.unwrap();
        assert_eq!(response.status(), status, "{credential_headers:?}");
        let body: serde_json::Value =
            serde_json::from_str(&response.text().await.unwrap()).unwrap();
        assert_eq!(body["type"], "error", "{credential_headers:?}");
        assert_eq!(body["error"]["type"], kind, "{credential_headers:?}");
        assert!(body["error"]["message"].is_string());
        if let Some(message) = message {
            assert_eq!(body["error"]["message"], message);
        }
        assert!(!body.to_string().contains("private-web-body"));
    }
    // Conflicting or malformed credentials never reach Web; the two Web rejections do.
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 0);
}

#[tokio::test]
async fn anthropic_capacity_rejections_use_the_native_envelope() {
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let busy = ProviderTransport::for_test(
        format!("{}/v1", provider.url),
        ProviderLimits {
            active: 1,
            ..ProviderLimits::default()
        },
    );
    let _held = busy.try_admit().unwrap();
    let web = FakeServer::start(|_| async {
        resolution_response_for(ApiFormat::AnthropicMessages, "provider-anthropic")
    })
    .await;
    let gateway = Gateway::start(Some(InferenceService::for_test(
        web.control_plane(),
        busy,
        1,
    )))
    .await;
    let response = reqwest::Client::new()
        .post(format!("{}/anthropic/v1/messages", gateway.url))
        .header("x-api-key", "gateway-anthropic")
        .body("{}")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    let body: serde_json::Value = serde_json::from_str(&response.text().await.unwrap()).unwrap();
    assert_eq!(body["error"]["type"], "overloaded_error");
    assert_eq!(provider.calls(), 0);
}

#[tokio::test]
async fn openai_routes_ignore_x_api_key_and_keep_their_envelope() {
    let web = FakeServer::start(|_| async {
        Response::builder()
            .status(StatusCode::UNAUTHORIZED)
            .body(Body::empty())
            .unwrap()
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let response = gateway
        .post()
        .header("x-api-key", "gateway-key")
        .body("{}")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let body: serde_json::Value = serde_json::from_str(&response.text().await.unwrap()).unwrap();
    assert_eq!(body["error"]["code"], "invalid_api_key");
    assert!(body.get("type").is_none());
    assert_eq!(web.calls(), 0);
}

#[tokio::test]
async fn anthropic_routes_share_the_request_body_limit() {
    let web = FakeServer::start(|_| async {
        resolution_response_for(ApiFormat::AnthropicMessages, "provider-anthropic")
    })
    .await;
    let provider = FakeServer::start(|request| async move {
        let body = to_bytes(request.into_body(), MAX_REQUEST_BYTES)
            .await
            .unwrap();
        assert_eq!(body.len(), MAX_REQUEST_BYTES);
        Response::new(Body::empty())
    })
    .await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let client = reqwest::Client::new();
    for path in ["messages", "messages/count_tokens"] {
        let send = |size| {
            client
                .post(format!("{}/anthropic/v1/{path}", gateway.url))
                .header("x-api-key", "gateway-anthropic")
                .body(vec![b'x'; size])
                .send()
        };
        assert_eq!(
            send(MAX_REQUEST_BYTES).await.unwrap().status(),
            StatusCode::OK
        );
        let rejected = send(MAX_REQUEST_BYTES + 1).await.unwrap();
        assert_eq!(rejected.status(), StatusCode::PAYLOAD_TOO_LARGE);
        let body: serde_json::Value =
            serde_json::from_str(&rejected.text().await.unwrap()).unwrap();
        assert_eq!(body["error"]["type"], "request_too_large");
    }
    assert_eq!(provider.calls(), 2);
}
