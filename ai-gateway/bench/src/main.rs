//! Guardrail fairness benchmark harness for `ai-gateway`.
//!
//! Spawns the release `ai-gateway` binary pinned to fixed CPU cores via `taskset`,
//! drives open-loop two-class load (Class A victim without guardrails vs Class B
//! aggressor with regex/Bedrock guardrails) against local mocks pinned to separate
//! cores, and records latency inflation, Jain's fairness, CPU/RSS, Tokio runtime
//! saturation, and per-phase gateway timings.
mod loadgen;
mod metrics;
mod mocks;
mod payloads;

use std::{
    env, fs,
    path::PathBuf,
    process::Stdio,
    time::{Duration, Instant},
};

use reqwest::Client;
use serde::Serialize;
use tokio::{net::TcpListener, process::Child};

use crate::{
    loadgen::{LoadResult, LoadSpec, run_open_loop},
    metrics::{
        BenchRuntimeMetrics, PhasesSnapshot, RuntimeDelta, cpu_percent, runtime_delta, sample_proc,
    },
    mocks::{BedrockMode, MockCluster, MockConfig},
    payloads::{PayloadShape, RuleSet, build_chat_payload},
};

#[derive(Clone, Debug)]
struct GatewayOptions {
    binary: PathBuf,
    cpu_set: String,
    memory_budget_bytes: Option<usize>,
    max_scan_bytes: Option<usize>,
    parse_inline_bytes: Option<usize>,
    log_level: String,
}

#[derive(Clone, Debug)]
struct Scenario {
    suite: &'static str,
    name: String,
    total_rps: f64,
    class_b_share: f64,
    class_a_shape: PayloadShape,
    class_b_shape: PayloadShape,
    class_b_rules: RuleSet,
    stream: bool,
    ingestion_mode: &'static str,
    llm_delay_ms: u64,
    bedrock_delay_ms: u64,
    bedrock_mode: BedrockMode,
    warmup_secs: u64,
    duration_secs: u64,
}

#[derive(Clone, Debug, Serialize)]
struct ScenarioRecord {
    suite: String,
    name: String,
    cpu_set: String,
    memory_budget_bytes: Option<usize>,
    max_scan_bytes: Option<usize>,
    parse_inline_bytes: Option<usize>,
    total_rps: f64,
    class_b_share: f64,
    class_a_body_bytes: usize,
    class_b_body_bytes: usize,
    ingestion_mode: String,
    llm_delay_ms: u64,
    bedrock_delay_ms: u64,
    gateway_cpu_pct_total: f64,
    gateway_cpu_pct_per_pinned_core: f64,
    gateway_rss_mb: f64,
    load: LoadResult,
    runtime: Option<RuntimeDelta>,
    phases: Option<PhasesSnapshot>,
}

struct RunningGateway {
    child: Child,
    pid: u32,
    base_url: String,
    pinned_cores: usize,
}

impl RunningGateway {
    async fn start(opts: &GatewayOptions, mocks: &MockCluster) -> Self {
        let port = pick_free_port().await;
        let listen = format!("127.0.0.1:{port}");
        let base_url = format!("http://{listen}");

        let mut cmd = tokio::process::Command::new("taskset");
        cmd.arg("-c")
            .arg(&opts.cpu_set)
            .arg(&opts.binary)
            .env("LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS", &listen)
            .env("LANGFUSE_AI_GATEWAY_WEB_URL", &mocks.control_plane_url)
            .env("LANGFUSE_AI_GATEWAY_SERVICE_KEY", "bench-service-key")
            .env("LANGFUSE_AI_GATEWAY_ALLOW_HTTP_WEB_URL", "true")
            .env("LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS", "127.0.0.1")
            .env("LANGFUSE_LOG_LEVEL", &opts.log_level)
            .env("BENCH_BEDROCK_ORIGIN", &mocks.bedrock_origin)
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        if let Some(budget) = opts.memory_budget_bytes {
            cmd.env(
                "LANGFUSE_AI_GATEWAY_MEMORY_BUDGET_BYTES",
                budget.to_string(),
            );
        }
        if let Some(cap) = opts.max_scan_bytes {
            cmd.env("BENCH_GUARDRAIL_MAX_SCAN_BYTES", cap.to_string());
        }
        if let Some(limit) = opts.parse_inline_bytes {
            cmd.env("BENCH_PARSE_INLINE_BYTES", limit.to_string());
        }

        let child = cmd.spawn().expect("spawn ai-gateway via taskset");
        let pid = child.id().expect("gateway child pid");

        let client = Client::builder()
            .no_proxy()
            .build()
            .expect("readiness client");
        let ready_url = format!("{base_url}/ready");
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if let Ok(resp) = client.get(&ready_url).send().await
                && resp.status().is_success()
            {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "ai-gateway at {base_url} did not become ready in time"
            );
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        let pinned_cores = count_cpu_set(&opts.cpu_set);
        Self {
            child,
            pid,
            base_url,
            pinned_cores,
        }
    }

    async fn stop(mut self) {
        let _ = self.child.kill().await;
        let _ = self.child.wait().await;
    }
}

async fn pick_free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind ephemeral port");
    listener.local_addr().expect("ephemeral local_addr").port()
}

fn count_cpu_set(spec: &str) -> usize {
    let mut total = 0usize;
    for part in spec.split(',') {
        if let Some((a, b)) = part.split_once('-') {
            if let (Ok(start), Ok(end)) = (a.trim().parse::<usize>(), b.trim().parse::<usize>()) {
                total += end.saturating_sub(start) + 1;
            }
        } else if part.trim().parse::<usize>().is_ok() {
            total += 1;
        }
    }
    total.max(1)
}

async fn run_scenario_group(
    client: &Client,
    mocks: &MockCluster,
    opts: &GatewayOptions,
    scenarios: &[Scenario],
    out: &mut Vec<ScenarioRecord>,
) {
    let gw = RunningGateway::start(opts, mocks).await;
    for scenario in scenarios {
        mocks.update(MockConfig {
            class_b_guardrails: scenario.class_b_rules.build(),
            ingestion_mode: scenario.ingestion_mode,
            llm_delay: Duration::from_millis(scenario.llm_delay_ms),
            bedrock_delay: Duration::from_millis(scenario.bedrock_delay_ms),
            bedrock_mode: scenario.bedrock_mode,
        });

        let class_a_body = build_chat_payload(scenario.class_a_shape, scenario.stream);
        let class_b_body = build_chat_payload(scenario.class_b_shape, scenario.stream);

        // Warmup before resetting counters so regex caches and keep-alive pools are hot.
        if scenario.warmup_secs > 0 {
            let warmup_spec = LoadSpec {
                gateway_url: gw.base_url.clone(),
                total_rps: scenario.total_rps.min(100.0),
                class_b_share: scenario.class_b_share,
                warmup: Duration::ZERO,
                duration: Duration::from_secs(scenario.warmup_secs),
                request_timeout: Duration::from_secs(10),
                class_a_body: class_a_body.clone(),
                class_b_body: class_b_body.clone(),
            };
            let _ = run_open_loop(client, &warmup_spec).await;
            tokio::time::sleep(Duration::from_millis(400)).await;
        }

        let _ = client
            .post(format!("{}/_bench/phases/reset", gw.base_url))
            .send()
            .await;

        let proc_start = sample_proc(gw.pid);
        let rt_start: Option<BenchRuntimeMetrics> =
            fetch_json(client, &format!("{}/_bench/runtime", gw.base_url)).await;
        let wall_start = Instant::now();

        let load_spec = LoadSpec {
            gateway_url: gw.base_url.clone(),
            total_rps: scenario.total_rps,
            class_b_share: scenario.class_b_share,
            warmup: Duration::ZERO,
            duration: Duration::from_secs(scenario.duration_secs),
            request_timeout: Duration::from_secs(10),
            class_a_body: class_a_body.clone(),
            class_b_body: class_b_body.clone(),
        };
        let load = run_open_loop(client, &load_spec).await;

        let wall_secs = wall_start.elapsed().as_secs_f64();
        let proc_end = sample_proc(gw.pid);
        let rt_end: Option<BenchRuntimeMetrics> =
            fetch_json(client, &format!("{}/_bench/runtime", gw.base_url)).await;
        let phases: Option<PhasesSnapshot> =
            fetch_json(client, &format!("{}/_bench/phases", gw.base_url)).await;

        let (cpu_total, rss_mb) = match (proc_start, proc_end) {
            (Some(s), Some(e)) => (cpu_percent(s, e, wall_secs), (e.rss_kb as f64) / 1024.0),
            _ => (0.0, 0.0),
        };
        let cpu_per_core = cpu_total / (gw.pinned_cores as f64);
        let runtime = match (&rt_start, &rt_end) {
            (Some(s), Some(e)) => Some(runtime_delta(s, e, wall_secs)),
            _ => None,
        };

        eprintln!(
            "[{}/{}] rps={:.0} b={:.0}% | A p50={:.1} p95={:.1} p99={:.1} max={:.1}ms err={} | B p50={:.1} p99={:.1}ms ok={} blk={} 503={} err={} | J={:.3} | CPU={:.0}% ({:.0}%/core) RSS={:.0}MB{}",
            scenario.suite,
            scenario.name,
            scenario.total_rps,
            scenario.class_b_share * 100.0,
            load.class_a.latency.p50_ms,
            load.class_a.latency.p95_ms,
            load.class_a.latency.p99_ms,
            load.class_a.latency.max_ms,
            load.class_a.status_503 + load.class_a.timeouts + load.class_a.transport_errors,
            load.class_b.latency.p50_ms,
            load.class_b.latency.p99_ms,
            load.class_b.status_2xx,
            load.class_b.status_400,
            load.class_b.status_503,
            load.class_b.timeouts + load.class_b.transport_errors,
            load.jains_normalized,
            cpu_total,
            cpu_per_core,
            rss_mb,
            runtime.as_ref().map_or_else(String::new, |rt| format!(
                " | tokio busy={:.0}% poll_p99={}us sched_p99={}us >1ms={}/{}",
                rt.async_worker_busy_pct,
                rt.poll_p99_us,
                rt.sched_p99_us,
                rt.polls_over_1ms,
                rt.sched_over_1ms,
            ))
        );

        out.push(ScenarioRecord {
            suite: scenario.suite.to_owned(),
            name: scenario.name.clone(),
            cpu_set: opts.cpu_set.clone(),
            memory_budget_bytes: opts.memory_budget_bytes,
            max_scan_bytes: opts.max_scan_bytes,
            parse_inline_bytes: opts.parse_inline_bytes,
            total_rps: scenario.total_rps,
            class_b_share: scenario.class_b_share,
            class_a_body_bytes: class_a_body.len(),
            class_b_body_bytes: class_b_body.len(),
            ingestion_mode: scenario.ingestion_mode.to_owned(),
            llm_delay_ms: scenario.llm_delay_ms,
            bedrock_delay_ms: scenario.bedrock_delay_ms,
            gateway_cpu_pct_total: cpu_total,
            gateway_cpu_pct_per_pinned_core: cpu_per_core,
            gateway_rss_mb: rss_mb,
            load,
            runtime,
            phases,
        });
    }
    gw.stop().await;
}

async fn fetch_json<T: serde::de::DeserializeOwned>(client: &Client, url: &str) -> Option<T> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<T>().await.ok()
}

fn default_scenario(suite: &'static str, name: impl Into<String>) -> Scenario {
    Scenario {
        suite,
        name: name.into(),
        total_rps: 100.0,
        class_b_share: 0.5,
        class_a_shape: PayloadShape::SingleTurn {
            bytes: 1024,
            match_count: 0,
        },
        class_b_shape: PayloadShape::SingleTurn {
            bytes: 10 * 1024,
            match_count: 5,
        },
        class_b_rules: RuleSet::Regex5Redact,
        stream: false,
        ingestion_mode: "none",
        llm_delay_ms: 200,
        bedrock_delay_ms: 150,
        bedrock_mode: BedrockMode::Anonymize,
        warmup_secs: 2,
        duration_secs: 10,
    }
}

fn build_standard_matrix(duration_secs: u64) -> Vec<Scenario> {
    let mut list = Vec::new();

    // Suite 1: Class A only baseline (0% Class B), rising RPS.
    for &rps in &[50.0, 100.0, 200.0, 400.0, 800.0] {
        list.push(Scenario {
            total_rps: rps,
            class_b_share: 0.0,
            class_b_rules: RuleSet::None,
            duration_secs,
            ..default_scenario("baseline", format!("classA-only-{rps:.0}rps"))
        });
    }

    // Suite 2: Body size (10KB / 100KB / 1MB) x rule count (5 / 50) x share (10% / 50%) x RPS.
    for &(size_label, bytes, rps_levels) in &[
        ("10KB", 10 * 1024usize, &[100.0f64, 200.0, 400.0, 800.0][..]),
        ("100KB", 100 * 1024, &[100.0, 200.0, 400.0, 600.0][..]),
        ("1MB", 1024 * 1024, &[50.0, 100.0, 200.0, 400.0][..]),
    ] {
        for &(rule_label, rules) in &[
            ("5r-redact", RuleSet::Regex5Redact),
            ("50r-redact", RuleSet::Regex50Redact),
            ("50r-block-hit", RuleSet::Regex50Block),
        ] {
            for &share in &[0.10f64, 0.50] {
                for &rps in rps_levels {
                    // Sweep all RPS for 50r-redact; for 5r-redact and 50r-block-hit test key high-RPS points.
                    if rule_label != "50r-redact" && (share < 0.5 || rps < 200.0) {
                        continue;
                    }
                    if share < 0.5 && (rps == 50.0 || rps == 100.0) {
                        continue;
                    }
                    let matches = if bytes >= 1024 * 1024 { 20 } else { 5 };
                    list.push(Scenario {
                        total_rps: rps,
                        class_b_share: share,
                        class_b_shape: PayloadShape::SingleTurn {
                            bytes,
                            match_count: matches,
                        },
                        class_b_rules: rules,
                        duration_secs,
                        ..default_scenario(
                            "regex-sweep",
                            format!(
                                "{size_label}-{rule_label}-b{:.0}pct-{rps:.0}rps",
                                share * 100.0
                            ),
                        )
                    });
                }
            }
        }
    }

    // Suite 3: Multi-turn payloads + inline-cutoff probes (Parse/FindLastTurn 256 KiB, Scan 4 KiB).
    // M1: 200 KB total, 3.8 KB last turn -> ParseRequest + FindLastTurn + ScanGuardrails ALL inline!
    for &rps in &[100.0, 200.0, 400.0] {
        list.push(Scenario {
            total_rps: rps,
            class_b_share: 0.5,
            class_b_shape: PayloadShape::MultiTurn {
                total_bytes: 200 * 1024,
                history_turns: 20,
                last_turn_bytes: 3_800,
                match_count: 5,
            },
            class_b_rules: RuleSet::Regex50Redact,
            duration_secs,
            ..default_scenario(
                "multiturn-inline",
                format!("200KB-3.8KBlast-50r-inline-{rps:.0}rps"),
            )
        });
    }
    // M2: 1 MB total, 3.8 KB last turn -> Parse + FindLastTurn offloaded, Scan inline.
    for &rps in &[50.0, 100.0, 200.0] {
        list.push(Scenario {
            total_rps: rps,
            class_b_share: 0.5,
            class_b_shape: PayloadShape::MultiTurn {
                total_bytes: 1024 * 1024,
                history_turns: 20,
                last_turn_bytes: 3_800,
                match_count: 5,
            },
            class_b_rules: RuleSet::Regex50Redact,
            duration_secs,
            ..default_scenario("multiturn-inline", format!("1MB-3.8KBlast-50r-{rps:.0}rps"))
        });
    }
    // M3: 1 MB total, 500 KB last turn -> Scan offloaded, finalize + rewrite_body inline.
    for &rps in &[50.0, 100.0, 200.0] {
        list.push(Scenario {
            total_rps: rps,
            class_b_share: 0.5,
            class_b_shape: PayloadShape::MultiTurn {
                total_bytes: 1024 * 1024,
                history_turns: 20,
                last_turn_bytes: 512 * 1024,
                match_count: 20,
            },
            class_b_rules: RuleSet::Regex50Redact,
            duration_secs,
            ..default_scenario("multiturn-inline", format!("1MB-512KBlast-50r-{rps:.0}rps"))
        });
    }
    // M4: Heavy custom regex at 3.8 KB (inline) vs 100 KB (offloaded).
    for &(label, bytes, rps) in &[
        ("heavy-3.8KB-inline-200rps", 3_800usize, 200.0f64),
        ("heavy-3.8KB-inline-400rps", 3_800, 400.0),
        ("heavy-100KB-offload-200rps", 100 * 1024, 200.0),
    ] {
        list.push(Scenario {
            total_rps: rps,
            class_b_share: 0.5,
            class_b_shape: PayloadShape::SingleTurn {
                bytes,
                match_count: 5,
            },
            class_b_rules: RuleSet::RegexHeavyCustomRedact,
            duration_secs,
            ..default_scenario("multiturn-inline", label)
        });
    }

    // Suite 4: Shared CpuWork semaphore contention (Class A sends 300 KB > 256 KiB ParseRequest cutoff).
    list.push(Scenario {
        total_rps: 100.0,
        class_b_share: 0.0,
        class_a_shape: PayloadShape::SingleTurn {
            bytes: 300 * 1024,
            match_count: 0,
        },
        class_b_rules: RuleSet::None,
        duration_secs,
        ..default_scenario("cpuwork-contention", "classA-300KB-baseline-100rps")
    });
    for &rps in &[100.0, 200.0] {
        list.push(Scenario {
            total_rps: rps,
            class_b_share: 0.5,
            class_a_shape: PayloadShape::SingleTurn {
                bytes: 300 * 1024,
                match_count: 0,
            },
            class_b_shape: PayloadShape::SingleTurn {
                bytes: 1024 * 1024,
                match_count: 20,
            },
            class_b_rules: RuleSet::Regex50Redact,
            duration_secs,
            ..default_scenario(
                "cpuwork-contention",
                format!("classA-300KB-vs-1MB-50r-{rps:.0}rps"),
            )
        });
    }

    // Suite 5: External Bedrock ApplyGuardrail (150ms & 300ms, enforce/anonymize & block/none, 10KB & 1MB).
    for &(label, bytes, delay_ms, mode, rules, share, rps) in &[
        (
            "bedrock-10KB-150ms-anon-b50-200rps",
            10 * 1024,
            150,
            BedrockMode::Anonymize,
            RuleSet::BedrockEnforce,
            0.5,
            200.0,
        ),
        (
            "bedrock-10KB-300ms-anon-b50-200rps",
            10 * 1024,
            300,
            BedrockMode::Anonymize,
            RuleSet::BedrockEnforce,
            0.5,
            200.0,
        ),
        (
            "bedrock-10KB-300ms-anon-b50-400rps",
            10 * 1024,
            300,
            BedrockMode::Anonymize,
            RuleSet::BedrockEnforce,
            0.5,
            400.0,
        ),
        (
            "bedrock-1MB-200ms-anon-b10-100rps",
            1024 * 1024,
            200,
            BedrockMode::Anonymize,
            RuleSet::BedrockEnforce,
            0.1,
            100.0,
        ),
        (
            "bedrock-1MB-200ms-anon-b50-50rps",
            1024 * 1024,
            200,
            BedrockMode::Anonymize,
            RuleSet::BedrockEnforce,
            0.5,
            50.0,
        ),
        (
            "bedrock-1MB-200ms-anon-b50-100rps",
            1024 * 1024,
            200,
            BedrockMode::Anonymize,
            RuleSet::BedrockEnforce,
            0.5,
            100.0,
        ),
        (
            "bedrock-1MB-200ms-none-b50-100rps",
            1024 * 1024,
            200,
            BedrockMode::None,
            RuleSet::BedrockBlock,
            0.5,
            100.0,
        ),
        (
            "bedrock-1MB-200ms-block-b50-100rps",
            1024 * 1024,
            200,
            BedrockMode::Block,
            RuleSet::BedrockBlock,
            0.5,
            100.0,
        ),
        (
            "regex50+bedrock-1MB-200ms-b50-100rps",
            1024 * 1024,
            200,
            BedrockMode::Anonymize,
            RuleSet::Regex50RedactPlusBedrockEnforce,
            0.5,
            100.0,
        ),
    ] {
        list.push(Scenario {
            total_rps: rps,
            class_b_share: share,
            class_b_shape: PayloadShape::SingleTurn {
                bytes,
                match_count: 5,
            },
            class_b_rules: rules,
            bedrock_delay_ms: delay_ms,
            bedrock_mode: mode,
            duration_secs,
            ..default_scenario("bedrock", label)
        });
    }

    // Suite 6: Full ingestion mode comparison (exercises start_capture splice_bytes + RequestInput::parse_on_cpu + telemetry).
    for &rps in &[50.0, 100.0, 200.0] {
        list.push(Scenario {
            total_rps: rps,
            class_b_share: 0.5,
            class_b_shape: PayloadShape::SingleTurn {
                bytes: 1024 * 1024,
                match_count: 20,
            },
            class_b_rules: RuleSet::Regex50Redact,
            ingestion_mode: "full",
            duration_secs,
            ..default_scenario(
                "ingestion-full",
                format!("1MB-50r-redact-full-ingest-{rps:.0}rps"),
            )
        });
    }

    // SSE check on baseline + mixed 1MB 50-rule redact.
    list.push(Scenario {
        total_rps: 100.0,
        class_b_share: 0.5,
        class_b_shape: PayloadShape::SingleTurn {
            bytes: 1024 * 1024,
            match_count: 20,
        },
        class_b_rules: RuleSet::Regex50Redact,
        stream: true,
        duration_secs,
        ..default_scenario("sse-check", "1MB-50r-redact-sse-100rps")
    });

    list
}

fn build_large_body_series(suite: &'static str, duration_secs: u64) -> Vec<Scenario> {
    let mut list = Vec::new();
    // 2 MB, 5 MB, 10 MB, 15 MB (just under the 16 MiB default max_request_bytes).
    // RPS levels span below, near, and above single-permit CpuWork saturation on 2 cores.
    for &(label, bytes, rps_levels) in &[
        ("2MB", 2 * 1024 * 1024usize, &[50.0f64, 100.0, 200.0][..]),
        ("5MB", 5 * 1024 * 1024, &[25.0, 50.0, 100.0][..]),
        ("10MB", 10 * 1024 * 1024, &[10.0, 25.0, 50.0][..]),
        ("15MB", 15 * 1024 * 1024, &[10.0, 25.0, 40.0][..]),
    ] {
        for &share in &[0.10f64, 0.50] {
            for &rps in rps_levels {
                // Keep 10% share at the saturated high-RPS point so the matrix stays focused.
                if share < 0.5 && rps != *rps_levels.last().unwrap_or(&25.0) {
                    continue;
                }
                list.push(Scenario {
                    total_rps: rps,
                    class_b_share: share,
                    class_b_shape: PayloadShape::SingleTurn {
                        bytes,
                        match_count: 20,
                    },
                    class_b_rules: RuleSet::Regex50Redact,
                    duration_secs,
                    warmup_secs: 2,
                    ..default_scenario(
                        suite,
                        format!("{label}-50r-redact-b{:.0}pct-{rps:.0}rps", share * 100.0),
                    )
                });
            }
        }
    }
    // Control: 10 MB Class B with NO guardrails at 50 RPS (50% share) to isolate pure
    // body buffering + JSON parse cost from guardrail scanning/rejection cost.
    list.push(Scenario {
        total_rps: 50.0,
        class_b_share: 0.5,
        class_b_shape: PayloadShape::SingleTurn {
            bytes: 10 * 1024 * 1024,
            match_count: 0,
        },
        class_b_rules: RuleSet::None,
        duration_secs,
        warmup_secs: 2,
        ..default_scenario(suite, "10MB-no-guardrails-control-b50pct-50rps")
    });
    list
}

fn build_memory_pressure_series(duration_secs: u64) -> Vec<Scenario> {
    // 128 MiB memory budget (proportional to a tight container):
    // Class B with 1 MB body + 300 ms Bedrock holds ~4 MiB per in-flight request.
    vec![
        Scenario {
            total_rps: 100.0,
            class_b_share: 0.5,
            class_b_shape: PayloadShape::SingleTurn {
                bytes: 1024 * 1024,
                match_count: 5,
            },
            class_b_rules: RuleSet::BedrockEnforce,
            bedrock_delay_ms: 300,
            bedrock_mode: BedrockMode::Anonymize,
            duration_secs,
            ..default_scenario("memory-pressure", "bedrock-1MB-300ms-128MiB-100rps")
        },
        Scenario {
            total_rps: 150.0,
            class_b_share: 0.5,
            class_b_shape: PayloadShape::SingleTurn {
                bytes: 1024 * 1024,
                match_count: 5,
            },
            class_b_rules: RuleSet::BedrockEnforce,
            bedrock_delay_ms: 300,
            bedrock_mode: BedrockMode::Anonymize,
            duration_secs,
            ..default_scenario("memory-pressure", "bedrock-1MB-300ms-128MiB-150rps")
        },
    ]
}

fn build_cpuwork_starvation_series(suite: &'static str, duration_secs: u64) -> Vec<Scenario> {
    vec![
        Scenario {
            total_rps: 50.0,
            class_b_share: 0.5,
            class_a_shape: PayloadShape::SingleTurn {
                bytes: 300 * 1024,
                match_count: 0,
            },
            class_b_shape: PayloadShape::SingleTurn {
                bytes: 10 * 1024 * 1024,
                match_count: 20,
            },
            class_b_rules: RuleSet::Regex50Redact,
            duration_secs,
            ..default_scenario(suite, "classA-300KB-vs-10MB-50r-50rps")
        },
        Scenario {
            total_rps: 400.0,
            class_b_share: 0.5,
            class_a_shape: PayloadShape::SingleTurn {
                bytes: 300 * 1024,
                match_count: 0,
            },
            class_b_shape: PayloadShape::SingleTurn {
                bytes: 1024 * 1024,
                match_count: 20,
            },
            class_b_rules: RuleSet::Regex50Redact,
            duration_secs,
            ..default_scenario(suite, "classA-300KB-vs-1MB-50r-400rps")
        },
    ]
}

fn build_inline_limit_compare_series(
    suite: &'static str,
    include_baselines: bool,
    duration_secs: u64,
) -> Vec<Scenario> {
    const MB_1: usize = 1_000_000;
    const MB_2: usize = 2_000_000; // strictly < 2 MiB (2,097,152) including JSON wrapper
    const MB_3: usize = 3 * 1024 * 1024; // strictly > 2 MiB
    const MB_10: usize = 10 * 1024 * 1024;

    let mut list = Vec::new();

    if include_baselines {
        // Small 1 KB baseline + pure 2 MB inline-parse impact on 1 KB victim.
        list.push(Scenario {
            total_rps: 400.0,
            class_b_share: 0.0,
            class_b_rules: RuleSet::None,
            duration_secs,
            ..default_scenario(suite, "base-1KB-only-400rps")
        });
        list.push(Scenario {
            total_rps: 200.0,
            class_b_share: 0.5,
            class_b_shape: PayloadShape::SingleTurn {
                bytes: MB_2,
                match_count: 0,
            },
            class_b_rules: RuleSet::None,
            duration_secs,
            ..default_scenario(suite, "1KB-vs-2MB-noguardrail-200rps")
        });
        // Class A-only baselines per victim body size (50 RPS).
        for &(label, bytes) in &[
            ("300KB", 300 * 1024usize),
            ("1MB", MB_1),
            ("2MB", MB_2),
            ("3MB", MB_3),
        ] {
            list.push(Scenario {
                total_rps: 50.0,
                class_b_share: 0.0,
                class_a_shape: PayloadShape::SingleTurn {
                    bytes,
                    match_count: 0,
                },
                class_b_rules: RuleSet::None,
                duration_secs,
                ..default_scenario(suite, format!("base-{label}-only-50rps"))
            });
        }
    }

    // Small 1 KB victim vs 1 MB (400 RPS) and 2 MB (200 RPS) Class B 50-rule REDACT.
    list.push(Scenario {
        total_rps: 400.0,
        class_b_share: 0.5,
        class_b_shape: PayloadShape::SingleTurn {
            bytes: MB_1,
            match_count: 20,
        },
        class_b_rules: RuleSet::Regex50Redact,
        duration_secs,
        ..default_scenario(suite, "1KB-vs-1MB-50r-400rps")
    });
    list.push(Scenario {
        total_rps: 200.0,
        class_b_share: 0.5,
        class_b_shape: PayloadShape::SingleTurn {
            bytes: MB_2,
            match_count: 20,
        },
        class_b_rules: RuleSet::Regex50Redact,
        duration_secs,
        ..default_scenario(suite, "1KB-vs-2MB-50r-200rps")
    });

    // Starvation matrix vs Class B 10 MB 50-rule REDACT at 50 RPS (50% share = 25 A + 25 B).
    for &(label, a_bytes) in &[
        ("300KB", 300 * 1024usize),
        ("1MB", MB_1),
        ("2MB", MB_2),
        ("3MB", MB_3),
    ] {
        list.push(Scenario {
            total_rps: 50.0,
            class_b_share: 0.5,
            class_a_shape: PayloadShape::SingleTurn {
                bytes: a_bytes,
                match_count: 0,
            },
            class_b_shape: PayloadShape::SingleTurn {
                bytes: MB_10,
                match_count: 20,
            },
            class_b_rules: RuleSet::Regex50Redact,
            duration_secs,
            ..default_scenario(suite, format!("{label}-vs-10MB-50r-50rps"))
        });
    }

    // Starvation matrix vs Class B 1 MB 50-rule REDACT (200 B req/s saturates 1 CpuWork permit).
    // 300 KB and 1 MB use 400 RPS (50% = 200 A + 200 B); 2 MB and 3 MB use 250 RPS (80% B = 50 A + 200 B)
    // to keep Class B saturation identical without saturating loopback bandwidth on multi-MB Class A.
    for &(label, a_bytes, total_rps, share_b) in &[
        ("300KB", 300 * 1024usize, 400.0f64, 0.5f64),
        ("1MB", MB_1, 400.0, 0.5),
        ("2MB", MB_2, 250.0, 0.8),
        ("3MB", MB_3, 250.0, 0.8),
    ] {
        list.push(Scenario {
            total_rps,
            class_b_share: share_b,
            class_a_shape: PayloadShape::SingleTurn {
                bytes: a_bytes,
                match_count: 0,
            },
            class_b_shape: PayloadShape::SingleTurn {
                bytes: MB_1,
                match_count: 20,
            },
            class_b_rules: RuleSet::Regex50Redact,
            duration_secs,
            ..default_scenario(
                suite,
                format!(
                    "{label}-vs-1MB-50r-{total_rps:.0}rps-b{:.0}pct",
                    share_b * 100.0
                ),
            )
        });
    }

    list
}

fn build_4core_spotcheck(duration_secs: u64) -> Vec<Scenario> {
    vec![
        Scenario {
            total_rps: 200.0,
            class_b_share: 0.5,
            class_b_shape: PayloadShape::SingleTurn {
                bytes: 1024 * 1024,
                match_count: 20,
            },
            class_b_rules: RuleSet::Regex50Redact,
            duration_secs,
            ..default_scenario("4core-spotcheck", "1MB-50r-redact-b50pct-200rps")
        },
        Scenario {
            total_rps: 25.0,
            class_b_share: 0.5,
            class_b_shape: PayloadShape::SingleTurn {
                bytes: 10 * 1024 * 1024,
                match_count: 20,
            },
            class_b_rules: RuleSet::Regex50Redact,
            duration_secs,
            ..default_scenario("4core-spotcheck", "10MB-50r-redact-b50pct-25rps")
        },
    ]
}

fn build_phase_profile_series(suite: &'static str) -> Vec<Scenario> {
    let mut list = Vec::new();
    // 100% Class B at low non-saturated RPS with 0 ms LLM delay so per-phase gateway timings
    // (body_read, parse_cpu, find_turn_cpu, scan_cpu, finalize_cpu, rewrite_body_cpu) are
    // measured cleanly per body size without Class A dilution or queueing noise.
    for &(label, bytes, rps) in &[
        ("10KB", 10 * 1024usize, 40.0f64),
        ("100KB", 100 * 1024, 30.0),
        ("1MB", 1024 * 1024, 15.0),
        ("2MB", 2 * 1024 * 1024, 10.0),
        ("5MB", 5 * 1024 * 1024, 6.0),
        ("10MB", 10 * 1024 * 1024, 4.0),
        ("15MB", 15 * 1024 * 1024, 3.0),
    ] {
        // 50-rule REDACT with 20 matches (full detect + capture + finalize + splice path).
        list.push(Scenario {
            total_rps: rps,
            class_b_share: 1.0,
            class_b_shape: PayloadShape::SingleTurn {
                bytes,
                match_count: 20,
            },
            class_b_rules: RuleSet::Regex50Redact,
            llm_delay_ms: 0,
            warmup_secs: 1,
            duration_secs: 5,
            ..default_scenario(suite, format!("{label}-50r-redact-match"))
        });
        // 50-rule REDACT with 0 matches (detector scan only, no capture/redaction rewrite).
        list.push(Scenario {
            total_rps: rps,
            class_b_share: 1.0,
            class_b_shape: PayloadShape::SingleTurn {
                bytes,
                match_count: 0,
            },
            class_b_rules: RuleSet::Regex50Redact,
            llm_delay_ms: 0,
            warmup_secs: 1,
            duration_secs: 5,
            ..default_scenario(suite, format!("{label}-50r-nomatch"))
        });
    }
    list
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    let binary = arg_value(&args, "--gateway-bin")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../target/release/ai-gateway"));
    let cpu_set = arg_value(&args, "--cpu-set").unwrap_or_else(|| "0,1".to_owned());
    let out_path = arg_value(&args, "--out").unwrap_or_else(|| "bench-results.json".to_owned());
    let suite_filter = arg_value(&args, "--suite").unwrap_or_else(|| "all".to_owned());
    let duration_secs: u64 = arg_value(&args, "--duration-secs")
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    assert!(
        binary.exists(),
        "gateway binary not found at {}; build with RUSTFLAGS='--cfg tokio_unstable' cargo build --release --locked --features bench-harness",
        binary.display()
    );

    let mocks = MockCluster::start(MockConfig::default()).await;
    let client = Client::builder()
        .no_proxy()
        .pool_max_idle_per_host(2048)
        .tcp_nodelay(true)
        .build()
        .expect("loadgen client");

    let mut results = Vec::new();

    let base_opts = GatewayOptions {
        binary: binary.clone(),
        cpu_set: cpu_set.clone(),
        memory_budget_bytes: None,
        max_scan_bytes: None,
        parse_inline_bytes: None,
        log_level: "warn".to_owned(),
    };

    if suite_filter == "inline-limit-compare" {
        for &(inline_label, inline_bytes) in &[
            ("inline256KiB", 256 * 1024usize),
            ("inline2MiB", 2 * 1024 * 1024usize),
        ] {
            let uncapped_opts = GatewayOptions {
                parse_inline_bytes: Some(inline_bytes),
                max_scan_bytes: None,
                ..base_opts.clone()
            };
            let uncapped_suite: &'static str = if inline_bytes == 256 * 1024 {
                "inline256KiB-uncapped"
            } else {
                "inline2MiB-uncapped"
            };
            let uncapped_scenarios =
                build_inline_limit_compare_series(uncapped_suite, true, duration_secs);
            run_scenario_group(
                &client,
                &mocks,
                &uncapped_opts,
                &uncapped_scenarios,
                &mut results,
            )
            .await;

            let capped_opts = GatewayOptions {
                parse_inline_bytes: Some(inline_bytes),
                max_scan_bytes: Some(1024 * 1024),
                ..base_opts.clone()
            };
            let capped_suite: &'static str = if inline_bytes == 256 * 1024 {
                "inline256KiB-1MiBcap"
            } else {
                "inline2MiB-1MiBcap"
            };
            let _ = inline_label;
            let capped_scenarios =
                build_inline_limit_compare_series(capped_suite, false, duration_secs);
            run_scenario_group(
                &client,
                &mocks,
                &capped_opts,
                &capped_scenarios,
                &mut results,
            )
            .await;
        }
    }

    if suite_filter == "all" || suite_filter == "phase-profile" {
        let scenarios = build_phase_profile_series("phase-profile-uncapped");
        run_scenario_group(&client, &mocks, &base_opts, &scenarios, &mut results).await;

        let capped_opts = GatewayOptions {
            max_scan_bytes: Some(1024 * 1024),
            ..base_opts.clone()
        };
        let cap_scenarios: Vec<Scenario> = build_phase_profile_series("phase-profile-1MiB-cap")
            .into_iter()
            .filter(|s| {
                s.name.starts_with("2MB")
                    || s.name.starts_with("5MB")
                    || s.name.starts_with("10MB")
                    || s.name.starts_with("15MB")
            })
            .filter(|s| s.name.ends_with("redact-match"))
            .collect();
        run_scenario_group(&client, &mocks, &capped_opts, &cap_scenarios, &mut results).await;
    }

    if suite_filter == "all" || suite_filter == "standard" {
        let scenarios = build_standard_matrix(duration_secs);
        run_scenario_group(&client, &mocks, &base_opts, &scenarios, &mut results).await;
    }

    if suite_filter == "all" || suite_filter == "large-uncapped" {
        let scenarios = build_large_body_series("large-body-uncapped", duration_secs);
        run_scenario_group(&client, &mocks, &base_opts, &scenarios, &mut results).await;
    }

    if suite_filter == "all" || suite_filter == "large-capped" {
        let capped_opts = GatewayOptions {
            max_scan_bytes: Some(1024 * 1024),
            ..base_opts.clone()
        };
        let scenarios = build_large_body_series("large-body-1MiB-cap", duration_secs);
        run_scenario_group(&client, &mocks, &capped_opts, &scenarios, &mut results).await;
    }

    if suite_filter == "all" || suite_filter == "cpuwork-starvation" {
        let uncapped =
            build_cpuwork_starvation_series("cpuwork-starvation-uncapped", duration_secs);
        run_scenario_group(&client, &mocks, &base_opts, &uncapped, &mut results).await;

        let capped_opts = GatewayOptions {
            max_scan_bytes: Some(1024 * 1024),
            ..base_opts.clone()
        };
        let capped = build_cpuwork_starvation_series("cpuwork-starvation-1MiB-cap", duration_secs);
        run_scenario_group(&client, &mocks, &capped_opts, &capped, &mut results).await;
    }

    if suite_filter == "all" || suite_filter == "memory-pressure" {
        let tight_opts = GatewayOptions {
            memory_budget_bytes: Some(128 * 1024 * 1024),
            ..base_opts.clone()
        };
        let scenarios = build_memory_pressure_series(duration_secs);
        run_scenario_group(&client, &mocks, &tight_opts, &scenarios, &mut results).await;
    }

    if suite_filter == "all" || suite_filter == "4core" {
        let four_core_opts = GatewayOptions {
            cpu_set: "0-3".to_owned(),
            ..base_opts.clone()
        };
        let scenarios = build_4core_spotcheck(duration_secs);
        run_scenario_group(&client, &mocks, &four_core_opts, &scenarios, &mut results).await;
    }

    let json = serde_json::to_string_pretty(&results).expect("serialize results");
    #[expect(
        clippy::disallowed_methods,
        reason = "writes final benchmark JSON once after all scenarios finish"
    )]
    fs::write(&out_path, json).expect("write results json");
    eprintln!("Wrote {} scenario results to {out_path}", results.len());
}

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == flag)
        .map(|pair| pair[1].clone())
}
