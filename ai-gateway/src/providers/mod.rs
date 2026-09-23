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

pub use crate::transport::ProviderError;
use crate::{
    capture::{ExecutionCapture, RelayOutcome},
    resolution::{ApiFormat, Provider, ProviderCredential, ResolvedRequestContext},
    transport,
};

#[derive(Clone, Copy)]
pub(crate) enum Route {
    OpenAiResponses,
    OpenAiResponsesCompact,
    OpenAiModels,
    AnthropicMessages,
    AnthropicCountTokens,
    AnthropicModels,
}

impl Route {
    pub(crate) fn provider(self) -> Provider {
        match self {
            Self::OpenAiResponses | Self::OpenAiResponsesCompact | Self::OpenAiModels => {
                Provider::OpenAi
            }
            Self::AnthropicMessages | Self::AnthropicCountTokens | Self::AnthropicModels => {
                Provider::Anthropic
            }
        }
    }

    pub(crate) fn api_format(self) -> ApiFormat {
        match self.provider() {
            Provider::OpenAi => ApiFormat::OpenAiResponses,
            Provider::Anthropic => ApiFormat::AnthropicMessages,
        }
    }

    pub(crate) fn method(self) -> Method {
        match self {
            Self::OpenAiModels | Self::AnthropicModels => Method::GET,
            _ => Method::POST,
        }
    }

    fn path(self) -> &'static str {
        match self {
            Self::OpenAiResponses => "/responses",
            Self::OpenAiResponsesCompact => "/responses/compact",
            Self::OpenAiModels | Self::AnthropicModels => "/models",
            Self::AnthropicMessages => "/messages",
            Self::AnthropicCountTokens => "/messages/count_tokens",
        }
    }

    pub(crate) fn captures_generation(self) -> bool {
        matches!(
            self,
            Self::OpenAiResponses | Self::OpenAiResponsesCompact | Self::AnthropicMessages
        )
    }

    pub(crate) fn forwarded_query_parameters(self) -> &'static [&'static str] {
        match self {
            Self::AnthropicModels => &["limit", "after_id", "before_id"],
            _ => &[],
        }
    }
}

pub(crate) struct ProviderLimits {
    pub active: usize,
    pub execution_timeout: Duration,
    pub headers_timeout: Duration,
    pub read_timeout: Duration,
}

impl Default for ProviderLimits {
    fn default() -> Self {
        Self {
            active: 128,
            execution_timeout: Duration::from_secs(600),
            headers_timeout: Duration::from_secs(120),
            read_timeout: Duration::from_secs(120),
        }
    }
}

pub struct RequestPermit {
    _permit: OwnedSemaphorePermit,
    _active: crate::observability::Active,
    deadline: Instant,
}

pub struct ProviderTransport {
    client: ClientWithMiddleware,
    capacity: Arc<Semaphore>,
    limits: ProviderLimits,
    telemetry: Option<crate::telemetry::Telemetry>,
    origin_override: Option<String>,
}

impl ProviderTransport {
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

    /// # Errors
    /// Returns [`ProviderError::Busy`] immediately when all execution slots are occupied.
    pub fn try_admit(&self) -> Result<RequestPermit, ProviderError> {
        let permit = self.capacity.clone().try_acquire_owned().map_err(|_| {
            crate::observability::rejected("execution");
            ProviderError::Busy
        })?;
        Ok(RequestPermit {
            _permit: permit,
            _active: crate::observability::Active::new("execution"),
            deadline: Instant::now() + self.limits.execution_timeout,
        })
    }

    /// # Errors
    /// See [`Self::forward_route`].
    pub async fn forward(
        &self,
        permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        body: Bytes,
    ) -> Result<Response<Body>, ProviderError> {
        self.forward_route(permit, context, headers, body, Route::OpenAiResponses, None)
            .await
    }

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

    #[cfg(test)]
    pub(crate) fn for_test(base_url: String, limits: ProviderLimits) -> Self {
        let mut provider = Self::with_limits(limits).unwrap();
        provider.origin_override = Some(base_url);
        provider
    }
}

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
