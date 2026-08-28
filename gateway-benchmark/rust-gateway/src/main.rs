mod config;
mod metrics;
mod telemetry;
mod translate;

use anyhow::{Context, Result, anyhow};
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::State,
    http::{HeaderMap, HeaderName, Method, Request, Response, StatusCode, Uri, header},
    response::IntoResponse,
    routing::{get, post},
    serve::ListenerExt,
};
use bytes::Bytes;
use futures_util::{StreamExt, TryStreamExt, stream};
use http_body_util::{BodyExt, Full};
use hyper_util::{
    client::legacy::{Client, connect::HttpConnector},
    rt::TokioExecutor,
};
use serde_json::{Value, json};
use telemetry::{BoxError, ByteStream, HttpClient, ObservedStream, TelemetryEmitter};
use tracing::{info, warn};
use translate::{
    AnthropicSseTranslator, anthropic_response_to_openai, openai_request_to_anthropic,
};

use crate::{config::Config, metrics::Metrics};

const OPENAI_PATH: &str = "/openai/v1/chat/completions";
const ANTHROPIC_PATH: &str = "/anthropic/v1/messages";

#[derive(Clone)]
struct AppState {
    config: Config,
    client: HttpClient,
    metrics: Metrics,
    telemetry: TelemetryEmitter,
}

#[derive(Clone, Copy, Debug)]
enum BenchmarkMode {
    Native,
    Translate,
}

impl BenchmarkMode {
    fn from_headers(headers: &HeaderMap) -> Result<Self> {
        match headers
            .get("x-benchmark-mode")
            .map(|value| value.to_str())
            .transpose()
            .context("x-benchmark-mode must be ASCII")?
            .unwrap_or("native")
        {
            "native" => Ok(Self::Native),
            "translate" => Ok(Self::Translate),
            value => Err(anyhow!(
                "unsupported x-benchmark-mode {value:?}; expected native or translate"
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Native => "native",
            Self::Translate => "translate",
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rust_gateway_benchmark=info".into()),
        )
        .init();

    let config = Config::from_env()?;
    let metrics = Metrics::default();
    let client = build_http_client();
    let otel_url = config
        .otel_url
        .parse::<Uri>()
        .context("OTEL_URL must be a valid HTTP URI")?;
    let telemetry = TelemetryEmitter::start(
        client.clone(),
        otel_url,
        config.telemetry_queue_capacity,
        config.telemetry_batch_max_spans,
        config.telemetry_batch_max_wait,
        config.capture_limit_bytes,
        metrics.clone(),
    );
    let state = AppState {
        config: config.clone(),
        client,
        metrics,
        telemetry,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_handler))
        .route("/v1/chat/completions", post(chat_completions))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", config.port))
        .await
        .with_context(|| format!("failed to bind port {}", config.port))?
        .tap_io(|stream| {
            if let Err(error) = stream.set_nodelay(true) {
                warn!(%error, "failed to set TCP_NODELAY on incoming connection");
            }
        });
    info!(port = config.port, "Rust gateway benchmark listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn build_http_client() -> HttpClient {
    let mut connector = HttpConnector::new();
    connector.set_nodelay(true);
    // Hyper and Undici both have no benchmark-level active connection cap.
    // Keep enough idle connections to avoid measuring reconnect churn.
    Client::builder(TokioExecutor::new())
        .pool_max_idle_per_host(512)
        .build(connector)
}

async fn health() -> &'static str {
    "ok"
}

async fn metrics_handler(State(state): State<AppState>) -> Json<Value> {
    Json(state.metrics.render())
}

async fn chat_completions(State(state): State<AppState>, request: Request<Body>) -> Response<Body> {
    let mut active_request = state.metrics.begin_request();
    let (parts, request_body) = request.into_parts();
    let mode = match BenchmarkMode::from_headers(&parts.headers) {
        Ok(mode) => mode,
        Err(error) => {
            return local_error(
                &state,
                &mut active_request,
                BenchmarkMode::Native,
                &[],
                "unknown",
                StatusCode::BAD_REQUEST,
                &error.to_string(),
            );
        }
    };
    state.metrics.record_mode(mode.as_str());

    // Both implementations deliberately buffer exactly once so the benchmark
    // compares equivalent memory behavior for large base64 JSON payloads.
    let input = match to_bytes(request_body, state.config.body_limit_bytes).await {
        Ok(input) => input,
        Err(error) => {
            return local_error(
                &state,
                &mut active_request,
                mode,
                &[],
                "unknown",
                StatusCode::PAYLOAD_TOO_LARGE,
                &format!("request body exceeded the configured limit: {error}"),
            );
        }
    };
    state.metrics.record_request_bytes(input.len());
    let (model, upstream_path, upstream_body, translate_stream) = match mode {
        BenchmarkMode::Native => (
            extract_model(&input).unwrap_or_else(|| "unknown".to_owned()),
            OPENAI_PATH,
            input.clone(),
            false,
        ),
        BenchmarkMode::Translate => match openai_request_to_anthropic(&input) {
            Ok(translated) => (
                translated.model,
                ANTHROPIC_PATH,
                translated.body,
                translated.stream,
            ),
            Err(error) => {
                return local_error(
                    &state,
                    &mut active_request,
                    mode,
                    &input,
                    "unknown",
                    StatusCode::BAD_REQUEST,
                    &error.to_string(),
                );
            }
        },
    };
    let finalizer = state.telemetry.begin(mode.as_str(), &model, &input);

    let upstream_url = state.config.upstream_url(upstream_path);
    let upstream_uri = match upstream_url.parse::<Uri>() {
        Ok(uri) => uri,
        Err(error) => {
            return local_error_with_finalizer(
                &mut active_request,
                finalizer,
                StatusCode::BAD_GATEWAY,
                &format!("invalid configured upstream URL: {error}"),
            );
        }
    };
    let upstream_request = match build_upstream_request(upstream_uri, &parts.headers, upstream_body)
    {
        Ok(request) => request,
        Err(error) => {
            return local_error_with_finalizer(
                &mut active_request,
                finalizer,
                StatusCode::BAD_GATEWAY,
                &format!("failed to build upstream request: {error}"),
            );
        }
    };

    let upstream_response = match state.client.request(upstream_request).await {
        Ok(response) => response,
        Err(error) => {
            warn!(%error, mode = mode.as_str(), "upstream request failed");
            return local_error_with_finalizer(
                &mut active_request,
                finalizer,
                StatusCode::BAD_GATEWAY,
                &format!("upstream request failed: {error}"),
            );
        }
    };

    match mode {
        BenchmarkMode::Native => native_response(
            upstream_response,
            state.config.capture_limit_bytes,
            finalizer,
            active_request,
        ),
        BenchmarkMode::Translate if translate_stream => translated_streaming_response(
            upstream_response,
            state.config.capture_limit_bytes,
            finalizer,
            active_request,
        ),
        BenchmarkMode::Translate => {
            translated_non_streaming_response(
                upstream_response,
                state.config.body_limit_bytes,
                state.config.capture_limit_bytes,
                finalizer,
                active_request,
            )
            .await
        }
    }
}

fn build_upstream_request(
    uri: Uri,
    original_headers: &HeaderMap,
    body: Bytes,
) -> Result<Request<Full<Bytes>>> {
    let mut request = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .body(Full::new(body))?;
    request.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    request.headers_mut().insert(
        header::ACCEPT,
        original_headers
            .get(header::ACCEPT)
            .cloned()
            .unwrap_or_else(|| header::HeaderValue::from_static("*/*")),
    );
    for name in [
        "x-benchmark-chunks",
        "x-benchmark-chunk-delay-ms",
        "x-benchmark-chunk-bytes",
        "x-benchmark-stream-profile",
    ] {
        if let Some(value) = original_headers.get(name) {
            request.headers_mut().insert(name, value.clone());
        }
    }
    Ok(request)
}

fn native_response(
    upstream: hyper::Response<hyper::body::Incoming>,
    capture_limit: usize,
    finalizer: telemetry::TelemetryFinalizer,
    active_request: metrics::ActiveRequest,
) -> Response<Body> {
    let (parts, body) = upstream.into_parts();
    let stream: ByteStream = Box::pin(
        body.into_data_stream()
            .map_err(|error| -> BoxError { Box::new(error) }),
    );
    observed_response(
        parts.status,
        &parts.headers,
        stream,
        capture_limit,
        finalizer,
        active_request,
        false,
    )
}

fn translated_streaming_response(
    upstream: hyper::Response<hyper::body::Incoming>,
    capture_limit: usize,
    finalizer: telemetry::TelemetryFinalizer,
    active_request: metrics::ActiveRequest,
) -> Response<Body> {
    let (parts, body) = upstream.into_parts();
    if !parts.status.is_success() {
        let stream: ByteStream = Box::pin(
            body.into_data_stream()
                .map_err(|error| -> BoxError { Box::new(error) }),
        );
        return observed_response(
            parts.status,
            &parts.headers,
            stream,
            capture_limit,
            finalizer,
            active_request,
            false,
        );
    }

    let mut upstream_stream = body.into_data_stream();
    let stream = async_stream::try_stream! {
        let mut translator = AnthropicSseTranslator::default();
        while let Some(chunk) = upstream_stream.next().await {
            let chunk = chunk.map_err(|error| -> BoxError { Box::new(error) })?;
            for translated in translator
                .push(&chunk)
                .map_err(|error| -> BoxError { error.into() })?
            {
                yield translated;
            }
        }
        for translated in translator
            .finish()
            .map_err(|error| -> BoxError { error.into() })?
        {
            yield translated;
        }
    };
    observed_response(
        parts.status,
        &parts.headers,
        Box::pin(stream),
        capture_limit,
        finalizer,
        active_request,
        true,
    )
}

async fn translated_non_streaming_response(
    upstream: hyper::Response<hyper::body::Incoming>,
    body_limit: usize,
    capture_limit: usize,
    finalizer: telemetry::TelemetryFinalizer,
    active_request: metrics::ActiveRequest,
) -> Response<Body> {
    let (parts, body) = upstream.into_parts();
    let body = match to_bytes(Body::new(body), body_limit).await {
        Ok(body) => body,
        Err(error) => {
            return local_error_with_finalizer_owned(
                active_request,
                finalizer,
                StatusCode::BAD_GATEWAY,
                &format!("upstream response exceeded the configured limit: {error}"),
            );
        }
    };
    let output = if parts.status.is_success() {
        match anthropic_response_to_openai(&body) {
            Ok(body) => body,
            Err(error) => {
                return local_error_with_finalizer_owned(
                    active_request,
                    finalizer,
                    StatusCode::BAD_GATEWAY,
                    &format!("invalid Anthropic response: {error}"),
                );
            }
        }
    } else {
        body
    };
    let stream: ByteStream = Box::pin(stream::once(async move { Ok::<Bytes, BoxError>(output) }));
    observed_response(
        parts.status,
        &parts.headers,
        stream,
        capture_limit,
        finalizer,
        active_request,
        parts.status.is_success(),
    )
}

fn observed_response(
    status: StatusCode,
    upstream_headers: &HeaderMap,
    stream: ByteStream,
    capture_limit: usize,
    finalizer: telemetry::TelemetryFinalizer,
    active_request: metrics::ActiveRequest,
    translated: bool,
) -> Response<Body> {
    let observed = ObservedStream::new(stream, capture_limit, status, finalizer, active_request);
    let mut response = Response::new(Body::from_stream(observed));
    *response.status_mut() = status;
    copy_response_headers(upstream_headers, response.headers_mut(), translated);
    response
}

fn copy_response_headers(source: &HeaderMap, target: &mut HeaderMap, translated: bool) {
    for (name, value) in source {
        if !is_hop_by_hop(name)
            && *name != header::CONTENT_LENGTH
            && (!translated || *name != header::CONTENT_TYPE)
        {
            target.append(name, value.clone());
        }
    }
    if translated {
        target.insert(
            header::CONTENT_TYPE,
            header::HeaderValue::from_static("text/event-stream"),
        );
        target.insert(
            header::CACHE_CONTROL,
            header::HeaderValue::from_static("no-cache"),
        );
    }
}

fn is_hop_by_hop(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

fn extract_model(input: &[u8]) -> Option<String> {
    serde_json::from_slice::<Value>(input)
        .ok()?
        .get("model")?
        .as_str()
        .map(ToOwned::to_owned)
}

fn local_error(
    state: &AppState,
    active_request: &mut metrics::ActiveRequest,
    mode: BenchmarkMode,
    input: &[u8],
    model: &str,
    status: StatusCode,
    message: &str,
) -> Response<Body> {
    let finalizer = state.telemetry.begin(mode.as_str(), model, input);
    local_error_with_finalizer(active_request, finalizer, status, message)
}

fn local_error_with_finalizer(
    active_request: &mut metrics::ActiveRequest,
    finalizer: telemetry::TelemetryFinalizer,
    status: StatusCode,
    message: &str,
) -> Response<Body> {
    let body = error_body(message);
    finalizer.finish(&body, body.len(), status, Some(message));
    active_request.finish(body.len(), true);
    error_response(status, body)
}

fn local_error_with_finalizer_owned(
    mut active_request: metrics::ActiveRequest,
    finalizer: telemetry::TelemetryFinalizer,
    status: StatusCode,
    message: &str,
) -> Response<Body> {
    local_error_with_finalizer(&mut active_request, finalizer, status, message)
}

fn error_body(message: &str) -> Bytes {
    Bytes::from(
        serde_json::to_vec(&json!({
            "error": {
                "message": message,
                "type": "gateway_benchmark_error"
            }
        }))
        .unwrap_or_else(|_| b"{\"error\":{\"message\":\"gateway error\"}}".to_vec()),
    )
}

fn error_response(status: StatusCode, body: Bytes) -> Response<Body> {
    (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
