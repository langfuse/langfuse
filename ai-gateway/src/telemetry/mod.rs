//! Best-effort delivery of finalized inference facts, batched per project.
mod batch;
mod context;
mod mapping;
mod otlp;
mod retry;
mod worker;

use std::{
    io::{self, Write},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::http::HeaderMap;
use opentelemetry::trace::TraceContextExt;
use serde_json::{Map, Value};
use tokio::{
    sync::{Semaphore, mpsc, mpsc::error::TrySendError},
    task::JoinHandle,
    time::Instant,
};
use tracing_opentelemetry::OpenTelemetrySpanExt;

use crate::{
    capture::InferenceFacts,
    resolution::{ControlPlaneConfig, ResolutionError, ResolvedRequestContext},
};
use batch::{BatchPolicy, Batches, Pending};
use context::GenerationContext;
pub(crate) use context::take_agent_client_metadata;
use otlp::Uploader;
use retry::RetryPolicy;
use worker::{Message, Uploads};

const MAX_UPLOADS: usize = 32;
const MAX_RECORD_BYTES: usize = 4 * 1024 * 1024;
const MAX_RETAINED_BYTES: usize = 16 * 1024 * 1024;
const MAX_QUEUED_RECORDS: usize = 1024;

/// Ingestion credentials for one project. Deliberately not serializable or printable.
struct Grant {
    project_id: String,
    access_token: String,
    expires_at: u64,
}

impl Grant {
    fn remaining(&self) -> Duration {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        Duration::from_secs(self.expires_at).saturating_sub(now)
    }
}

/// Project attribution stays attached to each execution even when delivery outlives
/// the response body.
pub(crate) struct DeliveryContext {
    grant: Grant,
    generation: GenerationContext,
}

impl DeliveryContext {
    pub fn from_resolved(
        context: &ResolvedRequestContext,
        headers: &HeaderMap,
        client_metadata: Option<&Map<String, Value>>,
    ) -> Self {
        Self {
            grant: Grant {
                project_id: context.attribution().project_id().to_owned(),
                access_token: context.ingestion().access_token().to_owned(),
                expires_at: context.ingestion().expires_at(),
            },
            generation: GenerationContext::from_request(headers, client_metadata),
        }
    }
}

/// Per-record delivery outcomes.
#[derive(Default)]
struct Stats {
    accepted: AtomicU64,
    failed: AtomicU64,
    dropped: AtomicU64,
}

impl Stats {
    fn record_accepted(&self, records: u64) {
        self.accepted.fetch_add(records, Ordering::Relaxed);
        crate::observability::delivery("accepted", "success", records);
    }

    /// Returns whether this failure crosses a log reporting threshold.
    fn record_failed(&self, records: u64, reason: &'static str) -> bool {
        let before = self.failed.fetch_add(records, Ordering::Relaxed);
        crate::observability::delivery("failed", reason, records);
        crosses_report_threshold(before, before + records)
    }

    fn record_dropped(&self, records: u64, reason: &'static str) {
        let before = self.dropped.fetch_add(records, Ordering::Relaxed);
        crate::observability::delivery("dropped", reason, records);
        let dropped = before + records;
        if crosses_report_threshold(before, dropped) {
            tracing::warn!(reason, dropped, "gateway telemetry dropped");
        }
    }
}

/// Log the first occurrence and then once per hundred records.
fn crosses_report_threshold(before: u64, after: u64) -> bool {
    before == 0 || before / 100 != after / 100
}

struct Delivery {
    queue: mpsc::Sender<Message>,
    retained: Arc<Semaphore>,
    worker: Mutex<Option<JoinHandle<()>>>,
    stats: Arc<Stats>,
}

/// Shared delivery handle. Shutdown closes submission and drains already admitted work.
#[derive(Clone)]
pub struct Telemetry(Arc<Delivery>);

impl Telemetry {
    /// Must be called within a Tokio runtime, which runs the delivery worker.
    pub(crate) fn new(config: &ControlPlaneConfig) -> Result<Self, ResolutionError> {
        Ok(Self::with_uploader(
            Uploader::new(config)?,
            MAX_UPLOADS,
            MAX_RETAINED_BYTES,
            BatchPolicy::default(),
            RetryPolicy::default(),
        ))
    }

    /// Uploads open batches after a few milliseconds instead of the production linger,
    /// in a single attempt.
    #[cfg(test)]
    pub(crate) fn for_test(config: &ControlPlaneConfig) -> Self {
        Self::with_uploader(
            Uploader::new(config).expect("test uploader"),
            MAX_UPLOADS,
            MAX_RETAINED_BYTES,
            BatchPolicy {
                linger: Duration::from_millis(10),
                ..BatchPolicy::default()
            },
            RetryPolicy {
                max_attempts: 1,
                ..RetryPolicy::default()
            },
        )
    }

    fn with_uploader(
        uploader: Uploader,
        uploads: usize,
        bytes: usize,
        policy: BatchPolicy,
        retry: RetryPolicy,
    ) -> Self {
        let (queue, receiver) = mpsc::channel(MAX_QUEUED_RECORDS);
        let stats = Arc::new(Stats::default());
        let worker = tokio::spawn(worker::run_worker(
            receiver,
            Batches::new(policy),
            Uploads::new(uploader, uploads, retry, stats.clone()),
        ));
        Self(Arc::new(Delivery {
            queue,
            retained: Arc::new(Semaphore::new(bytes)),
            worker: Mutex::new(Some(worker)),
            stats,
        }))
    }

    /// No waiting and no network work on the caller's response/drop path.
    pub(crate) fn record(&self, context: DeliveryContext, facts: InferenceFacts) {
        let link = tracing::Span::current()
            .context()
            .span()
            .span_context()
            .clone();
        let span = mapping::span(facts, &context.generation);
        let credentials = context.grant.access_token.len() + context.grant.project_id.len();
        let mut size = SizeCounter {
            bytes: 0,
            limit: MAX_RECORD_BYTES.saturating_sub(credentials),
        };
        if serde_json::to_writer(&mut size, &span).is_err() {
            self.0.stats.record_dropped(1, "size");
            return;
        }
        let Ok(retained) = self.0.retained.clone().try_acquire_many_owned(
            u32::try_from(size.bytes + credentials).expect("bounded record bytes"),
        ) else {
            self.0.stats.record_dropped(1, "bytes");
            return;
        };
        let item = Pending::new(span, size.bytes, link, retained);
        match self.0.queue.try_send(Message::Record(context.grant, item)) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => self.0.stats.record_dropped(1, "capacity"),
            Err(TrySendError::Closed(_)) => self.0.stats.record_dropped(1, "shutdown"),
        }
    }

    /// Stop accepting work, flush open batches, and finish uploads within the existing
    /// process drain deadline.
    ///
    /// # Panics
    /// Panics if the worker handle lock was poisoned.
    pub async fn shutdown(&self, deadline: Instant) {
        let worker = self
            .0
            .worker
            .lock()
            .expect("telemetry worker lock poisoned")
            .take();
        let Some(worker) = worker else {
            return;
        };
        if self.0.queue.send(Message::Shutdown(deadline)).await.is_ok() {
            let _ = worker.await;
        }
        tracing::info!(
            accepted = self.0.stats.accepted.load(Ordering::Relaxed),
            failed = self.0.stats.failed.load(Ordering::Relaxed),
            dropped = self.0.stats.dropped.load(Ordering::Relaxed),
            "gateway telemetry stopped"
        );
    }
}

/// Count serialized bytes without allocating a copy on the finalization path.
struct SizeCounter {
    bytes: usize,
    limit: usize,
}

impl Write for SizeCounter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.limit.saturating_sub(self.bytes) {
            return Err(io::Error::other("telemetry size limit"));
        }
        self.bytes += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub(crate) fn debug_record(facts: &InferenceFacts) {
    tracing::debug!(
        api_format = facts.api_format,
        outcome = facts.outcome.as_str(),
        http_status = facts.http_status,
        duration_ms = u64::try_from(facts.duration_ms).unwrap_or(u64::MAX),
        first_byte_ms = facts
            .first_byte_ms
            .map(|ms| u64::try_from(ms).unwrap_or(u64::MAX)),
        input_complete = facts.inference.input_complete,
        output_complete = facts.inference.output_complete,
        capture_complete = facts.inference.capture_complete,
        "gateway response captured"
    );
}

#[cfg(test)]
mod tests;
