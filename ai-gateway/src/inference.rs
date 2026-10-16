//! Resolve the caller's credential, then execute using only the trusted context.
use std::{ops::Range, time::Instant};

use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, Response},
};
use tokio::sync::{Semaphore, SemaphorePermit};
use tracing::Instrument;

use crate::{
    correlation::RequestCorrelation,
    observability::{ErrorOrigin, Phase},
    providers::{ProviderError, ProviderTransport, RequestPermit, Route},
    resolution::{
        ApiFormat, ControlPlaneClient, ControlPlaneConfig, ResolutionError, ResolvedRequestContext,
    },
};

pub struct InferenceService {
    control_plane: ControlPlaneClient,
    provider: ProviderTransport,
    request_body_capacity: Semaphore,
    model_catalog_capacity: Semaphore,
    resolution_capacity: Semaphore,
    telemetry: Option<crate::telemetry::Telemetry>,
}

pub(crate) enum RequestPreparationError {
    Resolution(ResolutionError),
    Provider(ProviderError),
}

impl RequestPreparationError {
    pub(crate) fn origin(&self) -> (ErrorOrigin, &'static str) {
        match *self {
            Self::Resolution(error) => resolution_origin(error),
            Self::Provider(error) => provider_origin(error),
        }
    }
}

/// `error.origin` and `error.reason` for a failed resolution or catalog fetch.
pub(crate) fn resolution_origin(error: ResolutionError) -> (ErrorOrigin, &'static str) {
    use ResolutionError as R;
    match error {
        R::Configuration => (ErrorOrigin::Gateway, "configuration"),
        R::Busy => (ErrorOrigin::Gateway, "capacity"),
        R::InvalidCredential | R::Authentication => (ErrorOrigin::Client, "authentication"),
        R::InvalidRequest => (ErrorOrigin::Client, "invalid_request"),
        R::Forbidden => (ErrorOrigin::Client, "forbidden"),
        R::ModelNotAllowed => (ErrorOrigin::Client, "model_not_allowed"),
        R::NoRoute => (ErrorOrigin::Client, "no_route"),
        R::Unavailable => (ErrorOrigin::ControlPlane, "unavailable"),
        R::Timeout => (ErrorOrigin::ControlPlane, "timeout"),
        R::Transport => (ErrorOrigin::ControlPlane, "transport"),
        R::InvalidResponse => (ErrorOrigin::ControlPlane, "invalid_response"),
        R::ResponseTooLarge => (ErrorOrigin::ControlPlane, "response_too_large"),
    }
}

/// `error.origin` and `error.reason` for a provider request that produced no response.
pub(crate) fn provider_origin(error: ProviderError) -> (ErrorOrigin, &'static str) {
    match error {
        ProviderError::Configuration => (ErrorOrigin::Gateway, "configuration"),
        ProviderError::Busy => (ErrorOrigin::Gateway, "capacity"),
        ProviderError::Timeout => (ErrorOrigin::ProviderTransport, "timeout"),
        ProviderError::Transport => (ErrorOrigin::ProviderTransport, "transport"),
    }
}

pub(crate) struct RequestBodyPermit<'a> {
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
        crate::observability::record_capacity("model_catalog", max_concurrent_resolutions);
        crate::observability::record_capacity("resolution", max_concurrent_resolutions);
        Ok(Self {
            control_plane: ControlPlaneClient::new(config)?,
            provider: ProviderTransport::new(max_active_requests)
                .map_err(|_| ResolutionError::Configuration)?
                .with_telemetry(telemetry.clone()),
            request_body_capacity: Semaphore::new(max_active_requests),
            model_catalog_capacity: Semaphore::new(max_concurrent_resolutions),
            resolution_capacity: Semaphore::new(max_concurrent_resolutions),
            telemetry: Some(telemetry),
        })
    }

    pub fn telemetry(&self) -> Option<crate::telemetry::Telemetry> {
        self.telemetry.clone()
    }

    fn try_reserve_resolution(&self) -> Result<SemaphorePermit<'_>, ResolutionError> {
        self.resolution_capacity.try_acquire().map_err(|_| {
            crate::observability::rejected("resolution");
            ResolutionError::Busy
        })
    }

    pub(crate) fn try_reserve_request_body(
        &self,
    ) -> Result<RequestBodyPermit<'_>, RequestPreparationError> {
        let permit = self.request_body_capacity.try_acquire().map_err(|_| {
            crate::observability::rejected("request_body");
            RequestPreparationError::Resolution(ResolutionError::Busy)
        })?;
        Ok(RequestBodyPermit { _permit: permit })
    }

    pub(crate) async fn fetch_model_catalog(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
        correlation: &RequestCorrelation,
    ) -> Result<Vec<u8>, ResolutionError> {
        let _permit = self.model_catalog_capacity.try_acquire().map_err(|_| {
            crate::observability::rejected("model_catalog");
            ResolutionError::Busy
        })?;
        let _active = crate::observability::Active::new("model_catalog");
        let started = Instant::now();
        let body = self
            .control_plane
            .models(gateway_key, api_format, correlation.id())
            .await;
        correlation
            .observation()
            .record_phase(Phase::ModelCatalog, started.elapsed());
        let body = body?;
        crate::providers::model_list::provider_response(&body, api_format)
    }

    /// Authenticate, then reserve execution capacity. The API format comes from the public route,
    /// so Web selects a compatible connection. A successful resolution is recorded even if
    /// execution admission then fails.
    pub(crate) async fn resolve_and_admit(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
        model: &str,
        correlation: &mut RequestCorrelation,
    ) -> Result<(RequestPermit, ResolvedRequestContext), RequestPreparationError> {
        let span = tracing::info_span!(
            "resolution",
            otel.kind = "internal",
            gateway.outcome = tracing::field::Empty,
            otel.status_code = tracing::field::Empty,
            error.type = tracing::field::Empty
        );
        async {
            let prepared = self
                .prepare(gateway_key, api_format, model, correlation)
                .await;
            let span = tracing::Span::current();
            span.record(
                "gateway.outcome",
                match &prepared {
                    Ok(_) => "admitted",
                    Err(RequestPreparationError::Resolution(_)) => "resolution_failed",
                    Err(RequestPreparationError::Provider(_)) => "busy",
                },
            );
            // Caller-caused failures (bad key, forbidden model) stay unset so
            // Datadog error rates track gateway and control-plane faults only.
            if let Err(error) = &prepared
                && let (origin, reason) = error.origin()
                && origin.is_ours()
            {
                span.record("otel.status_code", "ERROR");
                span.record("error.type", reason);
            }
            prepared
        }
        .instrument(span)
        .await
    }

    async fn prepare(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
        model: &str,
        correlation: &mut RequestCorrelation,
    ) -> Result<(RequestPermit, ResolvedRequestContext), RequestPreparationError> {
        let resolution_permit = self
            .try_reserve_resolution()
            .map_err(RequestPreparationError::Resolution)?;
        let context = {
            let _active = crate::observability::Active::new("resolution");
            let started = Instant::now();
            let context = self
                .control_plane
                .resolve(gateway_key, api_format, model, correlation.id())
                .await;
            correlation
                .observation()
                .record_phase(Phase::Resolution, started.elapsed());
            context.map_err(RequestPreparationError::Resolution)?
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
        model_range: Range<usize>,
        route: Route,
        correlation: &mut RequestCorrelation,
    ) -> Result<Response<Body>, ProviderError> {
        self.provider
            .forward_route(
                permit,
                context,
                headers,
                body,
                model_range,
                route,
                correlation,
            )
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
            request_body_capacity: Semaphore::new(resolutions),
            model_catalog_capacity: Semaphore::new(resolutions),
            resolution_capacity: Semaphore::new(resolutions),
            telemetry: None,
        }
    }
}
