//! Bounded byte relay. One task owns upstream reads; the body owns its lifetime.
use std::{
    fmt,
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    task::{Context, Poll},
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
        ApiFormat::OpenAiResponses => selected_headers(source, COMMON_REQUEST_HEADERS, &[]),
        // Claude Code pairs beta body fields with `anthropic-beta` values and adds
        // new `anthropic-*` headers between releases; a closed list would break
        // the next capability. Client credentials never match the prefix.
        ApiFormat::AnthropicMessages => {
            selected_headers(source, COMMON_REQUEST_HEADERS, &["anthropic-"])
        }
    }
}

pub(crate) fn response_headers(source: &HeaderMap, api_format: ApiFormat) -> HeaderMap {
    match api_format {
        ApiFormat::OpenAiResponses => selected_headers(
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
        // Claude Code reads `retry-after`, `x-should-retry` and the unified rate
        // limit headers to decide whether and when to retry, and `request-id`
        // appears in its error output.
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
    // Covers the response body after provider headers until the relay is
    // finalized, which the header-scoped client span cannot see.
    let span = tracing::info_span!(
        "provider.stream",
        otel.kind = "internal",
        otel.status_code = tracing::field::Empty,
        http.response.body.size = tracing::field::Empty,
        gateway.chunks = tracing::field::Empty,
        gateway.outcome = tracing::field::Empty,
    );
    let resources = Arc::new(StreamResources {
        relay: Mutex::new(Some(Relay {
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
            while let Some(chunk) = upstream.next().await {
                let chunk = chunk?;
                pump_resources
                    .bytes
                    .fetch_add(chunk.len(), Ordering::Relaxed);
                pump_resources.chunks.fetch_add(1, Ordering::Relaxed);
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

/// Everything the winning finalizer releases at once: admission and trusted
/// context, the capture, and the stream span, which ends when it is dropped here.
struct Relay<T> {
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
        let relay = {
            let mut relay = self.relay.lock().expect("relay owner lock poisoned");
            let taken = relay.take();
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
        if let Some(Relay {
            owner,
            capture,
            span,
        }) = relay
        {
            self.record_outcome(&span, outcome);
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
        if matches!(
            outcome,
            RelayOutcome::Timeout | RelayOutcome::TransportError
        ) {
            span.record("otel.status_code", "ERROR");
        }
    }

    fn observe(&self, update: impl FnOnce(&mut ExecutionCapture)) {
        if let Some(capture) = self
            .relay
            .lock()
            .expect("relay owner lock poisoned")
            .as_mut()
            .and_then(|relay| relay.capture.as_mut())
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
                relay: Mutex::new(Some(Relay {
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
            Instant::now() + Duration::from_secs(1),
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
