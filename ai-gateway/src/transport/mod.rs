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

use crate::capture::{ExecutionCapture, RelayOutcome};
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
pub enum ProviderError {
    Configuration,
    Busy,
    Timeout,
    Transport,
}

impl fmt::Display for ProviderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Configuration => "invalid provider configuration",
            Self::Busy => "gateway execution capacity exhausted",
            Self::Timeout => "provider deadline exceeded",
            Self::Transport => "provider transport failed",
        })
    }
}
impl std::error::Error for ProviderError {}

// An allowlist prevents gateway credentials, tenant routing overrides and cookies
// from crossing the boundary. Headers nominated by `Connection` are never end-to-end.
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
    selected_headers(source, &["content-type", "content-encoding", "accept"])
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
    capture: ExecutionCapture,
) -> Body {
    relay_stream(
        upstream.bytes_stream().map(|chunk| {
            chunk.map_err(|error| {
                if error.is_timeout() {
                    ProviderError::Timeout
                } else {
                    ProviderError::Transport
                }
            })
        }),
        deadline,
        owner,
        Some(capture),
    )
}

fn relay_stream<S, T>(
    upstream: S,
    deadline: Instant,
    owner: T,
    capture: Option<ExecutionCapture>,
) -> Body
where
    S: Stream<Item = Result<Bytes, ProviderError>> + Send + 'static,
    T: Send + 'static,
{
    let (sender, receiver) = mpsc::channel(1);
    let resources = Arc::new(StreamResources {
        owner: Mutex::new(Some((owner, capture))),
        failed: AtomicBool::new(false),
        released: Notify::new(),
    });
    let pump_resources = resources.clone();
    let task = tokio::spawn(async move {
        let pump = async {
            tokio::pin!(upstream);
            while let Some(chunk) = upstream.next().await {
                let chunk = chunk?;
                pump_resources.observe(|capture| capture.push_bytes(&chunk));
                // One queued chunk plus one pending send; no per-chunk tasks.
                for bytes in chunk.chunks(64 * 1024) {
                    if sender.send(Bytes::copy_from_slice(bytes)).await.is_err() {
                        return Ok(());
                    }
                }
            }
            pump_resources.observe(ExecutionCapture::end_body);
            Ok::<_, ProviderError>(())
        };
        match tokio::time::timeout_at(deadline, pump).await {
            Ok(Ok(())) => {}
            result => {
                let outcome = if matches!(result, Err(_) | Ok(Err(ProviderError::Timeout))) {
                    RelayOutcome::Timeout
                } else {
                    RelayOutcome::TransportError
                };
                pump_resources.release(outcome);
            }
        }
        drop(sender);
        // Upstream EOF alone does not release admission: the downstream may still
        // have queued bytes. The deadline also covers an unpolled downstream body.
        if tokio::time::timeout_at(deadline, pump_resources.released.notified())
            .await
            .is_err()
        {
            pump_resources.release(RelayOutcome::Timeout);
        }
    });
    Body::from_stream(ResponseStream {
        receiver,
        task,
        resources,
        done: false,
    })
}

struct StreamResources<T> {
    owner: Mutex<Option<(T, Option<ExecutionCapture>)>>,
    failed: AtomicBool,
    released: Notify,
}

impl<T> StreamResources<T> {
    fn release(&self, outcome: RelayOutcome) {
        let owner = {
            let mut owner = self.owner.lock().expect("relay owner lock poisoned");
            let taken = owner.take();
            // Only the winning finalizer publishes the body failure. In
            // particular, a deadline racing downstream EOF cannot change it later.
            if taken.is_some()
                && matches!(
                    outcome,
                    RelayOutcome::Timeout | RelayOutcome::TransportError
                )
            {
                self.failed.store(true, Ordering::Release);
            }
            taken
        };
        if let Some((owner, capture)) = owner {
            drop(owner);
            if let Some(mut capture) = capture {
                capture.finish(outcome);
            }
        }
        self.released.notify_one();
    }

    fn observe(&self, update: impl FnOnce(&mut ExecutionCapture)) {
        if let Some((_, Some(capture))) = self
            .owner
            .lock()
            .expect("relay owner lock poisoned")
            .as_mut()
        {
            update(capture);
        }
    }
}

struct ResponseStream<T> {
    receiver: mpsc::Receiver<Bytes>,
    task: JoinHandle<()>,
    resources: Arc<StreamResources<T>>,
    done: bool,
}

impl<T> Stream for ResponseStream<T> {
    type Item = Result<Bytes, ProviderError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        if this.done {
            return Poll::Ready(None);
        }
        match this.receiver.poll_recv(cx) {
            Poll::Ready(None) => {
                this.done = true;
                this.resources.release(RelayOutcome::Eof);
                // Finalization publishes failure under the same lock as its outcome.
                Poll::Ready(
                    this.resources
                        .failed
                        .load(Ordering::Acquire)
                        .then_some(Err(ProviderError::Transport)),
                )
            }
            other => other.map(|value| value.map(Ok)),
        }
    }
}

impl<T> Drop for ResponseStream<T> {
    fn drop(&mut self) {
        self.task.abort();
        self.resources.release(RelayOutcome::Cancelled);
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

    #[test]
    fn eof_and_deadline_finalizers_cannot_overwrite_each_other() {
        for first in [RelayOutcome::Eof, RelayOutcome::Timeout] {
            let resources = StreamResources {
                owner: Mutex::new(Some(((), None))),
                failed: AtomicBool::new(false),
                released: Notify::new(),
            };
            resources.release(first);
            resources.release(RelayOutcome::Timeout);
            resources.release(RelayOutcome::Eof);
            resources.release(RelayOutcome::Cancelled);
            assert_eq!(
                resources.failed.load(Ordering::Acquire),
                first == RelayOutcome::Timeout
            );
            assert!(resources.owner.lock().unwrap().is_none());
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
            None,
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
            stream::iter([Ok(bytes.clone()), Err(ProviderError::Transport)]),
            Instant::now() + Duration::from_secs(1),
            Owner(released.clone()),
            None,
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
            None,
        );
        tokio::time::timeout(Duration::from_secs(1), released.notified())
            .await
            .unwrap();
        assert!(to_bytes(body, 1024).await.is_err());
    }
}
