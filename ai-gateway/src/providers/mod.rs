//! Native provider transports. Requests use only resolved credentials, and every
//! provider shares one execution lifecycle: admission, bounded send, byte relay.
pub mod anthropic;
pub mod openai;

use std::{sync::Arc, time::Duration};

use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, HeaderName, HeaderValue, Method, Response, header},
};
use reqwest::Client;
use reqwest_middleware::ClientWithMiddleware;
use reqwest_tracing::DisableOtelPropagation;
use tokio::{
    sync::{OwnedSemaphorePermit, Semaphore},
    time::Instant,
};

use crate::{
    capture::{ExecutionCapture, RelayOutcome},
    resolution::{ApiFormat, Provider, ProviderCredential, ResolvedRequestContext},
    transport,
};
pub use anthropic::AnthropicRoute;
pub use openai::OpenAiRoute;

pub use crate::transport::ProviderError;

/// One official provider operation. The public path prefix selects the provider;
/// the route decides method, upstream path, capture and body/query handling.
#[derive(Clone, Copy)]
pub(crate) enum Route {
    OpenAi(OpenAiRoute),
    Anthropic(AnthropicRoute),
}

impl Route {
    pub(crate) fn provider(self) -> Provider {
        match self {
            Self::OpenAi(_) => Provider::OpenAi,
            Self::Anthropic(_) => Provider::Anthropic,
        }
    }

    pub(crate) fn api_format(self) -> ApiFormat {
        match self {
            Self::OpenAi(route) => route.api_format(),
            Self::Anthropic(route) => route.api_format(),
        }
    }

    pub(crate) fn method(self) -> Method {
        match self {
            Self::OpenAi(route) => route.method(),
            Self::Anthropic(route) => route.method(),
        }
    }

    fn path(self) -> &'static str {
        match self {
            Self::OpenAi(route) => route.path(),
            Self::Anthropic(route) => route.path(),
        }
    }

    /// Whether the exchange is an inference call recorded as a Langfuse generation.
    /// Catalog listings and token counting relay bytes without customer telemetry.
    pub(crate) fn captures_generation(self) -> bool {
        match self {
            Self::OpenAi(route) => route.captures_generation(),
            Self::Anthropic(route) => route.captures_generation(),
        }
    }

    /// Request query parameters forwarded upstream. Inference routes forward none:
    /// the Anthropic SDK's `?beta=true` carries no information beyond the
    /// `anthropic-beta` header, and clients cannot influence routing through it.
    pub(crate) fn forwarded_query_parameters(self) -> &'static [&'static str] {
        match self {
            Self::Anthropic(AnthropicRoute::Models) => &["limit", "after_id", "before_id"],
            Self::OpenAi(_) | Self::Anthropic(_) => &[],
        }
    }
}

pub(crate) struct ProviderLimits {
    pub active: usize,
    pub execution_timeout: Duration,
    /// Deadline for Anthropic Messages streams. Long thinking turns exceed the
    /// default; the value leaves one minute of the 15-minute ingestion grant for
    /// the telemetry upload after the stream ends.
    pub messages_execution_timeout: Duration,
    pub headers_timeout: Duration,
    pub read_timeout: Duration,
}

impl Default for ProviderLimits {
    fn default() -> Self {
        Self {
            active: 128,
            execution_timeout: Duration::from_secs(600),
            messages_execution_timeout: Duration::from_mins(14),
            headers_timeout: Duration::from_secs(120),
            read_timeout: Duration::from_secs(120),
        }
    }
}

impl ProviderLimits {
    fn execution_timeout(&self, api_format: ApiFormat) -> Duration {
        match api_format {
            ApiFormat::OpenAiResponses => self.execution_timeout,
            ApiFormat::AnthropicMessages => self.messages_execution_timeout,
        }
    }
}

/// An admitted execution. Dropping it releases capacity; there is no waiting queue.
pub struct RequestPermit {
    _permit: OwnedSemaphorePermit,
    _active: crate::observability::Active,
    deadline: Instant,
}

/// A pooled client for the official provider endpoints, with one shared execution budget.
pub struct ProviderTransport {
    client: ClientWithMiddleware,
    capacity: Arc<Semaphore>,
    limits: ProviderLimits,
    telemetry: Option<crate::telemetry::Telemetry>,
    origin_override: Option<String>,
}

impl ProviderTransport {
    /// Construct the provider transport with bounded admission and transport waits.
    ///
    /// # Errors
    /// Returns [`ProviderError::Configuration`] when the HTTPS client cannot be initialized.
    pub fn new(max_active_requests: usize) -> Result<Self, ProviderError> {
        Self::with_limits(ProviderLimits {
            active: max_active_requests,
            ..ProviderLimits::default()
        })
    }

    fn with_limits(limits: ProviderLimits) -> Result<Self, ProviderError> {
        if !(1..=Semaphore::MAX_PERMITS).contains(&limits.active) {
            return Err(ProviderError::Configuration);
        }
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .connect_timeout(Duration::from_secs(5))
            .read_timeout(limits.read_timeout)
            .pool_max_idle_per_host(16)
            .build()
            .map_err(|_| ProviderError::Configuration)?;
        Ok(Self {
            client: crate::observability::instrument_client(client, "provider.headers"),
            capacity: Arc::new(Semaphore::new(limits.active)),
            limits,
            telemetry: None,
            origin_override: None,
        })
    }

    pub(crate) fn with_telemetry(mut self, telemetry: crate::telemetry::Telemetry) -> Self {
        self.telemetry = Some(telemetry);
        self
    }

    /// Reserve capacity for an authenticated request before reading its body.
    ///
    /// # Errors
    /// Returns [`ProviderError::Busy`] immediately when all execution slots are occupied.
    pub fn try_admit(&self, api_format: ApiFormat) -> Result<RequestPermit, ProviderError> {
        let permit = self.capacity.clone().try_acquire_owned().map_err(|_| {
            crate::observability::rejected("execution");
            ProviderError::Busy
        })?;
        Ok(RequestPermit {
            _permit: permit,
            _active: crate::observability::Active::new("execution"),
            deadline: Instant::now() + self.limits.execution_timeout(api_format),
        })
    }

    /// Execute an `OpenAI` Responses request; see [`Self::forward_route`].
    ///
    /// # Errors
    /// See [`Self::forward_route`].
    pub async fn forward(
        &self,
        permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        body: Bytes,
    ) -> Result<Response<Body>, ProviderError> {
        self.forward_route(
            permit,
            context,
            headers,
            body,
            Route::OpenAi(OpenAiRoute::Responses),
            None,
        )
        .await
    }

    /// Execute once and stream native status, safe headers and entity bytes.
    /// The response body owns admission and the trusted context until completion/drop.
    /// `query` is the already filtered upstream query string, without `?`.
    ///
    /// # Errors
    /// Returns a sanitized error for invalid credentials, transport failures or a
    /// deadline before response headers arrive. Later failures terminate the body.
    pub(crate) async fn forward_route(
        &self,
        permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        body: Bytes,
        route: Route,
        query: Option<&str>,
    ) -> Result<Response<Body>, ProviderError> {
        let api_format = route.api_format();
        let (credential_name, mut credential) = provider_credential(&context)?;
        credential.set_sensitive(true);
        let mut capture = if route.captures_generation() {
            let mut capture = ExecutionCapture::for_request(api_format, &context, headers, &body);
            if let Some(telemetry) = &self.telemetry {
                capture.deliver_to(telemetry.clone(), &context, headers);
            }
            capture
        } else {
            ExecutionCapture::unobserved()
        };
        let mut upstream = self
            .client
            .request(route.method(), self.request_url(route, query))
            .with_extension(DisableOtelPropagation)
            .headers(transport::request_headers(headers, api_format))
            // Observe plain JSON/SSE while relaying the provider bytes unchanged.
            .header(header::ACCEPT_ENCODING, "identity")
            .header(credential_name, credential);
        if route.method() != Method::GET {
            upstream = upstream.body(body);
        }
        let response = tokio::time::timeout_at(
            permit
                .deadline
                .min(Instant::now() + self.limits.headers_timeout),
            upstream.send(),
        )
        .await
        .map_err(|_| ProviderError::Timeout)
        .and_then(|result| {
            result.map_err(|error| {
                if error.is_timeout() {
                    ProviderError::Timeout
                } else {
                    ProviderError::Transport
                }
            })
        });
        let response = match response {
            Ok(response) => response,
            Err(error) => {
                capture.finish(if matches!(error, ProviderError::Timeout) {
                    RelayOutcome::Timeout
                } else {
                    RelayOutcome::TransportError
                });
                return Err(error);
            }
        };
        capture.record_response(response.status().as_u16(), response.headers());
        let mut downstream = Response::new(Body::empty());
        *downstream.status_mut() = response.status();
        *downstream.headers_mut() = transport::response_headers(response.headers(), api_format);
        *downstream.body_mut() =
            transport::relay(response, permit.deadline, (permit, context), capture);
        Ok(downstream)
    }

    fn request_url(&self, route: Route, query: Option<&str>) -> String {
        let base = self
            .origin_override
            .as_deref()
            .unwrap_or_else(|| route.provider().official_origin())
            .trim_end_matches('/');
        let mut url = String::with_capacity(base.len() + route.path().len());
        url.push_str(base);
        url.push_str(route.path());
        if let Some(query) = query.filter(|query| !query.is_empty()) {
            url.push('?');
            url.push_str(query);
        }
        url
    }

    /// Point every provider at one fake origin so tests can script upstreams.
    #[cfg(test)]
    pub(crate) fn for_test(base_url: String, limits: ProviderLimits) -> Self {
        let mut provider = Self::with_limits(limits).unwrap();
        provider.origin_override = Some(base_url);
        provider
    }
}

/// The resolved credential in the header position its provider expects.
fn provider_credential(
    context: &ResolvedRequestContext,
) -> Result<(HeaderName, HeaderValue), ProviderError> {
    let (name, value) = match context.connection().credential() {
        ProviderCredential::Bearer(token) => (header::AUTHORIZATION, format!("Bearer {token}")),
        ProviderCredential::XApiKey(key) => (HeaderName::from_static("x-api-key"), key.to_owned()),
    };
    let value = HeaderValue::from_str(&value).map_err(|_| ProviderError::Configuration)?;
    Ok((name, value))
}

/// Keep only the query parameters a route forwards, in their original order and
/// encoding. Everything else, including unknown keys, is dropped.
pub(crate) fn forwarded_query(route: Route, query: Option<&str>) -> Option<String> {
    let allowed = route.forwarded_query_parameters();
    let query = query?;
    let kept: Vec<&str> = query
        .split('&')
        .filter(|pair| {
            let key = pair.split('=').next().unwrap_or("");
            allowed.contains(&key)
        })
        .collect();
    (!kept.is_empty()).then(|| kept.join("&"))
}

#[cfg(test)]
mod tests;
