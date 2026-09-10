use std::{env, error::Error, fmt, net::SocketAddr, time::Duration};
use tracing::level_filters::LevelFilter;

pub struct Config {
    pub listen_address: SocketAddr,
    pub shutdown_timeout: Duration,
    pub log_level: LevelFilter,
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
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_values(
            read_env("LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS")?.as_deref(),
            read_env("LANGFUSE_AI_GATEWAY_LOG_LEVEL")?.as_deref(),
        )
    }

    pub fn from_values(
        listen_address: Option<&str>,
        shutdown_timeout: Option<&str>,
        log_level: Option<&str>,
    ) -> Result<Self, ConfigError> {
        let listen_address = listen_address
            .unwrap_or("0.0.0.0:8080")
            .parse()
            .map_err(|_| {
                ConfigError("LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS must be an IP address and port")
            })?;
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
        let log_level = log_level.unwrap_or("info").parse().map_err(|_| {
            ConfigError(
                "LANGFUSE_AI_GATEWAY_LOG_LEVEL must be off, error, warn, info, debug or trace",
            )
        })?;
        Ok(Self {
            listen_address,
            shutdown_timeout: Duration::from_secs(seconds),
            log_level,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configuration_parses_defaults_and_overrides() {
        let default = Config::from_values(None, None, None).unwrap();
        assert_eq!(default.listen_address, "0.0.0.0:8080".parse().unwrap());
        assert_eq!(default.shutdown_timeout, Duration::from_secs(10));
        let custom = Config::from_values(Some("[::1]:9000"), Some("30"), Some("debug")).unwrap();
        assert_eq!(custom.listen_address, "[::1]:9000".parse().unwrap());
        assert_eq!(custom.shutdown_timeout, Duration::from_secs(30));
        assert_eq!(custom.log_level, LevelFilter::DEBUG);
    }

    #[test]
    fn rejects_invalid_configuration_without_echoing_input() {
        let sensitive_input = "secret-that-must-not-appear";
        for (address, timeout, level) in [
            (Some(sensitive_input), None, None),
            (None, Some(sensitive_input), None),
            (None, None, Some(sensitive_input)),
            (None, Some("0"), None),
            (None, Some("301"), None),
            (None, Some("-1"), None),
            (Some("localhost:8080"), None, None),
        ] {
            let error = Config::from_values(address, timeout, level).err().unwrap();
            assert!(!error.to_string().contains(sensitive_input));
            assert!(!format!("{error:?}").contains(sensitive_input));
        }
    }
}
