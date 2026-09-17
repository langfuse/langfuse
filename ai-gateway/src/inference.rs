//! Resolve the caller's credential, then execute using only the trusted context.
use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, Response},
};
use tokio::sync::Semaphore;

use crate::{
    providers::openai::{OpenAiProvider, OpenAiRoute, ProviderError, RequestPermit},
    resolution::{
        ApiFormat, ControlPlaneClient, ControlPlaneConfig, ResolutionError, ResolvedRequestContext,
    },
};

pub struct InferenceService {
    control_plane: ControlPlaneClient,
    provider: OpenAiProvider,
    resolution_capacity: Semaphore,
    telemetry: Option<crate::telemetry::Telemetry>,
}

pub(crate) enum RequestPreparationError {
    Resolution(ResolutionError),
    Provider(ProviderError),
}

impl InferenceService {
    /// Initialize pooled clients for resolution and provider requests.
    ///
    /// # Errors
    /// Returns a sanitized configuration error for invalid capacities or client setup.
    pub fn new(
        config: ControlPlaneConfig,
        max_active_requests: usize,
        max_concurrent_resolutions: usize,
    ) -> Result<Self, ResolutionError> {
        if !(1..=Semaphore::MAX_PERMITS).contains(&max_concurrent_resolutions) {
            return Err(ResolutionError::Configuration);
        }
        let telemetry = crate::telemetry::Telemetry::new(&config)?;
        Ok(Self {
            control_plane: ControlPlaneClient::new(config)?,
            provider: OpenAiProvider::new(max_active_requests)
                .map_err(|_| ResolutionError::Configuration)?
                .with_telemetry(telemetry.clone()),
            resolution_capacity: Semaphore::new(max_concurrent_resolutions),
            telemetry: Some(telemetry),
        })
    }

    pub fn telemetry(&self) -> Option<crate::telemetry::Telemetry> {
        self.telemetry.clone()
    }

    /// Authenticate with a separate bounded budget before reserving execution capacity.
    pub(crate) async fn resolve_and_admit(
        &self,
        gateway_key: &str,
    ) -> Result<(RequestPermit, ResolvedRequestContext), RequestPreparationError> {
        let context = {
            let _permit = self.resolution_capacity.try_acquire().map_err(|_| {
                crate::observability::rejected("resolution");
                RequestPreparationError::Resolution(ResolutionError::Unavailable)
            })?;
            let _active = crate::observability::Active::new("resolution");
            self.control_plane
                .resolve(gateway_key, ApiFormat::OpenAiResponses)
                .await
                .map_err(RequestPreparationError::Resolution)?
        };
        let permit = self
            .provider
            .try_admit()
            .map_err(RequestPreparationError::Provider)?;
        Ok((permit, context))
    }

    pub(crate) async fn forward(
        &self,
        permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        body: Bytes,
        route: OpenAiRoute,
    ) -> Result<Response<Body>, ProviderError> {
        self.provider
            .forward_route(permit, context, headers, body, route)
            .await
    }

    #[cfg(test)]
    pub(crate) fn for_test(
        control_plane: ControlPlaneClient,
        provider: OpenAiProvider,
        resolutions: usize,
    ) -> Self {
        Self {
            control_plane,
            provider,
            resolution_capacity: Semaphore::new(resolutions),
            telemetry: None,
        }
    }
}
