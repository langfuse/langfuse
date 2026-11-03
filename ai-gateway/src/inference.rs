//! Resolve the caller's credential, then execute using only the trusted context.
use std::{sync::Arc, time::Duration};

use axum::{
    body::Body,
    http::{HeaderMap, Response},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
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
    request_limits: RequestLimits,
    memory_budget: Arc<Semaphore>,
    telemetry: Option<crate::telemetry::Telemetry>,
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
        ProviderError::Timeout => (ErrorOrigin::ProviderTransport, "timeout"),
        ProviderError::Transport => (ErrorOrigin::ProviderTransport, "transport"),
    }
}

/// Bytes one in-flight request holds from the shared memory budget: a fixed overhead
/// for response capture and connection buffers, plus its body as it arrives. It is held
/// with the execution and released once the response ends.
pub(crate) struct MemoryReservation {
    bytes: OwnedSemaphorePermit,
    overhead: usize,
    budget: Arc<Semaphore>,
}

impl MemoryReservation {
    /// Grow the reservation to the overhead plus `body` bytes without waiting.
    ///
    /// # Errors
    /// Returns [`ResolutionError::Busy`] when the shared budget cannot cover `body`,
    /// recording the rejection under `phase`.
    pub(crate) fn try_reserve_body(
        &mut self,
        body: usize,
        phase: &'static str,
    ) -> Result<(), ResolutionError> {
        let Some(missing) = self
            .overhead
            .saturating_add(body)
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
                crate::observability::rejected(phase);
                ResolutionError::Busy
            })?;
        crate::observability::memory_reserved(missing);
        self.bytes.merge(reserved);
        Ok(())
    }
}

impl Drop for MemoryReservation {
    fn drop(&mut self) {
        crate::observability::memory_released(self.bytes.num_permits());
    }
}

/// Uploads slower than 10 MiB per 30 seconds on average miss the read deadline.
const MIN_REQUEST_UPLOAD_BYTES_PER_SECOND: usize = 10 * 1024 * 1024 / 30;
const MIN_REQUEST_READ_TIMEOUT: Duration = Duration::from_secs(30);

impl InferenceService {
    /// Initialize pooled clients for resolution and provider requests.
    ///
    /// # Errors
    /// Returns a sanitized configuration error for invalid limits or client setup.
    pub fn new(
        control_plane: ControlPlaneConfig,
        config: &GatewayConfig,
    ) -> Result<Self, ResolutionError> {
        if config.request_limits.memory_budget_bytes > Semaphore::MAX_PERMITS {
            return Err(ResolutionError::Configuration);
        }
        let telemetry =
            crate::telemetry::Telemetry::new(&control_plane, config.telemetry_buffer_bytes)?;
        crate::observability::record_memory_budget(config.request_limits.memory_budget_bytes);
        Ok(Self {
            control_plane: ControlPlaneClient::new(control_plane)?,
            provider: ProviderTransport::new(config.execution_limits)
                .map_err(|_| ResolutionError::Configuration)?
                .with_telemetry(telemetry.clone()),
            request_limits: config.request_limits,
            memory_budget: Arc::new(Semaphore::new(config.request_limits.memory_budget_bytes)),
            telemetry: Some(telemetry),
        })
    }

    pub fn telemetry(&self) -> Option<crate::telemetry::Telemetry> {
        self.telemetry.clone()
    }

    /// Reserve the fixed per-request overhead without waiting. `phase` labels a rejection.
    ///
    /// # Errors
    /// Returns [`ResolutionError::Busy`] when the shared budget cannot cover the overhead.
    pub(crate) fn try_reserve_memory(
        &self,
        phase: &'static str,
    ) -> Result<MemoryReservation, ResolutionError> {
        let overhead = self.request_limits.request_overhead_bytes;
        let bytes = u32::try_from(overhead)
            .ok()
            .and_then(|overhead| {
                Arc::clone(&self.memory_budget)
                    .try_acquire_many_owned(overhead)
                    .ok()
            })
            .ok_or_else(|| {
                crate::observability::rejected(phase);
                ResolutionError::Busy
            })?;
        crate::observability::memory_reserved(overhead);
        Ok(MemoryReservation {
            bytes,
            overhead,
            budget: Arc::clone(&self.memory_budget),
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
    ) -> Result<Body, ResolutionError> {
        let mut reservation = self.try_reserve_memory("model_catalog")?;
        let _active = crate::observability::Active::new("model_catalog");
        let body = self
            .control_plane
            .models(gateway_key, api_format, correlation.id(), &mut |capacity| {
                reservation.try_reserve_body(capacity, "model_catalog")
            })
            .await?;
        // Parsing holds the typed catalog and the provider-shaped output beside the body.
        reservation.try_reserve_body(body.len().saturating_mul(3), "model_catalog")?;
        let catalog = crate::providers::model_list::provider_response(&body, api_format)?;
        drop(body);
        // The reservation is released once the client has read the catalog.
        Ok(self.provider.relay_buffered(catalog, reservation))
    }

    /// Authenticate, then start the execution. The API format comes from the public route,
    /// so Web selects a compatible connection. Memory is already reserved by the caller.
    pub(crate) async fn resolve_and_admit(
        &self,
        gateway_key: &str,
        api_format: ApiFormat,
        model: &str,
        correlation: &mut RequestCorrelation,
    ) -> Result<(RequestPermit, ResolvedRequestContext), ResolutionError> {
        let span = tracing::info_span!(
            "resolution",
            otel.kind = "internal",
            gateway.outcome = tracing::field::Empty,
            gateway.resolution.retry = tracing::field::Empty,
            otel.status_code = tracing::field::Empty,
            error.type = tracing::field::Empty
        );
        async {
            let resolved = {
                let _active = crate::observability::Active::new("resolution");
                self.control_plane
                    .resolve(gateway_key, api_format, model, correlation.id())
                    .await
            };
            let span = tracing::Span::current();
            span.record(
                "gateway.outcome",
                if resolved.is_ok() {
                    "admitted"
                } else {
                    "resolution_failed"
                },
            );
            // Caller-caused failures (bad key, forbidden model) stay unset so
            // Datadog error rates track gateway and control-plane faults only.
            if let Err(error) = resolved
                && let (origin, reason) = resolution_origin(error)
                && origin.is_ours()
            {
                span.record("otel.status_code", "ERROR");
                span.record("error.type", reason);
            }
            let context = resolved?;
            correlation.record_resolution(&context);
            Ok((self.provider.admit(), context))
        }
        .instrument(span)
        .await
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
    pub(crate) fn for_test(control_plane: ControlPlaneClient, provider: ProviderTransport) -> Self {
        Self {
            control_plane,
            provider,
            request_limits: RequestLimits::default(),
            memory_budget: Arc::new(Semaphore::new(RequestLimits::default().memory_budget_bytes)),
            telemetry: None,
        }
    }

    #[cfg(test)]
    pub(crate) fn with_request_limits(mut self, request_limits: RequestLimits) -> Self {
        self.memory_budget = Arc::new(Semaphore::new(request_limits.memory_budget_bytes));
        self.request_limits = request_limits;
        self
    }

    #[cfg(test)]
    pub(crate) fn available_memory(&self) -> usize {
        self.memory_budget.available_permits()
    }
}
