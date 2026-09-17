use super::*;
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
        .header("baggage", "private=content-canary")
        .body(Body::empty())
        .unwrap()
}

#[tokio::test]
async fn inherits_trace_and_preserves_stream_lifetime_bytes_and_trailers() {
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
    let response = app.oneshot(incoming()).await.unwrap();
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
    assert_eq!(
        server.span_context.trace_id().to_string(),
        "4bf92f3577b34da6a3ce929d0e0e4736"
    );
    assert_eq!(server.parent_span_id.to_string(), "00f067aa0ba902b7");
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
        let provider =
            OpenAiProvider::for_test(format!("{}/v1", upstream.url), ProviderLimits::default());
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
