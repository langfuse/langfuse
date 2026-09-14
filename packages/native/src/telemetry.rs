//! Telemetry for native code.
//!
//! Metrics go through the [`metrics`] facade to a DogStatsD exporter that
//! talks to the same Datadog Agent dd-trace uses on the Node side, and logs go
//! through [`tracing`] to stdout in the shape of the worker's winston logger.
//! Both are configured from the environment variables dd-trace and the Node
//! logger already read, so Rust and Node code report to the same places with
//! the same tags. Nothing is handed back to Node to record.

use std::env;
use std::sync::OnceLock;
use std::time::Duration;

use metrics::Label;
use metrics_exporter_dogstatsd::DogStatsDBuilder;
use tracing_subscriber::EnvFilter;

/// Overrides for values that otherwise come from the environment.
#[derive(Debug, Clone, Default)]
pub struct Config {
    /// DogStatsD endpoint as `host:port`.
    pub dogstatsd_address: Option<String>,
    /// How often aggregated metrics are flushed to the agent.
    pub flush_interval: Option<Duration>,
}

static INIT: OnceLock<Result<(), String>> = OnceLock::new();

/// Installs the log subscriber and the metrics exporter once per process.
/// Later calls return the outcome of the first one.
pub fn init(config: Config) -> Result<(), String> {
    INIT.get_or_init(|| {
        init_logging();
        init_metrics(&config)
    })
    .clone()
}

fn init_logging() {
    // RUST_LOG takes precedence for fine-grained directives; otherwise map the
    // worker's winston level onto tracing's. The exporter logs an error for
    // every flush the agent does not accept, which is constant noise wherever
    // no agent runs (local development, tests), so its target is silenced by
    // default; dd-trace's own client is silent in the same situation.
    let filter = EnvFilter::try_from_env("RUST_LOG").unwrap_or_else(|_| {
        let level = tracing_level_from_winston(&env_or_empty("LANGFUSE_LOG_LEVEL"));
        EnvFilter::new(format!("{level},metrics_exporter_dogstatsd=off"))
    });
    let builder = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stdout)
        .with_ansi(false);
    // try_init only fails when a global subscriber already exists, in which
    // case that one keeps receiving the events.
    let _ = if env_or_empty("LANGFUSE_LOG_FORMAT") == "json" {
        builder
            .json()
            .flatten_event(true)
            .with_current_span(false)
            .with_span_list(false)
            .try_init()
    } else {
        builder.try_init()
    };
}

/// Maps winston's npm levels (error, warn, info, http, verbose, debug, silly)
/// onto tracing's five.
fn tracing_level_from_winston(level: &str) -> &'static str {
    match level.trim().to_ascii_lowercase().as_str() {
        "error" => "error",
        "warn" => "warn",
        "http" | "verbose" | "debug" => "debug",
        "silly" => "trace",
        _ => "info",
    }
}

fn init_metrics(config: &Config) -> Result<(), String> {
    let address = config
        .dogstatsd_address
        .clone()
        .unwrap_or_else(dogstatsd_address_from_env);
    let mut builder = DogStatsDBuilder::default()
        .with_remote_address(&address)
        .map_err(|error| format!("invalid DogStatsD address {address}: {error}"))?
        .with_global_labels(global_labels_from_env())
        .with_telemetry(false);
    if let Some(interval) = config.flush_interval {
        builder = builder.with_flush_interval(interval);
    }
    builder
        .install()
        .map_err(|error| format!("failed to install DogStatsD exporter for {address}: {error}"))?;
    tracing::info!(address, "native telemetry initialised");
    Ok(())
}

/// Same resolution order as dd-trace: an explicit DogStatsD host, then the
/// agent host, then localhost; port 8125 unless overridden.
fn dogstatsd_address_from_env() -> String {
    let host = first_env(&[
        "DD_DOGSTATSD_HOST",
        "DD_DOGSTATSD_HOSTNAME",
        "DD_AGENT_HOST",
    ])
    .unwrap_or_else(|| "localhost".to_string());
    let port = first_env(&["DD_DOGSTATSD_PORT"]).unwrap_or_else(|| "8125".to_string());
    format!("{host}:{port}")
}

/// The unified service tags dd-trace attaches to every metric, plus DD_TAGS
/// (comma-separated `key:value` pairs, or space-separated when no comma is
/// present, as dd-trace parses it).
fn global_labels_from_env() -> Vec<Label> {
    let mut labels = Vec::new();
    for (key, sources) in [
        ("env", &["DD_ENV"][..]),
        ("service", &["DD_SERVICE", "OTEL_SERVICE_NAME"][..]),
        ("version", &["DD_VERSION"][..]),
    ] {
        if let Some(value) = first_env(sources) {
            labels.push(Label::new(key, value));
        }
    }
    if let Some(tags) = first_env(&["DD_TAGS"]) {
        let separator = if tags.contains(',') { ',' } else { ' ' };
        for pair in tags
            .split(separator)
            .map(str::trim)
            .filter(|pair| !pair.is_empty())
        {
            if let Some((key, value)) = pair.split_once(':') {
                labels.push(Label::new(key.to_string(), value.to_string()));
            }
        }
    }
    labels
}

fn first_env(names: &[&str]) -> Option<String> {
    names
        .iter()
        .filter_map(|name| env::var(name).ok())
        .find(|value| !value.trim().is_empty())
}

fn env_or_empty(name: &str) -> String {
    env::var(name).unwrap_or_default()
}
