use std::{sync::Arc, time::Duration};

use axum::{
    body::{Body, to_bytes},
    http::Response,
};
use serde_json::{Value, json};
use tokio::sync::Notify;

use super::{otlp::ExportError, *};
use crate::{
    capture::RelayOutcome,
    resolution::signing,
    test_support::{FakeServer, resolved_request_context},
};

fn facts(project: &str) -> InferenceFacts {
    InferenceFacts {
        api_format: "openai.responses",
        start_time_unix_ms: 1_735_689_600_000,
        duration_ms: 100,
        first_byte_ms: Some(10),
        completion_start_ms: None,
        http_status: Some(200),
        metadata: json!({"project_id": project, "ingestion_mode": "usage"}),
        outcome: RelayOutcome::Eof,
        inference: crate::capture::ProviderFacts::default(),
    }
}

async fn grant() -> DeliveryContext {
    DeliveryContext::from_resolved(
        &resolved_request_context("provider-secret").await,
        &HeaderMap::new(),
    )
}

fn uploader(url: &str) -> Uploader {
    Uploader::new(&ControlPlaneConfig::new(url, "test-service-key").unwrap()).unwrap()
}

fn response(status: u16, body: impl Into<Body>) -> Response<Body> {
    Response::builder()
        .status(status)
        .body(body.into())
        .unwrap()
}

#[tokio::test]
async fn immediate_upload_uses_prefixed_path_signed_grant_and_gateway_sdk_headers() {
    let web = FakeServer::start(|request| async move {
        assert_eq!(request.method(), "POST");
        assert_eq!(request.uri().path(), "/app/api/public/otel/v1/traces");
        let headers = request.headers();
        assert_eq!(headers["authorization"], "Bearer private-ingestion-token");
        let signature = headers["langfuse-gateway-authorization"].to_str().unwrap();
        let timestamp = signature
            .strip_prefix("HMAC timestamp=")
            .unwrap()
            .split_once(',')
            .unwrap()
            .0
            .parse()
            .unwrap();
        assert_eq!(
            signature,
            signing::authorization("test-service-key", "private-ingestion-token", timestamp)
        );
        assert_eq!(headers["content-type"], "application/json");
        assert_eq!(headers["x-langfuse-sdk-name"], "langfuse-ai-gateway");
        assert_eq!(headers["x-langfuse-sdk-version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(headers["x-langfuse-ingestion-version"], "4");
        let bytes = to_bytes(request.into_body(), 64 * 1024).await.unwrap();
        let payload: Value = serde_json::from_slice(&bytes).unwrap();
        let spans = payload["resourceSpans"][0]["scopeSpans"][0]["spans"]
            .as_array()
            .unwrap();
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0]["traceId"].as_str().unwrap().len(), 32);
        assert_eq!(spans[0]["spanId"].as_str().unwrap().len(), 16);
        let body = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(!body.contains("provider-secret"));
        assert!(!body.contains("private-ingestion-token"));
        response(200, "{}")
    })
    .await;
    let telemetry = Telemetry::new(
        &ControlPlaneConfig::new(&format!("{}/app", web.url), "test-service-key").unwrap(),
    )
    .unwrap();
    telemetry.record(grant().await, facts("project-1"));
    telemetry
        .shutdown(Instant::now() + Duration::from_secs(2))
        .await;
    assert_eq!(web.calls(), 1);
    assert_eq!(telemetry.0.stats.accepted.load(Ordering::Relaxed), 1);
    assert_eq!(telemetry.0.stats.failed.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn concurrent_projects_keep_their_original_grants_and_attribution() {
    let observed = Arc::new(Mutex::new(Vec::new()));
    let received = observed.clone();
    let both_uploads = Arc::new(tokio::sync::Barrier::new(2));
    let web = FakeServer::start(move |request| {
        let received = received.clone();
        let both_uploads = both_uploads.clone();
        async move {
            both_uploads.wait().await;
            let authorization = request.headers()["authorization"]
                .to_str()
                .unwrap()
                .to_owned();
            let bytes = to_bytes(request.into_body(), 64 * 1024).await.unwrap();
            let payload: Value = serde_json::from_slice(&bytes).unwrap();
            let attributes = payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"]
                .as_array()
                .unwrap();
            let metadata = attributes
                .iter()
                .find(|attribute| attribute["key"] == "langfuse.observation.metadata")
                .unwrap();
            let metadata: Value =
                serde_json::from_str(metadata["value"]["stringValue"].as_str().unwrap()).unwrap();
            received.lock().unwrap().push((
                authorization,
                metadata["langfuse.gateway.project_id"]
                    .as_str()
                    .unwrap()
                    .to_owned(),
            ));
            response(200, "{}")
        }
    })
    .await;
    let telemetry = Telemetry::with_uploader(uploader(&web.url), 2, MAX_RETAINED_BYTES);
    for project in ["project-a", "project-b"] {
        let mut grant = grant().await;
        grant.project_id = project.into();
        grant.access_token = format!("token-{project}");
        telemetry.record(grant, facts(project));
    }
    telemetry
        .shutdown(Instant::now() + Duration::from_secs(2))
        .await;
    let mut actual = observed.lock().unwrap().clone();
    actual.sort();
    assert_eq!(
        actual,
        vec![
            ("Bearer token-project-a".into(), "project-a".into()),
            ("Bearer token-project-b".into(), "project-b".into())
        ]
    );
    assert_eq!(telemetry.0.stats.accepted.load(Ordering::Relaxed), 2);
}

#[tokio::test]
async fn upload_response_failures_are_reported_without_retries() {
    let grant = grant().await;
    for (status, body, expected) in [
        (500, "{}", Err(ExportError::Rejected)),
        (
            200,
            r#"{"partialSuccess":{"rejectedSpans":"1"}}"#,
            Err(ExportError::Partial),
        ),
        (
            200,
            r#"{"partialSuccess":{"rejectedSpans":1}}"#,
            Err(ExportError::Partial),
        ),
        (
            200,
            r#"{"partialSuccess":{"rejectedSpans":"bad"}}"#,
            Err(ExportError::Response),
        ),
        (200, "[]", Err(ExportError::Response)),
        (200, "not json", Err(ExportError::Response)),
        (200, r#"{"partialSuccess":{"rejectedSpans":"0"}}"#, Ok(())),
    ] {
        let web = FakeServer::start(move |_| async move { response(status, body) }).await;
        assert_eq!(
            uploader(&web.url).export(&grant, &[json!({})]).await,
            expected
        );
        assert_eq!(web.calls(), 1);
    }
    // Streaming without Content-Length must obey the response bound too.
    let web = FakeServer::start(|_| async move {
        let chunks = futures_util::stream::iter([Ok::<_, std::io::Error>(vec![b' '; 65 * 1024])]);
        response(200, Body::from_stream(chunks))
    })
    .await;
    assert_eq!(
        uploader(&web.url).export(&grant, &[json!({})]).await,
        Err(ExportError::Response)
    );
    assert_eq!(web.calls(), 1);
}

#[tokio::test]
async fn redirects_do_not_forward_the_ingestion_credentials() {
    let destination = FakeServer::start(|_| async { response(200, "{}") }).await;
    let location = destination.url.clone();
    let web = FakeServer::start(move |_| {
        let location = location.clone();
        async move {
            Response::builder()
                .status(307)
                .header("location", location)
                .body(Body::empty())
                .unwrap()
        }
    })
    .await;
    assert_eq!(
        uploader(&web.url)
            .export(&grant().await, &[json!({})])
            .await,
        Err(ExportError::Rejected)
    );
    assert_eq!(web.calls(), 1);
    assert_eq!(destination.calls(), 0);
}

#[tokio::test]
async fn expired_grants_and_oversized_payloads_never_reach_the_network() {
    let web = FakeServer::start(|_| async { response(200, "{}") }).await;
    let uploader = uploader(&web.url);
    let mut expired = grant().await;
    expired.expires_at = 1;
    assert_eq!(
        uploader.export(&expired, &[json!({})]).await,
        Err(ExportError::Expired)
    );
    let oversized = json!({"oversized": "x".repeat(8 * 1024 * 1024)});
    assert_eq!(
        uploader.export(&grant().await, &[oversized]).await,
        Err(ExportError::Payload)
    );
    assert_eq!(web.calls(), 0);
}

#[tokio::test]
async fn upload_capacity_and_shutdown_deadline_bound_hanging_delivery() {
    let started = Arc::new(Notify::new());
    let received = started.clone();
    let web = FakeServer::start(move |_| {
        let received = received.clone();
        async move {
            received.notify_one();
            std::future::pending::<()>().await;
            response(200, "{}")
        }
    })
    .await;
    let telemetry = Telemetry::with_uploader(uploader(&web.url), 1, MAX_RETAINED_BYTES);
    telemetry.record(grant().await, facts("project-1"));
    tokio::time::timeout(Duration::from_secs(2), started.notified())
        .await
        .unwrap();
    telemetry.record(grant().await, facts("project-1"));
    assert_eq!(telemetry.0.stats.dropped.load(Ordering::Relaxed), 1);
    telemetry.shutdown(Instant::now()).await;
    assert_eq!(telemetry.0.stats.dropped.load(Ordering::Relaxed), 2);
    assert_eq!(telemetry.0.capacity.available_permits(), 1);
    assert_eq!(telemetry.0.bytes.available_permits(), MAX_RETAINED_BYTES);
    telemetry.record(grant().await, facts("project-1"));
    assert_eq!(telemetry.0.stats.dropped.load(Ordering::Relaxed), 3);
    assert_eq!(web.calls(), 1);
}

#[tokio::test]
async fn retained_byte_budget_is_released_after_successful_drain() {
    let started = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let received = started.clone();
    let gate = release.clone();
    let web = FakeServer::start(move |_| {
        let received = received.clone();
        let gate = gate.clone();
        async move {
            received.notify_one();
            gate.notified().await;
            response(200, "{}")
        }
    })
    .await;
    let grant = grant().await;
    let budget = serde_json::to_vec(&facts("project-1")).unwrap().len()
        + grant.access_token.len()
        + grant.project_id.len()
        + serde_json::to_vec(&grant.generation).unwrap().len();
    let telemetry = Telemetry::with_uploader(uploader(&web.url), 2, budget);
    telemetry.record(grant, facts("project-1"));
    tokio::time::timeout(Duration::from_secs(2), started.notified())
        .await
        .unwrap();
    assert_eq!(telemetry.0.bytes.available_permits(), 0);
    let second = DeliveryContext::from_resolved(
        &resolved_request_context("provider-secret").await,
        &HeaderMap::new(),
    );
    telemetry.record(second, facts("project-1"));
    assert_eq!(telemetry.0.stats.dropped.load(Ordering::Relaxed), 1);
    release.notify_one();
    telemetry
        .shutdown(Instant::now() + Duration::from_secs(2))
        .await;
    assert_eq!(telemetry.0.bytes.available_permits(), budget);
    assert_eq!(telemetry.0.capacity.available_permits(), 2);
    assert_eq!(telemetry.0.stats.accepted.load(Ordering::Relaxed), 1);
    assert_eq!(web.calls(), 1);
}

#[tokio::test]
async fn oversized_facts_are_dropped_before_task_admission() {
    let web = FakeServer::start(|_| async { response(200, "{}") }).await;
    let telemetry = Telemetry::with_uploader(uploader(&web.url), 1, MAX_RETAINED_BYTES);
    let mut oversized = facts("project-1");
    oversized.metadata["oversized"] = json!("x".repeat(MAX_FACT_BYTES));
    telemetry.record(grant().await, oversized);
    assert_eq!(telemetry.0.stats.dropped.load(Ordering::Relaxed), 1);
    assert_eq!(telemetry.0.capacity.available_permits(), 1);
    assert_eq!(telemetry.0.bytes.available_permits(), MAX_RETAINED_BYTES);
    telemetry
        .shutdown(Instant::now() + Duration::from_secs(2))
        .await;
    assert_eq!(web.calls(), 0);
}
