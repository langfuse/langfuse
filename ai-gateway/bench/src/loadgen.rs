//! Open-loop constant-rate load generator for two traffic classes (victim A, aggressor B).
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use bytes::Bytes;
use reqwest::{Client, header};
use serde::Serialize;
use tokio::sync::Mutex;

use crate::{
    metrics::{LatencySummary, jains_fairness, summarize_latencies},
    mocks::{AGGRESSOR_KEY, VICTIM_KEY},
};

#[derive(Clone, Debug)]
pub struct LoadSpec {
    pub gateway_url: String,
    pub total_rps: f64,
    /// Fraction of arrivals assigned to Class B (0.0 ..= 1.0).
    pub class_b_share: f64,
    pub warmup: Duration,
    pub duration: Duration,
    pub request_timeout: Duration,
    pub class_a_body: Bytes,
    pub class_b_body: Bytes,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct ClassStats {
    pub target_rps: f64,
    pub sent: usize,
    pub completed: usize,
    pub status_2xx: usize,
    pub status_400: usize,
    pub status_503: usize,
    pub status_other: usize,
    pub timeouts: usize,
    pub transport_errors: usize,
    pub achieved_rps: f64,
    pub completion_ratio: f64,
    pub latency: LatencySummary,
}

#[derive(Clone, Debug, Serialize)]
pub struct LoadResult {
    pub elapsed_secs: f64,
    pub class_a: ClassStats,
    pub class_b: ClassStats,
    /// Jain's fairness over normalized completion ratios (achieved_i / target_i).
    pub jains_normalized: f64,
    /// Jain's fairness over raw achieved RPS (meaningful at equal 50/50 shares).
    pub jains_raw_rps: f64,
}

#[derive(Default)]
struct RawBucket {
    sent: usize,
    status_2xx: usize,
    status_400: usize,
    status_503: usize,
    status_other: usize,
    timeouts: usize,
    transport_errors: usize,
    latencies_us: Vec<u64>,
}

pub async fn run_open_loop(client: &Client, spec: &LoadSpec) -> LoadResult {
    if !spec.warmup.is_zero() {
        let warmup_spec = LoadSpec {
            duration: spec.warmup,
            warmup: Duration::ZERO,
            ..spec.clone()
        };
        let _ = execute_window(client, &warmup_spec).await;
        // Brief settle pause so warmup in-flight responses finish cleanly.
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
    execute_window(client, spec).await
}

async fn execute_window(client: &Client, spec: &LoadSpec) -> LoadResult {
    let url = format!("{}/openai/v1/chat/completions", spec.gateway_url);
    let bucket_a = Arc::new(Mutex::new(RawBucket::default()));
    let bucket_b = Arc::new(Mutex::new(RawBucket::default()));

    let total_requests = (spec.total_rps * spec.duration.as_secs_f64()).round() as usize;
    let interval_ns = (1_000_000_000.0 / spec.total_rps.max(0.1)) as u64;

    let started = Instant::now();
    let mut handles = Vec::with_capacity(total_requests);

    // Deterministic Bresenham accumulator assigns exact class shares without burstiness.
    let mut b_accum = 0.0f64;

    for idx in 0..total_requests {
        let target_offset = Duration::from_nanos(interval_ns.saturating_mul(idx as u64));
        if let Some(wait) = target_offset.checked_sub(started.elapsed()) {
            tokio::time::sleep(wait).await;
        }

        b_accum += spec.class_b_share;
        let is_b = if b_accum >= 1.0 - 1e-9 {
            b_accum -= 1.0;
            true
        } else {
            false
        };

        let (key, body, bucket) = if is_b {
            (
                AGGRESSOR_KEY,
                spec.class_b_body.clone(),
                Arc::clone(&bucket_b),
            )
        } else {
            (VICTIM_KEY, spec.class_a_body.clone(), Arc::clone(&bucket_a))
        };

        let client = client.clone();
        let url = url.clone();
        let timeout = spec.request_timeout;

        handles.push(tokio::spawn(async move {
            let req_started = Instant::now();
            let result = client
                .post(&url)
                .header(header::AUTHORIZATION, format!("Bearer {key}"))
                .header(header::CONTENT_TYPE, "application/json")
                .timeout(timeout)
                .body(body)
                .send()
                .await;

            let outcome = match result {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    let _ = resp.bytes().await;
                    Ok(status)
                }
                Err(err) => Err(err.is_timeout()),
            };
            let elapsed_us = u64::try_from(req_started.elapsed().as_micros()).unwrap_or(u64::MAX);

            let mut guard = bucket.lock().await;
            guard.sent += 1;
            match outcome {
                Ok(200..=299) => {
                    guard.status_2xx += 1;
                    guard.latencies_us.push(elapsed_us);
                }
                Ok(400) => {
                    guard.status_400 += 1;
                    guard.latencies_us.push(elapsed_us);
                }
                Ok(503) => {
                    guard.status_503 += 1;
                    guard.latencies_us.push(elapsed_us);
                }
                Ok(_) => {
                    guard.status_other += 1;
                    guard.latencies_us.push(elapsed_us);
                }
                Err(true) => {
                    guard.timeouts += 1;
                }
                Err(false) => {
                    guard.transport_errors += 1;
                }
            }
        }));
    }

    let send_elapsed = started
        .elapsed()
        .as_secs_f64()
        .max(spec.duration.as_secs_f64());

    for handle in handles {
        let _ = handle.await;
    }

    let target_b = spec.total_rps * spec.class_b_share;
    let target_a = spec.total_rps - target_b;

    let raw_a = std::mem::take(&mut *bucket_a.lock().await);
    let raw_b = std::mem::take(&mut *bucket_b.lock().await);

    let class_a = finalize_class(raw_a, target_a, send_elapsed);
    let class_b = finalize_class(raw_b, target_b, send_elapsed);

    let jains_normalized = if target_a > 0.0 && target_b > 0.0 {
        jains_fairness(&[class_a.completion_ratio, class_b.completion_ratio])
    } else {
        1.0
    };
    let jains_raw_rps = if target_a > 0.0 && target_b > 0.0 {
        jains_fairness(&[class_a.achieved_rps, class_b.achieved_rps])
    } else {
        1.0
    };

    LoadResult {
        elapsed_secs: send_elapsed,
        class_a,
        class_b,
        jains_normalized,
        jains_raw_rps,
    }
}

fn finalize_class(raw: RawBucket, target_rps: f64, window_secs: f64) -> ClassStats {
    // 2xx and 400 (expected guardrail block) count as successfully handled requests;
    // 503 (memory budget exhaustion), 5xx, timeouts, and transport errors are failures.
    let handled = raw.status_2xx + raw.status_400;
    let completed = handled + raw.status_503 + raw.status_other;
    let achieved_rps = if window_secs > 0.0 {
        (handled as f64) / window_secs
    } else {
        0.0
    };
    let completion_ratio = if target_rps > 0.0 {
        (achieved_rps / target_rps).min(1.0)
    } else {
        1.0
    };
    ClassStats {
        target_rps,
        sent: raw.sent,
        completed,
        status_2xx: raw.status_2xx,
        status_400: raw.status_400,
        status_503: raw.status_503,
        status_other: raw.status_other,
        timeouts: raw.timeouts,
        transport_errors: raw.transport_errors,
        achieved_rps,
        completion_ratio,
        latency: summarize_latencies(raw.latencies_us),
    }
}
