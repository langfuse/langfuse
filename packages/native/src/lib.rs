//! Native addon for the Langfuse worker, built with napi-rs.
//!
//! Functions annotated with `#[napi]` are exported to Node.js; `napi build`
//! derives `index.d.ts` from their signatures. Native code reports through the
//! `metrics` and `tracing` facades set up in [`telemetry`]; it never hands
//! values back for Node to record.

mod telemetry;

use std::time::Duration;

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Overrides for [`init_telemetry`]. Everything left unset comes from the
/// environment: `DD_DOGSTATSD_HOST` / `DD_AGENT_HOST` and `DD_DOGSTATSD_PORT`
/// for the agent, `DD_ENV`, `DD_SERVICE`, `DD_VERSION`, `DD_TAGS` for global
/// tags, `LANGFUSE_LOG_LEVEL`, `LANGFUSE_LOG_FORMAT` and `RUST_LOG` for logs.
#[napi(object)]
#[derive(Default)]
pub struct TelemetryOptions {
    /// DogStatsD endpoint as `host:port`.
    pub dogstatsd_address: Option<String>,
    /// How often aggregated metrics are flushed to the agent, in milliseconds.
    pub flush_interval_ms: Option<u32>,
}

/// Installs the metrics exporter and the log subscriber for native code. Call
/// it once at process start; later calls return the first call's outcome.
#[napi]
pub fn init_telemetry(options: Option<TelemetryOptions>) -> Result<()> {
    let options = options.unwrap_or_default();
    telemetry::init(telemetry::Config {
        dogstatsd_address: options.dogstatsd_address,
        flush_interval: options
            .flush_interval_ms
            .map(|ms| Duration::from_millis(u64::from(ms))),
    })
    .map_err(|message| Error::new(Status::GenericFailure, message))
}

/// Hello-world entry point. It proves that the worker can load and call the
/// addon and that native code reports through the same telemetry as the rest
/// of the worker: one log line, and one increment of the
/// `langfuse.native.hello_calls` counter tagged with `source`.
#[napi]
pub fn hello(source: String) {
    tracing::info!(source, "hello from the native addon");
    metrics::counter!("langfuse.native.hello_calls", "source" => source).increment(1);
}
