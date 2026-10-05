//! One gateway request ID per inference request, shared by the caller's response,
//! logs, operational spans, the Web resolution call and the Langfuse generation.
use axum::{
    extract::Request,
    http::{HeaderMap, HeaderName, HeaderValue},
    middleware::Next,
    response::Response,
};

pub(crate) const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("langfuse-request-id");
const TRACE_ID_HEADER: HeaderName = HeaderName::from_static("langfuse-trace-id");
const OBSERVATION_ID_HEADER: HeaderName = HeaderName::from_static("langfuse-observation-id");
const CLIENT_REQUEST_ID_HEADER: &str = "x-request-id";
const MAX_CLIENT_REQUEST_ID_BYTES: usize = 256;

/// The Langfuse generation the gateway uploads for a request: its trace ID and
/// its OpenTelemetry span ID, which becomes the observation ID.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct GenerationIds {
    pub trace_id: String,
    pub observation_id: String,
}

#[derive(Clone, Debug)]
pub(crate) struct RequestCorrelation {
    id: String,
    client_id: Option<String>,
    generation: Option<GenerationIds>,
}

impl Default for RequestCorrelation {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::now_v7().hyphenated().to_string(),
            client_id: None,
            generation: None,
        }
    }
}

impl RequestCorrelation {
    /// Always a fresh ID; a caller's `x-request-id` is kept only as a separate value.
    pub fn from_headers(headers: &HeaderMap) -> Self {
        let mut values = headers.get_all(CLIENT_REQUEST_ID_HEADER).iter();
        let client_id = match (values.next(), values.next()) {
            (Some(value), None) => value
                .to_str()
                .ok()
                .map(str::trim)
                .filter(|value| {
                    !value.is_empty()
                        && value.len() <= MAX_CLIENT_REQUEST_ID_BYTES
                        && value
                            .bytes()
                            .all(|byte| byte == b' ' || byte.is_ascii_graphic())
                })
                .map(str::to_owned),
            _ => None,
        };
        Self {
            client_id,
            ..Self::default()
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn client_id(&self) -> Option<&str> {
        self.client_id.as_deref()
    }

    pub fn record_generation(&mut self, ids: GenerationIds) {
        self.generation = Some(ids);
    }

    /// Only a request that will produce a Langfuse generation advertises its IDs.
    pub fn apply_generation_headers(&self, headers: &mut HeaderMap) {
        let Some(generation) = &self.generation else {
            return;
        };
        for (name, value) in [
            (TRACE_ID_HEADER, &generation.trace_id),
            (OBSERVATION_ID_HEADER, &generation.observation_id),
        ] {
            if let Ok(value) = HeaderValue::from_str(value) {
                headers.insert(name, value);
            }
        }
    }
}

/// Runs before the server span exists, so the span starts with the request's ID.
pub(crate) async fn insert_request_correlation(mut request: Request, next: Next) -> Response {
    let correlation = RequestCorrelation::from_headers(request.headers());
    request.extensions_mut().insert(correlation);
    next.run(request).await
}

/// Runs inside the server span before any rejection, so every response, log line
/// and phase span of the request can carry the ID. An instrumented router already
/// assigned it in [`insert_request_correlation`] and started the span with it.
pub(crate) async fn assign_request_id(mut request: Request, next: Next) -> Response {
    let correlation = if let Some(correlation) = request.extensions().get::<RequestCorrelation>() {
        correlation.clone()
    } else {
        let correlation = RequestCorrelation::from_headers(request.headers());
        let span = tracing::Span::current();
        span.record("gateway.request.id", correlation.id());
        if let Some(client_id) = correlation.client_id() {
            span.record("gateway.client.request.id", client_id);
        }
        request.extensions_mut().insert(correlation.clone());
        correlation
    };
    let value = HeaderValue::from_str(correlation.id()).expect("a UUID is a valid header value");
    let mut response = next.run(request).await;
    response.headers_mut().insert(REQUEST_ID_HEADER, value);
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_request_ids_are_bounded_single_printable_values() {
        let client_id = |values: &[&str]| {
            let mut headers = HeaderMap::new();
            for value in values {
                headers.append(CLIENT_REQUEST_ID_HEADER, value.parse().unwrap());
            }
            RequestCorrelation::from_headers(&headers)
                .client_id()
                .map(str::to_owned)
        };
        assert_eq!(client_id(&[" req 1 "]).as_deref(), Some("req 1"));
        assert_eq!(client_id(&[]), None);
        assert_eq!(client_id(&["   "]), None);
        assert_eq!(client_id(&["one", "two"]), None);
        assert_eq!(
            client_id(&[&"x".repeat(MAX_CLIENT_REQUEST_ID_BYTES + 1)]),
            None
        );
        let correlation = RequestCorrelation::from_headers(&HeaderMap::new());
        assert_ne!(correlation.id(), RequestCorrelation::default().id());
    }
}
