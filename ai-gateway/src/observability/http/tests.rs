use super::*;
use crate::{
    inference::InferenceService,
    providers::{ProviderLimits, ProviderTransport},
    resolution::ControlPlaneConfig,
    server::GatewayLifecycleState,
    telemetry::Telemetry,
    test_support::{FakeServer, resolution_response},
};
use axum::body::Bytes;
use axum::{
    Router,
    http::{HeaderMap, Request as HttpRequest},
};
use http_body::Frame;
use http_body_util::{BodyExt, StreamBody};
use opentelemetry::trace::{SpanKind, TracerProvider};
use opentelemetry_sdk::trace::{InMemorySpanExporter, SdkTracerProvider};
use serde_json::Value;
use std::{
    convert::Infallible,
    io,
    sync::{Arc, Mutex},
};
use tower::ServiceExt;
use tracing::Instrument;
use tracing_subscriber::prelude::*;

#[derive(Clone, Default)]
struct Buffer(Arc<Mutex<Vec<u8>>>);
impl io::Write for Buffer {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

struct Recording {
    _guard: tracing::subscriber::DefaultGuard,
    _provider: SdkTracerProvider,
    exporter: InMemorySpanExporter,
    output: Buffer,
}
impl Recording {
    fn start() -> Self {
        let exporter = InMemorySpanExporter::default();
        let provider = SdkTracerProvider::builder()
            .with_simple_exporter(exporter.clone())
            .build();
        let output = Buffer::default();
        let buffer = output.clone();
        let subscriber = tracing_subscriber::registry()
            .with(
                tracing_subscriber::fmt::layer()
                    .json()
                    .flatten_event(true)
                    .with_writer(move || buffer.clone()),
            )
            .with(tracing_opentelemetry::layer().with_tracer(provider.tracer("test")));
        Self {
            _guard: tracing::subscriber::set_default(subscriber),
            _provider: provider,
            exporter,
            output,
        }
    }
    fn summaries(&self) -> Vec<Value> {
        String::from_utf8(self.output.0.lock().unwrap().clone())
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .filter(|event| event["message"] == "gateway response started")
            .collect()
    }
}

fn incoming() -> HttpRequest<Body> {
    HttpRequest::builder()
        .method("POST")
        .uri("/openai/v1/responses")
        .header(
            "traceparent",
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        )
        .header("tracestate", "caller=state-canary")
        .header("baggage", "private=content-canary")
        .body(Body::empty())
        .unwrap()
}

#[tokio::test]
async fn starts_independent_trace_and_preserves_stream_lifetime_bytes_and_trailers() {
    let recording = Recording::start();
    let app = instrument(Router::new().fallback(|| async {
        let mut trailers = HeaderMap::new();
        trailers.insert("x-checksum", "verified".parse().unwrap());
        let frames = [
            Ok::<_, Infallible>(Frame::data(Bytes::from_static(b"native bytes"))),
            Ok(Frame::trailers(trailers)),
        ];
        Body::new(StreamBody::new(futures_util::stream::iter(frames)))
    }));
    let ambient = tracing::info_span!("ambient");
    let response = app
        .oneshot(incoming())
        .instrument(ambient.clone())
        .await
        .unwrap();
    assert!(recording.exporter.get_finished_spans().unwrap().is_empty());
    let summaries = recording.summaries();
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0]["status"], 200);
    let mut body = response.into_body();
    assert_eq!(
        body.frame().await.unwrap().unwrap().into_data().unwrap(),
        "native bytes"
    );
    let trailers = body
        .frame()
        .await
        .unwrap()
        .unwrap()
        .into_trailers()
        .unwrap();
    assert_eq!(trailers["x-checksum"], "verified");
    assert!(body.frame().await.is_none());
    drop(body);
    let spans = recording.exporter.get_finished_spans().unwrap();
    assert_eq!(spans.len(), 1);
    let server = &spans[0];
    assert_eq!(server.span_kind, SpanKind::Server);
    assert_ne!(
        server.span_context.trace_id().to_string(),
        "4bf92f3577b34da6a3ce929d0e0e4736"
    );
    assert_ne!(
        server.span_context.trace_id(),
        ambient.context().span().span_context().trace_id()
    );
    assert_eq!(server.parent_span_id, opentelemetry::trace::SpanId::INVALID);
    assert!(server.span_context.trace_state().header().is_empty());
    assert_eq!(
        summaries[0]["trace_id"],
        server.span_context.trace_id().to_string()
    );
    assert_eq!(
        summaries[0]["span_id"],
        server.span_context.span_id().to_string()
    );
}

#[tokio::test]
async fn cancellation_releases_spans_before_and_after_headers() {
    for before_headers in [true, false] {
        let recording = Recording::start();
        let app = instrument(Router::new().fallback(move || async move {
            if before_headers {
                std::future::pending::<()>().await;
            }
            Body::from_stream(futures_util::stream::pending::<Result<Bytes, Infallible>>())
        }));
        if before_headers {
            let mut call = Box::pin(app.oneshot(incoming()));
            assert!(futures_util::poll!(call.as_mut()).is_pending());
            drop(call);
        } else {
            let response = app.oneshot(incoming()).await.unwrap();
            assert!(recording.exporter.get_finished_spans().unwrap().is_empty());
            drop(response);
        }
        assert_eq!(recording.exporter.get_finished_spans().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn provider_http_errors_are_traced_without_changing_the_response() {
    use crate::{
        providers::{ProviderLimits, ProviderTransport},
        test_support::{FakeServer, resolved_request_context},
    };
    for status in [429, 500] {
        let context = resolved_request_context("provider-secret").await;
        let upstream = FakeServer::start(move |_| async move {
            Response::builder()
                .status(status)
                .body(Body::from("native error"))
                .unwrap()
        })
        .await;
        let provider =
            ProviderTransport::for_test(format!("{}/v1", upstream.url), ProviderLimits::default());
        let recording = Recording::start();
        let response = provider
            .forward(
                provider.try_admit().unwrap(),
                context,
                &HeaderMap::new(),
                Bytes::from_static(b"{}"),
            )
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), status);
        assert_eq!(
            axum::body::to_bytes(response.into_body(), 100)
                .await
                .unwrap(),
            "native error"
        );
        let spans = recording.exporter.get_finished_spans().unwrap();
        let upstream_span = spans
            .iter()
            .find(|span| span.name == "provider.headers")
            .unwrap();
        assert!(matches!(
            upstream_span.status,
            opentelemetry::trace::Status::Error { .. }
        ));
        assert!(
            upstream_span
                .attributes
                .iter()
                .any(
                    |attribute| attribute.key.as_str() == "http.response.status_code"
                        && attribute.value == opentelemetry::Value::I64(i64::from(status))
                )
        );
        assert_eq!(upstream.calls(), 1);
    }
}

#[tokio::test]
async fn generation_context_is_isolated_from_operational_spans_and_outbound_headers() {
    opentelemetry::global::set_text_map_propagator(
        opentelemetry_sdk::propagation::TraceContextPropagator::new(),
    );
    let observed = Arc::new(Mutex::new(Vec::new()));
    let web_calls = observed.clone();
    let web = FakeServer::start(move |request| {
        let web_calls = web_calls.clone();
        async move {
            let (parts, body) = request.into_parts();
            let bytes = axum::body::to_bytes(body, 64 * 1024).await.unwrap();
            let ingestion = parts.uri.path() == "/api/public/otel/v1/traces";
            web_calls.lock().unwrap().push((
                if ingestion { "ingestion" } else { "resolver" },
                parts.headers,
                if ingestion {
                    crate::test_support::upload_json(&bytes)
                } else {
                    serde_json::from_slice::<Value>(&bytes).unwrap()
                },
            ));
            if ingestion {
                Response::new(Body::from("{}"))
            } else {
                resolution_response("provider-secret")
            }
        }
    })
    .await;
    let provider_calls = observed.clone();
    let provider = FakeServer::start(move |request| {
        provider_calls.lock().unwrap().push((
            "provider.headers",
            request.headers().clone(),
            Value::Null,
        ));
        async {
            Response::builder()
                .header("content-type", "application/json")
                .body(Body::from(PROVIDER_RESPONSE))
                .unwrap()
        }
    })
    .await;
    let telemetry = Telemetry::new(
        &ControlPlaneConfig::new(&web.url, "test-service-key").unwrap(),
        crate::telemetry::DEFAULT_RETAINED_BYTES,
    )
    .unwrap();
    let service = InferenceService::for_test(
        web.control_plane(),
        ProviderTransport::for_test(provider.url.clone(), ProviderLimits::default())
            .with_telemetry(telemetry.clone()),
        1,
    );
    let recording = Recording::start();
    let lifecycle = GatewayLifecycleState::default();
    let app = instrument(crate::http::router(Some(service), lifecycle.clone()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut serving = Box::pin(crate::server::serve(
        listener,
        app.clone(),
        lifecycle,
        std::future::pending(),
        Duration::from_secs(1),
    ));
    assert!(futures_util::poll!(serving.as_mut()).is_pending());
    let response = app.oneshot(generation_request()).await.unwrap();
    assert_eq!(response.status(), 200);
    axum::body::to_bytes(response.into_body(), 4096)
        .await
        .unwrap();
    telemetry
        .shutdown(tokio::time::Instant::now() + Duration::from_secs(2))
        .await;
    let spans = recording.exporter.get_finished_spans().unwrap();
    let server = spans
        .iter()
        .find(|span| span.span_kind == SpanKind::Server)
        .unwrap();
    assert_eq!(server.parent_span_id, opentelemetry::trace::SpanId::INVALID);
    assert_ne!(
        server.span_context.trace_id().to_string(),
        "4bf92f3577b34da6a3ce929d0e0e4736"
    );
    assert_phase_spans(&spans, server);
    let observed = observed.lock().unwrap();
    assert_eq!(observed.len(), 3);
    for (name, headers, payload) in &*observed {
        let child = spans.iter().find(|span| span.name == *name).unwrap();
        assert_outbound_context(headers, (*name != "provider.headers").then_some(child));
        if *name == "ingestion" {
            assert_generation_context(payload);
        }
    }
}

type SpanData = opentelemetry_sdk::trace::SpanData;

/// Every phase between the caller's headers and the last body byte has a span in
/// the server trace, so a waterfall shows no unattributed wall time. Batched
/// ingestion runs in its own trace, linked back to each request it carries.
fn assert_phase_spans(spans: &[SpanData], server: &SpanData) {
    let named = |name: &str| spans.iter().find(|span| span.name == name).unwrap();
    assert_eq!(spans.len(), 9);
    for (name, parent) in [
        ("resolution", server),
        ("resolver", named("resolution")),
        ("request.body", server),
        ("request.capture", server),
        ("provider.headers", server),
        ("provider.stream", server),
    ] {
        let child = named(name);
        assert_eq!(
            child.span_context.trace_id(),
            server.span_context.trace_id(),
            "{name}"
        );
        assert!(child.span_context.trace_state().header().is_empty());
        assert_eq!(
            child.parent_span_id,
            parent.span_context.span_id(),
            "{name}"
        );
    }
    let batch = named("telemetry.batch");
    assert_eq!(batch.parent_span_id, opentelemetry::trace::SpanId::INVALID);
    assert_ne!(
        batch.span_context.trace_id(),
        server.span_context.trace_id()
    );
    assert_eq!(
        batch
            .links
            .iter()
            .map(|link| link.span_context.clone())
            .collect::<Vec<_>>(),
        std::slice::from_ref(&server.span_context)
    );
    assert_attribute(batch, "gateway.telemetry.records", 1i64);
    assert_attribute(batch, "gateway.telemetry.attempts", 1i64);
    let ingestion = named("ingestion");
    assert_eq!(ingestion.parent_span_id, batch.span_context.span_id());
    assert_eq!(
        ingestion.span_context.trace_id(),
        batch.span_context.trace_id()
    );
    let request_bytes = i64::try_from(GENERATION_REQUEST.len()).unwrap();
    assert_attribute(server, "http.request.body.size", request_bytes);
    assert_attribute(server, "gateway.outcome", "eof");
    assert!(
        server
            .attributes
            .iter()
            .any(|attribute| attribute.key.as_str() == "gateway.first_byte_ms")
    );
    assert_attribute(
        named("request.body"),
        "http.request.body.size",
        request_bytes,
    );
    assert_attribute(
        named("request.capture"),
        "http.request.body.size",
        request_bytes,
    );
    assert_attribute(named("resolution"), "gateway.outcome", "admitted");
    let stream = named("provider.stream");
    assert_attribute(stream, "gateway.outcome", "eof");
    assert_attribute(
        stream,
        "http.response.body.size",
        i64::try_from(PROVIDER_RESPONSE.len()).unwrap(),
    );
    assert_attribute(stream, "gateway.chunks", 1i64);
    assert_eq!(stream.status, opentelemetry::trace::Status::Unset);
}

fn assert_attribute(span: &SpanData, key: &str, expected: impl Into<opentelemetry::Value>) {
    let actual = span
        .attributes
        .iter()
        .find(|attribute| attribute.key.as_str() == key)
        .unwrap_or_else(|| panic!("{} lacks {key}", span.name));
    assert_eq!(actual.value, expected.into(), "{} {key}", span.name);
}

const GENERATION_REQUEST: &str = r#"{"model":"test-model"}"#;
const PROVIDER_RESPONSE: &str = r#"{"id":"resp_1","output":[]}"#;

fn generation_request() -> HttpRequest<Body> {
    HttpRequest::post("/openai/v1/responses")
        .header("authorization", "Bearer gateway-secret")
        .header(
            "traceparent",
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
        )
        .header("tracestate", "caller=state-canary")
        .header(
            "baggage",
            "langfuse_user_id=baggage-user,langfuse_metadata_source=python",
        )
        .header("langfuse-trace-name", "caller trace")
        .header("langfuse-user-id", "caller-user")
        .header("langfuse-session-id", "caller-session")
        .header("langfuse-tags", "one,two")
        .header("langfuse-metadata", "team:search")
        .body(Body::from(GENERATION_REQUEST))
        .unwrap()
}

fn assert_outbound_context(headers: &HeaderMap, span: Option<&opentelemetry_sdk::trace::SpanData>) {
    if let Some(span) = span {
        assert!(
            headers
                .get("tracestate")
                .is_none_or(axum::http::HeaderValue::is_empty)
        );
        assert_eq!(
            headers["traceparent"],
            format!(
                "00-{}-{}-01",
                span.span_context.trace_id(),
                span.span_context.span_id()
            )
        );
    } else {
        assert!(!headers.contains_key("traceparent"));
        assert!(!headers.contains_key("tracestate"));
    }
    for name in [
        "baggage",
        "langfuse-trace-name",
        "langfuse-user-id",
        "langfuse-session-id",
        "langfuse-tags",
        "langfuse-metadata",
    ] {
        assert!(
            !headers.contains_key(name),
            "unexpected outbound header {name}"
        );
    }
}

fn assert_generation_context(payload: &Value) {
    let span = &payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0];
    assert_eq!(span["traceId"], "4bf92f3577b34da6a3ce929d0e0e4736");
    assert_eq!(span["parentSpanId"], "00f067aa0ba902b7");
    assert_eq!(span["traceState"], "caller=state-canary");
    assert_eq!(span["flags"], 1);
    let attributes: std::collections::HashMap<_, _> = span["attributes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|attribute| {
            (
                attribute["key"].as_str().unwrap(),
                attribute["value"]["stringValue"].as_str().unwrap(),
            )
        })
        .collect();
    for (key, expected) in [
        ("langfuse.trace.name", "caller trace"),
        ("user.id", "caller-user"),
        ("session.id", "caller-session"),
        ("langfuse.trace.tags", r#"["one","two"]"#),
    ] {
        assert_eq!(attributes[key], expected);
    }
    let metadata: Value =
        serde_json::from_str(attributes["langfuse.observation.metadata"]).unwrap();
    assert_eq!(metadata["team"], "search");
    assert_eq!(metadata["source"], "python");
}
