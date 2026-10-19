use crate::resolution::ControlPlaneConfig;
use std::{env, net::SocketAddr, ops::RangeInclusive, time::Duration};
use tracing::level_filters::LevelFilter;

pub struct GatewayConfig {
    pub control_plane: Option<ControlPlaneConfig>,
    pub listen_address: SocketAddr,
    pub auto_increment_listen_port: bool,
    pub shutdown_timeout: Duration,
    pub log_level: LevelFilter,
    pub log_format: LogFormat,
    pub telemetry_buffer_bytes: usize,
    pub request_limits: RequestLimits,
    pub execution_limits: ExecutionLimits,
}

const MIB: usize = 1024 * 1024;
const SEMAPHORE_CAPACITY: usize = tokio::sync::Semaphore::MAX_PERMITS;
pub const DEFAULT_MAX_REQUEST_BYTES: usize = 16 * MIB;
const DEFAULT_MEMORY_BUDGET_BYTES: usize = 1024 * MIB;
/// Covers response capture (up to 1 MiB retained output plus one inspected event of up
/// to 1 MiB) and connection buffers. Staging responses average 8 KB (Anthropic) to
/// 210 KB (`OpenAI`), so this is above the typical request.
const DEFAULT_REQUEST_OVERHEAD_BYTES: usize = 2 * MIB;
const DEFAULT_MAX_EXECUTION_SECONDS: u32 = 10 * 60;
const DEFAULT_STALL_TIMEOUT_SECONDS: u32 = 120;
/// Memory bounds per instance. Admission is limited only by the memory budget.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RequestLimits {
    pub max_request_bytes: usize,
    /// Bytes all in-flight requests may reserve together.
    pub memory_budget_bytes: usize,
    /// Fixed bytes every in-flight request reserves on top of its body.
    pub request_overhead_bytes: usize,
}

impl Default for RequestLimits {
    fn default() -> Self {
        Self {
            max_request_bytes: DEFAULT_MAX_REQUEST_BYTES,
            memory_budget_bytes: DEFAULT_MEMORY_BUDGET_BYTES,
            request_overhead_bytes: DEFAULT_REQUEST_OVERHEAD_BYTES,
        }
    }
}

/// Provider execution deadlines.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ExecutionLimits {
    /// Ceiling from execution admission until the response completes.
    pub max_execution_time: Duration,
    /// Longest wait without progress: stream response headers, upstream reads, downstream writes.
    pub stall_timeout: Duration,
}

impl Default for ExecutionLimits {
    fn default() -> Self {
        Self {
            max_execution_time: Duration::from_secs(DEFAULT_MAX_EXECUTION_SECONDS.into()),
            stall_timeout: Duration::from_secs(DEFAULT_STALL_TIMEOUT_SECONDS.into()),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum LogFormat {
    Text,
    Json,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct GatewayConfigError(&'static str);

impl GatewayConfig {
    /// Read gateway configuration from the process environment, using defaults for absent values.
    ///
    /// # Errors
    /// Returns an error if a configured value is not Unicode or fails validation
    /// in [`Self::from_values`], or if a Web URL is configured with an invalid URL
    /// or missing/blank service key. Error messages never include supplied values.
    pub fn from_env() -> Result<Self, GatewayConfigError> {
        let mut config = Self::from_values(
            read_env("LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_AUTO_INCREMENT_LISTEN_PORT")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS")?.as_deref(),
            read_env("LANGFUSE_LOG_LEVEL")?.as_deref(),
            read_env("LANGFUSE_LOG_FORMAT")?.as_deref(),
        )?;
        config.telemetry_buffer_bytes = telemetry_buffer_bytes(
            read_env("LANGFUSE_AI_GATEWAY_TELEMETRY_BUFFER_BYTES")?.as_deref(),
        )?;
        config.request_limits = request_limits(
            read_env("LANGFUSE_AI_GATEWAY_MAX_REQUEST_BYTES")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_MEMORY_BUDGET_BYTES")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_REQUEST_MEMORY_OVERHEAD_BYTES")?.as_deref(),
        )?;
        config.execution_limits = execution_limits(
            read_env("LANGFUSE_AI_GATEWAY_MAX_EXECUTION_SECONDS")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_STALL_TIMEOUT_SECONDS")?.as_deref(),
        )?;
        if let Some(web_url) =
            read_env("LANGFUSE_AI_GATEWAY_WEB_URL")?.filter(|url| !url.is_empty())
        {
            let service_key = read_env("LANGFUSE_AI_GATEWAY_SERVICE_KEY")?.ok_or(GatewayConfigError(
                "LANGFUSE_AI_GATEWAY_SERVICE_KEY is required when LANGFUSE_AI_GATEWAY_WEB_URL is set",
            ))?;
            config.control_plane = Some(ControlPlaneConfig::new(&web_url, &service_key).map_err(
                |_| {
                    GatewayConfigError(
                        "invalid LANGFUSE_AI_GATEWAY_WEB_URL or LANGFUSE_AI_GATEWAY_SERVICE_KEY",
                    )
                },
            )?);
        }
        Ok(config)
    }

    /// Parse gateway configuration, using defaults for absent values.
    ///
    /// # Errors
    /// Returns an error for an invalid IP address and port, a non-boolean port
    /// auto-increment setting, a shutdown timeout outside 1–300 integer seconds,
    /// or an unsupported log level or format.
    pub fn from_values(
        listen_address: Option<&str>,
        auto_increment_listen_port: Option<&str>,
        shutdown_timeout: Option<&str>,
        log_level: Option<&str>,
        log_format: Option<&str>,
    ) -> Result<Self, GatewayConfigError> {
        let listen_address = listen_address
            .unwrap_or("0.0.0.0:8080")
            .parse()
            .map_err(|_| {
                GatewayConfigError(
                    "LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS must be an IP address and port",
                )
            })?;
        let auto_increment_listen_port = parse_boolean(
            auto_increment_listen_port.unwrap_or("false"),
        )
        .ok_or(GatewayConfigError(
            "LANGFUSE_AI_GATEWAY_AUTO_INCREMENT_LISTEN_PORT must be true or false",
        ))?;
        let seconds = integer_setting(
            shutdown_timeout,
            10,
            1..=300,
            "LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS must be an integer from 1 to 300",
        )?;
        let log_level = match log_level.unwrap_or("info") {
            "debug" => LevelFilter::DEBUG,
            "info" => LevelFilter::INFO,
            "warn" => LevelFilter::WARN,
            // Tracing has no separate fatal severity.
            "error" | "fatal" => LevelFilter::ERROR,
            _ => {
                return Err(GatewayConfigError(
                    "LANGFUSE_LOG_LEVEL must be debug, info, warn, error or fatal",
                ));
            }
        };
        let log_format = match log_format.unwrap_or("text") {
            "text" => LogFormat::Text,
            "json" => LogFormat::Json,
            _ => {
                return Err(GatewayConfigError(
                    "LANGFUSE_LOG_FORMAT must be text or json",
                ));
            }
        };
        Ok(Self {
            control_plane: None,
            listen_address,
            auto_increment_listen_port,
            shutdown_timeout: Duration::from_secs(seconds),
            log_level,
            log_format,
            telemetry_buffer_bytes: crate::telemetry::DEFAULT_RETAINED_BYTES,
            request_limits: RequestLimits::default(),
            execution_limits: ExecutionLimits::default(),
        })
    }
}

fn request_limits(
    max_request_bytes: Option<&str>,
    memory_budget_bytes: Option<&str>,
    request_overhead_bytes: Option<&str>,
) -> Result<RequestLimits, GatewayConfigError> {
    let defaults = RequestLimits::default();
    // The overhead and each body growth are single semaphore acquisitions, which take a u32.
    let max_reservation = usize::try_from(u32::MAX)
        .unwrap_or(usize::MAX)
        .min(SEMAPHORE_CAPACITY);
    let max_request_bytes = integer_setting(
        max_request_bytes,
        defaults.max_request_bytes,
        MIB..=max_reservation,
        "LANGFUSE_AI_GATEWAY_MAX_REQUEST_BYTES must be an integer of at least 1048576 (1 MiB) and within a single semaphore reservation",
    )?;
    let request_overhead_bytes = integer_setting(
        request_overhead_bytes,
        defaults.request_overhead_bytes,
        0..=max_reservation,
        "LANGFUSE_AI_GATEWAY_REQUEST_MEMORY_OVERHEAD_BYTES must be a non-negative integer within a single semaphore reservation",
    )?;
    // A maximal request must fit, or it could never be admitted.
    let largest_request = max_request_bytes.saturating_add(request_overhead_bytes);
    let memory_budget_bytes = integer_setting(
        memory_budget_bytes,
        defaults.memory_budget_bytes,
        largest_request..=SEMAPHORE_CAPACITY,
        "LANGFUSE_AI_GATEWAY_MEMORY_BUDGET_BYTES must be an integer of at least LANGFUSE_AI_GATEWAY_MAX_REQUEST_BYTES plus LANGFUSE_AI_GATEWAY_REQUEST_MEMORY_OVERHEAD_BYTES within the semaphore capacity",
    )?;
    Ok(RequestLimits {
        max_request_bytes,
        memory_budget_bytes,
        request_overhead_bytes,
    })
}

fn execution_limits(
    max_execution_time: Option<&str>,
    stall_timeout: Option<&str>,
) -> Result<ExecutionLimits, GatewayConfigError> {
    // `u32` seconds keep every deadline far from `Instant` overflow.
    let max_execution_time: u32 = integer_setting(
        max_execution_time,
        DEFAULT_MAX_EXECUTION_SECONDS,
        60..=u32::MAX,
        "LANGFUSE_AI_GATEWAY_MAX_EXECUTION_SECONDS must be an integer of at least 60",
    )?;
    let stall_timeout: u32 = integer_setting(
        stall_timeout,
        DEFAULT_STALL_TIMEOUT_SECONDS,
        1..=max_execution_time,
        "LANGFUSE_AI_GATEWAY_STALL_TIMEOUT_SECONDS must be an integer from 1 to LANGFUSE_AI_GATEWAY_MAX_EXECUTION_SECONDS",
    )?;
    Ok(ExecutionLimits {
        max_execution_time: Duration::from_secs(max_execution_time.into()),
        stall_timeout: Duration::from_secs(stall_timeout.into()),
    })
}

fn telemetry_buffer_bytes(value: Option<&str>) -> Result<usize, GatewayConfigError> {
    integer_setting(
        value,
        crate::telemetry::DEFAULT_RETAINED_BYTES,
        4 * MIB..=4096 * MIB,
        "LANGFUSE_AI_GATEWAY_TELEMETRY_BUFFER_BYTES must be an integer from 4194304 (4 MiB) to 4294967296 (4 GiB)",
    )
}

/// An unset value takes `default`. Errors carry only `message`, never the supplied value.
fn integer_setting<T: std::str::FromStr + PartialOrd>(
    value: Option<&str>,
    default: T,
    range: RangeInclusive<T>,
    message: &'static str,
) -> Result<T, GatewayConfigError> {
    value
        .map_or(Some(default), |value| value.parse().ok())
        .filter(|value| range.contains(value))
        .ok_or(GatewayConfigError(message))
}

fn read_env(name: &'static str) -> Result<Option<String>, GatewayConfigError> {
    match env::var(name) {
        Ok(value) => Ok(Some(value)),
        Err(env::VarError::NotPresent) => Ok(None),
        Err(env::VarError::NotUnicode(_)) => Err(GatewayConfigError(
            "gateway configuration contains a non-Unicode environment value",
        )),
    }
}

fn parse_boolean(value: &str) -> Option<bool> {
    match value {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configuration_parses_defaults_and_overrides() {
        let default = GatewayConfig::from_values(None, None, None, None, None).unwrap();
        assert_eq!(default.listen_address, "0.0.0.0:8080".parse().unwrap());
        assert!(!default.auto_increment_listen_port);
        assert_eq!(default.shutdown_timeout, Duration::from_secs(10));
        assert_eq!(default.log_level, LevelFilter::INFO);
        assert_eq!(default.log_format, LogFormat::Text);
        assert_eq!(default.telemetry_buffer_bytes, 64 * 1024 * 1024);
        let custom = GatewayConfig::from_values(
            Some("[::1]:9000"),
            Some("true"),
            Some("30"),
            Some("debug"),
            Some("json"),
        )
        .unwrap();
        assert_eq!(custom.listen_address, "[::1]:9000".parse().unwrap());
        assert!(custom.auto_increment_listen_port);
        assert_eq!(custom.shutdown_timeout, Duration::from_secs(30));
        assert_eq!(custom.log_level, LevelFilter::DEBUG);
        assert_eq!(custom.log_format, LogFormat::Json);
    }

    #[test]
    fn memory_budget_must_fit_a_maximal_request_with_its_overhead() {
        assert_eq!(
            request_limits(None, None, None).unwrap(),
            RequestLimits {
                max_request_bytes: 16 * MIB,
                memory_budget_bytes: 1024 * MIB,
                request_overhead_bytes: 2 * MIB,
            }
        );
        let fitting = request_limits(Some("1048576"), Some("1048576"), Some("0")).unwrap();
        assert_eq!(fitting.memory_budget_bytes, MIB);
        assert_eq!(fitting.request_overhead_bytes, 0);
        let budget = "LANGFUSE_AI_GATEWAY_MEMORY_BUDGET_BYTES";
        let overhead = "LANGFUSE_AI_GATEWAY_REQUEST_MEMORY_OVERHEAD_BYTES";
        for (max_request, budget_value, overhead_value, name) in [
            (Some("1048576"), Some("1048576"), Some("1"), budget),
            // One byte short of the default 16 MiB request plus 2 MiB overhead.
            (None, Some("18874367"), None, budget),
            (None, None, Some("-1"), overhead),
            (None, None, Some("secret-that-must-not-appear"), overhead),
            (None, Some("secret-that-must-not-appear"), None, budget),
        ] {
            let error = request_limits(max_request, budget_value, overhead_value)
                .err()
                .unwrap();
            assert!(error.to_string().starts_with(name), "{error}");
            assert!(!error.to_string().contains("secret-that-must-not-appear"));
        }
    }

    #[test]
    fn validates_shared_log_format() {
        for (value, expected) in [("text", LogFormat::Text), ("json", LogFormat::Json)] {
            assert_eq!(
                GatewayConfig::from_values(None, None, None, None, Some(value))
                    .unwrap()
                    .log_format,
                expected
            );
        }
        for value in ["", "TEXT", "pretty", "0", "secret-that-must-not-appear"] {
            let error = GatewayConfig::from_values(None, None, None, None, Some(value))
                .err()
                .unwrap();
            assert_eq!(
                error.to_string(),
                "LANGFUSE_LOG_FORMAT must be text or json"
            );
        }
    }

    #[test]
    fn accepts_shared_langfuse_log_levels() {
        for (value, expected) in [
            ("debug", LevelFilter::DEBUG),
            ("info", LevelFilter::INFO),
            ("warn", LevelFilter::WARN),
            ("error", LevelFilter::ERROR),
            ("fatal", LevelFilter::ERROR),
        ] {
            let config = GatewayConfig::from_values(None, None, None, Some(value), None).unwrap();
            assert_eq!(config.log_level, expected, "{value}");
        }
    }

    #[test]
    fn rejects_invalid_configuration_without_echoing_input() {
        let sensitive_input = "secret-that-must-not-appear";
        for (address, timeout, level) in [
            (Some(sensitive_input), None, None),
            (None, Some(sensitive_input), None),
            (None, None, Some(sensitive_input)),
            (None, None, Some("off")),
            (None, None, Some("trace")),
            (None, None, Some("INFO")),
            (None, None, Some("3")),
            (None, None, Some("")),
            (None, Some("0"), None),
            (None, Some("301"), None),
            (None, Some("-1"), None),
            (Some("localhost:8080"), None, None),
        ] {
            let error = GatewayConfig::from_values(address, None, timeout, level, None)
                .err()
                .unwrap();
            assert!(!error.to_string().contains(sensitive_input));
            assert!(!format!("{error:?}").contains(sensitive_input));
        }
        for value in ["", "TRUE", "1", sensitive_input] {
            let error = GatewayConfig::from_values(None, Some(value), None, None, None)
                .err()
                .unwrap();
            assert!(!error.to_string().contains(sensitive_input));
            assert!(!format!("{error:?}").contains(sensitive_input));
        }
    }

    #[test]
    fn telemetry_buffer_is_read_in_bytes_within_bounds() {
        assert_eq!(telemetry_buffer_bytes(None).unwrap(), 64 * 1024 * 1024);
        for value in [4_194_304, 67_108_864, 4_294_967_296] {
            assert_eq!(
                telemetry_buffer_bytes(Some(&value.to_string())).unwrap(),
                value
            );
        }
        for value in [
            "",
            "0",
            "64",
            "4194303",
            "4294967297",
            "-1",
            "1.5",
            "64MiB",
            "secret-that-must-not-appear",
        ] {
            let error = telemetry_buffer_bytes(Some(value)).err().unwrap();
            assert_eq!(
                error.to_string(),
                "LANGFUSE_AI_GATEWAY_TELEMETRY_BUFFER_BYTES must be an integer from 4194304 (4 MiB) to 4294967296 (4 GiB)"
            );
        }
    }
}
