mod chat_completions;
pub(crate) use chat_completions::StreamOptions;
pub(crate) mod model_list;
mod outbound;
pub(crate) mod usage;

use std::{ops::Range, sync::Arc, time::Duration};

use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, HeaderName, HeaderValue, Response, StatusCode, header},
};
use reqwest::Client;
use reqwest_middleware::ClientWithMiddleware;
use reqwest_tracing::DisableOtelPropagation;
use tokio::time::Instant;

pub use crate::transport::ProviderError;
use crate::{
    capture::{ExecutionCapture, MAX_RESPONSE_PARSE_BYTES, RelayOutcome, RequestInput},
    config::ExecutionLimits,
    correlation::{RequestCorrelation, UpstreamTarget},
    cpu::{CpuClass, CpuWork},
    guardrails::{
        BlockReason, Guardrail, GuardrailRejection, Guardrails, response::ResponseFormat,
    },
    inference::MemoryReservation,
    observability::{ErrorOrigin, RequestObservation, Wait, provider_status_reason},
    resolution::{
        ApiFormat, IngestionMode, ProviderConnection, ProviderCredential, ResolvedRequestContext,
    },
    transport,
};
pub use outbound::OutboundPolicy;

/// Largest provider response body buffered for output guardrail evaluation.
const MAX_JSON_RESPONSE_GUARDRAIL_BYTES: usize = MAX_RESPONSE_PARSE_BYTES;
/// Streamed SSE responses carry ~200-260 bytes of JSON framing per token, so
/// give SSE a larger raw buffer cap (still bounded by `memory_budget`) to match
/// the generation lengths allowed for non-streaming JSON responses.
const MAX_SSE_RESPONSE_GUARDRAIL_BYTES: usize = 32 * 1024 * 1024;

/// Failures that can end [`ProviderTransport::forward_route`]
/// before returning a provider response to the caller.
#[derive(Debug)]
pub(crate) enum ForwardError {
    Provider(ProviderError),
    GuardrailBlocked(GuardrailRejection),
    Busy,
}

impl From<ProviderError> for ForwardError {
    fn from(error: ProviderError) -> Self {
        Self::Provider(error)
    }
}

/// Resolved request inputs forwarded to an upstream provider.
pub(crate) struct ForwardRequest<'a> {
    pub(crate) permit: RequestPermit,
    pub(crate) context: ResolvedRequestContext,
    pub(crate) headers: &'a HeaderMap,
    pub(crate) request: RequestBody,
    pub(crate) route: Route,
    pub(crate) guardrails: Option<&'a Guardrails>,
}

#[derive(Clone, Copy)]
pub(crate) enum Route {
    OpenAiResponses,
    OpenAiResponsesCompact,
    OpenAiChatCompletions,
    OpenAiDecisions,
    OpenAiEmbeddings,
    AnthropicMessages,
    AnthropicCountTokens,
}

impl Route {
    pub(crate) fn api_format(self) -> ApiFormat {
        match self {
            Self::OpenAiResponses | Self::OpenAiResponsesCompact => ApiFormat::OpenAiResponses,
            Self::OpenAiChatCompletions => ApiFormat::OpenAiChatCompletions,
            Self::OpenAiDecisions => ApiFormat::OpenAiDecisions,
            Self::OpenAiEmbeddings => ApiFormat::OpenAiEmbeddings,
            Self::AnthropicMessages | Self::AnthropicCountTokens => ApiFormat::AnthropicMessages,
        }
    }

    fn path(self) -> &'static str {
        match self {
            Self::OpenAiResponses => "/responses",
            Self::OpenAiResponsesCompact => "/responses/compact",
            Self::OpenAiChatCompletions => "/chat/completions",
            Self::OpenAiDecisions => "/decisions",
            Self::OpenAiEmbeddings => "/embeddings",
            Self::AnthropicMessages => "/messages",
            Self::AnthropicCountTokens => "/messages/count_tokens",
        }
    }

    pub(crate) fn captures_generation(self) -> bool {
        matches!(
            self,
            Self::OpenAiResponses
                | Self::OpenAiResponsesCompact
                | Self::OpenAiChatCompletions
                | Self::OpenAiDecisions
                | Self::OpenAiEmbeddings
                | Self::AnthropicMessages
        )
    }

    // Decisions only return caller-defined choices/categories; Responses
    // compaction returns opaque encrypted compaction items plus retained user
    // turns; embeddings and count_tokens have no generated model text.
    pub(crate) fn evaluates_response_guardrails(self) -> bool {
        matches!(
            self,
            Self::OpenAiResponses | Self::OpenAiChatCompletions | Self::AnthropicMessages
        )
    }
}

#[derive(Default)]
pub(crate) struct ProviderLimits {
    pub execution: ExecutionLimits,
}

/// An admitted execution: its deadline and in-flight accounting. Memory is reserved
/// separately, before the body is read.
pub struct RequestPermit {
    _active: crate::observability::Active,
    deadline: Instant,
    spend_limits: Option<crate::spend::SpendRecording>,
    /// Matched guardrails recorded on the generation.
    pub(crate) guardrails: Vec<crate::guardrails::Finding>,
    /// JSON string replacements from `redact` guardrails, spliced into the
    /// upstream body in one pass alongside `model` and `stream_options`.
    pub(crate) redactions: Vec<crate::guardrails::redact::BodyEdit>,
    /// Memory budget reserved for expanded redaction replacements, held until
    /// the forwarded request finishes.
    pub(crate) redaction_reservations: Vec<MemoryReservation>,
}

impl RequestPermit {
    /// The execution's cost counts toward spend limits.
    pub(crate) fn charges_spend(&self) -> bool {
        self.spend_limits.is_some()
    }
}

/// The validated caller body and the facts the relay needs about it.
pub(crate) struct RequestBody {
    pub bytes: Bytes,
    pub model_range: Range<usize>,
    /// Where `stream_options` sits, for opting a streamed Chat Completions call into usage.
    pub stream_options: StreamOptions,
    /// The caller asked for a streamed response (`"stream": true`).
    pub streaming: bool,
    /// Capacity held for the body, released with the execution once the response ends.
    pub reservation: Option<BodyReservation>,
    /// Grows the capacity when a response charged to spend limits needs a larger parse.
    pub parse_growth: Option<crate::capture::ResponseParseGrowth>,
}

pub(crate) type BodyReservation = Box<dyn Send + Sync>;

pub struct ProviderTransport {
    client: ClientWithMiddleware,
    custom_base_url_client: ClientWithMiddleware,
    limits: ProviderLimits,
    telemetry: Option<crate::telemetry::Telemetry>,
    cpu: CpuWork,
    origin_override: Option<String>,
    policy: Arc<OutboundPolicy>,
}

impl ProviderTransport {
    /// # Errors
    /// Returns [`ProviderError::Configuration`] when the HTTPS client cannot be initialized.
    pub fn new(execution: ExecutionLimits, policy: OutboundPolicy) -> Result<Self, ProviderError> {
        Self::with_limits(ProviderLimits { execution }, policy)
    }

    fn with_limits(limits: ProviderLimits, policy: OutboundPolicy) -> Result<Self, ProviderError> {
        let policy = Arc::new(policy);
        let client = provider_client_builder(limits.execution.max_execution_time)
            .build()
            .map_err(|_| ProviderError::Configuration)?;
        let custom_base_url_client = provider_client_builder(limits.execution.max_execution_time)
            .dns_resolver(outbound::PolicyResolver(Arc::clone(&policy)))
            .build()
            .map_err(|_| ProviderError::Configuration)?;
        Ok(Self {
            client: crate::observability::instrument_client(client, "provider.headers"),
            custom_base_url_client: crate::observability::instrument_client(
                custom_base_url_client,
                "provider.headers",
            ),
            limits,
            telemetry: None,
            cpu: CpuWork::new(),
            origin_override: None,
            policy,
        })
    }

    pub(crate) fn with_telemetry(mut self, telemetry: crate::telemetry::Telemetry) -> Self {
        self.telemetry = Some(telemetry);
        self
    }

    pub(crate) fn with_cpu(mut self, cpu: CpuWork) -> Self {
        self.cpu = cpu;
        self
    }

    /// Start the execution deadline. The execution's cost counts toward `spend_limits`
    /// once it finishes.
    pub(crate) fn admit(
        &self,
        spend_limits: Option<crate::spend::SpendRecording>,
    ) -> RequestPermit {
        RequestPermit {
            _active: crate::observability::Active::new("execution"),
            deadline: Instant::now() + self.limits.execution.max_execution_time,
            spend_limits,
            guardrails: Vec::new(),
            redactions: Vec::new(),
            redaction_reservations: Vec::new(),
        }
    }

    /// Forward as a streamed `OpenAI` Responses call.
    ///
    /// # Errors
    /// See [`Self::forward_route`].
    #[cfg(test)]
    pub async fn forward(
        &self,
        permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        body: Bytes,
    ) -> Result<Response<Body>, ProviderError> {
        let model_range = model_range(&body)?;
        let stream_options = StreamOptions::from_body(&body);
        self.forward_route(
            ForwardRequest {
                permit,
                context,
                headers,
                request: RequestBody {
                    bytes: body,
                    stream_options,
                    model_range,
                    streaming: true,
                    reservation: None,
                    parse_growth: None,
                },
                route: Route::OpenAiResponses,
                guardrails: None,
            },
            &mut RequestCorrelation::from_headers(headers),
        )
        .await
        .map_err(|error| match error {
            ForwardError::Provider(provider) => provider,
            ForwardError::GuardrailBlocked(_) | ForwardError::Busy => ProviderError::Configuration,
        })
    }

    #[expect(
        clippy::too_many_arguments,
        reason = "forwards execution capture inputs from forward_route"
    )]
    async fn start_capture(
        &self,
        route: Route,
        context: &ResolvedRequestContext,
        headers: &HeaderMap,
        body: &Bytes,
        redactions: &[crate::guardrails::redact::BodyEdit],
        reservation: Option<BodyReservation>,
        charges_spend: bool,
        correlation: &mut RequestCorrelation,
    ) -> Result<(ExecutionCapture, Option<BodyReservation>), ProviderError> {
        if !route.captures_generation() {
            return Ok((ExecutionCapture::unobserved(), reservation));
        }
        let delivery = self
            .telemetry
            .as_ref()
            .filter(|_| context.ingestion_mode() != IngestionMode::None);
        // Spend recording also reads request `model_parameters` (e.g. `service_tier`)
        // to match pricing tiers even when `IngestionMode::None` skips telemetry delivery.
        let (input, reservation) = if delivery.is_some() || charges_spend {
            let capture_body = if redactions.is_empty() {
                body.clone()
            } else {
                let mut edits: Vec<(Range<usize>, &[u8])> = redactions
                    .iter()
                    .map(|edit| (edit.range.clone(), edit.replacement.as_slice()))
                    .collect();
                Bytes::from(
                    crate::guardrails::redact::splice_bytes(body, &mut edits)
                        .ok_or(ProviderError::Configuration)?,
                )
            };
            RequestInput::parse_on_cpu(
                &self.cpu,
                CpuClass::for_context(context),
                capture_body,
                reservation,
            )
            .await
            .ok_or(ProviderError::Configuration)?
        } else {
            (RequestInput::omitted(body.len()), reservation)
        };
        let mut capture =
            ExecutionCapture::for_request(route.api_format(), context, headers, input);
        if let Some(telemetry) = delivery {
            capture.deliver_to(telemetry.clone(), context, headers, correlation);
        }
        Ok((capture, reservation))
    }

    pub(crate) async fn forward_route(
        &self,
        input: ForwardRequest<'_>,
        correlation: &mut RequestCorrelation,
    ) -> Result<Response<Body>, ForwardError> {
        let ForwardRequest {
            mut permit,
            context,
            headers,
            request,
            route,
            guardrails,
        } = input;
        let RequestBody {
            bytes: body,
            model_range,
            stream_options,
            streaming,
            reservation,
            parse_growth,
        } = request;
        let api_format = route.api_format();
        let provider_model = context.connection().provider_model();
        // A rejected destination returns before any generation is recorded.
        let upstream = self.post(route, context.connection())?;
        let provider_headers = connection_headers(&context)?;
        let redactions = std::mem::take(&mut permit.redactions);
        let (mut capture, reservation) = self
            .start_capture(
                route,
                &context,
                headers,
                &body,
                &redactions,
                reservation,
                permit.charges_spend(),
                correlation,
            )
            .await?;
        // Capture the caller's body shape, but keep upstream-only changes out of the input.
        let body = upstream_body(
            route,
            body,
            model_range,
            streaming,
            &stream_options,
            provider_model,
            redactions,
        )?;
        capture.charge_on_finish(permit.spend_limits.take(), parse_growth);
        capture.record_guardrails(&permit.guardrails);
        capture.set_provider_model(provider_model);
        correlation.record_upstream(UpstreamTarget::for_connection(
            context.connection(),
            Some(provider_model.to_owned()),
        ));
        let upstream = upstream
            .with_extension(DisableOtelPropagation)
            .headers(transport::request_headers(headers, api_format))
            .header(header::ACCEPT_ENCODING, "identity")
            .headers(provider_headers)
            .body(body);
        let started = Instant::now();
        let observation = correlation.observation();
        // A stream, or a call that does not generate, that goes quiet before its
        // headers is stalled. A non-streamed generation sends nothing until the whole
        // response is generated.
        let headers_deadline = if streaming || !route.captures_generation() {
            permit
                .deadline
                .min(Instant::now() + self.limits.execution.stall_timeout)
        } else {
            permit.deadline
        };
        let response = send_upstream(
            upstream,
            headers_deadline,
            observation,
            started,
            &mut capture,
        )
        .await?;
        if let Some(request_id) = transport::provider_request_id(response.headers(), api_format) {
            tracing::Span::current().record("provider_request_id", request_id);
        }
        let status = response.status();
        capture.record_response(status.as_u16(), response.headers());
        record_provider_status(observation, status);
        let run = ResponseGuardrailRun {
            status,
            headers: transport::response_headers(response.headers(), api_format),
            api_format,
            permit,
            context,
            reservation,
            capture,
            stall_timeout: self.limits.execution.stall_timeout,
        };
        if let Some(guardrails) =
            guardrails.filter(|_| has_active_response_guardrails(status, route, &run.context))
        {
            observation.record_guardrails_evaluated();
            return Box::pin(run.execute(response, guardrails)).await;
        }
        Ok(run.relay_passthrough(response))
    }

    /// Relay a gateway-built response body under the execution deadlines, holding
    /// `owner` until the client has read it or the relay ends.
    pub(crate) fn relay_buffered<T: Send + 'static>(&self, body: Vec<u8>, owner: T) -> Body {
        transport::relay_buffered(
            body,
            Instant::now() + self.limits.execution.max_execution_time,
            self.limits.execution.stall_timeout,
            owner,
        )
    }

    fn post(
        &self,
        route: Route,
        connection: &ProviderConnection,
    ) -> Result<reqwest_middleware::RequestBuilder, ProviderError> {
        if connection.has_custom_base_url() {
            let url = self.custom_destination(route, connection.base_url())?;
            Ok(self.custom_base_url_client.post(url))
        } else {
            let url = self.official_destination(route, connection.base_url())?;
            if let Err(error) = self.policy.check_allowed_host(&url) {
                tracing::warn!(%error, "blocked provider destination");
                return Err(ProviderError::Configuration);
            }
            Ok(self.client.post(url))
        }
    }

    fn official_destination(
        &self,
        route: Route,
        base_url: &str,
    ) -> Result<reqwest::Url, ProviderError> {
        reqwest::Url::parse(&self.request_url(route, base_url))
            .map_err(|_| ProviderError::Configuration)
    }

    /// Literal IP hosts never reach the DNS resolver, so the policy also runs here.
    fn custom_destination(
        &self,
        route: Route,
        base_url: &str,
    ) -> Result<reqwest::Url, ProviderError> {
        let url = self.official_destination(route, base_url)?;
        if let Err(error) = self.policy.check_url(&url) {
            tracing::warn!(%error, "blocked provider destination");
            return Err(ProviderError::Configuration);
        }
        Ok(url)
    }

    fn request_url(&self, route: Route, base_url: &str) -> String {
        let base = self
            .origin_override
            .as_deref()
            .unwrap_or(base_url)
            .trim_end_matches('/');
        let mut url = String::with_capacity(base.len() + route.path().len());
        url.push_str(base);
        url.push_str(route.path());
        url
    }

    #[cfg(test)]
    pub(crate) fn for_test(base_url: String, limits: ProviderLimits) -> Self {
        // Test providers listen on loopback, which the default policy blocks.
        let policy = OutboundPolicy {
            whitelisted_ips: vec![std::net::Ipv4Addr::LOCALHOST.into()],
            ..OutboundPolicy::default()
        };
        let mut provider = Self::with_limits(limits, policy).unwrap();
        provider.origin_override = Some(base_url);
        provider
    }
}

async fn send_upstream(
    upstream: reqwest_middleware::RequestBuilder,
    headers_deadline: Instant,
    observation: &RequestObservation,
    started: Instant,
    capture: &mut ExecutionCapture,
) -> Result<reqwest::Response, ProviderError> {
    let response = tokio::time::timeout_at(headers_deadline, upstream.send())
        .await
        .map_err(|_| ProviderError::Timeout)
        .and_then(|result| {
            result.map_err(|error| {
                if error.is_timeout() {
                    ProviderError::Timeout
                } else {
                    ProviderError::Transport
                }
            })
        });
    observation.record_wait(Wait::ProviderHeaders, started.elapsed());
    response.inspect_err(|error| {
        capture.finish(if matches!(error, ProviderError::Timeout) {
            RelayOutcome::Timeout
        } else {
            RelayOutcome::TransportError
        });
    })
}

fn has_active_response_guardrails(
    status: StatusCode,
    route: Route,
    context: &ResolvedRequestContext,
) -> bool {
    status.is_success()
        && route.evaluates_response_guardrails()
        && context
            .response_guardrails()
            .iter()
            .any(Guardrail::is_active)
}

fn build_downstream_response(status: StatusCode, headers: HeaderMap, body: Body) -> Response<Body> {
    let mut downstream = Response::new(body);
    *downstream.status_mut() = status;
    *downstream.headers_mut() = headers;
    downstream
}

fn reject_blocked_response(
    rejection: GuardrailRejection,
    findings: &[crate::guardrails::Finding],
    mut capture: ExecutionCapture,
) -> ForwardError {
    let error = crate::resolution::ResolutionError::GuardrailBlocked(rejection.clone());
    capture.record_guardrails(findings);
    capture.record_rejection(crate::http::resolution_rejection(&error));
    capture.finish(RelayOutcome::Eof);
    ForwardError::GuardrailBlocked(rejection)
}

fn reject_busy_response(mut capture: ExecutionCapture, chunks: &[Bytes]) -> ForwardError {
    capture_usage_without_output(&mut capture, chunks);
    capture.record_rejection(crate::http::resolution_rejection(
        &crate::resolution::ResolutionError::Busy,
    ));
    capture.finish(RelayOutcome::Eof);
    ForwardError::Busy
}

struct ResponseGuardrailRun {
    status: StatusCode,
    headers: HeaderMap,
    api_format: ApiFormat,
    permit: RequestPermit,
    context: ResolvedRequestContext,
    reservation: Option<BodyReservation>,
    capture: ExecutionCapture,
    stall_timeout: Duration,
}

enum UnreadableSource {
    Stream(reqwest::Response, Vec<Bytes>, Option<MemoryReservation>),
    Buffered(Vec<Bytes>, MemoryReservation),
}

impl ResponseGuardrailRun {
    fn relay_passthrough(self, response: reqwest::Response) -> Response<Body> {
        let provider = self.api_format.provider().as_str();
        build_downstream_response(
            self.status,
            self.headers,
            transport::relay(
                response,
                provider,
                self.permit.deadline,
                self.stall_timeout,
                (self.permit, self.context, self.reservation),
                self.capture,
            ),
        )
    }

    async fn execute(
        mut self,
        response: reqwest::Response,
        guardrails: &Guardrails,
    ) -> Result<Response<Body>, ForwardError> {
        let Some(format) = ResponseFormat::from_headers(response.headers()) else {
            return self.fail_closed_or_relay(
                UnreadableSource::Stream(response, Vec::new(), None),
                BlockReason::Unreadable,
            );
        };
        let max_bytes = match format {
            ResponseFormat::Json => MAX_JSON_RESPONSE_GUARDRAIL_BYTES,
            ResponseFormat::Sse => MAX_SSE_RESPONSE_GUARDRAIL_BYTES,
        };
        let (raw_bytes, buffer_reservation) = match read_bounded_response(
            response,
            max_bytes,
            guardrails.memory_budget(),
            self.permit.deadline,
            self.stall_timeout,
        )
        .await
        {
            BufferedResponse::Complete(bytes, reservation) => (bytes, reservation),
            BufferedResponse::TooLarge {
                prefix,
                response,
                reservation,
            } => {
                return self.fail_closed_or_relay(
                    UnreadableSource::Stream(response, prefix, reservation),
                    BlockReason::InputTooLarge,
                );
            }
            BufferedResponse::Busy(partial) => {
                return Err(reject_busy_response(self.capture, &partial));
            }
            BufferedResponse::UpstreamError(error, partial) => {
                capture_usage_without_output(&mut self.capture, &partial);
                self.capture
                    .finish(if matches!(error, ProviderError::Timeout) {
                        RelayOutcome::Timeout
                    } else {
                        RelayOutcome::TransportError
                    });
                return Err(error.into());
            }
        };

        let outcome = match tokio::time::timeout_at(
            self.permit.deadline,
            guardrails.check_response(self.api_format, format, &self.context, raw_bytes.clone()),
        )
        .await
        {
            Ok(Ok(outcome)) => outcome,
            Err(_) => {
                capture_usage_without_output(&mut self.capture, &raw_bytes);
                self.capture.finish(RelayOutcome::Timeout);
                return Err(ProviderError::Timeout.into());
            }
            Ok(Err(crate::resolution::ResolutionError::Busy)) => {
                return Err(reject_busy_response(self.capture, &raw_bytes));
            }
            Ok(Err(_)) => {
                return self.fail_closed_or_relay(
                    UnreadableSource::Buffered(raw_bytes, buffer_reservation),
                    BlockReason::Unreadable,
                );
            }
        };

        self.finish_checked(raw_bytes, buffer_reservation, outcome)
    }

    fn finish_checked(
        mut self,
        raw_bytes: Vec<Bytes>,
        buffer_reservation: MemoryReservation,
        outcome: crate::guardrails::Outcome,
    ) -> Result<Response<Body>, ForwardError> {
        if let Some(rejection) = outcome.rejection() {
            capture_usage_without_output(&mut self.capture, &raw_bytes);
            return Err(reject_blocked_response(
                rejection,
                &outcome.into_findings(),
                self.capture,
            ));
        }

        if Instant::now() >= self.permit.deadline {
            capture_usage_without_output(&mut self.capture, &raw_bytes);
            self.capture.record_guardrails(&outcome.into_findings());
            self.capture.finish(RelayOutcome::Timeout);
            return Err(ProviderError::Timeout.into());
        }

        let (findings, rewritten, redaction_reservations) = outcome.into_response_parts();
        let (final_bytes, body_reservation) = match rewritten {
            Some(rewritten) => {
                self.headers.remove(header::CONTENT_LENGTH);
                drop(raw_bytes);
                drop(buffer_reservation);
                (vec![rewritten], None)
            }
            None => (raw_bytes, Some(buffer_reservation)),
        };
        for chunk in &final_bytes {
            self.capture.push_bytes(chunk);
        }
        self.capture.end_body();
        self.capture.record_guardrails(&findings);

        Ok(build_downstream_response(
            self.status,
            self.headers,
            transport::relay_buffered_observed(
                final_bytes,
                self.api_format.provider().as_str(),
                self.permit.deadline,
                self.stall_timeout,
                (
                    self.permit,
                    self.context,
                    self.reservation,
                    body_reservation,
                    redaction_reservations,
                ),
                self.capture,
            ),
        ))
    }

    fn fail_closed_or_relay(
        mut self,
        source: UnreadableSource,
        reason: BlockReason,
    ) -> Result<Response<Body>, ForwardError> {
        let outcome = crate::guardrails::fail_closed_response_outcome(
            self.context.response_guardrails(),
            reason,
        );
        if let Some(rejection) = outcome.rejection() {
            match &source {
                UnreadableSource::Stream(_, prefix, _) => {
                    capture_usage_without_output(&mut self.capture, prefix);
                }
                UnreadableSource::Buffered(raw_bytes, _) => {
                    capture_usage_without_output(&mut self.capture, raw_bytes);
                }
            }
            return Err(reject_blocked_response(
                rejection,
                &outcome.into_findings(),
                self.capture,
            ));
        }
        self.capture.record_guardrails(&outcome.into_findings());
        let provider = self.api_format.provider().as_str();
        let body = match source {
            UnreadableSource::Stream(response, prefix, buffer_reservation) if prefix.is_empty() => {
                transport::relay(
                    response,
                    provider,
                    self.permit.deadline,
                    self.stall_timeout,
                    (
                        self.permit,
                        self.context,
                        self.reservation,
                        buffer_reservation,
                    ),
                    self.capture,
                )
            }
            UnreadableSource::Stream(response, prefix, buffer_reservation) => {
                transport::relay_with_prefix(
                    prefix,
                    response,
                    provider,
                    self.permit.deadline,
                    self.stall_timeout,
                    (
                        self.permit,
                        self.context,
                        self.reservation,
                        buffer_reservation,
                    ),
                    self.capture,
                )
            }
            UnreadableSource::Buffered(raw_bytes, buffer_reservation) => {
                for chunk in &raw_bytes {
                    self.capture.push_bytes(chunk);
                }
                self.capture.end_body();
                transport::relay_buffered_observed(
                    raw_bytes,
                    provider,
                    self.permit.deadline,
                    self.stall_timeout,
                    (
                        self.permit,
                        self.context,
                        self.reservation,
                        buffer_reservation,
                    ),
                    self.capture,
                )
            }
        };
        Ok(build_downstream_response(self.status, self.headers, body))
    }
}

fn capture_usage_without_output(capture: &mut ExecutionCapture, chunks: &[Bytes]) {
    for chunk in chunks {
        capture.push_bytes(chunk);
    }
    capture.end_body();
    capture.suppress_output();
}

enum BufferedResponse {
    Complete(Vec<Bytes>, MemoryReservation),
    TooLarge {
        prefix: Vec<Bytes>,
        response: reqwest::Response,
        reservation: Option<MemoryReservation>,
    },
    Busy(Vec<Bytes>),
    UpstreamError(ProviderError, Vec<Bytes>),
}

/// Largest buffer one buffered response body is copied into; a body grows by
/// whole segments, so it is never copied again or over-allocated by more than one.
const RESPONSE_SEGMENT_BYTES: usize = 64 * 1024;

/// Buffers a provider response body up to `max_bytes`, copying it into segments
/// the gateway owns so hyper can reuse its read buffer, reserving their capacity
/// from the shared memory budget and honoring both the execution deadline and
/// per-chunk stall timeout.
async fn read_bounded_response(
    mut response: reqwest::Response,
    max_bytes: usize,
    budget: &Arc<tokio::sync::Semaphore>,
    deadline: Instant,
    stall_timeout: Duration,
) -> BufferedResponse {
    let declared = response
        .content_length()
        .map(|length| usize::try_from(length).unwrap_or(usize::MAX));
    if declared.is_some_and(|declared| declared > max_bytes) {
        return BufferedResponse::TooLarge {
            prefix: Vec::new(),
            response,
            reservation: None,
        };
    }
    let Ok(mut reservation) = MemoryReservation::from_budget(budget, 0, "guardrails") else {
        return BufferedResponse::Busy(Vec::new());
    };
    let mut segments: Vec<Bytes> = Vec::new();
    let mut segment: Vec<u8> = Vec::new();
    let mut total = 0usize;
    let take = |mut segments: Vec<Bytes>, segment: Vec<u8>| {
        if !segment.is_empty() {
            segments.push(Bytes::from(segment));
        }
        segments
    };
    loop {
        let chunk_deadline = deadline.min(Instant::now() + stall_timeout);
        let next = match tokio::time::timeout_at(chunk_deadline, response.chunk()).await {
            Ok(Ok(next)) => next,
            Ok(Err(error)) => {
                let kind = if error.is_timeout() {
                    ProviderError::Timeout
                } else {
                    ProviderError::Transport
                };
                return BufferedResponse::UpstreamError(kind, take(segments, segment));
            }
            Err(_) => {
                return BufferedResponse::UpstreamError(
                    ProviderError::Timeout,
                    take(segments, segment),
                );
            }
        };
        let Some(chunk) = next else {
            return BufferedResponse::Complete(take(segments, segment), reservation);
        };
        total = total.saturating_add(chunk.len());
        if total > max_bytes {
            let mut prefix = take(segments, segment);
            prefix.push(chunk);
            return BufferedResponse::TooLarge {
                prefix,
                response,
                reservation: Some(reservation),
            };
        }
        let mut rest = &chunk[..];
        while !rest.is_empty() {
            if segment.len() == RESPONSE_SEGMENT_BYTES {
                segments.push(Bytes::from(std::mem::take(&mut segment)));
            }
            let (now, later) =
                rest.split_at(rest.len().min(RESPONSE_SEGMENT_BYTES - segment.len()));
            if segment.len() + now.len() > segment.capacity() {
                let capacity = (segment.capacity() * 2)
                    .clamp(segment.len() + now.len(), RESPONSE_SEGMENT_BYTES)
                    .min(
                        declared
                            .unwrap_or(usize::MAX)
                            .max(segment.len() + now.len()),
                    );
                let held = segments.len() * RESPONSE_SEGMENT_BYTES
                    + capacity
                    + (segments.len() + 1) * size_of::<Bytes>();
                if reservation.try_reserve_body(held, "guardrails").is_err() {
                    let mut partial = take(segments, segment);
                    partial.push(chunk.slice(chunk.len() - rest.len()..));
                    return BufferedResponse::Busy(partial);
                }
                segment.reserve_exact(capacity - segment.len());
            }
            segment.extend_from_slice(now);
            rest = later;
        }
    }
}

/// Provider error statuses are relayed unchanged, so the handler's rejection log
/// and error classification never see them.
fn record_provider_status(observation: &RequestObservation, status: StatusCode) {
    if !(status.is_client_error() || status.is_server_error()) {
        return;
    }
    let reason = provider_status_reason(status.as_u16());
    observation.record_error(ErrorOrigin::Provider, reason);
    if status.is_server_error() {
        tracing::warn!(
            reason,
            status = status.as_u16(),
            "provider returned an error status"
        );
    } else {
        tracing::info!(
            reason,
            status = status.as_u16(),
            "provider returned an error status"
        );
    }
}

/// The body sent upstream: the caller's body with the provider model,
/// guardrail redactions, and (for a streamed Chat Completions call) usage opt-in.
fn upstream_body(
    route: Route,
    body: Bytes,
    model_range: Range<usize>,
    streaming: bool,
    stream_options: &StreamOptions,
    provider_model: &str,
    redactions: Vec<crate::guardrails::redact::BodyEdit>,
) -> Result<Bytes, ProviderError> {
    let usage = (matches!(route, Route::OpenAiChatCompletions) && streaming)
        .then(|| chat_completions::stream_usage_edit(&body, stream_options))
        .flatten();
    rewrite_body(body, model_range, provider_model, usage, redactions)
}

/// Replaces the model bytes, applies `extra` and any guardrail `redactions` in
/// one preallocated pass; every other byte is copied unchanged.
#[expect(
    clippy::needless_pass_by_value,
    reason = "ownership releases the caller body when rewriting returns, before the upstream wait"
)]
fn rewrite_body(
    body: Bytes,
    model_range: Range<usize>,
    provider_model: &str,
    extra: Option<(Range<usize>, Vec<u8>)>,
    redactions: Vec<crate::guardrails::redact::BodyEdit>,
) -> Result<Bytes, ProviderError> {
    let model = serde_json::to_vec(provider_model).map_err(|_| ProviderError::Configuration)?;
    let mut edits: Vec<(Range<usize>, &[u8])> =
        Vec::with_capacity(1 + usize::from(extra.is_some()) + redactions.len());
    edits.push((model_range, model.as_slice()));
    if let Some((range, replacement)) = &extra {
        edits.push((range.clone(), replacement.as_slice()));
    }
    edits.extend(
        redactions
            .iter()
            .map(|edit| (edit.range.clone(), edit.replacement.as_slice())),
    );
    crate::guardrails::redact::splice_bytes(&body, &mut edits)
        .map(Bytes::from)
        .ok_or(ProviderError::Configuration)
}

#[cfg(test)]
pub(crate) fn model_range(body: &[u8]) -> Result<Range<usize>, ProviderError> {
    #[derive(serde::Deserialize)]
    struct ModelMember<'a> {
        #[serde(borrow)]
        model: &'a serde_json::value::RawValue,
    }

    let request = serde_json::from_slice::<ModelMember<'_>>(body)
        .map_err(|_| ProviderError::Configuration)?;
    let model = request.model.get();
    let start = model
        .as_ptr()
        .addr()
        .checked_sub(body.as_ptr().addr())
        .ok_or(ProviderError::Configuration)?;
    let end = start
        .checked_add(model.len())
        .filter(|end| *end <= body.len())
        .ok_or(ProviderError::Configuration)?;
    Ok(start..end)
}

const PROVIDER_TCP_KEEPALIVE_IDLE: Duration = Duration::from_secs(30);
const PROVIDER_TCP_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(15);
// Linux rejects `TCP_KEEPCNT` outside `1..=MAX_TCP_KEEPCNT` (127).
const MAX_TCP_KEEPALIVE_RETRIES: u32 = 127;

fn provider_client_builder(max_execution_time: Duration) -> reqwest::ClientBuilder {
    let builder = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .no_proxy()
        .no_gzip()
        .no_brotli()
        .no_deflate()
        .no_zstd()
        // No client read timeout: it would also cut a non-streaming call while the
        // provider generates before sending headers. The relay bounds stalls instead.
        // Match TCP keepalive and `TCP_USER_TIMEOUT` to `max_execution_time` (the
        // longest wait the relay allows for non-streaming headers) so reqwest's 30 s
        // default does not abort a silent upstream connection early.
        .connect_timeout(Duration::from_secs(5))
        .tcp_keepalive(PROVIDER_TCP_KEEPALIVE_IDLE)
        .tcp_keepalive_interval(PROVIDER_TCP_KEEPALIVE_INTERVAL)
        .tcp_keepalive_retries(tcp_keepalive_retries(max_execution_time))
        .pool_max_idle_per_host(16)
        // reqwest's http2 feature is for Web-bound clients (resolver, telemetry); provider calls stay on HTTP/1.1.
        .http1_only();
    #[cfg(any(target_os = "android", target_os = "fuchsia", target_os = "linux"))]
    let builder = builder.tcp_user_timeout(max_execution_time);
    builder
}

fn tcp_keepalive_retries(timeout: Duration) -> u32 {
    let probe_window = timeout
        .saturating_sub(PROVIDER_TCP_KEEPALIVE_IDLE)
        .as_secs();
    let retries = probe_window.div_ceil(PROVIDER_TCP_KEEPALIVE_INTERVAL.as_secs());
    u32::try_from(retries)
        .unwrap_or(MAX_TCP_KEEPALIVE_RETRIES)
        .clamp(1, MAX_TCP_KEEPALIVE_RETRIES)
}

/// The connection's extra headers plus its credential. Resolution already rejected
/// malformed and reserved extra headers, so none can replace the credential.
fn connection_headers(context: &ResolvedRequestContext) -> Result<HeaderMap, ProviderError> {
    let (credential_name, mut credential) = provider_credential(context)?;
    credential.set_sensitive(true);
    let mut headers = HeaderMap::new();
    for (name, value) in context.connection().extra_headers() {
        let name =
            HeaderName::from_bytes(name.as_bytes()).map_err(|_| ProviderError::Configuration)?;
        let mut value = HeaderValue::from_str(value).map_err(|_| ProviderError::Configuration)?;
        value.set_sensitive(true);
        headers.insert(name, value);
    }
    headers.insert(credential_name, credential);
    Ok(headers)
}

fn provider_credential(
    context: &ResolvedRequestContext,
) -> Result<(HeaderName, HeaderValue), ProviderError> {
    let (name, value) = match context.connection().credential() {
        ProviderCredential::Bearer(token) => (header::AUTHORIZATION, format!("Bearer {token}")),
        ProviderCredential::XApiKey(key) => (HeaderName::from_static("x-api-key"), key.to_owned()),
    };
    let value = HeaderValue::from_str(&value).map_err(|_| ProviderError::Configuration)?;
    Ok((name, value))
}

#[cfg(test)]
mod tests;
