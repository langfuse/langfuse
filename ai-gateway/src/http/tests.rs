use super::*;
use crate::{
    config::{DEFAULT_MAX_REQUEST_BYTES as MAX_REQUEST_BYTES, ExecutionLimits, RequestLimits},
    providers::{ProviderLimits, ProviderTransport},
    resolution::ApiFormat,
    test_support::{FakeServer, resolution_response, resolution_response_for},
};
use axum::body::to_bytes;
use futures_util::{StreamExt, stream};
use std::{
    convert::Infallible,
    io::Write,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle};
use tower::ServiceExt;

#[tokio::test]
async fn control_plane_rejections_do_not_consume_provider_capacity() {
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
        let response = tokio::time::timeout(
            Duration::from_secs(2),
            gateway.app.clone().oneshot(
                Request::post("/openai/v1/responses")
                    .header(header::AUTHORIZATION, "Bearer invalid-key")
                    .body(Body::from(r#"{"model":"Production key:test"}"#))
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
            .body(Body::from(r#"{"model":"Production key:test"}"#))
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
    let body_polled = Arc::new(AtomicBool::new(false));
    let observed = body_polled.clone();
    let body = Body::from_stream(stream::once(async move {
        observed.store(true, Ordering::SeqCst);
        Ok::<_, Infallible>(Bytes::from_static(br#"{"model":"Production key:test"}"#))
    }));
    let busy = tokio::time::timeout(
        Duration::from_secs(2),
        gateway.app.clone().oneshot(
            Request::post("/openai/v1/responses")
                .header(header::AUTHORIZATION, "Bearer valid")
                .body(body)
                .unwrap(),
        ),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(busy.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert!(!body_polled.load(Ordering::SeqCst));
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

#[tokio::test]
async fn slow_body_reads_do_not_consume_resolution_capacity() {
    let web = FakeServer::start(|request| async move {
        if request.uri().path() == "/api/internal/ai-gateway/v1/models" {
            return Response::new(Body::from(
                r#"{"data":[{"id":"Production key:gpt-4.1","provider":"OPENAI","canonicalSlug":"gpt-4.1","displayName":"GPT-4.1","createdAt":"1970-01-01T00:00:10.000Z"}]}"#,
            ));
        }
        resolution_response("provider-secret")
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(InferenceService::for_test(
        web.control_plane(),
        ProviderTransport::for_test(provider.url.clone(), ProviderLimits::default()),
        1,
    )))
    .await;
    let body_entered = Arc::new(tokio::sync::Notify::new());
    let entered = body_entered.clone();
    let held_body = Body::from_stream(stream::once(async move {
        entered.notify_one();
        std::future::pending::<Result<Bytes, Infallible>>().await
    }));
    let mut held = Box::pin(
        gateway.app.clone().oneshot(
            Request::post("/openai/v1/responses")
                .header(header::AUTHORIZATION, "Bearer held")
                .body(held_body)
                .unwrap(),
        ),
    );
    tokio::time::timeout(Duration::from_secs(2), async {
        tokio::select! {
            () = body_entered.notified() => {},
            _ = &mut held => panic!("body read should remain pending"),
        }
    })
    .await
    .unwrap();
    let body_polled = Arc::new(AtomicBool::new(false));
    let observed = body_polled.clone();
    let body = Body::from_stream(stream::once(async move {
        observed.store(true, Ordering::SeqCst);
        Ok::<_, Infallible>(Bytes::from_static(br#"{"model":"connection:model"}"#))
    }));
    let busy = gateway
        .app
        .clone()
        .oneshot(
            Request::post("/openai/v1/responses")
                .header(header::AUTHORIZATION, "Bearer busy")
                .body(body)
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(busy.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert!(!body_polled.load(Ordering::SeqCst));
    let models = gateway
        .app
        .clone()
        .oneshot(
            Request::get("/openai/v1/models")
                .header(header::AUTHORIZATION, "Bearer models")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(models.status(), StatusCode::OK);
    assert_eq!(web.calls(), 1);
    assert_eq!(provider.calls(), 0);
    drop(held);
    let response = gateway
        .app
        .clone()
        .oneshot(
            Request::post("/openai/v1/responses")
                .header(header::AUTHORIZATION, "Bearer released")
                .body(Body::from(r#"{"model":"connection:model"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 1);
}

#[tokio::test]
async fn slow_model_catalogs_do_not_consume_resolution_capacity() {
    let entered = Arc::new(tokio::sync::Notify::new());
    let started = entered.clone();
    let web = FakeServer::start(move |request| {
        let started = started.clone();
        async move {
            if request.uri().path() == "/api/internal/ai-gateway/v1/models" {
                started.notify_one();
                return std::future::pending().await;
            }
            resolution_response("provider-secret")
        }
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(InferenceService::for_test(
        web.control_plane(),
        ProviderTransport::for_test(provider.url.clone(), ProviderLimits::default()),
        1,
    )))
    .await;
    let mut held = Box::pin(
        gateway.app.clone().oneshot(
            Request::get("/openai/v1/models")
                .header(header::AUTHORIZATION, "Bearer models-held")
                .body(Body::empty())
                .unwrap(),
        ),
    );
    tokio::time::timeout(Duration::from_secs(2), async {
        tokio::select! {
            () = entered.notified() => {},
            _ = &mut held => panic!("model catalog should remain pending"),
        }
    })
    .await
    .unwrap();

    let inference = gateway
        .app
        .clone()
        .oneshot(
            Request::post("/openai/v1/responses")
                .header(header::AUTHORIZATION, "Bearer inference")
                .body(Body::from(r#"{"model":"connection:model"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(inference.status(), StatusCode::OK);
    let busy = gateway
        .app
        .clone()
        .oneshot(
            Request::get("/openai/v1/models")
                .header(header::AUTHORIZATION, "Bearer models-busy")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(busy.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 1);
    drop(held);
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

    fn chat_completions(&self) -> reqwest::RequestBuilder {
        reqwest::Client::new().post(format!("{}/openai/v1/chat/completions", self.url))
    }

    fn compact(&self) -> reqwest::RequestBuilder {
        reqwest::Client::new().post(format!("{}/openai/v1/responses/compact", self.url))
    }

    fn models(&self) -> reqwest::RequestBuilder {
        reqwest::Client::new().get(format!("{}/openai/v1/models", self.url))
    }

    fn messages(&self) -> reqwest::RequestBuilder {
        reqwest::Client::new().post(format!("{}/anthropic/v1/messages", self.url))
    }
}

/// Returns the response's `langfuse-request-id` after checking it is a canonical `UUIDv7`.
fn request_id(response: &reqwest::Response) -> String {
    let id = response.headers()["langfuse-request-id"]
        .to_str()
        .unwrap()
        .to_owned();
    assert_eq!(id.len(), 36, "{id}");
    for (index, byte) in id.bytes().enumerate() {
        if [8, 13, 18, 23].contains(&index) {
            assert_eq!(byte, b'-', "{id}");
        } else {
            assert!(matches!(byte, b'0'..=b'9' | b'a'..=b'f'), "{id}");
        }
    }
    assert_eq!(id.as_bytes()[14], b'7', "{id}");
    assert!(
        matches!(id.as_bytes()[19], b'8' | b'9' | b'a' | b'b'),
        "{id}"
    );
    id
}

/// A request that never reaches the provider has no generation, and names only
/// its tenant, and only if it was resolved.
fn assert_pre_upstream_headers(headers: &HeaderMap, resolved: bool) {
    assert!(!headers.contains_key("langfuse-trace-id"));
    assert!(!headers.contains_key("langfuse-observation-id"));
    for name in ["langfuse-organization-id", "langfuse-project-id"] {
        assert_eq!(headers.contains_key(name), resolved, "{name}");
    }
    for name in [
        "langfuse-provider",
        "langfuse-provider-connection-id",
        "langfuse-model",
    ] {
        assert!(!headers.contains_key(name), "{name}");
    }
}

#[tokio::test]
#[expect(
    clippy::too_many_lines,
    reason = "the table keeps native error envelope coverage in one place"
)]
async fn every_error_carries_a_fresh_request_id_in_its_header_and_native_body() {
    let web = FakeServer::start(|request| async move {
        if request.headers().get(header::AUTHORIZATION)
            == Some(&header::HeaderValue::from_static("Bearer valid"))
        {
            let body = to_bytes(request.into_body(), 1024).await.unwrap();
            let api_format =
                serde_json::from_slice::<serde_json::Value>(&body).unwrap()["apiFormat"].clone();
            return resolution_response_for(
                serde_json::from_value(api_format).unwrap(),
                "provider-secret",
            );
        }
        Response::builder()
            .status(StatusCode::UNAUTHORIZED)
            .body(Body::empty())
            .unwrap()
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let unconfigured = Gateway::start(None).await;
    let configured = Gateway::start(Some(inference(&web, &provider))).await;
    let mut seen = std::collections::HashSet::new();
    for (request, status, anthropic, resolved) in [
        (
            unconfigured.post(),
            StatusCode::SERVICE_UNAVAILABLE,
            false,
            false,
        ),
        (
            unconfigured.messages(),
            StatusCode::SERVICE_UNAVAILABLE,
            true,
            false,
        ),
        (configured.post(), StatusCode::UNAUTHORIZED, false, false),
        (
            unconfigured.chat_completions(),
            StatusCode::SERVICE_UNAVAILABLE,
            false,
            false,
        ),
        (
            configured
                .chat_completions()
                .bearer_auth("rejected")
                .body(r#"{"model":"Production key:test"}"#),
            StatusCode::UNAUTHORIZED,
            false,
            false,
        ),
        (
            configured
                .chat_completions()
                .bearer_auth("valid")
                .body(vec![b'x'; MAX_REQUEST_BYTES + 1]),
            StatusCode::PAYLOAD_TOO_LARGE,
            false,
            false,
        ),
        (
            configured
                .post()
                .bearer_auth("rejected")
                .body(r#"{"model":"Production key:test"}"#),
            StatusCode::UNAUTHORIZED,
            false,
            false,
        ),
        (
            configured
                .messages()
                .header("x-api-key", "rejected")
                .body(r#"{"model":"Production key:test"}"#),
            StatusCode::UNAUTHORIZED,
            true,
            false,
        ),
        (
            configured
                .post()
                .bearer_auth("valid")
                .body(vec![b'x'; MAX_REQUEST_BYTES + 1]),
            StatusCode::PAYLOAD_TOO_LARGE,
            false,
            false,
        ),
    ] {
        let response = request
            .header("x-request-id", "client-request")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), status);
        let id = request_id(&response);
        assert_pre_upstream_headers(response.headers(), resolved);
        let body: serde_json::Value =
            serde_json::from_slice(&response.bytes().await.unwrap()).unwrap();
        assert_eq!(body["request_id"], id.as_str());
        if anthropic {
            assert_eq!(body["type"], "error");
            assert!(body["error"]["type"].is_string());
        } else {
            assert!(body["error"]["code"].is_string());
        }
        assert!(seen.insert(id), "request IDs must be unique");
    }
    assert_eq!(provider.calls(), 0);
}

#[tokio::test]
async fn resolved_requests_name_their_tenant_and_the_provider_connection_sent_to() {
    let web = FakeServer::start(|request| async move {
        let body = to_bytes(request.into_body(), 1024).await.unwrap();
        let api_format =
            serde_json::from_slice::<serde_json::Value>(&body).unwrap()["apiFormat"].clone();
        resolution_response_for(
            serde_json::from_value(api_format).unwrap(),
            "provider-secret",
        )
    })
    .await;
    let provider = FakeServer::start(|_| async {
        Response::builder()
            .header("content-type", "application/json")
            .body(Body::from("{}"))
            .unwrap()
    })
    .await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let client = reqwest::Client::new();
    let anthropic = |path: &str, body: &'static str| {
        client
            .post(format!("{}/anthropic/v1/{path}", gateway.url))
            .header("x-api-key", "gateway-anthropic")
            .header("content-type", "application/json")
            .body(body)
    };
    for (request, provider_type) in [
        (
            anthropic(
                "messages/count_tokens",
                r#"{"messages":[],"model":"Production key:claude-opus-4-1"}"#,
            ),
            "anthropic",
        ),
        (
            anthropic(
                "messages",
                r#"{"model":"Production key:claude-opus-4-1","messages":[]}"#,
            ),
            "anthropic",
        ),
    ] {
        let response = request.send().await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let headers = response.headers();
        let header = |name: &str| headers.get(name).map(|value| value.to_str().unwrap());
        assert_eq!(header("langfuse-organization-id"), Some("org-1"));
        assert_eq!(header("langfuse-project-id"), Some("project-1"));
        assert_eq!(header("langfuse-provider"), Some(provider_type));
        assert_eq!(
            header("langfuse-provider-connection-id"),
            Some("connection-1")
        );
        // The model is an operator-side span and log field only.
        assert_eq!(header("langfuse-model"), None);
    }
    assert_eq!(provider.calls(), 2);
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
        let body: serde_json::Value =
            serde_json::from_slice(&to_bytes(request.into_body(), 1024).await.unwrap()).unwrap();
        assert_eq!(body["apiFormat"], "openai.responses");
        assert!(matches!(
            body["model"].as_str(),
            Some("Production key:unchanged" | "Production key:anything")
        ));
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
            assert_eq!(body, r#"{ "model":"provider-model", "unknown":true }"#);
            Response::builder()
                .header("content-type", "application/json")
                .body(Body::from("{\"output\":[]}"))
                .unwrap()
        } else {
            assert_eq!(key, "Bearer provider-sse");
            assert_eq!(body, r#"{"model":"provider-model","stream":true}"#);
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
        .body("{ \"model\":\"Production key:unchanged\", \"unknown\":true }")
        .send();
    let sse = gateway
        .post()
        .bearer_auth("gateway-sse")
        .body(r#"{"model":"Production key:anything","stream":true}"#)
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
async fn compact_rewrites_model_and_models_come_from_the_control_plane() {
    let web = FakeServer::start(|request| async move {
        if request.uri().path() == "/api/internal/ai-gateway/v1/models" {
            assert_eq!(request.uri().query(), Some("api_format=openai.responses"));
            return Response::builder()
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"data":[{"id":"Production key:gpt-4.1","provider":"OPENAI","canonicalSlug":"gpt-4.1","displayName":"GPT-4.1","createdAt":"1970-01-01T00:00:10.000Z"}]}"#,
                ))
                .unwrap();
        }
        resolution_response("provider-secret")
    })
    .await;
    let provider = FakeServer::start(|request| async move {
        let method = request.method().clone();
        let uri = request.uri().to_string();
        let body = to_bytes(request.into_body(), 4096).await.unwrap();
        match (method.as_str(), uri.as_str()) {
            ("POST", "/v1/responses/compact") => {
                assert_eq!(
                    body,
                    r#"{"model":"provider-model","encrypted_content":"opaque-ciphertext"}"#
                );
                Response::builder()
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"id":"comp_1","object":"response.compaction","encrypted_content":"opaque-ciphertext"}"#,
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
        .body(r#"{"model":"Production key:gpt-4.1","encrypted_content":"opaque-ciphertext"}"#)
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
        r#"{"object":"list","data":[{"id":"Production key:gpt-4.1","object":"model","created":10,"owned_by":"openai"}]}"#
    );
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 1);
}

#[tokio::test]
async fn model_routes_request_the_matching_control_plane_catalog() {
    let web = FakeServer::start(|request| async move {
        assert_eq!(request.uri().path(), "/api/internal/ai-gateway/v1/models");
        let api_format = request
            .uri()
            .query()
            .unwrap()
            .strip_prefix("api_format=")
            .unwrap();
        let body = match api_format {
            "openai.responses" => {
                r#"{"data":[{"id":"Production key:gpt-4.1","provider":"OPENAI","canonicalSlug":"gpt-4.1","displayName":"GPT-4.1","createdAt":"1970-01-01T00:00:10.000Z"}]}"#
            }
            "anthropic.messages" => {
                r#"{"data":[{"id":"Production key:claude-sonnet-4-5","provider":"ANTHROPIC","canonicalSlug":"claude-sonnet-4-5","displayName":"Claude Sonnet 4.5","createdAt":"2026-01-01T00:00:00.000Z"}]}"#
            }
            other => panic!("unexpected API format {other}"),
        };
        Response::builder()
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap()
    })
    .await;
    let provider = FakeServer::start(|request| async move {
        panic!("model catalog must not reach a provider: {}", request.uri())
    })
    .await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    for (path, credential, expected) in [
        (
            "openai/v1/models",
            ("authorization", "Bearer gateway-openai"),
            r#"{"object":"list","data":[{"id":"Production key:gpt-4.1","object":"model","created":10,"owned_by":"openai"}]}"#,
        ),
        (
            "anthropic/v1/models",
            ("x-api-key", "gateway-anthropic"),
            r#"{"data":[{"type":"model","id":"Production key:claude-sonnet-4-5","display_name":"Claude Sonnet 4.5","created_at":"2026-01-01T00:00:00.000Z"}],"has_more":false,"first_id":"Production key:claude-sonnet-4-5","last_id":"Production key:claude-sonnet-4-5"}"#,
        ),
    ] {
        let response = reqwest::Client::new()
            .get(format!("{}/{path}", gateway.url))
            .header(credential.0, credential.1)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.text().await.unwrap(), expected);
    }
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 0);
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
    assert_eq!(web.calls(), 0);
    assert_eq!(provider.calls(), 0);
    let next = gateway
        .post()
        .bearer_auth("valid-key")
        .body(r#"{"model":"Production key:test"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(next.status(), StatusCode::OK);
    assert_eq!(web.calls(), 1);
    assert_eq!(provider.calls(), 1);
}

#[tokio::test]
async fn compressed_request_bodies_are_explicitly_rejected() {
    let web = FakeServer::start(|_| async { resolution_response("provider-secret") }).await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder
        .write_all(br#"{"model":"connection:model","input":"hello"}"#)
        .unwrap();
    for (encoding, body) in [
        ("gzip", encoder.finish().unwrap()),
        (
            "zstd",
            b"encoded bytes are rejected before parsing".to_vec(),
        ),
    ] {
        let response = gateway
            .post()
            .bearer_auth("valid-key")
            .header(header::CONTENT_ENCODING, encoding)
            .header(header::CONTENT_TYPE, "application/json")
            .body(body)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
        let body: serde_json::Value =
            serde_json::from_slice(&response.bytes().await.unwrap()).unwrap();
        assert_eq!(body["error"]["code"], "unsupported_content_encoding");
    }
    assert_eq!(web.calls(), 0);
    assert_eq!(provider.calls(), 0);
}

#[tokio::test]
async fn requests_without_a_model_are_rejected_before_resolution() {
    let web = FakeServer::start(|_| async { resolution_response("provider-secret") }).await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;

    let response = gateway
        .post()
        .bearer_auth("valid-key")
        .header(header::CONTENT_TYPE, "application/json")
        .body(r#"{"prompt":{"id":"pmpt_123"}}"#)
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body: serde_json::Value = serde_json::from_slice(&response.bytes().await.unwrap()).unwrap();
    assert_eq!(body["error"]["code"], "invalid_body");
    assert_eq!(web.calls(), 0);
    assert_eq!(provider.calls(), 0);
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
        ("400", 400),
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
            .body(r#"{"model":"Production key:test"}"#)
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
async fn slow_resolution_has_a_bounded_wait() {
    let web = FakeServer::start(|_| async {
        Response::new(Body::from_stream(stream::pending::<
            Result<&'static str, Infallible>,
        >()))
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let resolution = tokio::time::timeout(
        Duration::from_secs(12),
        gateway
            .post()
            .bearer_auth("slow-resolution")
            .body(r#"{"model":"Production key:test"}"#)
            .send(),
    )
    .await
    .unwrap();
    assert_eq!(resolution.unwrap().status(), StatusCode::GATEWAY_TIMEOUT);
    assert_eq!(web.calls(), 1);
    assert_eq!(provider.calls(), 0);
}

#[tokio::test(start_paused = true)]
async fn a_stalled_request_body_times_out_at_the_read_deadline() {
    let web = FakeServer::start(|_| async { resolution_response("provider") }).await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let service = inference(&web, &provider);
    // The 16 MiB default keeps the 10 MiB per 30 seconds minimum upload rate.
    assert_eq!(service.request_read_timeout(), Duration::from_secs(49));
    let gateway = Gateway::start(Some(service)).await;
    let stalled = Body::from_stream(stream::pending::<Result<&'static str, Infallible>>());
    let started = tokio::time::Instant::now();
    let request = gateway.app.clone().oneshot(
        Request::post("/openai/v1/responses")
            .header(header::AUTHORIZATION, "Bearer stalled-upload")
            .body(stalled)
            .unwrap(),
    );
    let response = tokio::time::timeout(Duration::from_secs(120), request)
        .await
        .expect("the router must bound the body read")
        .unwrap();
    assert_eq!(response.status(), StatusCode::REQUEST_TIMEOUT);
    assert_eq!(started.elapsed(), Duration::from_secs(49));
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    assert!(String::from_utf8_lossy(&body).contains("request_timeout"));
    assert_eq!(web.calls(), 0);
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
                sent.send(crate::test_support::upload_json(&bytes))
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
                execution: ExecutionLimits {
                    stall_timeout: Duration::from_millis(100),
                    ..ExecutionLimits::default()
                },
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
            .body(r#"{"model":"requested","input":"hello","stream":true}"#)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let id = request_id(&response);
        let header = |name: &str| response.headers()[name].to_str().unwrap().to_owned();
        let (trace_id, observation_id) = (
            header("langfuse-trace-id"),
            header("langfuse-observation-id"),
        );
        let status = response.status();
        let body: Value = serde_json::from_slice(&response.bytes().await.unwrap()).unwrap();
        assert_eq!(body["request_id"], id.as_str());
        let payload = tokio::time::timeout(Duration::from_secs(2), received.recv())
            .await
            .unwrap()
            .unwrap();
        let span = &payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0];
        assert_eq!(span["traceId"], trace_id.as_str());
        assert_eq!(span["spanId"], observation_id.as_str());
        let attrs = span["attributes"].as_array().unwrap();
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
            status.as_u16()
        );
        assert_eq!(metadata["langfuse.gateway.request.id"], id.as_str());
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
async fn chat_completions_streams_carry_the_request_and_generation_ids() {
    use crate::{resolution::ControlPlaneConfig, telemetry::Telemetry};
    use serde_json::Value;

    const CONTENT: &str = "data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi\"},\"finish_reason\":\"stop\"}],\"usage\":null}\n\n";
    const USAGE: &str = "data: {\"id\":\"chatcmpl-1\",\"choices\":[],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1,\"total_tokens\":3}}\n\n";
    const DONE: &str = "data: [DONE]\n\n";
    let (sent, mut received) = tokio::sync::mpsc::channel(1);
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
    let (resolved, mut resolution_ids) = tokio::sync::mpsc::channel(1);
    let web = chat_completion_resolution_server(resolved).await;
    let provider = FakeServer::start(|request| async move {
        assert_eq!(request.uri(), "/v1/chat/completions");
        Response::builder()
            .header("content-type", "text/event-stream")
            .header("x-request-id", "req-upstream")
            .body(Body::from([CONTENT, USAGE, DONE].concat()))
            .unwrap()
    })
    .await;
    let gateway = Gateway::start(Some(InferenceService::for_test(
        web.control_plane(),
        ProviderTransport::for_test(format!("{}/v1", provider.url), ProviderLimits::default())
            .with_telemetry(telemetry.clone()),
        128,
    )))
    .await;
    let response = gateway
        .chat_completions()
        .bearer_auth("gateway-chat")
        .header("x-request-id", "client-request")
        .body(r#"{"model":"gpt-4.1-mini","messages":[],"stream":true}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let id = request_id(&response);
    let header = |name: &str| response.headers()[name].to_str().unwrap().to_owned();
    let (trace_id, observation_id) = (
        header("langfuse-trace-id"),
        header("langfuse-observation-id"),
    );
    assert_eq!(header("x-request-id"), "req-upstream");
    assert_eq!(
        response.text().await.unwrap(),
        [CONTENT, USAGE, DONE].concat()
    );
    assert_eq!(resolution_ids.recv().await.unwrap(), id);

    let payload = tokio::time::timeout(Duration::from_secs(2), received.recv())
        .await
        .unwrap()
        .unwrap();
    let span = &payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0];
    assert_eq!(span["name"], "openai.chat-completions");
    assert_eq!(span["traceId"], trace_id.as_str());
    assert_eq!(span["spanId"], observation_id.as_str());
    let metadata: Value = serde_json::from_str(
        span["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["key"] == "langfuse.observation.metadata")
            .unwrap()["value"]["stringValue"]
            .as_str()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(metadata["langfuse.gateway.request.id"], id.as_str());
    assert_eq!(
        metadata["langfuse.gateway.client.request.id"],
        "client-request"
    );
    assert_eq!(
        metadata["langfuse.gateway.upstream.request.id"],
        "req-upstream"
    );
    telemetry
        .shutdown(tokio::time::Instant::now() + Duration::from_secs(1))
        .await;
}

async fn chat_completion_resolution_server(
    resolved: tokio::sync::mpsc::Sender<String>,
) -> FakeServer {
    FakeServer::start(move |request| {
        let resolved = resolved.clone();
        async move {
            let id = request.headers()["langfuse-gateway-request-id"]
                .to_str()
                .unwrap()
                .to_owned();
            resolved.send(id).await.unwrap();
            resolution_response_for(ApiFormat::OpenAiChatCompletions, "provider-chat")
        }
    })
    .await
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
        .body(r#"{"model":"Production key:test"}"#)
        .send()
        .await
        .unwrap();
    // The stream is still open, so the ID was sent with the initial headers.
    request_id(&response);
    assert_eq!(response.chunk().await.unwrap().unwrap(), "data: first\n\n");
    assert_eq!(
        gateway
            .post()
            .bearer_auth("key")
            .body(r#"{"model":"Production key:test"}"#)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(web.calls(), 1);
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
        .body(r#"{"model":"Production key:test"}"#)
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
                .body(r#"{"model":"Production key:test"}"#)
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
            r#"{"apiFormat":"anthropic.messages","model":"Production key:claude-sonnet-4-5"}"#
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
        assert_eq!(
            to_bytes(request.into_body(), 4096).await.unwrap(),
            r#"{"model":"provider-model","stream":true,"messages":[]}"#
        );
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
            .body(r#"{"model":"Production key:claude-sonnet-4-5","stream":true,"messages":[]}"#);
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
            .body(r#"{"model":"Production key:test"}"#);
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
async fn model_policy_rejections_use_provider_native_permission_errors() {
    let web = FakeServer::start(|_| async {
        Response::builder()
            .status(StatusCode::FORBIDDEN)
            .header("langfuse-gateway-error-code", "model_not_allowed")
            .body(Body::from("private-web-body"))
            .unwrap()
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;

    let openai = gateway
        .post()
        .bearer_auth("gateway-key")
        .body(r#"{"model":"Production key:gpt-4.1"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(openai.status(), StatusCode::FORBIDDEN);
    let openai_body: serde_json::Value =
        serde_json::from_str(&openai.text().await.unwrap()).unwrap();
    assert_eq!(openai_body["error"]["type"], "permission_error");
    assert_eq!(openai_body["error"]["code"], "model_not_allowed");

    let anthropic = reqwest::Client::new()
        .post(format!("{}/anthropic/v1/messages", gateway.url))
        .header("x-api-key", "gateway-key")
        .body(r#"{"model":"Production key:claude-sonnet-4-5"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(anthropic.status(), StatusCode::FORBIDDEN);
    let anthropic_body: serde_json::Value =
        serde_json::from_str(&anthropic.text().await.unwrap()).unwrap();
    assert_eq!(anthropic_body["error"]["type"], "permission_error");
    assert_eq!(
        anthropic_body["error"]["message"],
        "Model is not allowed for this provider connection"
    );
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
        .body(r#"{"model":"Production key:test"}"#)
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
    for request in [gateway.post(), gateway.chat_completions()] {
        let response = request
            .header("x-api-key", "gateway-key")
            .body("{}")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body: serde_json::Value =
            serde_json::from_str(&response.text().await.unwrap()).unwrap();
        assert_eq!(body["error"]["code"], "invalid_api_key");
        assert!(body.get("type").is_none());
    }
    assert_eq!(web.calls(), 0);
}

#[tokio::test]
async fn chat_completions_resolve_their_own_format_and_relay_native_json_and_errors() {
    let web = FakeServer::start(|request| async move {
        let request: serde_json::Value =
            serde_json::from_slice(&to_bytes(request.into_body(), 1024).await.unwrap()).unwrap();
        assert_eq!(request["apiFormat"], "openai.chat-completions");
        let provider_model = request["model"]
            .as_str()
            .and_then(|model| model.split_once(':'))
            .map(|(_, provider_model)| provider_model)
            .unwrap();
        let bytes = to_bytes(
            resolution_response_for(ApiFormat::OpenAiChatCompletions, "provider-chat").into_body(),
            4096,
        )
        .await
        .unwrap();
        let mut response: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        response["connection"]["provider_model"] = provider_model.into();
        Response::builder()
            .header("content-type", "application/json")
            .body(Body::from(response.to_string()))
            .unwrap()
    })
    .await;
    let provider = FakeServer::start(|request| async move {
        assert_eq!(request.uri(), "/v1/chat/completions");
        assert_eq!(
            request.headers()[header::AUTHORIZATION],
            "Bearer provider-chat"
        );
        let body = to_bytes(request.into_body(), 4096).await.unwrap();
        if body == r#"{"model":"unknown-model","messages":[]}"# {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header("content-type", "application/json")
                .body(Body::from(r#"{"error":{"code":"model_not_found"}}"#))
                .unwrap();
        }
        assert_eq!(body, r#"{ "model":"gpt-4.1-mini", "messages":[] }"#);
        Response::builder()
            .header("content-type", "application/json")
            .body(Body::from(r#"{"id":"chatcmpl-1","choices":[]}"#))
            .unwrap()
    })
    .await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    for (body, status, expected) in [
        (
            r#"{ "model":"Production key:gpt-4.1-mini", "messages":[] }"#,
            StatusCode::OK,
            r#"{"id":"chatcmpl-1","choices":[]}"#,
        ),
        (
            r#"{"model":"Production key:unknown-model","messages":[]}"#,
            StatusCode::NOT_FOUND,
            r#"{"error":{"code":"model_not_found"}}"#,
        ),
    ] {
        let response = gateway
            .chat_completions()
            .bearer_auth("gateway-chat")
            .body(body)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), status);
        assert_eq!(response.text().await.unwrap(), expected);
    }
    let missing = gateway.chat_completions().body("{}").send().await.unwrap();
    assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);
    let body: serde_json::Value = serde_json::from_str(&missing.text().await.unwrap()).unwrap();
    assert_eq!(body["error"]["type"], "authentication_error");
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 2);
}

#[tokio::test]
async fn anthropic_routes_share_the_request_body_limit() {
    let web = FakeServer::start(|_| async {
        resolution_response_for(ApiFormat::AnthropicMessages, "provider-anthropic")
    })
    .await;
    let provider = FakeServer::start(|_| async move { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(inference(&web, &provider))).await;
    let client = reqwest::Client::new();
    for path in ["messages", "messages/count_tokens"] {
        let send = |size| {
            let prefix = r#"{"model":"Production key:test","padding":""#;
            let suffix = r#""}"#;
            let padding = "x".repeat(size - prefix.len() - suffix.len());
            client
                .post(format!("{}/anthropic/v1/{path}", gateway.url))
                .header("x-api-key", "gateway-anthropic")
                .body(format!("{prefix}{padding}{suffix}"))
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

#[tokio::test]
async fn buffered_request_bytes_are_released_once_the_response_ends() {
    let (release, released) = tokio::sync::watch::channel(false);
    let web = FakeServer::start(|_| async { resolution_response("provider") }).await;
    let provider = FakeServer::start(move |request: Request| {
        let mut released = released.clone();
        async move {
            to_bytes(request.into_body(), usize::MAX).await.unwrap();
            released.wait_for(|done| *done).await.unwrap();
            Response::new(Body::empty())
        }
    })
    .await;
    let service = inference(&web, &provider).with_request_limits(RequestLimits {
        max_request_bytes: 64,
        shared_buffer_bytes: 100,
    });
    let gateway = Gateway::start(Some(service)).await;
    let body = |size: usize| {
        let prefix = r#"{"model":"Production key:test","padding":""#;
        format!("{prefix}{}\"}}", "x".repeat(size - prefix.len() - 2))
    };
    let oversized = gateway.post().bearer_auth("key").body(body(65)).send();
    assert_eq!(
        oversized.await.unwrap().status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    // Two 60-byte calls do not fit the 100-byte budget at once.
    let first = tokio::spawn(gateway.post().bearer_auth("key").body(body(60)).send());
    while provider.calls() == 0 {
        tokio::task::yield_now().await;
    }
    let second = gateway.post().bearer_auth("key").body(body(60)).send();
    let second = tokio::time::timeout(Duration::from_secs(5), second)
        .await
        .expect("the first call still holds its bytes while it waits for headers");
    assert_eq!(second.unwrap().status(), StatusCode::SERVICE_UNAVAILABLE);
    release.send(true).unwrap();
    let first = first.await.unwrap().unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    first.bytes().await.unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let next = gateway.post().bearer_auth("key").body(body(60)).send();
            if next.await.unwrap().status() == StatusCode::OK {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("the first call's bytes are released once its response ends");
}

async fn budgeted_service() -> (FakeServer, FakeServer, InferenceService) {
    let web = FakeServer::start(|_| async { resolution_response("provider") }).await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let service = inference(&web, &provider).with_request_limits(RequestLimits {
        max_request_bytes: 64,
        shared_buffer_bytes: 100,
    });
    (web, provider, service)
}

fn streamed_body(chunks: Vec<&'static [u8]>, stall: bool) -> Body {
    let chunks = stream::iter(chunks.into_iter().map(Ok::<_, Infallible>));
    if stall {
        Body::from_stream(chunks.chain(stream::pending()))
    } else {
        Body::from_stream(chunks)
    }
}

#[tokio::test]
async fn a_stalled_upload_holds_only_the_bytes_it_sent() {
    let (_web, _provider, service) = budgeted_service().await;
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_LENGTH, "60".parse().unwrap());
    let stalled = service.try_reserve_request_body().ok().unwrap();
    let read = read_request_body(
        streamed_body(vec![&[b'x'; 10]], true),
        &headers,
        64,
        stalled,
    );
    tokio::pin!(read);
    assert!(
        tokio::time::timeout(Duration::from_millis(50), &mut read)
            .await
            .is_err()
    );
    let mut next = service.try_reserve_request_body().ok().unwrap();
    assert!(next.try_reserve_bytes(91).is_err());
    assert!(next.try_reserve_bytes(90).is_ok());
}

#[tokio::test]
async fn buffered_bytes_reserve_the_allocation_not_just_the_length() {
    let (_web, _provider, service) = budgeted_service().await;
    let held = service.try_reserve_request_body().ok().unwrap();
    let (bytes, _held) = read_request_body(
        streamed_body(vec![&[b'x'; 32], b"x"], false),
        &HeaderMap::new(),
        64,
        held,
    )
    .await
    .ok()
    .unwrap();
    assert_eq!(bytes.len(), 33);
    let mut next = service.try_reserve_request_body().ok().unwrap();
    assert!(next.try_reserve_bytes(37).is_err());
    assert!(next.try_reserve_bytes(36).is_ok());
}

#[test]
fn only_a_literal_true_stream_member_marks_a_streamed_call() {
    for (body, streaming) in [
        (r#"{"model":"m","stream":true}"#, true),
        (r#"{"model":"m","stream":false}"#, false),
        (r#"{"model":"m","stream":"true"}"#, false),
        (r#"{"model":"m","stream":null}"#, false),
        (r#"{"model":"m"}"#, false),
    ] {
        let request = request_body_and_model(Bytes::from_static(body.as_bytes()))
            .ok()
            .unwrap();
        assert_eq!(request.streaming, streaming, "{body}");
        assert_eq!(&body.as_bytes()[request.model_range], br#""m""#);
    }
    for body in [
        r#"{"model":"m","model":"n"}"#,
        r#"{"model":"m","stream":true,"stream":true}"#,
        r#"{"stream":true}"#,
    ] {
        assert!(
            request_body_and_model(Bytes::from_static(body.as_bytes())).is_err(),
            "{body}"
        );
    }
}

#[tokio::test]
async fn only_non_streamed_generations_wait_past_the_stall_for_provider_headers() {
    let web = FakeServer::start(|_| async {
        resolution_response_for(ApiFormat::AnthropicMessages, "provider-anthropic")
    })
    .await;
    let provider = FakeServer::start(|_| async {
        tokio::time::sleep(Duration::from_millis(300)).await;
        Response::new(Body::from("{}"))
    })
    .await;
    let service = InferenceService::for_test(
        web.control_plane(),
        ProviderTransport::for_test(
            format!("{}/v1", provider.url),
            ProviderLimits {
                execution: ExecutionLimits {
                    stall_timeout: Duration::from_millis(100),
                    ..ExecutionLimits::default()
                },
                ..ProviderLimits::default()
            },
        ),
        128,
    );
    let gateway = Gateway::start(Some(service)).await;
    let client = reqwest::Client::new();
    for (path, body, status) in [
        (
            "messages",
            r#"{"model":"Production key:test"}"#,
            StatusCode::OK,
        ),
        (
            "messages",
            r#"{"model":"Production key:test","stream":false}"#,
            StatusCode::OK,
        ),
        (
            "messages",
            r#"{"model":"Production key:test","stream":true}"#,
            StatusCode::GATEWAY_TIMEOUT,
        ),
        (
            "messages/count_tokens",
            r#"{"model":"Production key:test"}"#,
            StatusCode::GATEWAY_TIMEOUT,
        ),
    ] {
        let response = client
            .post(format!("{}/anthropic/v1/{path}", gateway.url))
            .header("x-api-key", "gateway-anthropic")
            .body(body)
            .send()
            .await;
        assert_eq!(response.unwrap().status(), status, "{path} {body}");
    }
}
