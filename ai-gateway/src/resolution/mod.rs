//! Resolve credentials through trusted Web before any provider execution.
mod contracts;
pub(crate) mod signing;

pub use contracts::{
    ApiFormat, IngestionGrant, IngestionMode, MetadataValue, OrganizationId, ProjectId, Provider,
    ProviderConnection, ProviderCredential, RequestAttribution, ResolvedRequestContext,
};
use reqwest::{
    Client, Method, Url,
    header::{AUTHORIZATION, CONTENT_TYPE, HeaderValue},
};
use reqwest_middleware::{ClientWithMiddleware, RequestBuilder};
use secrecy::{ExposeSecret, SecretString};
use std::{
    net::IpAddr,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const RESOLVE_PATH: &str = "/api/internal/ai-gateway/v1/resolve";
const MODELS_PATH: &str = "/api/internal/ai-gateway/v1/models";
const REQUEST_ID_HEADER: &str = "langfuse-gateway-request-id";
const ERROR_CODE_HEADER: &str = "langfuse-gateway-error-code";
// Web sits behind load balancers that drop idle connections after 60s by default
// (AWS ALB). Evicting pooled connections first keeps the resolver from sending on a
// socket the balancer is closing, which would fail without a retry.
const POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(50);
const TCP_KEEPALIVE: Duration = Duration::from_secs(30);

#[derive(Clone, Copy)]
struct ControlPlaneLimits {
    timeout: Duration,
    max_response_bytes: usize,
}

/// Operator-supplied Web base URL and the existing gateway/Web service key.
pub struct ControlPlaneConfig {
    web_url: Url,
    service_key: SecretString,
    resolve_limits: ControlPlaneLimits,
    models_limits: ControlPlaneLimits,
}

impl ControlPlaneConfig {
    /// Configure resolution against a trusted Web base URL, including any deployment prefix.
    ///
    /// # Errors
    /// Returns [`ResolutionError::Configuration`] for a blank service key or an invalid
    /// base URL. URLs require HTTPS (HTTP is allowed on loopback), with no userinfo,
    /// query, or fragment.
    pub fn new(web_url: &str, service_key: &str) -> Result<Self, ResolutionError> {
        let url = Url::parse(web_url).map_err(|_| ResolutionError::Configuration)?;
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
            return Err(ResolutionError::Configuration);
        }
        Ok(Self {
            web_url: url,
            service_key: service_key.into(),
            resolve_limits: ControlPlaneLimits {
                timeout: Duration::from_secs(5),
                max_response_bytes: 256 * 1024,
            },
            // Model catalogs are unpaginated and can require cold provider discovery.
            models_limits: ControlPlaneLimits {
                timeout: Duration::from_secs(30),
                max_response_bytes: 10 * 1024 * 1024,
            },
        })
    }

    pub(crate) fn endpoint(&self, path: &str) -> Url {
        let mut url = self.web_url.clone();
        url.set_path(&format!("{}{path}", url.path().trim_end_matches('/')));
        url
    }

    pub(crate) fn service_key(&self) -> &SecretString {
        &self.service_key
    }
}

/// Reuses the HTTP connection pool; credentials belong exclusively to each request.
pub struct ControlPlaneClient {
    client: ClientWithMiddleware,
    config: ControlPlaneConfig,
}

impl ControlPlaneClient {
    /// Build a resolver with a reusable HTTP connection pool.
    ///
    /// # Errors
    /// Returns [`ResolutionError::Configuration`] if the HTTP client cannot be initialized.
    pub fn new(config: ControlPlaneConfig) -> Result<Self, ResolutionError> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .no_gzip()
            .no_brotli()
            .no_zstd()
            .no_deflate()
            .pool_idle_timeout(POOL_IDLE_TIMEOUT)
            .tcp_keepalive(TCP_KEEPALIVE)
            .build()
            .map_err(|_| ResolutionError::Configuration)?;
        Ok(Self {
            client: crate::observability::instrument_client(client, "resolver"),
            config,
        })
    }

    /// Resolve a gateway credential and API format into a validated execution contract.
    /// `request_id` is the gateway request ID, sent so Web logs carry it.
    ///
    /// # Errors
    /// Returns a sanitized [`ResolutionError`] for invalid credentials, authentication or
    /// authorization failures, missing routes, unavailable Web or system time, request
    /// construction or transport failures, timeouts, or oversized or invalid responses.
    pub async fn resolve(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
        model: &str,
        request_id: &str,
    ) -> Result<ResolvedRequestContext, ResolutionError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ResolutionError::Unavailable)?;
        self.resolve_at(gateway_key, api_format, model, timestamp, request_id)
            .await
    }

    /// Fetch the caller-visible model catalog from trusted Web.
    ///
    /// # Errors
    /// Returns the same sanitized errors as [`Self::resolve`].
    pub async fn models(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
        request_id: &str,
    ) -> Result<Vec<u8>, ResolutionError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ResolutionError::Unavailable)?;
        let mut endpoint = self.config.endpoint(MODELS_PATH);
        endpoint
            .query_pairs_mut()
            .append_pair("api_format", api_format.as_str());
        let request = self.authenticated_request(
            Method::GET,
            endpoint,
            gateway_key,
            timestamp.as_secs(),
            request_id,
        )?;
        self.execute(request, self.config.models_limits).await
    }

    async fn resolve_at(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
        model: &str,
        timestamp: Duration,
        request_id: &str,
    ) -> Result<ResolvedRequestContext, ResolutionError> {
        let started = Instant::now();
        let body = serde_json::to_vec(&serde_json::json!({
            "apiFormat": api_format,
            "model": model,
        }))
        .map_err(|_| ResolutionError::Configuration)?;
        let request = self
            .authenticated_request(
                Method::POST,
                self.config.endpoint(RESOLVE_PATH),
                gateway_key,
                timestamp.as_secs(),
                request_id,
            )?
            .header(CONTENT_TYPE, "application/json")
            .body(body);
        let body = self.execute(request, self.config.resolve_limits).await?;
        contracts::decode(
            &body,
            api_format,
            timestamp.saturating_add(started.elapsed()).as_secs(),
        )
    }

    fn authenticated_request(
        &self,
        method: Method,
        endpoint: Url,
        gateway_key: &str,
        timestamp: u64,
        request_id: &str,
    ) -> Result<RequestBuilder, ResolutionError> {
        if gateway_key.len() > 8192 || !valid_token(gateway_key) {
            return Err(ResolutionError::InvalidCredential);
        }
        let mut credential = HeaderValue::from_str(&format!("Bearer {gateway_key}"))
            .map_err(|_| ResolutionError::InvalidCredential)?;
        credential.set_sensitive(true);
        let mut signature = HeaderValue::from_str(&signing::authorization(
            self.config.service_key.expose_secret(),
            gateway_key,
            timestamp,
        ))
        .map_err(|_| ResolutionError::Configuration)?;
        signature.set_sensitive(true);
        Ok(self
            .client
            .request(method, endpoint)
            .header(AUTHORIZATION, credential)
            .header("langfuse-gateway-authorization", signature)
            .header(REQUEST_ID_HEADER, request_id))
    }

    async fn execute(
        &self,
        request: RequestBuilder,
        limits: ControlPlaneLimits,
    ) -> Result<Vec<u8>, ResolutionError> {
        tokio::time::timeout(limits.timeout, async {
            let response = request
                .send()
                .await
                .map_err(|_| ResolutionError::Transport)?;
            read_response(response, limits.max_response_bytes).await
        })
        .await
        .map_err(|_| ResolutionError::Timeout)?
    }
}

async fn read_response(
    mut response: reqwest::Response,
    limit: usize,
) -> Result<Vec<u8>, ResolutionError> {
    match response.status().as_u16() {
        200 => {}
        400 => return Err(ResolutionError::InvalidRequest),
        // Web rejected the gateway's own signature: a service-key mismatch, not the caller.
        401 if response
            .headers()
            .get(ERROR_CODE_HEADER)
            .is_some_and(|value| value == "invalid_gateway_authorization") =>
        {
            return Err(ResolutionError::Configuration);
        }
        401 => return Err(ResolutionError::Authentication),
        403 if response
            .headers()
            .get(ERROR_CODE_HEADER)
            .is_some_and(|value| value == "model_not_allowed") =>
        {
            return Err(ResolutionError::ModelNotAllowed);
        }
        403 => return Err(ResolutionError::Forbidden),
        404 => return Err(ResolutionError::NoRoute),
        429 | 500..=599 => return Err(ResolutionError::Unavailable),
        _ => return Err(ResolutionError::InvalidResponse),
    }
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err(ResolutionError::ResponseTooLarge);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| ResolutionError::Transport)?
    {
        if chunk.len() > limit - bytes.len() {
            return Err(ResolutionError::ResponseTooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn valid_token(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_graphic())
}

/// Sanitized failure categories. Upstream bodies and transport errors are never retained.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ResolutionError {
    #[error("invalid resolver configuration")]
    Configuration,
    #[error("invalid gateway credential")]
    InvalidCredential,
    #[error("invalid gateway request")]
    InvalidRequest,
    #[error("gateway authentication failed")]
    Authentication,
    #[error("gateway access forbidden")]
    Forbidden,
    #[error("model is not allowed")]
    ModelNotAllowed,
    #[error("no eligible connection")]
    NoRoute,
    /// The gateway's own resolution or catalog capacity is exhausted.
    #[error("gateway at capacity")]
    Busy,
    #[error("resolution unavailable")]
    Unavailable,
    #[error("resolution deadline exceeded")]
    Timeout,
    #[error("resolution transport failed")]
    Transport,
    #[error("invalid resolution response")]
    InvalidResponse,
    #[error("resolution response too large")]
    ResponseTooLarge,
}

#[cfg(test)]
mod tests;
