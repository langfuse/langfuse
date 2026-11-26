//! CPU-bound request work kept off the async workers.
mod scheduler;

use std::num::NonZeroUsize;

use crate::resolution::ResolvedRequestContext;
use scheduler::Scheduler;

/// The kinds of CPU-bound request work, each with an inline size threshold up to
/// which it runs on the async worker rather than queuing for the blocking pool.
#[derive(Clone, Copy, Debug)]
pub(crate) enum CpuJob {
    /// Parsing the request body (~0.5 ms at 2 MiB); kept inline up to 2 MiB so
    /// normal requests bypass blocking-pool queue contention behind guardrail scans.
    ParseRequest,
    /// Finding a conversation's last turn, which reads its structure at about the
    /// speed of parsing it and shares the 2 MiB inline threshold.
    FindLastTurn,
    /// Scanning the last turn with guardrails. Presets and keyword lists run at
    /// roughly 0.5 GB/s, while tenant-supplied custom regexes can fall back from
    /// the lazy DFA to `PikeVM`; keep only small turns (up to 4 KiB) inline so
    /// slow scans leave the async worker.
    ScanGuardrails,
}

impl CpuJob {
    pub(crate) const fn inline_bytes(self) -> usize {
        match self {
            Self::ParseRequest | Self::FindLastTurn => 2 * 1024 * 1024,
            Self::ScanGuardrails => 4 * 1024,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CpuClass {
    Standard,
    Guardrailed,
}

impl CpuClass {
    pub(crate) fn for_context(context: &ResolvedRequestContext) -> Self {
        if context.has_active_guardrails() {
            Self::Guardrailed
        } else {
            Self::Standard
        }
    }
}

/// Runs large CPU-bound jobs on Tokio's blocking pool. Jobs share a permit per
/// half core via a two-class 4:1 CPU-time weighted dispatcher.
#[derive(Clone)]
pub(crate) struct CpuWork {
    scheduler: Scheduler,
}

impl CpuWork {
    pub(crate) fn new() -> Self {
        let cores = std::thread::available_parallelism().map_or(1, NonZeroUsize::get);
        Self::with_permits((cores / 2).max(1))
    }

    pub(crate) fn with_permits(permits: usize) -> Self {
        Self {
            scheduler: Scheduler::new(permits),
        }
    }

    /// Runs `work` over an input of `input_bytes`: inline up to the job's inline size,
    /// otherwise on the blocking pool once a permit is free. `None` when the job
    /// did not complete, which only happens when it panicked or the runtime is
    /// shutting down.
    pub(crate) async fn run<T: Send + 'static>(
        &self,
        job: CpuJob,
        class: CpuClass,
        input_bytes: usize,
        work: impl FnOnce() -> T + Send + 'static,
    ) -> Option<T> {
        if input_bytes <= job.inline_bytes() {
            return Some(work());
        }
        let mut permit = self.scheduler.acquire(class).await?;
        let span = tracing::Span::current();
        tokio::task::spawn_blocking(move || {
            permit.mark_started();
            let result = span.in_scope(work);
            drop(permit);
            result
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
        for (job, threshold) in [
            (CpuJob::ParseRequest, 2 * 1024 * 1024),
            (CpuJob::FindLastTurn, 2 * 1024 * 1024),
            (CpuJob::ScanGuardrails, 4 * 1024),
        ] {
            let small = cpu
                .run(job, CpuClass::Standard, threshold, || {
                    std::thread::current().id()
                })
                .await;
            let large = cpu
                .run(job, CpuClass::Standard, threshold + 1, || {
                    std::thread::current().id()
                })
                .await;
            assert_eq!(
                small,
                Some(caller),
                "{job:?} at threshold should run inline"
            );
            assert!(
                large.is_some_and(|thread| thread != caller),
                "{job:?} above threshold should offload"
            );
        }
    }

    #[tokio::test]
    async fn panicking_job_releases_its_permit() {
        let cpu = CpuWork::with_permits(1);
        let bytes = CpuJob::ScanGuardrails.inline_bytes() + 1;
        let panicked: Option<()> = cpu
            .run(CpuJob::ScanGuardrails, CpuClass::Guardrailed, bytes, || {
                panic!("boom")
            })
            .await;
        assert_eq!(panicked, None);
        assert_eq!(
            cpu.run(CpuJob::ScanGuardrails, CpuClass::Standard, bytes, || 42_u8)
                .await,
            Some(42)
        );
    }
}
