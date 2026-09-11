use super::*;
use crate::{
    providers::openai::{Limits, OpenAi},
    test_support::{FakeServer, resolution_response},
};
use futures_util::{StreamExt, stream};
use std::convert::Infallible;
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle};

struct Gateway {
    url: String,
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<std::io::Result<()>>,
}

impl Gateway {
    async fn start(execution: Option<Execution>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let state = if execution.is_some() {
            AppState::default()
        } else {
            AppState::unconfigured()
        };
        let app = crate::server::router(state.clone()).merge(router(execution, state.clone()));
        let (shutdown, signal) = oneshot::channel();
        let task = tokio::spawn(crate::server::serve(
            listener,
            app,
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
                };
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("gateway did not start");
    }

    fn post(&self) -> reqwest::RequestBuilder {
        reqwest::Client::new().post(format!("{}/openai/v1/responses", self.url))
    }
}

impl Drop for Gateway {
    fn drop(&mut self) {
        self.task.abort();
    }
}

fn execution(web: &FakeServer, provider: &FakeServer) -> Execution {
    Execution::for_test(
        web.resolver(),
        OpenAi::for_test(format!("{}/v1/responses", provider.url), Limits::default()),
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
    let gateway = Gateway::start(Some(execution(&web, &provider))).await;
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
async fn malformed_credentials_and_oversized_body_never_resolve_or_execute() {
    let web = FakeServer::start(|_| async { resolution_response("provider-secret") }).await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(execution(&web, &provider))).await;
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
    let gateway = Gateway::start(Some(execution(&web, &provider))).await;
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
    let web = FakeServer::start(|_| async {
        Response::new(Body::from_stream(stream::pending::<
            Result<&'static str, Infallible>,
        >()))
    })
    .await;
    let provider = FakeServer::start(|_| async { Response::new(Body::empty()) }).await;
    let gateway = Gateway::start(Some(execution(&web, &provider))).await;
    let slow_body = gateway
        .post()
        .bearer_auth("key")
        .body(reqwest::Body::wrap_stream(stream::pending::<
            Result<&'static str, Infallible>,
        >()))
        .send();
    let slow_resolution = gateway.post().bearer_auth("key").body("{}").send();
    let (body, resolution) = tokio::time::timeout(Duration::from_secs(12), async {
        tokio::join!(slow_body, slow_resolution)
    })
    .await
    .unwrap();
    assert_eq!(body.unwrap().status(), StatusCode::REQUEST_TIMEOUT);
    assert_eq!(resolution.unwrap().status(), StatusCode::GATEWAY_TIMEOUT);
    assert_eq!(web.calls(), 1);
    assert_eq!(provider.calls(), 0);
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
    let service = Execution::for_test(
        web.resolver(),
        OpenAi::for_test(
            provider.url.clone(),
            Limits {
                active: 1,
                ..Limits::default()
            },
        ),
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
    let service = Execution::for_test(
        web.resolver(),
        OpenAi::for_test(
            provider.url.clone(),
            Limits {
                active: 1,
                ..Limits::default()
            },
        ),
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
    assert_eq!(web.calls(), 2);
    assert_eq!(provider.calls(), 2);
}
