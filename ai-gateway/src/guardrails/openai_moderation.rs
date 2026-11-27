//! `OpenAI` Moderation (`POST /v1/moderations`) adapter authenticated with an
//! `OpenAI` API key (`Authorization: Bearer`). The API returns verdicts and
//! scores but no spans, so a flagged input only blocks or logs. All errors and
//! timeouts fail closed (treated as a guardrail match).
use std::fmt;

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

const MODERATION_MODEL: &str = "omni-moderation-latest";
const MODERATION_PATH: &str = "/v1/moderations";
const MIN_RESPONSE_BYTES: usize = 64 * 1024;
/// Upper bound for one input's result (categories, scores and applied input types).
const MAX_RESULT_BYTES: usize = 4 * 1024;
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

/// Configuration for an external `OpenAI` Moderation guardrail resolved from Web.
#[derive(Clone)]
pub(crate) struct OpenAiModerationGuardrail {
    /// Data-residency region: `us` (`api.openai.com`) or `eu` (`eu.api.openai.com`).
    pub region: String,
    pub api_key: SecretString,
}

impl fmt::Debug for OpenAiModerationGuardrail {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("OpenAiModerationGuardrail")
            .field("region", &self.region)
            .finish_non_exhaustive()
    }
}

/// A serialized moderation request and the number of inputs it carries, so
/// the response must classify every input.
#[derive(Clone)]
pub(crate) struct ModerationPayload {
    body: Bytes,
    inputs: usize,
}

/// Serializes `blocks` into one moderation request with one input per block.
pub(crate) fn serialize_blocks(blocks: &[&str]) -> Option<ModerationPayload> {
    let body = serde_json::to_vec(&ModerationRequest {
        model: MODERATION_MODEL,
        input: blocks,
    })
    .ok()?;
    Some(ModerationPayload {
        body: Bytes::from(body),
        inputs: blocks.len(),
    })
}

pub(crate) async fn evaluate_one(
    client: &ExternalGuardrailClient,
    langfuse_guardrail_id: &str,
    config: &OpenAiModerationGuardrail,
    payload: ModerationPayload,
    organization_id: &str,
) -> ExternalOutcome {
    let origin = moderation_origin(&config.region);
    #[cfg(test)]
    let origin = origin.map(|origin| client.origin_override.as_deref().unwrap_or(origin));
    let Some(Ok(url)) = origin.map(|origin| Url::parse(&format!("{origin}{MODERATION_PATH}")))
    else {
        tracing::warn!(
            guardrail_id = langfuse_guardrail_id,
            organization_id,
            region = %config.region,
            reason = "invalid_url",
            "openai moderation guardrail check failed; failing closed"
        );
        return ExternalOutcome::Failed(ExternalFailureKind::Unavailable);
    };
    if client.policy.check_allowed_host(&url).is_err() {
        tracing::warn!(
            guardrail_id = langfuse_guardrail_id,
            organization_id,
            region = %config.region,
            reason = "blocked_destination",
            "openai moderation guardrail destination blocked by outbound policy; failing closed"
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
            "openai moderation guardrail check failed; failing closed"
        );
        return ExternalOutcome::Failed(ExternalFailureKind::Unavailable);
    };
    authorization.set_sensitive(true);

    let response_limit = MIN_RESPONSE_BYTES
        .max(payload.inputs.saturating_mul(MAX_RESULT_BYTES))
        .min(MAX_RESPONSE_BYTES);
    let request = client
        .http
        .post(url)
        .with_extension(DisableOtelPropagation)
        .header(AUTHORIZATION, authorization)
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "application/json")
        .header(ACCEPT_ENCODING, "identity")
        .body(payload.body);

    match tokio::time::timeout(
        client.timeout,
        send_and_parse(request, response_limit, payload.inputs),
    )
    .await
    {
        Ok(Ok(outcome)) => outcome,
        Ok(Err(failure)) => {
            tracing::warn!(
                guardrail_id = langfuse_guardrail_id,
                organization_id,
                region = %config.region,
                reason = failure.reason(),
                status = failure.status(),
                "openai moderation guardrail check failed; failing closed"
            );
            ExternalOutcome::Failed(failure.kind())
        }
        Err(_) => {
            tracing::warn!(
                guardrail_id = langfuse_guardrail_id,
                organization_id,
                region = %config.region,
                reason = "timeout",
                "openai moderation guardrail check timed out; failing closed"
            );
            ExternalOutcome::Failed(ExternalFailureKind::Timeout)
        }
    }
}

fn moderation_origin(region: &str) -> Option<&'static str> {
    match region {
        "us" => Some("https://api.openai.com"),
        "eu" => Some("https://eu.api.openai.com"),
        _ => None,
    }
}

#[derive(Serialize)]
struct ModerationRequest<'a> {
    model: &'static str,
    input: &'a [&'a str],
}

#[derive(Deserialize)]
struct ModerationResponse {
    results: Vec<ModerationResult>,
}

#[derive(Deserialize)]
struct ModerationResult {
    flagged: bool,
}

async fn send_and_parse(
    request: reqwest_middleware::RequestBuilder,
    response_limit: usize,
    inputs: usize,
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
    let parsed: ModerationResponse =
        serde_json::from_slice(&body).map_err(|_| ExternalCallFailure::InvalidResponse)?;
    // A short result list would leave some inputs unscreened.
    if parsed.results.len() != inputs {
        return Err(ExternalCallFailure::InvalidResponse);
    }
    if parsed.results.iter().any(|result| result.flagged) {
        Ok(ExternalOutcome::Blocked)
    } else {
        Ok(ExternalOutcome::None)
    }
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

    const PASS_RESULT: &str =
        r#"{"flagged":false,"categories":{"violence":false},"category_scores":{"violence":0.01}}"#;
    const FLAGGED_RESULT: &str =
        r#"{"flagged":true,"categories":{"violence":true},"category_scores":{"violence":0.97}}"#;

    fn sample_config(api_key: &str) -> OpenAiModerationGuardrail {
        OpenAiModerationGuardrail {
            region: "eu".into(),
            api_key: SecretString::from(api_key.to_owned()),
        }
    }

    #[tokio::test]
    async fn unknown_region_resolves_and_fails_only_its_guardrail_closed() {
        let mut guardrail = sample_guardrail("g1", "clean");
        let GuardrailKind::OpenAiModeration(config) = &mut guardrail.kind else {
            unreachable!()
        };
        config.region = "jp".into();
        assert!(guardrail.is_valid_from_resolve());

        let client = ExternalGuardrailClient::for_test(
            "http://127.0.0.1:1".into(),
            Duration::from_millis(80),
        );
        let refs = [&guardrail];
        let payloads =
            ExternalPayloads::for_guardrails(&refs, &["hello"], GuardrailLocation::Request);
        assert_eq!(
            client.evaluate_many(&refs, &payloads, "org-1").await,
            vec![ExternalOutcome::Failed(ExternalFailureKind::Unavailable)]
        );
    }

    fn sample_guardrail(id: &str, api_key: &str) -> Guardrail {
        Guardrail {
            id: id.into(),
            name: id.into(),
            action: GuardrailAction::Block,
            scope: GuardrailScope::LastTurn,
            redaction_label: None,
            kind: GuardrailKind::OpenAiModeration(sample_config(api_key)),
        }
    }

    #[test]
    fn maps_regions_to_openai_origins() {
        assert_eq!(moderation_origin("us"), Some("https://api.openai.com"));
        assert_eq!(moderation_origin("eu"), Some("https://eu.api.openai.com"));
        assert_eq!(moderation_origin("eu.evil.example"), None);
    }

    #[test]
    fn debug_redacts_api_key() {
        let debug = format!("{:?}", sample_config("sk-moderation-secret"));
        assert!(!debug.contains("sk-moderation-secret"));
    }

    #[tokio::test]
    async fn sends_every_block_and_maps_flagged_clean_and_failures() {
        let server = crate::test_support::FakeServer::start(|request| async move {
            assert_eq!(request.method(), reqwest::Method::POST);
            assert_eq!(request.uri().path(), MODERATION_PATH);
            let key = request
                .headers()
                .get(AUTHORIZATION)
                .unwrap()
                .to_str()
                .unwrap()
                .trim_start_matches("Bearer ")
                .to_owned();
            let body = request.into_body().collect().await.unwrap().to_bytes();
            let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(
                json,
                serde_json::json!({
                    "model": "omni-moderation-latest",
                    "input": ["hello", "world"],
                })
            );
            let ok = |results: String| {
                Response::new(Body::from(format!(
                    r#"{{"id":"modr-1","results":[{results}]}}"#
                )))
            };
            let status = |code: StatusCode| {
                Response::builder()
                    .status(code)
                    .body(Body::from(r#"{"error":{"message":"nope"}}"#))
                    .unwrap()
            };
            match key.as_str() {
                "flagged" => ok(format!("{PASS_RESULT},{FLAGGED_RESULT}")),
                "clean" => ok(format!("{PASS_RESULT},{PASS_RESULT}")),
                "short" => ok(PASS_RESULT.to_owned()),
                "throttled" => status(StatusCode::TOO_MANY_REQUESTS),
                "unauthorized" => status(StatusCode::UNAUTHORIZED),
                _ => {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    ok(format!("{PASS_RESULT},{PASS_RESULT}"))
                }
            }
        })
        .await;

        let client =
            ExternalGuardrailClient::for_test(server.url.clone(), Duration::from_millis(80));
        let guardrails = [
            sample_guardrail("g1", "flagged"),
            sample_guardrail("g2", "clean"),
            sample_guardrail("g3", "short"),
            sample_guardrail("g4", "throttled"),
            sample_guardrail("g5", "unauthorized"),
            sample_guardrail("g6", "slow"),
        ];
        let refs: Vec<&Guardrail> = guardrails.iter().collect();
        let payloads = ExternalPayloads::for_guardrails(
            &refs,
            &["hello", "world"],
            GuardrailLocation::Request,
        );
        let results = client.evaluate_many(&refs, &payloads, "org-1").await;
        assert_eq!(
            results,
            vec![
                ExternalOutcome::Blocked,
                ExternalOutcome::None,
                ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
                ExternalOutcome::Failed(ExternalFailureKind::RateLimited),
                ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
                ExternalOutcome::Failed(ExternalFailureKind::Timeout),
            ]
        );
    }
}
