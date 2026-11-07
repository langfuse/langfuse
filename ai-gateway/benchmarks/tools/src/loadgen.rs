//! Streaming Chat Completions load generator.
//!
//! Sends one request body repeatedly from a fixed number of concurrent workers
//! (closed loop) or as a single burst, reads every SSE chunk and joins the
//! client's clock with the mock upstream's clock stamps (see `mock.rs`).

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bytes::Bytes;
use clap::Parser;
use futures_util::StreamExt;
use serde::Serialize;
use tokio::sync::Barrier;
use tokio::time::Instant;

#[derive(Parser, Clone, Debug)]
struct Args {
    /// Full Chat Completions URL, e.g. http://ai-gateway:8080/openai/v1/chat/completions.
    #[arg(long)]
    url: String,
    #[arg(long, env = "BENCH_API_KEY", default_value = "sk-bench")]
    api_key: String,
    /// Extra request header as `name: value`; repeatable, or comma-separated in
    /// BENCH_HEADERS (e.g. a gateway's provider-selection header).
    #[arg(long = "header", env = "BENCH_HEADERS", value_delimiter = ',')]
    headers: Vec<String>,
    /// JSON request body; sent unchanged on every request.
    #[arg(long, default_value = "/payload/payload.json")]
    payload: String,
    /// Concurrent in-flight requests (closed loop: each worker sends back to back).
    #[arg(long, default_value_t = 10)]
    concurrency: usize,
    /// Measured duration in seconds (closed loop).
    #[arg(long, default_value_t = 30.0)]
    duration: f64,
    /// Unmeasured warmup in seconds before the measured window (closed loop).
    #[arg(long, default_value_t = 5.0)]
    warmup: f64,
    /// Send this many requests at the same instant instead of a closed loop.
    #[arg(long)]
    burst: Option<usize>,
    /// Repeat the burst this many times, waiting for each to finish.
    #[arg(long, default_value_t = 1)]
    burst_rounds: usize,
    /// Pause per worker between requests, in milliseconds.
    #[arg(long, default_value_t = 0)]
    think_ms: u64,
    /// Extra PEM root certificate to trust (the mock upstream CA for direct runs).
    #[arg(long)]
    ca: Option<String>,
    /// Per-request timeout in seconds.
    #[arg(long, default_value_t = 120)]
    timeout: u64,
    #[arg(long, default_value = "run")]
    label: String,
    /// Summary JSON output path; also printed to stdout.
    #[arg(long)]
    out: Option<String>,
}

fn now_ns() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

#[derive(Default)]
struct Sample {
    started: Option<Instant>,
    status: u16,
    error: Option<String>,
    pre_upstream_ms: Option<f64>,
    upstream_body_ms: Option<f64>,
    ttfb_ms: Option<f64>,
    ttft_ms: Option<f64>,
    total_ms: f64,
    chunk_lag_ms: Vec<f64>,
    chunk_gap_ms: Vec<f64>,
    chunks: usize,
    complete: bool,
}

fn ms_between(later: u128, earlier: u128) -> f64 {
    (later as f64 - earlier as f64) / 1_000_000.0
}

fn parse_number_after(haystack: &[u8], needle: &[u8]) -> Option<(u128, usize)> {
    let start = memchr::memmem::find(haystack, needle)? + needle.len();
    let digits = haystack[start..].iter().take_while(|b| b.is_ascii_digit()).count();
    let text = std::str::from_utf8(&haystack[start..start + digits]).ok()?;
    Some((text.parse().ok()?, start + digits))
}

async fn send_one(client: &reqwest::Client, args: &Args, body: Bytes) -> Sample {
    let mut sample = Sample { started: Some(Instant::now()), ..Sample::default() };
    let started = Instant::now();
    let t0 = now_ns();
    let mut request = client
        .post(&args.url)
        .bearer_auth(&args.api_key)
        .header("content-type", "application/json")
        .header("user-agent", "langfuse-gateway-bench/1.0");
    for header in &args.headers {
        if let Some((name, value)) = header.split_once(':') {
            request = request.header(name.trim(), value.trim());
        }
    }
    let response = request.body(body).send().await;
    let response = match response {
        Ok(response) => response,
        Err(error) => {
            sample.error = Some(if error.is_timeout() { "timeout".into() } else { "transport".into() });
            sample.total_ms = started.elapsed().as_secs_f64() * 1000.0;
            return sample;
        }
    };
    sample.ttfb_ms = Some(ms_between(now_ns(), t0));
    sample.status = response.status().as_u16();
    if !response.status().is_success() {
        let _ = response.bytes().await;
        sample.total_ms = started.elapsed().as_secs_f64() * 1000.0;
        return sample;
    }

    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::with_capacity(8192);
    let mut last_recv: Option<u128> = None;
    while let Some(next) = stream.next().await {
        let chunk = match next {
            Ok(chunk) => chunk,
            Err(_) => {
                sample.error = Some("stream".into());
                break;
            }
        };
        let recv_ns = now_ns();
        buffer.extend_from_slice(&chunk);
        while let Some(end) = memchr::memmem::find(&buffer, b"\n\n") {
            let event: Vec<u8> = buffer.drain(..end + 2).collect();
            if memchr::memmem::find(&event, b"data: [DONE]").is_some() {
                sample.complete = true;
                continue;
            }
            if sample.pre_upstream_ms.is_none() {
                if let Some((headers_ns, offset)) = parse_number_after(&event, b"\"id\":\"chatcmpl-") {
                    sample.pre_upstream_ms = Some(ms_between(headers_ns, t0));
                    if let Some((body_ns, _)) = parse_number_after(&event[offset..], b"-") {
                        sample.upstream_body_ms = Some(ms_between(body_ns, headers_ns));
                    }
                }
            }
            if let Some((sent_ns, _)) = parse_number_after(&event, b"\"system_fingerprint\":\"fp_") {
                sample.chunk_lag_ms.push(ms_between(recv_ns, sent_ns));
            }
            let has_content = memchr::memmem::find(&event, b"\"content\":\"").is_some()
                && memchr::memmem::find(&event, b"\"content\":\"\"").is_none();
            if has_content {
                if sample.ttft_ms.is_none() {
                    sample.ttft_ms = Some(ms_between(recv_ns, t0));
                }
                if let Some(previous) = last_recv {
                    sample.chunk_gap_ms.push(ms_between(recv_ns, previous));
                }
                last_recv = Some(recv_ns);
                sample.chunks += 1;
            }
        }
    }
    if !sample.complete && sample.error.is_none() {
        sample.error = Some("incomplete".into());
    }
    sample.total_ms = started.elapsed().as_secs_f64() * 1000.0;
    sample
}

#[derive(Serialize)]
struct Stats {
    n: usize,
    mean: f64,
    p50: f64,
    p90: f64,
    p99: f64,
    p999: f64,
    max: f64,
}

fn stats(mut values: Vec<f64>) -> Option<Stats> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(|a, b| a.total_cmp(b));
    let rank = |q: f64| values[((q * values.len() as f64).ceil() as usize).clamp(1, values.len()) - 1];
    Some(Stats {
        n: values.len(),
        mean: values.iter().sum::<f64>() / values.len() as f64,
        p50: rank(0.50),
        p90: rank(0.90),
        p99: rank(0.99),
        p999: rank(0.999),
        max: *values.last().unwrap_or(&0.0),
    })
}

#[derive(Serialize)]
struct Summary {
    label: String,
    url: String,
    mode: String,
    concurrency: usize,
    payload_bytes: usize,
    measured_seconds: f64,
    requests: usize,
    ok: usize,
    errors: BTreeMap<String, usize>,
    error_rate: f64,
    ok_rps: f64,
    chunks_per_second: f64,
    metrics: BTreeMap<String, Option<Stats>>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    let args = Arc::new(Args::parse());
    let body = Bytes::from(std::fs::read(&args.payload)?);
    let payload_bytes = body.len();
    let workers = args.burst.unwrap_or(args.concurrency);

    let mut builder = reqwest::Client::builder()
        .http1_only()
        .tcp_nodelay(true)
        .pool_max_idle_per_host(workers + 16)
        .timeout(Duration::from_secs(args.timeout));
    if let Some(path) = &args.ca {
        builder = builder.add_root_certificate(reqwest::Certificate::from_pem(&std::fs::read(path)?)?);
    }
    let client = builder.build()?;

    let (samples, measured_seconds, mode) = if let Some(burst) = args.burst {
        let mut all = Vec::new();
        let mut wall = 0.0;
        for _ in 0..args.burst_rounds {
            let barrier = Arc::new(Barrier::new(burst));
            let round_start = Instant::now();
            let tasks: Vec<_> = (0..burst)
                .map(|_| {
                    let client = client.clone();
                    let args = args.clone();
                    let body = body.clone();
                    let barrier = barrier.clone();
                    tokio::spawn(async move {
                        barrier.wait().await;
                        send_one(&client, &args, body).await
                    })
                })
                .collect();
            for task in tasks {
                all.push(task.await?);
            }
            wall += round_start.elapsed().as_secs_f64();
        }
        (all, wall, format!("burst x{}", args.burst_rounds))
    } else {
        let begin = Instant::now();
        let measure_from = begin + Duration::from_secs_f64(args.warmup);
        let end = measure_from + Duration::from_secs_f64(args.duration);
        let tasks: Vec<_> = (0..args.concurrency)
            .map(|_| {
                let client = client.clone();
                let args = args.clone();
                let body = body.clone();
                tokio::spawn(async move {
                    let mut local = Vec::new();
                    while Instant::now() < end {
                        let sample = send_one(&client, &args, body.clone()).await;
                        if sample.started.is_some_and(|s| s >= measure_from && s < end) {
                            local.push(sample);
                        }
                        if args.think_ms > 0 {
                            tokio::time::sleep(Duration::from_millis(args.think_ms)).await;
                        }
                    }
                    local
                })
            })
            .collect();
        let mut all = Vec::new();
        for task in tasks {
            all.extend(task.await?);
        }
        (all, args.duration, "closed-loop".to_string())
    };

    let mut errors = BTreeMap::new();
    let mut ok = 0;
    let mut chunks = 0;
    let mut metrics: BTreeMap<&str, Vec<f64>> = BTreeMap::new();
    for sample in &samples {
        let failed = sample.error.is_some() || !(200..300).contains(&sample.status);
        if failed {
            let key = sample.error.clone().unwrap_or_else(|| sample.status.to_string());
            *errors.entry(key).or_insert(0) += 1;
            metrics.entry("error_total_ms").or_default().push(sample.total_ms);
            continue;
        }
        ok += 1;
        chunks += sample.chunks;
        let mut push = |name: &'static str, value: Option<f64>| {
            if let Some(value) = value {
                metrics.entry(name).or_default().push(value);
            }
        };
        push("pre_upstream_ms", sample.pre_upstream_ms);
        push("upstream_body_ms", sample.upstream_body_ms);
        push("ttfb_ms", sample.ttfb_ms);
        push("ttft_ms", sample.ttft_ms);
        push("total_ms", Some(sample.total_ms));
        metrics.entry("chunk_lag_ms").or_default().extend(&sample.chunk_lag_ms);
        metrics.entry("chunk_gap_ms").or_default().extend(&sample.chunk_gap_ms);
    }
    let requests = samples.len();
    let summary = Summary {
        label: args.label.clone(),
        url: args.url.clone(),
        mode,
        concurrency: workers,
        payload_bytes,
        measured_seconds,
        requests,
        ok,
        error_rate: if requests == 0 { 0.0 } else { (requests - ok) as f64 / requests as f64 },
        errors,
        ok_rps: ok as f64 / measured_seconds,
        chunks_per_second: chunks as f64 / measured_seconds,
        metrics: metrics.into_iter().map(|(k, v)| (k.to_string(), stats(v))).collect(),
    };
    let json = serde_json::to_string_pretty(&summary)?;
    if let Some(path) = &args.out {
        std::fs::write(path, &json)?;
    }
    println!("{json}");
    Ok(())
}
