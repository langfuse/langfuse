//! CPU-bound request work kept off the async workers.
use std::{
    collections::VecDeque,
    num::NonZeroUsize,
    sync::{Arc, Mutex, PoisonError},
    time::{Duration, Instant},
};

use tokio::sync::oneshot;

use crate::resolution::ResolvedRequestContext;

const STANDARD_WEIGHT: i64 = 4;
const GUARDRAILED_WEIGHT: i64 = 1;
const MAX_BALANCE_NS: i64 = 50_000_000;

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

/// Scheduling class for offloaded CPU work. Standard traffic receives a 4:1
/// CPU-time share over guardrailed work under contention so guardrail scans
/// cannot stall unguardrailed inference, while guardrailed work keeps a 20%
/// floor and never starves.
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
/// half core, so large bodies cannot occupy every core while the async workers
/// still have connections to serve, and contend via a two-class weighted
/// dispatcher.
#[derive(Clone)]
pub(crate) struct CpuWork {
    scheduler: Arc<Scheduler>,
}

impl CpuWork {
    pub(crate) fn new() -> Self {
        let cores = std::thread::available_parallelism().map_or(1, NonZeroUsize::get);
        Self::with_permits((cores / 2).max(1))
    }

    pub(crate) fn with_permits(permits: usize) -> Self {
        Self {
            scheduler: Arc::new(Scheduler::new(permits)),
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

struct Scheduler {
    state: Mutex<SchedulerState>,
}

struct SchedulerState {
    available: usize,
    /// Weighted CPU-time balance in nanoseconds, clamped to `±MAX_BALANCE_NS`.
    /// Non-negative dispatches `Standard`; negative dispatches `Guardrailed`.
    balance_ns: i64,
    standard: VecDeque<oneshot::Sender<PermitGuard>>,
    guardrailed: VecDeque<oneshot::Sender<PermitGuard>>,
}

impl SchedulerState {
    fn new(permits: usize) -> Self {
        Self {
            available: permits,
            balance_ns: 0,
            standard: VecDeque::new(),
            guardrailed: VecDeque::new(),
        }
    }

    fn queue_mut(&mut self, class: CpuClass) -> &mut VecDeque<oneshot::Sender<PermitGuard>> {
        match class {
            CpuClass::Standard => &mut self.standard,
            CpuClass::Guardrailed => &mut self.guardrailed,
        }
    }

    fn record_elapsed(&mut self, finished: CpuClass, elapsed: Duration) {
        let elapsed_ns = i64::try_from(elapsed.as_nanos()).unwrap_or(i64::MAX).max(1);
        let updated = match finished {
            CpuClass::Standard => self
                .balance_ns
                .saturating_sub(elapsed_ns.saturating_mul(GUARDRAILED_WEIGHT)),
            CpuClass::Guardrailed => self
                .balance_ns
                .saturating_add(elapsed_ns.saturating_mul(STANDARD_WEIGHT)),
        };
        self.balance_ns = updated.clamp(-MAX_BALANCE_NS, MAX_BALANCE_NS);
    }

    fn pick_next_class(
        &mut self,
        finished: CpuClass,
        elapsed: Option<Duration>,
        accounted: &mut bool,
    ) -> Option<CpuClass> {
        prune_closed(&mut self.standard);
        prune_closed(&mut self.guardrailed);

        match (self.standard.is_empty(), self.guardrailed.is_empty()) {
            (true, true) => {
                self.balance_ns = 0;
                None
            }
            (false, true) => {
                self.balance_ns = 0;
                Some(CpuClass::Standard)
            }
            (true, false) => {
                self.balance_ns = 0;
                Some(CpuClass::Guardrailed)
            }
            (false, false) => {
                if !*accounted {
                    if let Some(elapsed) = elapsed {
                        self.record_elapsed(finished, elapsed);
                    }
                    *accounted = true;
                }
                if self.balance_ns >= 0 {
                    Some(CpuClass::Standard)
                } else {
                    Some(CpuClass::Guardrailed)
                }
            }
        }
    }
}

fn prune_closed(queue: &mut VecDeque<oneshot::Sender<PermitGuard>>) {
    while queue.front().is_some_and(oneshot::Sender::is_closed) {
        queue.pop_front();
    }
}

impl Scheduler {
    fn new(permits: usize) -> Self {
        Self {
            state: Mutex::new(SchedulerState::new(permits)),
        }
    }

    async fn acquire(self: &Arc<Self>, class: CpuClass) -> Option<PermitGuard> {
        let receiver = {
            let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
            if state.available > 0 {
                state.available -= 1;
                return Some(PermitGuard::new(Arc::clone(self), class));
            }
            let queue = state.queue_mut(class);
            prune_closed(queue);
            let (tx, rx) = oneshot::channel();
            queue.push_back(tx);
            rx
        };
        receiver.await.ok()
    }

    fn release(self: &Arc<Self>, finished: CpuClass, elapsed: Option<Duration>) {
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        let mut accounted = false;

        loop {
            let Some(next_class) = state.pick_next_class(finished, elapsed, &mut accounted) else {
                state.available = state.available.saturating_add(1);
                return;
            };
            let Some(waiter) = state.queue_mut(next_class).pop_front() else {
                continue;
            };
            let next_guard = PermitGuard::new(Arc::clone(self), next_class);
            if let Err(mut returned) = waiter.send(next_guard) {
                // Disarm while holding `self.state` so dropping `returned` cannot
                // re-enter `release` and deadlock on the mutex.
                returned.disarm();
                continue;
            }
            return;
        }
    }
}

struct PermitGuard {
    scheduler: Arc<Scheduler>,
    class: CpuClass,
    started: Option<Instant>,
    active: bool,
}

impl PermitGuard {
    fn new(scheduler: Arc<Scheduler>, class: CpuClass) -> Self {
        Self {
            scheduler,
            class,
            started: None,
            active: true,
        }
    }

    fn mark_started(&mut self) {
        self.started = Some(Instant::now());
    }

    fn disarm(&mut self) {
        self.active = false;
    }
}

impl Drop for PermitGuard {
    fn drop(&mut self) {
        if !self.active {
            return;
        }
        self.active = false;
        let elapsed = self.started.map(|started| started.elapsed());
        self.scheduler.release(self.class, elapsed);
    }
}

#[cfg(test)]
mod tests {
    use std::{
        future::Future,
        sync::{
            atomic::{AtomicBool, Ordering},
            mpsc,
        },
        task::{Context, Poll, Waker},
    };

    use super::*;

    const OFFLOAD_BYTES: usize = 3 * 1024 * 1024;

    fn burn_cpu(duration: Duration) {
        let started = Instant::now();
        while started.elapsed() < duration {
            std::hint::spin_loop();
        }
    }

    fn state_snapshot(cpu: &CpuWork) -> (usize, usize, usize) {
        let state = cpu
            .scheduler
            .state
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        (
            state.available,
            state.standard.len(),
            state.guardrailed.len(),
        )
    }

    async fn wait_for_queues(cpu: &CpuWork, standard: usize, guardrailed: usize) {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let (_, std_len, grd_len) = state_snapshot(cpu);
            if std_len == standard && grd_len == guardrailed {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "timed out waiting for queues (wanted {standard}/{guardrailed}, got {std_len}/{grd_len})"
            );
            tokio::task::yield_now().await;
        }
    }

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

    #[test]
    fn weighted_balance_enforces_four_to_one_cpu_share_clamp_and_reset() {
        // Equal-duration jobs under dual saturation receive a 4:1 share.
        let mut state = SchedulerState::new(0);
        let mut receivers = Vec::new();
        for _ in 0..30 {
            let (tx_s, rx_s) = oneshot::channel();
            let (tx_g, rx_g) = oneshot::channel();
            state.standard.push_back(tx_s);
            state.guardrailed.push_back(tx_g);
            receivers.push((rx_s, rx_g));
        }

        let mut last_class = CpuClass::Standard;
        let mut standard_runs = 0_usize;
        let mut guardrailed_runs = 0_usize;
        for _ in 0..25 {
            let mut accounted = false;
            let next = state
                .pick_next_class(last_class, Some(Duration::from_millis(2)), &mut accounted)
                .unwrap();
            state.queue_mut(next).pop_front();
            match next {
                CpuClass::Standard => standard_runs += 1,
                CpuClass::Guardrailed => guardrailed_runs += 1,
            }
            last_class = next;
        }
        assert_eq!(standard_runs, 20);
        assert_eq!(guardrailed_runs, 5);
        drop(receivers);

        // Unequal durations (4ms guardrailed vs 1ms standard) weight by CPU time
        // (16ms standard per 4ms guardrailed = 4:1), not job count.
        let mut state = SchedulerState::new(0);
        let (tx_s, rx_s) = oneshot::channel();
        let (tx_g, rx_g) = oneshot::channel();
        state.standard.push_back(tx_s);
        state.guardrailed.push_back(tx_g);
        let mut last_class = CpuClass::Standard;
        let mut standard_runs = 0_usize;
        let mut guardrailed_runs = 0_usize;
        for _ in 0..85 {
            let elapsed = match last_class {
                CpuClass::Standard => Duration::from_millis(1),
                CpuClass::Guardrailed => Duration::from_millis(4),
            };
            let mut accounted = false;
            let next = state
                .pick_next_class(last_class, Some(elapsed), &mut accounted)
                .unwrap();
            match next {
                CpuClass::Standard => standard_runs += 1,
                CpuClass::Guardrailed => guardrailed_runs += 1,
            }
            last_class = next;
        }
        assert_eq!(standard_runs, 80);
        assert_eq!(guardrailed_runs, 5);
        drop((rx_s, rx_g));

        // Clamping to ±50ms bounds worst-case wait after a slow guardrail scan.
        let mut state = SchedulerState::new(0);
        let (tx_s, rx_s) = oneshot::channel();
        let (tx_g, rx_g) = oneshot::channel();
        state.standard.push_back(tx_s);
        state.guardrailed.push_back(tx_g);
        let mut accounted = false;
        assert_eq!(
            state.pick_next_class(
                CpuClass::Guardrailed,
                Some(Duration::from_millis(100)),
                &mut accounted,
            ),
            Some(CpuClass::Standard)
        );
        assert_eq!(state.balance_ns, MAX_BALANCE_NS);

        let mut accounted = false;
        assert_eq!(
            state.pick_next_class(
                CpuClass::Standard,
                Some(Duration::from_millis(200)),
                &mut accounted,
            ),
            Some(CpuClass::Guardrailed)
        );
        assert_eq!(state.balance_ns, -MAX_BALANCE_NS);

        // When only one queue has waiters, balance resets to 0.
        state.guardrailed.clear();
        let mut accounted = false;
        assert_eq!(
            state.pick_next_class(
                CpuClass::Standard,
                Some(Duration::from_millis(10)),
                &mut accounted,
            ),
            Some(CpuClass::Standard)
        );
        assert_eq!(state.balance_ns, 0);
        drop((rx_s, rx_g));
    }

    #[tokio::test]
    async fn standard_overtakes_guardrailed_backlog_in_fifo_order() {
        let cpu = CpuWork::with_permits(1);
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = mpsc::channel();

        let blocker = tokio::spawn({
            let cpu = cpu.clone();
            async move {
                cpu.run(
                    CpuJob::ScanGuardrails,
                    CpuClass::Guardrailed,
                    OFFLOAD_BYTES,
                    move || {
                        started_tx.send(()).unwrap();
                        release_rx.recv().unwrap();
                        burn_cpu(Duration::from_millis(10));
                    },
                )
                .await
            }
        });
        started_rx.await.unwrap();

        let order = Arc::new(Mutex::new(Vec::new()));
        let mut guardrailed_tasks = Vec::new();
        for idx in 0..3_usize {
            let task_cpu = cpu.clone();
            let order = Arc::clone(&order);
            guardrailed_tasks.push(tokio::spawn(async move {
                task_cpu
                    .run(
                        CpuJob::ScanGuardrails,
                        CpuClass::Guardrailed,
                        OFFLOAD_BYTES,
                        move || {
                            order.lock().unwrap().push((CpuClass::Guardrailed, idx));
                        },
                    )
                    .await
                    .unwrap();
            }));
            wait_for_queues(&cpu, 0, idx + 1).await;
        }

        let mut standard_tasks = Vec::new();
        for idx in 0..3_usize {
            let task_cpu = cpu.clone();
            let order = Arc::clone(&order);
            standard_tasks.push(tokio::spawn(async move {
                task_cpu
                    .run(
                        CpuJob::ParseRequest,
                        CpuClass::Standard,
                        OFFLOAD_BYTES,
                        move || {
                            order.lock().unwrap().push((CpuClass::Standard, idx));
                        },
                    )
                    .await
                    .unwrap();
            }));
            wait_for_queues(&cpu, idx + 1, 3).await;
        }

        release_tx.send(()).unwrap();
        blocker.await.unwrap().unwrap();
        for task in standard_tasks.into_iter().chain(guardrailed_tasks) {
            task.await.unwrap();
        }

        let recorded = order.lock().unwrap().clone();
        assert_eq!(
            recorded,
            vec![
                (CpuClass::Standard, 0),
                (CpuClass::Standard, 1),
                (CpuClass::Standard, 2),
                (CpuClass::Guardrailed, 0),
                (CpuClass::Guardrailed, 1),
                (CpuClass::Guardrailed, 2),
            ]
        );
        assert_eq!(state_snapshot(&cpu), (1, 0, 0));
    }

    #[tokio::test]
    async fn guardrailed_waiter_completes_under_continuous_standard_flood() {
        let cpu = CpuWork::with_permits(1);
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = mpsc::channel();

        // Start with a guardrailed blocker so the initial balance strongly favors
        // Standard; continuous Standard jobs must still drain the balance and
        // let the queued Guardrailed waiter run.
        let blocker = tokio::spawn({
            let cpu = cpu.clone();
            async move {
                cpu.run(
                    CpuJob::ScanGuardrails,
                    CpuClass::Guardrailed,
                    OFFLOAD_BYTES,
                    move || {
                        started_tx.send(()).unwrap();
                        release_rx.recv().unwrap();
                        burn_cpu(Duration::from_millis(3));
                    },
                )
                .await
            }
        });
        started_rx.await.unwrap();

        let guardrail_done = Arc::new(AtomicBool::new(false));
        let guardrail_task = tokio::spawn({
            let cpu = cpu.clone();
            let guardrail_done = Arc::clone(&guardrail_done);
            async move {
                cpu.run(
                    CpuJob::ScanGuardrails,
                    CpuClass::Guardrailed,
                    OFFLOAD_BYTES,
                    move || {
                        guardrail_done.store(true, Ordering::Release);
                    },
                )
                .await
                .unwrap();
            }
        });

        let flood_tasks: Vec<_> = (0..4)
            .map(|_| {
                let cpu = cpu.clone();
                let guardrail_done = Arc::clone(&guardrail_done);
                tokio::spawn(async move {
                    while !guardrail_done.load(Ordering::Acquire) {
                        cpu.run(
                            CpuJob::ParseRequest,
                            CpuClass::Standard,
                            OFFLOAD_BYTES,
                            || burn_cpu(Duration::from_millis(2)),
                        )
                        .await
                        .unwrap();
                    }
                })
            })
            .collect();

        wait_for_queues(&cpu, 4, 1).await;
        release_tx.send(()).unwrap();
        blocker.await.unwrap().unwrap();

        tokio::time::timeout(Duration::from_secs(2), guardrail_task)
            .await
            .expect("guardrailed waiter should not starve under standard flood")
            .unwrap();
        for task in flood_tasks {
            task.await.unwrap();
        }
        assert_eq!(state_snapshot(&cpu), (1, 0, 0));
    }

    #[tokio::test]
    async fn canceled_waiter_never_leaks_permit() {
        let cpu = CpuWork::with_permits(1);

        // Case 1: dropped while waiting in the queue before permit release.
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let blocker = tokio::spawn({
            let cpu = cpu.clone();
            async move {
                cpu.run(
                    CpuJob::ParseRequest,
                    CpuClass::Standard,
                    OFFLOAD_BYTES,
                    move || {
                        started_tx.send(()).unwrap();
                        release_rx.recv().unwrap();
                    },
                )
                .await
            }
        });
        started_rx.await.unwrap();

        let mut queued_cancel = Box::pin(cpu.run(
            CpuJob::ParseRequest,
            CpuClass::Standard,
            OFFLOAD_BYTES,
            || 1_u8,
        ));
        let mut cx = Context::from_waker(Waker::noop());
        assert!(matches!(
            queued_cancel.as_mut().poll(&mut cx),
            Poll::Pending
        ));

        let survivor = tokio::spawn({
            let cpu = cpu.clone();
            async move {
                cpu.run(
                    CpuJob::ParseRequest,
                    CpuClass::Standard,
                    OFFLOAD_BYTES,
                    || 2_u8,
                )
                .await
            }
        });
        wait_for_queues(&cpu, 2, 0).await;

        drop(queued_cancel);
        release_tx.send(()).unwrap();
        blocker.await.unwrap().unwrap();
        assert_eq!(survivor.await.unwrap(), Some(2_u8));
        assert_eq!(state_snapshot(&cpu), (1, 0, 0));

        // Case 2: dropped after oneshot::send handed over a PermitGuard.
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let blocker = tokio::spawn({
            let cpu = cpu.clone();
            async move {
                cpu.run(
                    CpuJob::ScanGuardrails,
                    CpuClass::Guardrailed,
                    OFFLOAD_BYTES,
                    move || {
                        started_tx.send(()).unwrap();
                        release_rx.recv().unwrap();
                    },
                )
                .await
            }
        });
        started_rx.await.unwrap();

        let mut handed_off_cancel = Box::pin(cpu.run(
            CpuJob::ParseRequest,
            CpuClass::Standard,
            OFFLOAD_BYTES,
            || 3_u8,
        ));
        assert!(matches!(
            handed_off_cancel.as_mut().poll(&mut cx),
            Poll::Pending
        ));

        let next_waiter = tokio::spawn({
            let cpu = cpu.clone();
            async move {
                cpu.run(
                    CpuJob::ScanGuardrails,
                    CpuClass::Guardrailed,
                    OFFLOAD_BYTES,
                    || 4_u8,
                )
                .await
            }
        });
        wait_for_queues(&cpu, 1, 1).await;

        release_tx.send(()).unwrap();
        blocker.await.unwrap().unwrap();
        // Blocker's PermitGuard::drop handed the permit to `handed_off_cancel`'s
        // oneshot receiver; dropping the unpolled future must release it to `next_waiter`.
        drop(handed_off_cancel);

        let result = tokio::time::timeout(Duration::from_secs(2), next_waiter)
            .await
            .expect("permit handed to a dropped waiter must transfer to the next waiter")
            .unwrap();
        assert_eq!(result, Some(4_u8));
        assert_eq!(state_snapshot(&cpu), (1, 0, 0));
    }

    #[tokio::test]
    async fn panicking_job_releases_permit_to_next_waiter() {
        let cpu = CpuWork::with_permits(1);
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = mpsc::channel();

        let panicker = tokio::spawn({
            let cpu = cpu.clone();
            async move {
                cpu.run(
                    CpuJob::ScanGuardrails,
                    CpuClass::Guardrailed,
                    OFFLOAD_BYTES,
                    move || {
                        started_tx.send(()).unwrap();
                        release_rx.recv().unwrap();
                        panic!("simulated blocking panic");
                    },
                )
                .await
            }
        });
        started_rx.await.unwrap();

        let next = tokio::spawn({
            let cpu = cpu.clone();
            async move {
                cpu.run(
                    CpuJob::ParseRequest,
                    CpuClass::Standard,
                    OFFLOAD_BYTES,
                    || 42_u8,
                )
                .await
            }
        });
        wait_for_queues(&cpu, 1, 0).await;

        release_tx.send(()).unwrap();
        assert_eq!(panicker.await.unwrap(), None);
        assert_eq!(next.await.unwrap(), Some(42_u8));
        assert_eq!(state_snapshot(&cpu), (1, 0, 0));

        let follow_up = cpu
            .run(
                CpuJob::ParseRequest,
                CpuClass::Standard,
                OFFLOAD_BYTES,
                || 99_u8,
            )
            .await;
        assert_eq!(follow_up, Some(99_u8));
    }
}
