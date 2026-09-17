mod client;
mod http;
mod metrics;

pub(crate) use client::instrument_client;
pub use http::instrument;
pub(crate) use metrics::{Active, delivery, execution_finished, rejected};

use crate::config::{GatewayConfig, LogFormat};
use opentelemetry::{KeyValue, global, trace::TracerProvider};
use opentelemetry_otlp::{Protocol, WithExportConfig};
use opentelemetry_sdk::{
    Resource,
    metrics::{PeriodicReader, SdkMeterProvider},
    propagation::TraceContextPropagator,
    trace::{BatchConfigBuilder, BatchSpanProcessor, Sampler, SdkTracerProvider},
};
use std::{env, error::Error, time::Duration};
use tokio::time::Instant;
use tracing_subscriber::{EnvFilter, Layer, filter::filter_fn, prelude::*};

pub struct Observability {
    traces: SdkTracerProvider,
    metrics: Option<SdkMeterProvider>,
}

/// Initialize process logging and optional operational OTLP exports.
///
/// # Errors
/// Returns a sanitized error for invalid settings, exporter construction, or an
/// already installed tracing subscriber.
pub fn init(config: &GatewayConfig) -> Result<Observability, Box<dyn Error>> {
    let service = setting("OTEL_SERVICE_NAME")?.unwrap_or_else(|| "ai-gateway".into());
    let resource = Resource::builder()
        .with_service_name(service)
        .with_attributes([
            KeyValue::new(
                "deployment.environment.name",
                setting("DD_ENV")?.unwrap_or_else(|| "development".into()),
            ),
            KeyValue::new(
                "service.version",
                setting("BUILD_ID")?.unwrap_or_else(|| env!("CARGO_PKG_VERSION").into()),
            ),
        ])
        .build();
    let ratio = sampling_ratio(setting("OTEL_TRACES_SAMPLER_ARG")?.as_deref())?;
    let mut traces = SdkTracerProvider::builder()
        .with_resource(resource.clone())
        .with_sampler(Sampler::ParentBased(Box::new(Sampler::TraceIdRatioBased(
            ratio,
        ))));
    let metrics = if let Some(endpoint) = setting("OTEL_EXPORTER_OTLP_ENDPOINT")? {
        let endpoint =
            reqwest::Url::parse(&endpoint).map_err(|_| "invalid OTEL_EXPORTER_OTLP_ENDPOINT")?;
        if !matches!(endpoint.scheme(), "http" | "https") || endpoint.host_str().is_none() {
            return Err("invalid OTEL_EXPORTER_OTLP_ENDPOINT".into());
        }
        let exporter = opentelemetry_otlp::SpanExporter::builder()
            .with_http()
            .with_protocol(Protocol::HttpBinary)
            .with_timeout(Duration::from_secs(3))
            .build()
            .map_err(|_| "failed to initialize operational trace exporter")?;
        traces = traces.with_span_processor(
            BatchSpanProcessor::builder(exporter)
                .with_batch_config(
                    BatchConfigBuilder::default()
                        .with_max_queue_size(512)
                        .with_max_export_batch_size(64)
                        .with_scheduled_delay(Duration::from_secs(1))
                        .build(),
                )
                .build(),
        );
        let exporter = opentelemetry_otlp::MetricExporter::builder()
            .with_http()
            .with_protocol(Protocol::HttpBinary)
            .with_timeout(Duration::from_secs(3))
            .build()
            .map_err(|_| "failed to initialize operational metric exporter")?;
        Some(
            SdkMeterProvider::builder()
                .with_resource(resource)
                .with_reader(
                    PeriodicReader::builder(exporter)
                        .with_interval(Duration::from_secs(30))
                        .build(),
                )
                .build(),
        )
    } else {
        None
    };
    let traces = traces.build();
    global::set_text_map_propagator(TraceContextPropagator::new());
    if let Some(metrics) = &metrics {
        global::set_meter_provider(metrics.clone());
    }
    let log_filter = EnvFilter::try_new(format!("warn,ai_gateway={}", config.log_level))?;
    let logger = match config.log_format {
        LogFormat::Json => tracing_subscriber::fmt::layer()
            .json()
            .flatten_event(true)
            .with_filter(log_filter)
            .boxed(),
        LogFormat::Text => tracing_subscriber::fmt::layer()
            .compact()
            .with_ansi(false)
            .with_filter(log_filter)
            .boxed(),
    };
    let spans = tracing_opentelemetry::layer()
        .with_tracer(traces.tracer("ai-gateway"))
        .with_tracked_inactivity(false)
        .with_filter(filter_fn(|metadata| {
            metadata.is_span()
                && (metadata.target().starts_with("ai_gateway")
                    || metadata.target().starts_with("reqwest_tracing"))
                && *metadata.level() <= tracing::Level::INFO
        }));
    tracing_subscriber::registry()
        .with(logger)
        .with(spans)
        .try_init()
        .map_err(|_| "failed to initialize gateway logging")?;
    Ok(Observability { traces, metrics })
}

impl Observability {
    /// Flush exporters within the shared gateway shutdown deadline.
    pub async fn shutdown(self, deadline: Instant) {
        let (trace_sender, traces) = tokio::sync::oneshot::channel();
        let (metric_sender, metrics) = tokio::sync::oneshot::channel();
        std::thread::spawn(move || {
            let _ = trace_sender.send(
                self.traces
                    .shutdown_with_timeout(deadline.saturating_duration_since(Instant::now())),
            );
        });
        std::thread::spawn(move || {
            let _ = metric_sender.send(self.metrics.map(|provider| {
                provider.shutdown_with_timeout(deadline.saturating_duration_since(Instant::now()))
            }));
        });
        match tokio::time::timeout_at(deadline, async { tokio::join!(traces, metrics) }).await {
            Ok((Ok(Ok(())), Ok(None | Some(Ok(()))))) => {}
            Ok(_) => tracing::warn!("operational telemetry shutdown failed"),
            Err(_) => tracing::warn!("operational telemetry shutdown deadline reached"),
        }
    }
}

fn setting(name: &str) -> Result<Option<String>, Box<dyn Error>> {
    match env::var(name) {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(env::VarError::NotPresent) => Ok(None),
        Err(env::VarError::NotUnicode(_)) => {
            Err("observability configuration must be Unicode".into())
        }
    }
}

fn sampling_ratio(value: Option<&str>) -> Result<f64, Box<dyn Error>> {
    value
        .unwrap_or("1")
        .parse::<f64>()
        .ok()
        .filter(|value| (0.0..=1.0).contains(value))
        .ok_or_else(|| "OTEL_TRACES_SAMPLER_ARG must be a number from 0 to 1".into())
}

#[cfg(test)]
mod tests {
    use super::sampling_ratio;

    #[test]
    fn sampling_rejects_nonfinite_out_of_range_and_sensitive_values() {
        for value in ["NaN", "inf", "-0.1", "1.1", "secret-token"] {
            let error = sampling_ratio(Some(value)).unwrap_err();
            assert_eq!(
                error.to_string(),
                "OTEL_TRACES_SAMPLER_ARG must be a number from 0 to 1"
            );
        }
        for (value, expected) in [(None, 1.0), (Some("0"), 0.0), (Some("0.25"), 0.25)] {
            assert!((sampling_ratio(value).unwrap() - expected).abs() < f64::EPSILON);
        }
    }
}
