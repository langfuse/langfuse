use super::*;
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, Response, StatusCode, header},
    routing::any,
};
use futures_util::{StreamExt, stream};
use serde_json::{Value, json};
use std::{
    convert::Infallible,
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use tokio::{net::TcpListener, task::JoinHandle};

const NOW: u64 = 1_800_000_000;
const NOW_TIME: Duration = Duration::from_secs(NOW);
const SERVICE_KEY: &str = "gateway-web-test-secret-not-for-production";
const GATEWAY_KEY: &str = "gw_test_alice";

struct FakeWeb {
    url: String,
    calls: Arc<AtomicUsize>,
    task: JoinHandle<()>,
}

impl Drop for FakeWeb {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl FakeWeb {
    async fn start<F, Fut>(handler: F) -> Self
    where
        F: Fn(Request<Body>) -> Fut + Clone + Send + Sync + 'static,
        Fut: Future<Output = Response<Body>> + Send + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let app = Router::new().fallback(any(move |request| {
            count.fetch_add(1, Ordering::SeqCst);
            handler(request)
        }));
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        Self { url, calls, task }
    }

    fn resolver(&self) -> Resolver {
        self.resolver_with_limits(Duration::from_secs(2), 256 * 1024)
    }

    fn resolver_with_limits(&self, timeout: Duration, max_response_bytes: usize) -> Resolver {
        let mut config = ResolverConfig::new(&self.url, SERVICE_KEY).unwrap();
        config.limits = Limits {
            timeout,
            max_response_bytes,
        };
        Resolver::new(config).unwrap()
    }

    fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

#[expect(
    clippy::needless_pass_by_value,
    reason = "Response fixtures consume their JSON values, including inline json! expressions"
)]
fn response(value: Value) -> Response<Body> {
    Response::builder()
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(value.to_string()))
        .unwrap()
}

fn success(project: &str, provider_token: &str) -> Value {
    json!({
        "version": 1,
        "connection": {
            "id": "connection-1",
            "provider": "openai",
            "api_format": "openai.responses",
            "base_url": "https://api.openai.com/v1",
            "auth": {"type": "Bearer", "token": provider_token}
        },
        "attribution": {
            "organization_id": "org-1",
            "project_id": project,
            "key_id": "key-1",
            "key_metadata": {"customer": "private-customer-label", "enabled": true, "number": 42}
        },
        "ingestion_mode": "usage",
        "ingestion": {"access_token": "private-ingestion-token", "token_type": "Bearer", "expires_at": NOW + 300}
    })
}

#[tokio::test]
async fn signs_the_exact_key_and_sends_only_the_api_format() {
    let web = FakeWeb::start(|request| async move {
        assert_eq!(request.method(), "POST");
        assert_eq!(request.uri(), "/api/internal/ai-gateway/v1/resolve");
        assert_eq!(request.headers()[header::AUTHORIZATION], "Bearer gw_test_alice");
        assert_eq!(request.headers()[header::CONTENT_TYPE], "application/json");
        assert_eq!(request.headers()["langfuse-gateway-authorization"],
            "HMAC timestamp=1800000000,signature=e104b6baa50d9b766b036e27876683aa1f4bff7f31bb6af66dce6b636a53b2bd");
        assert_eq!(to_bytes(request.into_body(), 1024).await.unwrap(),
            r#"{"apiFormat":"openai.responses"}"#);
        response(success("project-1", "private-provider-token"))
    }).await;

    let context = web
        .resolver()
        .resolve_at(GATEWAY_KEY, ApiFormat::OpenAiResponses, NOW_TIME)
        .await
        .unwrap();
    assert_eq!(context.connection().id(), "connection-1");
    assert_eq!(
        context.connection().provider_token(),
        "private-provider-token"
    );
    assert_eq!(context.attribution().project_id(), "project-1");
    assert_eq!(
        context.ingestion().access_token(),
        "private-ingestion-token"
    );
    let debug = format!("{context:?}");
    for sensitive in [
        SERVICE_KEY,
        GATEWAY_KEY,
        "private-provider-token",
        "private-ingestion-token",
        "private-customer-label",
    ] {
        assert!(
            !debug.contains(sensitive),
            "execution context leaked a secret"
        );
    }
    assert_eq!(web.calls(), 1);
}

#[tokio::test]
async fn denied_and_failed_resolutions_are_classified_without_retries_or_body_leaks() {
    for status in [401, 403, 404, 500, 503] {
        let web = FakeWeb::start(move |_| async move {
            Response::builder()
                .status(status)
                .body(Body::from("private-upstream-error"))
                .unwrap()
        })
        .await;
        let error = web
            .resolver()
            .resolve_at(GATEWAY_KEY, ApiFormat::OpenAiResponses, NOW_TIME)
            .await
            .unwrap_err();
        assert!(match status {
            401 => matches!(error, ResolveError::Authentication),
            403 => matches!(error, ResolveError::Forbidden),
            404 => matches!(error, ResolveError::NoRoute),
            _ => matches!(error, ResolveError::Unavailable),
        });
        assert!(!format!("{error:?} {error}").contains("private-upstream-error"));
        assert_eq!(web.calls(), 1);
    }
}

#[tokio::test]
async fn never_follows_redirects_with_credentials() {
    let destination =
        FakeWeb::start(|_| async { response(success("project-1", "provider-token")) }).await;
    let location = destination.url.clone();
    let web = FakeWeb::start(move |_| {
        let location = location.clone();
        async move {
            Response::builder()
                .status(StatusCode::TEMPORARY_REDIRECT)
                .header(header::LOCATION, location)
                .body(Body::empty())
                .unwrap()
        }
    })
    .await;
    assert!(
        web.resolver()
            .resolve_at(GATEWAY_KEY, ApiFormat::OpenAiResponses, NOW_TIME)
            .await
            .is_err()
    );
    assert_eq!(web.calls(), 1);
    assert_eq!(destination.calls(), 0);
}

#[tokio::test]
async fn rejects_oversized_declared_and_chunked_responses() {
    for declared in [true, false] {
        let web = FakeWeb::start(move |_| async move {
            if declared {
                Response::builder()
                    .header(header::CONTENT_LENGTH, "4096")
                    .body(Body::from("x".repeat(4096)))
                    .unwrap()
            } else {
                let chunks =
                    stream::iter([Ok::<_, Infallible>(vec![b'x'; 80]), Ok(vec![b'y'; 80])]);
                Response::new(Body::from_stream(chunks))
            }
        })
        .await;
        let result = web
            .resolver_with_limits(Duration::from_secs(2), 128)
            .resolve_at(GATEWAY_KEY, ApiFormat::OpenAiResponses, NOW_TIME)
            .await;
        assert!(matches!(result, Err(ResolveError::ResponseTooLarge)));
        assert_eq!(web.calls(), 1);
    }
}

#[tokio::test]
async fn deadline_covers_response_headers_and_body() {
    for delay_headers in [true, false] {
        let web = FakeWeb::start(move |_| async move {
            if delay_headers {
                tokio::time::sleep(Duration::from_secs(1)).await;
                response(success("project-1", "provider-token"))
            } else {
                let first = stream::iter([Ok::<_, Infallible>("{")]);
                let rest = stream::once(async {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    Ok::<_, Infallible>("}")
                });
                Response::new(Body::from_stream(first.chain(rest)))
            }
        })
        .await;
        let result = tokio::time::timeout(
            Duration::from_millis(500),
            web.resolver_with_limits(Duration::from_millis(30), 256 * 1024)
                .resolve_at(GATEWAY_KEY, ApiFormat::OpenAiResponses, NOW_TIME),
        )
        .await
        .expect("resolver must enforce its deadline");
        assert!(matches!(result, Err(ResolveError::Timeout)));
        assert_eq!(web.calls(), 1);
    }
}

#[tokio::test]
async fn malformed_credentials_never_reach_web() {
    let web = FakeWeb::start(|_| async { response(success("project-1", "provider-token")) }).await;
    for key in ["", "has space", "has\r\nheader", "has\ttab"] {
        let result = web
            .resolver()
            .resolve_at(key, ApiFormat::OpenAiResponses, NOW_TIME)
            .await;
        assert!(matches!(result, Err(ResolveError::InvalidCredential)));
    }
    assert_eq!(web.calls(), 0);
}

#[tokio::test]
async fn rejects_a_grant_that_expires_while_resolving_across_a_second_boundary() {
    let web = FakeWeb::start(|_| async {
        tokio::time::sleep(Duration::from_millis(150)).await;
        let mut body = success("project-1", "provider-token");
        body["ingestion"]["expires_at"] = json!(NOW + 1);
        response(body)
    })
    .await;
    let result = web
        .resolver()
        .resolve_at(
            GATEWAY_KEY,
            ApiFormat::OpenAiResponses,
            NOW_TIME + Duration::from_millis(900),
        )
        .await;
    assert!(matches!(result, Err(ResolveError::InvalidResponse)));
}

#[tokio::test]
async fn concurrent_resolutions_keep_credentials_and_contexts_isolated() {
    let web = FakeWeb::start(|request| async move {
        let key = request.headers()[header::AUTHORIZATION].to_str().unwrap();
        match key {
            "Bearer gw_test_alice" => {
                tokio::time::sleep(Duration::from_millis(20)).await;
                response(success("project-alice", "token-alice"))
            }
            "Bearer gw_test_bob" => response(success("project-bob", "token-bob")),
            _ => panic!("unexpected request credential"),
        }
    })
    .await;
    let resolver = web.resolver();
    let (alice, bob) = tokio::join!(
        resolver.resolve_at("gw_test_alice", ApiFormat::OpenAiResponses, NOW_TIME),
        resolver.resolve_at("gw_test_bob", ApiFormat::OpenAiResponses, NOW_TIME),
    );
    let alice = alice.unwrap();
    let bob = bob.unwrap();
    assert_eq!(alice.attribution().project_id(), "project-alice");
    assert_eq!(alice.connection().provider_token(), "token-alice");
    assert_eq!(bob.attribution().project_id(), "project-bob");
    assert_eq!(bob.connection().provider_token(), "token-bob");
    assert_eq!(web.calls(), 2);
}

#[tokio::test]
async fn rejects_incompatible_or_incomplete_execution_contexts() {
    let mutations = [
        ("/version", json!(2)),
        ("/connection/provider", json!({"openai": null})),
        ("/connection/api_format", json!({"openai.responses": null})),
        ("/connection/auth/type", json!({"Bearer": null})),
        ("/ingestion/token_type", json!({"Bearer": null})),
        ("/ingestion_mode", json!({"usage": null})),
        ("/connection/provider", json!("anthropic")),
        ("/connection/api_format", json!("openai.chatcompletions")),
        ("/connection/base_url", json!("https://attacker.example/v1")),
        (
            "/connection/base_url",
            json!("https://api.openai.com.attacker.example/v1"),
        ),
        ("/connection/base_url", json!("http://api.openai.com/v1")),
        (
            "/connection/base_url",
            json!("https://api.openai.com/v1?redirect=elsewhere"),
        ),
        ("/connection/auth/type", json!("Basic")),
        ("/connection/auth/token", json!("")),
        ("/connection/auth/token", json!("bad\r\nheader")),
        ("/connection/id", json!("")),
        ("/attribution/project_id", json!("")),
        (
            "/attribution/key_metadata",
            json!({"nested": {"key": "value"}}),
        ),
        ("/attribution/key_metadata", json!({"null": null})),
        ("/ingestion_mode", json!("none")),
        ("/ingestion/access_token", json!("")),
        ("/ingestion/token_type", json!("Basic")),
        ("/ingestion/expires_at", json!(NOW)),
    ];
    for (pointer, value) in mutations {
        let mut body = success("project-1", "provider-token");
        *body.pointer_mut(pointer).unwrap() = value;
        assert_invalid_context(body).await;
    }
    for field in [
        "version",
        "connection",
        "attribution",
        "ingestion_mode",
        "ingestion",
    ] {
        let mut body = success("project-1", "provider-token");
        body.as_object_mut().unwrap().remove(field);
        assert_invalid_context(body).await;
    }
    let mut body = success("project-1", "provider-token");
    body["unexpected"] = json!(true);
    assert_invalid_context(body).await;
}

async fn assert_invalid_context(body: Value) {
    let web = FakeWeb::start(move |_| {
        let body = body.clone();
        async move { response(body) }
    })
    .await;
    let result = web
        .resolver()
        .resolve_at(GATEWAY_KEY, ApiFormat::OpenAiResponses, NOW_TIME)
        .await;
    assert!(matches!(result, Err(ResolveError::InvalidResponse)));
    assert_eq!(web.calls(), 1);
}

#[tokio::test]
async fn rejects_malformed_json_without_exposing_response_contents() {
    let web = FakeWeb::start(|_| async {
        Response::new(Body::from("private-provider-secret invalid JSON"))
    })
    .await;
    let error = web
        .resolver()
        .resolve_at(GATEWAY_KEY, ApiFormat::OpenAiResponses, NOW_TIME)
        .await
        .unwrap_err();
    assert!(matches!(error, ResolveError::InvalidResponse));
    assert!(!format!("{error:?} {error}").contains("private-provider-secret"));
}

#[test]
fn web_configuration_rejects_unsafe_or_ambiguous_urls() {
    for key in ["", " \n\t"] {
        assert!(matches!(
            ResolverConfig::new("https://web.example", key),
            Err(ResolveError::Configuration)
        ));
    }
    for url in [
        "not a URL",
        "http://web.example",
        "https://user:password@web.example",
        "https://web.example?query=true",
        "https://web.example#fragment",
    ] {
        assert!(matches!(
            ResolverConfig::new(url, SERVICE_KEY),
            Err(ResolveError::Configuration)
        ));
    }
    for url in [
        "https://web.example",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
    ] {
        assert!(ResolverConfig::new(url, SERVICE_KEY).is_ok());
    }
}
