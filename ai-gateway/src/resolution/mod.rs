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
    plain_http: bool,
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
        Self::from_parts(web_url, service_key, false)
    }

    /// Like [`Self::new`], but also accepts plain HTTP on any host.
    ///
    /// Only for internal traffic, such as Web's in-cluster Kubernetes Service or another
    /// private network. Never use it for a URL that crosses the public internet: resolve
    /// responses carry provider API keys, and requests carry the service key and
    /// ingestion tokens, all unencrypted over HTTP.
    ///
    /// # Errors
    /// Returns [`ResolutionError::Configuration`] for a blank service key or an invalid
    /// base URL. URLs require HTTP or HTTPS, with no userinfo, query, or fragment.
    pub fn with_plain_http(web_url: &str, service_key: &str) -> Result<Self, ResolutionError> {
        Self::from_parts(web_url, service_key, true)
    }

    fn from_parts(
        web_url: &str,
        service_key: &str,
        allow_plain_http: bool,
    ) -> Result<Self, ResolutionError> {
        let url = Url::parse(web_url).map_err(|_| ResolutionError::Configuration)?;
        let loopback = url.host_str().is_some_and(|host| {
            host == "localhost"
                || host
                    .trim_matches(['[', ']'])
                    .parse::<IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        });
        let plain_http = url.scheme() == "http" && !loopback;
        if !(url.scheme() == "https" || (url.scheme() == "http" && (loopback || allow_plain_http)))
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
            plain_http,
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

    /// Whether the Web URL is plain HTTP off loopback, so provider API keys, the service
    /// key and ingestion tokens travel unencrypted.
    #[must_use]
    pub fn is_plain_http(&self) -> bool {
        self.plain_http
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

    /// Fetch the caller-visible model catalog from trusted Web. `reserve` is called
    /// with the buffer's new capacity before the buffer grows to it.
    ///
    /// # Errors
    /// Returns the same sanitized errors as [`Self::resolve`], or the error `reserve`
    /// returns.
    pub async fn models(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
        request_id: &str,
        reserve: &mut (dyn FnMut(usize) -> Result<(), ResolutionError> + Send),
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
        self.execute(request, self.config.models_limits, reserve)
            .await
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
        let body = self
            .execute_retrying_once(request, self.config.resolve_limits)
            .await?;
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
        reserve: &mut (dyn FnMut(usize) -> Result<(), ResolutionError> + Send),
    ) -> Result<Vec<u8>, ResolutionError> {
        tokio::time::timeout(limits.timeout, async {
            let response = request
                .send()
                .await
                .map_err(|_| ResolutionError::Transport)?;
            read_response(response, limits.max_response_bytes, reserve).await
        })
        .await
        .map_err(|_| ResolutionError::Timeout)?
    }

    /// Like [`Self::execute`], but resends once, immediately, when no usable response
    /// arrived. Resolve is read-only on Web, so a duplicate is harmless. Both attempts
    /// share one deadline, so a timeout is never retried.
    async fn execute_retrying_once(
        &self,
        request: RequestBuilder,
        limits: ControlPlaneLimits,
    ) -> Result<Vec<u8>, ResolutionError> {
        tokio::time::timeout(limits.timeout, async {
            let retry = request.try_clone();
            let mut sent = request.send().await;
            if let Some(retry) = retry
                && let Some(reason) = retry_reason(&sent)
            {
                tracing::warn!(reason, "gateway resolution retrying once");
                tracing::Span::current().record("gateway.resolution.retry", reason);
                sent = retry.send().await;
            }
            let response = sent.map_err(|_| ResolutionError::Transport)?;
            read_response(response, limits.max_response_bytes, &mut |_| Ok(())).await
        })
        .await
        .map_err(|_| ResolutionError::Timeout)?
    }
}

/// Retry only failures where Web never answered: connect and send errors (including a
/// connection closed or reset under the request, or an HTTP/2 GOAWAY or refused stream),
/// and 502, which Web never returns itself, so it comes from the load balancer. Web's
/// 503 asks callers to back off, and 504 or a timeout has already spent the budget.
fn retry_reason(
    sent: &Result<reqwest::Response, reqwest_middleware::Error>,
) -> Option<&'static str> {
    match sent {
        Ok(response) if response.status() == reqwest::StatusCode::BAD_GATEWAY => {
            Some("bad_gateway")
        }
        Err(reqwest_middleware::Error::Reqwest(error)) if !error.is_timeout() => {
            if error.is_connect() {
                Some("connect")
            } else if error.is_request() {
                Some("send")
            } else {
                None
            }
        }
        _ => None,
    }
}

async fn read_response(
    mut response: reqwest::Response,
    limit: usize,
    reserve: &mut (dyn FnMut(usize) -> Result<(), ResolutionError> + Send),
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
    let declared = response
        .content_length()
        .map(|size| usize::try_from(size).unwrap_or(usize::MAX));
    if declared.is_some_and(|size| size > limit) {
        return Err(ResolutionError::ResponseTooLarge);
    }
    let capacity_limit = declared.unwrap_or(limit);
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| ResolutionError::Transport)?
    {
        if chunk.len() > limit - bytes.len() {
            return Err(ResolutionError::ResponseTooLarge);
        }
        let total = bytes.len() + chunk.len();
        if total > bytes.capacity() {
            let capacity = bytes
                .capacity()
                .saturating_mul(2)
                .clamp(total, capacity_limit.max(total));
            reserve(capacity)?;
            bytes.reserve_exact(capacity - bytes.len());
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
    /// The gateway's memory budget cannot cover another request.
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
