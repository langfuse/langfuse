//! Deterministic OpenAI-compatible Chat Completions upstream for gateway benchmarks.
//!
//! Every streamed response carries the mock's own clock readings so the load
//! generator can compute gateway overhead without joining logs:
//! - chunk `id` is `chatcmpl-<headers_ns>-<body_ns>`: when the request headers
//!   reached the handler and when its body was fully read (Unix nanoseconds).
//! - chunk `system_fingerprint` is `fp_<sent_ns>`: when this chunk was written.
//!
//! The mock, gateway and load generator run on one host, so they share a clock.

use std::net::SocketAddr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use bytes::Bytes;
use clap::Parser;
use tokio::time::Instant;
use tokio_stream::wrappers::ReceiverStream;

#[derive(Parser, Clone, Debug)]
struct Config {
    /// Delay from the request body being read to the first chunk.
    #[arg(long, env = "MOCK_TTFT_MS", default_value_t = 20)]
    ttft_ms: u64,
    /// Delay between consecutive content chunks.
    #[arg(long, env = "MOCK_CHUNK_DELAY_MS", default_value_t = 10)]
    chunk_delay_ms: u64,
    /// Number of content chunks before the finish and usage chunks.
    #[arg(long, env = "MOCK_CHUNKS", default_value_t = 20)]
    chunks: usize,
    /// When non-zero, answer every request with this status and an OpenAI error body.
    #[arg(long, env = "MOCK_FAIL_STATUS", default_value_t = 0)]
    fail_status: u16,
    #[arg(long, env = "MOCK_HTTPS_ADDR", default_value = "0.0.0.0:443")]
    https_addr: SocketAddr,
    #[arg(long, env = "MOCK_HTTP_ADDR", default_value = "0.0.0.0:8000")]
    http_addr: SocketAddr,
    #[arg(long, env = "MOCK_TLS_CERT", default_value = "/certs/upstream.crt")]
    tls_cert: String,
    #[arg(long, env = "MOCK_TLS_KEY", default_value = "/certs/upstream.key")]
    tls_key: String,
}

const WORDS: &[&str] = &[
    "I'll", "update", "the", "handler", "so", "the", "retry", "loop", "respects", "the",
    "configured", "deadline.", "First,", "read", "`src/server.rs`", "to", "confirm", "where",
    "the", "timeout", "is", "applied,", "then", "patch", "`with_backoff`", "and", "add", "a",
    "regression", "test", "covering", "the", "cancelled", "stream", "case.",
];

fn now_ns() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

fn content_chunk(id: &str, model: &str, content: &str, sent_ns: u128) -> String {
    let delta = serde_json::json!({ "content": content });
    format!(
        "data: {{\"id\":\"{id}\",\"object\":\"chat.completion.chunk\",\"created\":1700000000,\"model\":\"{model}\",\"system_fingerprint\":\"fp_{sent_ns}\",\"choices\":[{{\"index\":0,\"delta\":{delta},\"logprobs\":null,\"finish_reason\":null}}],\"usage\":null}}\n\n"
    )
}

async fn chat_completions(State(config): State<Config>, request: Request) -> Response {
    let headers_ns = now_ns();
    let body = match axum::body::to_bytes(request.into_body(), 64 * 1024 * 1024).await {
        Ok(body) => body,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };
    let body_ns = now_ns();
    let body_read = Instant::now();

    if config.fail_status != 0 {
        let status = StatusCode::from_u16(config.fail_status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let error = serde_json::json!({"error": {"message": "mock failure", "type": "server_error", "param": null, "code": null}});
        let mut response = (status, error.to_string()).into_response();
        response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
        return response;
    }

    let model = "gpt-4.1-mini-2025-04-14";
    let id = format!("chatcmpl-{headers_ns}-{body_ns}");
    let prompt_tokens = body.len() / 4;
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Bytes, std::io::Error>>(4);
    let chunks = config.chunks;
    let ttft = Duration::from_millis(config.ttft_ms);
    let delay = Duration::from_millis(config.chunk_delay_ms);

    tokio::spawn(async move {
        let role = format!(
            "data: {{\"id\":\"{id}\",\"object\":\"chat.completion.chunk\",\"created\":1700000000,\"model\":\"{model}\",\"system_fingerprint\":\"fp_{}\",\"choices\":[{{\"index\":0,\"delta\":{{\"role\":\"assistant\",\"content\":\"\",\"refusal\":null}},\"logprobs\":null,\"finish_reason\":null}}],\"usage\":null}}\n\n",
            now_ns()
        );
        if tx.send(Ok(Bytes::from(role))).await.is_err() {
            return;
        }
        let mut completion_tokens = 0;
        for index in 0..chunks {
            tokio::time::sleep_until(body_read + ttft + delay * index as u32).await;
            let start = (index * 3) % WORDS.len();
            let words: Vec<&str> = (0..3).map(|offset| WORDS[(start + offset) % WORDS.len()]).collect();
            let content = format!("{} ", words.join(" "));
            completion_tokens += 4;
            let chunk = content_chunk(&id, model, &content, now_ns());
            if tx.send(Ok(Bytes::from(chunk))).await.is_err() {
                return;
            }
        }
        let finish = format!(
            "data: {{\"id\":\"{id}\",\"object\":\"chat.completion.chunk\",\"created\":1700000000,\"model\":\"{model}\",\"system_fingerprint\":\"fp_{}\",\"choices\":[{{\"index\":0,\"delta\":{{}},\"logprobs\":null,\"finish_reason\":\"stop\"}}],\"usage\":null}}\n\n",
            now_ns()
        );
        let usage = format!(
            "data: {{\"id\":\"{id}\",\"object\":\"chat.completion.chunk\",\"created\":1700000000,\"model\":\"{model}\",\"system_fingerprint\":\"fp_{}\",\"choices\":[],\"usage\":{{\"prompt_tokens\":{prompt_tokens},\"completion_tokens\":{completion_tokens},\"total_tokens\":{},\"prompt_tokens_details\":{{\"cached_tokens\":0,\"audio_tokens\":0}},\"completion_tokens_details\":{{\"reasoning_tokens\":0,\"audio_tokens\":0,\"accepted_prediction_tokens\":0,\"rejected_prediction_tokens\":0}}}}}}\n\ndata: [DONE]\n\n",
            now_ns(),
            prompt_tokens + completion_tokens
        );
        let _ = tx.send(Ok(Bytes::from(finish))).await;
        let _ = tx.send(Ok(Bytes::from(usage))).await;
    });

    let mut response = Response::new(Body::from_stream(ReceiverStream::new(rx)));
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/event-stream; charset=utf-8"));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    headers.insert("x-request-id", HeaderValue::from_static("req_mock"));
    headers.insert("openai-processing-ms", HeaderValue::from_static("1"));
    response
}

async fn models() -> Response {
    let body = r#"{"object":"list","data":[{"id":"gpt-4.1-mini","object":"model","created":1700000000,"owned_by":"system"}]}"#;
    let mut response = body.into_response();
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
    response
}

/// Linux copies `TCP_NODELAY` from the listening socket to accepted sockets.
/// Without it, Nagle's algorithm holds the first content chunk until the client's
/// delayed ACK (~40 ms) and the mock itself would distort every latency figure.
fn nodelay_listener(addr: SocketAddr) -> std::io::Result<std::net::TcpListener> {
    let socket = if addr.is_ipv4() { tokio::net::TcpSocket::new_v4()? } else { tokio::net::TcpSocket::new_v6()? };
    socket.set_reuseaddr(true)?;
    socket.set_nodelay(true)?;
    socket.bind(addr)?;
    let listener = socket.listen(4096)?.into_std()?;
    listener.set_nonblocking(true)?;
    Ok(listener)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    let config = Config::parse();
    eprintln!("mock-upstream config: {config:?}");
    let app = Router::new()
        .route("/v1/chat/completions", post(chat_completions))
        .route("/v1/models", get(models))
        .route("/health", get(|| async { "ok" }))
        .with_state(config.clone());

    let tls = axum_server::tls_rustls::RustlsConfig::from_pem_file(&config.tls_cert, &config.tls_key).await?;
    let https = axum_server::from_tcp_rustls(nodelay_listener(config.https_addr)?, tls)
        .serve(app.clone().into_make_service());
    let http = axum::serve(tokio::net::TcpListener::from_std(nodelay_listener(config.http_addr)?)?, app);
    tokio::select! {
        result = https => result?,
        result = http => result?,
    }
    Ok(())
}
