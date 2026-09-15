use std::{
    pin::Pin,
    task::{Context, Poll},
    time::Instant,
};

use axum::{
    body::{Body, Bytes, HttpBody},
    extract::Request,
    middleware::Next,
    response::Response,
};
use http_body::{Frame, SizeHint};
use opentelemetry::{
    propagation::{Extractor, Injector, TextMapPropagator},
    trace::TraceContextExt,
};
use opentelemetry_sdk::propagation::TraceContextPropagator;
use tracing::{Instrument, Span};
use tracing_opentelemetry::OpenTelemetrySpanExt;

use super::metrics;

/// Instrument the HTTP envelope through response-body completion or cancellation.
pub async fn request(request: Request, next: Next) -> Response {
    let route = match request.uri().path() {
        "/health" | "/ready" => return next.run(request).await,
        "/openai/v1/responses" => "/openai/v1/responses",
        _ => "unmatched",
    };
    let method = match request.method().as_str() {
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" => {
            request.method().as_str()
        }
        _ => "OTHER",
    };
    let request_id = uuid::Uuid::new_v4().to_string();
    let span = tracing::info_span!("http.server", otel.name = %format_args!("{method} {route}"), otel.kind = "server", http.request.method = method, http.route = route, http.response.status_code = tracing::field::Empty, otel.status_code = tracing::field::Empty, gateway.outcome = tracing::field::Empty, provider_request_id = tracing::field::Empty, request_id = %request_id);
    let parent = TraceContextPropagator::new().extract(&Headers(request.headers()));
    let _ = span.set_parent(parent);
    let mut observation = RequestObservation {
        span: span.clone(),
        request_id,
        route,
        started: Instant::now(),
        status: 0,
        finished: false,
        _active: metrics::Active::new("request"),
    };
    let response = next.run(request).instrument(span).await;
    observation.status = response.status().as_u16();
    observation
        .span
        .record("http.response.status_code", i64::from(observation.status));
    let (parts, body) = response.into_parts();
    if body.is_end_stream() {
        observation.finish("complete");
    }
    Response::from_parts(
        parts,
        Body::new(ObservedBody {
            inner: body,
            observation,
        }),
    )
}

struct RequestObservation {
    span: Span,
    request_id: String,
    route: &'static str,
    started: Instant,
    status: u16,
    finished: bool,
    _active: metrics::Active,
}

impl RequestObservation {
    fn finish(&mut self, outcome: &'static str) {
        if self.finished {
            return;
        }
        self.finished = true;
        self.span.record("gateway.outcome", outcome);
        if self.status >= 500 || outcome == "body_error" {
            self.span.record("otel.status_code", "ERROR");
        }
        let _entered = self.span.enter();
        metrics::request_finished(self.route, self.status, outcome, self.started);
        tracing::info!(
            request_id = self.request_id,
            route = self.route,
            status = self.status,
            outcome,
            duration_ms = self.started.elapsed().as_secs_f64() * 1000.0,
            "gateway request finished"
        );
    }
}

impl Drop for RequestObservation {
    fn drop(&mut self) {
        self.finish("cancelled");
    }
}

struct ObservedBody {
    inner: Body,
    observation: RequestObservation,
}

impl HttpBody for ObservedBody {
    type Data = Bytes;
    type Error = axum::Error;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, Self::Error>>> {
        let span = self.observation.span.clone();
        let _entered = span.enter();
        let result = Pin::new(&mut self.inner).poll_frame(cx);
        match &result {
            Poll::Ready(Some(Err(_))) => self.observation.finish("body_error"),
            Poll::Ready(None) => self.observation.finish("complete"),
            Poll::Ready(Some(Ok(_))) if self.inner.is_end_stream() => {
                self.observation.finish("complete");
            }
            _ => {}
        }
        result
    }
    fn is_end_stream(&self) -> bool {
        self.inner.is_end_stream()
    }
    fn size_hint(&self) -> SizeHint {
        self.inner.size_hint()
    }
}

struct Headers<'a>(&'a axum::http::HeaderMap);
impl Extractor for Headers<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key)?.to_str().ok()
    }
    fn keys(&self) -> Vec<&str> {
        self.0.keys().map(axum::http::HeaderName::as_str).collect()
    }
}

struct HeaderInjector(axum::http::HeaderMap);
impl Injector for HeaderInjector {
    fn set(&mut self, key: &str, value: String) {
        if let (Ok(key), Ok(value)) = (
            axum::http::HeaderName::try_from(key),
            axum::http::HeaderValue::try_from(value),
        ) {
            self.0.insert(key, value);
        }
    }
}

/// Only trusted Web calls receive operational trace context; never client baggage.
pub(crate) fn web_context() -> axum::http::HeaderMap {
    let context = Span::current().context();
    let mut headers = HeaderInjector(axum::http::HeaderMap::new());
    if context.span().span_context().is_valid() {
        TraceContextPropagator::new().inject_context(&context, &mut headers);
    }
    headers.0
}

pub(crate) fn client<T, E>(
    phase: &'static str,
    future: impl Future<Output = Result<T, E>>,
) -> impl Future<Output = Result<T, E>> {
    let parent = Span::current().context();
    let span = tracing::info_span!(parent: None, "http.client", otel.name = phase, otel.kind = "client", http.request.method = "POST", http.response.status_code = tracing::field::Empty, otel.status_code = tracing::field::Empty);
    let _ = span.set_parent(parent);
    async move {
        let started = Instant::now();
        let result = future.await;
        metrics::phase_finished(phase, started.elapsed());
        if result.is_err() {
            Span::current().record("otel.status_code", "ERROR");
        }
        tracing::debug!(
            phase,
            transport_ok = result.is_ok(),
            duration_ms = started.elapsed().as_secs_f64() * 1000.0,
            "gateway upstream finished"
        );
        result
    }
    .instrument(span)
}

pub(crate) fn response_status(status: u16) {
    let span = Span::current();
    span.record("http.response.status_code", i64::from(status));
    if status >= 400 {
        span.record("otel.status_code", "ERROR");
    }
}

#[cfg(test)]
mod tests;
