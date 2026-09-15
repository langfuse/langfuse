use std::time::Duration;

use anyhow::{Context, Result, bail};

pub const DEFAULT_BODY_LIMIT_BYTES: usize = 32 * 1024 * 1024;
pub const DEFAULT_CAPTURE_LIMIT_BYTES: usize = 256 * 1024;
pub const DEFAULT_TELEMETRY_BATCH_MAX_SPANS: usize = 50;
pub const DEFAULT_TELEMETRY_BATCH_MAX_WAIT_MS: u64 = 250;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub upstream_origin: String,
    pub otel_url: String,
    pub body_limit_bytes: usize,
    pub capture_limit_bytes: usize,
    pub telemetry_queue_capacity: usize,
    pub telemetry_batch_max_spans: usize,
    pub telemetry_batch_max_wait: Duration,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let config = Self {
            port: parse_env("PORT", 3200_u16)?,
            upstream_origin: string_env("UPSTREAM_ORIGIN", "http://mock-upstream:4000"),
            otel_url: string_env("OTEL_URL", "http://mock-otel:4318/v1/traces"),
            body_limit_bytes: parse_env("BODY_LIMIT_BYTES", DEFAULT_BODY_LIMIT_BYTES)?,
            capture_limit_bytes: parse_env("CAPTURE_LIMIT_BYTES", DEFAULT_CAPTURE_LIMIT_BYTES)?,
            telemetry_queue_capacity: parse_env("TELEMETRY_QUEUE_CAPACITY", 1024_usize)?,
            telemetry_batch_max_spans: parse_env(
                "TELEMETRY_BATCH_MAX_SPANS",
                DEFAULT_TELEMETRY_BATCH_MAX_SPANS,
            )?,
            telemetry_batch_max_wait: Duration::from_millis(parse_env(
                "TELEMETRY_BATCH_MAX_WAIT_MS",
                DEFAULT_TELEMETRY_BATCH_MAX_WAIT_MS,
            )?),
        };

        if config.body_limit_bytes == 0 {
            bail!("BODY_LIMIT_BYTES must be greater than zero");
        }
        if config.capture_limit_bytes == 0 {
            bail!("CAPTURE_LIMIT_BYTES must be greater than zero");
        }
        if config.telemetry_queue_capacity == 0 {
            bail!("TELEMETRY_QUEUE_CAPACITY must be greater than zero");
        }
        if config.telemetry_batch_max_spans == 0 {
            bail!("TELEMETRY_BATCH_MAX_SPANS must be greater than zero");
        }
        if config.telemetry_batch_max_wait.is_zero() {
            bail!("TELEMETRY_BATCH_MAX_WAIT_MS must be greater than zero");
        }

        Ok(config)
    }

    pub fn upstream_url(&self, path: &str) -> String {
        format!("{}{}", self.upstream_origin.trim_end_matches('/'), path)
    }
}

fn string_env(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_owned())
}

fn parse_env<T>(name: &str, default: T) -> Result<T>
where
    T: std::str::FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    match std::env::var(name) {
        Ok(value) => value
            .parse::<T>()
            .with_context(|| format!("invalid {name}")),
        Err(_) => Ok(default),
    }
}
