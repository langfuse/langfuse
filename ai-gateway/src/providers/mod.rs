mod chat_completions;
pub(crate) mod model_list;

use std::{ops::Range, sync::Arc, time::Duration};

use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, HeaderName, HeaderValue, Response, StatusCode, header},
};
use reqwest::Client;
use reqwest_middleware::ClientWithMiddleware;
use reqwest_tracing::DisableOtelPropagation;
use tokio::{
    sync::{OwnedSemaphorePermit, Semaphore},
    time::Instant,
};

pub use crate::transport::ProviderError;
use crate::{
    capture::{ExecutionCapture, RelayOutcome},
    config::ExecutionLimits,
    correlation::{RequestCorrelation, UpstreamTarget},
    observability::{ErrorOrigin, RequestObservation, Wait, provider_status_reason},
    resolution::{ApiFormat, Provider, ProviderCredential, ResolvedRequestContext},
    transport,
};

#[derive(Clone, Copy)]
pub(crate) enum Route {
    OpenAiResponses,
    OpenAiResponsesCompact,
    OpenAiChatCompletions,
    AnthropicMessages,
    AnthropicCountTokens,
}

impl Route {
    pub(crate) fn provider(self) -> Provider {
        match self {
            Self::OpenAiResponses | Self::OpenAiResponsesCompact | Self::OpenAiChatCompletions => {
                Provider::OpenAi
            }
            Self::AnthropicMessages | Self::AnthropicCountTokens => Provider::Anthropic,
        }
    }

    pub(crate) fn api_format(self) -> ApiFormat {
        match self {
            Self::OpenAiChatCompletions => ApiFormat::OpenAiChatCompletions,
            _ => match self.provider() {
                Provider::OpenAi => ApiFormat::OpenAiResponses,
                Provider::Anthropic => ApiFormat::AnthropicMessages,
            },
        }
    }

    fn path(self) -> &'static str {
        match self {
            Self::OpenAiResponses => "/responses",
            Self::OpenAiResponsesCompact => "/responses/compact",
            Self::OpenAiChatCompletions => "/chat/completions",
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
                | Self::AnthropicMessages
        )
    }
}

pub(crate) struct ProviderLimits {
    pub active: usize,
    pub execution: ExecutionLimits,
}

impl Default for ProviderLimits {
    fn default() -> Self {
        Self {
            active: 128,
            execution: ExecutionLimits::default(),
        }
    }
}

pub struct RequestPermit {
    _permit: OwnedSemaphorePermit,
    _active: crate::observability::Active,
    deadline: Instant,
}

/// The validated caller body and the facts the relay needs about it.
pub(crate) struct RequestBody {
    pub bytes: Bytes,
    pub model_range: Range<usize>,
    /// The caller asked for a streamed response (`"stream": true`).
    pub streaming: bool,
    /// Capacity held for the body, released with the execution once the response ends.
    pub reservation: Option<BodyReservation>,
}

pub(crate) type BodyReservation = Box<dyn Send + Sync>;

pub struct ProviderTransport {
    client: ClientWithMiddleware,
    capacity: Arc<Semaphore>,
    limits: ProviderLimits,
    telemetry: Option<crate::telemetry::Telemetry>,
    origin_override: Option<String>,
}

impl ProviderTransport {
    /// # Errors
    /// Returns [`ProviderError::Configuration`] when the HTTPS client cannot be initialized.
    pub fn new(
        max_active_requests: usize,
        execution: ExecutionLimits,
    ) -> Result<Self, ProviderError> {
        Self::with_limits(ProviderLimits {
            active: max_active_requests,
            execution,
        })
    }

    fn with_limits(limits: ProviderLimits) -> Result<Self, ProviderError> {
        if !(1..=Semaphore::MAX_PERMITS).contains(&limits.active) {
            return Err(ProviderError::Configuration);
        }
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            // No client read timeout: it would also cut a non-streaming call while the
            // provider generates before sending headers. The relay bounds stalls instead.
            .connect_timeout(Duration::from_secs(5))
            .pool_max_idle_per_host(16)
            .build()
            .map_err(|_| ProviderError::Configuration)?;
        crate::observability::record_capacity("execution", limits.active);
        Ok(Self {
            client: crate::observability::instrument_client(client, "provider.headers"),
            capacity: Arc::new(Semaphore::new(limits.active)),
            limits,
            telemetry: None,
            origin_override: None,
        })
    }

    pub(crate) fn with_telemetry(mut self, telemetry: crate::telemetry::Telemetry) -> Self {
        self.telemetry = Some(telemetry);
        self
    }

    /// # Errors
    /// Returns [`ProviderError::Busy`] immediately when all execution slots are occupied.
    pub fn try_admit(&self) -> Result<RequestPermit, ProviderError> {
        let permit = self.capacity.clone().try_acquire_owned().map_err(|_| {
            crate::observability::rejected("execution");
            ProviderError::Busy
        })?;
        Ok(RequestPermit {
            _permit: permit,
            _active: crate::observability::Active::new("execution"),
            deadline: Instant::now() + self.limits.execution.max_execution_time,
        })
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
        self.forward_route(
            permit,
            context,
            headers,
            RequestBody {
                bytes: body,
                model_range,
                streaming: true,
                reservation: None,
            },
            Route::OpenAiResponses,
            &mut RequestCorrelation::from_headers(headers),
        )
        .await
    }

    pub(crate) async fn forward_route(
        &self,
        permit: RequestPermit,
        context: ResolvedRequestContext,
        headers: &HeaderMap,
        request: RequestBody,
        route: Route,
        correlation: &mut RequestCorrelation,
    ) -> Result<Response<Body>, ProviderError> {
        let RequestBody {
            bytes: body,
            model_range,
            streaming,
            reservation,
        } = request;
        let api_format = route.api_format();
        let (credential_name, mut credential) = provider_credential(&context)?;
        credential.set_sensitive(true);
        let provider_model = context.connection().provider_model();
        let mut capture = if route.captures_generation() {
            let mut capture = ExecutionCapture::for_request(api_format, &context, headers, &body);
            if let Some(telemetry) = &self.telemetry {
                capture.deliver_to(telemetry.clone(), &context, headers, correlation);
            }
            capture
        } else {
            ExecutionCapture::unobserved()
        };
        // Capture the caller's body shape, but keep upstream-only changes out of the input.
        let body = match route {
            Route::OpenAiChatCompletions => {
                match chat_completions::request_stream_usage(&body, provider_model) {
                    Some(rewritten) => {
                        drop(body);
                        rewritten
                    }
                    None => rewrite_model(body, model_range, provider_model)?,
                }
            }
            _ => rewrite_model(body, model_range, provider_model)?,
        };
        capture.set_provider_model(provider_model);
        correlation.record_upstream(UpstreamTarget::for_connection(
            context.connection(),
            Some(provider_model.to_owned()),
        ));
        let mut upstream = self
            .client
            .post(self.request_url(route))
            .with_extension(DisableOtelPropagation)
            .headers(transport::request_headers(headers, api_format))
            .header(header::ACCEPT_ENCODING, "identity")
            .header(credential_name, credential);
        upstream = upstream.body(body);
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

    fn request_url(&self, route: Route) -> String {
        let base = self
            .origin_override
            .as_deref()
            .unwrap_or_else(|| route.provider().official_origin())
            .trim_end_matches('/');
        let mut url = String::with_capacity(base.len() + route.path().len());
        url.push_str(base);
        url.push_str(route.path());
        url
    }

    #[cfg(test)]
    pub(crate) fn for_test(base_url: String, limits: ProviderLimits) -> Self {
        let mut provider = Self::with_limits(limits).unwrap();
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

#[expect(
    clippy::needless_pass_by_value,
    reason = "ownership releases the caller body when rewriting returns, before the upstream wait"
)]
fn rewrite_model(
    body: Bytes,
    model_range: Range<usize>,
    provider_model: &str,
) -> Result<Bytes, ProviderError> {
    if model_range.start > model_range.end || model_range.end > body.len() {
        return Err(ProviderError::Configuration);
    }
    let model = serde_json::to_vec(provider_model).map_err(|_| ProviderError::Configuration)?;
    let capacity = body.len() - model_range.len() + model.len();
    let mut rewritten = Vec::with_capacity(capacity);
    rewritten.extend_from_slice(&body[..model_range.start]);
    rewritten.extend_from_slice(&model);
    rewritten.extend_from_slice(&body[model_range.end..]);
    Ok(Bytes::from(rewritten))
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
