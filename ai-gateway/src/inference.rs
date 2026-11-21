//! Resolve the caller's credential, then execute using only the trusted context.
use std::{sync::Arc, time::Duration};

use axum::{
    body::Body,
    http::{HeaderMap, Response},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tracing::Instrument;

use crate::{
    capture::{ExecutionCapture, GatewayRejection},
    config::{GatewayConfig, RequestLimits},
    correlation::RequestCorrelation,
    observability::ErrorOrigin,
    providers::{ProviderError, ProviderTransport, RequestBody, RequestPermit, Route},
    resolution::{
        ApiFormat, ControlPlaneClient, ControlPlaneConfig, IngestionMode, RateLimitKind,
        ResolutionError, ResolvedRequestContext,
    },
};

pub struct InferenceService {
    control_plane: Arc<ControlPlaneClient>,
    provider: ProviderTransport,
    request_limits: RequestLimits,
    memory_budget: Arc<Semaphore>,
    telemetry: Option<crate::telemetry::Telemetry>,
    spend_limits: crate::spend::SpendLimits,
}

/// `error.origin` and `error.reason` for a failed resolution or catalog fetch.
pub(crate) fn resolution_origin(error: &ResolutionError) -> (ErrorOrigin, &'static str) {
    use ResolutionError as R;
    match error {
        R::Configuration => (ErrorOrigin::Gateway, "configuration"),
        R::Busy => (ErrorOrigin::Gateway, "capacity"),
        R::InvalidCredential | R::Authentication => (ErrorOrigin::Client, "authentication"),
        R::InvalidRequest => (ErrorOrigin::Client, "invalid_request"),
        R::Forbidden => (ErrorOrigin::Client, "forbidden"),
        R::ModelNotAllowed => (ErrorOrigin::Client, "model_not_allowed"),
        R::NoRoute => (ErrorOrigin::Client, "no_route"),
        R::RateLimited(limit) => (ErrorOrigin::Client, rate_limited_reason(limit.kind())),
        R::SpendLimitExceeded(_) => (ErrorOrigin::Client, "spend_limit_exceeded"),
        R::SpendLimitUnavailable => (ErrorOrigin::Gateway, "spend_limit_unavailable"),
        R::SpendLimitUnpricedModel => (ErrorOrigin::Client, "spend_limit_unpriced_model"),
        R::Unavailable => (ErrorOrigin::ControlPlane, "unavailable"),
        R::Timeout => (ErrorOrigin::ControlPlane, "timeout"),
        R::Transport => (ErrorOrigin::ControlPlane, "transport"),
        R::InvalidResponse => (ErrorOrigin::ControlPlane, "invalid_response"),
        R::ResponseTooLarge => (ErrorOrigin::ControlPlane, "response_too_large"),
    }
}

/// Distinct from `provider_rate_limited`, which is the provider's own 429.
pub(crate) fn rate_limited_reason(kind: RateLimitKind) -> &'static str {
    match kind {
        RateLimitKind::Requests => "rate_limited_requests",
        RateLimitKind::Bytes => "rate_limited_bytes",
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
/// for response capture and connection buffers, plus its body as it arrives. It is
/// held with the execution and released once the response ends. A request charged to
/// spend limits reserves its larger response parse separately, only when needed.
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
        self.try_acquire(missing, phase)
    }

    /// A later, separate reservation of `bytes` from the same budget, taken without
    /// waiting. It is `None` when the budget cannot cover it then.
    pub(crate) fn deferred(&self, bytes: usize) -> crate::capture::ResponseParseGrowth {
        let budget = Arc::clone(&self.budget);
        Box::new(move || {
            let permit = Arc::clone(&budget)
                .try_acquire_many_owned(u32::try_from(bytes).ok()?)
                .ok()?;
            crate::observability::memory_reserved(bytes);
            Some(Box::new(Self {
                bytes: permit,
                overhead: 0,
                budget,
            }))
        })
    }

    fn try_acquire(&mut self, bytes: usize, phase: &'static str) -> Result<(), ResolutionError> {
        let reserved = u32::try_from(bytes)
            .ok()
            .and_then(|bytes| Arc::clone(&self.budget).try_acquire_many_owned(bytes).ok())
            .ok_or_else(|| {
                crate::observability::rejected(phase);
                ResolutionError::Busy
            })?;
        crate::observability::memory_reserved(bytes);
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
const CONNECTION_WARMUP_TIMEOUT: Duration = Duration::from_secs(2);

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
        let control_plane = Arc::new(ControlPlaneClient::new(control_plane)?);
        Ok(Self {
            control_plane: Arc::clone(&control_plane),
            provider: ProviderTransport::new(
                config.execution_limits,
                config.outbound_policy.clone(),
            )
            .map_err(|_| ResolutionError::Configuration)?
            .with_telemetry(telemetry.clone()),
            request_limits: config.request_limits,
            memory_budget: Arc::new(Semaphore::new(config.request_limits.memory_budget_bytes)),
            telemetry: Some(telemetry),
            spend_limits: crate::spend::SpendLimits::new(
                config.spend_counters.clone(),
                control_plane,
            ),
        })
    }

    /// Pre-connect the resolver and telemetry clients to Web, and the spend counters to
    /// Redis, so the first request on a new gateway skips connection setup. Best-effort:
    /// a slow or unavailable Web or Redis is only logged.
    pub async fn open_connections(&self) {
        let deadline = tokio::time::Instant::now() + CONNECTION_WARMUP_TIMEOUT;
        let (resolver, ingestion, spend_counters) = tokio::join!(
            tokio::time::timeout_at(deadline, self.control_plane.open_connection()),
            async {
                match &self.telemetry {
                    Some(telemetry) => {
                        tokio::time::timeout_at(deadline, telemetry.open_connection()).await
                    }
                    None => Ok(true),
                }
            },
            tokio::time::timeout_at(deadline, self.spend_limits.open_connection()),
        );
        match spend_counters {
            Ok(Some(true) | None) => {}
            Ok(Some(false)) | Err(_) => {
                tracing::warn!("gateway could not pre-connect to the spend counter redis");
            }
        }
        let resolver = resolver.unwrap_or(false);
        let ingestion = ingestion.unwrap_or(false);
        if resolver && ingestion {
            tracing::info!("gateway connected to web");
        } else {
            tracing::warn!(resolver, ingestion, "gateway could not pre-connect to web");
        }
    }

    pub fn telemetry(&self) -> Option<crate::telemetry::Telemetry> {
        self.telemetry.clone()
    }

    /// Pending spend counter writes and limit reports, to drain on shutdown.
    pub fn spend_tasks(&self) -> crate::spend::SpendTasks {
        self.spend_limits.tasks()
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
    /// so Web selects a compatible connection, and `request_bytes` counts toward the
    /// organization's byte rate limit. Memory is already reserved by the caller.
    pub(crate) async fn resolve_and_admit(
        &self,
        gateway_key: &str,
        route: Route,
        model: &str,
        headers: &HeaderMap,
        body: &[u8],
        correlation: &mut RequestCorrelation,
    ) -> Result<(RequestPermit, ResolvedRequestContext), ResolutionError> {
        let api_format = route.api_format();
        let request_bytes = body.len();
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
                    .resolve(
                        gateway_key,
                        api_format,
                        model,
                        request_bytes,
                        correlation.id(),
                    )
                    .await
            };
            let span = tracing::Span::current();
            span.record(
                "gateway.outcome",
                match &resolved {
                    Ok(_) => "admitted",
                    Err(ResolutionError::RateLimited(_)) => "rate_limited",
                    Err(_) => "resolution_failed",
                },
            );
            // Caller-caused failures (bad key, forbidden model, rate limits) stay unset
            // so Datadog error rates track gateway and control-plane faults only.
            if let Err(ResolutionError::RateLimited(limit)) = &resolved {
                correlation.record_rate_limit(limit);
            }
            if let Err(error) = &resolved
                && let (origin, reason) = resolution_origin(error)
                && origin.is_ours()
            {
                span.record("otel.status_code", "ERROR");
                span.record("error.type", reason);
            }
            let context = resolved?;
            correlation.record_resolution(&context);
            if !route.captures_generation() {
                return Ok((self.provider.admit(None), context));
            }
            let spend_limits = match self
                .spend_limits
                .check(&context, gateway_key, correlation.id())
                .await
            {
                Ok(spend_limits) => spend_limits,
                Err(error) => {
                    let (origin, reason) = resolution_origin(&error);
                    span.record("gateway.outcome", reason);
                    if origin.is_ours() {
                        span.record("otel.status_code", "ERROR");
                        span.record("error.type", reason);
                    }
                    if route.captures_generation() {
                        self.record_rejection(
                            api_format,
                            &context,
                            headers,
                            body,
                            correlation,
                            crate::http::resolution_rejection(&error),
                        );
                    }
                    return Err(error);
                }
            };
            Ok((self.provider.admit(spend_limits), context))
        }
        .instrument(span)
        .await
    }

    /// Records the refused request as a generation, like one the provider answered.
    fn record_rejection(
        &self,
        api_format: ApiFormat,
        context: &ResolvedRequestContext,
        headers: &HeaderMap,
        body: &[u8],
        correlation: &mut RequestCorrelation,
        rejection: GatewayRejection,
    ) {
        let Some(telemetry) = &self.telemetry else {
            return;
        };
        if context.ingestion_mode() == IngestionMode::None {
            return;
        }
        let mut capture = ExecutionCapture::for_request(api_format, context, headers, body);
        capture.deliver_to(telemetry.clone(), context, headers, correlation);
        capture.set_provider_model(context.connection().provider_model());
        capture.reject(rejection);
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
            control_plane: Arc::new(control_plane),
            provider,
            request_limits: RequestLimits::default(),
            memory_budget: Arc::new(Semaphore::new(RequestLimits::default().memory_budget_bytes)),
            telemetry: None,
            spend_limits: crate::spend::SpendLimits::default(),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_telemetry(mut self, telemetry: crate::telemetry::Telemetry) -> Self {
        self.telemetry = Some(telemetry);
        self
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
