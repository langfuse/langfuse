use axum::http::Extensions;
use reqwest::{Client, Request, Response};
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware, Extension, Result};
use reqwest_tracing::{
    DefaultSpanBackend, OtelName, ReqwestOtelSpanBackend, TracingMiddleware,
    default_on_request_success,
};
use tracing::Span;

pub(crate) fn instrument_client(client: Client, name: &'static str) -> ClientWithMiddleware {
    ClientBuilder::new(client)
        .with_init(Extension(OtelName(name.into())))
        .with(TracingMiddleware::<SafeSpanBackend>::new())
        .build()
}

struct SafeSpanBackend;

impl ReqwestOtelSpanBackend for SafeSpanBackend {
    fn on_request_start(request: &Request, extensions: &mut Extensions) -> Span {
        DefaultSpanBackend::on_request_start(request, extensions)
    }

    fn on_request_end(span: &Span, outcome: &Result<Response>, _: &mut Extensions) {
        match outcome {
            Ok(response) => {
                default_on_request_success(span, response);
                span.record(
                    "http.response.status_code",
                    i64::from(response.status().as_u16()),
                );
            }
            // Default failure fields include URLs and raw cause chains.
            Err(error) => {
                span.record("otel.status_code", "ERROR");
                span.record(
                    "error.message",
                    if error.is_timeout() {
                        "timeout"
                    } else {
                        "transport"
                    },
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, http::HeaderMap, routing::post};
    use opentelemetry::{
        KeyValue,
        baggage::BaggageExt,
        trace::{FutureExt, TraceContextExt, TracerProvider},
    };
    use opentelemetry_sdk::{
        propagation::TraceContextPropagator,
        trace::{InMemorySpanExporter, SdkTracerProvider},
    };
    use reqwest_tracing::DisableOtelPropagation;
    use tracing::instrument::WithSubscriber;
    use tracing_opentelemetry::OpenTelemetrySpanExt;
    use tracing_subscriber::prelude::*;

    #[tokio::test]
    async fn middleware_preserves_safe_context_and_sanitizes_transport_errors() {
        opentelemetry::global::set_text_map_propagator(TraceContextPropagator::new());
        let exporter = InMemorySpanExporter::default();
        let provider = SdkTracerProvider::builder()
            .with_simple_exporter(exporter.clone())
            .build();
        let subscriber = tracing::Dispatch::new(
            tracing_subscriber::registry()
                .with(tracing_opentelemetry::layer().with_tracer(provider.tracer("test"))),
        );
        let parent = tracing::dispatcher::with_default(&subscriber, || {
            tracing::info_span!("request").context()
        })
        .with_baggage([KeyValue::new("customer", "secret-baggage")]);
        // A detached upload can inherit trace IDs without extending the server span.
        assert_eq!(exporter.get_finished_spans().unwrap().len(), 1);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}/", listener.local_addr().unwrap());
        let (headers_tx, mut headers_rx) = tokio::sync::mpsc::unbounded_channel();
        let server = tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route(
                    "/",
                    post(move |headers: HeaderMap| async move {
                        headers_tx.send(headers).unwrap();
                        axum::http::StatusCode::NO_CONTENT
                    }),
                ),
            )
            .await
            .unwrap();
        });
        let closed = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let failed_url = format!(
            "http://{}:unused@{}/private-content?token=secret-query",
            "secret-user",
            closed.local_addr().unwrap()
        );
        drop(closed);
        async {
            let client = Client::builder().no_proxy().build().unwrap();
            instrument_client(client.clone(), "trusted")
                .post(&endpoint)
                .send()
                .await
                .unwrap();
            let trusted = headers_rx.recv().await.unwrap();
            assert!(trusted.contains_key("traceparent"));
            assert!(!trusted.contains_key("baggage"));
            instrument_client(client.clone(), "external")
                .post(&endpoint)
                .with_extension(DisableOtelPropagation)
                .send()
                .await
                .unwrap();
            let external = headers_rx.recv().await.unwrap();
            assert!(!external.contains_key("traceparent"));
            assert!(!external.contains_key("baggage"));
            assert!(
                instrument_client(client, "failed")
                    .post(failed_url)
                    .send()
                    .await
                    .is_err()
            );
        }
        .with_context(parent.clone())
        .with_subscriber(subscriber)
        .await;
        server.abort();
        let spans = exporter.get_finished_spans().unwrap();
        assert_eq!(spans.len(), 4);
        for span in &spans[1..] {
            assert_eq!(span.parent_span_id, parent.span().span_context().span_id());
            assert_eq!(
                span.span_context.trace_id(),
                parent.span().span_context().trace_id()
            );
        }
        let failed = spans.iter().find(|span| span.name == "failed").unwrap();
        assert!(matches!(
            failed.status,
            opentelemetry::trace::Status::Error { .. }
        ));
        let attributes = format!("{:?}", failed.attributes);
        assert!(attributes.contains("transport"));
        for secret in ["secret-user", "unused", "private-content", "secret-query"] {
            assert!(!attributes.contains(secret), "leaked {secret}");
        }
        assert!(!attributes.contains("error.cause_chain"));
        provider.shutdown().unwrap();
    }
}
