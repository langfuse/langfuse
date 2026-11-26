use std::{
    future::{Future, IntoFuture},
    io,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use axum::{Json, Router, extract::State, http::StatusCode, routing::get};
use serde::Serialize;
use tokio::{net::TcpListener, sync::oneshot};

mod connection;

pub(crate) use connection::ConnectionId;

#[derive(Clone, Default)]
pub struct GatewayLifecycleState {
    ready: Arc<AtomicBool>,
    disabled: bool,
}

impl GatewayLifecycleState {
    pub fn is_ready(&self) -> bool {
        !self.disabled && self.ready.load(Ordering::Acquire)
    }

    /// Keep liveness available without advertising inference readiness.
    pub fn unconfigured() -> Self {
        Self {
            disabled: true,
            ..Self::default()
        }
    }
}

#[derive(Serialize)]
struct Probe {
    status: &'static str,
}

pub fn router(state: GatewayLifecycleState) -> Router {
    let router = Router::new()
        .route("/health", get(|| async { Json(Probe { status: "ok" }) }))
        .route("/ready", get(readiness));
    #[cfg(feature = "bench-harness")]
    let router = router.route("/_bench/phases", get(bench_phases)).route(
        "/_bench/phases/reset",
        axum::routing::post(bench_phases_reset),
    );
    #[cfg(all(feature = "bench-harness", tokio_unstable))]
    let router = router.route("/_bench/runtime", get(bench_runtime_metrics));
    router.with_state(state)
}

#[cfg(feature = "bench-harness")]
async fn bench_phases() -> Json<crate::bench_metrics::PhasesSnapshot> {
    Json(crate::bench_metrics::snapshot())
}

#[cfg(feature = "bench-harness")]
async fn bench_phases_reset() -> StatusCode {
    crate::bench_metrics::reset();
    StatusCode::NO_CONTENT
}

#[cfg(all(feature = "bench-harness", tokio_unstable))]
#[derive(Serialize)]
struct BenchHistogramBucket {
    start_us: u64,
    end_us: u64,
    count: u64,
}

#[cfg(all(feature = "bench-harness", tokio_unstable))]
#[derive(Serialize)]
struct BenchWorkerMetrics {
    busy_ns: u64,
    polls: u64,
    mean_poll_ns: u64,
    steals: u64,
    local_queue_depth: usize,
}

#[cfg(all(feature = "bench-harness", tokio_unstable))]
#[derive(Serialize)]
struct BenchRuntimeMetrics {
    num_workers: usize,
    num_alive_tasks: usize,
    global_queue_depth: usize,
    blocking_queue_depth: usize,
    num_blocking_threads: usize,
    num_idle_blocking_threads: usize,
    workers: Vec<BenchWorkerMetrics>,
    poll_time_buckets: Vec<BenchHistogramBucket>,
    schedule_latency_buckets: Vec<BenchHistogramBucket>,
}

#[cfg(all(feature = "bench-harness", tokio_unstable))]
async fn bench_runtime_metrics() -> Json<BenchRuntimeMetrics> {
    let metrics = tokio::runtime::Handle::current().metrics();
    let num_workers = metrics.num_workers();
    let workers = (0..num_workers)
        .map(|worker| BenchWorkerMetrics {
            busy_ns: u64::try_from(metrics.worker_total_busy_duration(worker).as_nanos())
                .unwrap_or(u64::MAX),
            polls: metrics.worker_poll_count(worker),
            mean_poll_ns: u64::try_from(metrics.worker_mean_poll_time(worker).as_nanos())
                .unwrap_or(u64::MAX),
            steals: metrics.worker_steal_count(worker),
            local_queue_depth: metrics.worker_local_queue_depth(worker),
        })
        .collect();
    let poll_time_buckets = if metrics.poll_time_histogram_enabled() {
        (0..metrics.poll_time_histogram_num_buckets())
            .map(|bucket| {
                let range = metrics.poll_time_histogram_bucket_range(bucket);
                let count = (0..num_workers)
                    .map(|worker| metrics.poll_time_histogram_bucket_count(worker, bucket))
                    .sum();
                BenchHistogramBucket {
                    start_us: u64::try_from(range.start.as_micros()).unwrap_or(u64::MAX),
                    end_us: u64::try_from(range.end.as_micros()).unwrap_or(u64::MAX),
                    count,
                }
            })
            .collect()
    } else {
        Vec::new()
    };
    let schedule_latency_buckets = if metrics.schedule_latency_histogram_enabled() {
        (0..metrics.schedule_latency_histogram_num_buckets())
            .map(|bucket| {
                let range = metrics.schedule_latency_histogram_bucket_range(bucket);
                let count = (0..num_workers)
                    .map(|worker| metrics.schedule_latency_histogram_bucket_count(worker, bucket))
                    .sum();
                BenchHistogramBucket {
                    start_us: u64::try_from(range.start.as_micros()).unwrap_or(u64::MAX),
                    end_us: u64::try_from(range.end.as_micros()).unwrap_or(u64::MAX),
                    count,
                }
            })
            .collect()
    } else {
        Vec::new()
    };
    Json(BenchRuntimeMetrics {
        num_workers,
        num_alive_tasks: metrics.num_alive_tasks(),
        global_queue_depth: metrics.global_queue_depth(),
        blocking_queue_depth: metrics.blocking_queue_depth(),
        num_blocking_threads: metrics.num_blocking_threads(),
        num_idle_blocking_threads: metrics.num_idle_blocking_threads(),
        workers,
        poll_time_buckets,
        schedule_latency_buckets,
    })
}

async fn readiness(State(state): State<GatewayLifecycleState>) -> (StatusCode, Json<Probe>) {
    if state.is_ready() {
        (StatusCode::OK, Json(Probe { status: "ready" }))
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(Probe {
                status: if state.disabled {
                    "unconfigured"
                } else {
                    "draining"
                },
            }),
        )
    }
}

/// Serve an initialized router until shutdown, then bound connection draining.
/// A timeout must terminate the owning process/runtime to stop remaining tasks.
///
/// # Errors
/// Returns the server's I/O error, or [`io::ErrorKind::TimedOut`] if connections
/// do not finish draining within `connection_drain_timeout`.
pub async fn serve(
    listener: TcpListener,
    app: Router,
    state: GatewayLifecycleState,
    shutdown: impl Future<Output = ()> + Send + 'static,
    connection_drain_timeout: Duration,
) -> io::Result<()> {
    let (draining_tx, draining_rx) = oneshot::channel();
    let shutdown_state = state.clone();
    let server = axum::serve(
        connection::ObservedListener(listener),
        app.into_make_service_with_connect_info::<ConnectionId>(),
    )
    .with_graceful_shutdown(async move {
        shutdown.await;
        shutdown_state.ready.store(false, Ordering::Release);
        tracing::info!("gateway draining");
        let _ = draining_tx.send(());
    })
    .into_future();
    tokio::pin!(server);
    state.ready.store(true, Ordering::Release);
    let result = tokio::select! {
        result = &mut server => result,
        () = async {
            let _ = draining_rx.await;
            tokio::time::sleep(connection_drain_timeout).await;
        } => Err(io::Error::new(io::ErrorKind::TimedOut, "gateway drain deadline exceeded")),
    };
    state.ready.store(false, Ordering::Release);
    result
}
