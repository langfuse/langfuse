//! CPU-bound request work kept off the async workers.
use std::{num::NonZeroUsize, sync::Arc};

use tokio::sync::Semaphore;

/// The kinds of CPU-bound request work, which differ in how much input runs within
/// the ~100 µs a task should run between awaits. Larger inputs would hold an async
/// worker past that, so they move to the blocking pool.
#[derive(Clone, Copy, Debug)]
pub(crate) enum CpuJob {
    /// Parsing the request body, at roughly 7 GB/s for ASCII and 3 GB/s for
    /// non-ASCII text, so 256 KiB takes under ~100 µs either way.
    ParseRequest,
    /// Finding a conversation's last turn, which reads its structure at about the
    /// speed of parsing it.
    FindLastTurn,
    /// Scanning the last turn with guardrails, at roughly 0.5 GB/s.
    ScanGuardrails,
}

impl CpuJob {
    pub(crate) const fn inline_bytes(self) -> usize {
        match self {
            Self::ParseRequest | Self::FindLastTurn => 256 * 1024,
            Self::ScanGuardrails => 64 * 1024,
        }
    }
}

/// Runs large CPU-bound jobs on Tokio's blocking pool. Jobs share a permit per
/// half core, so large bodies cannot occupy every core while the async workers
/// still have connections to serve.
#[derive(Clone)]
pub(crate) struct CpuWork {
    permits: Arc<Semaphore>,
}

impl CpuWork {
    pub(crate) fn new() -> Self {
        let cores = std::thread::available_parallelism().map_or(1, NonZeroUsize::get);
        Self::with_permits((cores / 2).max(1))
    }

    pub(crate) fn with_permits(permits: usize) -> Self {
        Self {
            permits: Arc::new(Semaphore::new(permits)),
        }
    }

    /// Runs `work` over an input of `input_bytes`: inline up to the job's inline size,
    /// otherwise on the blocking pool once a permit is free. `None` when the job
    /// did not complete, which only happens when it panicked or the runtime is
    /// shutting down.
    pub(crate) async fn run<T: Send + 'static>(
        &self,
        job: CpuJob,
        input_bytes: usize,
        work: impl FnOnce() -> T + Send + 'static,
    ) -> Option<T> {
        if input_bytes <= job.inline_bytes() {
            return Some(work());
        }
        let permit = Arc::clone(&self.permits).acquire_owned().await.ok()?;
        let span = tracing::Span::current();
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            span.in_scope(work)
        })
        .await
        .ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn large_inputs_leave_the_calling_thread_and_small_ones_do_not() {
        let cpu = CpuWork::with_permits(1);
        let caller = std::thread::current().id();
        let job = CpuJob::ScanGuardrails;
        let small = cpu
            .run(job, job.inline_bytes(), || std::thread::current().id())
            .await;
        let large = cpu
            .run(job, job.inline_bytes() + 1, || std::thread::current().id())
            .await;
        assert_eq!(small, Some(caller));
        assert!(large.is_some_and(|thread| thread != caller));
    }
}
