//! AWS Bedrock `ApplyGuardrail` adapter authenticated with a Bedrock API key
//! (`Authorization: Bearer`). All errors and timeouts fail closed (treated as a
//! guardrail match) so unscreened prompts never bypass a configured guardrail.
use std::{fmt, fmt::Write as _};

use axum::body::Bytes;
use reqwest::{
    StatusCode, Url,
    header::{ACCEPT, ACCEPT_ENCODING, AUTHORIZATION, CONTENT_TYPE, HeaderValue},
};
use reqwest_tracing::DisableOtelPropagation;
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};

use crate::guardrails::external::ExternalGuardrailClient;

const MAX_BEDROCK_RESPONSE_BYTES: usize = 256 * 1024;
const BEDROCK_INTERVENED_ACTION: &str = "GUARDRAIL_INTERVENED";
const BEDROCK_NONE_ACTION: &str = "NONE";

/// Configuration for an external AWS Bedrock Guardrail resolved from Web.
#[derive(Clone)]
pub(crate) struct BedrockGuardrail {
    pub guardrail_id: String,
    pub guardrail_version: String,
    pub region: String,
    pub api_key: SecretString,
}

impl fmt::Debug for BedrockGuardrail {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("BedrockGuardrail")
            .field("guardrail_id", &self.guardrail_id)
            .field("guardrail_version", &self.guardrail_version)
            .field("region", &self.region)
            .finish_non_exhaustive()
    }
}

/// Serializes `text` into the AWS Bedrock `ApplyGuardrail` JSON request body.
pub(crate) fn serialize_request(text: &str) -> Option<Bytes> {
    serde_json::to_vec(&ApplyGuardrailRequest {
        source: "INPUT",
        content: [GuardrailContentBlock {
            text: GuardrailTextBlock { text },
        }],
    })
    .ok()
    .map(Bytes::from)
}

pub(crate) async fn evaluate_one(
    client: &ExternalGuardrailClient,
    langfuse_guardrail_id: &str,
    config: &BedrockGuardrail,
    payload: Bytes,
    organization_id: &str,
) -> bool {
    #[cfg(test)]
    let origin = client
        .origin_override
        .clone()
        .unwrap_or_else(|| bedrock_runtime_origin(&config.region));
    #[cfg(not(test))]
    let origin = bedrock_runtime_origin(&config.region);
    let Ok(url) = apply_url(&origin, config) else {
        tracing::warn!(
            guardrail_id = langfuse_guardrail_id,
            organization_id,
            region = %config.region,
            reason = "invalid_url",
            "bedrock guardrail check failed; failing closed"
        );
        return true;
    };
    if client.policy.check_allowed_host(&url).is_err() {
        tracing::warn!(
            guardrail_id = langfuse_guardrail_id,
            organization_id,
            region = %config.region,
            reason = "blocked_destination",
            "bedrock guardrail destination blocked by outbound policy; failing closed"
        );
        return true;
    }
    let Ok(mut authorization) =
        HeaderValue::from_str(&format!("Bearer {}", config.api_key.expose_secret()))
    else {
        tracing::warn!(
            guardrail_id = langfuse_guardrail_id,
            organization_id,
            region = %config.region,
            reason = "invalid_credential",
            "bedrock guardrail check failed; failing closed"
        );
        return true;
    };
    authorization.set_sensitive(true);

    let request = client
        .http
        .post(url)
        .with_extension(DisableOtelPropagation)
        .header(AUTHORIZATION, authorization)
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "application/json")
        .header(ACCEPT_ENCODING, "identity")
        .body(payload);

    match tokio::time::timeout(client.timeout, send_and_parse(request)).await {
        Ok(Ok(intervened)) => intervened,
        Ok(Err(failure)) => {
            tracing::warn!(
                guardrail_id = langfuse_guardrail_id,
                organization_id,
                region = %config.region,
                reason = failure.reason(),
                status = failure.status(),
                "bedrock guardrail check failed; failing closed"
            );
            true
        }
        Err(_) => {
            tracing::warn!(
                guardrail_id = langfuse_guardrail_id,
                organization_id,
                region = %config.region,
                reason = "timeout",
                "bedrock guardrail check timed out; failing closed"
            );
            true
        }
    }
}

fn bedrock_runtime_origin(region: &str) -> String {
    format!("https://bedrock-runtime.{region}.amazonaws.com")
}

fn apply_url(origin: &str, config: &BedrockGuardrail) -> Result<Url, url::ParseError> {
    let encoded_id = percent_encode_path_segment(&config.guardrail_id);
    let encoded_version = percent_encode_path_segment(&config.guardrail_version);
    Url::parse(&format!(
        "{}/guardrail/{encoded_id}/version/{encoded_version}/apply",
        origin.trim_end_matches('/')
    ))
}

#[derive(Serialize)]
struct ApplyGuardrailRequest<'a> {
    source: &'static str,
    content: [GuardrailContentBlock<'a>; 1],
}

#[derive(Serialize)]
struct GuardrailContentBlock<'a> {
    text: GuardrailTextBlock<'a>,
}

#[derive(Serialize)]
struct GuardrailTextBlock<'a> {
    text: &'a str,
}

#[derive(Deserialize)]
struct ApplyGuardrailResponse {
    action: String,
}

enum BedrockFailure {
    Transport,
    HttpStatus(StatusCode),
    ResponseTooLarge,
    InvalidResponse,
    UnexpectedAction,
}

impl BedrockFailure {
    fn reason(&self) -> &'static str {
        match self {
            Self::Transport => "transport",
            Self::HttpStatus(_) => "http_status",
            Self::ResponseTooLarge => "response_too_large",
            Self::InvalidResponse => "invalid_response",
            Self::UnexpectedAction => "unexpected_action",
        }
    }

    fn status(&self) -> Option<u16> {
        match self {
            Self::HttpStatus(status) => Some(status.as_u16()),
            Self::Transport
            | Self::ResponseTooLarge
            | Self::InvalidResponse
            | Self::UnexpectedAction => None,
        }
    }
}

async fn send_and_parse(
    request: reqwest_middleware::RequestBuilder,
) -> Result<bool, BedrockFailure> {
    let response = request
        .send()
        .await
        .map_err(|_| BedrockFailure::Transport)?;
    let status = response.status();
    if status != StatusCode::OK {
        return Err(BedrockFailure::HttpStatus(status));
    }
    let body = read_bounded_body(response, MAX_BEDROCK_RESPONSE_BYTES).await?;
    let parsed: ApplyGuardrailResponse =
        serde_json::from_slice(&body).map_err(|_| BedrockFailure::InvalidResponse)?;
    match parsed.action.as_str() {
        BEDROCK_INTERVENED_ACTION => Ok(true),
        BEDROCK_NONE_ACTION => Ok(false),
        _ => Err(BedrockFailure::UnexpectedAction),
    }
}

async fn read_bounded_body(
    mut response: reqwest::Response,
    limit: usize,
) -> Result<Vec<u8>, BedrockFailure> {
    if response
        .content_length()
        .is_some_and(|length| usize::try_from(length).unwrap_or(usize::MAX) > limit)
    {
        return Err(BedrockFailure::ResponseTooLarge);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| BedrockFailure::Transport)?
    {
        if chunk.len() > limit.saturating_sub(body.len()) {
            return Err(BedrockFailure::ResponseTooLarge);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/// Percent-encodes every byte outside RFC 3986 unreserved characters so an ARN
/// (`:` and `/`) stays a single URI path segment as AWS Smithy `httpLabel` requires.
fn percent_encode_path_segment(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            out.push(char::from(byte));
        } else {
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::guardrails::{Guardrail, GuardrailAction, GuardrailKind, external::ExternalPayloads};
    use axum::{body::Body, http::Response};
    use http_body_util::BodyExt;

    fn sample_config(guardrail_id: &str, version: &str) -> BedrockGuardrail {
        BedrockGuardrail {
            guardrail_id: guardrail_id.into(),
            guardrail_version: version.into(),
            region: "us-east-1".into(),
            api_key: SecretString::from("bedrock-api-key-secret"),
        }
    }

    fn sample_guardrail(id: &str, guardrail_id: &str) -> Guardrail {
        Guardrail {
            id: id.into(),
            name: id.into(),
            action: GuardrailAction::Block,
            kind: GuardrailKind::Bedrock(sample_config(guardrail_id, "1")),
        }
    }

    #[test]
    fn encodes_guardrail_id_and_arn_as_single_path_segment() {
        let origin = bedrock_runtime_origin("us-east-1");
        assert_eq!(
            apply_url(&origin, &sample_config("abc123def", "1"))
                .unwrap()
                .as_str(),
            "https://bedrock-runtime.us-east-1.amazonaws.com/guardrail/abc123def/version/1/apply"
        );
        assert_eq!(
            apply_url(
                &origin,
                &sample_config(
                    "arn:aws:bedrock:us-east-1:123456789012:guardrail/abc123def",
                    "DRAFT"
                )
            )
            .unwrap()
            .as_str(),
            "https://bedrock-runtime.us-east-1.amazonaws.com/guardrail/arn%3Aaws%3Abedrock%3Aus-east-1%3A123456789012%3Aguardrail%2Fabc123def/version/DRAFT/apply"
        );
    }

    #[test]
    fn debug_redacts_api_key() {
        let debug = format!("{:?}", sample_config("abc123", "1"));
        assert!(!debug.contains("bedrock-api-key-secret"));
    }

    #[tokio::test]
    async fn calls_apply_guardrail_with_bearer_auth_and_maps_intervened_none_and_failures() {
        let server = crate::test_support::FakeServer::start(|request| async move {
            assert_eq!(request.method(), reqwest::Method::POST);
            assert_eq!(
                request.headers().get(AUTHORIZATION).unwrap(),
                "Bearer bedrock-api-key-secret"
            );
            let path = request.uri().path().to_owned();
            let body = request.into_body().collect().await.unwrap().to_bytes();
            let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(
                json,
                serde_json::json!({
                    "source": "INPUT",
                    "content": [{ "text": { "text": "hello world" } }]
                })
            );
            if path == "/guardrail/intervene/version/1/apply" {
                Response::new(Body::from(r#"{"action":"GUARDRAIL_INTERVENED"}"#))
            } else if path == "/guardrail/pass/version/1/apply" {
                Response::new(Body::from(r#"{"action":"NONE"}"#))
            } else if path == "/guardrail/badinput/version/1/apply" {
                Response::builder()
                    .status(StatusCode::BAD_REQUEST)
                    .body(Body::from(r#"{"message":"input too long"}"#))
                    .unwrap()
            } else if path == "/guardrail/slow/version/1/apply" {
                tokio::time::sleep(Duration::from_millis(250)).await;
                Response::new(Body::from(r#"{"action":"GUARDRAIL_INTERVENED"}"#))
            } else {
                Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .body(Body::from(r#"{"message":"boom"}"#))
                    .unwrap()
            }
        })
        .await;

        let client =
            ExternalGuardrailClient::for_test(server.url.clone(), Duration::from_millis(80));
        let guardrails = [
            sample_guardrail("g1", "intervene"),
            sample_guardrail("g2", "pass"),
            sample_guardrail("g3", "badinput"),
            sample_guardrail("g4", "slow"),
            sample_guardrail("g5", "error"),
        ];
        let refs: Vec<&Guardrail> = guardrails.iter().collect();
        let payloads = ExternalPayloads::for_guardrails(&refs, "hello world");
        let results = client.evaluate_many(&refs, &payloads, "org-1").await;
        assert_eq!(results, vec![true, false, true, true, true]);
    }
}
