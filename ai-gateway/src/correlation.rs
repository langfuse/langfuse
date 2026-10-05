//! One gateway request ID per inference request, shared by the caller's response,
//! logs, operational spans, the Web resolution call and the Langfuse generation.
//! Once resolution succeeds, the request also carries its tenant and the provider
//! connection it was sent to.
use axum::{
    extract::Request,
    http::{HeaderMap, HeaderName, HeaderValue},
    middleware::Next,
    response::Response,
};

use crate::resolution::{ProviderConnection, ResolvedRequestContext};

pub(crate) const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("langfuse-request-id");
const TRACE_ID_HEADER: HeaderName = HeaderName::from_static("langfuse-trace-id");
const OBSERVATION_ID_HEADER: HeaderName = HeaderName::from_static("langfuse-observation-id");
const ORGANIZATION_ID_HEADER: HeaderName = HeaderName::from_static("langfuse-organization-id");
const PROJECT_ID_HEADER: HeaderName = HeaderName::from_static("langfuse-project-id");
const PROVIDER_HEADER: HeaderName = HeaderName::from_static("langfuse-provider");
const PROVIDER_CONNECTION_ID_HEADER: HeaderName =
    HeaderName::from_static("langfuse-provider-connection-id");
const MODEL_HEADER: HeaderName = HeaderName::from_static("langfuse-model");
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
struct Tenant {
    organization_id: String,
    project_id: String,
}

/// The provider connection and model of an upstream attempt. With several
/// attempts the latest one wins, so it names the connection that served the
/// response, or the last one tried.
#[derive(Clone, Debug)]
pub(crate) struct UpstreamTarget {
    provider: &'static str,
    connection_id: String,
    connection_name: Option<String>,
    model: Option<String>,
}

impl UpstreamTarget {
    pub fn for_connection(connection: &ProviderConnection, model: Option<String>) -> Self {
        Self {
            provider: connection.provider().as_str(),
            connection_id: connection.id().to_owned(),
            connection_name: connection.name().map(str::to_owned),
            model,
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct RequestCorrelation {
    id: String,
    client_id: Option<String>,
    generation: Option<GenerationIds>,
    tenant: Option<Tenant>,
    upstream: Option<UpstreamTarget>,
    /// The request's `http.server` span, which outlives the phase spans.
    server_span: tracing::Span,
}

impl Default for RequestCorrelation {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::now_v7().hyphenated().to_string(),
            client_id: None,
            generation: None,
            tenant: None,
            upstream: None,
            server_span: tracing::Span::none(),
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

    pub fn record_resolution(&mut self, context: &ResolvedRequestContext) {
        let attribution = context.attribution();
        self.server_span
            .record("langfuse.organization.id", attribution.organization_id());
        self.server_span
            .record("langfuse.project.id", attribution.project_id());
        self.tenant = Some(Tenant {
            organization_id: attribution.organization_id().to_owned(),
            project_id: attribution.project_id().to_owned(),
        });
    }

    pub fn record_upstream(&mut self, target: UpstreamTarget) {
        let span = &self.server_span;
        span.record("gateway.provider", target.provider);
        span.record(
            "gateway.provider.connection.id",
            target.connection_id.as_str(),
        );
        if let Some(name) = &target.connection_name {
            span.record("gateway.provider.connection.name", name.as_str());
        }
        if let Some(model) = &target.model {
            span.record("gateway.upstream.model", model.as_str());
        }
        self.upstream = Some(target);
    }

    /// Only a resolved request advertises its tenant, and only a request sent
    /// upstream its provider. The connection name stays out of responses.
    pub fn apply_resolution_headers(&self, headers: &mut HeaderMap) {
        let Some(tenant) = &self.tenant else {
            return;
        };
        let mut values = vec![
            (ORGANIZATION_ID_HEADER, tenant.organization_id.as_str()),
            (PROJECT_ID_HEADER, tenant.project_id.as_str()),
        ];
        if let Some(upstream) = &self.upstream {
            values.push((PROVIDER_HEADER, upstream.provider));
            values.push((PROVIDER_CONNECTION_ID_HEADER, &upstream.connection_id));
            if let Some(model) = &upstream.model {
                values.push((MODEL_HEADER, model));
            }
        }
        // `HeaderValue` admits non-ASCII bytes, which most clients cannot read as text.
        for (name, value) in values {
            if !value
                .bytes()
                .all(|byte| byte == b' ' || byte.is_ascii_graphic())
            {
                continue;
            }
            if let Ok(value) = HeaderValue::from_str(value) {
                headers.insert(name, value);
            }
        }
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

/// Runs inside the server span before any rejection, so every response, log line
/// and phase span of the request can carry the ID.
pub(crate) async fn assign_request_id(mut request: Request, next: Next) -> Response {
    let mut correlation = RequestCorrelation::from_headers(request.headers());
    let span = tracing::Span::current();
    span.record("gateway.request.id", correlation.id());
    if let Some(client_id) = correlation.client_id() {
        span.record("gateway.client.request.id", client_id);
    }
    correlation.server_span = span;
    let value = HeaderValue::from_str(correlation.id()).expect("a UUID is a valid header value");
    request.extensions_mut().insert(correlation);
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
