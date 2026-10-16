use std::time::{Duration, Instant};

use axum::{
    Router,
    body::Body,
    extract::MatchedPath,
    http::{HeaderMap, Request, StatusCode},
    middleware::{self, Next},
    response::Response,
};
use opentelemetry::{Context, trace::TraceContextExt};
use tower_http::trace::TraceLayer;
use tracing::Span;
use tracing_opentelemetry::OpenTelemetrySpanExt;

use super::request::{ErrorOrigin, RequestObservation, Summary};

/// Instrument application routes; mount health probes outside this router.
pub fn instrument(router: Router) -> Router {
    router
        .layer(middleware::from_fn(observe_request))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &Request<Body>| {
                    let (method, route) = request_labels(request);
                    let span = tracing::info_span!(parent: None, "http.server", otel.name = %format_args!("{method} {route}"), otel.kind = "server", http.request.method = method, http.route = route, http.request.body.size = tracing::field::Empty, http.response.status_code = tracing::field::Empty, otel.status_code = tracing::field::Empty, otel.status_description = tracing::field::Empty, error.type = tracing::field::Empty, error.origin = tracing::field::Empty, gateway.request.id = tracing::field::Empty, gateway.client.request.id = tracing::field::Empty, langfuse.organization.id = tracing::field::Empty, langfuse.project.id = tracing::field::Empty, gateway.provider = tracing::field::Empty, gateway.provider.connection.id = tracing::field::Empty, gateway.provider.connection.name = tracing::field::Empty, gateway.upstream.model = tracing::field::Empty, provider_request_id = tracing::field::Empty, gateway.outcome = tracing::field::Empty, gateway.first_byte_ms = tracing::field::Empty);
                    // Operational tracing has no caller or ambient trace context.
                    let _ = span.set_parent(Context::new());
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
                // Fires once the body reaches end of stream; a client that disconnects
                // early never gets here, which the relay outcome records instead.
                .on_eos(|_: Option<&HeaderMap>, stream_duration: Duration, span: &Span| {
                    let context = span.context();
                    let context_span = context.span();
                    let ids = context_span.span_context();
                    tracing::info!(trace_id = %ids.trace_id(), span_id = %ids.span_id(), stream_duration_ms = stream_duration.as_secs_f64() * 1000.0, "gateway response completed");
                })
                .on_failure(()),
        )
}

async fn observe_request(mut request: Request<Body>, next: Next) -> Response {
    let (method, route) = request_labels(&request);
    let (method, route) = (method.to_owned(), route.to_owned());
    let observation = RequestObservation::default();
    request.extensions_mut().insert(observation.clone());
    let start = Instant::now();
    let response = next.run(request).await;
    let elapsed = start.elapsed();
    let status = response.status();
    let summary = observation.summary();
    let (origin, reason) = summary.error.unwrap_or_else(|| fallback_error(status));
    record_span_error(origin, reason, status);
    super::metrics::http_response(
        elapsed,
        &super::metrics::HttpResponse {
            method: &method,
            route: &route,
            status: status.as_u16(),
            origin,
            reason,
            provider: summary.provider,
        },
    );
    record_overhead(&route, &summary, elapsed);
    if let Some(bytes) = summary.request_bytes {
        super::metrics::request_body_size(&route, summary.provider, bytes);
    }
    response
}

/// Classifies responses the handler did not, such as router 404/405.
fn fallback_error(status: StatusCode) -> (ErrorOrigin, &'static str) {
    match status.as_u16() {
        400..=499 => (ErrorOrigin::Client, "unhandled"),
        500.. => (ErrorOrigin::Gateway, "unhandled"),
        _ => (ErrorOrigin::None, "none"),
    }
}

fn record_span_error(origin: ErrorOrigin, reason: &'static str, status: StatusCode) {
    if origin == ErrorOrigin::None {
        return;
    }
    let span = Span::current();
    span.record("error.origin", origin.as_str());
    span.record("error.type", reason);
    if status.is_server_error() {
        span.record("otel.status_description", reason);
    }
}

/// Overhead is only defined for requests that waited on a provider.
fn record_overhead(route: &str, summary: &Summary, elapsed: Duration) {
    if let Some(provider_headers) = summary.provider_headers {
        let total = elapsed
            .saturating_sub(summary.request_body.unwrap_or_default())
            .saturating_sub(provider_headers);
        super::metrics::overhead(route, summary.provider, total);
    }
}

fn request_labels(request: &Request<Body>) -> (&str, &str) {
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map_or("unmatched", MatchedPath::as_str);
    let method = match request.method().as_str() {
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "CONNECT" | "TRACE" => {
            request.method().as_str()
        }
        _ => "_OTHER",
    };
    (method, route)
}

#[cfg(test)]
mod tests;
