use std::sync::LazyLock;

use crate::capture::RelayOutcome;
use opentelemetry::trace::TraceContextExt;
use opentelemetry::{
    KeyValue, global,
    metrics::{Counter, Histogram, UpDownCounter},
};
use tracing_opentelemetry::OpenTelemetrySpanExt;

struct Metrics {
    http_duration: Histogram<f64>,
    active: UpDownCounter<i64>,
    phases: Histogram<f64>,
    rejections: Counter<u64>,
    delivery: Counter<u64>,
    executions: Counter<u64>,
}

static METRICS: LazyLock<Metrics> = LazyLock::new(|| {
    let meter = global::meter("ai-gateway");
    let seconds = vec![
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 600.0,
    ];
    Metrics {
        http_duration: meter
            .f64_histogram("http.server.request.duration")
            .with_unit("s")
            .with_boundaries(vec![
                0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0,
            ])
            .build(),
        active: meter.i64_up_down_counter("gateway.active").build(),
        phases: meter
            .f64_histogram("gateway.phase.duration")
            .with_unit("s")
            .with_boundaries(seconds)
            .build(),
        rejections: meter.u64_counter("gateway.admission.rejected").build(),
        delivery: meter.u64_counter("gateway.telemetry.records").build(),
        executions: meter.u64_counter("gateway.executions").build(),
    }
});

pub(super) fn http_response(
    duration: std::time::Duration,
    method: String,
    route: String,
    status: u16,
) {
    METRICS.http_duration.record(
        duration.as_secs_f64(),
        &[
            KeyValue::new("http.request.method", method),
            KeyValue::new("http.route", route),
            KeyValue::new("http.response.status_code", i64::from(status)),
        ],
    );
}

pub(crate) struct Active(&'static str);

impl Active {
    pub(crate) fn new(phase: &'static str) -> Self {
        METRICS.active.add(1, &[KeyValue::new("phase", phase)]);
        Self(phase)
    }
}

impl Drop for Active {
    fn drop(&mut self) {
        METRICS.active.add(-1, &[KeyValue::new("phase", self.0)]);
    }
}

pub(crate) fn phase_finished(phase: &'static str, duration: std::time::Duration) {
    METRICS
        .phases
        .record(duration.as_secs_f64(), &[KeyValue::new("phase", phase)]);
}

pub(crate) fn rejected(phase: &'static str) {
    METRICS.rejections.add(1, &[KeyValue::new("phase", phase)]);
}

pub(crate) fn delivery(outcome: &'static str, reason: &'static str) {
    METRICS.delivery.add(
        1,
        &[
            KeyValue::new("outcome", outcome),
            KeyValue::new("reason", reason),
        ],
    );
}

pub(crate) fn execution_finished(facts: &crate::capture::InferenceFacts) {
    if let Some(request_id) = &facts.inference.provider_request_id {
        tracing::Span::current().record("provider_request_id", request_id.as_str());
    }
    let outcome = match facts.outcome {
        RelayOutcome::Eof => "complete",
        RelayOutcome::Cancelled => "cancelled",
        RelayOutcome::Timeout => "timeout",
        RelayOutcome::TransportError => "transport_error",
    };
    tracing::Span::current().record("gateway.outcome", facts.outcome.as_str());
    METRICS
        .executions
        .add(1, &[KeyValue::new("outcome", outcome)]);
    if let Some(first_byte_ms) = facts.first_byte_ms {
        tracing::Span::current().record(
            "gateway.first_byte_ms",
            i64::try_from(first_byte_ms).unwrap_or(i64::MAX),
        );
        phase_finished(
            "provider.first_byte",
            std::time::Duration::from_millis(u64::try_from(first_byte_ms).unwrap_or(u64::MAX)),
        );
    }
    phase_finished(
        "execution",
        std::time::Duration::from_millis(u64::try_from(facts.duration_ms).unwrap_or(u64::MAX)),
    );
    let context = tracing::Span::current().context();
    let context_span = context.span();
    let ids = context_span.span_context();
    tracing::info!(trace_id = %ids.trace_id(), span_id = %ids.span_id(), outcome, duration_ms = facts.duration_ms, "gateway execution finished");
    if matches!(
        facts.outcome,
        RelayOutcome::Timeout | RelayOutcome::TransportError
    ) {
        tracing::Span::current().record("otel.status_code", "ERROR");
        tracing::warn!(trace_id = %ids.trace_id(), span_id = %ids.span_id(), phase = "provider", outcome, "gateway stream failed");
    }
}
