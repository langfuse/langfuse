//! Resolve the caller's credential, then execute using only the trusted context.
use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, Response},
};
use tokio::sync::Semaphore;

use crate::{
    providers::openai::{Admission, Error as ProviderError, OpenAi},
    resolution::{ApiFormat, ResolveError, ResolvedExecution, Resolver, ResolverConfig},
};

pub struct Execution {
    resolver: Resolver,
    provider: OpenAi,
    resolution_capacity: Semaphore,
}

pub(crate) enum ExecutionError {
    Resolution(ResolveError),
    Provider(ProviderError),
}

impl Execution {
    /// Initialize pooled clients for resolution and provider requests.
    ///
    /// # Errors
    /// Returns a sanitized configuration error for invalid capacities or client setup.
    pub fn new(
        config: ResolverConfig,
        max_active_requests: usize,
        max_concurrent_resolutions: usize,
    ) -> Result<Self, ResolveError> {
        if !(1..=Semaphore::MAX_PERMITS).contains(&max_concurrent_resolutions) {
            return Err(ResolveError::Configuration);
        }
        Ok(Self {
            resolver: Resolver::new(config)?,
            provider: OpenAi::new(max_active_requests).map_err(|_| ResolveError::Configuration)?,
            resolution_capacity: Semaphore::new(max_concurrent_resolutions),
        })
    }

    /// Authenticate with a separate bounded budget before reserving execution capacity.
    pub(crate) async fn prepare(
        &self,
        gateway_key: &str,
    ) -> Result<(Admission, ResolvedExecution), ExecutionError> {
        let resolved = {
            let _permit = self
                .resolution_capacity
                .try_acquire()
                .map_err(|_| ExecutionError::Resolution(ResolveError::Unavailable))?;
            self.resolver
                .resolve(gateway_key, ApiFormat::OpenAiResponses)
                .await
                .map_err(ExecutionError::Resolution)?
        };
        let admission = self.provider.admit().map_err(ExecutionError::Provider)?;
        Ok((admission, resolved))
    }

    pub(crate) async fn execute(
        &self,
        admission: Admission,
        resolved: ResolvedExecution,
        headers: &HeaderMap,
        body: Bytes,
    ) -> Result<Response<Body>, ProviderError> {
        self.provider
            .execute(admission, resolved, headers, body)
            .await
    }

    #[cfg(test)]
    pub(crate) fn for_test(resolver: Resolver, provider: OpenAi, resolutions: usize) -> Self {
        Self {
            resolver,
            provider,
            resolution_capacity: Semaphore::new(resolutions),
        }
    }
}
