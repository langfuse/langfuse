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

use crate::{resolution::ResolvedExecution, transport};

pub use crate::transport::RelayError as Error;

pub(crate) struct Limits {
    pub active: usize,
    pub execution_timeout: Duration,
    pub headers_timeout: Duration,
    pub read_timeout: Duration,
}

impl Default for Limits {
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
pub struct Admission {
    _permit: OwnedSemaphorePermit,
    deadline: Instant,
}

/// A pooled client for the official `OpenAI` Responses endpoint.
pub struct OpenAi {
    client: Client,
    capacity: Arc<Semaphore>,
    limits: Limits,
    #[cfg(test)]
    endpoint: String,
}

impl OpenAi {
    /// Construct the provider transport with bounded admission and transport waits.
    ///
    /// # Errors
    /// Returns [`Error::Configuration`] when the HTTPS client cannot be initialized.
    pub fn new() -> Result<Self, Error> {
        Self::with_limits(Limits::default())
    }

    fn with_limits(limits: Limits) -> Result<Self, Error> {
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
            .map_err(|_| Error::Configuration)?;
        Ok(Self {
            client,
            capacity: Arc::new(Semaphore::new(limits.active)),
            limits,
            #[cfg(test)]
            endpoint: "https://api.openai.com/v1/responses".to_owned(),
        })
    }

    /// Reserve capacity before reading a request or resolving its credential.
    ///
    /// # Errors
    /// Returns [`Error::Busy`] immediately when all execution slots are occupied.
    pub fn admit(&self) -> Result<Admission, Error> {
        let permit = self
            .capacity
            .clone()
            .try_acquire_owned()
            .map_err(|_| Error::Busy)?;
        Ok(Admission {
            _permit: permit,
            deadline: Instant::now() + self.limits.execution_timeout,
        })
    }

    /// Execute once and stream native status, safe headers and entity bytes.
    /// The response body owns admission and the trusted context until completion/drop.
    ///
    /// # Errors
    /// Returns a sanitized error for invalid credentials, transport failures or a
    /// deadline before response headers arrive. Later failures terminate the body.
    pub async fn execute(
        &self,
        admission: Admission,
        execution: ResolvedExecution,
        headers: &HeaderMap,
        body: Bytes,
    ) -> Result<Response<Body>, Error> {
        #[cfg(not(test))]
        let endpoint = "https://api.openai.com/v1/responses";
        #[cfg(test)]
        let endpoint = &self.endpoint;

        let mut authorization = HeaderValue::from_str(&format!(
            "Bearer {}",
            execution.connection().provider_token()
        ))
        .map_err(|_| Error::Configuration)?;
        authorization.set_sensitive(true);
        let response = tokio::time::timeout_at(
            admission
                .deadline
                .min(Instant::now() + self.limits.headers_timeout),
            self.client
                .post(endpoint)
                .headers(transport::request_headers(headers))
                .header(header::AUTHORIZATION, authorization)
                .body(body)
                .send(),
        )
        .await
        .map_err(|_| Error::Timeout)?
        .map_err(|error| {
            if error.is_timeout() {
                Error::Timeout
            } else {
                Error::Transport
            }
        })?;
        let mut downstream = Response::new(Body::empty());
        *downstream.status_mut() = response.status();
        *downstream.headers_mut() = transport::response_headers(response.headers());
        *downstream.body_mut() =
            transport::relay(response, admission.deadline, (admission, execution));
        Ok(downstream)
    }

    #[cfg(test)]
    pub(crate) fn for_test(endpoint: String, limits: Limits) -> Self {
        let mut provider = Self::with_limits(limits).unwrap();
        provider.endpoint = endpoint;
        provider
    }
}

#[cfg(test)]
mod tests;
