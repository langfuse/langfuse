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
    capture::{ExecutionCapture, RelayOutcome},
    config::ExecutionLimits,
    correlation::{RequestCorrelation, UpstreamTarget},
    observability::{ErrorOrigin, RequestObservation, Wait, provider_status_reason},
    resolution::{
        ApiFormat, IngestionMode, ProviderConnection, ProviderCredential, ResolvedRequestContext,
    },
    transport,
};
pub use outbound::OutboundPolicy;

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
    pub(crate) redaction_reservations: Vec<crate::inference::MemoryReservation>,
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
    /// The parsed members a generation records; `None` when the route records none.
    pub input: Option<crate::capture::RequestInput>,
}

pub(crate) type BodyReservation = Box<dyn Send + Sync>;

pub struct ProviderTransport {
    client: ClientWithMiddleware,
    custom_base_url_client: ClientWithMiddleware,
    limits: ProviderLimits,
    telemetry: Option<crate::telemetry::Telemetry>,
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
            origin_override: None,
            policy,
        })
    }

    pub(crate) fn with_telemetry(mut self, telemetry: crate::telemetry::Telemetry) -> Self {
        self.telemetry = Some(telemetry);
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
        let input = Some(crate::capture::RequestInput::from_body(&body));
        let stream_options = StreamOptions::from_body(&body);
        self.forward_route(
            permit,
            context,
            headers,
            RequestBody {
                bytes: body,
                stream_options,
                model_range,
                streaming: true,
                reservation: None,
                parse_growth: None,
                input,
            },
            Route::OpenAiResponses,
            &mut RequestCorrelation::from_headers(headers),
        )
        .await
    }

    fn start_capture(
        &self,
        route: Route,
        context: &ResolvedRequestContext,
        headers: &HeaderMap,
        input: Option<crate::capture::RequestInput>,
        correlation: &mut RequestCorrelation,
    ) -> ExecutionCapture {
        let Some(input) = input.filter(|_| route.captures_generation()) else {
            return ExecutionCapture::unobserved();
        };
        let mut capture =
            ExecutionCapture::for_request(route.api_format(), context, headers, input);
        if let Some(telemetry) = &self.telemetry
            && context.ingestion_mode() != IngestionMode::None
        {
            capture.deliver_to(telemetry.clone(), context, headers, correlation);
        }
        capture
    }

    pub(crate) async fn forward_route(
        &self,
        mut permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        request: RequestBody,
        route: Route,
        correlation: &mut RequestCorrelation,
    ) -> Result<Response<Body>, ProviderError> {
        let RequestBody {
            bytes: body,
            model_range,
            stream_options,
            streaming,
            reservation,
            parse_growth,
            input,
        } = request;
        let api_format = route.api_format();
        let provider_model = context.connection().provider_model();
        // A rejected destination returns before any generation is recorded.
        let upstream = self.post(route, context.connection())?;
        let provider_headers = connection_headers(&context)?;
        let redactions = std::mem::take(&mut permit.redactions);
        let input = redact_captured_input(input, &body, &redactions)?;
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
        let mut capture = self.start_capture(route, &context, headers, input, correlation);
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
        let observation = correlation.observation();
        observation.record_wait(Wait::ProviderHeaders, started.elapsed());
        let response = match response {
            Ok(response) => response,
            Err(error) => {
                capture.finish(if matches!(error, ProviderError::Timeout) {
                    RelayOutcome::Timeout
                } else {
                    RelayOutcome::TransportError
                });
                return Err(error);
            }
        };
        if let Some(request_id) = transport::provider_request_id(response.headers(), api_format) {
            tracing::Span::current().record("provider_request_id", request_id);
        }
        let status = response.status();
        capture.record_response(status.as_u16(), response.headers());
        record_provider_status(observation, status);
        let mut downstream = Response::new(Body::empty());
        *downstream.status_mut() = status;
        *downstream.headers_mut() = transport::response_headers(response.headers(), api_format);
        *downstream.body_mut() = transport::relay(
            response,
            api_format.provider().as_str(),
            permit.deadline,
            self.limits.execution.stall_timeout,
            (permit, context, reservation),
            capture,
        );
        Ok(downstream)
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

/// Splices `redactions` into a copy of the caller body (without upstream-only
/// model or `stream_options` rewrites) and re-parses it for trace capture.
/// Fails closed instead of falling back to the unredacted input so FULL
/// ingestion cannot persist secrets that a `redact` guardrail scrubbed.
fn redact_captured_input(
    input: Option<crate::capture::RequestInput>,
    body: &[u8],
    redactions: &[crate::guardrails::redact::BodyEdit],
) -> Result<Option<crate::capture::RequestInput>, ProviderError> {
    if redactions.is_empty() || input.is_none() {
        return Ok(input);
    }
    let mut edits: Vec<(Range<usize>, &[u8])> = redactions
        .iter()
        .map(|edit| (edit.range.clone(), edit.replacement.as_slice()))
        .collect();
    let redacted = splice_body_edits(body, &mut edits)?;
    crate::capture::RequestInput::from_redacted_body(&redacted)
        .map(Some)
        .ok_or(ProviderError::Configuration)
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
    splice_body_edits(&body, &mut edits).map(Bytes::from)
}

fn splice_body_edits(
    body: &[u8],
    edits: &mut [(Range<usize>, &[u8])],
) -> Result<Vec<u8>, ProviderError> {
    edits.sort_by_key(|(range, _)| range.start);
    let removed = edits.iter().map(|(range, _)| range.len()).sum::<usize>();
    let added = edits.iter().map(|(_, bytes)| bytes.len()).sum::<usize>();
    let capacity = body.len().saturating_sub(removed).saturating_add(added);
    let mut rewritten = Vec::with_capacity(capacity);
    let mut copied = 0;
    for (range, replacement) in &*edits {
        if range.start > range.end || range.end > body.len() {
            return Err(ProviderError::Configuration);
        }
        let prefix = body
            .get(copied..range.start)
            .ok_or(ProviderError::Configuration)?;
        rewritten.extend_from_slice(prefix);
        rewritten.extend_from_slice(replacement);
        copied = range.end;
    }
    let suffix = body.get(copied..).ok_or(ProviderError::Configuration)?;
    rewritten.extend_from_slice(suffix);
    Ok(rewritten)
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
