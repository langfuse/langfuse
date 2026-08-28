use std::{
    error::Error,
    pin::Pin,
    task::{Context, Poll},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::STANDARD};
use bytes::Bytes;
use futures_util::Stream;
use http_body_util::{BodyExt, Full};
use hyper::{Method, Request, StatusCode, Uri, header};
use hyper_util::client::legacy::{Client, connect::HttpConnector};
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio::time::{Instant, timeout_at};
use tracing::warn;
use uuid::Uuid;

use crate::metrics::{ActiveRequest, Metrics};

pub type BoxError = Box<dyn Error + Send + Sync>;
pub type HttpClient = Client<HttpConnector, Full<Bytes>>;
pub type ByteStream = Pin<Box<dyn Stream<Item = Result<Bytes, BoxError>> + Send>>;

const OTLP_BATCH_PREFIX: &[u8] = br#"{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"gateway-benchmark-rust"}}]},"scopeSpans":[{"scope":{"name":"gateway-benchmark","version":"0.0.0"},"spans":["#;
const OTLP_BATCH_SUFFIX: &[u8] = br#"]}]}]}"#;

#[derive(Clone)]
pub struct TelemetryEmitter {
    sender: mpsc::Sender<Bytes>,
    metrics: Metrics,
    capture_limit: usize,
}

pub struct TelemetryFinalizer {
    emitter: TelemetryEmitter,
    request: RequestTelemetry,
}

struct RequestTelemetry {
    trace_id: String,
    span_id: String,
    started_unix_nanos: u128,
    mode: String,
    model: String,
    input_preview: String,
    input_bytes: usize,
    input_truncated: bool,
}

impl TelemetryEmitter {
    pub fn start(
        client: HttpClient,
        otel_url: Uri,
        queue_capacity: usize,
        batch_max_spans: usize,
        batch_max_wait: Duration,
        capture_limit: usize,
        metrics: Metrics,
    ) -> Self {
        let (sender, receiver) = mpsc::channel(queue_capacity);
        tokio::spawn(publish_worker(
            receiver,
            client,
            otel_url,
            batch_max_spans,
            batch_max_wait,
            metrics.clone(),
        ));
        Self {
            sender,
            metrics,
            capture_limit,
        }
    }

    pub fn begin(&self, mode: &str, model: &str, input: &[u8]) -> TelemetryFinalizer {
        let trace_id = Uuid::new_v4();
        let span_id = Uuid::new_v4();
        TelemetryFinalizer {
            emitter: self.clone(),
            request: RequestTelemetry {
                trace_id: STANDARD.encode(trace_id.as_bytes()),
                span_id: STANDARD.encode(&span_id.as_bytes()[..8]),
                started_unix_nanos: unix_nanos(),
                mode: mode.to_owned(),
                model: model.to_owned(),
                input_preview: preview(input, self.capture_limit),
                input_bytes: input.len(),
                input_truncated: input.len() > self.capture_limit,
            },
        }
    }
}

impl TelemetryFinalizer {
    pub fn finish(
        self,
        output: &[u8],
        output_bytes: usize,
        status: StatusCode,
        error: Option<&str>,
    ) {
        let output_preview = preview(output, self.emitter.capture_limit);
        let mut attributes = vec![
            string_attr("benchmark.runtime", "rust"),
            string_attr("benchmark.mode", &self.request.mode),
            string_attr("gen_ai.request.model", &self.request.model),
            int_attr("http.response.status_code", status.as_u16() as u64),
            int_attr("benchmark.input.bytes", self.request.input_bytes as u64),
            int_attr("benchmark.output.bytes", output_bytes as u64),
            bool_attr("benchmark.input.truncated", self.request.input_truncated),
            bool_attr(
                "benchmark.output.truncated",
                output_bytes > self.emitter.capture_limit,
            ),
            string_attr("gen_ai.input.messages", &self.request.input_preview),
            string_attr("gen_ai.output.messages", &output_preview),
        ];
        if let Some(error) = error {
            attributes.push(string_attr("error.message", error));
        }

        let span = json!({
            "traceId": self.request.trace_id,
            "spanId": self.request.span_id,
            "name": "POST /v1/chat/completions",
            "kind": 2,
            "startTimeUnixNano": self.request.started_unix_nanos.to_string(),
            "endTimeUnixNano": unix_nanos().to_string(),
            "attributes": attributes,
            "status": {
                "code": if error.is_some() || status.is_server_error() { 2 } else { 1 }
            }
        });

        // Deliberately serialize before enqueueing: this models the same
        // request-path CPU work as the Node benchmark implementation.
        let Ok(serialized) = serde_json::to_vec(&span) else {
            self.emitter.metrics.telemetry_failed();
            return;
        };
        let payload = Bytes::from(serialized);
        let payload_bytes = payload.len();
        self.emitter
            .metrics
            .telemetry_enqueue_started(payload_bytes);
        if self.emitter.sender.try_send(payload).is_err() {
            self.emitter.metrics.telemetry_enqueue_failed(payload_bytes);
        }
    }
}

pub struct ObservedStream {
    inner: ByteStream,
    output_preview: Vec<u8>,
    output_bytes: usize,
    capture_limit: usize,
    status: StatusCode,
    finalizer: Option<TelemetryFinalizer>,
    active_request: Option<ActiveRequest>,
}

impl ObservedStream {
    pub fn new(
        inner: ByteStream,
        capture_limit: usize,
        status: StatusCode,
        finalizer: TelemetryFinalizer,
        active_request: ActiveRequest,
    ) -> Self {
        Self {
            inner,
            output_preview: Vec::with_capacity(capture_limit.min(16 * 1024)),
            output_bytes: 0,
            capture_limit,
            status,
            finalizer: Some(finalizer),
            active_request: Some(active_request),
        }
    }

    fn complete(&mut self, error: Option<&str>) {
        let failed = error.is_some() || self.status.is_server_error();
        if let Some(finalizer) = self.finalizer.take() {
            finalizer.finish(&self.output_preview, self.output_bytes, self.status, error);
        }
        if let Some(mut request) = self.active_request.take() {
            request.finish(self.output_bytes, failed);
        }
    }
}

impl Stream for ObservedStream {
    type Item = Result<Bytes, BoxError>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match self.inner.as_mut().poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                self.output_bytes = self.output_bytes.saturating_add(bytes.len());
                let remaining = self.capture_limit.saturating_sub(self.output_preview.len());
                if remaining > 0 {
                    self.output_preview
                        .extend_from_slice(&bytes[..bytes.len().min(remaining)]);
                }
                Poll::Ready(Some(Ok(bytes)))
            }
            Poll::Ready(Some(Err(error))) => {
                let message = error.to_string();
                self.complete(Some(&message));
                Poll::Ready(Some(Err(error)))
            }
            Poll::Ready(None) => {
                self.complete(None);
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

impl Drop for ObservedStream {
    fn drop(&mut self) {
        if self.finalizer.is_some() {
            self.complete(Some("downstream disconnected"));
        }
    }
}

async fn publish_worker(
    mut receiver: mpsc::Receiver<Bytes>,
    client: HttpClient,
    otel_url: Uri,
    batch_max_spans: usize,
    batch_max_wait: Duration,
    metrics: Metrics,
) {
    while let Some(spans) = receive_batch(&mut receiver, batch_max_spans, batch_max_wait).await {
        let payload = build_batch_payload(&spans);
        let request = Request::builder()
            .method(Method::POST)
            .uri(otel_url.clone())
            .header(header::CONTENT_TYPE, "application/json")
            .body(Full::new(payload));

        let published = match request {
            Ok(request) => match client.request(request).await {
                Ok(response) => {
                    let successful = response.status().is_success();
                    // Consume the response so Hyper can reuse the connection.
                    let _ = response.into_body().collect().await;
                    successful
                }
                Err(error) => {
                    warn!(%error, "telemetry publish failed");
                    false
                }
            },
            Err(error) => {
                warn!(%error, "failed to build telemetry request");
                false
            }
        };

        for span in spans {
            if published {
                metrics.telemetry_published();
            } else {
                metrics.telemetry_failed();
            }
            metrics.telemetry_dequeued(span.len());
        }
    }
}

async fn receive_batch(
    receiver: &mut mpsc::Receiver<Bytes>,
    max_spans: usize,
    max_wait: Duration,
) -> Option<Vec<Bytes>> {
    let first = receiver.recv().await?;
    let mut spans = Vec::with_capacity(max_spans);
    spans.push(first);
    let deadline = Instant::now() + max_wait;

    while spans.len() < max_spans {
        match timeout_at(deadline, receiver.recv()).await {
            Ok(Some(span)) => spans.push(span),
            Ok(None) | Err(_) => break,
        }
    }

    Some(spans)
}

fn build_batch_payload(spans: &[Bytes]) -> Bytes {
    let spans_bytes = spans.iter().map(Bytes::len).sum::<usize>();
    let separators = spans.len().saturating_sub(1);
    let mut payload = Vec::with_capacity(
        OTLP_BATCH_PREFIX.len() + spans_bytes + separators + OTLP_BATCH_SUFFIX.len(),
    );
    payload.extend_from_slice(OTLP_BATCH_PREFIX);
    for (index, span) in spans.iter().enumerate() {
        if index > 0 {
            payload.push(b',');
        }
        payload.extend_from_slice(span);
    }
    payload.extend_from_slice(OTLP_BATCH_SUFFIX);
    Bytes::from(payload)
}

fn preview(bytes: &[u8], limit: usize) -> String {
    String::from_utf8_lossy(&bytes[..bytes.len().min(limit)]).into_owned()
}

fn string_attr(key: &str, value: &str) -> Value {
    json!({ "key": key, "value": { "stringValue": value } })
}

fn int_attr(key: &str, value: u64) -> Value {
    json!({ "key": key, "value": { "intValue": value.to_string() } })
}

fn bool_attr(key: &str, value: bool) -> Value {
    json!({ "key": key, "value": { "boolValue": value } })
}

fn unix_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_one_otlp_envelope_for_all_spans() {
        let payload = build_batch_payload(&[
            Bytes::from_static(br#"{"traceId":"first"}"#),
            Bytes::from_static(br#"{"traceId":"second"}"#),
        ]);
        let envelope: Value = serde_json::from_slice(&payload).expect("batch must be valid JSON");
        let spans = envelope
            .pointer("/resourceSpans/0/scopeSpans/0/spans")
            .and_then(Value::as_array)
            .expect("batch must contain an OTLP spans array");

        assert_eq!(envelope["resourceSpans"].as_array().unwrap().len(), 1);
        assert_eq!(spans.len(), 2);
        assert_eq!(spans[0]["traceId"], "first");
        assert_eq!(spans[1]["traceId"], "second");
    }

    #[tokio::test]
    async fn flushes_when_batch_reaches_max_spans() {
        let (sender, mut receiver) = mpsc::channel(3);
        sender.send(Bytes::from_static(b"one")).await.unwrap();
        sender.send(Bytes::from_static(b"two")).await.unwrap();
        sender.send(Bytes::from_static(b"three")).await.unwrap();

        let batch = receive_batch(&mut receiver, 2, Duration::from_secs(1))
            .await
            .unwrap();

        assert_eq!(batch.len(), 2);
        assert_eq!(receiver.try_recv().unwrap(), Bytes::from_static(b"three"));
    }

    #[tokio::test]
    async fn flushes_partial_batch_after_max_wait() {
        let (sender, mut receiver) = mpsc::channel(2);
        sender.send(Bytes::from_static(b"one")).await.unwrap();

        let batch = tokio::time::timeout(
            Duration::from_millis(100),
            receive_batch(&mut receiver, 2, Duration::from_millis(5)),
        )
        .await
        .expect("batch must flush after its max wait")
        .unwrap();

        assert_eq!(batch, vec![Bytes::from_static(b"one")]);
    }
}
