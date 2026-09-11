//! Resolve the caller's credential, then execute using only the trusted context.
use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, Response},
};

use crate::{
    providers::openai::{Admission, Error as ProviderError, OpenAi},
    resolution::{ApiFormat, ResolveError, Resolver, ResolverConfig},
};

pub struct Execution {
    resolver: Resolver,
    provider: OpenAi,
}

pub(crate) enum ExecutionError {
    Resolution(ResolveError),
    Provider(ProviderError),
}

impl Execution {
    /// Initialize pooled clients for resolution and provider requests.
    ///
    /// # Errors
    /// Returns a sanitized configuration error when either client cannot be built.
    pub fn new(config: ResolverConfig) -> Result<Self, ResolveError> {
        Ok(Self {
            resolver: Resolver::new(config)?,
            provider: OpenAi::new().map_err(|_| ResolveError::Configuration)?,
        })
    }

    pub(crate) fn admit(&self) -> Result<Admission, ProviderError> {
        self.provider.admit()
    }

    pub(crate) async fn execute(
        &self,
        admission: Admission,
        gateway_key: &str,
        headers: &HeaderMap,
        body: Bytes,
    ) -> Result<Response<Body>, ExecutionError> {
        let resolved = self
            .resolver
            .resolve(gateway_key, ApiFormat::OpenAiResponses)
            .await
            .map_err(ExecutionError::Resolution)?;
        self.provider
            .execute(admission, resolved, headers, body)
            .await
            .map_err(ExecutionError::Provider)
    }

    #[cfg(test)]
    pub(crate) fn for_test(resolver: Resolver, provider: OpenAi) -> Self {
        Self { resolver, provider }
    }
}
