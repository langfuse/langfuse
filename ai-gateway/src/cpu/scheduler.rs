//! Two-queue 4:1 CPU-time weighted permit dispatcher for [`super::CpuWork`].
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex, PoisonError},
    time::{Duration, Instant},
};

use tokio::sync::oneshot;

use super::CpuClass;

const STANDARD_WEIGHT: i64 = 4;
const GUARDRAILED_WEIGHT: i64 = 1;
const MAX_BALANCE_NS: i64 = 50_000_000;

#[derive(Clone)]
pub(super) struct Scheduler(Arc<Mutex<State>>);

struct State {
    total_permits: usize,
    available: usize,
    running_guardrailed: usize,
    balance_ns: i64,
    standard: VecDeque<oneshot::Sender<PermitGuard>>,
    guardrailed: VecDeque<oneshot::Sender<PermitGuard>>,
}

impl State {
    fn queue_mut(&mut self, class: CpuClass) -> &mut VecDeque<oneshot::Sender<PermitGuard>> {
        match class {
            CpuClass::Standard => &mut self.standard,
            CpuClass::Guardrailed => &mut self.guardrailed,
        }
    }

    fn prune_closed(&mut self) {
        for q in [&mut self.standard, &mut self.guardrailed] {
            while q.front().is_some_and(oneshot::Sender::is_closed) {
                q.pop_front();
            }
        }
    }

    fn max_guardrailed_concurrent(&self) -> usize {
        self.total_permits.div_ceil(5).max(1)
    }
}

impl Scheduler {
    pub(super) fn new(permits: usize) -> Self {
        Self(Arc::new(Mutex::new(State {
            total_permits: permits,
            available: permits,
            running_guardrailed: 0,
            balance_ns: 0,
            standard: VecDeque::new(),
            guardrailed: VecDeque::new(),
        })))
    }

    pub(super) async fn acquire(&self, class: CpuClass) -> Option<PermitGuard> {
        let rx = {
            let mut s = self.0.lock().unwrap_or_else(PoisonError::into_inner);
            if s.available > 0 {
                s.available -= 1;
                if class == CpuClass::Guardrailed {
                    s.running_guardrailed += 1;
                }
                return Some(PermitGuard::new(&self.0, class));
            }
            let (tx, rx) = oneshot::channel();
            s.queue_mut(class).push_back(tx);
            rx
        };
        rx.await.ok()
    }
}

pub(super) struct PermitGuard {
    state: Option<Arc<Mutex<State>>>,
    class: CpuClass,
    started: Option<Instant>,
}

impl PermitGuard {
    fn new(state: &Arc<Mutex<State>>, class: CpuClass) -> Self {
        Self {
            state: Some(Arc::clone(state)),
            class,
            started: None,
        }
    }

    pub(super) fn mark_started(&mut self) {
        self.started = Some(Instant::now());
    }
}

impl Drop for PermitGuard {
    fn drop(&mut self) {
        if let Some(state) = self.state.take() {
            release_permit(&state, self.class, self.started.map(|t| t.elapsed()));
        }
    }
}

fn release_permit(shared: &Arc<Mutex<State>>, finished: CpuClass, elapsed: Option<Duration>) {
    let mut guard = shared.lock().unwrap_or_else(PoisonError::into_inner);
    let s = &mut *guard;
    if finished == CpuClass::Guardrailed {
        s.running_guardrailed = s.running_guardrailed.saturating_sub(1);
    }
    s.prune_closed();
    if (!s.standard.is_empty() || !s.guardrailed.is_empty())
        && let Some(elapsed) = elapsed
    {
        let ns = i64::try_from(elapsed.as_nanos()).unwrap_or(i64::MAX).max(1);
        let delta = match finished {
            CpuClass::Standard => -ns.saturating_mul(GUARDRAILED_WEIGHT),
            CpuClass::Guardrailed => ns.saturating_mul(STANDARD_WEIGHT),
        };
        s.balance_ns = s
            .balance_ns
            .saturating_add(delta)
            .clamp(-MAX_BALANCE_NS, MAX_BALANCE_NS);
    }
    loop {
        let next = match (s.standard.is_empty(), s.guardrailed.is_empty()) {
            (true, true) => {
                s.balance_ns = 0;
                s.available += 1;
                return;
            }
            (false, true) => {
                // Keep credit owed to waiting Standard work; clear idle Guardrailed debt.
                s.balance_ns = s.balance_ns.max(0);
                CpuClass::Standard
            }
            (true, false) => {
                s.balance_ns = s.balance_ns.min(0);
                CpuClass::Guardrailed
            }
            (false, false) => {
                if s.balance_ns >= 0 || s.running_guardrailed >= s.max_guardrailed_concurrent() {
                    CpuClass::Standard
                } else {
                    CpuClass::Guardrailed
                }
            }
        };
        if let Some(waiter) = s.queue_mut(next).pop_front() {
            if let Err(mut returned) = waiter.send(PermitGuard::new(shared, next)) {
                // Disarm under the lock so dropping `returned` cannot re-lock `shared`.
                returned.state = None;
                s.prune_closed();
                continue;
            }
            if next == CpuClass::Guardrailed {
                s.running_guardrailed += 1;
            }
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        future::Future,
        pin::Pin,
        task::{Context, Poll, Waker},
    };

    use super::*;

    fn enqueue(
        s: &Scheduler,
        class: CpuClass,
    ) -> Pin<Box<dyn Future<Output = Option<PermitGuard>> + '_>> {
        let mut fut = Box::pin(s.acquire(class));
        assert!(
            fut.as_mut()
                .poll(&mut Context::from_waker(Waker::noop()))
                .is_pending()
        );
        fut
    }

    fn finish(mut guard: PermitGuard, elapsed: Duration) {
        let state = guard.state.take().unwrap();
        release_permit(&state, guard.class, Some(elapsed));
    }

    #[tokio::test]
    async fn weights_by_cpu_time_clamps_resets_and_never_starves() {
        let s = Scheduler::new(1);
        let mut cx = Context::from_waker(Waker::noop());
        let mut held = s.acquire(CpuClass::Standard).await.unwrap();
        let (mut std_runs, mut grd_runs) = (0_usize, 0_usize);
        for _ in 0..85 {
            let mut sf = enqueue(&s, CpuClass::Standard);
            let gf = enqueue(&s, CpuClass::Guardrailed);
            let d = Duration::from_millis(if held.class == CpuClass::Standard {
                1
            } else {
                4
            });
            finish(held, d);
            held = if let Poll::Ready(Some(p)) = sf.as_mut().poll(&mut cx) {
                std_runs += 1;
                p
            } else {
                grd_runs += 1;
                gf.await.unwrap()
            };
        }
        assert_eq!((std_runs, grd_runs), (80, 5));

        // Next turn hands off to Guardrailed; a 100ms scan clamps to +50ms even if no other
        // Guardrailed scan is queued, and continuous Standard work still yields to Guardrailed.
        let sf = enqueue(&s, CpuClass::Standard);
        let gf = enqueue(&s, CpuClass::Guardrailed);
        finish(held, Duration::from_millis(1));
        let grd = gf.await.unwrap();
        drop(sf);
        let sf = enqueue(&s, CpuClass::Standard);
        finish(grd, Duration::from_millis(100));
        assert_eq!(s.0.lock().unwrap().balance_ns, MAX_BALANCE_NS);
        let mut cur = sf.await.unwrap();
        let mut gf = enqueue(&s, CpuClass::Guardrailed);
        for _ in 0..6 {
            let next_s = enqueue(&s, CpuClass::Standard);
            finish(cur, Duration::from_millis(10));
            if let Poll::Ready(Some(g)) = gf.as_mut().poll(&mut cx) {
                cur = g;
                break;
            }
            cur = next_s.await.unwrap();
        }
        assert_eq!(cur.class, CpuClass::Guardrailed);

        // Single non-empty Standard queue clears stale negative debt owed to idle Guardrailed.
        s.0.lock().unwrap().balance_ns = -MAX_BALANCE_NS;
        let only_s = enqueue(&s, CpuClass::Standard);
        finish(cur, Duration::from_millis(1));
        assert_eq!(s.0.lock().unwrap().balance_ns, 0);
        drop(only_s.await.unwrap());
        assert_eq!(s.0.lock().unwrap().available, 1);
    }

    #[tokio::test]
    async fn cancellation_and_multi_permit_handoff_never_leak() {
        let s = Scheduler::new(1);
        let p = s.acquire(CpuClass::Guardrailed).await.unwrap();
        let cancel_queued = enqueue(&s, CpuClass::Standard);
        let cancel_handoff = enqueue(&s, CpuClass::Standard);
        let survivor = enqueue(&s, CpuClass::Guardrailed);
        drop(cancel_queued);
        drop(p);
        drop(cancel_handoff);
        drop(survivor.await.unwrap());
        assert_eq!(s.0.lock().unwrap().available, 1);

        // Multi-permit: caps concurrent Guardrailed permits when Standard is waiting, skips
        // canceled waiters, and recovers all permits and counters.
        let s = Scheduler::new(2);
        let mut cx = Context::from_waker(Waker::noop());
        let p1 = s.acquire(CpuClass::Standard).await.unwrap();
        let p2 = s.acquire(CpuClass::Guardrailed).await.unwrap();
        let cancel = enqueue(&s, CpuClass::Standard);
        let mut w_std = enqueue(&s, CpuClass::Standard);
        let w_grd = enqueue(&s, CpuClass::Guardrailed);
        drop(cancel);
        finish(p1, Duration::from_millis(5));
        let Poll::Ready(Some(g1)) = w_std.as_mut().poll(&mut cx) else {
            panic!("Standard should run while Guardrailed already holds a permit");
        };
        finish(p2, Duration::from_millis(5));
        let g2 = w_grd.await.unwrap();
        assert_eq!(s.0.lock().unwrap().available, 0);
        drop((g1, g2));
        let st = s.0.lock().unwrap();
        assert_eq!((st.available, st.running_guardrailed), (2, 0));
        assert_eq!(
            Scheduler::new(8)
                .0
                .lock()
                .unwrap()
                .max_guardrailed_concurrent(),
            2
        );
    }
}
