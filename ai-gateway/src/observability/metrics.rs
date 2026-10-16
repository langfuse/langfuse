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
    metrics::{Counter, Histogram, ObservableCounter, ObservableGauge, UpDownCounter},
};
use serde_json::Value;
use tracing_opentelemetry::OpenTelemetrySpanExt;

use super::request::ErrorOrigin;

/// Distinguishes tasks on gauges, which would otherwise merge across instances.
/// Generated per process, so it changes on every restart.
pub(super) static INSTANCE_ID: LazyLock<String> =
    LazyLock::new(|| uuid::Uuid::now_v7().hyphenated().to_string());

struct Metrics {
    http_duration: Histogram<f64>,
    overhead: Histogram<f64>,
    active: UpDownCounter<i64>,
    phases: Histogram<f64>,
    rejections: Counter<u64>,
    delivery: Counter<u64>,
    executions: Counter<u64>,
    tokens: Counter<u64>,
    response_bytes: Counter<u64>,
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
        // Gateway work is expected in the sub-millisecond to tens of milliseconds range.
        overhead: meter
            .f64_histogram("gateway.overhead.duration")
            .with_unit("s")
            .with_boundaries(vec![
                0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5,
                1.0, 2.5, 5.0,
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
        tokens: meter.u64_counter("gateway.tokens").build(),
        response_bytes: meter
            .u64_counter("gateway.response.bytes")
            .with_unit("By")
            .build(),
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

/// `component` is `total`, `resolution`, `processing`, or `stream_processing`.
pub(super) fn overhead(
    route: Option<&str>,
    provider: &'static str,
    component: &'static str,
    duration: Duration,
) {
    let mut attributes = vec![
        KeyValue::new("component", component),
        KeyValue::new("gateway.provider", provider),
    ];
    if let Some(route) = route {
        attributes.push(KeyValue::new("http.route", route.to_owned()));
    }
    METRICS.overhead.record(duration.as_secs_f64(), &attributes);
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
        METRICS.active.add(1, &active_attributes(phase));
        if let Some(slots) = slots(phase) {
            slots.acquire();
        }
        Self(phase)
    }
}

impl Drop for Active {
    fn drop(&mut self) {
        METRICS.active.add(-1, &active_attributes(self.0));
        if let Some(slots) = slots(self.0) {
            slots.release();
        }
    }
}

fn active_attributes(phase: &'static str) -> [KeyValue; 2] {
    [
        KeyValue::new("phase", phase),
        KeyValue::new("service.instance.id", INSTANCE_ID.as_str()),
    ]
}

pub(crate) fn phase_finished(phase: &'static str, provider: &'static str, duration: Duration) {
    METRICS.phases.record(
        duration.as_secs_f64(),
        &[
            KeyValue::new("phase", phase),
            KeyValue::new("gateway.provider", provider),
        ],
    );
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

/// Bytes relayed to the caller and the gateway's own CPU time spent observing them.
pub(crate) fn stream_finished(provider: &'static str, bytes: usize, processing: Duration) {
    METRICS.response_bytes.add(
        u64::try_from(bytes).unwrap_or(u64::MAX),
        &[KeyValue::new("gateway.provider", provider)],
    );
    overhead(None, provider, "stream_processing", processing);
}

/// The provider family of a capture's API format, e.g. `openai.responses`.
fn api_provider(api_format: &str) -> &'static str {
    match api_format.split('.').next() {
        Some("openai") => "openai",
        Some("anthropic") => "anthropic",
        _ => "none",
    }
}

pub(crate) fn execution_finished(facts: &InferenceFacts) {
    let outcome = match facts.outcome {
        RelayOutcome::Eof => "complete",
        RelayOutcome::Cancelled => "cancelled",
        RelayOutcome::Timeout => "timeout",
        RelayOutcome::TransportError => "transport_error",
    };
    let provider = api_provider(facts.api_format);
    tracing::Span::current().record("gateway.outcome", facts.outcome.as_str());
    METRICS.executions.add(
        1,
        &[
            KeyValue::new("outcome", outcome),
            KeyValue::new("gateway.provider", provider),
        ],
    );
    let millis = |value: u128| Duration::from_millis(u64::try_from(value).unwrap_or(u64::MAX));
    if let Some(first_byte_ms) = facts.first_byte_ms {
        tracing::Span::current().record(
            "gateway.first_byte_ms",
            i64::try_from(first_byte_ms).unwrap_or(i64::MAX),
        );
        phase_finished("provider.first_byte", provider, millis(first_byte_ms));
    }
    if let Some(completion_start_ms) = facts.completion_start_ms {
        phase_finished(
            "provider.first_token",
            provider,
            millis(completion_start_ms),
        );
    }
    phase_finished("execution", provider, millis(facts.duration_ms));
    if let Some(usage) = &facts.inference.usage_details {
        for (token_type, count) in token_counts(facts.api_format, usage) {
            METRICS.tokens.add(
                count,
                &[
                    KeyValue::new("gateway.provider", provider),
                    KeyValue::new("token.type", token_type),
                ],
            );
        }
    }
    let context = tracing::Span::current().context();
    let context_span = context.span();
    let ids = context_span.span_context();
    tracing::info!(trace_id = %ids.trace_id(), span_id = %ids.span_id(), outcome, duration_ms = facts.duration_ms, "gateway execution finished");
    if facts.outcome.is_failure() {
        let span = tracing::Span::current();
        span.record("otel.status_code", "ERROR");
        span.record("otel.status_description", outcome);
        span.record("error.type", outcome);
        span.record("error.origin", ErrorOrigin::ProviderTransport.as_str());
        tracing::warn!(trace_id = %ids.trace_id(), span_id = %ids.span_id(), phase = "provider", outcome, error.origin = ErrorOrigin::ProviderTransport.as_str(), "gateway stream failed");
    }
}

/// Native usage mapped to bounded token types. `input` excludes cached tokens on
/// every provider, so `input + cache_read + cache_write` is the whole prompt;
/// `reasoning` is a subset of `output`.
fn token_counts(api_format: &str, usage: &Value) -> Vec<(&'static str, u64)> {
    let get = |path: &[&str]| {
        path.iter()
            .try_fold(usage, |value, key| value.get(key))
            .and_then(Value::as_u64)
    };
    let (input, cache_read, cache_write, output, reasoning) = match api_format {
        "anthropic.messages" => (
            get(&["input_tokens"]),
            get(&["cache_read_input_tokens"]),
            get(&["cache_creation_input_tokens"]),
            get(&["output_tokens"]),
            None,
        ),
        "openai.chat-completions" => {
            let cached = get(&["prompt_tokens_details", "cached_tokens"]);
            (
                get(&["prompt_tokens"])
                    .map(|tokens| tokens.saturating_sub(cached.unwrap_or_default())),
                cached,
                None,
                get(&["completion_tokens"]),
                get(&["completion_tokens_details", "reasoning_tokens"]),
            )
        }
        _ => {
            let cached = get(&["input_tokens_details", "cached_tokens"]);
            (
                get(&["input_tokens"])
                    .map(|tokens| tokens.saturating_sub(cached.unwrap_or_default())),
                cached,
                None,
                get(&["output_tokens"]),
                get(&["output_tokens_details", "reasoning_tokens"]),
            )
        }
    };
    [
        ("input", input),
        ("cache_read", cache_read),
        ("cache_write", cache_write),
        ("output", output),
        ("reasoning", reasoning),
    ]
    .into_iter()
    .filter_map(|(token_type, count)| count.filter(|count| *count > 0).map(|c| (token_type, c)))
    .collect()
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
                    observer.observe(capacity, &active_attributes(slots.phase));
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
                observer.observe(slots.take_peak(), &active_attributes(slots.phase));
            }
        })
        .build();
    AdmissionInstruments {
        _capacity: capacity,
        _peak: peak,
    }
}

/// Keeps the runtime callbacks registered for the life of the meter provider.
pub(super) struct RuntimeInstruments {
    _gauges: [ObservableGauge<u64>; 3],
    _busy: ObservableCounter<f64>,
}

/// Fargate exposes no CPU throttling metric. A growing global queue or a busy
/// ratio (`busy_duration` rate per worker) near 1 shows the runtime is starved.
pub(super) fn register_runtime(handle: &tokio::runtime::Handle) -> RuntimeInstruments {
    let meter = global::meter("ai-gateway");
    let attributes = || [KeyValue::new("service.instance.id", INSTANCE_ID.as_str())];
    let gauge = |name: &'static str, read: fn(&tokio::runtime::RuntimeMetrics) -> usize| {
        let handle = handle.clone();
        meter
            .u64_observable_gauge(name)
            .with_callback(move |observer| {
                let value = read(&handle.metrics());
                observer.observe(u64::try_from(value).unwrap_or(u64::MAX), &attributes());
            })
            .build()
    };
    let gauges = [
        gauge(
            "gateway.runtime.workers",
            tokio::runtime::RuntimeMetrics::num_workers,
        ),
        gauge(
            "gateway.runtime.alive_tasks",
            tokio::runtime::RuntimeMetrics::num_alive_tasks,
        ),
        gauge(
            "gateway.runtime.global_queue_depth",
            tokio::runtime::RuntimeMetrics::global_queue_depth,
        ),
    ];
    let busy_handle = handle.clone();
    let busy = meter
        .f64_observable_counter("gateway.runtime.busy_duration")
        .with_unit("s")
        .with_callback(move |observer| {
            let metrics = busy_handle.metrics();
            let busy: Duration = (0..metrics.num_workers())
                .map(|worker| metrics.worker_total_busy_duration(worker))
                .sum();
            observer.observe(busy.as_secs_f64(), &attributes());
        })
        .build();
    RuntimeInstruments {
        _gauges: gauges,
        _busy: busy,
    }
}

#[cfg(test)]
mod tests {
    use super::{Slots, token_counts};
    use serde_json::json;

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

    #[test]
    fn token_types_split_cached_input_consistently_across_providers() {
        let openai = json!({
            "input_tokens": 100,
            "input_tokens_details": {"cached_tokens": 60},
            "output_tokens": 30,
            "output_tokens_details": {"reasoning_tokens": 10}
        });
        assert_eq!(
            token_counts("openai.responses", &openai),
            [
                ("input", 40),
                ("cache_read", 60),
                ("output", 30),
                ("reasoning", 10)
            ]
        );
        let chat = json!({
            "prompt_tokens": 19,
            "completion_tokens": 10,
            "prompt_tokens_details": {"cached_tokens": 0}
        });
        assert_eq!(
            token_counts("openai.chat-completions", &chat),
            [("input", 19), ("output", 10)]
        );
        let anthropic = json!({
            "input_tokens": 5,
            "cache_read_input_tokens": 200,
            "cache_creation_input_tokens": 50,
            "output_tokens": 20
        });
        assert_eq!(
            token_counts("anthropic.messages", &anthropic),
            [
                ("input", 5),
                ("cache_read", 200),
                ("cache_write", 50),
                ("output", 20)
            ]
        );
        assert!(token_counts("openai.responses", &json!({"input_tokens": "x"})).is_empty());
    }
}
