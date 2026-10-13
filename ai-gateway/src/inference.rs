//! Resolve the caller's credential, then execute using only the trusted context.
use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, Response},
};
use tokio::sync::{Semaphore, SemaphorePermit};
use tracing::Instrument;

use crate::{
    correlation::RequestCorrelation,
    providers::{ProviderError, ProviderTransport, RequestPermit, Route},
    resolution::{
        ApiFormat, ControlPlaneClient, ControlPlaneConfig, ResolutionError, ResolvedRequestContext,
    },
};

pub struct InferenceService {
    control_plane: ControlPlaneClient,
    provider: ProviderTransport,
    resolution_capacity: Semaphore,
    telemetry: Option<crate::telemetry::Telemetry>,
}

pub(crate) enum RequestPreparationError {
    Resolution(ResolutionError),
    Provider(ProviderError),
}

pub(crate) struct ResolutionPermit<'a> {
    _permit: SemaphorePermit<'a>,
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
        telemetry_buffer_bytes: usize,
    ) -> Result<Self, ResolutionError> {
        if !(1..=Semaphore::MAX_PERMITS).contains(&max_concurrent_resolutions) {
            return Err(ResolutionError::Configuration);
        }
        let telemetry = crate::telemetry::Telemetry::new(&config, telemetry_buffer_bytes)?;
        Ok(Self {
            control_plane: ControlPlaneClient::new(config)?,
            provider: ProviderTransport::new(max_active_requests)
                .map_err(|_| ResolutionError::Configuration)?
                .with_telemetry(telemetry.clone()),
            resolution_capacity: Semaphore::new(max_concurrent_resolutions),
            telemetry: Some(telemetry),
        })
    }

    pub fn telemetry(&self) -> Option<crate::telemetry::Telemetry> {
        self.telemetry.clone()
    }

    pub(crate) fn try_reserve_resolution(
        &self,
    ) -> Result<ResolutionPermit<'_>, RequestPreparationError> {
        let permit = self.resolution_capacity.try_acquire().map_err(|_| {
            crate::observability::rejected("resolution");
            RequestPreparationError::Resolution(ResolutionError::Unavailable)
        })?;
        Ok(ResolutionPermit { _permit: permit })
    }

    pub(crate) async fn models(
        &self,
        _resolution_permit: ResolutionPermit<'_>,
        gateway_key: &str,
        api_format: ApiFormat,
        correlation: &RequestCorrelation,
    ) -> Result<Vec<u8>, ResolutionError> {
        let _active = crate::observability::Active::new("resolution");
        self.control_plane
            .models(gateway_key, api_format, correlation.id())
            .await
    }

    /// Authenticate with the permit reserved before the request body was buffered, then reserve
    /// execution capacity. The API format comes from the public route, so Web selects a compatible
    /// connection. A successful resolution is recorded even if execution admission then fails.
    pub(crate) async fn resolve_and_admit(
        &self,
        resolution_permit: ResolutionPermit<'_>,
        gateway_key: &str,
        api_format: ApiFormat,
        model: Option<&str>,
        correlation: &mut RequestCorrelation,
    ) -> Result<(RequestPermit, ResolvedRequestContext), RequestPreparationError> {
        let span = tracing::info_span!(
            "resolution",
            otel.kind = "internal",
            gateway.outcome = tracing::field::Empty
        );
        async {
            let prepared = self
                .prepare(
                    resolution_permit,
                    gateway_key,
                    api_format,
                    model,
                    correlation,
                )
                .await;
            tracing::Span::current().record(
                "gateway.outcome",
                match &prepared {
                    Ok(_) => "admitted",
                    Err(RequestPreparationError::Resolution(_)) => "resolution_failed",
                    Err(RequestPreparationError::Provider(_)) => "busy",
                },
            );
            prepared
        }
        .instrument(span)
        .await
    }

    async fn prepare(
        &self,
        resolution_permit: ResolutionPermit<'_>,
        gateway_key: &str,
        api_format: ApiFormat,
        model: Option<&str>,
        correlation: &mut RequestCorrelation,
    ) -> Result<(RequestPermit, ResolvedRequestContext), RequestPreparationError> {
        let context = {
            let _active = crate::observability::Active::new("resolution");
            self.control_plane
                .resolve(gateway_key, api_format, model, correlation.id())
                .await
                .map_err(RequestPreparationError::Resolution)?
        };
        drop(resolution_permit);
        correlation.record_resolution(&context);
        let permit = self
            .provider
            .try_admit()
            .map_err(RequestPreparationError::Provider)?;
        Ok((permit, context))
    }

    #[expect(
        clippy::too_many_arguments,
        reason = "each argument is a distinct per-request input passed straight through"
    )]
    pub(crate) async fn forward(
        &self,
        permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        body: Bytes,
        route: Route,
        query: Option<&str>,
        correlation: &mut RequestCorrelation,
    ) -> Result<Response<Body>, ProviderError> {
        self.provider
            .forward_route(permit, context, headers, body, route, query, correlation)
            .await
    }

    #[cfg(test)]
    pub(crate) fn for_test(
        control_plane: ControlPlaneClient,
        provider: ProviderTransport,
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
