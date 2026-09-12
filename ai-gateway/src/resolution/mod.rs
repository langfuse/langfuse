//! Resolve credentials through trusted Web before any provider execution.
mod contracts;
mod signing;

pub use contracts::{
    ApiFormat, Attribution, Connection, Ingestion, IngestionMode, MetadataValue, ResolvedExecution,
};
use reqwest::{
    Client, Url,
    header::{AUTHORIZATION, CONTENT_TYPE, HeaderValue},
};
use std::{
    fmt,
    net::IpAddr,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const RESOLVE_PATH: &str = "/api/internal/ai-gateway/v1/resolve";

struct Limits {
    timeout: Duration,
    max_response_bytes: usize,
}

/// Operator-supplied Web base URL and the existing gateway/Web service key.
pub struct ResolverConfig {
    url: Url,
    service_key: String,
    limits: Limits,
}

impl ResolverConfig {
    /// Configure resolution against a trusted Web base URL, including any deployment prefix.
    ///
    /// # Errors
    /// Returns [`ResolveError::Configuration`] for a blank service key or an invalid
    /// base URL. URLs require HTTPS (HTTP is allowed on loopback), with no userinfo,
    /// query, or fragment.
    pub fn new(web_url: &str, service_key: &str) -> Result<Self, ResolveError> {
        let mut url = Url::parse(web_url).map_err(|_| ResolveError::Configuration)?;
        let loopback = url.host_str().is_some_and(|host| {
            host == "localhost"
                || host
                    .trim_matches(['[', ']'])
                    .parse::<IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        });
        if !(url.scheme() == "https" || (url.scheme() == "http" && loopback))
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || service_key.trim().is_empty()
        {
            return Err(ResolveError::Configuration);
        }
        let resolve_path = format!("{}{RESOLVE_PATH}", url.path().trim_end_matches('/'));
        url.set_path(&resolve_path);
        Ok(Self {
            url,
            service_key: service_key.to_owned(),
            limits: Limits {
                timeout: Duration::from_secs(5),
                max_response_bytes: 256 * 1024,
            },
        })
    }
}

/// Reuses the HTTP connection pool; credentials belong exclusively to each request.
pub struct Resolver {
    client: Client,
    config: ResolverConfig,
}

impl Resolver {
    /// Build a resolver with a reusable HTTP connection pool.
    ///
    /// # Errors
    /// Returns [`ResolveError::Configuration`] if the HTTP client cannot be initialized.
    pub fn new(config: ResolverConfig) -> Result<Self, ResolveError> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .no_gzip()
            .no_brotli()
            .no_zstd()
            .no_deflate()
            .build()
            .map_err(|_| ResolveError::Configuration)?;
        Ok(Self { client, config })
    }

    /// Resolve a gateway credential and API format into a validated execution contract.
    ///
    /// # Errors
    /// Returns a sanitized [`ResolveError`] for invalid credentials, authentication or
    /// authorization failures, missing routes, unavailable Web or system time, request
    /// construction or transport failures, timeouts, or oversized or invalid responses.
    pub async fn resolve(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
    ) -> Result<ResolvedExecution, ResolveError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ResolveError::Unavailable)?;
        self.resolve_at(gateway_key, api_format, timestamp).await
    }

    async fn resolve_at(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
        timestamp: Duration,
    ) -> Result<ResolvedExecution, ResolveError> {
        if gateway_key.len() > 8192 || !valid_token(gateway_key) {
            return Err(ResolveError::InvalidCredential);
        }
        let started = Instant::now();
        let body = tokio::time::timeout(
            self.config.limits.timeout,
            self.fetch(gateway_key, api_format, timestamp.as_secs()),
        )
        .await
        .map_err(|_| ResolveError::Timeout)??;
        contracts::decode(
            &body,
            api_format,
            timestamp.saturating_add(started.elapsed()).as_secs(),
        )
    }

    async fn fetch(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
        timestamp: u64,
    ) -> Result<Vec<u8>, ResolveError> {
        let mut credential = HeaderValue::from_str(&format!("Bearer {gateway_key}"))
            .map_err(|_| ResolveError::InvalidCredential)?;
        credential.set_sensitive(true);
        let mut signature = HeaderValue::from_str(&signing::authorization(
            &self.config.service_key,
            gateway_key,
            timestamp,
        ))
        .map_err(|_| ResolveError::Configuration)?;
        signature.set_sensitive(true);
        let body = serde_json::to_vec(&serde_json::json!({ "apiFormat": api_format }))
            .map_err(|_| ResolveError::Configuration)?;
        let mut response = self
            .client
            .post(self.config.url.clone())
            .header(AUTHORIZATION, credential)
            .header("langfuse-gateway-authorization", signature)
            .header(CONTENT_TYPE, "application/json")
            .body(body)
            .send()
            .await
            .map_err(|_| ResolveError::Transport)?;
        match response.status().as_u16() {
            200 => {}
            401 => return Err(ResolveError::Authentication),
            403 => return Err(ResolveError::Forbidden),
            404 => return Err(ResolveError::NoRoute),
            429 | 500..=599 => return Err(ResolveError::Unavailable),
            _ => return Err(ResolveError::InvalidResponse),
        }
        let limit = self.config.limits.max_response_bytes;
        if response
            .content_length()
            .is_some_and(|size| size > limit as u64)
        {
            return Err(ResolveError::ResponseTooLarge);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| ResolveError::Transport)?
        {
            if chunk.len() > limit - bytes.len() {
                return Err(ResolveError::ResponseTooLarge);
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
}

fn valid_token(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_graphic())
}

/// Sanitized failure categories. Upstream bodies and transport errors are never retained.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolveError {
    Configuration,
    InvalidCredential,
    Authentication,
    Forbidden,
    NoRoute,
    Unavailable,
    Timeout,
    Transport,
    InvalidResponse,
    ResponseTooLarge,
}

impl fmt::Display for ResolveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Configuration => "invalid resolver configuration",
            Self::InvalidCredential => "invalid gateway credential",
            Self::Authentication => "gateway authentication failed",
            Self::Forbidden => "gateway access forbidden",
            Self::NoRoute => "no eligible connection",
            Self::Unavailable => "resolution unavailable",
            Self::Timeout => "resolution deadline exceeded",
            Self::Transport => "resolution transport failed",
            Self::InvalidResponse => "invalid resolution response",
            Self::ResponseTooLarge => "resolution response too large",
        })
    }
}

impl std::error::Error for ResolveError {}

#[cfg(test)]
mod tests;
