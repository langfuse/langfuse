use std::time::Duration;

use axum::{Router, body::Body, extract::MatchedPath, http::Request, response::Response};
use axum_otel_metrics::HttpMetricsLayerBuilder;
use opentelemetry::{propagation::TextMapPropagator, trace::TraceContextExt};
use opentelemetry_http::HeaderExtractor;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use tower_http::trace::TraceLayer;
use tracing::Span;
use tracing_opentelemetry::OpenTelemetrySpanExt;

/// Instrument application routes; mount health probes outside this router.
pub fn instrument(router: Router) -> Router {
    router
        .layer(HttpMetricsLayerBuilder::new().build())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &Request<Body>| {
                    let route = request.extensions().get::<MatchedPath>()
                        .map_or("unmatched", MatchedPath::as_str);
                    let method = match request.method().as_str() {
                        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "CONNECT" | "TRACE" => request.method().as_str(),
                        _ => "_OTHER",
                    };
                    let span = tracing::info_span!("http.server", otel.name = %format_args!("{method} {route}"), otel.kind = "server", http.request.method = method, http.route = route, http.response.status_code = tracing::field::Empty, otel.status_code = tracing::field::Empty, provider_request_id = tracing::field::Empty);
                    let parent = TraceContextPropagator::new().extract(&HeaderExtractor(request.headers()));
                    let _ = span.set_parent(parent);
                    span
                })
                .on_request(())
                .on_response(|response: &Response, latency: Duration, span: &Span| {
                    let status = response.status();
                    span.record("http.response.status_code", i64::from(status.as_u16()));
                    if status.is_server_error() {
                        span.record("otel.status_code", "ERROR");
                    }
                    let context = span.context();
                    let context_span = context.span();
                    let ids = context_span.span_context();
                    tracing::info!(trace_id = %ids.trace_id(), span_id = %ids.span_id(), status = status.as_u16(), duration_ms = latency.as_secs_f64() * 1000.0, "gateway response started");
                })
                .on_body_chunk(())
                .on_eos(())
                .on_failure(()),
        )
}

#[cfg(test)]
mod tests;
