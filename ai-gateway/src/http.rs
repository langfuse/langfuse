use std::{ops::Range, sync::Arc, time::Instant};

use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{Request, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use http_body_util::BodyExt;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use tower_http::timeout::{RequestBodyDeadlineLayer, TimeoutError};
use tracing::Instrument;

use crate::{
    correlation::{RequestCorrelation, assign_request_id},
    inference::{
        InferenceService, RequestBodyPermit, RequestPreparationError, provider_origin,
        resolution_origin,
    },
    observability::{ErrorOrigin, Wait},
    providers::{ProviderError, RequestBody, Route},
    resolution::{ApiFormat, ResolutionError},
    server::GatewayLifecycleState,
};

const MAX_GATEWAY_KEY_BYTES: usize = 8192;

#[derive(Clone)]
struct InferenceRouteState {
    inference: Option<Arc<InferenceService>>,
    lifecycle: GatewayLifecycleState,
}

/// Build inference routes. An unconfigured or draining service returns 503.
pub fn router(inference: Option<InferenceService>, lifecycle: GatewayLifecycleState) -> Router {
    let body_deadline = inference
        .as_ref()
        .map(InferenceService::request_read_timeout);
    let router = Router::new()
        .route("/openai/v1/responses", post(handle_responses))
        .route(
            "/openai/v1/responses/compact",
            post(handle_responses_compact),
        )
        .route("/openai/v1/chat/completions", post(handle_chat_completions))
        .route("/openai/v1/models", get(handle_openai_models))
        .route("/anthropic/v1/messages", post(handle_messages))
        .route(
            "/anthropic/v1/messages/count_tokens",
            post(handle_count_tokens),
        )
        .route("/anthropic/v1/models", get(handle_anthropic_models))
        .with_state(InferenceRouteState {
            inference: inference.map(Arc::new),
            lifecycle,
        });
    let router = match body_deadline {
        Some(deadline) => router.layer(RequestBodyDeadlineLayer::new(deadline)),
        None => router,
    };
    router.layer(axum::middleware::from_fn(assign_request_id))
}

async fn handle_responses(State(state): State<InferenceRouteState>, request: Request) -> Response {
    handle_inference(state, request, Route::OpenAiResponses).await
}

async fn handle_responses_compact(
    State(state): State<InferenceRouteState>,
    request: Request,
) -> Response {
    handle_inference(state, request, Route::OpenAiResponsesCompact).await
}

async fn handle_chat_completions(
    State(state): State<InferenceRouteState>,
    request: Request,
) -> Response {
    handle_inference(state, request, Route::OpenAiChatCompletions).await
}

async fn handle_openai_models(
    State(state): State<InferenceRouteState>,
    request: Request,
) -> Response {
    handle_models(state, request, ApiFormat::OpenAiResponses).await
}

async fn handle_messages(State(state): State<InferenceRouteState>, request: Request) -> Response {
    handle_inference(state, request, Route::AnthropicMessages).await
}

async fn handle_count_tokens(
    State(state): State<InferenceRouteState>,
    request: Request,
) -> Response {
    handle_inference(state, request, Route::AnthropicCountTokens).await
}

async fn handle_anthropic_models(
    State(state): State<InferenceRouteState>,
    request: Request,
) -> Response {
    handle_models(state, request, ApiFormat::AnthropicMessages).await
}

async fn handle_inference(
    state: InferenceRouteState,
    mut request: Request,
    route: Route,
) -> Response {
    let mut correlation = request
        .extensions_mut()
        .remove::<RequestCorrelation>()
        .unwrap_or_default();
    correlation
        .observation()
        .record_provider(route.api_format().provider().as_str());
    let result = match prepare_request(&state, request.headers(), route.api_format()) {
        Ok((inference, gateway_key)) => {
            relay(&inference, &gateway_key, request, route, &mut correlation).await
        }
        Err(error) => Err(error),
    };
    finish_response(result, route.api_format(), &correlation)
}

async fn handle_models(
    state: InferenceRouteState,
    mut request: Request,
    api_format: ApiFormat,
) -> Response {
    let correlation = request
        .extensions_mut()
        .remove::<RequestCorrelation>()
        .unwrap_or_default();
    correlation
        .observation()
        .record_provider(api_format.provider().as_str());
    let result = match prepare_request(&state, request.headers(), api_format) {
        Ok((inference, gateway_key)) => {
            models(&inference, &gateway_key, api_format, &correlation).await
        }
        Err(error) => Err(error),
    };
    finish_response(result, api_format, &correlation)
}

fn prepare_request(
    state: &InferenceRouteState,
    headers: &HeaderMap,
    api_format: ApiFormat,
) -> Result<(Arc<InferenceService>, String), InferenceHttpError> {
    let inference = state
        .inference
        .as_ref()
        .filter(|_| state.lifecycle.is_ready())
        .cloned()
        .ok_or(InferenceHttpError::Unavailable)?;
    let gateway_key = gateway_key(headers, api_format)?.to_owned();
    Ok((inference, gateway_key))
}

fn finish_response(
    result: Result<Response, InferenceHttpError>,
    api_format: ApiFormat,
    correlation: &RequestCorrelation,
) -> Response {
    let mut response = match result {
        Ok(response) => response,
        Err(error) => {
            let (origin, reason) = error.origin();
            correlation.observation().record_error(origin, reason);
            error.into_native_response(api_format, correlation)
        }
    };
    correlation.apply_generation_headers(response.headers_mut());
    correlation.apply_resolution_headers(response.headers_mut());
    response
}

async fn models(
    inference: &InferenceService,
    gateway_key: &str,
    api_format: ApiFormat,
    correlation: &RequestCorrelation,
) -> Result<Response, InferenceHttpError> {
    let body = inference
        .fetch_model_catalog(gateway_key, api_format, correlation)
        .await
        .map_err(InferenceHttpError::Resolution)?;
    Ok(([(header::CONTENT_TYPE, "application/json")], body).into_response())
}

async fn relay(
    inference: &InferenceService,
    gateway_key: &str,
    request: Request,
    route: Route,
    correlation: &mut RequestCorrelation,
) -> Result<Response, InferenceHttpError> {
    // Model extraction and upstream rewriting require an uncompressed JSON body.
    if !crate::transport::identity_encoding(request.headers()) {
        return Err(InferenceHttpError::UnsupportedEncoding);
    }
    // Held with the execution and released once the response ends.
    let body_permit = inference
        .try_reserve_request_body()
        .map_err(InferenceHttpError::from)?;
    let (parts, body) = request.into_parts();
    let started = Instant::now();
    let read = read_request_body(
        body,
        &parts.headers,
        inference.max_request_bytes(),
        body_permit,
    )
    .await;
    correlation
        .observation()
        .record_wait(Wait::RequestBody, started.elapsed());
    let (bytes, body_permit) = read?;
    correlation.observation().record_request_bytes(bytes.len());
    let request_body = request_body_and_model(bytes)?;
    let (permit, context) = inference
        .resolve_and_admit(
            gateway_key,
            route.api_format(),
            &request_body.model,
            correlation,
        )
        .await
        .map_err(InferenceHttpError::from)?;
    inference
        .forward(
            permit,
            context,
            &parts.headers,
            RequestBody {
                bytes: request_body.bytes,
                model_range: request_body.model_range,
                streaming: request_body.streaming,
                reservation: Some(Box::new(body_permit)),
            },
            route,
            correlation,
        )
        .await
        .map_err(InferenceHttpError::Provider)
}

struct InferenceRequestBody {
    bytes: Bytes,
    model: String,
    model_range: Range<usize>,
    streaming: bool,
}

#[derive(Deserialize)]
struct InferenceRequest<'a> {
    #[serde(borrow)]
    model: &'a RawValue,
    /// Kept raw so a non-boolean value is left for the provider to reject.
    #[serde(borrow, default)]
    stream: Option<&'a RawValue>,
}

fn request_body_and_model(bytes: Bytes) -> Result<InferenceRequestBody, InferenceHttpError> {
    let request = serde_json::from_slice::<InferenceRequest<'_>>(&bytes)
        .map_err(|_| InferenceHttpError::InvalidBody)?;
    let raw_model = request.model.get();
    let model =
        serde_json::from_str::<String>(raw_model).map_err(|_| InferenceHttpError::InvalidBody)?;
    if model.is_empty() {
        return Err(InferenceHttpError::InvalidBody);
    }
    let start = raw_model
        .as_ptr()
        .addr()
        .checked_sub(bytes.as_ptr().addr())
        .ok_or(InferenceHttpError::InvalidBody)?;
    let end = start
        .checked_add(raw_model.len())
        .filter(|end| *end <= bytes.len())
        .ok_or(InferenceHttpError::InvalidBody)?;
    let streaming = request.stream.is_some_and(|stream| stream.get() == "true");
    Ok(InferenceRequestBody {
        bytes,
        model,
        model_range: start..end,
        streaming,
    })
}

/// Buffer the client body, reserving its allocation from the shared budget as bytes
/// arrive. A declared length is checked before reading and caps buffer growth, but is
/// not reserved up front, so a client that declares a large body and stalls holds only
/// what it actually sent. The router's body deadline bounds the read. The wait is mostly
/// the caller's upload, so it gets its own span and the measured size lands on the server
/// span for aggregation.
async fn read_request_body(
    body: Body,
    headers: &HeaderMap,
    max_bytes: usize,
    mut permit: RequestBodyPermit,
) -> Result<(Bytes, RequestBodyPermit), InferenceHttpError> {
    let server = tracing::Span::current();
    let span = tracing::info_span!(
        "request.body",
        otel.kind = "internal",
        http.request.body.size = tracing::field::Empty
    );
    let declared = headers
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok()?.parse::<u64>().ok())
        .map(|length| usize::try_from(length).unwrap_or(usize::MAX));
    let bytes = async {
        if declared.is_some_and(|declared| declared > max_bytes) {
            return Err(InferenceHttpError::TooLarge);
        }
        let capacity_limit = declared.unwrap_or(max_bytes);
        let mut body = body;
        let mut buffer = Vec::new();
        while let Some(frame) = body.frame().await {
            let Ok(data) = frame.map_err(body_error)?.into_data() else {
                continue;
            };
            let total = buffer.len() + data.len();
            if total > max_bytes {
                return Err(InferenceHttpError::TooLarge);
            }
            if total > buffer.capacity() {
                let capacity = buffer
                    .capacity()
                    .saturating_mul(2)
                    .clamp(total, capacity_limit.max(total));
                permit
                    .try_reserve_bytes(capacity)
                    .map_err(InferenceHttpError::Resolution)?;
                buffer.reserve_exact(capacity - buffer.len());
            }
            buffer.extend_from_slice(&data);
        }
        let bytes = Bytes::from(buffer);
        tracing::Span::current().record("http.request.body.size", byte_count(bytes.len()));
        Ok::<_, InferenceHttpError>(bytes)
    }
    .instrument(span)
    .await?;
    server.record("http.request.body.size", byte_count(bytes.len()));
    Ok((bytes, permit))
}

/// The router's body deadline surfaces as a body error.
fn body_error(error: axum::Error) -> InferenceHttpError {
    if error.into_inner().is::<TimeoutError>() {
        InferenceHttpError::RequestTimeout
    } else {
        InferenceHttpError::InvalidBody
    }
}

fn byte_count(len: usize) -> i64 {
    i64::try_from(len).unwrap_or(i64::MAX)
}

fn gateway_key(headers: &HeaderMap, api_format: ApiFormat) -> Result<&str, InferenceHttpError> {
    let bearer = single_header(headers, header::AUTHORIZATION.as_str())?
        .map(|value| {
            value
                .split_once(' ')
                .filter(|(scheme, _)| scheme.eq_ignore_ascii_case("Bearer"))
                .map(|(_, token)| token)
                .ok_or(InferenceHttpError::Credential)
        })
        .transpose()?;
    let api_key = match api_format {
        ApiFormat::OpenAiResponses | ApiFormat::OpenAiChatCompletions => None,
        ApiFormat::AnthropicMessages => single_header(headers, "x-api-key")?,
    };
    let key = match (api_key, bearer) {
        (Some(api_key), Some(bearer)) if api_key != bearer => {
            return Err(InferenceHttpError::AmbiguousCredential);
        }
        (Some(key), _) | (None, Some(key)) => key,
        (None, None) => return Err(InferenceHttpError::Credential),
    };
    if key.is_empty()
        || key.len() > MAX_GATEWAY_KEY_BYTES
        || !key
            .bytes()
            .all(|byte| byte.is_ascii_graphic() && byte != b',')
    {
        return Err(InferenceHttpError::Credential);
    }
    Ok(key)
}

fn single_header<'a>(
    headers: &'a HeaderMap,
    name: &str,
) -> Result<Option<&'a str>, InferenceHttpError> {
    let mut values = headers.get_all(name).iter();
    let Some(value) = values.next() else {
        return Ok(None);
    };
    if values.next().is_some() {
        return Err(InferenceHttpError::Credential);
    }
    value
        .to_str()
        .map(Some)
        .map_err(|_| InferenceHttpError::Credential)
}

enum InferenceHttpError {
    Unavailable,
    Credential,
    AmbiguousCredential,
    TooLarge,
    RequestTimeout,
    UnsupportedEncoding,
    InvalidBody,
    Resolution(ResolutionError),
    Provider(ProviderError),
}

impl From<RequestPreparationError> for InferenceHttpError {
    fn from(error: RequestPreparationError) -> Self {
        match error {
            RequestPreparationError::Resolution(error) => Self::Resolution(error),
            RequestPreparationError::Provider(error) => Self::Provider(error),
        }
    }
}

#[derive(Serialize)]
struct OpenAiErrorResponse<'a> {
    error: OpenAiErrorDetail,
    request_id: &'a str,
}
#[derive(Serialize)]
struct OpenAiErrorDetail {
    message: &'static str,
    #[serde(rename = "type")]
    kind: &'static str,
    param: Option<&'static str>,
    code: &'static str,
}

#[derive(Serialize)]
struct AnthropicErrorResponse<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    error: AnthropicErrorDetail,
    request_id: &'a str,
}
#[derive(Serialize)]
struct AnthropicErrorDetail {
    #[serde(rename = "type")]
    kind: &'static str,
    message: &'static str,
}

impl InferenceHttpError {
    fn category(&self) -> (&'static str, &'static str) {
        use ResolutionError as R;
        match self {
            Self::Unavailable => ("admission", "unavailable"),
            Self::Credential => ("authentication", "invalid_credential"),
            Self::AmbiguousCredential => ("authentication", "ambiguous_credential"),
            Self::TooLarge => ("request", "body_too_large"),
            Self::RequestTimeout => ("request", "body_timeout"),
            Self::UnsupportedEncoding => ("request", "unsupported_content_encoding"),
            Self::InvalidBody => ("request", "invalid_body"),
            Self::Resolution(error) => (
                "resolution",
                match error {
                    R::InvalidCredential | R::Authentication => "authentication",
                    R::InvalidRequest => "invalid_request",
                    R::Forbidden => "forbidden",
                    R::ModelNotAllowed => "model_not_allowed",
                    R::NoRoute => "no_route",
                    R::Busy => "capacity",
                    R::Timeout => "timeout",
                    R::Unavailable => "unavailable",
                    R::Configuration => "configuration",
                    R::Transport => "transport",
                    R::InvalidResponse => "invalid_response",
                    R::ResponseTooLarge => "response_too_large",
                },
            ),
            Self::Provider(error) => (
                "provider",
                match error {
                    ProviderError::Busy => "capacity",
                    ProviderError::Timeout => "timeout",
                    ProviderError::Transport => "transport",
                    ProviderError::Configuration => "configuration",
                },
            ),
        }
    }

    fn classify(&self) -> (StatusCode, &'static str, &'static str, &'static str) {
        use ResolutionError as R;
        match self {
            Self::Credential | Self::Resolution(R::InvalidCredential | R::Authentication) => (
                StatusCode::UNAUTHORIZED,
                "Invalid gateway credential",
                "authentication_error",
                "invalid_api_key",
            ),
            Self::AmbiguousCredential => (
                StatusCode::UNAUTHORIZED,
                "Conflicting gateway credentials in the Authorization and x-api-key headers",
                "authentication_error",
                "ambiguous_api_key",
            ),
            Self::Resolution(R::Forbidden) => (
                StatusCode::FORBIDDEN,
                "Gateway access forbidden",
                "permission_error",
                "permission_denied",
            ),
            Self::Resolution(R::ModelNotAllowed) => (
                StatusCode::FORBIDDEN,
                "Model is not allowed for this provider connection",
                "permission_error",
                "model_not_allowed",
            ),
            Self::Resolution(R::NoRoute) => (
                StatusCode::NOT_FOUND,
                "No eligible provider connection",
                "invalid_request_error",
                "no_route",
            ),
            Self::TooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "Request body exceeds gateway limit",
                "invalid_request_error",
                "request_too_large",
            ),
            Self::RequestTimeout => (
                StatusCode::REQUEST_TIMEOUT,
                "Request body read deadline exceeded",
                "invalid_request_error",
                "request_timeout",
            ),
            Self::UnsupportedEncoding => (
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "Unsupported request Content-Encoding",
                "invalid_request_error",
                "unsupported_content_encoding",
            ),
            Self::InvalidBody => (
                StatusCode::BAD_REQUEST,
                "Invalid request body",
                "invalid_request_error",
                "invalid_body",
            ),
            Self::Resolution(R::InvalidRequest) => (
                StatusCode::BAD_REQUEST,
                "Invalid gateway model",
                "invalid_request_error",
                "invalid_model",
            ),
            Self::Unavailable
            | Self::Resolution(R::Unavailable | R::Configuration | R::Busy)
            | Self::Provider(ProviderError::Configuration | ProviderError::Busy) => (
                StatusCode::SERVICE_UNAVAILABLE,
                "Gateway temporarily unavailable",
                "server_error",
                "gateway_unavailable",
            ),
            Self::Resolution(R::Timeout) | Self::Provider(ProviderError::Timeout) => (
                StatusCode::GATEWAY_TIMEOUT,
                "Upstream deadline exceeded",
                "server_error",
                "upstream_timeout",
            ),
            Self::Resolution(R::Transport | R::InvalidResponse | R::ResponseTooLarge)
            | Self::Provider(ProviderError::Transport) => (
                StatusCode::BAD_GATEWAY,
                "Upstream request failed",
                "server_error",
                "upstream_error",
            ),
        }
    }

    fn origin(&self) -> (ErrorOrigin, &'static str) {
        match self {
            Self::Unavailable => (ErrorOrigin::Gateway, "unavailable"),
            Self::Credential => (ErrorOrigin::Client, "invalid_credential"),
            Self::AmbiguousCredential => (ErrorOrigin::Client, "ambiguous_credential"),
            Self::TooLarge => (ErrorOrigin::Client, "body_too_large"),
            Self::RequestTimeout => (ErrorOrigin::Client, "body_timeout"),
            Self::UnsupportedEncoding => (ErrorOrigin::Client, "unsupported_content_encoding"),
            Self::InvalidBody => (ErrorOrigin::Client, "invalid_body"),
            Self::Resolution(error) => resolution_origin(*error),
            Self::Provider(error) => provider_origin(*error),
        }
    }

    fn into_native_response(
        self,
        api_format: ApiFormat,
        correlation: &RequestCorrelation,
    ) -> Response {
        let (phase, reason) = self.category();
        let (origin, _) = self.origin();
        let (status, message, kind, code) = self.classify();
        // Caller mistakes are routine; only failures that need an operator warn.
        if status.is_server_error() {
            tracing::warn!(
                phase,
                reason,
                error.origin = origin.as_str(),
                status = status.as_u16(),
                "gateway request rejected"
            );
        } else {
            tracing::debug!(
                phase,
                reason,
                error.origin = origin.as_str(),
                status = status.as_u16(),
                "gateway request rejected"
            );
        }
        let request_id = correlation.id();
        match api_format {
            ApiFormat::OpenAiResponses | ApiFormat::OpenAiChatCompletions => (
                status,
                Json(OpenAiErrorResponse {
                    error: OpenAiErrorDetail {
                        message,
                        kind,
                        param: None,
                        code,
                    },
                    request_id,
                }),
            )
                .into_response(),
            ApiFormat::AnthropicMessages => (
                status,
                Json(AnthropicErrorResponse {
                    kind: "error",
                    error: AnthropicErrorDetail {
                        kind: anthropic_error_type(status),
                        message,
                    },
                    request_id,
                }),
            )
                .into_response(),
        }
    }
}

fn anthropic_error_type(status: StatusCode) -> &'static str {
    match status {
        StatusCode::UNAUTHORIZED => "authentication_error",
        StatusCode::FORBIDDEN => "permission_error",
        StatusCode::NOT_FOUND => "not_found_error",
        StatusCode::PAYLOAD_TOO_LARGE => "request_too_large",
        StatusCode::SERVICE_UNAVAILABLE => "overloaded_error",
        status if status.is_client_error() => "invalid_request_error",
        _ => "api_error",
    }
}

#[cfg(test)]
mod tests;
