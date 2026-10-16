use std::{
    sync::{
        LazyLock,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use crate::capture::{InferenceFacts, RelayOutcome};
use opentelemetry::trace::TraceContextExt;
use opentelemetry::{
    KeyValue, global,
    metrics::{Counter, Histogram, ObservableGauge, UpDownCounter},
};
use tracing_opentelemetry::OpenTelemetrySpanExt;

use super::request::ErrorOrigin;

struct Metrics {
    http_duration: Histogram<f64>,
    overhead: Histogram<f64>,
    request_size: Histogram<u64>,
    response_size: Histogram<u64>,
    active: UpDownCounter<i64>,
    phases: Histogram<f64>,
    rejections: Counter<u64>,
    delivery: Counter<u64>,
    executions: Counter<u64>,
}

static METRICS: LazyLock<Metrics> = LazyLock::new(|| {
    let meter = global::meter("ai-gateway");
    // Chat payloads are kilobytes; long contexts and images reach tens of MiB.
    let bytes: Vec<f64> = [10, 12, 14, 16, 18, 20, 22, 24, 26]
        .map(|power| f64::from(1u32 << power))
        .to_vec();
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
        // Gateway work is expected in the sub-millisecond to tens of milliseconds range.
        overhead: meter
            .f64_histogram("gateway.overhead.duration")
            .with_unit("s")
            .with_boundaries(vec![
                0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5,
                1.0, 2.5, 5.0,
            ])
            .build(),
        request_size: meter
            .u64_histogram("http.server.request.body.size")
            .with_unit("By")
            .with_boundaries(bytes.clone())
            .build(),
        response_size: meter
            .u64_histogram("http.server.response.body.size")
            .with_unit("By")
            .with_boundaries(bytes)
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

pub(super) struct HttpResponse<'a> {
    pub method: &'a str,
    pub route: &'a str,
    pub status: u16,
    pub origin: ErrorOrigin,
    pub reason: &'static str,
    pub provider: &'static str,
}

pub(super) fn http_response(duration: Duration, response: &HttpResponse<'_>) {
    METRICS.http_duration.record(
        duration.as_secs_f64(),
        &[
            KeyValue::new("http.request.method", response.method.to_owned()),
            KeyValue::new("http.route", response.route.to_owned()),
            KeyValue::new("http.response.status_code", i64::from(response.status)),
            KeyValue::new("error.origin", response.origin.as_str()),
            KeyValue::new("error.reason", response.reason),
            KeyValue::new("gateway.provider", response.provider),
        ],
    );
}

pub(super) fn overhead(route: &str, provider: &'static str, duration: Duration) {
    METRICS.overhead.record(
        duration.as_secs_f64(),
        &[
            KeyValue::new("http.route", route.to_owned()),
            KeyValue::new("gateway.provider", provider),
        ],
    );
}

/// Buffered request bytes, recorded for requests whose body was read in full.
pub(super) fn request_body_size(route: &str, provider: &'static str, bytes: u64) {
    METRICS.request_size.record(
        bytes,
        &[
            KeyValue::new("http.route", route.to_owned()),
            KeyValue::new("gateway.provider", provider),
        ],
    );
}

/// Bytes relayed from the provider, including truncated and cancelled streams.
pub(crate) fn response_body_size(provider: &'static str, bytes: u64) {
    METRICS
        .response_size
        .record(bytes, &[KeyValue::new("gateway.provider", provider)]);
}

/// In-use, high-water, and configured slots of one admission semaphore.
struct Slots {
    phase: &'static str,
    in_use: AtomicU64,
    peak: AtomicU64,
    capacity: AtomicU64,
}

impl Slots {
    const fn new(phase: &'static str) -> Self {
        Self {
            phase,
            in_use: AtomicU64::new(0),
            peak: AtomicU64::new(0),
            capacity: AtomicU64::new(0),
        }
    }

    fn acquire(&self) {
        let in_use = self.in_use.fetch_add(1, Ordering::Relaxed) + 1;
        self.peak.fetch_max(in_use, Ordering::Relaxed);
    }

    fn release(&self) {
        self.in_use.fetch_sub(1, Ordering::Relaxed);
    }

    /// The highest in-use count since the previous read. The next interval starts
    /// from the slots still held, so a long request is not reported as idle.
    fn take_peak(&self) -> u64 {
        let peak = self
            .peak
            .swap(self.in_use.load(Ordering::Relaxed), Ordering::Relaxed);
        self.peak
            .fetch_max(self.in_use.load(Ordering::Relaxed), Ordering::Relaxed);
        peak
    }
}

static SLOTS: [Slots; 3] = [
    Slots::new("model_catalog"),
    Slots::new("resolution"),
    Slots::new("execution"),
];

fn slots(phase: &str) -> Option<&'static Slots> {
    SLOTS.iter().find(|slots| slots.phase == phase)
}

/// Report a semaphore's configured size for `gateway.admission.capacity`. The
/// gateway runs one inference service per process, so the latest value wins.
pub(crate) fn record_capacity(phase: &'static str, capacity: usize) {
    if let Some(slots) = slots(phase) {
        slots.capacity.store(
            u64::try_from(capacity).unwrap_or(u64::MAX),
            Ordering::Relaxed,
        );
    }
}

pub(crate) struct Active(&'static str);

impl Active {
    pub(crate) fn new(phase: &'static str) -> Self {
        METRICS.active.add(1, &[KeyValue::new("phase", phase)]);
        if let Some(slots) = slots(phase) {
            slots.acquire();
        }
        Self(phase)
    }
}

impl Drop for Active {
    fn drop(&mut self) {
        METRICS.active.add(-1, &[KeyValue::new("phase", self.0)]);
        if let Some(slots) = slots(self.0) {
            slots.release();
        }
    }
}

pub(crate) fn phase_finished(phase: &'static str, duration: Duration) {
    METRICS
        .phases
        .record(duration.as_secs_f64(), &[KeyValue::new("phase", phase)]);
}

pub(crate) fn rejected(phase: &'static str) {
    METRICS.rejections.add(1, &[KeyValue::new("phase", phase)]);
}

pub(crate) fn delivery(outcome: &'static str, reason: &'static str, records: u64) {
    METRICS.delivery.add(
        records,
        &[
            KeyValue::new("outcome", outcome),
            KeyValue::new("reason", reason),
        ],
    );
}

pub(crate) fn execution_finished(facts: &InferenceFacts) {
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
            Duration::from_millis(u64::try_from(first_byte_ms).unwrap_or(u64::MAX)),
        );
    }
    phase_finished(
        "execution",
        Duration::from_millis(u64::try_from(facts.duration_ms).unwrap_or(u64::MAX)),
    );
    let context = tracing::Span::current().context();
    let context_span = context.span();
    let ids = context_span.span_context();
    tracing::info!(trace_id = %ids.trace_id(), span_id = %ids.span_id(), outcome, duration_ms = facts.duration_ms, "gateway execution finished");
}

/// Marks the server span failed when the provider body breaks after headers were
/// sent. Runs for every route, including those that capture no generation.
pub(crate) fn execution_failed(outcome: RelayOutcome) {
    if !outcome.is_failure() {
        return;
    }
    let outcome = outcome.as_str();
    let span = tracing::Span::current();
    span.record("otel.status_code", "ERROR");
    span.record("otel.status_description", outcome);
    span.record("error.type", outcome);
    span.record("error.origin", ErrorOrigin::ProviderTransport.as_str());
    let context = span.context();
    let context_span = context.span();
    let ids = context_span.span_context();
    tracing::warn!(trace_id = %ids.trace_id(), span_id = %ids.span_id(), phase = "provider", outcome, error.origin = ErrorOrigin::ProviderTransport.as_str(), "gateway stream failed");
}

/// Keeps the admission callbacks registered for the life of the meter provider.
pub(super) struct AdmissionInstruments {
    _capacity: ObservableGauge<u64>,
    _peak: ObservableGauge<u64>,
}

/// Free slots are `gateway.admission.capacity - gateway.active`. The 30-second
/// average of `gateway.active` hides bursts, so `gateway.active.peak` reports the
/// most slots held at once since the previous export.
pub(super) fn register_admission() -> AdmissionInstruments {
    let meter = global::meter("ai-gateway");
    let capacity = meter
        .u64_observable_gauge("gateway.admission.capacity")
        .with_callback(|observer| {
            for slots in &SLOTS {
                let capacity = slots.capacity.load(Ordering::Relaxed);
                if capacity > 0 {
                    observer.observe(capacity, &[KeyValue::new("phase", slots.phase)]);
                }
            }
        })
        .build();
    // The SDK reads observable instruments once per collection, which is once
    // per export with the single periodic reader.
    let peak = meter
        .u64_observable_gauge("gateway.active.peak")
        .with_callback(|observer| {
            for slots in &SLOTS {
                observer.observe(slots.take_peak(), &[KeyValue::new("phase", slots.phase)]);
            }
        })
        .build();
    AdmissionInstruments {
        _capacity: capacity,
        _peak: peak,
    }
}

#[cfg(test)]
mod tests {
    use super::Slots;

    #[test]
    fn peak_reports_the_interval_burst_then_restarts_from_held_slots() {
        let slots = Slots::new("execution");
        for _ in 0..3 {
            slots.acquire();
        }
        slots.release();
        slots.release();
        assert_eq!(slots.take_peak(), 3, "a burst between exports is kept");
        assert_eq!(slots.take_peak(), 1, "a slot still held stays visible");
        slots.release();
        assert_eq!(slots.take_peak(), 1);
        assert_eq!(slots.take_peak(), 0);
    }
}
