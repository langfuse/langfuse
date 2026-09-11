//! Bounded byte relay. One task owns upstream reads; the body owns its lifetime.
use std::{
    fmt,
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    task::{Context, Poll},
};

use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, header},
};
use futures_util::{Stream, StreamExt};
use tokio::{
    sync::{Notify, mpsc},
    task::JoinHandle,
    time::Instant,
};

/// Sanitized failures; upstream URLs, bodies and credentials are never retained.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelayError {
    Configuration,
    Busy,
    Timeout,
    Transport,
}

impl fmt::Display for RelayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Configuration => "invalid provider configuration",
            Self::Busy => "gateway execution capacity exhausted",
            Self::Timeout => "provider deadline exceeded",
            Self::Transport => "provider transport failed",
        })
    }
}
impl std::error::Error for RelayError {}

// An allowlist prevents gateway credentials, tenant routing overrides and cookies
// from crossing the boundary. Connection-nominated headers are never end-to-end.
fn selected_headers(source: &HeaderMap, allowed: &[&'static str]) -> HeaderMap {
    let mut selected = HeaderMap::new();
    for &name in allowed {
        let hop_by_hop = source.get_all(header::CONNECTION).iter().any(|value| {
            value.to_str().map_or(true, |value| {
                value
                    .split(',')
                    .any(|token| token.trim().eq_ignore_ascii_case(name))
            })
        });
        if !hop_by_hop {
            for value in source.get_all(name) {
                selected.append(header::HeaderName::from_static(name), value.clone());
            }
        }
    }
    selected
}

pub(crate) fn request_headers(source: &HeaderMap) -> HeaderMap {
    selected_headers(
        source,
        &[
            "content-type",
            "content-encoding",
            "accept",
            "accept-encoding",
        ],
    )
}

pub(crate) fn response_headers(source: &HeaderMap) -> HeaderMap {
    selected_headers(
        source,
        &[
            "content-type",
            "content-encoding",
            "cache-control",
            "retry-after",
            "x-request-id",
            "openai-processing-ms",
            "openai-version",
            "x-ratelimit-limit-requests",
            "x-ratelimit-limit-tokens",
            "x-ratelimit-remaining-requests",
            "x-ratelimit-remaining-tokens",
            "x-ratelimit-reset-requests",
            "x-ratelimit-reset-tokens",
        ],
    )
}

pub(crate) fn relay<T: Send + 'static>(
    upstream: reqwest::Response,
    deadline: Instant,
    owner: T,
) -> Body {
    relay_stream(
        upstream
            .bytes_stream()
            .map(|chunk| chunk.map_err(|_| RelayError::Transport)),
        deadline,
        owner,
    )
}

fn relay_stream<S, T>(upstream: S, deadline: Instant, owner: T) -> Body
where
    S: Stream<Item = Result<Bytes, RelayError>> + Send + 'static,
    T: Send + 'static,
{
    let (sender, receiver) = mpsc::channel(1);
    let failed = Arc::new(AtomicBool::new(false));
    let failure = failed.clone();
    let lease = Arc::new(Lease {
        owner: Mutex::new(Some(owner)),
        released: Notify::new(),
    });
    let lifetime = lease.clone();
    let task = tokio::spawn(async move {
        let pump = async {
            tokio::pin!(upstream);
            while let Some(chunk) = upstream.next().await {
                let chunk = chunk?;
                // One queued chunk plus one pending send; no per-chunk tasks.
                for bytes in chunk.chunks(64 * 1024) {
                    if sender.send(Bytes::copy_from_slice(bytes)).await.is_err() {
                        return Ok(());
                    }
                }
            }
            Ok::<_, RelayError>(())
        };
        if !matches!(tokio::time::timeout_at(deadline, pump).await, Ok(Ok(()))) {
            failure.store(true, Ordering::Release);
            lifetime.release();
        }
        drop(sender);
        // Upstream EOF alone does not release admission: the downstream may still
        // have queued bytes. The deadline also covers an unpolled downstream body.
        if tokio::time::timeout_at(deadline, lifetime.released.notified())
            .await
            .is_err()
        {
            failure.store(true, Ordering::Release);
            lifetime.release();
        }
    });
    Body::from_stream(Relay {
        receiver,
        task,
        failed,
        lease,
        done: false,
    })
}

struct Lease<T> {
    owner: Mutex<Option<T>>,
    released: Notify,
}

impl<T> Lease<T> {
    fn release(&self) {
        self.owner.lock().expect("relay owner lock poisoned").take();
        self.released.notify_one();
    }
}

struct Relay<T> {
    receiver: mpsc::Receiver<Bytes>,
    task: JoinHandle<()>,
    failed: Arc<AtomicBool>,
    lease: Arc<Lease<T>>,
    done: bool,
}

impl<T> Stream for Relay<T> {
    type Item = Result<Bytes, RelayError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        if this.done {
            return Poll::Ready(None);
        }
        match this.receiver.poll_recv(cx) {
            Poll::Ready(None) => {
                this.done = true;
                this.lease.release();
                // The sender publishes a failure before closing its channel.
                Poll::Ready(
                    this.failed
                        .load(Ordering::Acquire)
                        .then_some(Err(RelayError::Transport)),
                )
            }
            other => other.map(|value| value.map(Ok)),
        }
    }
}

impl<T> Drop for Relay<T> {
    fn drop(&mut self) {
        self.task.abort();
        self.lease.release();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use futures_util::stream;
    use std::{sync::atomic::AtomicUsize, time::Duration};

    struct Owner(Arc<Notify>);
    impl Drop for Owner {
        fn drop(&mut self) {
            self.0.notify_one();
        }
    }

    #[tokio::test]
    async fn slow_downstream_bounds_read_ahead_and_drop_releases_owner() {
        let polled = Arc::new(AtomicUsize::new(0));
        let count = polled.clone();
        let upstream = stream::iter(0..100).map(move |_| {
            count.fetch_add(1, Ordering::SeqCst);
            Ok(Bytes::from(vec![b'x'; 128 * 1024]))
        });
        let released = Arc::new(Notify::new());
        let body = relay_stream(
            upstream,
            Instant::now() + Duration::from_secs(10),
            Owner(released.clone()),
        );
        tokio::task::yield_now().await;
        assert_eq!(polled.load(Ordering::SeqCst), 1);
        drop(body);
        tokio::time::timeout(Duration::from_secs(1), released.notified())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn queued_bytes_are_delivered_before_an_upstream_error() {
        let released = Arc::new(Notify::new());
        let bytes = Bytes::from_static(b"event: response.output_text.delta\ndata: hello\n\n");
        let body = relay_stream(
            stream::iter([Ok(bytes.clone()), Err(RelayError::Transport)]),
            Instant::now() + Duration::from_secs(1),
            Owner(released.clone()),
        );
        // Wait until the pump has published its failure with the successful chunk queued.
        tokio::time::timeout(Duration::from_secs(1), released.notified())
            .await
            .unwrap();
        let mut downstream = body.into_data_stream();
        assert_eq!(downstream.next().await.unwrap().unwrap(), bytes);
        assert!(downstream.next().await.unwrap().is_err());
        assert!(downstream.next().await.is_none());
    }

    #[tokio::test]
    async fn deadline_releases_owner_even_after_upstream_eof_with_unpolled_body() {
        let released = Arc::new(Notify::new());
        let body = relay_stream(
            stream::once(async { Ok(Bytes::from_static(b"final bytes")) }),
            Instant::now() + Duration::from_millis(30),
            Owner(released.clone()),
        );
        tokio::time::timeout(Duration::from_secs(1), released.notified())
            .await
            .unwrap();
        assert!(to_bytes(body, 1024).await.is_err());
    }
}
