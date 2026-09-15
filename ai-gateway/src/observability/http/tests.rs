use super::*;
use axum::{
    Router,
    http::{HeaderMap, Request as HttpRequest},
    middleware,
};
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
use tracing_subscriber::{fmt::format::JsonFields, prelude::*};

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
                    .fmt_fields(JsonFields::new())
                    .event_format(super::super::logging::Format { json: true })
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
            .filter(|event| event["message"] == "gateway request finished")
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
        .header("baggage", "private=content-canary")
        .body(Body::empty())
        .unwrap()
}

#[tokio::test]
async fn inherits_trace_and_preserves_body_frames_and_trailers() {
    let recording = Recording::start();
    let sent = Arc::new(Mutex::new(HeaderMap::new()));
    let captured = sent.clone();
    let app = Router::new()
        .fallback(move || {
            let captured = captured.clone();
            async move {
                client("resolver", async {
                    *captured.lock().unwrap() = web_context();
                    Ok::<_, Infallible>(())
                })
                .await
                .unwrap();
                let mut trailers = HeaderMap::new();
                trailers.insert("x-checksum", "verified".parse().unwrap());
                let frames = [
                    Ok::<_, Infallible>(Frame::data(Bytes::from_static(b"native bytes"))),
                    Ok(Frame::trailers(trailers)),
                ];
                Body::new(StreamBody::new(futures_util::stream::iter(frames)))
            }
        })
        .layer(middleware::from_fn(request));
    let response = app.oneshot(incoming()).await.unwrap();
    assert!(
        recording.summaries().is_empty(),
        "headers are not completion"
    );
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
    assert_eq!(recording.summaries().len(), 1);
    drop(body);
    let summaries = recording.summaries();
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0]["outcome"], "complete");
    let spans = recording.exporter.get_finished_spans().unwrap();
    assert_eq!(spans.len(), 2);
    let server = spans
        .iter()
        .find(|span| span.span_kind == SpanKind::Server)
        .unwrap();
    let resolver = spans
        .iter()
        .find(|span| span.span_kind == SpanKind::Client)
        .unwrap();
    assert_eq!(
        server.span_context.trace_id().to_string(),
        "4bf92f3577b34da6a3ce929d0e0e4736"
    );
    assert_eq!(server.parent_span_id.to_string(), "00f067aa0ba902b7");
    assert_eq!(resolver.parent_span_id, server.span_context.span_id());
    assert_eq!(
        summaries[0]["trace_id"],
        server.span_context.trace_id().to_string()
    );
    assert_eq!(
        summaries[0]["span_id"],
        server.span_context.span_id().to_string()
    );
    let headers = sent.lock().unwrap();
    assert_eq!(
        headers["traceparent"],
        format!(
            "00-{}-{}-01",
            server.span_context.trace_id(),
            resolver.span_context.span_id()
        )
    );
    assert!(!headers.contains_key("baggage"));
}

#[tokio::test]
async fn empty_error_and_cancelled_bodies_have_one_terminal_summary() {
    for outcome in ["complete", "body_error", "cancelled"] {
        let recording = Recording::start();
        let app = Router::new()
            .fallback(move || async move {
                match outcome {
                    "complete" => Body::empty(),
                    "body_error" => Body::from_stream(futures_util::stream::once(async {
                        Err::<Bytes, _>(io::Error::other("body failure"))
                    })),
                    _ => Body::from_stream(futures_util::stream::pending::<
                        Result<Bytes, Infallible>,
                    >()),
                }
            })
            .layer(middleware::from_fn(request));
        let mut body = app.oneshot(incoming()).await.unwrap().into_body();
        match outcome {
            "complete" => assert_eq!(recording.summaries().len(), 1),
            "body_error" => assert!(body.frame().await.unwrap().is_err()),
            _ => assert!(recording.summaries().is_empty()),
        }
        drop(body);
        let summaries = recording.summaries();
        assert_eq!(summaries.len(), 1, "{outcome}");
        assert_eq!(summaries[0]["outcome"], outcome);
        let spans = recording.exporter.get_finished_spans().unwrap();
        assert_eq!(spans.len(), 1);
        if outcome == "body_error" {
            assert!(matches!(
                spans[0].status,
                opentelemetry::trace::Status::Error { .. }
            ));
        }
    }
}

#[tokio::test]
async fn provider_http_errors_are_traced_without_changing_the_response() {
    use crate::{
        providers::openai::{OpenAiProvider, ProviderLimits},
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
        let provider = OpenAiProvider::for_test(upstream.url.clone(), ProviderLimits::default());
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
async fn cancellation_before_headers_finishes_the_request_once() {
    let recording = Recording::start();
    let app = Router::new()
        .fallback(std::future::pending::<Response>)
        .layer(middleware::from_fn(request));
    let mut call = Box::pin(app.oneshot(incoming()));
    assert!(futures_util::poll!(call.as_mut()).is_pending());
    assert!(recording.summaries().is_empty());
    drop(call);
    let summaries = recording.summaries();
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0]["outcome"], "cancelled");
    assert_eq!(summaries[0]["status"], 0);
    assert_eq!(recording.exporter.get_finished_spans().unwrap().len(), 1);
}
