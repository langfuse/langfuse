use std::{env, error::Error, fmt, net::SocketAddr, time::Duration};
use tracing::level_filters::LevelFilter;

pub struct Config {
    pub listen_address: SocketAddr,
    pub auto_increment_listen_port: bool,
    pub shutdown_timeout: Duration,
    pub log_level: LevelFilter,
    pub log_format: LogFormat,
}

#[derive(Debug, PartialEq, Eq)]
pub enum LogFormat {
    Text,
    Json,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ConfigError(&'static str);

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}

impl Error for ConfigError {}

impl Config {
    /// Read gateway configuration from the process environment, using defaults for absent values.
    ///
    /// # Errors
    /// Returns an error if a configured value is not Unicode or fails validation
    /// in [`Self::from_values`]. Error messages never include the supplied values.
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_values(
            read_env("LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_AUTO_INCREMENT_LISTEN_PORT")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS")?.as_deref(),
            read_env("LANGFUSE_LOG_LEVEL")?.as_deref(),
            read_env("LANGFUSE_LOG_FORMAT")?.as_deref(),
        )
    }

    /// Parse gateway configuration, using defaults for absent values.
    ///
    /// # Errors
    /// Returns an error for an invalid IP address and port, a shutdown timeout outside
    /// 1–300 integer seconds, or an unsupported log level or format.
    pub fn from_values(
        listen_address: Option<&str>,
        auto_increment_listen_port: Option<&str>,
        shutdown_timeout: Option<&str>,
        log_level: Option<&str>,
        log_format: Option<&str>,
    ) -> Result<Self, ConfigError> {
        let listen_address = listen_address
            .unwrap_or("0.0.0.0:8080")
            .parse()
            .map_err(|_| {
                ConfigError("LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS must be an IP address and port")
            })?;
        let auto_increment_listen_port =
            parse_boolean(auto_increment_listen_port.unwrap_or("false")).ok_or(ConfigError(
                "LANGFUSE_AI_GATEWAY_AUTO_INCREMENT_LISTEN_PORT must be true or false",
            ))?;
        let seconds: u64 = shutdown_timeout.unwrap_or("10").parse().map_err(|_| {
            ConfigError(
                "LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS must be an integer from 1 to 300",
            )
        })?;
        if !(1..=300).contains(&seconds) {
            return Err(ConfigError(
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
                return Err(ConfigError(
                    "LANGFUSE_LOG_LEVEL must be trace, debug, info, warn, error or fatal",
                ));
            }
        };
        let log_format = match log_format.unwrap_or("text") {
            "text" => LogFormat::Text,
            "json" => LogFormat::Json,
            _ => return Err(ConfigError("LANGFUSE_LOG_FORMAT must be text or json")),
        };
        Ok(Self {
            listen_address,
            auto_increment_listen_port,
            shutdown_timeout: Duration::from_secs(seconds),
            log_level,
            log_format,
        })
    }
}

fn read_env(name: &'static str) -> Result<Option<String>, ConfigError> {
    match env::var(name) {
        Ok(value) => Ok(Some(value)),
        Err(env::VarError::NotPresent) => Ok(None),
        Err(env::VarError::NotUnicode(_)) => Err(ConfigError(
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
        let default = Config::from_values(None, None, None, None, None).unwrap();
        assert_eq!(default.listen_address, "0.0.0.0:8080".parse().unwrap());
        assert!(!default.auto_increment_listen_port);
        assert_eq!(default.shutdown_timeout, Duration::from_secs(10));
        assert_eq!(default.log_level, LevelFilter::INFO);
        assert_eq!(default.log_format, LogFormat::Text);
        let custom = Config::from_values(
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
    fn validates_shared_log_format() {
        for (value, expected) in [("text", LogFormat::Text), ("json", LogFormat::Json)] {
            assert_eq!(
                Config::from_values(None, None, None, None, Some(value))
                    .unwrap()
                    .log_format,
                expected
            );
        }
        for value in ["", "TEXT", "pretty", "0", "secret-that-must-not-appear"] {
            let error = Config::from_values(None, None, None, None, Some(value))
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
            let config = Config::from_values(None, None, None, Some(value), None).unwrap();
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
            let error = Config::from_values(address, None, timeout, level, None)
                .err()
                .unwrap();
            assert!(!error.to_string().contains(sensitive_input));
            assert!(!format!("{error:?}").contains(sensitive_input));
        }
        for value in ["", "TRUE", "1", sensitive_input] {
            let error = Config::from_values(None, Some(value), None, None, None)
                .err()
                .unwrap();
            assert!(!error.to_string().contains(sensitive_input));
            assert!(!format!("{error:?}").contains(sensitive_input));
        }
    }
}
