use crate::{
    providers::{AnthropicRoute, ProviderLimits, ProviderTransport, Route, forwarded_query},
    resolution::ApiFormat,
    test_support::{FakeServer, resolved_request_context_for},
};
use axum::{
    body::{Body, Bytes, to_bytes},
    http::{HeaderMap, HeaderName, HeaderValue, Response, StatusCode, header},
};

fn transport(server: &FakeServer) -> ProviderTransport {
    ProviderTransport::for_test(
        format!("{}/v1", server.url),
        ProviderLimits {
            active: 1,
            ..ProviderLimits::default()
        },
    )
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
        assert_eq!(to_bytes(request.into_body(), 1024).await.unwrap(), REQUEST);
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
            relay.try_admit().unwrap(),
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
            Bytes::from_static(REQUEST),
            Route::Anthropic(AnthropicRoute::Messages),
            None,
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
async fn count_tokens_relays_the_body_and_models_forwards_only_pagination() {
    let upstream = FakeServer::start(|request| async move {
        let path = request.uri().path().to_owned();
        let query = request.uri().query().map(str::to_owned);
        match path.as_str() {
            "/v1/messages/count_tokens" => {
                assert_eq!(request.method(), "POST");
                assert_eq!(query, None);
                assert_eq!(
                    to_bytes(request.into_body(), 1024).await.unwrap(),
                    r#"{"model":"claude-sonnet-4-5","messages":[]}"#
                );
                Response::builder()
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"input_tokens":42}"#))
                    .unwrap()
            }
            "/v1/models" => {
                assert_eq!(request.method(), "GET");
                assert_eq!(query.as_deref(), Some("limit=1000&after_id=model_x"));
                assert!(request.headers().get(header::CONTENT_LENGTH).is_none());
                Response::builder()
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"data":[{"id":"claude-sonnet-4-5"}]}"#))
                    .unwrap()
            }
            other => panic!("unexpected upstream path {other}"),
        }
    })
    .await;
    let relay = transport(&upstream);
    for (route, query, body, expected) in [
        (
            AnthropicRoute::CountTokens,
            Some("beta=true"),
            r#"{"model":"claude-sonnet-4-5","messages":[]}"#,
            r#"{"input_tokens":42}"#,
        ),
        (
            AnthropicRoute::Models,
            Some("limit=1000&evil=1&after_id=model_x"),
            "",
            r#"{"data":[{"id":"claude-sonnet-4-5"}]}"#,
        ),
    ] {
        let context =
            resolved_request_context_for(ApiFormat::AnthropicMessages, "provider-secret", "usage")
                .await;
        let route = Route::Anthropic(route);
        let query = forwarded_query(route, query);
        let response = relay
            .forward_route(
                relay.try_admit().unwrap(),
                context,
                &headers(&[("content-type", "application/json")]),
                Bytes::from(body),
                route,
                query.as_deref(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            to_bytes(response.into_body(), 1024).await.unwrap(),
            expected
        );
    }
    assert_eq!(upstream.calls(), 2);
}

#[test]
fn only_inference_routes_capture_generations_and_only_models_forwards_query() {
    assert!(Route::Anthropic(AnthropicRoute::Messages).captures_generation());
    assert!(!Route::Anthropic(AnthropicRoute::CountTokens).captures_generation());
    assert!(!Route::Anthropic(AnthropicRoute::Models).captures_generation());
    assert_eq!(
        forwarded_query(
            Route::Anthropic(AnthropicRoute::Messages),
            Some("beta=true&limit=5")
        ),
        None
    );
    assert_eq!(
        forwarded_query(
            Route::Anthropic(AnthropicRoute::Models),
            Some("before_id=a&limit=&evil&after_id=b%20c")
        ),
        Some("before_id=a&limit=&after_id=b%20c".to_owned())
    );
    assert_eq!(
        forwarded_query(Route::Anthropic(AnthropicRoute::Models), Some("evil=1")),
        None
    );
}

#[test]
fn openai_and_anthropic_admissions_draw_from_one_execution_budget() {
    let relay = ProviderTransport::for_test(
        "http://127.0.0.1:9".to_owned(),
        ProviderLimits {
            active: 1,
            ..ProviderLimits::default()
        },
    );
    let held = relay.try_admit().unwrap();
    assert!(relay.try_admit().is_err());
    drop(held);
    let held = relay.try_admit().unwrap();
    assert!(relay.try_admit().is_err());
    drop(held);
    assert!(relay.try_admit().is_ok());
}
