#![cfg(unix)]

use axum::{Router, body::Bytes, extract::Request, routing::post};
use opentelemetry_proto::tonic::collector::{
    metrics::v1::ExportMetricsServiceRequest, trace::v1::ExportTraceServiceRequest,
};
use opentelemetry_proto::tonic::{
    common::v1::any_value::Value as AttributeValue,
    metrics::v1::{ResourceMetrics, metric::Data},
    trace::v1::ResourceSpans,
};
use prost::Message;
use serde_json::Value;
use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, mpsc},
    thread::JoinHandle,
    time::{Duration, Instant},
};

struct Gateway {
    child: Child,
    url: String,
    logs: Arc<Mutex<Vec<Value>>>,
    reader: Option<JoinHandle<()>>,
}

impl Gateway {
    fn start(endpoint: &str, shutdown_seconds: &str, level: &str) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_ai-gateway"))
            .env_clear()
            .env("LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS", "127.0.0.1:0")
            .env(
                "LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS",
                shutdown_seconds,
            )
            .env("LANGFUSE_LOG_FORMAT", "json")
            .env("LANGFUSE_LOG_LEVEL", level)
            .env("OTEL_EXPORTER_OTLP_ENDPOINT", endpoint)
            .env("OTEL_SERVICE_NAME", "gateway-observability-test")
            .env("DD_ENV", "staging-test")
            .env("BUILD_ID", "test-version")
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let stdout = child.stdout.take().unwrap();
        let logs = Arc::new(Mutex::new(Vec::new()));
        let output = logs.clone();
        let (sender, receiver) = mpsc::channel();
        let reader = std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let value: Value = serde_json::from_str(&line).unwrap();
                if value["message"] == "gateway listening" {
                    let _ = sender.send(value["address"].as_str().unwrap().to_owned());
                }
                output.lock().unwrap().push(value);
            }
        });
        let address = receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("gateway startup");
        Self {
            child,
            url: format!("http://{address}"),
            logs,
            reader: Some(reader),
        }
    }

    async fn request(&self, sampled: bool) {
        let response = reqwest::Client::new()
            .post(format!(
                "{}/openai/v1/responses?secret=query-canary",
                self.url
            ))
            .header("host", "host-canary.invalid")
            .header("x-forwarded-proto", "scheme-canary")
            .header(
                "traceparent",
                format!(
                    "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-{:02x}",
                    u8::from(sampled)
                ),
            )
            .header("tracestate", "caller=state-canary")
            .header("baggage", "langfuse_user_id=baggage-canary")
            .header("langfuse-session-id", "session-canary")
            .header("authorization", "Bearer secret-auth-token")
            .body(r#"{"input":"secret-prompt-content"}"#)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 503);
        let _ = response.bytes().await.unwrap();
    }

    async fn stop(&mut self) {
        assert!(
            Command::new("/bin/kill")
                .args(["-TERM", &self.child.id().to_string()])
                .status()
                .unwrap()
                .success()
        );
        tokio::time::timeout(Duration::from_secs(6), async {
            loop {
                if let Some(status) = self.child.try_wait().unwrap() {
                    assert!(status.success());
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("gateway shutdown deadline");
        self.reader.take().unwrap().join().unwrap();
    }
}

impl Drop for Gateway {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[tokio::test]
async fn exports_otlp_traces_metrics_and_correlated_content_free_logs() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let receiver = captured.clone();
    let app = Router::new().route(
        "/{*path}",
        post(move |request: Request| {
            let receiver = receiver.clone();
            async move {
                let path = request.uri().path().to_owned();
                let body = axum::body::to_bytes(request.into_body(), 1_000_000)
                    .await
                    .unwrap();
                receiver.lock().unwrap().push((path, body));
                Bytes::new()
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let mut gateway = Gateway::start(&endpoint, "5", "debug");
    gateway.request(true).await;
    gateway.request(false).await;
    assert_eq!(
        reqwest::get(format!("{}/health", gateway.url))
            .await
            .unwrap()
            .status(),
        200
    );
    gateway.stop().await;
    server.abort();
    let captured = captured.lock().unwrap();
    let traces: Vec<_> = captured
        .iter()
        .filter(|(path, _)| path == "/v1/traces")
        .flat_map(|(_, body)| {
            ExportTraceServiceRequest::decode(body.clone())
                .unwrap()
                .resource_spans
        })
        .collect();
    let metrics: Vec<_> = captured
        .iter()
        .filter(|(path, _)| path == "/v1/metrics")
        .flat_map(|(_, body)| {
            ExportMetricsServiceRequest::decode(body.clone())
                .unwrap()
                .resource_metrics
        })
        .collect();
    assert!(!traces.is_empty(), "traces must flush on shutdown");
    assert!(!metrics.is_empty(), "metrics must flush on shutdown");
    let logs = gateway.logs.lock().unwrap();
    assert_operational_traces(&traces, &logs);
    let serialized = serde_json::to_string(&*logs).unwrap();
    let exported = format!("{traces:?}{metrics:?}");
    for secret in [
        "secret-auth-token",
        "secret-prompt-content",
        "query-canary",
        "host-canary",
        "scheme-canary",
        "state-canary",
        "baggage-canary",
        "session-canary",
    ] {
        assert!(!exported.contains(secret));
        assert!(!serialized.contains(secret));
    }
    assert_http_metrics(&metrics);
}

fn assert_operational_traces(traces: &[ResourceSpans], logs: &[Value]) {
    let spans: Vec<_> = traces
        .iter()
        .flat_map(|resource| &resource.scope_spans)
        .flat_map(|scope| &scope.spans)
        .collect();
    assert_eq!(
        spans.len(),
        2,
        "incoming sampling must not control operational tracing"
    );
    assert_ne!(spans[0].trace_id, spans[1].trace_id);
    for span in &spans {
        assert_eq!(span.name, "POST /openai/v1/responses");
        assert!(span.parent_span_id.is_empty());
        assert!(span.trace_state.is_empty());
        assert_eq!(span.kind, 2);
        assert!(
            span.events.is_empty(),
            "log events must not be exported as span events"
        );
    }
    let summaries: Vec<_> = logs
        .iter()
        .filter(|value| value["message"] == "gateway response started")
        .collect();
    assert_eq!(summaries.len(), 2);
    for (summary, span) in summaries.iter().zip(&spans) {
        assert_ne!(summary["trace_id"], "4bf92f3577b34da6a3ce929d0e0e4736");
        assert_eq!(
            summary["trace_id"],
            opentelemetry::trace::TraceId::from_bytes(span.trace_id.as_slice().try_into().unwrap())
                .to_string()
        );
        assert_eq!(
            summary["span_id"],
            opentelemetry::trace::SpanId::from_bytes(span.span_id.as_slice().try_into().unwrap())
                .to_string()
        );
        assert_eq!(summary["status"], 503);
    }
}

fn assert_http_metrics(metrics: &[ResourceMetrics]) {
    let http_duration = metrics
        .iter()
        .flat_map(|resource| &resource.scope_metrics)
        .flat_map(|scope| &scope.metrics)
        .find(|metric| metric.name == "http.server.request.duration")
        .expect("HTTP duration must export even for requests rejected before execution");
    let Some(Data::Histogram(histogram)) = &http_duration.data else {
        panic!("HTTP duration must be a histogram");
    };
    assert_eq!(histogram.data_points.len(), 1);
    let point = &histogram.data_points[0];
    assert_eq!(
        point.count, 2,
        "count includes unsampled requests and excludes health probes"
    );
    assert!(point.sum.unwrap() > 0.0);
    let attributes: std::collections::BTreeMap<_, _> = point
        .attributes
        .iter()
        .map(|attribute| {
            (
                attribute.key.as_str(),
                attribute.value.as_ref().unwrap().value.as_ref().unwrap(),
            )
        })
        .collect();
    assert_eq!(attributes.len(), 3);
    assert_eq!(
        attributes["http.request.method"],
        &AttributeValue::StringValue("POST".into())
    );
    assert_eq!(
        attributes["http.route"],
        &AttributeValue::StringValue("/openai/v1/responses".into())
    );
    assert_eq!(
        attributes["http.response.status_code"],
        &AttributeValue::IntValue(503)
    );
}

#[tokio::test]
async fn an_unresponsive_collector_does_not_extend_the_shutdown_deadline() {
    let app = Router::new().route(
        "/{*path}",
        post(|| async { std::future::pending::<()>().await }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let mut gateway = Gateway::start(&endpoint, "1", "info");
    gateway.request(true).await;
    let start = Instant::now();
    gateway.stop().await;
    assert!(start.elapsed() < Duration::from_secs(2));
    server.abort();
}
