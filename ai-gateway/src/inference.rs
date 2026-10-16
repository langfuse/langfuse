//! Resolve the caller's credential, then execute using only the trusted context.
use std::{sync::Arc, time::Duration};

use axum::{
    body::Body,
    http::{HeaderMap, Response},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, SemaphorePermit};
use tracing::Instrument;

use crate::{
    config::{GatewayConfig, RequestLimits},
    correlation::RequestCorrelation,
    observability::ErrorOrigin,
    providers::{ProviderError, ProviderTransport, RequestBody, RequestPermit, Route},
    resolution::{
        ApiFormat, ControlPlaneClient, ControlPlaneConfig, ResolutionError, ResolvedRequestContext,
    },
};

pub struct InferenceService {
    control_plane: ControlPlaneClient,
    provider: ProviderTransport,
    request_body_capacity: Arc<Semaphore>,
    request_limits: RequestLimits,
    request_bytes_capacity: Arc<Semaphore>,
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

/// One request-body slot plus the body bytes reserved so far from the shared budget.
/// It is held with the execution and released once the response ends.
pub(crate) struct RequestBodyPermit {
    _slot: OwnedSemaphorePermit,
    bytes: OwnedSemaphorePermit,
    budget: Arc<Semaphore>,
}

impl RequestBodyPermit {
    /// Grow the reservation to `total` body bytes without waiting.
    ///
    /// # Errors
    /// Returns [`ResolutionError::Busy`] when the shared budget cannot cover `total`.
    pub(crate) fn try_reserve_bytes(&mut self, total: usize) -> Result<(), ResolutionError> {
        let Some(missing) = total
            .checked_sub(self.bytes.num_permits())
            .filter(|missing| *missing > 0)
        else {
            return Ok(());
        };
        let reserved = u32::try_from(missing)
            .ok()
            .and_then(|missing| {
                Arc::clone(&self.budget)
                    .try_acquire_many_owned(missing)
                    .ok()
            })
            .ok_or_else(|| {
                crate::observability::rejected("request_bytes");
                ResolutionError::Busy
            })?;
        self.bytes.merge(reserved);
        Ok(())
    }
}

/// Uploads slower than 10 MiB per 30 seconds on average miss the read deadline.
const MIN_REQUEST_UPLOAD_BYTES_PER_SECOND: usize = 10 * 1024 * 1024 / 30;
const MIN_REQUEST_READ_TIMEOUT: Duration = Duration::from_secs(30);

impl InferenceService {
    /// Initialize pooled clients for resolution and provider requests.
    ///
    /// # Errors
    /// Returns a sanitized configuration error for invalid capacities or client setup.
    pub fn new(
        control_plane: ControlPlaneConfig,
        config: &GatewayConfig,
    ) -> Result<Self, ResolutionError> {
        let max_concurrent_resolutions = config.max_concurrent_resolutions;
        if !(1..=Semaphore::MAX_PERMITS).contains(&max_concurrent_resolutions) {
            return Err(ResolutionError::Configuration);
        }
        let telemetry =
            crate::telemetry::Telemetry::new(&control_plane, config.telemetry_buffer_bytes)?;
        crate::observability::record_capacity("model_catalog", max_concurrent_resolutions);
        crate::observability::record_capacity("resolution", max_concurrent_resolutions);
        Ok(Self {
            control_plane: ControlPlaneClient::new(control_plane)?,
            provider: ProviderTransport::new(config.max_active_requests, config.execution_limits)
                .map_err(|_| ResolutionError::Configuration)?
                .with_telemetry(telemetry.clone()),
            request_body_capacity: Arc::new(Semaphore::new(config.max_active_requests)),
            request_limits: config.request_limits,
            request_bytes_capacity: Arc::new(Semaphore::new(
                config.request_limits.shared_buffer_bytes,
            )),
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
    ) -> Result<RequestBodyPermit, RequestPreparationError> {
        let slot = Arc::clone(&self.request_body_capacity)
            .try_acquire_owned()
            .map_err(|_| {
                crate::observability::rejected("request_body");
                RequestPreparationError::Resolution(ResolutionError::Busy)
            })?;
        let bytes = Arc::clone(&self.request_bytes_capacity)
            .try_acquire_many_owned(0)
            .map_err(|_| RequestPreparationError::Resolution(ResolutionError::Unavailable))?;
        Ok(RequestBodyPermit {
            _slot: slot,
            bytes,
            budget: Arc::clone(&self.request_bytes_capacity),
        })
    }

    pub(crate) fn max_request_bytes(&self) -> usize {
        self.request_limits.max_request_bytes
    }

    /// The body read deadline scales with the size limit so a maximal body has the same
    /// minimum upload rate as a small one.
    pub(crate) fn request_read_timeout(&self) -> Duration {
        let seconds = self
            .request_limits
            .max_request_bytes
            .div_ceil(MIN_REQUEST_UPLOAD_BYTES_PER_SECOND);
        Duration::from_secs(u64::try_from(seconds).unwrap_or(u64::MAX))
            .max(MIN_REQUEST_READ_TIMEOUT)
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
        let body = self
            .control_plane
            .models(gateway_key, api_format, correlation.id())
            .await?;
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

    pub(crate) async fn forward(
        &self,
        permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        request: RequestBody,
        route: Route,
        correlation: &mut RequestCorrelation,
    ) -> Result<Response<Body>, ProviderError> {
        self.provider
            .forward_route(permit, context, headers, request, route, correlation)
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
            request_body_capacity: Arc::new(Semaphore::new(resolutions)),
            request_limits: RequestLimits::default(),
            request_bytes_capacity: Arc::new(Semaphore::new(
                RequestLimits::default().shared_buffer_bytes,
            )),
            model_catalog_capacity: Semaphore::new(resolutions),
            resolution_capacity: Semaphore::new(resolutions),
            telemetry: None,
        }
    }

    #[cfg(test)]
    pub(crate) fn with_request_limits(mut self, request_limits: RequestLimits) -> Self {
        self.request_bytes_capacity = Arc::new(Semaphore::new(request_limits.shared_buffer_bytes));
        self.request_limits = request_limits;
        self
    }
}
