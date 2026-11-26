//! Process CPU/RSS sampling, Tokio runtime metrics deltas, latency quantiles,
//! and Jain's fairness index.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize)]
pub struct LatencySummary {
    pub count: usize,
    pub mean_ms: f64,
    pub p50_ms: f64,
    pub p95_ms: f64,
    pub p99_ms: f64,
    pub max_ms: f64,
}

pub fn summarize_latencies(mut values_us: Vec<u64>) -> LatencySummary {
    if values_us.is_empty() {
        return LatencySummary::default();
    }
    values_us.sort_unstable();
    let count = values_us.len();
    let sum: u128 = values_us.iter().map(|&v| u128::from(v)).sum();
    let mean_ms = (sum as f64) / (count as f64) / 1000.0;
    let q = |p: f64| -> f64 {
        let idx = (((count - 1) as f64) * p).round() as usize;
        (values_us[idx.min(count - 1)] as f64) / 1000.0
    };
    LatencySummary {
        count,
        mean_ms,
        p50_ms: q(0.50),
        p95_ms: q(0.95),
        p99_ms: q(0.99),
        max_ms: (values_us[count - 1] as f64) / 1000.0,
    }
}

/// Jain's fairness index across `allocations`: `(\sum x_i)^2 / (n * \sum x_i^2)`.
/// Returns 1.0 for identical allocations and approaches 1/n under total starvation.
pub fn jains_fairness(allocations: &[f64]) -> f64 {
    if allocations.is_empty() {
        return 1.0;
    }
    let sum: f64 = allocations.iter().sum();
    let sum_sq: f64 = allocations.iter().map(|x| x * x).sum();
    if sum_sq == 0.0 {
        return 1.0;
    }
    (sum * sum) / ((allocations.len() as f64) * sum_sq)
}

#[derive(Clone, Copy, Debug)]
pub struct ProcSample {
    pub cpu_jiffies: u64,
    pub rss_kb: u64,
}

#[expect(
    clippy::disallowed_methods,
    reason = "reads procfs between benchmark windows, never during request serving"
)]
pub fn sample_proc(pid: u32) -> Option<ProcSample> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let after_comm = stat.rsplit_once(')')?.1;
    let fields: Vec<&str> = after_comm.split_whitespace().collect();
    // After ')': field 0 is state (field 3), utime is field 14 -> index 11, stime is field 15 -> index 12.
    let utime: u64 = fields.get(11)?.parse().ok()?;
    let stime: u64 = fields.get(12)?.parse().ok()?;
    let status = std::fs::read_to_string(format!("/proc/{pid}/status")).ok()?;
    let rss_kb = status
        .lines()
        .find_map(|line| {
            line.strip_prefix("VmRSS:")
                .and_then(|rest| rest.split_whitespace().next())
                .and_then(|num| num.parse::<u64>().ok())
        })
        .unwrap_or(0);
    Some(ProcSample {
        cpu_jiffies: utime.saturating_add(stime),
        rss_kb,
    })
}

pub fn cpu_percent(start: ProcSample, end: ProcSample, elapsed_secs: f64) -> f64 {
    if elapsed_secs <= 0.0 {
        return 0.0;
    }
    // Linux USER_HZ is 100 ticks/sec on x86_64.
    let delta_secs = (end.cpu_jiffies.saturating_sub(start.cpu_jiffies) as f64) / 100.0;
    (delta_secs / elapsed_secs) * 100.0
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BenchHistogramBucket {
    pub start_us: u64,
    pub end_us: u64,
    pub count: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BenchWorkerMetrics {
    pub busy_ns: u64,
    pub polls: u64,
    pub mean_poll_ns: u64,
    pub steals: u64,
    pub local_queue_depth: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BenchRuntimeMetrics {
    pub num_workers: usize,
    pub num_alive_tasks: usize,
    pub global_queue_depth: usize,
    pub blocking_queue_depth: usize,
    pub num_blocking_threads: usize,
    pub num_idle_blocking_threads: usize,
    pub workers: Vec<BenchWorkerMetrics>,
    pub poll_time_buckets: Vec<BenchHistogramBucket>,
    pub schedule_latency_buckets: Vec<BenchHistogramBucket>,
}

#[derive(Clone, Debug, Serialize)]
pub struct RuntimeDelta {
    pub num_workers: usize,
    pub async_worker_busy_pct: f64,
    pub total_polls: u64,
    pub poll_p50_us: u64,
    pub poll_p95_us: u64,
    pub poll_p99_us: u64,
    pub poll_max_bucket_us: u64,
    pub polls_over_1ms: u64,
    pub polls_over_10ms: u64,
    pub sched_p50_us: u64,
    pub sched_p95_us: u64,
    pub sched_p99_us: u64,
    pub sched_max_bucket_us: u64,
    pub sched_over_1ms: u64,
    pub sched_over_10ms: u64,
    pub end_global_queue_depth: usize,
    pub end_blocking_queue_depth: usize,
    pub num_blocking_threads: usize,
}

pub fn runtime_delta(
    start: &BenchRuntimeMetrics,
    end: &BenchRuntimeMetrics,
    elapsed_secs: f64,
) -> RuntimeDelta {
    let delta_busy_ns: u128 = start
        .workers
        .iter()
        .zip(&end.workers)
        .map(|(s, e)| u128::from(e.busy_ns.saturating_sub(s.busy_ns)))
        .sum();
    let total_polls: u64 = start
        .workers
        .iter()
        .zip(&end.workers)
        .map(|(s, e)| e.polls.saturating_sub(s.polls))
        .sum();
    let capacity_ns = elapsed_secs * 1e9 * (end.num_workers.max(1) as f64);
    let async_worker_busy_pct = if capacity_ns > 0.0 {
        ((delta_busy_ns as f64) / capacity_ns) * 100.0
    } else {
        0.0
    };

    let poll_delta = diff_buckets(&start.poll_time_buckets, &end.poll_time_buckets);
    let sched_delta = diff_buckets(
        &start.schedule_latency_buckets,
        &end.schedule_latency_buckets,
    );

    RuntimeDelta {
        num_workers: end.num_workers,
        async_worker_busy_pct,
        total_polls,
        poll_p50_us: bucket_quantile(&poll_delta, 0.50),
        poll_p95_us: bucket_quantile(&poll_delta, 0.95),
        poll_p99_us: bucket_quantile(&poll_delta, 0.99),
        poll_max_bucket_us: bucket_max_nonzero(&poll_delta),
        polls_over_1ms: count_above_us(&poll_delta, 1_000),
        polls_over_10ms: count_above_us(&poll_delta, 10_000),
        sched_p50_us: bucket_quantile(&sched_delta, 0.50),
        sched_p95_us: bucket_quantile(&sched_delta, 0.95),
        sched_p99_us: bucket_quantile(&sched_delta, 0.99),
        sched_max_bucket_us: bucket_max_nonzero(&sched_delta),
        sched_over_1ms: count_above_us(&sched_delta, 1_000),
        sched_over_10ms: count_above_us(&sched_delta, 10_000),
        end_global_queue_depth: end.global_queue_depth,
        end_blocking_queue_depth: end.blocking_queue_depth,
        num_blocking_threads: end.num_blocking_threads,
    }
}

fn diff_buckets(
    start: &[BenchHistogramBucket],
    end: &[BenchHistogramBucket],
) -> Vec<BenchHistogramBucket> {
    start
        .iter()
        .zip(end)
        .map(|(s, e)| BenchHistogramBucket {
            start_us: e.start_us,
            end_us: e.end_us,
            count: e.count.saturating_sub(s.count),
        })
        .collect()
}

fn bucket_quantile(buckets: &[BenchHistogramBucket], q: f64) -> u64 {
    let total: u64 = buckets.iter().map(|b| b.count).sum();
    if total == 0 {
        return 0;
    }
    let target = ((total as f64) * q).ceil() as u64;
    let mut acc = 0u64;
    for bucket in buckets {
        acc += bucket.count;
        if acc >= target {
            return bucket.end_us.min(10_000_000);
        }
    }
    buckets.last().map_or(0, |b| b.start_us.min(10_000_000))
}

fn bucket_max_nonzero(buckets: &[BenchHistogramBucket]) -> u64 {
    buckets
        .iter()
        .rev()
        .find(|b| b.count > 0)
        .map_or(0, |b| b.start_us)
}

fn count_above_us(buckets: &[BenchHistogramBucket], threshold_us: u64) -> u64 {
    buckets
        .iter()
        .filter(|b| b.start_us >= threshold_us)
        .map(|b| b.count)
        .sum()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PhaseSummary {
    pub name: String,
    pub count: usize,
    pub mean_us: f64,
    pub p50_us: u64,
    pub p95_us: u64,
    pub p99_us: u64,
    pub max_us: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PhasesSnapshot {
    pub cap_rejections: u64,
    pub max_scan_bytes: Option<usize>,
    pub phases: Vec<PhaseSummary>,
}
