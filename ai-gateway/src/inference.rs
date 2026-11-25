//! Resolve the caller's credential, then execute using only the trusted context.
use std::{sync::Arc, time::Duration};

use axum::{
    body::Body,
    http::{HeaderMap, Response},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tracing::Instrument;

use crate::{
    capture::{ExecutionCapture, GatewayRejection, RequestInput},
    config::{GatewayConfig, RequestLimits},
    correlation::RequestCorrelation,
    cpu::{CpuJob, CpuWork},
    guardrails::Finding,
    http::ParsedRequest,
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
    guardrails: crate::guardrails::Guardrails,
    request_limits: RequestLimits,
    memory_budget: Arc<Semaphore>,
    telemetry: Option<crate::telemetry::Telemetry>,
    spend_limits: crate::spend::SpendLimits,
    cpu: CpuWork,
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
        R::GuardrailBlocked(_) => (ErrorOrigin::Client, "guardrail_blocked"),
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
    /// Reserve temporary working memory from `budget` without waiting.
    pub(crate) fn from_budget(
        budget: &Arc<Semaphore>,
        bytes: usize,
        phase: &'static str,
    ) -> Result<Self, ResolutionError> {
        let reserved = u32::try_from(bytes)
            .ok()
            .and_then(|bytes| Arc::clone(budget).try_acquire_many_owned(bytes).ok())
            .ok_or_else(|| {
                crate::observability::rejected(phase);
                ResolutionError::Busy
            })?;
        crate::observability::memory_reserved(bytes);
        Ok(Self {
            bytes: reserved,
            overhead: 0,
            budget: Arc::clone(budget),
        })
    }

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
        let telemetry = crate::telemetry::Telemetry::new(
            &control_plane,
            config.telemetry_buffer_bytes,
            config.telemetry_batch_linger,
        )?;
        crate::observability::record_memory_budget(config.request_limits.memory_budget_bytes);
        let control_plane = Arc::new(ControlPlaneClient::new(control_plane)?);
        let memory_budget = Arc::new(Semaphore::new(config.request_limits.memory_budget_bytes));
        let cpu = CpuWork::new();
        let guardrails = crate::guardrails::Guardrails::new(
            config.outbound_policy.clone(),
            config.external_guardrail_timeout,
            cpu.clone(),
            Arc::clone(&memory_budget),
        )?;
        Ok(Self {
            control_plane: Arc::clone(&control_plane),
            provider: ProviderTransport::new(
                config.execution_limits,
                config.outbound_policy.clone(),
            )
            .map_err(|_| ResolutionError::Configuration)?
            .with_telemetry(telemetry.clone()),
            guardrails,
            request_limits: config.request_limits,
            memory_budget,
            telemetry: Some(telemetry),
            spend_limits: crate::spend::SpendLimits::new(
                config.spend_counters.clone(),
                control_plane,
            ),
            cpu,
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

    /// Runs CPU-bound work over a request input of `input_bytes` without holding an
    /// async worker for long; see [`CpuWork::run`].
    ///
    /// # Errors
    /// Returns [`ResolutionError::Busy`] when the work did not complete.
    pub(crate) async fn run_cpu<T: Send + 'static>(
        &self,
        job: CpuJob,
        input_bytes: usize,
        work: impl FnOnce() -> T + Send + 'static,
    ) -> Result<T, ResolutionError> {
        self.cpu
            .run(job, input_bytes, work)
            .await
            .ok_or(ResolutionError::Busy)
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
    /// so Web selects a compatible connection, and the body size counts toward the
    /// organization's byte rate limit. Memory is already reserved by the caller. A
    /// refused request records the request's input, taking it.
    pub(crate) async fn resolve_and_admit(
        &self,
        gateway_key: &str,
        route: Route,
        headers: &HeaderMap,
        request: &mut ParsedRequest,
        correlation: &mut RequestCorrelation,
    ) -> Result<(RequestPermit, ResolvedRequestContext), ResolutionError> {
        let api_format = route.api_format();
        let request_bytes = request.body().len();
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
                        &request.model,
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
            let spend_limits = if route.captures_generation() {
                match self
                    .spend_limits
                    .check(&context, gateway_key, correlation.id())
                    .await
                {
                    Ok(spend_limits) => spend_limits,
                    Err(error) => {
                        self.refuse(&context, headers, request, correlation, &error, &[]);
                        return Err(error);
                    }
                }
            } else {
                None
            };
            let guardrails = self.guardrails.check(api_format, &context, request).await?;
            if let Some(blocking) = guardrails.blocking() {
                let error = ResolutionError::GuardrailBlocked(
                    format!("Request blocked by guardrail \"{}\"", blocking.name).into(),
                );
                let findings = guardrails.into_findings();
                self.refuse(&context, headers, request, correlation, &error, &findings);
                return Err(error);
            }
            let mut permit = self.provider.admit(spend_limits);
            let (findings, redactions, redaction_reservations) = guardrails.into_parts();
            permit.guardrails = findings;
            permit.redactions = redactions;
            permit.redaction_reservations = redaction_reservations;
            Ok((permit, context))
        }
        .instrument(span)
        .await
    }

    /// Records a refusal on the resolution span and, for a generation, as a
    /// rejected generation carrying the guardrails it matched.
    fn refuse(
        &self,
        context: &ResolvedRequestContext,
        headers: &HeaderMap,
        request: &mut ParsedRequest,
        correlation: &mut RequestCorrelation,
        error: &ResolutionError,
        guardrails: &[Finding],
    ) {
        let span = tracing::Span::current();
        let (origin, reason) = resolution_origin(error);
        span.record("gateway.outcome", reason);
        if origin.is_ours() {
            span.record("otel.status_code", "ERROR");
            span.record("error.type", reason);
        }
        if let Some(input) = request.input.take() {
            self.record_rejection(
                context,
                headers,
                input,
                correlation,
                crate::http::resolution_rejection(error),
                guardrails,
            );
        }
    }

    /// Records the refused request as a generation, like one the provider answered.
    fn record_rejection(
        &self,
        context: &ResolvedRequestContext,
        headers: &HeaderMap,
        input: RequestInput,
        correlation: &mut RequestCorrelation,
        rejection: GatewayRejection,
        guardrails: &[Finding],
    ) {
        let Some(telemetry) = &self.telemetry else {
            return;
        };
        if context.ingestion_mode() == IngestionMode::None {
            return;
        }
        let api_format = context.connection().api_format();
        let mut capture = ExecutionCapture::for_request(api_format, context, headers, input);
        capture.deliver_to(telemetry.clone(), context, headers, correlation);
        capture.set_provider_model(context.connection().provider_model());
        capture.record_guardrails(guardrails);
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
        let memory_budget = Arc::new(Semaphore::new(RequestLimits::default().memory_budget_bytes));
        let cpu = CpuWork::new();
        let guardrails = crate::guardrails::Guardrails::new(
            crate::providers::OutboundPolicy::default(),
            Duration::from_secs(3),
            cpu.clone(),
            Arc::clone(&memory_budget),
        )
        .unwrap();
        Self {
            control_plane: Arc::new(control_plane),
            provider,
            guardrails,
            request_limits: RequestLimits::default(),
            memory_budget,
            telemetry: None,
            spend_limits: crate::spend::SpendLimits::default(),
            cpu,
        }
    }

    #[cfg(test)]
    pub(crate) fn with_external_guardrails(
        mut self,
        external_guardrails: crate::guardrails::external::ExternalGuardrailClient,
    ) -> Self {
        self.guardrails = self.guardrails.with_external(external_guardrails);
        self
    }

    #[cfg(test)]
    pub(crate) fn with_telemetry(mut self, telemetry: crate::telemetry::Telemetry) -> Self {
        self.telemetry = Some(telemetry);
        self
    }

    #[cfg(test)]
    pub(crate) fn with_request_limits(mut self, request_limits: RequestLimits) -> Self {
        self.memory_budget = Arc::new(Semaphore::new(request_limits.memory_budget_bytes));
        self.guardrails
            .set_memory_budget(Arc::clone(&self.memory_budget));
        self.request_limits = request_limits;
        self
    }

    #[cfg(test)]
    pub(crate) fn available_memory(&self) -> usize {
        self.memory_budget.available_permits()
    }
}
