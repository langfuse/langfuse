//! CPU-bound request work kept off the async workers.
use std::{num::NonZeroUsize, sync::Arc};

use tokio::sync::Semaphore;

/// Parsing this much JSON takes a few tens of microseconds, about what a hand-off
/// to the blocking pool costs, so smaller inputs run inline. Larger ones would hold
/// an async worker past the ~100 µs a task should run between awaits.
pub(crate) const INLINE_INPUT_BYTES: usize = 64 * 1024;

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

    /// Runs `work` over an input of `input_bytes`: inline up to `INLINE_INPUT_BYTES`,
    /// otherwise on the blocking pool once a permit is free. `None` when the job
    /// did not complete, which only happens when it panicked or the runtime is
    /// shutting down.
    pub(crate) async fn run<T: Send + 'static>(
        &self,
        input_bytes: usize,
        work: impl FnOnce() -> T + Send + 'static,
    ) -> Option<T> {
        if input_bytes <= INLINE_INPUT_BYTES {
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
        let small = cpu
            .run(INLINE_INPUT_BYTES, || std::thread::current().id())
            .await;
        let large = cpu
            .run(INLINE_INPUT_BYTES + 1, || std::thread::current().id())
            .await;
        assert_eq!(small, Some(caller));
        assert!(large.is_some_and(|thread| thread != caller));
    }
}
