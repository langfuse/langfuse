use std::{
    env, fmt, process,
    str::FromStr,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::{Request, StatusCode, Uri};
use hyper_util::{
    client::legacy::{Client, connect::HttpConnector},
    rt::TokioExecutor,
};
use serde_json::{Value, json};
use tokio::time::{Instant, sleep_until, timeout};

type HttpClient = Client<HttpConnector, Full<Bytes>>;

const MAX_ERROR_SAMPLES: usize = 10;
const MAX_ERROR_BODY_SAMPLE_BYTES: usize = 1_024;

#[derive(Clone, Copy)]
enum Mode {
    Native,
    Translate,
}

impl Mode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Native => "native",
            Self::Translate => "translate",
        }
    }
}

impl FromStr for Mode {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "native" => Ok(Self::Native),
            "translate" => Ok(Self::Translate),
            _ => Err("mode must be native or translate".to_string()),
        }
    }
}

impl fmt::Display for Mode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Clone, Copy)]
enum PayloadProfile {
    Basic,
    CodingAgentSmall,
    CodingAgentLarge,
    CodingAgentMedia,
    CodingAgentMix,
}

impl PayloadProfile {
    fn as_str(self) -> &'static str {
        match self {
            Self::Basic => "basic",
            Self::CodingAgentSmall => "coding-agent-small",
            Self::CodingAgentLarge => "coding-agent-large",
            Self::CodingAgentMedia => "coding-agent-media",
            Self::CodingAgentMix => "coding-agent-mix",
        }
    }
}

impl FromStr for PayloadProfile {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "basic" => Ok(Self::Basic),
            "coding-agent-small" => Ok(Self::CodingAgentSmall),
            "coding-agent-large" => Ok(Self::CodingAgentLarge),
            "coding-agent-media" => Ok(Self::CodingAgentMedia),
            "coding-agent-mix" => Ok(Self::CodingAgentMix),
            _ => Err(
                "payload profile must be basic, coding-agent-small, coding-agent-large, coding-agent-media, or coding-agent-mix"
                    .to_string(),
            ),
        }
    }
}

#[derive(Clone, Copy)]
enum StreamProfile {
    Text,
    CodingAgent,
}

impl StreamProfile {
    fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::CodingAgent => "coding-agent",
        }
    }
}

impl FromStr for StreamProfile {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "text" => Ok(Self::Text),
            "coding-agent" => Ok(Self::CodingAgent),
            _ => Err("stream profile must be text or coding-agent".to_string()),
        }
    }
}

#[derive(Clone)]
struct Config {
    url: String,
    label: String,
    mode: Mode,
    concurrency: usize,
    duration: Duration,
    payload_bytes: usize,
    payload_profile: PayloadProfile,
    stream_profile: StreamProfile,
    chunks: usize,
    chunk_delay_ms: u64,
    chunk_bytes: usize,
    start_spread_ms: u64,
    allow_errors: bool,
}

impl Config {
    fn from_env_and_args() -> Result<Self, String> {
        let mut config = Self {
            url: env_value("BENCHMARK_URL", "http://localhost:3000/v1/chat/completions"),
            label: env_value("BENCHMARK_LABEL", "gateway"),
            mode: env_value("BENCHMARK_MODE", "native").parse()?,
            concurrency: parse_number(
                "BENCHMARK_CONCURRENCY",
                &env_value("BENCHMARK_CONCURRENCY", "32"),
            )?,
            duration: Duration::from_secs(parse_number(
                "BENCHMARK_DURATION_SECONDS",
                &env_value("BENCHMARK_DURATION_SECONDS", "10"),
            )?),
            payload_bytes: parse_number(
                "BENCHMARK_PAYLOAD_BYTES",
                &env_value("BENCHMARK_PAYLOAD_BYTES", "0"),
            )?,
            payload_profile: env_value("BENCHMARK_PAYLOAD_PROFILE", "basic").parse()?,
            stream_profile: env_value("BENCHMARK_STREAM_PROFILE", "text").parse()?,
            chunks: parse_number("BENCHMARK_CHUNKS", &env_value("BENCHMARK_CHUNKS", "20"))?,
            chunk_delay_ms: parse_number(
                "BENCHMARK_CHUNK_DELAY_MS",
                &env_value("BENCHMARK_CHUNK_DELAY_MS", "10"),
            )?,
            chunk_bytes: parse_number(
                "BENCHMARK_CHUNK_BYTES",
                &env_value("BENCHMARK_CHUNK_BYTES", "128"),
            )?,
            start_spread_ms: 0,
            allow_errors: false,
        };

        let args = env::args().skip(1).collect::<Vec<_>>();
        let mut index = 0;
        while index < args.len() {
            let flag = &args[index];
            if flag == "--help" || flag == "-h" {
                print_help();
                process::exit(0);
            }
            if flag == "--allow-errors" {
                config.allow_errors = true;
                index += 1;
                continue;
            }
            let value = args
                .get(index + 1)
                .ok_or_else(|| format!("missing value for {flag}"))?;
            match flag.as_str() {
                "--url" => config.url = value.clone(),
                "--label" => config.label = value.clone(),
                "--mode" => config.mode = value.parse()?,
                "--concurrency" => config.concurrency = parse_number(flag, value)?,
                "--duration-seconds" => {
                    config.duration = Duration::from_secs(parse_number(flag, value)?)
                }
                "--payload-bytes" => config.payload_bytes = parse_number(flag, value)?,
                "--payload-profile" => config.payload_profile = value.parse()?,
                "--stream-profile" => config.stream_profile = value.parse()?,
                "--chunks" => config.chunks = parse_number(flag, value)?,
                "--chunk-delay-ms" => config.chunk_delay_ms = parse_number(flag, value)?,
                "--chunk-bytes" => config.chunk_bytes = parse_number(flag, value)?,
                "--start-spread-ms" => config.start_spread_ms = parse_number(flag, value)?,
                _ => return Err(format!("unknown argument: {flag}")),
            }
            index += 2;
        }

        config.validate()?;
        Ok(config)
    }

    fn validate(&self) -> Result<(), String> {
        let uri: Uri = self
            .url
            .parse()
            .map_err(|error| format!("invalid --url: {error}"))?;
        if uri.scheme_str() != Some("http") || uri.authority().is_none() {
            return Err("--url must be an absolute http:// URL".to_string());
        }
        if self.label.is_empty() {
            return Err("--label must not be empty".to_string());
        }
        if self.concurrency == 0 {
            return Err("--concurrency must be greater than zero".to_string());
        }
        if self.duration.is_zero() {
            return Err("--duration-seconds must be greater than zero".to_string());
        }
        if self.chunks == 0 {
            return Err("--chunks must be greater than zero".to_string());
        }
        if self.chunk_bytes == 0 {
            return Err("--chunk-bytes must be greater than zero".to_string());
        }
        Ok(())
    }

    fn request_timeout(&self) -> Duration {
        let expected_stream_ms = self.chunk_delay_ms.saturating_mul(self.chunks as u64);
        Duration::from_millis(expected_stream_ms.saturating_mul(3).saturating_add(5_000))
            .max(Duration::from_secs(30))
    }
}

#[derive(Default)]
struct WorkerStats {
    ttft_micros: Vec<u64>,
    completion_micros: Vec<u64>,
    errors: usize,
    error_samples: Vec<String>,
    completed_by_fixture: Vec<usize>,
}

impl WorkerStats {
    fn record_error(&mut self, error: impl Into<String>) {
        self.errors += 1;
        self.add_error_sample(error.into());
    }

    fn add_error_sample(&mut self, error: String) {
        if self.error_samples.len() < MAX_ERROR_SAMPLES
            && !self.error_samples.iter().any(|existing| existing == &error)
        {
            self.error_samples.push(error);
        }
    }

    fn merge(&mut self, other: Self) {
        self.ttft_micros.extend(other.ttft_micros);
        self.completion_micros.extend(other.completion_micros);
        self.errors += other.errors;
        for error in other.error_samples {
            self.add_error_sample(error);
        }
        if self.completed_by_fixture.len() < other.completed_by_fixture.len() {
            self.completed_by_fixture
                .resize(other.completed_by_fixture.len(), 0);
        }
        for (index, count) in other.completed_by_fixture.into_iter().enumerate() {
            self.completed_by_fixture[index] += count;
        }
    }
}

struct RequestMeasurement {
    ttft: Duration,
    completion: Duration,
    fixture_index: usize,
}

struct PayloadFixture {
    name: &'static str,
    body: Bytes,
}

struct PayloadSet {
    fixtures: Vec<PayloadFixture>,
    schedule: Vec<usize>,
}

impl PayloadSet {
    fn select(&self, sequence: u64) -> (usize, &PayloadFixture) {
        let fixture_index = self.schedule[sequence as usize % self.schedule.len()];
        (fixture_index, &self.fixtures[fixture_index])
    }
}

#[tokio::main]
async fn main() {
    let config = match Config::from_env_and_args() {
        Ok(config) => Arc::new(config),
        Err(error) => {
            eprintln!("error: {error}");
            eprintln!("run with --help for usage");
            process::exit(2);
        }
    };

    let payloads = Arc::new(build_payloads(config.payload_profile, config.payload_bytes));
    let request_sequence = Arc::new(AtomicU64::new(0));
    let mut connector = HttpConnector::new();
    connector.set_nodelay(true);
    let client: HttpClient = Client::builder(TokioExecutor::new())
        .pool_idle_timeout(Duration::from_secs(60))
        .build(connector);

    let benchmark_started = Instant::now();
    let deadline =
        benchmark_started + Duration::from_millis(config.start_spread_ms) + config.duration;
    let mut handles = Vec::with_capacity(config.concurrency);

    for worker_index in 0..config.concurrency {
        let start_at = benchmark_started
            + worker_start_delay(worker_index, config.concurrency, config.start_spread_ms);
        handles.push(tokio::spawn(run_worker(
            Arc::clone(&config),
            Arc::clone(&payloads),
            Arc::clone(&request_sequence),
            client.clone(),
            start_at,
            deadline,
        )));
    }

    let mut stats = WorkerStats::default();
    for handle in handles {
        match handle.await {
            Ok(worker_stats) => stats.merge(worker_stats),
            Err(error) => stats.record_error(format!("worker join failure: {error}")),
        }
    }

    let elapsed = benchmark_started.elapsed();
    let failed = benchmark_failed(&config, &stats);
    print_results(&config, stats, elapsed, &payloads);
    if failed {
        process::exit(1);
    }
}

async fn run_worker(
    config: Arc<Config>,
    payloads: Arc<PayloadSet>,
    request_sequence: Arc<AtomicU64>,
    client: HttpClient,
    start_at: Instant,
    deadline: Instant,
) -> WorkerStats {
    let mut stats = WorkerStats {
        completed_by_fixture: vec![0; payloads.fixtures.len()],
        ..WorkerStats::default()
    };

    sleep_until(start_at).await;

    while Instant::now() < deadline {
        let sequence = request_sequence.fetch_add(1, Ordering::Relaxed);
        let (fixture_index, fixture) = payloads.select(sequence);
        let result = timeout(
            config.request_timeout(),
            execute_request(&config, fixture_index, &fixture.body, &client),
        )
        .await;

        match result {
            Ok(Ok(measurement)) => {
                stats.ttft_micros.push(duration_to_micros(measurement.ttft));
                stats
                    .completion_micros
                    .push(duration_to_micros(measurement.completion));
                stats.completed_by_fixture[measurement.fixture_index] += 1;
            }
            Ok(Err(error)) => stats.record_error(format!("request error: {error}")),
            Err(_) => stats.record_error(format!(
                "request timeout after {} ms",
                config.request_timeout().as_millis()
            )),
        }
    }

    stats
}

async fn execute_request(
    config: &Config,
    fixture_index: usize,
    payload: &Bytes,
    client: &HttpClient,
) -> Result<RequestMeasurement, String> {
    let request = Request::post(&config.url)
        .header("content-type", "application/json")
        .header("accept", "text/event-stream")
        .header("content-length", payload.len())
        .header("x-benchmark-mode", config.mode.as_str())
        .header("x-benchmark-chunks", config.chunks)
        .header("x-benchmark-chunk-delay-ms", config.chunk_delay_ms)
        .header("x-benchmark-chunk-bytes", config.chunk_bytes)
        .header("x-benchmark-stream-profile", config.stream_profile.as_str())
        .body(Full::new(payload.clone()))
        .map_err(|error| format!("failed to build request: {error}"))?;

    let started = Instant::now();
    let mut response = client
        .request(request)
        .await
        .map_err(|error| format!("request failed: {error}"))?;

    if response.status() != StatusCode::OK {
        let status = response.status();
        let message = match response.into_body().collect().await {
            Ok(body) => format!(
                "unexpected status: {status}; body: {}",
                error_body_sample(&body.to_bytes())
            ),
            Err(error) => {
                format!("unexpected status: {status}; failed to read error body: {error}")
            }
        };
        return Err(message);
    }

    let mut pending = Vec::new();
    let mut ttft = None;
    let mut completion = None;
    let mut content_chunks = 0_usize;
    let mut content_bytes = 0_usize;
    let mut finish_chunks = 0_usize;
    let mut done_events = 0_usize;

    while let Some(frame) = response.body_mut().frame().await {
        let frame = frame.map_err(|error| format!("response stream failed: {error}"))?;
        let Some(data) = frame.data_ref() else {
            continue;
        };
        pending.extend_from_slice(data);

        while let Some((event_end, delimiter_len)) = find_event_end(&pending) {
            let is_empty = event_end == 0;
            let event = pending[..event_end].to_vec();
            pending.drain(..event_end + delimiter_len);
            if is_empty {
                continue;
            }
            ttft.get_or_insert_with(|| started.elapsed());
            let Some(data) = event_data(&event) else {
                continue;
            };
            if data == "[DONE]" {
                done_events += 1;
                completion.get_or_insert_with(|| started.elapsed());
                continue;
            }

            let chunk: Value = serde_json::from_str(&data)
                .map_err(|error| format!("invalid OpenAI SSE JSON: {error}"))?;
            if let Some(content) = chunk
                .pointer("/choices/0/delta/content")
                .and_then(Value::as_str)
                && !content.is_empty()
            {
                content_chunks += 1;
                content_bytes += content.len();
            }
            if let Some(arguments) = chunk
                .pointer("/choices/0/delta/tool_calls/0/function/arguments")
                .and_then(Value::as_str)
                && !arguments.is_empty()
            {
                content_chunks += 1;
                content_bytes += arguments.len();
            }
            if chunk
                .pointer("/choices/0/finish_reason")
                .is_some_and(|reason| !reason.is_null())
            {
                finish_chunks += 1;
            }
        }
    }

    if pending.iter().any(|byte| !byte.is_ascii_whitespace()) {
        return Err("stream ended with an incomplete SSE event".to_string());
    }
    let ttft = ttft.ok_or_else(|| "stream contained no complete SSE event".to_string())?;
    let completion = completion.ok_or_else(|| "stream did not contain [DONE]".to_string())?;
    let expected_content_bytes = config.chunks.saturating_mul(config.chunk_bytes);
    if content_chunks != config.chunks
        || content_bytes != expected_content_bytes
        || finish_chunks != 1
        || done_events != 1
    {
        return Err(format!(
            "invalid stream: content_chunks={content_chunks}/{} content_bytes={content_bytes}/{expected_content_bytes} finish_chunks={finish_chunks}/1 done_events={done_events}/1",
            config.chunks,
        ));
    }
    Ok(RequestMeasurement {
        ttft,
        completion,
        fixture_index,
    })
}

fn find_event_end(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = buffer.windows(2).position(|window| window == b"\n\n");
    let crlf = buffer.windows(4).position(|window| window == b"\r\n\r\n");

    match (lf, crlf) {
        (Some(lf), Some(crlf)) if lf <= crlf => Some((lf, 2)),
        (Some(_), Some(crlf)) => Some((crlf, 4)),
        (Some(lf), None) => Some((lf, 2)),
        (None, Some(crlf)) => Some((crlf, 4)),
        (None, None) => None,
    }
}

fn event_data(event: &[u8]) -> Option<String> {
    let value = String::from_utf8_lossy(event);
    let lines = value
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .collect::<Vec<_>>();
    (!lines.is_empty()).then(|| lines.join("\n"))
}

fn error_body_sample(body: &[u8]) -> String {
    if body.is_empty() {
        return "<empty>".to_string();
    }
    let truncated = body.len() > MAX_ERROR_BODY_SAMPLE_BYTES;
    let sample = &body[..body.len().min(MAX_ERROR_BODY_SAMPLE_BYTES)];
    let mut output = String::from_utf8_lossy(sample)
        .replace('\r', " ")
        .replace('\n', " ");
    if truncated {
        output.push_str("...");
    }
    output
}

fn benchmark_failed(config: &Config, stats: &WorkerStats) -> bool {
    !config.allow_errors && (stats.errors > 0 || stats.ttft_micros.is_empty())
}

fn worker_start_delay(worker_index: usize, worker_count: usize, spread_ms: u64) -> Duration {
    if spread_ms == 0 || worker_count <= 1 {
        return Duration::ZERO;
    }
    let delay_ms =
        u128::from(spread_ms) * worker_index as u128 / (worker_count.saturating_sub(1) as u128);
    Duration::from_millis(delay_ms.min(u128::from(u64::MAX)) as u64)
}

fn build_payloads(profile: PayloadProfile, raw_image_bytes: usize) -> PayloadSet {
    match profile {
        PayloadProfile::Basic => PayloadSet {
            fixtures: vec![PayloadFixture {
                name: if raw_image_bytes == 0 {
                    "basic-text"
                } else {
                    "basic-image"
                },
                body: build_basic_payload(raw_image_bytes),
            }],
            schedule: vec![0],
        },
        PayloadProfile::CodingAgentSmall => single_coding_agent_fixture(
            "agent-small-text",
            build_coding_agent_payload(32 * 1024, 0, 4),
        ),
        PayloadProfile::CodingAgentLarge => single_coding_agent_fixture(
            "agent-large-text",
            build_coding_agent_payload(512 * 1024, 0, 12),
        ),
        PayloadProfile::CodingAgentMedia => single_coding_agent_fixture(
            "agent-media",
            build_coding_agent_payload(256 * 1024, 4 * 1024 * 1024, 6),
        ),
        PayloadProfile::CodingAgentMix => PayloadSet {
            fixtures: vec![
                PayloadFixture {
                    name: "agent-small-text",
                    body: build_coding_agent_payload(32 * 1024, 0, 4),
                },
                PayloadFixture {
                    name: "agent-large-text",
                    body: build_coding_agent_payload(512 * 1024, 0, 12),
                },
                PayloadFixture {
                    name: "agent-media",
                    body: build_coding_agent_payload(256 * 1024, 4 * 1024 * 1024, 6),
                },
            ],
            // Deterministic 60% small text, 30% large text, 10% media.
            schedule: vec![0, 0, 0, 0, 0, 0, 1, 1, 1, 2],
        },
    }
}

fn single_coding_agent_fixture(name: &'static str, body: Bytes) -> PayloadSet {
    PayloadSet {
        fixtures: vec![PayloadFixture { name, body }],
        schedule: vec![0],
    }
}

fn build_basic_payload(raw_image_bytes: usize) -> Bytes {
    let content = if raw_image_bytes == 0 {
        Value::String("Reply with the deterministic benchmark response.".to_string())
    } else {
        let image = (0..raw_image_bytes)
            .map(|index| ((index * 31 + 17) % 251) as u8)
            .collect::<Vec<_>>();
        json!([
            {
                "type": "text",
                "text": "Describe this benchmark image."
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": format!("data:image/jpeg;base64,{}", BASE64.encode(image))
                }
            }
        ])
    };

    Bytes::from(
        serde_json::to_vec(&json!({
            "model": "benchmark-model",
            "stream": true,
            "messages": [{ "role": "user", "content": content }]
        }))
        .expect("the static benchmark payload must serialize"),
    )
}

fn build_coding_agent_payload(text_bytes: usize, raw_image_bytes: usize, turns: usize) -> Bytes {
    let block_count = 2 + turns * 3;
    let block_bytes = (text_bytes / block_count).max(256);
    let mut messages = vec![
        json!({
            "role": "system",
            "content": code_blob("repository system instructions", block_bytes),
        }),
        json!({
            "role": "developer",
            "content": code_blob("project-specific engineering instructions", block_bytes),
        }),
    ];

    for turn in 0..turns {
        let tool_call_count = if turn % 4 == 0 { 2 } else { 1 };
        let tool_calls = (0..tool_call_count)
            .map(|tool_index| {
                json!({
                    "id": format!("call_benchmark_{turn}_{tool_index}"),
                    "type": "function",
                    "function": {
                        "name": if tool_index == 0 {
                            "read_repository_file"
                        } else {
                            "search_repository"
                        },
                        "arguments": serde_json::to_string(&json!({
                            "path": format!("packages/example/src/file-{turn}.ts"),
                            "query": format!("benchmark symbol {turn}"),
                            "line_start": turn * 20,
                            "line_end": turn * 20 + 200,
                        })).expect("static tool arguments must serialize"),
                    },
                })
            })
            .collect::<Vec<_>>();
        messages.push(json!({
            "role": "user",
            "content": [
                { "type": "text", "text": format!("Inspect the implementation for task {turn}.") },
                { "type": "text", "text": code_blob(&format!("source file {turn}"), block_bytes) },
            ],
        }));
        messages.push(json!({
            "role": "assistant",
            "content": if turn % 4 == 0 {
                Value::Null
            } else {
                Value::String(code_blob(&format!("analysis summary {turn}"), block_bytes))
            },
            "tool_calls": tool_calls,
        }));
        for tool_index in 0..tool_call_count {
            messages.push(json!({
                "role": "tool",
                "tool_call_id": format!("call_benchmark_{turn}_{tool_index}"),
                "content": code_blob(
                    &format!("tool result {turn} {tool_index}"),
                    block_bytes / tool_call_count,
                ),
            }));
        }
    }

    if raw_image_bytes > 0 {
        let image = (0..raw_image_bytes)
            .map(|index| ((index * 31 + 17) % 251) as u8)
            .collect::<Vec<_>>();
        messages.push(json!({
            "role": "user",
            "content": [
                { "type": "text", "text": "Use this screenshot while diagnosing the failing UI test." },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": format!("data:image/jpeg;base64,{}", BASE64.encode(image)),
                    },
                },
            ],
        }));
    }

    let tools = (0..8)
        .map(|index| {
            let name = match index {
                0 => "read_repository_file".to_string(),
                1 => "search_repository".to_string(),
                2 => "apply_repository_patch".to_string(),
                _ => format!("repository_tool_{index}"),
            };
            json!({
                "type": "function",
                "function": {
                    "name": name,
                    "description": code_blob(&format!("tool description {index}"), 8 * 1024),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Repository-relative path" },
                            "query": { "type": "string", "description": "Search or edit query" },
                            "line_start": { "type": "integer" },
                            "line_end": { "type": "integer" },
                        },
                        "required": ["path"],
                        "additionalProperties": false,
                    },
                },
            })
        })
        .collect::<Vec<_>>();

    Bytes::from(
        serde_json::to_vec(&json!({
            "model": "benchmark-model",
            "stream": true,
            "stream_options": { "include_usage": true },
            "max_tokens": 4096,
            "temperature": 0.2,
            "top_p": 0.95,
            "stop": ["<benchmark-stop>", "<tool-stop>"],
            "tool_choice": "auto",
            "tools": tools,
            "messages": messages,
        }))
        .expect("the coding-agent benchmark payload must serialize"),
    )
}

fn code_blob(label: &str, bytes: usize) -> String {
    let line = format!(
        "// {label}\nexport function benchmark(value: string) {{ return value.length + 1; }}\n"
    );
    let mut output = String::with_capacity(bytes);
    while output.len() < bytes {
        output.push_str(&line);
    }
    output.truncate(bytes);
    output
}

fn print_results(
    config: &Config,
    mut stats: WorkerStats,
    elapsed: Duration,
    payloads: &PayloadSet,
) {
    stats.ttft_micros.sort_unstable();
    stats.completion_micros.sort_unstable();

    let count = stats.ttft_micros.len();
    let requests_per_second = count as f64 / elapsed.as_secs_f64();
    let ttft_p50 = percentile_ms(&stats.ttft_micros, 0.50);
    let ttft_p95 = percentile_ms(&stats.ttft_micros, 0.95);
    let ttft_p99 = percentile_ms(&stats.ttft_micros, 0.99);
    let completion_p50 = percentile_ms(&stats.completion_micros, 0.50);
    let completion_p95 = percentile_ms(&stats.completion_micros, 0.95);
    let completion_p99 = percentile_ms(&stats.completion_micros, 0.99);

    let fixture_sizes = payloads
        .fixtures
        .iter()
        .map(|fixture| (fixture.name, fixture.body.len()))
        .collect::<Vec<_>>();
    let weighted_body_bytes = payloads
        .schedule
        .iter()
        .map(|index| payloads.fixtures[*index].body.len() as u64)
        .sum::<u64>() as f64
        / payloads.schedule.len() as f64;
    let fixture_completions = payloads
        .fixtures
        .iter()
        .enumerate()
        .map(|(index, fixture)| {
            (
                fixture.name,
                stats.completed_by_fixture.get(index).copied().unwrap_or(0),
            )
        })
        .collect::<Vec<_>>();

    println!(
        "{} [{}]: {} completed, {} errors, {:.2} req/s, {:.2}s elapsed, {:.0} weighted request bytes, {} ms start spread",
        config.label,
        config.mode,
        count,
        stats.errors,
        requests_per_second,
        elapsed.as_secs_f64(),
        weighted_body_bytes,
        config.start_spread_ms,
    );
    println!(
        "TTFT ms: p50={} p95={} p99={}",
        display_metric(ttft_p50),
        display_metric(ttft_p95),
        display_metric(ttft_p99),
    );
    println!(
        "Completion ms: p50={} p95={} p99={}",
        display_metric(completion_p50),
        display_metric(completion_p95),
        display_metric(completion_p99),
    );
    if !stats.error_samples.is_empty() {
        println!(
            "Error samples ({} distinct, capped at {}):",
            stats.error_samples.len(),
            MAX_ERROR_SAMPLES,
        );
        for (index, error) in stats.error_samples.iter().enumerate() {
            println!("  {}. {error}", index + 1);
        }
    }

    println!(
        "{}",
        serde_json::to_string(&json!({
            "label": config.label,
            "mode": config.mode.as_str(),
            "payload_profile": config.payload_profile.as_str(),
            "stream_profile": config.stream_profile.as_str(),
            "concurrency": config.concurrency,
            "duration_seconds": config.duration.as_secs(),
            "payload_bytes": config.payload_bytes,
            "request_body_bytes_weighted": weighted_body_bytes,
            "fixture_sizes": fixture_sizes,
            "fixture_completions": fixture_completions,
            "chunks": config.chunks,
            "chunk_delay_ms": config.chunk_delay_ms,
            "chunk_bytes": config.chunk_bytes,
            "start_spread_ms": config.start_spread_ms,
            "allow_errors": config.allow_errors,
            "count": count,
            "errors": stats.errors,
            "error_samples": stats.error_samples,
            "requests_per_second": requests_per_second,
            "ttft_p50_ms": ttft_p50,
            "ttft_p95_ms": ttft_p95,
            "ttft_p99_ms": ttft_p99,
            "completion_p50_ms": completion_p50,
            "completion_p95_ms": completion_p95,
            "completion_p99_ms": completion_p99,
        }))
        .expect("benchmark summary must serialize"),
    );
}

fn percentile_ms(sorted_values: &[u64], percentile: f64) -> Option<f64> {
    if sorted_values.is_empty() {
        return None;
    }
    let rank = (percentile * sorted_values.len() as f64).ceil() as usize;
    let index = rank.saturating_sub(1).min(sorted_values.len() - 1);
    Some(sorted_values[index] as f64 / 1_000.0)
}

fn display_metric(value: Option<f64>) -> String {
    value
        .map(|value| format!("{value:.2}"))
        .unwrap_or_else(|| "n/a".to_string())
}

fn duration_to_micros(duration: Duration) -> u64 {
    duration.as_micros().min(u64::MAX as u128) as u64
}

fn env_value(name: &str, fallback: &str) -> String {
    env::var(name).unwrap_or_else(|_| fallback.to_string())
}

fn parse_number<T>(name: &str, value: &str) -> Result<T, String>
where
    T: FromStr,
    T::Err: fmt::Display,
{
    value
        .parse()
        .map_err(|error| format!("{name} must be a non-negative integer: {error}"))
}

fn print_help() {
    println!(
        "gateway-loadgen\n\n\
Usage: gateway-loadgen [OPTIONS]\n\n\
Options:\n\
  --url URL                    Gateway /v1/chat/completions URL\n\
  --label LABEL                Label included in the result\n\
  --mode native|translate      Gateway processing mode\n\
  --concurrency N              Number of concurrent workers\n\
  --duration-seconds N         Measurement duration\n\
	  --payload-bytes N            Raw image bytes before base64; 0 uses text only\n\
	  --payload-profile PROFILE    basic, coding-agent-small, coding-agent-large,\n\
	                               coding-agent-media, or coding-agent-mix\n\
	  --stream-profile PROFILE     text or coding-agent\n\
  --chunks N                   Mock upstream content chunks\n\
  --chunk-delay-ms N           Delay between mock upstream chunks\n\
  --chunk-bytes N              Text bytes in each upstream content chunk\n\
  --start-spread-ms N          Uniform first-request spread; default 0\n\
  --allow-errors               Report request errors but exit successfully\n\
  -h, --help                   Show this help\n\n\
The same options can be set with BENCHMARK_URL, BENCHMARK_LABEL,\n\
BENCHMARK_MODE, BENCHMARK_CONCURRENCY, BENCHMARK_DURATION_SECONDS,\n\
	BENCHMARK_PAYLOAD_BYTES, BENCHMARK_PAYLOAD_PROFILE, BENCHMARK_STREAM_PROFILE,\n\
	BENCHMARK_CHUNKS, BENCHMARK_CHUNK_DELAY_MS, and BENCHMARK_CHUNK_BYTES.\n\
	CLI values take precedence."
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_samples_are_distinct_bounded_and_merged() {
        let mut stats = WorkerStats::default();
        stats.record_error("alpha");
        stats.record_error("alpha");

        let mut other = WorkerStats::default();
        other.record_error("beta");
        other.record_error("alpha");
        stats.merge(other);

        for index in 0..20 {
            stats.record_error(format!("error-{index}"));
        }

        assert_eq!(stats.errors, 24);
        assert_eq!(stats.error_samples.len(), MAX_ERROR_SAMPLES);
        assert_eq!(stats.error_samples[0], "alpha");
        assert_eq!(stats.error_samples[1], "beta");
        assert_eq!(stats.error_samples[9], "error-7");
    }

    #[test]
    fn allow_errors_only_changes_the_runtime_failure_exit() {
        let mut config = test_config();
        let mut stats = WorkerStats::default();
        stats.record_error("request failed");

        assert!(benchmark_failed(&config, &stats));
        config.allow_errors = true;
        assert!(!benchmark_failed(&config, &stats));
    }

    fn test_config() -> Config {
        Config {
            url: "http://localhost:3000/v1/chat/completions".to_string(),
            label: "test".to_string(),
            mode: Mode::Native,
            concurrency: 1,
            duration: Duration::from_secs(1),
            payload_bytes: 0,
            payload_profile: PayloadProfile::Basic,
            stream_profile: StreamProfile::Text,
            chunks: 1,
            chunk_delay_ms: 0,
            chunk_bytes: 1,
            start_spread_ms: 0,
            allow_errors: false,
        }
    }

    #[test]
    fn worker_start_delays_are_uniform_and_include_both_boundaries() {
        let delays = (0..5)
            .map(|index| worker_start_delay(index, 5, 1_000).as_millis())
            .collect::<Vec<_>>();

        assert_eq!(delays, vec![0, 250, 500, 750, 1_000]);
        assert_eq!(worker_start_delay(0, 1, 1_000), Duration::ZERO);
        assert_eq!(worker_start_delay(3, 10, 0), Duration::ZERO);
    }
}
