//! Stamps the gateway request ID on every operational span of a request's trace.
//! A child span's OpenTelemetry parent context descends from the server span's,
//! so one processor covers each phase span, including spans created by
//! dependencies such as `reqwest-tracing`, without per-span fields.
use std::time::Duration;

use opentelemetry::{
    Context, KeyValue,
    trace::{Span as _, TraceContextExt},
};
use opentelemetry_sdk::{
    error::OTelSdkResult,
    trace::{Span, SpanData, SpanProcessor},
};

const REQUEST_ID_ATTRIBUTE: &str = "gateway.request.id";

struct RequestId(String);

/// The parent context for a request's server span.
pub(super) fn root_context(request_id: Option<&str>) -> Context {
    request_id.map_or_else(Context::new, |id| {
        Context::new().with_value(RequestId(id.to_owned()))
    })
}

#[derive(Debug)]
pub(crate) struct RequestIdProcessor;

impl SpanProcessor for RequestIdProcessor {
    fn on_start(&self, span: &mut Span, cx: &Context) {
        // The server span has no active parent; it records the ID as its own field.
        if cx.has_active_span()
            && let Some(RequestId(id)) = cx.get::<RequestId>()
        {
            span.set_attribute(KeyValue::new(REQUEST_ID_ATTRIBUTE, id.clone()));
        }
    }

    fn on_end(&self, _: SpanData) {}

    fn force_flush(&self) -> OTelSdkResult {
        Ok(())
    }

    fn shutdown_with_timeout(&self, _: Duration) -> OTelSdkResult {
        Ok(())
    }
}
