//! Native `OpenAI` v1 transport. Provider requests use only resolved credentials.
use std::{sync::Arc, time::Duration};

use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, HeaderValue, Method, Response, header},
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
    resolution::ResolvedRequestContext,
    transport,
};

pub use crate::transport::ProviderError;

const OPENAI_V1: &str = "https://api.openai.com/v1";

/// Official `OpenAI` paths relayed without translation. Compact is Responses JSON;
/// models listing is GET with no request query forwarding and no generation ingest.
#[derive(Clone, Copy)]
pub(crate) enum OpenAiRoute {
    Responses,
    ResponsesCompact,
    Models,
}

impl OpenAiRoute {
    fn method(self) -> Method {
        match self {
            Self::Models => Method::GET,
            Self::Responses | Self::ResponsesCompact => Method::POST,
        }
    }

    fn path(self) -> &'static str {
        match self {
            Self::Responses => "/responses",
            Self::ResponsesCompact => "/responses/compact",
            Self::Models => "/models",
        }
    }

    fn captures_generation(self) -> bool {
        !matches!(self, Self::Models)
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

/// An admitted execution. Dropping it releases capacity; there is no waiting queue.
pub struct RequestPermit {
    _permit: OwnedSemaphorePermit,
    _active: crate::observability::Active,
    deadline: Instant,
}

/// A pooled client for the official `OpenAI` Responses endpoint.
pub struct OpenAiProvider {
    client: ClientWithMiddleware,
    capacity: Arc<Semaphore>,
    limits: ProviderLimits,
    telemetry: Option<crate::telemetry::Telemetry>,
    base_url: String,
}

impl OpenAiProvider {
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
            base_url: OPENAI_V1.to_owned(),
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

    /// Execute once and stream native status, safe headers and entity bytes.
    /// The response body owns admission and the trusted context until completion/drop.
    ///
    /// # Errors
    /// Returns a sanitized error for invalid credentials, transport failures or a
    /// deadline before response headers arrive. Later failures terminate the body.
    pub async fn forward(
        &self,
        permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        body: Bytes,
    ) -> Result<Response<Body>, ProviderError> {
        self.forward_route(permit, context, headers, body, OpenAiRoute::Responses)
            .await
    }

    pub(crate) async fn forward_route(
        &self,
        permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        body: Bytes,
        route: OpenAiRoute,
    ) -> Result<Response<Body>, ProviderError> {
        let mut authorization =
            HeaderValue::from_str(&format!("Bearer {}", context.connection().provider_token()))
                .map_err(|_| ProviderError::Configuration)?;
        authorization.set_sensitive(true);
        let mut capture = if route.captures_generation() {
            let mut capture = ExecutionCapture::for_openai_responses(&context, headers, &body);
            if let Some(telemetry) = &self.telemetry {
                capture.deliver_to(telemetry.clone(), &context, headers);
            }
            capture
        } else {
            ExecutionCapture::unobserved()
        };
        let mut upstream = self
            .client
            .request(route.method(), self.request_url(route))
            .with_extension(DisableOtelPropagation)
            .headers(transport::request_headers(headers))
            // Observe plain JSON/SSE while relaying the provider bytes unchanged.
            .header(header::ACCEPT_ENCODING, "identity")
            .header(header::AUTHORIZATION, authorization);
        if route.captures_generation() {
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
        *downstream.headers_mut() = transport::response_headers(response.headers());
        *downstream.body_mut() =
            transport::relay(response, permit.deadline, (permit, context), capture);
        Ok(downstream)
    }

    fn request_url(&self, route: OpenAiRoute) -> String {
        let base = self.base_url.trim_end_matches('/');
        let mut url = String::with_capacity(base.len() + route.path().len());
        url.push_str(base);
        url.push_str(route.path());
        url
    }

    #[cfg(test)]
    pub(crate) fn for_test(base_url: String, limits: ProviderLimits) -> Self {
        let mut provider = Self::with_limits(limits).unwrap();
        provider.base_url = base_url;
        provider
    }
}

#[cfg(test)]
mod tests;
