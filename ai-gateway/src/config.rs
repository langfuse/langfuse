use crate::{providers::OutboundPolicy, resolution::ControlPlaneConfig};
use std::{env, net::SocketAddr, ops::RangeInclusive, str::FromStr, time::Duration};
use tracing::level_filters::LevelFilter;

pub struct GatewayConfig {
    pub control_plane: Option<ControlPlaneConfig>,
    pub listen_address: SocketAddr,
    pub auto_increment_listen_port: bool,
    /// Connection drain after the shutdown signal. Behind an ALB, deregistration has
    /// already drained streams on SIGTERM; on Kubernetes this drain is the only one.
    pub connection_drain_timeout: Duration,
    /// The connection drain timeout was read from its deprecated name.
    pub uses_deprecated_connection_drain_timeout_name: bool,
    /// A Web URL is configured but the service key is unset or blank, and
    /// `LANGFUSE_AI_GATEWAY_ALLOW_MISSING_SERVICE_KEY` lets the gateway start unconfigured.
    pub has_web_url_without_service_key: bool,
    /// Budget for flushing telemetry, starting once connection draining ends. The
    /// orchestrator grace period must cover both timeouts (ECS `stopTimeout` is at most 120 s).
    pub telemetry_shutdown_timeout: Duration,
    pub log_level: LevelFilter,
    pub log_format: LogFormat,
    pub telemetry_buffer_bytes: usize,
    pub request_limits: RequestLimits,
    pub memory_budget_source: MemoryBudgetSource,
    pub execution_limits: ExecutionLimits,
    pub outbound_policy: OutboundPolicy,
    /// LLM connection whitelist entries that do not parse and so exempt nothing.
    pub ignored_whitelist_entries: Vec<String>,
}

/// Where the memory budget came from, for the startup log.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MemoryBudgetSource {
    Configured,
    CgroupLimit,
    Default,
}

impl MemoryBudgetSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Configured => "configured",
            Self::CgroupLimit => "cgroup_limit",
            Self::Default => "default",
        }
    }
}

const MIB: usize = 1024 * 1024;
const SEMAPHORE_CAPACITY: usize = tokio::sync::Semaphore::MAX_PERMITS;
pub const DEFAULT_MAX_REQUEST_BYTES: usize = 16 * MIB;
const DEFAULT_MEMORY_BUDGET_BYTES: usize = 1024 * MIB;

/// Share of the cgroup memory limit, before the telemetry buffer, that requests may
/// reserve. The rest covers the runtime, TLS, allocator slack and catalogs.
const MEMORY_LIMIT_BUDGET_NUMERATOR: usize = 3;
const MEMORY_LIMIT_BUDGET_DENOMINATOR: usize = 5;

/// cgroup v1 reports "unlimited" as a value near `i64::MAX`.
const UNLIMITED_CGROUP_MEMORY_BYTES: u64 = 1 << 60;
const CGROUP_MEMORY_LIMIT_FILES: [&str; 2] = [
    "/sys/fs/cgroup/memory.max",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes",
];

const DEFAULT_REQUEST_OVERHEAD_BYTES: usize = MIB;
const DEFAULT_MAX_EXECUTION_SECONDS: u32 = 10 * 60;
const DEFAULT_STALL_TIMEOUT_SECONDS: u32 = 120;
const DEFAULT_SHUTDOWN_TIMEOUT_SECONDS: u64 = 10;
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
    /// or service key, a missing service key unless explicitly allowed, or a
    /// non-boolean HTTP Web URL or missing-key opt-in. Error
    /// messages never include supplied values.
    pub fn from_env() -> Result<Self, GatewayConfigError> {
        let (connection_drain_timeout, uses_deprecated_connection_drain_timeout_name) =
            connection_drain_timeout_value(
                read_env("LANGFUSE_AI_GATEWAY_CONNECTION_DRAIN_TIMEOUT_SECONDS")?,
                read_env("LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS")?,
            );
        let mut config = Self::from_values(
            read_env("LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_AUTO_INCREMENT_LISTEN_PORT")?.as_deref(),
            connection_drain_timeout.as_deref(),
            read_env("LANGFUSE_LOG_LEVEL")?.as_deref(),
            read_env("LANGFUSE_LOG_FORMAT")?.as_deref(),
        )?;
        config.uses_deprecated_connection_drain_timeout_name =
            uses_deprecated_connection_drain_timeout_name;
        config.telemetry_buffer_bytes = telemetry_buffer_bytes(
            read_env("LANGFUSE_AI_GATEWAY_TELEMETRY_BUFFER_BYTES")?.as_deref(),
        )?;
        config.telemetry_shutdown_timeout = telemetry_shutdown_timeout(
            read_env("LANGFUSE_AI_GATEWAY_TELEMETRY_SHUTDOWN_TIMEOUT_SECONDS")?.as_deref(),
        )?;
        let memory_budget = read_env("LANGFUSE_AI_GATEWAY_MEMORY_BUDGET_BYTES")?;
        let derived_budget = memory_budget_for_limit(
            cgroup_memory_limit(&CGROUP_MEMORY_LIMIT_FILES),
            config.telemetry_buffer_bytes,
        );
        config.memory_budget_source = match (&memory_budget, derived_budget) {
            (Some(_), _) => MemoryBudgetSource::Configured,
            (None, Some(_)) => MemoryBudgetSource::CgroupLimit,
            (None, None) => MemoryBudgetSource::Default,
        };
        config.request_limits = request_limits(
            read_env("LANGFUSE_AI_GATEWAY_MAX_REQUEST_BYTES")?.as_deref(),
            memory_budget.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_REQUEST_MEMORY_OVERHEAD_BYTES")?.as_deref(),
            derived_budget.unwrap_or(DEFAULT_MEMORY_BUDGET_BYTES),
        )?;
        config.execution_limits = execution_limits(
            read_env("LANGFUSE_AI_GATEWAY_MAX_EXECUTION_SECONDS")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_STALL_TIMEOUT_SECONDS")?.as_deref(),
        )?;
        let web_url = read_env("LANGFUSE_AI_GATEWAY_WEB_URL")?;
        let service_key = read_env("LANGFUSE_AI_GATEWAY_SERVICE_KEY")?;
        config.control_plane = control_plane(
            web_url.as_deref(),
            service_key.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_ALLOW_HTTP_WEB_URL")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_ALLOW_MISSING_SERVICE_KEY")?.as_deref(),
        )?;
        config.has_web_url_without_service_key =
            config.control_plane.is_none() && web_url.as_deref().is_some_and(|url| !url.is_empty());
        (config.outbound_policy, config.ignored_whitelist_entries) = outbound_policy(
            read_env("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION")?.as_deref(),
            read_env("LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST")?.as_deref(),
            read_env("LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS")?.as_deref(),
            read_env("LANGFUSE_LLM_CONNECTION_WHITELISTED_IP_SEGMENTS")?.as_deref(),
            read_env("LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS")?.as_deref(),
            read_env("LANGFUSE_OUTBOUND_BLOCKED_IP_SEGMENTS")?.as_deref(),
        )?;
        Ok(config)
    }

    /// Parse gateway configuration, using defaults for absent values.
    ///
    /// # Errors
    /// Returns an error for an invalid IP address and port, a non-boolean port
    /// auto-increment setting, a connection drain timeout outside 1–300 integer seconds,
    /// or an unsupported log level or format.
    pub fn from_values(
        listen_address: Option<&str>,
        auto_increment_listen_port: Option<&str>,
        connection_drain_timeout: Option<&str>,
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
            connection_drain_timeout,
            DEFAULT_SHUTDOWN_TIMEOUT_SECONDS,
            1..=300,
            "LANGFUSE_AI_GATEWAY_CONNECTION_DRAIN_TIMEOUT_SECONDS (or the deprecated LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS) must be an integer from 1 to 300",
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
            connection_drain_timeout: Duration::from_secs(seconds),
            uses_deprecated_connection_drain_timeout_name: false,
            has_web_url_without_service_key: false,
            telemetry_shutdown_timeout: Duration::from_secs(DEFAULT_SHUTDOWN_TIMEOUT_SECONDS),
            log_level,
            log_format,
            telemetry_buffer_bytes: crate::telemetry::DEFAULT_RETAINED_BYTES,
            request_limits: RequestLimits::default(),
            memory_budget_source: MemoryBudgetSource::Default,
            execution_limits: ExecutionLimits::default(),
            outbound_policy: OutboundPolicy::default(),
            ignored_whitelist_entries: Vec::new(),
        })
    }
}

/// Reads the provider SSRF policy from the variables Web uses for LLM connections,
/// so one setting opens a private host for both. Like Web, Langfuse Cloud ignores
/// the whitelists and requires HTTPS. Web never rejects a malformed whitelist entry,
/// so one is returned for a warning rather than failing startup; it exempts nothing.
fn outbound_policy(
    cloud_region: Option<&str>,
    whitelisted_hosts: Option<&str>,
    whitelisted_ips: Option<&str>,
    whitelisted_ranges: Option<&str>,
    allowed_hosts: Option<&str>,
    blocked_ranges: Option<&str>,
) -> Result<(OutboundPolicy, Vec<String>), GatewayConfigError> {
    let blocked_ranges = parse_list(
        blocked_ranges,
        "LANGFUSE_OUTBOUND_BLOCKED_IP_SEGMENTS must be a comma-separated list of CIDR ranges",
    )?;
    if cloud_region.is_some_and(|region| !region.trim().is_empty()) {
        let policy = OutboundPolicy {
            blocked_ranges,
            require_https: true,
            ..OutboundPolicy::default()
        };
        return Ok((policy, Vec::new()));
    }
    let mut ignored = Vec::new();
    let policy = OutboundPolicy {
        whitelisted_hosts: comma_separated(whitelisted_hosts).map(unbracket).collect(),
        whitelisted_ips: parse_whitelist(
            whitelisted_ips,
            "LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS",
            &mut ignored,
        ),
        whitelisted_ranges: parse_whitelist(
            whitelisted_ranges,
            "LANGFUSE_LLM_CONNECTION_WHITELISTED_IP_SEGMENTS",
            &mut ignored,
        ),
        allowed_hosts: comma_separated(allowed_hosts).map(unbracket).collect(),
        blocked_ranges,
        require_https: false,
    };
    Ok((policy, ignored))
}

/// Web compares IPv6 hosts in their bracketed URL form; the gateway compares the bare address.
fn unbracket(host: String) -> String {
    match host
        .strip_prefix('[')
        .and_then(|host| host.strip_suffix(']'))
    {
        Some(ip) => ip.to_owned(),
        None => host,
    }
}

fn parse_whitelist<T: FromStr>(
    value: Option<&str>,
    name: &str,
    ignored: &mut Vec<String>,
) -> Vec<T> {
    comma_separated(value)
        .map(unbracket)
        .filter_map(|entry| {
            let parsed = entry.parse().ok();
            if parsed.is_none() {
                ignored.push(format!("{name}={entry}"));
            }
            parsed
        })
        .collect()
}

fn comma_separated(value: Option<&str>) -> impl Iterator<Item = String> + '_ {
    value
        .unwrap_or_default()
        .split(',')
        .map(|entry| entry.trim().to_lowercase())
        .filter(|entry| !entry.is_empty())
}

fn parse_list<T: FromStr>(
    value: Option<&str>,
    message: &'static str,
) -> Result<Vec<T>, GatewayConfigError> {
    comma_separated(value)
        .map(|entry| entry.parse().map_err(|_| GatewayConfigError(message)))
        .collect()
}

fn control_plane(
    web_url: Option<&str>,
    service_key: Option<&str>,
    allow_http_web_url: Option<&str>,
    allow_missing_service_key: Option<&str>,
) -> Result<Option<ControlPlaneConfig>, GatewayConfigError> {
    let allow_http_web_url = parse_boolean(allow_http_web_url.unwrap_or("false")).ok_or(
        GatewayConfigError("LANGFUSE_AI_GATEWAY_ALLOW_HTTP_WEB_URL must be true or false"),
    )?;
    let allow_missing_service_key = parse_boolean(allow_missing_service_key.unwrap_or("false"))
        .ok_or(GatewayConfigError(
            "LANGFUSE_AI_GATEWAY_ALLOW_MISSING_SERVICE_KEY must be true or false",
        ))?;
    let Some(web_url) = web_url.filter(|url| !url.is_empty()) else {
        return Ok(None);
    };
    let Some(service_key) = service_key.filter(|key| is_set(key)) else {
        return if allow_missing_service_key {
            Ok(None)
        } else {
            Err(GatewayConfigError(
                "LANGFUSE_AI_GATEWAY_SERVICE_KEY is required when LANGFUSE_AI_GATEWAY_WEB_URL is set",
            ))
        };
    };
    let control_plane = if allow_http_web_url {
        ControlPlaneConfig::with_plain_http(web_url, service_key)
    } else {
        ControlPlaneConfig::new(web_url, service_key)
    };
    control_plane.map(Some).map_err(|_| {
        GatewayConfigError("invalid LANGFUSE_AI_GATEWAY_WEB_URL or LANGFUSE_AI_GATEWAY_SERVICE_KEY")
    })
}

fn request_limits(
    max_request_bytes: Option<&str>,
    memory_budget_bytes: Option<&str>,
    request_overhead_bytes: Option<&str>,
    default_memory_budget_bytes: usize,
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
    // A default is raised to fit one maximal request; a configured value must already fit.
    let memory_budget_bytes = integer_setting(
        memory_budget_bytes,
        default_memory_budget_bytes.clamp(largest_request, SEMAPHORE_CAPACITY),
        largest_request..=SEMAPHORE_CAPACITY,
        "LANGFUSE_AI_GATEWAY_MEMORY_BUDGET_BYTES must be an integer of at least LANGFUSE_AI_GATEWAY_MAX_REQUEST_BYTES plus LANGFUSE_AI_GATEWAY_REQUEST_MEMORY_OVERHEAD_BYTES within the semaphore capacity",
    )?;
    Ok(RequestLimits {
        max_request_bytes,
        memory_budget_bytes,
        request_overhead_bytes,
    })
}

/// The first readable cgroup v2 or v1 memory limit, or `None` when unlimited or absent.
fn cgroup_memory_limit(files: &[&str]) -> Option<usize> {
    files
        .iter()
        .find_map(|file| std::fs::read_to_string(file).ok())
        .and_then(|contents| parse_cgroup_memory_limit(&contents))
}

fn parse_cgroup_memory_limit(contents: &str) -> Option<usize> {
    contents
        .trim()
        .parse::<u64>()
        .ok()
        .filter(|limit| (1..UNLIMITED_CGROUP_MEMORY_BYTES).contains(limit))
        .and_then(|limit| usize::try_from(limit).ok())
}

/// The budget a memory limit leaves for requests once the telemetry buffer is set aside.
fn memory_budget_for_limit(
    memory_limit: Option<usize>,
    telemetry_buffer_bytes: usize,
) -> Option<usize> {
    memory_limit.map(|limit| {
        (limit / MEMORY_LIMIT_BUDGET_DENOMINATOR * MEMORY_LIMIT_BUDGET_NUMERATOR)
            .saturating_sub(telemetry_buffer_bytes)
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

/// The current name wins; the deprecated name keeps released deployments working.
fn connection_drain_timeout_value(
    current: Option<String>,
    deprecated: Option<String>,
) -> (Option<String>, bool) {
    match (current, deprecated) {
        (Some(value), _) => (Some(value), false),
        (None, Some(value)) => (Some(value), true),
        (None, None) => (None, false),
    }
}

fn telemetry_shutdown_timeout(value: Option<&str>) -> Result<Duration, GatewayConfigError> {
    integer_setting(
        value,
        DEFAULT_SHUTDOWN_TIMEOUT_SECONDS,
        1..=300,
        "LANGFUSE_AI_GATEWAY_TELEMETRY_SHUTDOWN_TIMEOUT_SECONDS must be an integer from 1 to 300",
    )
    .map(Duration::from_secs)
}

/// An unset value takes `default`. Errors carry only `message`, never the supplied value.
fn integer_setting<T: FromStr + PartialOrd>(
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

fn is_set(value: &str) -> bool {
    !value.trim().is_empty()
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
    fn outbound_policy_reads_web_whitelist_lists() {
        let (policy, ignored) = outbound_policy(
            None,
            Some(" LLM.corp , [FD00::1]"),
            Some("10.0.0.5,[fd00::2],10.0.0.6/32"),
            Some("192.168.0.0/16,10.0.0.7"),
            Some("llm.corp,api.openai.com"),
            Some("93.184.216.0/24"),
        )
        .unwrap();
        assert_eq!(policy.whitelisted_hosts, ["llm.corp", "fd00::1"]);
        assert_eq!(
            policy.whitelisted_ips,
            [
                "10.0.0.5".parse::<std::net::IpAddr>().unwrap(),
                "fd00::2".parse().unwrap()
            ]
        );
        assert_eq!(policy.whitelisted_ranges.len(), 1);
        assert_eq!(policy.allowed_hosts, ["llm.corp", "api.openai.com"]);
        assert_eq!(policy.blocked_ranges.len(), 1);
        assert!(!policy.require_https);
        assert_eq!(
            ignored,
            [
                "LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS=10.0.0.6/32",
                "LANGFUSE_LLM_CONNECTION_WHITELISTED_IP_SEGMENTS=10.0.0.7"
            ]
        );

        assert!(outbound_policy(None, None, None, None, None, Some("10.0.0.0/33")).is_err());
    }

    #[test]
    fn outbound_policy_on_cloud_ignores_whitelists_and_requires_https() {
        let policy = outbound_policy(
            Some("EU"),
            Some("llm.corp"),
            Some("10.0.0.5"),
            Some("192.168.0.0/16"),
            Some("llm.corp"),
            Some("93.184.216.0/24"),
        )
        .unwrap()
        .0;
        assert!(policy.require_https);
        assert!(policy.whitelisted_hosts.is_empty());
        assert!(policy.whitelisted_ips.is_empty());
        assert!(policy.whitelisted_ranges.is_empty());
        assert!(policy.allowed_hosts.is_empty());
        assert_eq!(policy.blocked_ranges.len(), 1);

        assert!(
            !outbound_policy(Some(" "), None, None, None, None, None)
                .unwrap()
                .0
                .require_https
        );
    }

    #[test]
    fn configuration_parses_defaults_and_overrides() {
        let default = GatewayConfig::from_values(None, None, None, None, None).unwrap();
        assert_eq!(default.listen_address, "0.0.0.0:8080".parse().unwrap());
        assert!(!default.auto_increment_listen_port);
        assert_eq!(default.connection_drain_timeout, Duration::from_secs(10));
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
        assert_eq!(custom.connection_drain_timeout, Duration::from_secs(30));
        assert_eq!(custom.log_level, LevelFilter::DEBUG);
        assert_eq!(custom.log_format, LogFormat::Json);
    }

    #[test]
    fn memory_budget_must_fit_a_maximal_request_with_its_overhead() {
        let default_budget = DEFAULT_MEMORY_BUDGET_BYTES;
        assert_eq!(
            request_limits(None, None, None, default_budget).unwrap(),
            RequestLimits {
                max_request_bytes: 16 * MIB,
                memory_budget_bytes: 1024 * MIB,
                request_overhead_bytes: MIB,
            }
        );
        let fitting =
            request_limits(Some("1048576"), Some("1048576"), Some("0"), default_budget).unwrap();
        assert_eq!(fitting.memory_budget_bytes, MIB);
        assert_eq!(fitting.request_overhead_bytes, 0);
        let budget = "LANGFUSE_AI_GATEWAY_MEMORY_BUDGET_BYTES";
        let overhead = "LANGFUSE_AI_GATEWAY_REQUEST_MEMORY_OVERHEAD_BYTES";
        for (max_request, budget_value, overhead_value, name) in [
            (Some("1048576"), Some("1048576"), Some("1"), budget),
            // One byte short of the default 16 MiB request plus 1 MiB overhead.
            (None, Some("17825791"), None, budget),
            (None, None, Some("-1"), overhead),
            (None, None, Some("secret-that-must-not-appear"), overhead),
            (None, Some("secret-that-must-not-appear"), None, budget),
        ] {
            let error = request_limits(max_request, budget_value, overhead_value, default_budget)
                .err()
                .unwrap();
            assert!(error.to_string().starts_with(name), "{error}");
            assert!(!error.to_string().contains("secret-that-must-not-appear"));
        }
    }

    #[test]
    fn memory_budget_defaults_to_a_share_of_the_cgroup_limit() {
        for (contents, limit) in [
            ("4294967296\n", Some(4096 * MIB)),
            ("2147483648", Some(2048 * MIB)),
            ("max\n", None),
            // cgroup v1 without a limit.
            ("9223372036854771712\n", None),
            ("0", None),
            ("", None),
        ] {
            assert_eq!(parse_cgroup_memory_limit(contents), limit, "{contents:?}");
        }
        let telemetry = 64 * MIB;
        // A 3312 MiB container: 0.6 × 3312 MiB minus the telemetry buffer.
        assert_eq!(
            memory_budget_for_limit(Some(3312 * MIB), telemetry),
            Some(3312 * MIB / 5 * 3 - telemetry)
        );
        assert_eq!(memory_budget_for_limit(None, telemetry), None);
        assert_eq!(memory_budget_for_limit(Some(64 * MIB), telemetry), Some(0));
        let tiny = memory_budget_for_limit(Some(64 * MIB), telemetry).unwrap();
        assert_eq!(
            request_limits(None, None, None, tiny)
                .unwrap()
                .memory_budget_bytes,
            17 * MIB
        );
        assert_eq!(
            request_limits(None, Some("1073741824"), None, tiny)
                .unwrap()
                .memory_budget_bytes,
            1024 * MIB
        );
        assert_eq!(
            cgroup_memory_limit(&["/nonexistent/memory.max", "/nonexistent/limit"]),
            None
        );
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
    fn plain_http_web_url_requires_the_explicit_opt_in() {
        let in_cluster = Some("http://langfuse-web.langfuse.svc.cluster.local:3000");
        let key = Some("service-key");
        for opt_in in [None, Some("false")] {
            let error = control_plane(in_cluster, key, opt_in, None).err().unwrap();
            assert_eq!(
                error.to_string(),
                "invalid LANGFUSE_AI_GATEWAY_WEB_URL or LANGFUSE_AI_GATEWAY_SERVICE_KEY"
            );
        }
        let allowed = control_plane(in_cluster, key, Some("true"), None)
            .unwrap()
            .unwrap();
        assert!(allowed.is_plain_http());
        assert_eq!(
            allowed
                .endpoint("/api/internal/ai-gateway/v1/ingestion")
                .as_str(),
            "http://langfuse-web.langfuse.svc.cluster.local:3000/api/internal/ai-gateway/v1/ingestion"
        );
        for (url, opt_in) in [
            ("https://cloud.langfuse.com", Some("true")),
            ("http://localhost:3000", None),
        ] {
            let config = control_plane(Some(url), key, opt_in, None)
                .unwrap()
                .unwrap();
            assert!(!config.is_plain_http(), "{url}");
        }
        assert!(
            control_plane(None, None, Some("true"), None)
                .unwrap()
                .is_none()
        );
        for missing_key in [None, Some(""), Some("  ")] {
            assert_eq!(
                control_plane(in_cluster, missing_key, Some("true"), None)
                    .err()
                    .unwrap()
                    .to_string(),
                "LANGFUSE_AI_GATEWAY_SERVICE_KEY is required when LANGFUSE_AI_GATEWAY_WEB_URL is set"
            );
            assert!(
                control_plane(in_cluster, missing_key, Some("true"), Some("true"))
                    .unwrap()
                    .is_none()
            );
        }
        for value in ["", "TRUE", "1", "secret-that-must-not-appear"] {
            let error = control_plane(in_cluster, key, Some(value), None)
                .err()
                .unwrap();
            assert_eq!(
                error.to_string(),
                "LANGFUSE_AI_GATEWAY_ALLOW_HTTP_WEB_URL must be true or false"
            );
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

    #[test]
    fn connection_drain_timeout_falls_back_to_its_deprecated_name() {
        let value = |text: &str| Some(text.to_owned());
        assert_eq!(connection_drain_timeout_value(None, None), (None, false));
        assert_eq!(
            connection_drain_timeout_value(value("5"), None),
            (value("5"), false)
        );
        assert_eq!(
            connection_drain_timeout_value(None, value("7")),
            (value("7"), true)
        );
        assert_eq!(
            connection_drain_timeout_value(value("5"), value("7")),
            (value("5"), false)
        );
    }

    #[test]
    fn telemetry_shutdown_timeout_is_read_in_seconds_within_bounds() {
        assert_eq!(
            GatewayConfig::from_values(None, None, None, None, None)
                .unwrap()
                .telemetry_shutdown_timeout,
            Duration::from_secs(10)
        );
        assert_eq!(
            telemetry_shutdown_timeout(None).unwrap(),
            Duration::from_secs(10)
        );
        for value in [1, 120, 300] {
            assert_eq!(
                telemetry_shutdown_timeout(Some(&value.to_string())).unwrap(),
                Duration::from_secs(value)
            );
        }
        for value in ["", "0", "301", "-1", "1.5", "secret-that-must-not-appear"] {
            let error = telemetry_shutdown_timeout(Some(value)).err().unwrap();
            assert_eq!(
                error.to_string(),
                "LANGFUSE_AI_GATEWAY_TELEMETRY_SHUTDOWN_TIMEOUT_SECONDS must be an integer from 1 to 300"
            );
        }
    }
}
