use super::*;
use crate::test_support::{FakeServer, resolved_execution};
use axum::{body::to_bytes, http::StatusCode};
use futures_util::{StreamExt, stream};
use std::{convert::Infallible, future::pending};
use tokio::sync::Notify;

fn provider(server: &FakeServer, active: usize) -> OpenAi {
    OpenAi::for_test(
        format!("{}/v1/responses", server.url),
        Limits {
            active,
            ..Limits::default()
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
        for name in [
            "cookie",
            "langfuse-gateway-authorization",
            "openai-organization",
            "openai-project",
            "x-api-key",
            "x-forwarded-host",
            "accept-encoding",
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
        .execute(
            relay.admit().unwrap(),
            resolved_execution("provider-secret").await,
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
    assert!(relay.admit().is_ok());
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
            .execute(
                relay.admit().unwrap(),
                resolved_execution("provider-secret").await,
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
        .execute(
            relay.admit().unwrap(),
            resolved_execution("provider-secret").await,
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
    assert!(matches!(relay.admit(), Err(Error::Busy)));
    release.notify_one();
    let mut remaining = Vec::new();
    while let Some(chunk) = body.next().await {
        remaining.extend_from_slice(&chunk.unwrap());
    }
    assert_eq!(remaining, b"data: [DONE]\n\n");
    assert!(relay.admit().is_ok());
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
    let alice = resolved_execution("alice-secret").await;
    let bob = resolved_execution("bob-secret").await;
    let headers = HeaderMap::new();
    let (alice, bob) = tokio::join!(
        relay.execute(
            relay.admit().unwrap(),
            alice,
            &headers,
            Bytes::from_static(b"alice-body")
        ),
        relay.execute(
            relay.admit().unwrap(),
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
        .execute(
            relay.admit().unwrap(),
            resolved_execution("provider-secret").await,
            &HeaderMap::new(),
            Bytes::new(),
        )
        .await
        .unwrap();
    let mut body = response.into_body().into_data_stream();
    assert_eq!(body.next().await.unwrap().unwrap(), "first");
    assert!(matches!(relay.admit(), Err(Error::Busy)));
    drop(body);
    assert!(relay.admit().is_ok());
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
    let relay = OpenAi::for_test(
        upstream.url.clone(),
        Limits {
            headers_timeout: Duration::from_millis(30),
            ..Limits::default()
        },
    );
    let response = relay
        .execute(
            relay.admit().unwrap(),
            resolved_execution("provider-secret").await,
            &HeaderMap::new(),
            Bytes::new(),
        )
        .await;
    assert!(matches!(response, Err(Error::Timeout)));
    assert!(relay.admit().is_ok());

    let dropped = Arc::new(Notify::new());
    let upstream = stalled_provider(dropped.clone()).await;
    let relay = OpenAi::for_test(
        upstream.url.clone(),
        Limits {
            execution_timeout: Duration::from_millis(100),
            ..Limits::default()
        },
    );
    let execution = resolved_execution("provider-secret").await;
    let response = relay
        .execute(
            relay.admit().unwrap(),
            execution,
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
    assert!(relay.admit().is_ok());
}
