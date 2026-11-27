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

use crate::guardrails::external::{
    ExternalCallFailure, ExternalFailureKind, ExternalGuardrailClient, ExternalOutcome,
    read_bounded_body,
};

const MAX_BEDROCK_RESPONSE_BYTES: usize = 256 * 1024;
const MAX_BEDROCK_ANONYMIZED_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
const BEDROCK_INTERVENED_ACTION: &str = "GUARDRAIL_INTERVENED";
const BEDROCK_NONE_ACTION: &str = "NONE";
const BEDROCK_ACTION_BLOCKED: &str = "BLOCKED";

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

/// Serializes `blocks` into the AWS Bedrock `ApplyGuardrail` JSON request body
/// for the given `source` (`"INPUT"` for requests, `"OUTPUT"` for responses).
pub(crate) fn serialize_blocks(blocks: &[&str], source: &'static str) -> Option<Bytes> {
    let content = blocks
        .iter()
        .map(|text| GuardrailContentBlock {
            text: GuardrailTextBlock { text },
        })
        .collect();
    serde_json::to_vec(&ApplyGuardrailRequest { source, content })
        .ok()
        .map(Bytes::from)
}

pub(crate) async fn evaluate_one(
    client: &ExternalGuardrailClient,
    langfuse_guardrail_id: &str,
    config: &BedrockGuardrail,
    payload: Bytes,
    organization_id: &str,
) -> ExternalOutcome {
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
        return ExternalOutcome::Failed(ExternalFailureKind::Unavailable);
    };
    if client.policy.check_allowed_host(&url).is_err() {
        tracing::warn!(
            guardrail_id = langfuse_guardrail_id,
            organization_id,
            region = %config.region,
            reason = "blocked_destination",
            "bedrock guardrail destination blocked by outbound policy; failing closed"
        );
        return ExternalOutcome::Failed(ExternalFailureKind::Unavailable);
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
        return ExternalOutcome::Failed(ExternalFailureKind::Unavailable);
    };
    authorization.set_sensitive(true);

    let response_limit = MAX_BEDROCK_RESPONSE_BYTES.max(
        payload
            .len()
            .saturating_mul(2)
            .min(MAX_BEDROCK_ANONYMIZED_RESPONSE_BYTES),
    );
    let request = client
        .http
        .post(url)
        .with_extension(DisableOtelPropagation)
        .header(AUTHORIZATION, authorization)
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "application/json")
        .header(ACCEPT_ENCODING, "identity")
        .body(payload);

    match tokio::time::timeout(client.timeout, send_and_parse(request, response_limit)).await {
        Ok(Ok(outcome)) => outcome,
        Ok(Err(failure)) => {
            tracing::warn!(
                guardrail_id = langfuse_guardrail_id,
                organization_id,
                region = %config.region,
                reason = failure.reason(),
                status = failure.status(),
                "bedrock guardrail check failed; failing closed"
            );
            ExternalOutcome::Failed(failure.kind())
        }
        Err(_) => {
            tracing::warn!(
                guardrail_id = langfuse_guardrail_id,
                organization_id,
                region = %config.region,
                reason = "timeout",
                "bedrock guardrail check timed out; failing closed"
            );
            ExternalOutcome::Failed(ExternalFailureKind::Timeout)
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
    content: Vec<GuardrailContentBlock<'a>>,
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
    #[serde(default)]
    outputs: Vec<BedrockOutput>,
    #[serde(default)]
    assessments: Vec<BedrockAssessment>,
}

#[derive(Deserialize)]
struct BedrockOutput {
    #[serde(default)]
    text: String,
}

#[derive(Deserialize)]
struct BedrockAssessment {
    #[serde(rename = "sensitiveInformationPolicy", default)]
    sensitive_information: Option<BedrockSensitiveInfoPolicy>,
    #[serde(rename = "wordPolicy", default)]
    word: Option<BedrockWordPolicy>,
    #[serde(rename = "topicPolicy", default)]
    topic: Option<BedrockTopicPolicy>,
    #[serde(rename = "contentPolicy", default)]
    content: Option<BedrockFilterPolicy>,
    #[serde(rename = "contextualGroundingPolicy", default)]
    contextual_grounding: Option<BedrockFilterPolicy>,
}

#[derive(Deserialize)]
struct BedrockSensitiveInfoPolicy {
    #[serde(rename = "piiEntities", default)]
    pii_entities: Vec<BedrockPolicyItem>,
    #[serde(default)]
    regexes: Vec<BedrockPolicyItem>,
}

#[derive(Deserialize)]
struct BedrockWordPolicy {
    #[serde(rename = "customWords", default)]
    custom_words: Vec<BedrockPolicyItem>,
    #[serde(rename = "managedWordLists", default)]
    managed_word_lists: Vec<BedrockPolicyItem>,
}

#[derive(Deserialize)]
struct BedrockTopicPolicy {
    #[serde(default)]
    topics: Vec<BedrockPolicyItem>,
}

#[derive(Deserialize)]
struct BedrockFilterPolicy {
    #[serde(default)]
    filters: Vec<BedrockPolicyItem>,
}

#[derive(Deserialize)]
struct BedrockPolicyItem {
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    detected: Option<bool>,
}

async fn send_and_parse(
    request: reqwest_middleware::RequestBuilder,
    response_limit: usize,
) -> Result<ExternalOutcome, ExternalCallFailure> {
    let response = request
        .send()
        .await
        .map_err(|_| ExternalCallFailure::Transport)?;
    let status = response.status();
    if status != StatusCode::OK {
        return Err(ExternalCallFailure::HttpStatus(status));
    }
    let body = read_bounded_body(response, response_limit).await?;
    let parsed: ApplyGuardrailResponse =
        serde_json::from_slice(&body).map_err(|_| ExternalCallFailure::InvalidResponse)?;
    match parsed.action.as_str() {
        BEDROCK_INTERVENED_ACTION => Ok(extract_external_outcome(parsed)),
        BEDROCK_NONE_ACTION => Ok(ExternalOutcome::None),
        _ => Err(ExternalCallFailure::UnexpectedAction),
    }
}

fn is_detected(detected: Option<bool>) -> bool {
    detected != Some(false)
}

fn has_blocked_policy(items: &[BedrockPolicyItem]) -> bool {
    items.iter().any(|item| {
        is_detected(item.detected) && item.action.as_deref() == Some(BEDROCK_ACTION_BLOCKED)
    })
}

fn has_blocked_assessment(assessments: &[BedrockAssessment]) -> bool {
    assessments.iter().any(|assessment| {
        assessment
            .topic
            .as_ref()
            .is_some_and(|policy| has_blocked_policy(&policy.topics))
            || assessment
                .content
                .as_ref()
                .is_some_and(|policy| has_blocked_policy(&policy.filters))
            || assessment
                .contextual_grounding
                .as_ref()
                .is_some_and(|policy| has_blocked_policy(&policy.filters))
            || assessment.word.as_ref().is_some_and(|policy| {
                has_blocked_policy(&policy.custom_words)
                    || has_blocked_policy(&policy.managed_word_lists)
            })
            || assessment
                .sensitive_information
                .as_ref()
                .is_some_and(|policy| {
                    has_blocked_policy(&policy.pii_entities) || has_blocked_policy(&policy.regexes)
                })
    })
}

/// Maps a Bedrock `GUARDRAIL_INTERVENED` response to [`ExternalOutcome`].
/// Stops immediately and blocks when any assessment policy returned `BLOCKED`
/// (in which case Bedrock replaces `outputs` with a canned refusal message);
/// otherwise returns Bedrock's anonymized `outputs`.
fn extract_external_outcome(parsed: ApplyGuardrailResponse) -> ExternalOutcome {
    if has_blocked_assessment(&parsed.assessments) {
        return ExternalOutcome::Blocked;
    }
    let outputs: Vec<String> = parsed
        .outputs
        .into_iter()
        .map(|output| output.text)
        .collect();
    if outputs.is_empty() {
        ExternalOutcome::Blocked
    } else {
        ExternalOutcome::Anonymized(outputs)
    }
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
    use crate::guardrails::{
        Guardrail, GuardrailAction, GuardrailKind, GuardrailLocation, GuardrailScope,
        external::ExternalPayloads,
    };
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
            scope: GuardrailScope::LastTurn,
            redaction_label: None,
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

    #[test]
    fn parses_anonymized_outputs_and_blocks_on_any_blocked_policy() {
        let anonymized = r#"{
            "action": "GUARDRAIL_INTERVENED",
            "outputs": [{"text": "Contact {EMAIL} or {PHONE}"}],
            "assessments": [{
                "sensitiveInformationPolicy": {
                    "piiEntities": [
                        {"match": "alice@example.com", "type": "EMAIL", "action": "ANONYMIZED", "detected": true},
                        {"match": "ignored@example.com", "type": "EMAIL", "action": "BLOCKED", "detected": false}
                    ],
                    "regexes": [
                        {"name": "order", "match": "ORD-42", "action": "ANONYMIZED", "detected": true}
                    ]
                }
            }]
        }"#;
        let parsed: ApplyGuardrailResponse = serde_json::from_str(anonymized).unwrap();
        assert_eq!(
            extract_external_outcome(parsed),
            ExternalOutcome::Anonymized(vec!["Contact {EMAIL} or {PHONE}".into()])
        );

        // Mixed ANONYMIZED + BLOCKED must return Blocked rather than trusting canned outputs.
        let mixed = r#"{
            "action": "GUARDRAIL_INTERVENED",
            "outputs": [{"text": "Sorry, I cannot help with that."}],
            "assessments": [{
                "sensitiveInformationPolicy": {
                    "piiEntities": [
                        {"match": "alice@example.com", "type": "EMAIL", "action": "ANONYMIZED", "detected": true},
                        {"match": "123-45-6789", "type": "US_SOCIAL_SECURITY_NUMBER", "action": "BLOCKED", "detected": true}
                    ]
                }
            }]
        }"#;
        let parsed: ApplyGuardrailResponse = serde_json::from_str(mixed).unwrap();
        assert_eq!(extract_external_outcome(parsed), ExternalOutcome::Blocked);

        let blocked_topic = r#"{
            "action": "GUARDRAIL_INTERVENED",
            "outputs": [{"text": "Sorry, I cannot help with that."}],
            "assessments": [{
                "topicPolicy": {
                    "topics": [{"name": "financial", "action": "BLOCKED", "detected": true}]
                }
            }]
        }"#;
        let parsed: ApplyGuardrailResponse = serde_json::from_str(blocked_topic).unwrap();
        assert_eq!(extract_external_outcome(parsed), ExternalOutcome::Blocked);
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
            } else if path == "/guardrail/throttled/version/1/apply" {
                Response::builder()
                    .status(StatusCode::TOO_MANY_REQUESTS)
                    .body(Body::from(r#"{"message":"too many requests"}"#))
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
            sample_guardrail("g4", "throttled"),
            sample_guardrail("g5", "slow"),
            sample_guardrail("g6", "error"),
        ];
        let refs: Vec<&Guardrail> = guardrails.iter().collect();
        let payloads =
            ExternalPayloads::for_guardrails(&refs, &["hello world"], GuardrailLocation::Request);
        let results = client.evaluate_many(&refs, &payloads, "org-1").await;
        assert_eq!(
            results,
            vec![
                ExternalOutcome::Blocked,
                ExternalOutcome::None,
                ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
                ExternalOutcome::Failed(ExternalFailureKind::RateLimited),
                ExternalOutcome::Failed(ExternalFailureKind::Timeout),
                ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
            ]
        );
    }
}
