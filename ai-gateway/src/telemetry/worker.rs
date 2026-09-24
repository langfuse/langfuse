use std::sync::Arc;

use opentelemetry::trace::TraceContextExt;
use tokio::{
    sync::{Semaphore, mpsc},
    task::JoinSet,
    time::Instant,
};
use tracing::Instrument;
use tracing_opentelemetry::OpenTelemetrySpanExt;

use super::{
    Grant, Stats,
    batch::{Batches, Flush, Pending},
    otlp::{ExportError, Payload, Uploader},
    retry::{RetryPolicy, random},
};

pub(super) enum Message {
    Record(Grant, Pending),
    Shutdown(Instant),
}

pub(super) async fn run_worker(
    mut queue: mpsc::Receiver<Message>,
    mut batches: Batches,
    mut uploads: Uploads,
) {
    let deadline = loop {
        let due = batches.next_due();
        tokio::select! {
            message = queue.recv() => match message {
                Some(Message::Record(grant, item)) => {
                    uploads.start_flushes(batches.push_record(grant, item, Instant::now()));
                }
                Some(Message::Shutdown(deadline)) => break deadline,
                None => break Instant::now(),
            },
            () = sleep_until_due(due) => uploads.start_flushes(batches.take_due(Instant::now())),
        }
    };
    queue.close();
    while let Some(message) = queue.recv().await {
        if let Message::Record(grant, item) = message {
            uploads.start_flushes(batches.push_record(grant, item, Instant::now()));
        }
    }
    uploads.start_flushes(batches.take_all());
    uploads.drain_until(deadline).await;
}

async fn sleep_until_due(due: Option<Instant>) {
    match due {
        Some(due) => tokio::time::sleep_until(due).await,
        None => std::future::pending().await,
    }
}

pub(super) struct Uploads {
    uploader: Arc<Uploader>,
    slots: Arc<Semaphore>,
    retry: RetryPolicy,
    tasks: JoinSet<()>,
    stats: Arc<Stats>,
}

impl Uploads {
    pub fn new(uploader: Uploader, slots: usize, retry: RetryPolicy, stats: Arc<Stats>) -> Self {
        Self {
            uploader: Arc::new(uploader),
            slots: Arc::new(Semaphore::new(slots)),
            retry,
            tasks: JoinSet::new(),
            stats,
        }
    }

    fn start_flushes(&mut self, flushes: Vec<Flush>) {
        for flush in flushes {
            self.start_flush(flush);
        }
    }

    fn start_flush(&mut self, flush: Flush) {
        while self.tasks.try_join_next().is_some() {}
        let receipt = Receipt::new(flush.items.len(), self.stats.clone());
        let span = tracing::info_span!(
            parent: None,
            "telemetry.batch",
            otel.kind = "internal",
            gateway.telemetry.records = i64::try_from(flush.items.len()).unwrap_or(i64::MAX),
            gateway.telemetry.attempts = tracing::field::Empty
        );
        for item in &flush.items {
            if item.link.is_valid() {
                span.add_link(item.link.clone());
            }
        }
        let uploader = self.uploader.clone();
        let slots = self.slots.clone();
        let retry = self.retry;
        self.tasks.spawn(
            async move {
                let (flush, payload) = match encode(flush).await {
                    Ok(encoded) => encoded,
                    Err(error) => return receipt.settle_failed(error.reason()),
                };
                let mut attempt = 1;
                let outcome = loop {
                    let Ok(slot) = slots.acquire().await else {
                        return;
                    };
                    let result = uploader.export(&flush.grant, &payload).await;
                    drop(slot);
                    let Err(error) = result else { break Ok(()) };
                    let Some(delay) =
                        retry.backoff(attempt, &error, flush.grant.remaining(), random())
                    else {
                        break Err(error);
                    };
                    tracing::debug!(
                        attempt,
                        reason = error.reason(),
                        delay_ms = u64::try_from(delay.as_millis()).unwrap_or(u64::MAX),
                        "gateway telemetry upload retrying"
                    );
                    tokio::time::sleep(delay).await;
                    attempt += 1;
                };
                tracing::Span::current().record("gateway.telemetry.attempts", i64::from(attempt));
                match outcome {
                    Ok(()) => receipt.settle_accepted(),
                    Err(error) => receipt.settle_failed(error.reason()),
                }
            }
            .instrument(span),
        );
    }

    async fn drain_until(mut self, deadline: Instant) {
        loop {
            match tokio::time::timeout_at(deadline, self.tasks.join_next()).await {
                Ok(Some(_)) => {}
                Ok(None) => break,
                Err(_) => {
                    self.tasks.abort_all();
                    while self.tasks.join_next().await.is_some() {}
                    break;
                }
            }
        }
    }
}

<<<<<<< HEAD
=======
async fn encode(flush: Flush) -> Result<(Flush, Payload), ExportError> {
    tokio::task::spawn_blocking(move || {
        let spans: Vec<_> = flush.items.iter().map(|item| &item.span).collect();
        let payload = Payload::encode(&spans)?;
        drop(spans);
        Ok((flush, payload))
    })
    .await
    .unwrap_or(Err(ExportError::Payload))
}

>>>>>>> fbab56e64 (perf(ai-gateway): gzip telemetry uploads)
struct Receipt {
    records: u64,
    stats: Arc<Stats>,
    settled: bool,
}

impl Receipt {
    fn new(records: usize, stats: Arc<Stats>) -> Self {
        Self {
            records: u64::try_from(records).unwrap_or(u64::MAX),
            stats,
            settled: false,
        }
    }

    fn settle_accepted(mut self) {
        self.settled = true;
        self.stats.record_accepted(self.records);
        tracing::debug!(records = self.records, "gateway telemetry accepted");
    }

    fn settle_failed(mut self, reason: &'static str) {
        self.settled = true;
        if self.stats.record_failed(self.records, reason) {
            let context = tracing::Span::current().context();
            let span = context.span();
            let context = span.span_context();
            tracing::warn!(
                trace_id = %context.trace_id(),
                span_id = %context.span_id(),
                reason,
                records = self.records,
                failed = self.stats.failed.load(std::sync::atomic::Ordering::Relaxed),
                "gateway telemetry upload failed"
            );
        }
    }
}

impl Drop for Receipt {
    fn drop(&mut self) {
        if !self.settled {
            self.stats.record_dropped(self.records, "shutdown");
        }
    }
}
