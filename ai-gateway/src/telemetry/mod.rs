//! Immediate, best-effort delivery of finalized inference facts.
mod mapping;
mod otlp;

use std::{
    io::{self, Write},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
};

use tokio::{sync::Semaphore, task::JoinSet, time::Instant};
use uuid::Uuid;

use crate::{
    capture::InferenceFacts,
    resolution::{ControlPlaneConfig, ResolutionError, ResolvedRequestContext},
};
use otlp::Uploader;

const MAX_UPLOADS: usize = 32;
const MAX_FACT_BYTES: usize = 4 * 1024 * 1024;
const MAX_RETAINED_BYTES: usize = 16 * 1024 * 1024;

/// Credentials are deliberately not serializable or printable. Project attribution
/// stays attached to each execution even when delivery outlives the response body.
pub(crate) struct DeliveryContext {
    pub project_id: String,
    pub access_token: String,
    pub expires_at: u64,
    trace_id: String,
    observation_id: String,
}

impl DeliveryContext {
    pub fn from_resolved(context: &ResolvedRequestContext) -> Self {
        Self {
            project_id: context.attribution().project_id().to_owned(),
            access_token: context.ingestion().access_token().to_owned(),
            expires_at: context.ingestion().expires_at(),
            trace_id: Uuid::new_v4().simple().to_string(),
            observation_id: Uuid::new_v4().simple().to_string()[..16].to_owned(),
        }
    }
}

#[derive(Default)]
struct Stats {
    accepted: AtomicU64,
    failed: AtomicU64,
    dropped: AtomicU64,
}

struct Delivery {
    uploader: Arc<Uploader>,
    capacity: Arc<Semaphore>,
    bytes: Arc<Semaphore>,
    tasks: Mutex<Option<JoinSet<()>>>,
    stats: Arc<Stats>,
}

/// Shared delivery handle. Shutdown closes submission and drains already admitted work.
#[derive(Clone)]
pub struct Telemetry(Arc<Delivery>);

impl Telemetry {
    pub(crate) fn new(config: &ControlPlaneConfig) -> Result<Self, ResolutionError> {
        Ok(Self::with_uploader(
            Uploader::new(config)?,
            MAX_UPLOADS,
            MAX_RETAINED_BYTES,
        ))
    }

    fn with_uploader(uploader: Uploader, uploads: usize, bytes: usize) -> Self {
        Self(Arc::new(Delivery {
            uploader: Arc::new(uploader),
            capacity: Arc::new(Semaphore::new(uploads)),
            bytes: Arc::new(Semaphore::new(bytes)),
            tasks: Mutex::new(Some(JoinSet::new())),
            stats: Arc::new(Stats::default()),
        }))
    }

    /// No waiting queue and no network work on the caller's response/drop path.
    pub(crate) fn record(&self, context: DeliveryContext, facts: InferenceFacts) {
        let Ok(capacity) = self.0.capacity.clone().try_acquire_owned() else {
            self.drop_record("capacity");
            return;
        };
        let mut size = SizeCounter {
            bytes: context.access_token.len() + context.project_id.len(),
            limit: MAX_FACT_BYTES,
        };
        if serde_json::to_writer(&mut size, &facts).is_err() {
            self.drop_record("size");
            return;
        }
        let Ok(bytes) = self
            .0
            .bytes
            .clone()
            .try_acquire_many_owned(u32::try_from(size.bytes).expect("bounded fact bytes"))
        else {
            self.drop_record("bytes");
            return;
        };
        let mut tasks = self.0.tasks.lock().expect("telemetry task lock poisoned");
        let Some(tasks) = tasks.as_mut() else {
            self.drop_record("shutdown");
            return;
        };
        // Reap completed handles on submission so the task registry stays bounded.
        while tasks.try_join_next().is_some() {}
        let uploader = self.0.uploader.clone();
        let stats = self.0.stats.clone();
        tasks.spawn(async move {
            let _capacity = capacity;
            let _bytes = bytes;
            let span = mapping::span(facts, &context.trace_id, &context.observation_id);
            match uploader.export(&context, &[span]).await {
                Ok(()) => {
                    stats.accepted.fetch_add(1, Ordering::Relaxed);
                    tracing::debug!("gateway telemetry accepted");
                }
                Err(error) => {
                    stats.failed.fetch_add(1, Ordering::Relaxed);
                    // Error categories contain no URLs, credentials, response bodies or content.
                    tracing::warn!(reason = error.reason(), "gateway telemetry upload failed");
                }
            }
        });
    }

    fn drop_record(&self, reason: &'static str) {
        self.0.stats.dropped.fetch_add(1, Ordering::Relaxed);
        tracing::warn!(reason, "gateway telemetry dropped");
    }

    /// Stop accepting work and finish uploads within the existing process drain deadline.
    ///
    /// # Panics
    /// Panics if the upload task lock was poisoned.
    pub async fn shutdown(&self, deadline: Instant) {
        self.0.capacity.close();
        let tasks = self
            .0
            .tasks
            .lock()
            .expect("telemetry task lock poisoned")
            .take();
        let Some(mut tasks) = tasks else {
            return;
        };
        loop {
            match tokio::time::timeout_at(deadline, tasks.join_next()).await {
                Ok(Some(Ok(()))) => {}
                Ok(Some(Err(_))) => {
                    self.0.stats.failed.fetch_add(1, Ordering::Relaxed);
                }
                Ok(None) => break,
                Err(_) => {
                    tasks.abort_all();
                    while let Some(result) = tasks.join_next().await {
                        if result.is_err() {
                            self.0.stats.dropped.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                    break;
                }
            }
        }
        tracing::info!(
            accepted = self.0.stats.accepted.load(Ordering::Relaxed),
            failed = self.0.stats.failed.load(Ordering::Relaxed),
            dropped = self.0.stats.dropped.load(Ordering::Relaxed),
            "gateway telemetry stopped"
        );
    }
}

/// Count serialized facts without allocating a second copy on the finalization path.
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
    // Full mode intentionally includes native request and completed output content.
    tracing::debug!(capture = %format_args!("{:#}", serde_json::to_value(facts).expect("captured facts must serialize")), "gateway response captured");
}

#[cfg(test)]
mod tests;
