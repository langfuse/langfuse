//! Opt-in phase-timing collector for the guardrail fairness benchmark harness.
//! Compiled only under `--features bench-harness`.
use std::{
    sync::{
        LazyLock, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use serde::Serialize;

const MAX_SAMPLES_PER_PHASE: usize = 50_000;

#[derive(Clone, Copy, Debug)]
pub(crate) enum Phase {
    BodyRead,
    ParseQueueWait,
    ParseCpu,
    FindTurnQueueWait,
    FindTurnCpu,
    ScanQueueWait,
    ScanCpu,
    FinalizeCpu,
    RewriteBodyCpu,
    CaptureSpliceCpu,
    ExternalWait,
}

impl Phase {
    const ALL: [Self; 11] = [
        Self::BodyRead,
        Self::ParseQueueWait,
        Self::ParseCpu,
        Self::FindTurnQueueWait,
        Self::FindTurnCpu,
        Self::ScanQueueWait,
        Self::ScanCpu,
        Self::FinalizeCpu,
        Self::RewriteBodyCpu,
        Self::CaptureSpliceCpu,
        Self::ExternalWait,
    ];

    const fn index(self) -> usize {
        self as usize
    }

    const fn name(self) -> &'static str {
        match self {
            Self::BodyRead => "body_read",
            Self::ParseQueueWait => "parse_queue_wait",
            Self::ParseCpu => "parse_cpu",
            Self::FindTurnQueueWait => "find_turn_queue_wait",
            Self::FindTurnCpu => "find_turn_cpu",
            Self::ScanQueueWait => "scan_queue_wait",
            Self::ScanCpu => "scan_cpu",
            Self::FinalizeCpu => "finalize_cpu",
            Self::RewriteBodyCpu => "rewrite_body_cpu",
            Self::CaptureSpliceCpu => "capture_splice_cpu",
            Self::ExternalWait => "external_wait",
        }
    }
}

struct Collector {
    samples: [Mutex<Vec<u64>>; Phase::ALL.len()],
    cap_rejections: AtomicU64,
}

static COLLECTOR: LazyLock<Collector> = LazyLock::new(|| Collector {
    samples: std::array::from_fn(|_| Mutex::new(Vec::new())),
    cap_rejections: AtomicU64::new(0),
});

pub(crate) fn record(phase: Phase, duration: Duration) {
    let us = u64::try_from(duration.as_micros()).unwrap_or(u64::MAX);
    if let Some(bucket) = COLLECTOR.samples.get(phase.index()) {
        let mut guard = bucket
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if guard.len() < MAX_SAMPLES_PER_PHASE {
            guard.push(us);
        }
    }
}

pub(crate) fn record_cap_rejection() {
    COLLECTOR.cap_rejections.fetch_add(1, Ordering::Relaxed);
}

pub(crate) fn max_scan_bytes() -> Option<usize> {
    static CAP: LazyLock<Option<usize>> = LazyLock::new(|| {
        std::env::var("BENCH_GUARDRAIL_MAX_SCAN_BYTES")
            .ok()
            .and_then(|value| value.trim().parse::<usize>().ok())
            .filter(|&value| value > 0)
    });
    *CAP
}

pub(crate) fn parse_inline_bytes() -> Option<usize> {
    static LIMIT: LazyLock<Option<usize>> = LazyLock::new(|| {
        std::env::var("BENCH_PARSE_INLINE_BYTES")
            .ok()
            .and_then(|value| value.trim().parse::<usize>().ok())
            .filter(|&value| value > 0)
    });
    *LIMIT
}

pub(crate) fn reset() {
    for bucket in &COLLECTOR.samples {
        let mut guard = bucket
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        guard.clear();
    }
    COLLECTOR.cap_rejections.store(0, Ordering::Relaxed);
}

#[derive(Serialize)]
pub(crate) struct PhaseSummary {
    pub name: &'static str,
    pub count: usize,
    pub mean_us: f64,
    pub p50_us: u64,
    pub p95_us: u64,
    pub p99_us: u64,
    pub max_us: u64,
}

#[derive(Serialize)]
pub(crate) struct PhasesSnapshot {
    pub cap_rejections: u64,
    pub max_scan_bytes: Option<usize>,
    pub phases: Vec<PhaseSummary>,
}

pub(crate) fn snapshot() -> PhasesSnapshot {
    let phases = Phase::ALL
        .iter()
        .map(|&phase| {
            let mut values = COLLECTOR
                .samples
                .get(phase.index())
                .map(|bucket| {
                    bucket
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner)
                        .clone()
                })
                .unwrap_or_default();
            summarize(phase.name(), &mut values)
        })
        .collect();
    PhasesSnapshot {
        cap_rejections: COLLECTOR.cap_rejections.load(Ordering::Relaxed),
        max_scan_bytes: max_scan_bytes(),
        phases,
    }
}

#[expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "summary statistics over benchmark microsecond samples"
)]
fn summarize(name: &'static str, values: &mut [u64]) -> PhaseSummary {
    if values.is_empty() {
        return PhaseSummary {
            name,
            count: 0,
            mean_us: 0.0,
            p50_us: 0,
            p95_us: 0,
            p99_us: 0,
            max_us: 0,
        };
    }
    values.sort_unstable();
    let count = values.len();
    let sum: u128 = values.iter().map(|&v| u128::from(v)).sum();
    let mean_us = (sum as f64) / (count as f64);
    let quantile = |q: f64| -> u64 {
        let idx = (((count - 1) as f64) * q).round() as usize;
        values.get(idx).copied().unwrap_or(0)
    };
    PhaseSummary {
        name,
        count,
        mean_us,
        p50_us: quantile(0.50),
        p95_us: quantile(0.95),
        p99_us: quantile(0.99),
        max_us: values.last().copied().unwrap_or(0),
    }
}
