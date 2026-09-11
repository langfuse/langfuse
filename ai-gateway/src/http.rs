//! Public OpenAI-compatible envelope around the opaque resolve/execute flow.
use std::{error::Error, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use serde::Serialize;

use crate::{
    execution::{Execution, ExecutionError},
    providers::openai::Error as ProviderError,
    resolution::ResolveError,
    server::AppState,
};

const MAX_REQUEST_BYTES: usize = 4 * 1024 * 1024;
const REQUEST_READ_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
struct HttpState {
    execution: Option<Arc<Execution>>,
    lifecycle: AppState,
}

/// Build inference routes. An unconfigured or draining service returns 503.
pub fn router(execution: Option<Execution>, lifecycle: AppState) -> Router {
    Router::new()
        .route("/openai/v1/responses", post(responses))
        .with_state(HttpState {
            execution: execution.map(Arc::new),
            lifecycle,
        })
}

async fn responses(
    State(state): State<HttpState>,
    request: Request,
) -> Result<Response, GatewayError> {
    let execution = state
        .execution
        .as_ref()
        .filter(|_| state.lifecycle.is_ready())
        .ok_or(GatewayError::Unavailable)?;
    let gateway_key = gateway_key(request.headers())?.to_owned();
    let admission = execution.admit().map_err(GatewayError::Provider)?;
    let (parts, body) = request.into_parts();
    let bytes = tokio::time::timeout(REQUEST_READ_TIMEOUT, to_bytes(body, MAX_REQUEST_BYTES))
        .await
        .map_err(|_| GatewayError::RequestTimeout)?
        .map_err(|error| {
            if error
                .source()
                .is_some_and(<dyn Error + 'static>::is::<http_body_util::LengthLimitError>)
            {
                GatewayError::TooLarge
            } else {
                GatewayError::InvalidBody
            }
        })?;
    execution
        .execute(admission, &gateway_key, &parts.headers, bytes)
        .await
        .map_err(|error| match error {
            ExecutionError::Resolution(error) => GatewayError::Resolution(error),
            ExecutionError::Provider(error) => GatewayError::Provider(error),
        })
}

fn gateway_key(headers: &HeaderMap) -> Result<&str, GatewayError> {
    let mut values = headers.get_all(header::AUTHORIZATION).iter();
    let value = values
        .next()
        .and_then(|value| value.to_str().ok())
        .ok_or(GatewayError::Credential)?;
    if values.next().is_some() {
        return Err(GatewayError::Credential);
    }
    let (scheme, token) = value.split_once(' ').ok_or(GatewayError::Credential)?;
    if !scheme.eq_ignore_ascii_case("Bearer")
        || token.is_empty()
        || token.len() > 8192
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_graphic() && byte != b',')
    {
        return Err(GatewayError::Credential);
    }
    Ok(token)
}

enum GatewayError {
    Unavailable,
    Credential,
    TooLarge,
    RequestTimeout,
    InvalidBody,
    Resolution(ResolveError),
    Provider(ProviderError),
}

#[derive(Serialize)]
struct ErrorEnvelope {
    error: ErrorDetail,
}
#[derive(Serialize)]
struct ErrorDetail {
    message: &'static str,
    #[serde(rename = "type")]
    kind: &'static str,
    param: Option<&'static str>,
    code: &'static str,
}

impl IntoResponse for GatewayError {
    fn into_response(self) -> Response<Body> {
        use ResolveError as R;
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
        (
            status,
            Json(ErrorEnvelope {
                error: ErrorDetail {
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
