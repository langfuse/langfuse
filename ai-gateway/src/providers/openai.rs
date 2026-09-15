//! Native Responses transport. Provider requests use only resolved credentials.
use std::{sync::Arc, time::Duration};

use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, HeaderValue, Response, header},
};
use reqwest::Client;
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
    client: Client,
    capacity: Arc<Semaphore>,
    limits: ProviderLimits,
    telemetry: Option<crate::telemetry::Telemetry>,
    #[cfg(test)]
    endpoint: String,
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
            client,
            capacity: Arc::new(Semaphore::new(limits.active)),
            limits,
            telemetry: None,
            #[cfg(test)]
            endpoint: "https://api.openai.com/v1/responses".to_owned(),
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
        #[cfg(not(test))]
        let endpoint = "https://api.openai.com/v1/responses";
        #[cfg(test)]
        let endpoint = &self.endpoint;

        let mut authorization =
            HeaderValue::from_str(&format!("Bearer {}", context.connection().provider_token()))
                .map_err(|_| ProviderError::Configuration)?;
        authorization.set_sensitive(true);
        let mut capture = ExecutionCapture::openai_responses(&context, headers, &body);
        if let Some(telemetry) = &self.telemetry {
            capture.deliver_to(telemetry.clone(), &context);
        }
        let response = crate::observability::client("provider.headers", async {
            tokio::time::timeout_at(
                permit
                    .deadline
                    .min(Instant::now() + self.limits.headers_timeout),
                self.client
                    .post(endpoint)
                    .headers(transport::request_headers(headers))
                    // Observe plain JSON/SSE while relaying the provider bytes unchanged.
                    .header(header::ACCEPT_ENCODING, "identity")
                    .header(header::AUTHORIZATION, authorization)
                    .body(body)
                    .send(),
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
            })
            .inspect(|response| crate::observability::response_status(response.status().as_u16()))
        })
        .await;
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
        capture.response(response.status().as_u16(), response.headers());
        let mut downstream = Response::new(Body::empty());
        *downstream.status_mut() = response.status();
        *downstream.headers_mut() = transport::response_headers(response.headers());
        *downstream.body_mut() =
            transport::relay(response, permit.deadline, (permit, context), capture);
        Ok(downstream)
    }

    #[cfg(test)]
    pub(crate) fn for_test(endpoint: String, limits: ProviderLimits) -> Self {
        let mut provider = Self::with_limits(limits).unwrap();
        provider.endpoint = endpoint;
        provider
    }
}

#[cfg(test)]
mod tests;
