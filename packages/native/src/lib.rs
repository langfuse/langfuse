//! Native addon for the Langfuse worker, built with napi-rs.
//!
//! Functions annotated with `#[napi]` are exported to Node.js; `napi build`
//! derives `index.d.ts` from their signatures. Native code reports through the
//! `metrics` and `tracing` facades set up in [`telemetry`]; it never hands
//! values back for Node to record.

/// Rust-only encoder for prepared v4 `events_full` rows.
pub mod native_codec;
mod native_js;
pub(crate) mod native_schema;
mod telemetry;

use std::sync::Arc;
use std::time::Duration;

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// A complete ClickHouse Native request body and its row count.
///
/// The buffer is created only after the async Rust encoder has finished. The JS transport can
/// retain it for retries without retaining the input rows or any NAPI handles.
#[napi(object)]
pub struct NativeEventBlock {
    pub bytes: Buffer,
    pub row_count: u32,
}

/// Identifiers used by ingestion retry and drop logging.
#[napi(object)]
pub struct PreparedEventIds {
    #[napi(js_name = "project_id")]
    pub project_id: String,
    #[napi(js_name = "trace_id")]
    pub trace_id: String,
    pub id: String,
}

/// A snapshot of one finalized event row, retained until its JS handle and any encoder tasks drop it.
#[napi]
pub struct PreparedEvent {
    row: Arc<native_schema::PreparedEventRow>,
}

#[napi]
impl PreparedEvent {
    /// Read a storage-ready row into owned Rust fields. JSON-valued String columns such as
    /// `model_parameters` must already be serialized by TypeScript; `event_bytes` must be supplied
    /// after overflow handling and accounting. This constructor never serializes the JS row.
    #[napi(constructor, ts_args_type = "row: object")]
    pub fn new(row: Unknown<'_>) -> Result<Self> {
        let row = native_schema::PreparedEventRow::from_js(row)
            .map_err(|error| Error::from_reason(format!("prepared event: {error}")))?;
        Ok(Self { row: Arc::new(row) })
    }

    #[napi(getter)]
    pub fn ids(&self) -> PreparedEventIds {
        PreparedEventIds {
            project_id: self.row.project_id.clone(),
            trace_id: self.row.trace_id.clone(),
            id: self.row.span_id.clone(),
        }
    }

    #[napi]
    pub fn columns() -> Vec<PreparedEventColumn> {
        native_schema::PreparedEventRow::columns()
            .into_iter()
            .map(|(name, column_type, uses_default)| PreparedEventColumn {
                name,
                column_type,
                uses_default,
            })
            .collect()
    }
}

/// ClickHouse column metadata generated from the prepared-row schema.
#[napi(object)]
pub struct PreparedEventColumn {
    pub name: String,
    pub column_type: String,
    pub uses_default: bool,
}

pub struct EncodeClickhouseEventsTask {
    rows: Vec<Arc<native_schema::PreparedEventRow>>,
    max_rows_per_block: usize,
}

impl Task for EncodeClickhouseEventsTask {
    type Output = Vec<native_codec::EncodedBlock>;
    type JsValue = Vec<NativeEventBlock>;

    fn compute(&mut self) -> Result<Self::Output> {
        native_codec::encode_v4_native_blocks(&self.rows, self.max_rows_per_block)
            .map_err(Error::from_reason)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        output
            .into_iter()
            .map(|block| {
                let row_count = u32::try_from(block.row_count)
                    .map_err(|_| Error::from_reason("Native block row count exceeds UInt32"))?;
                // The encoder returns a fresh, uniquely owned allocation. Vec takes it over,
                // then napi wraps the same memory in a JS Buffer whose GC finalizer frees it.
                // This handoff does not copy the payload. If the runtime forbids external
                // buffers, napi-rs copies it into Node-owned memory instead. Shared or sliced
                // Bytes would not have the same no-copy guarantee when converted to Vec.
                Ok(NativeEventBlock {
                    bytes: Buffer::from(Vec::from(block.bytes)),
                    row_count,
                })
            })
            .collect()
    }
}

fn checked_max_rows_per_block(value: f64) -> Result<usize> {
    const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
    if !value.is_finite() || value <= 0.0 || value.fract() != 0.0 {
        return Err(Error::from_reason(
            "maxRowsPerBlock must be a positive safe integer",
        ));
    }
    if value > MAX_SAFE_INTEGER {
        return Err(Error::from_reason(
            "maxRowsPerBlock must be no greater than Number.MAX_SAFE_INTEGER",
        ));
    }
    usize::try_from(value as u64)
        .map_err(|_| Error::from_reason("maxRowsPerBlock does not fit in a native usize"))
}

/// Encode prepared event handles as Native blocks.
///
/// The array is the batch merge point. Each handle already owns an immutable typed row, so the
/// async task only clones its Arc and never reads or copies row fields.
#[napi(
    ts_args_type = "rows: PreparedEvent[], maxRowsPerBlock: number",
    ts_return_type = "Promise<NativeEventBlock[]>"
)]
pub fn encode_clickhouse_events(
    rows: Array<'_>,
    max_rows_per_block: f64,
) -> Result<AsyncTask<EncodeClickhouseEventsTask>> {
    let max_rows_per_block = checked_max_rows_per_block(max_rows_per_block)?;
    let mut prepared_rows = Vec::with_capacity(rows.len() as usize);
    // napi's Array is a JS handle with indexed access, not a Rust slice with an iterator.
    // Retain each immutable Rust row for the background task before leaving the JS thread:
    // Arc::clone increments a reference count without copying fields, and keeps the row alive
    // even if Node collects its PreparedEvent wrapper. No JS handles enter the task.
    for index in 0..rows.len() {
        let event = rows
            .get::<ClassInstance<'_, PreparedEvent>>(index)?
            .ok_or_else(|| Error::from_reason(format!("missing row at index {index}")))?;
        prepared_rows.push(Arc::clone(&event.row));
    }

    Ok(AsyncTask::new(EncodeClickhouseEventsTask {
        rows: prepared_rows,
        max_rows_per_block,
    }))
}

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
/// of the worker: one increment of the `langfuse.native.hello_calls` counter
/// tagged with `source`, plus a debug-level log line. The worker calls this on
/// every health probe, so the log line stays below the default level.
#[napi]
pub fn hello(source: String) {
    tracing::debug!(source, "hello from the native addon");
    metrics::counter!("langfuse.native.hello_calls", "source" => source).increment(1);
}
