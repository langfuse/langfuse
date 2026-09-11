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

#[derive(Clone, Default)]
pub struct AppState {
    ready: Arc<AtomicBool>,
    disabled: bool,
}

impl AppState {
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

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(|| async { Json(Probe { status: "ok" }) }))
        .route("/ready", get(readiness))
        .with_state(state)
}

async fn readiness(State(state): State<AppState>) -> (StatusCode, Json<Probe>) {
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
/// do not finish draining within `shutdown_timeout`.
pub async fn serve(
    listener: TcpListener,
    app: Router,
    state: AppState,
    shutdown: impl Future<Output = ()> + Send + 'static,
    shutdown_timeout: Duration,
) -> io::Result<()> {
    let (draining_tx, draining_rx) = oneshot::channel();
    let shutdown_state = state.clone();
    let server = axum::serve(listener, app)
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
            tokio::time::sleep(shutdown_timeout).await;
        } => Err(io::Error::new(io::ErrorKind::TimedOut, "gateway shutdown deadline exceeded")),
    };
    state.ready.store(false, Ordering::Release);
    result
}
