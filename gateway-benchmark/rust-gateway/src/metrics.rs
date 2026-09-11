use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};

use serde_json::{Value, json};

#[derive(Clone)]
pub struct Metrics {
    inner: Arc<MetricValues>,
}

struct MetricValues {
    started: Instant,
    requests: AtomicU64,
    active: AtomicU64,
    completed: AtomicU64,
    failures: AtomicU64,
    native: AtomicU64,
    translate: AtomicU64,
    request_bytes: AtomicU64,
    response_bytes: AtomicU64,
    duration_micros_sum: AtomicU64,
    duration_micros_max: AtomicU64,
    telemetry_pending: AtomicU64,
    telemetry_pending_bytes: AtomicU64,
    telemetry_peak_pending_bytes: AtomicU64,
    telemetry_dropped: AtomicU64,
    telemetry_published: AtomicU64,
    telemetry_failed: AtomicU64,
}

impl Default for Metrics {
    fn default() -> Self {
        Self {
            inner: Arc::new(MetricValues {
                started: Instant::now(),
                requests: AtomicU64::new(0),
                active: AtomicU64::new(0),
                completed: AtomicU64::new(0),
                failures: AtomicU64::new(0),
                native: AtomicU64::new(0),
                translate: AtomicU64::new(0),
                request_bytes: AtomicU64::new(0),
                response_bytes: AtomicU64::new(0),
                duration_micros_sum: AtomicU64::new(0),
                duration_micros_max: AtomicU64::new(0),
                telemetry_pending: AtomicU64::new(0),
                telemetry_pending_bytes: AtomicU64::new(0),
                telemetry_peak_pending_bytes: AtomicU64::new(0),
                telemetry_dropped: AtomicU64::new(0),
                telemetry_published: AtomicU64::new(0),
                telemetry_failed: AtomicU64::new(0),
            }),
        }
    }
}

impl Metrics {
    pub fn begin_request(&self) -> ActiveRequest {
        self.inner.requests.fetch_add(1, Ordering::Relaxed);
        self.inner.active.fetch_add(1, Ordering::Relaxed);
        ActiveRequest {
            metrics: self.clone(),
            started: Instant::now(),
            finished: false,
        }
    }

    pub fn record_mode(&self, mode: &str) {
        match mode {
            "translate" => self.inner.translate.fetch_add(1, Ordering::Relaxed),
            _ => self.inner.native.fetch_add(1, Ordering::Relaxed),
        };
    }

    pub fn record_request_bytes(&self, bytes: usize) {
        self.inner
            .request_bytes
            .fetch_add(bytes as u64, Ordering::Relaxed);
    }

    pub fn telemetry_enqueue_started(&self, payload_bytes: usize) {
        self.inner.telemetry_pending.fetch_add(1, Ordering::Relaxed);
        let pending_bytes = self
            .inner
            .telemetry_pending_bytes
            .fetch_add(payload_bytes as u64, Ordering::Relaxed)
            .saturating_add(payload_bytes as u64);
        self.inner
            .telemetry_peak_pending_bytes
            .fetch_max(pending_bytes, Ordering::Relaxed);
    }

    pub fn telemetry_enqueue_failed(&self, payload_bytes: usize) {
        self.inner.telemetry_pending.fetch_sub(1, Ordering::Relaxed);
        self.inner
            .telemetry_pending_bytes
            .fetch_sub(payload_bytes as u64, Ordering::Relaxed);
        self.inner.telemetry_dropped.fetch_add(1, Ordering::Relaxed);
    }

    pub fn telemetry_dequeued(&self, payload_bytes: usize) {
        self.inner.telemetry_pending.fetch_sub(1, Ordering::Relaxed);
        self.inner
            .telemetry_pending_bytes
            .fetch_sub(payload_bytes as u64, Ordering::Relaxed);
    }

    pub fn telemetry_published(&self) {
        self.inner
            .telemetry_published
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn telemetry_failed(&self) {
        self.inner.telemetry_failed.fetch_add(1, Ordering::Relaxed);
    }

    pub fn render(&self) -> Value {
        let (rss, peak_rss) = linux_memory_bytes();
        json!({
            "runtime": "rust",
            "uptimeSeconds": self.inner.started.elapsed().as_secs_f64(),
            "requests": {
                "total": self.load(&self.inner.requests),
                "active": self.load(&self.inner.active),
                "completed": self.load(&self.inner.completed),
                "failed": self.load(&self.inner.failures),
                "native": self.load(&self.inner.native),
                "translate": self.load(&self.inner.translate),
                "requestBytes": self.load(&self.inner.request_bytes),
                "responseBytes": self.load(&self.inner.response_bytes),
                "durationMsSum": self.load(&self.inner.duration_micros_sum) as f64 / 1000.0,
                "durationMsMax": self.load(&self.inner.duration_micros_max) as f64 / 1000.0,
            },
            "telemetry": {
                "pending": self.load(&self.inner.telemetry_pending),
                "pendingBytes": self.load(&self.inner.telemetry_pending_bytes),
                "peakPendingBytes": self.load(&self.inner.telemetry_peak_pending_bytes),
                "dropped": self.load(&self.inner.telemetry_dropped),
                "published": self.load(&self.inner.telemetry_published),
                "failed": self.load(&self.inner.telemetry_failed),
            },
            "process": {
                "rssBytes": rss,
                "peakRssBytes": peak_rss,
            },
            "scheduler": {
                "workerThreads": std::env::var("TOKIO_WORKER_THREADS")
                    .ok()
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(1),
            },
        })
    }

    fn load(&self, value: &AtomicU64) -> u64 {
        value.load(Ordering::Relaxed)
    }
}

pub struct ActiveRequest {
    metrics: Metrics,
    started: Instant,
    finished: bool,
}

impl ActiveRequest {
    pub fn finish(&mut self, response_bytes: usize, failed: bool) {
        if self.finished {
            return;
        }
        self.finished = true;
        self.metrics.inner.active.fetch_sub(1, Ordering::Relaxed);
        self.metrics
            .inner
            .response_bytes
            .fetch_add(response_bytes as u64, Ordering::Relaxed);
        if failed {
            self.metrics.inner.failures.fetch_add(1, Ordering::Relaxed);
        } else {
            self.metrics.inner.completed.fetch_add(1, Ordering::Relaxed);
        }
        let micros = self.started.elapsed().as_micros().min(u64::MAX as u128) as u64;
        self.metrics
            .inner
            .duration_micros_sum
            .fetch_add(micros, Ordering::Relaxed);
        self.metrics
            .inner
            .duration_micros_max
            .fetch_max(micros, Ordering::Relaxed);
    }
}

impl Drop for ActiveRequest {
    fn drop(&mut self) {
        if !self.finished {
            self.finish(0, true);
        }
    }
}

fn linux_memory_bytes() -> (u64, u64) {
    let Ok(status) = std::fs::read_to_string("/proc/self/status") else {
        return (0, 0);
    };

    let mut rss = 0;
    let mut peak = 0;
    for line in status.lines() {
        if let Some(value) = line.strip_prefix("VmRSS:") {
            rss = parse_kib(value);
        } else if let Some(value) = line.strip_prefix("VmHWM:") {
            peak = parse_kib(value);
        }
    }
    (rss, peak)
}

fn parse_kib(value: &str) -> u64 {
    value
        .split_whitespace()
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0)
        .saturating_mul(1024)
}

#[cfg(test)]
mod tests {
    use super::Metrics;

    #[test]
    fn tracks_pending_telemetry_bytes_and_peak() {
        let metrics = Metrics::default();

        metrics.telemetry_enqueue_started(100);
        metrics.telemetry_enqueue_started(50);
        metrics.telemetry_enqueue_failed(50);

        let telemetry = metrics.render()["telemetry"].clone();
        assert_eq!(telemetry["pending"], 1);
        assert_eq!(telemetry["pendingBytes"], 100);
        assert_eq!(telemetry["peakPendingBytes"], 150);
        assert_eq!(telemetry["dropped"], 1);

        metrics.telemetry_dequeued(100);
        let telemetry = metrics.render()["telemetry"].clone();
        assert_eq!(telemetry["pending"], 0);
        assert_eq!(telemetry["pendingBytes"], 0);
        assert_eq!(telemetry["peakPendingBytes"], 150);
    }
}
