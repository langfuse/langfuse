use crate::resolution::ControlPlaneConfig;
use std::{env, error::Error, fmt, net::SocketAddr, time::Duration};
use tracing::level_filters::LevelFilter;

pub struct GatewayConfig {
    pub control_plane: Option<ControlPlaneConfig>,
    pub listen_address: SocketAddr,
    pub auto_increment_listen_port: bool,
    pub shutdown_timeout: Duration,
    pub log_level: LevelFilter,
    pub log_format: LogFormat,
    pub max_active_requests: usize,
    pub max_concurrent_resolutions: usize,
}

#[derive(Debug, PartialEq, Eq)]
pub enum LogFormat {
    Text,
    Json,
}

#[derive(Debug, PartialEq, Eq)]
pub struct GatewayConfigError(&'static str);

impl fmt::Display for GatewayConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}

impl Error for GatewayConfigError {}

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
            read_env("LANGFUSE_AI_GATEWAY_MAX_ACTIVE_REQUESTS")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_MAX_CONCURRENT_RESOLUTIONS")?.as_deref(),
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
    /// an unsupported log level or format, or concurrency
    /// limits outside 1 through [`tokio::sync::Semaphore::MAX_PERMITS`].
    pub fn from_values(
        listen_address: Option<&str>,
        auto_increment_listen_port: Option<&str>,
        shutdown_timeout: Option<&str>,
        log_level: Option<&str>,
        log_format: Option<&str>,
        max_active_requests: Option<&str>,
        max_concurrent_resolutions: Option<&str>,
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
        let seconds: u64 = shutdown_timeout.unwrap_or("10").parse().map_err(|_| {
            GatewayConfigError(
                "LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS must be an integer from 1 to 300",
            )
        })?;
        if !(1..=300).contains(&seconds) {
            return Err(GatewayConfigError(
                "LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS must be an integer from 1 to 300",
            ));
        }
        let log_level = match log_level.unwrap_or("info") {
            "trace" => LevelFilter::TRACE,
            "debug" => LevelFilter::DEBUG,
            "info" => LevelFilter::INFO,
            "warn" => LevelFilter::WARN,
            // Tracing has no separate fatal severity.
            "error" | "fatal" => LevelFilter::ERROR,
            _ => {
                return Err(GatewayConfigError(
                    "LANGFUSE_LOG_LEVEL must be trace, debug, info, warn, error or fatal",
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
            max_active_requests: concurrency_limit(
                max_active_requests,
                "LANGFUSE_AI_GATEWAY_MAX_ACTIVE_REQUESTS must be a positive integer within the semaphore capacity",
            )?,
            max_concurrent_resolutions: concurrency_limit(
                max_concurrent_resolutions,
                "LANGFUSE_AI_GATEWAY_MAX_CONCURRENT_RESOLUTIONS must be a positive integer within the semaphore capacity",
            )?,
        })
    }
}

fn concurrency_limit(
    value: Option<&str>,
    message: &'static str,
) -> Result<usize, GatewayConfigError> {
    value
        .unwrap_or("128")
        .parse::<usize>()
        .ok()
        .filter(|limit| (1..=tokio::sync::Semaphore::MAX_PERMITS).contains(limit))
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
        let default = GatewayConfig::from_values(None, None, None, None, None, None, None).unwrap();
        assert_eq!(default.listen_address, "0.0.0.0:8080".parse().unwrap());
        assert!(!default.auto_increment_listen_port);
        assert_eq!(default.shutdown_timeout, Duration::from_secs(10));
        assert_eq!(default.log_level, LevelFilter::INFO);
        assert_eq!(default.log_format, LogFormat::Text);
        assert_eq!(default.max_active_requests, 128);
        assert_eq!(default.max_concurrent_resolutions, 128);
        let custom = GatewayConfig::from_values(
            Some("[::1]:9000"),
            Some("true"),
            Some("30"),
            Some("debug"),
            Some("json"),
            Some("256"),
            Some("32"),
        )
        .unwrap();
        assert_eq!(custom.listen_address, "[::1]:9000".parse().unwrap());
        assert!(custom.auto_increment_listen_port);
        assert_eq!(custom.shutdown_timeout, Duration::from_secs(30));
        assert_eq!(custom.log_level, LevelFilter::DEBUG);
        assert_eq!(custom.log_format, LogFormat::Json);
        assert_eq!(custom.max_active_requests, 256);
        assert_eq!(custom.max_concurrent_resolutions, 32);
    }

    #[test]
    fn validates_shared_log_format() {
        for (value, expected) in [("text", LogFormat::Text), ("json", LogFormat::Json)] {
            assert_eq!(
                GatewayConfig::from_values(None, None, None, None, Some(value), None, None)
                    .unwrap()
                    .log_format,
                expected
            );
        }
        for value in ["", "TEXT", "pretty", "0", "secret-that-must-not-appear"] {
            let error = GatewayConfig::from_values(None, None, None, None, Some(value), None, None)
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
            ("trace", LevelFilter::TRACE),
            ("debug", LevelFilter::DEBUG),
            ("info", LevelFilter::INFO),
            ("warn", LevelFilter::WARN),
            ("error", LevelFilter::ERROR),
            ("fatal", LevelFilter::ERROR),
        ] {
            let config =
                GatewayConfig::from_values(None, None, None, Some(value), None, None, None)
                    .unwrap();
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
            (None, None, Some("INFO")),
            (None, None, Some("3")),
            (None, None, Some("")),
            (None, Some("0"), None),
            (None, Some("301"), None),
            (None, Some("-1"), None),
            (Some("localhost:8080"), None, None),
        ] {
            let error = GatewayConfig::from_values(address, None, timeout, level, None, None, None)
                .err()
                .unwrap();
            assert!(!error.to_string().contains(sensitive_input));
            assert!(!format!("{error:?}").contains(sensitive_input));
        }
        for value in ["", "TRUE", "1", sensitive_input] {
            let error = GatewayConfig::from_values(None, Some(value), None, None, None, None, None)
                .err()
                .unwrap();
            assert!(!error.to_string().contains(sensitive_input));
            assert!(!format!("{error:?}").contains(sensitive_input));
        }
    }

    #[test]
    fn concurrency_limits_reject_invalid_values_and_accept_boundaries() {
        let maximum = tokio::sync::Semaphore::MAX_PERMITS.to_string();
        let overflow = (tokio::sync::Semaphore::MAX_PERMITS + 1).to_string();
        for value in ["1", maximum.as_str()] {
            let config =
                GatewayConfig::from_values(None, None, None, None, None, Some(value), Some(value))
                    .unwrap();
            assert_eq!(config.max_active_requests, value.parse::<usize>().unwrap());
            assert_eq!(
                config.max_concurrent_resolutions,
                value.parse::<usize>().unwrap()
            );
        }
        for value in [
            "0",
            "-1",
            "1.5",
            "",
            "secret-that-must-not-appear",
            overflow.as_str(),
        ] {
            for (active, resolutions, name) in [
                (Some(value), None, "LANGFUSE_AI_GATEWAY_MAX_ACTIVE_REQUESTS"),
                (
                    None,
                    Some(value),
                    "LANGFUSE_AI_GATEWAY_MAX_CONCURRENT_RESOLUTIONS",
                ),
            ] {
                let error =
                    GatewayConfig::from_values(None, None, None, None, None, active, resolutions)
                        .err()
                        .unwrap();
                assert!(error.to_string().contains(name));
                assert!(!error.to_string().contains("secret-that-must-not-appear"));
            }
        }
    }
}
