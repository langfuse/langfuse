//! Public OpenAI-compatible envelope around the opaque resolve/execute flow.
use std::{error::Error, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    body::{Body, Bytes, to_bytes},
    extract::{Request, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Serialize;
use tracing::Instrument;

use crate::{
    inference::{InferenceService, RequestPreparationError},
    providers::openai::{OpenAiRoute, ProviderError},
    resolution::ResolutionError,
    server::GatewayLifecycleState,
};

const MAX_REQUEST_BYTES: usize = 4 * 1024 * 1024;
const REQUEST_READ_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
struct InferenceRouteState {
    inference: Option<Arc<InferenceService>>,
    lifecycle: GatewayLifecycleState,
}

/// Build inference routes. An unconfigured or draining service returns 503.
pub fn router(inference: Option<InferenceService>, lifecycle: GatewayLifecycleState) -> Router {
    Router::new()
        .route("/openai/v1/responses", post(handle_responses))
        .route(
            "/openai/v1/responses/compact",
            post(handle_responses_compact),
        )
        .route("/openai/v1/models", get(handle_models))
        .with_state(InferenceRouteState {
            inference: inference.map(Arc::new),
            lifecycle,
        })
}

async fn handle_responses(
    State(state): State<InferenceRouteState>,
    request: Request,
) -> Result<Response, InferenceHttpError> {
    handle_openai(state, request, OpenAiRoute::Responses).await
}

async fn handle_responses_compact(
    State(state): State<InferenceRouteState>,
    request: Request,
) -> Result<Response, InferenceHttpError> {
    handle_openai(state, request, OpenAiRoute::ResponsesCompact).await
}

async fn handle_models(
    State(state): State<InferenceRouteState>,
    request: Request,
) -> Result<Response, InferenceHttpError> {
    handle_openai(state, request, OpenAiRoute::Models).await
}

async fn handle_openai(
    state: InferenceRouteState,
    request: Request,
    route: OpenAiRoute,
) -> Result<Response, InferenceHttpError> {
    let inference = state
        .inference
        .as_ref()
        .filter(|_| state.lifecycle.is_ready())
        .ok_or(InferenceHttpError::Unavailable)?;
    let gateway_key = gateway_key(request.headers())?.to_owned();
    let (permit, context) = inference
        .resolve_and_admit(&gateway_key)
        .await
        .map_err(|error| match error {
            RequestPreparationError::Resolution(error) => InferenceHttpError::Resolution(error),
            RequestPreparationError::Provider(error) => InferenceHttpError::Provider(error),
        })?;
    let (parts, body) = request.into_parts();
    let bytes = match route {
        OpenAiRoute::Models => Bytes::new(),
        OpenAiRoute::Responses | OpenAiRoute::ResponsesCompact => read_request_body(body).await?,
    };
    inference
        .forward(permit, context, &parts.headers, bytes, route)
        .await
        .map_err(InferenceHttpError::Provider)
}

/// Buffer the client body. The wait is mostly the caller's upload, so it gets its
/// own span and the measured size lands on the server span for aggregation.
async fn read_request_body(body: Body) -> Result<Bytes, InferenceHttpError> {
    let server = tracing::Span::current();
    let span = tracing::info_span!(
        "request.body",
        otel.kind = "internal",
        http.request.body.size = tracing::field::Empty
    );
    let bytes = async {
        let bytes = tokio::time::timeout(REQUEST_READ_TIMEOUT, to_bytes(body, MAX_REQUEST_BYTES))
            .await
            .map_err(|_| InferenceHttpError::RequestTimeout)?
            .map_err(|error| {
                if error
                    .source()
                    .is_some_and(<dyn Error + 'static>::is::<http_body_util::LengthLimitError>)
                {
                    InferenceHttpError::TooLarge
                } else {
                    InferenceHttpError::InvalidBody
                }
            })?;
        tracing::Span::current().record("http.request.body.size", byte_count(bytes.len()));
        Ok::<_, InferenceHttpError>(bytes)
    }
    .instrument(span)
    .await?;
    server.record("http.request.body.size", byte_count(bytes.len()));
    Ok(bytes)
}

fn byte_count(len: usize) -> i64 {
    i64::try_from(len).unwrap_or(i64::MAX)
}

fn gateway_key(headers: &HeaderMap) -> Result<&str, InferenceHttpError> {
    let mut values = headers.get_all(header::AUTHORIZATION).iter();
    let value = values
        .next()
        .and_then(|value| value.to_str().ok())
        .ok_or(InferenceHttpError::Credential)?;
    if values.next().is_some() {
        return Err(InferenceHttpError::Credential);
    }
    let (scheme, token) = value
        .split_once(' ')
        .ok_or(InferenceHttpError::Credential)?;
    if !scheme.eq_ignore_ascii_case("Bearer")
        || token.is_empty()
        || token.len() > 8192
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_graphic() && byte != b',')
    {
        return Err(InferenceHttpError::Credential);
    }
    Ok(token)
}

enum InferenceHttpError {
    Unavailable,
    Credential,
    TooLarge,
    RequestTimeout,
    InvalidBody,
    Resolution(ResolutionError),
    Provider(ProviderError),
}

#[derive(Serialize)]
struct OpenAiErrorResponse {
    error: OpenAiErrorDetail,
}
#[derive(Serialize)]
struct OpenAiErrorDetail {
    message: &'static str,
    #[serde(rename = "type")]
    kind: &'static str,
    param: Option<&'static str>,
    code: &'static str,
}

impl InferenceHttpError {
    fn category(&self) -> (&'static str, &'static str) {
        use ResolutionError as R;
        match self {
            Self::Unavailable => ("admission", "unavailable"),
            Self::Credential => ("authentication", "invalid_credential"),
            Self::TooLarge => ("request", "body_too_large"),
            Self::RequestTimeout => ("request", "body_timeout"),
            Self::InvalidBody => ("request", "invalid_body"),
            Self::Resolution(error) => (
                "resolution",
                match error {
                    R::InvalidCredential | R::Authentication => "authentication",
                    R::Forbidden => "forbidden",
                    R::NoRoute => "no_route",
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
}

impl IntoResponse for InferenceHttpError {
    fn into_response(self) -> Response<Body> {
        use ResolutionError as R;
        let (phase, reason) = self.category();
        let (status, message, kind, code) = match self {
            Self::Credential | Self::Resolution(R::InvalidCredential | R::Authentication) => (
                StatusCode::UNAUTHORIZED,
                "Invalid gateway credential",
                "authentication_error",
                "invalid_api_key",
            ),
            Self::Resolution(R::Forbidden) => (
                StatusCode::FORBIDDEN,
                "Gateway access forbidden",
                "permission_error",
                "permission_denied",
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
            Self::InvalidBody => (
                StatusCode::BAD_REQUEST,
                "Invalid request body",
                "invalid_request_error",
                "invalid_body",
            ),
            Self::Unavailable
            | Self::Resolution(R::Unavailable | R::Configuration)
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
        };
        if status.is_server_error() {
            tracing::warn!(
                phase,
                reason,
                status = status.as_u16(),
                "gateway request rejected"
            );
        } else {
            tracing::debug!(
                phase,
                reason,
                status = status.as_u16(),
                "gateway request rejected"
            );
        }
        (
            status,
            Json(OpenAiErrorResponse {
                error: OpenAiErrorDetail {
                    message,
                    kind,
                    param: None,
                    code,
                },
            }),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests;
