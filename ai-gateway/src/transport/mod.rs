//! Bounded byte relay. One task owns upstream reads; the body owns its lifetime.
use std::{
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    task::{Context, Poll},
    time::Duration,
};

use crate::{
    capture::{ExecutionCapture, RelayOutcome},
    resolution::ApiFormat,
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
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ProviderError {
    #[error("invalid provider configuration")]
    Configuration,
    #[error("gateway execution capacity exhausted")]
    Busy,
    #[error("provider deadline exceeded")]
    Timeout,
    #[error("provider transport failed")]
    Transport,
}

// An allowlist prevents gateway credentials, tenant routing overrides and cookies
// from crossing the boundary. Headers nominated by `Connection` are never end-to-end.
// Prefixes admit a provider's own evolving header family without naming each member.
fn selected_headers(source: &HeaderMap, allowed: &[&str], prefixes: &[&str]) -> HeaderMap {
    let hop_by_hop = |name: &str| {
        source.get_all(header::CONNECTION).iter().any(|value| {
            value.to_str().map_or(true, |value| {
                value
                    .split(',')
                    .any(|token| token.trim().eq_ignore_ascii_case(name))
            })
        })
    };
    let mut selected = HeaderMap::new();
    for (name, value) in source {
        let admitted = allowed.contains(&name.as_str())
            || prefixes
                .iter()
                .any(|prefix| name.as_str().starts_with(prefix));
        if admitted && !hop_by_hop(name.as_str()) {
            selected.append(name.clone(), value.clone());
        }
    }
    selected
}

const COMMON_REQUEST_HEADERS: &[&str] = &["content-type", "content-encoding", "accept"];

const COMMON_RESPONSE_HEADERS: &[&str] = &[
    "content-type",
    "content-encoding",
    "cache-control",
    "retry-after",
];

pub(crate) fn request_headers(source: &HeaderMap, api_format: ApiFormat) -> HeaderMap {
    match api_format {
        ApiFormat::OpenAiResponses | ApiFormat::OpenAiChatCompletions => {
            selected_headers(source, COMMON_REQUEST_HEADERS, &[])
        }
        ApiFormat::AnthropicMessages => {
            selected_headers(source, COMMON_REQUEST_HEADERS, &["anthropic-"])
        }
    }
}

pub(crate) fn response_headers(source: &HeaderMap, api_format: ApiFormat) -> HeaderMap {
    match api_format {
        ApiFormat::OpenAiResponses | ApiFormat::OpenAiChatCompletions => selected_headers(
            source,
            &[
                COMMON_RESPONSE_HEADERS,
                &[
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
            ]
            .concat(),
            &[],
        ),
        ApiFormat::AnthropicMessages => selected_headers(
            source,
            &[
                COMMON_RESPONSE_HEADERS,
                &["request-id", "x-should-retry", "anthropic-organization-id"],
            ]
            .concat(),
            &["anthropic-ratelimit-"],
        ),
    }
}

/// The provider's own request ID, bounded like other captured provider facts.
pub(crate) fn provider_request_id(headers: &HeaderMap, api_format: ApiFormat) -> Option<&str> {
    let name = match api_format {
        ApiFormat::OpenAiResponses | ApiFormat::OpenAiChatCompletions => "x-request-id",
        ApiFormat::AnthropicMessages => "request-id",
    };
    headers
        .get(name)?
        .to_str()
        .ok()
        .filter(|value| value.len() <= 512)
}

pub(crate) fn identity_encoding(headers: &HeaderMap) -> bool {
    headers
        .get_all(header::CONTENT_ENCODING)
        .iter()
        .all(|value| {
            value
                .to_str()
                .is_ok_and(|value| value.eq_ignore_ascii_case("identity"))
        })
}

pub(crate) fn relay<T: Send + 'static>(
    upstream: reqwest::Response,
    provider: &'static str,
    deadline: Instant,
    stall_timeout: Duration,
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
        provider,
        deadline,
        stall_timeout,
        owner,
        Some(capture),
    )
}

/// Relay until EOF, the overall `deadline`, or `stall_timeout` without progress
/// in either direction: no upstream chunk, or a downstream that stopped reading.
fn relay_stream<S, T>(
    upstream: S,
    provider: &'static str,
    deadline: Instant,
    stall_timeout: Duration,
    owner: T,
    capture: Option<ExecutionCapture>,
) -> Body
where
    S: Stream<Item = Result<Bytes, ProviderError>> + Send + 'static,
    T: Send + 'static,
{
    let (sender, receiver) = mpsc::channel(1);
    // Covers the response body after provider headers until the relay is
    // finalized, which the header-scoped client span cannot see.
    let span = tracing::info_span!(
        "provider.stream",
        otel.kind = "internal",
        otel.status_code = tracing::field::Empty,
        error.type = tracing::field::Empty,
        http.response.body.size = tracing::field::Empty,
        gateway.chunks = tracing::field::Empty,
        gateway.outcome = tracing::field::Empty,
    );
    let resources = Arc::new(StreamResources {
        relay: Mutex::new(Some(Relay {
            provider,
            owner,
            capture,
            span,
        })),
        failed: AtomicBool::new(false),
        released: Notify::new(),
        bytes: AtomicUsize::new(0),
        chunks: AtomicUsize::new(0),
    });
    let pump_resources = resources.clone();
    let task = tokio::spawn(async move {
        let pump = async {
            tokio::pin!(upstream);
            while let Some(chunk) = tokio::time::timeout(stall_timeout, upstream.next())
                .await
                .map_err(|_| ProviderError::Timeout)?
            {
                let chunk = chunk?;
                pump_resources
                    .bytes
                    .fetch_add(chunk.len(), Ordering::Relaxed);
                pump_resources.chunks.fetch_add(1, Ordering::Relaxed);
                pump_resources.observe(|capture| capture.push_bytes(&chunk));
                // One queued chunk plus one pending send; no per-chunk tasks.
                for bytes in chunk.chunks(64 * 1024) {
                    let sent = tokio::time::timeout(
                        stall_timeout,
                        sender.send(Bytes::copy_from_slice(bytes)),
                    )
                    .await
                    .map_err(|_| ProviderError::Timeout)?;
                    if sent.is_err() {
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
        // have queued bytes. The stall timeout also covers an unpolled downstream body.
        if tokio::time::timeout_at(
            deadline.min(Instant::now() + stall_timeout),
            pump_resources.released.notified(),
        )
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

/// Everything the winning finalizer releases at once: admission and trusted
/// context, the capture, and the stream span, which ends when it is dropped here.
struct Relay<T> {
    provider: &'static str,
    owner: T,
    capture: Option<ExecutionCapture>,
    span: tracing::Span,
}

struct StreamResources<T> {
    relay: Mutex<Option<Relay<T>>>,
    failed: AtomicBool,
    released: Notify,
    bytes: AtomicUsize,
    chunks: AtomicUsize,
}

impl<T> StreamResources<T> {
    fn release(&self, outcome: RelayOutcome) {
        let (relay, outcome) = {
            // A poisoned lock means capture code panicked mid-update: the body
            // is truncated and the capture is partial, so the relay failed.
            let (mut relay, outcome) = match self.relay.lock() {
                Ok(relay) => (relay, outcome),
                Err(poisoned) => (poisoned.into_inner(), RelayOutcome::TransportError),
            };
            let taken = relay.take();
            // Only the winning finalizer publishes the body failure. In
            // particular, a deadline racing downstream EOF cannot change it later.
            if taken.is_some() && outcome.is_failure() {
                self.failed.store(true, Ordering::Release);
            }
            (taken, outcome)
        };
        if let Some(Relay {
            provider,
            owner,
            capture,
            span,
        }) = relay
        {
            self.record_outcome(&span, outcome);
            crate::observability::response_body_size(
                provider,
                u64::try_from(self.bytes.load(Ordering::Relaxed)).unwrap_or(u64::MAX),
            );
            drop(span);
            drop(owner);
            if let Some(mut capture) = capture {
                capture.finish(outcome);
            }
        }
        self.released.notify_one();
    }

    fn record_outcome(&self, span: &tracing::Span, outcome: RelayOutcome) {
        let count = |value: usize| i64::try_from(value).unwrap_or(i64::MAX);
        span.record(
            "http.response.body.size",
            count(self.bytes.load(Ordering::Relaxed)),
        );
        span.record("gateway.chunks", count(self.chunks.load(Ordering::Relaxed)));
        span.record("gateway.outcome", outcome.as_str());
        if outcome.is_failure() {
            span.record("otel.status_code", "ERROR");
            span.record("error.type", outcome.as_str());
        }
    }

    fn observe(&self, update: impl FnOnce(&mut ExecutionCapture)) {
        // `release` fails a poisoned relay; never update its partial capture.
        let Ok(mut relay) = self.relay.lock() else {
            return;
        };
        if let Some(capture) = relay.as_mut().and_then(|relay| relay.capture.as_mut()) {
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
                relay: Mutex::new(Some(Relay {
                    provider: "test",
                    owner: (),
                    capture: None,
                    span: tracing::Span::none(),
                })),
                failed: AtomicBool::new(false),
                released: Notify::new(),
                bytes: AtomicUsize::new(0),
                chunks: AtomicUsize::new(0),
            };
            resources.release(first);
            resources.release(RelayOutcome::Timeout);
            resources.release(RelayOutcome::Eof);
            resources.release(RelayOutcome::Cancelled);
            assert_eq!(
                resources.failed.load(Ordering::Acquire),
                first == RelayOutcome::Timeout
            );
            assert!(resources.relay.lock().unwrap().is_none());
        }
    }

    #[test]
    fn a_panic_while_updating_the_capture_fails_the_relay() {
        let resources = StreamResources {
            relay: Mutex::new(Some(Relay {
                provider: "test",
                owner: (),
                capture: None,
                span: tracing::Span::none(),
            })),
            failed: AtomicBool::new(false),
            released: Notify::new(),
            bytes: AtomicUsize::new(0),
            chunks: AtomicUsize::new(0),
        };
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _relay = resources.relay.lock();
            panic!("capture update panicked");
        }));
        assert!(resources.relay.is_poisoned());

        resources.release(RelayOutcome::Eof);

        assert!(resources.failed.load(Ordering::Acquire));
        assert!(
            resources
                .relay
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .is_none()
        );
    }

    #[tokio::test]
    async fn stream_span_ends_with_the_relay_and_records_the_failed_outcome() {
        use opentelemetry::trace::TracerProvider;
        use opentelemetry_sdk::trace::{InMemorySpanExporter, SdkTracerProvider};
        use tracing_subscriber::prelude::*;

        let exporter = InMemorySpanExporter::default();
        let provider = SdkTracerProvider::builder()
            .with_simple_exporter(exporter.clone())
            .build();
        let _guard = tracing::subscriber::set_default(
            tracing_subscriber::registry()
                .with(tracing_opentelemetry::layer().with_tracer(provider.tracer("test"))),
        );
        let released = Arc::new(Notify::new());
        let body = relay_stream(
            stream::iter([
                Ok(Bytes::from_static(b"partial")),
                Err(ProviderError::Transport),
            ]),
            "test",
            Instant::now() + Duration::from_secs(1),
            Duration::from_secs(10),
            Owner(released.clone()),
            None,
        );
        tokio::time::timeout(Duration::from_secs(1), released.notified())
            .await
            .unwrap();
        // The finalizer drops the span, so it is exported before the body is even polled.
        let spans = exporter.get_finished_spans().unwrap();
        assert_eq!(spans.len(), 1);
        let stream = &spans[0];
        assert_eq!(stream.name, "provider.stream");
        assert!(matches!(
            stream.status,
            opentelemetry::trace::Status::Error { .. }
        ));
        let attribute = |key: &str| {
            stream
                .attributes
                .iter()
                .find(|attribute| attribute.key.as_str() == key)
                .map(|attribute| attribute.value.clone())
        };
        assert_eq!(attribute("gateway.outcome"), Some("transport_error".into()));
        assert_eq!(attribute("http.response.body.size"), Some(7i64.into()));
        assert_eq!(attribute("gateway.chunks"), Some(1i64.into()));
        assert!(to_bytes(body, 1024).await.is_err());
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
            "test",
            Instant::now() + Duration::from_secs(10),
            Duration::from_secs(10),
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
            "test",
            Instant::now() + Duration::from_secs(1),
            Duration::from_secs(10),
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
            "test",
            Instant::now() + Duration::from_millis(30),
            Duration::from_secs(10),
            Owner(released.clone()),
            None,
        );
        tokio::time::timeout(Duration::from_secs(1), released.notified())
            .await
            .unwrap();
        assert!(to_bytes(body, 1024).await.is_err());
    }

    #[tokio::test(start_paused = true)]
    async fn a_silent_upstream_stalls_out_long_before_the_deadline() {
        let released = Arc::new(Notify::new());
        let started = Instant::now();
        let body = relay_stream(
            stream::once(async { Ok(Bytes::from_static(b"first")) }).chain(stream::pending()),
            "test",
            started + Duration::from_secs(3600),
            Duration::from_secs(120),
            Owner(released.clone()),
            None,
        );
        let mut downstream = body.into_data_stream();
        assert_eq!(downstream.next().await.unwrap().unwrap(), "first");
        released.notified().await;
        assert_eq!(started.elapsed(), Duration::from_secs(120));
        assert!(downstream.next().await.unwrap().is_err());
    }

    #[tokio::test(start_paused = true)]
    async fn a_downstream_that_stops_reading_stalls_out() {
        let released = Arc::new(Notify::new());
        let started = Instant::now();
        // Steady upstream progress must not keep a non-reading client's slot alive.
        let upstream =
            stream::repeat_with(|| Ok(Bytes::from_static(b"chunk"))).then(|chunk| async {
                tokio::time::sleep(Duration::from_secs(1)).await;
                chunk
            });
        let _body = relay_stream(
            upstream,
            "test",
            started + Duration::from_secs(3600),
            Duration::from_secs(120),
            Owner(released.clone()),
            None,
        );
        released.notified().await;
        assert!(started.elapsed() < Duration::from_secs(125));
    }
}
