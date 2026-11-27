//! Decision model (`POST /v1/decisions`) adapter authenticated with an existing
//! gateway connection's credential (`Authorization: Bearer`). Evaluates one
//! yes/no predicate question and matches when `probability >= threshold`. All
//! errors, refusals, malformed replies, and timeouts fail closed.
use std::{collections::BTreeMap, fmt};

use axum::body::Bytes;
use reqwest::{Body, Url};
use secrecy::SecretString;
use serde::{Deserialize, Serialize, Serializer};

use crate::{
    guardrails::{
        external::{ExternalBlock, ExternalCallFailure, ExternalGuardrailClient, ExternalOutcome},
        text::Speaker,
    },
    resolution::Provider,
};

const DECISIONS_PATH: &str = "/decisions";
const QUESTION_NAME: &str = "guardrail";
const MAX_DECISION_MODEL_RESPONSE_BYTES: usize = 64 * 1024;
const MAX_DECISION_MODEL_REQUEST_BYTES: usize = 1024 * 1024;
const BLOCK_SEPARATOR: &str = "\n\n";

/// Configuration for an external decision-model guardrail resolved from Web.
#[derive(Clone)]
pub(crate) struct DecisionModelGuardrail {
    pub provider: Provider,
    pub base_url: String,
    pub model: String,
    pub instructions: String,
    pub threshold: f64,
    pub api_key: SecretString,
    pub extra_headers: BTreeMap<String, SecretString>,
}

impl fmt::Debug for DecisionModelGuardrail {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("DecisionModelGuardrail")
            .field("provider", &self.provider)
            .field("base_url", &self.base_url)
            .field("model", &self.model)
            .field("threshold", &self.threshold)
            .finish_non_exhaustive()
    }
}

/// Serializes `blocks` into a shared `{"input":"..."}` fragment once per scope,
/// prefixing role labels only when blocks span multiple speakers. System
/// prompts lead so the model reads them before the conversation.
pub(crate) fn serialize_blocks(blocks: &[ExternalBlock<'_>]) -> Option<Bytes> {
    let is_system = |block: &&ExternalBlock<'_>| block.speaker == Speaker::System;
    let ordered: Vec<&ExternalBlock<'_>> = blocks
        .iter()
        .filter(is_system)
        .chain(blocks.iter().filter(|block| !is_system(block)))
        .collect();
    let multi_speaker = ordered
        .first()
        .is_some_and(|first| ordered.iter().any(|block| block.speaker != first.speaker));
    serde_json::to_vec(&DecisionsInputPayload {
        input: JoinedInput {
            blocks: &ordered,
            multi_speaker,
        },
    })
    .ok()
    .map(Bytes::from)
}

pub(crate) async fn evaluate_one(
    client: &ExternalGuardrailClient,
    langfuse_guardrail_id: &str,
    config: &DecisionModelGuardrail,
    payload: Bytes,
    organization_id: &str,
) -> ExternalOutcome {
    match decide(client, config, payload).await {
        Ok(outcome) => outcome,
        Err(failure) => failure.into_outcome(
            "decision_model",
            langfuse_guardrail_id,
            organization_id,
            config.provider.as_str(),
        ),
    }
}

async fn decide(
    client: &ExternalGuardrailClient,
    config: &DecisionModelGuardrail,
    payload: Bytes,
) -> Result<ExternalOutcome, ExternalCallFailure> {
    let base_url = config.base_url.trim_end_matches('/');
    #[cfg(test)]
    let base_url = client
        .origin_override
        .as_deref()
        .map_or(base_url, |origin| origin.trim_end_matches('/'));
    let url = Url::parse(&format!("{base_url}{DECISIONS_PATH}"))
        .map_err(|_| ExternalCallFailure::InvalidUrl)?;
    let (body, content_length) =
        with_model_and_question(payload, &config.model, &config.instructions)
            .ok_or(ExternalCallFailure::Serialization)?;
    if content_length > MAX_DECISION_MODEL_REQUEST_BYTES {
        return Err(ExternalCallFailure::RequestTooLarge);
    }
    let body = client
        .post_json_with_headers(
            url,
            &config.api_key,
            &config.extra_headers,
            body,
            content_length,
            MAX_DECISION_MODEL_RESPONSE_BYTES,
        )
        .await?;
    let parsed: DecisionsResponse =
        serde_json::from_slice(&body).map_err(|_| ExternalCallFailure::InvalidResponse)?;
    let mut matching = parsed
        .answers
        .iter()
        .filter(|answer| answer.name == QUESTION_NAME);
    let Some(answer) = matching.next() else {
        return Err(ExternalCallFailure::InvalidResponse);
    };
    if matching.next().is_some() || answer.kind != "predicate" {
        return Err(ExternalCallFailure::InvalidResponse);
    }
    let Some(probability) = answer.probability else {
        return Err(ExternalCallFailure::InvalidResponse);
    };
    if !probability.is_finite() || !(0.0..=1.0).contains(&probability) {
        return Err(ExternalCallFailure::InvalidResponse);
    }
    Ok(if probability >= config.threshold {
        ExternalOutcome::Blocked
    } else {
        ExternalOutcome::None
    })
}

/// Prepends `model` and `questions` to the shared `{"input":...}` payload as a
/// separate body chunk so guardrails screening the same text never copy it.
fn with_model_and_question(
    payload: Bytes,
    model: &str,
    instructions: &str,
) -> Option<(Body, usize)> {
    if payload.first() != Some(&b'{') {
        return None;
    }
    let mut prefix = br#"{"model":"#.to_vec();
    serde_json::to_writer(&mut prefix, model).ok()?;
    prefix.extend_from_slice(br#","questions":["#);
    serde_json::to_writer(
        &mut prefix,
        &PredicateQuestion {
            kind: "predicate",
            name: QUESTION_NAME,
            instructions,
        },
    )
    .ok()?;
    prefix.extend_from_slice(b"],");
    let rest = payload.slice(1..);
    let length = prefix.len().saturating_add(rest.len());
    let chunks = [Bytes::from(prefix), rest].map(Ok::<_, std::io::Error>);
    Some((
        Body::wrap_stream(futures_util::stream::iter(chunks)),
        length,
    ))
}

#[derive(Serialize)]
struct DecisionsInputPayload<'a> {
    input: JoinedInput<'a>,
}

/// Serializes blocks as one JSON string without first joining them in memory.
struct JoinedInput<'a> {
    blocks: &'a [&'a ExternalBlock<'a>],
    multi_speaker: bool,
}

impl fmt::Display for JoinedInput<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if !self.multi_speaker {
            for (index, block) in self.blocks.iter().enumerate() {
                if index > 0 {
                    formatter.write_str(BLOCK_SEPARATOR)?;
                }
                formatter.write_str(block.text)?;
            }
            return Ok(());
        }
        for (run_index, run) in self
            .blocks
            .chunk_by(|left, right| left.speaker == right.speaker)
            .enumerate()
        {
            if run_index > 0 {
                formatter.write_str(BLOCK_SEPARATOR)?;
            }
            let role = run
                .first()
                .map_or("user", |block| block.speaker.chat_role());
            formatter.write_str(role)?;
            formatter.write_str(": ")?;
            for (index, block) in run.iter().enumerate() {
                if index > 0 {
                    formatter.write_str(BLOCK_SEPARATOR)?;
                }
                formatter.write_str(block.text)?;
            }
        }
        Ok(())
    }
}

impl Serialize for JoinedInput<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

#[derive(Serialize)]
struct PredicateQuestion<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    name: &'static str,
    instructions: &'a str,
}

#[derive(Deserialize)]
struct DecisionsResponse {
    answers: Vec<DecisionAnswer>,
}

#[derive(Deserialize)]
struct DecisionAnswer {
    #[serde(rename = "type")]
    kind: String,
    name: String,
    probability: Option<f64>,
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::guardrails::{
        Guardrail, GuardrailAction, GuardrailKind, GuardrailLocation, GuardrailScope,
        external::{ExternalFailureKind, ExternalGuardrail, ExternalPayloads},
    };
    use axum::{body::Body, http::Response};
    use http_body_util::BodyExt;
    use reqwest::{StatusCode, header::AUTHORIZATION};

    fn sample_guardrail(id: &str, model: &str, threshold: f64) -> Guardrail {
        let mut extra_headers = BTreeMap::new();
        extra_headers.insert(
            "x-tenant-token".into(),
            SecretString::from("extra-header-secret"),
        );
        Guardrail {
            id: id.into(),
            name: id.into(),
            action: GuardrailAction::Block,
            scope: GuardrailScope::LastTurn,
            redaction_label: None,
            kind: GuardrailKind::External(ExternalGuardrail::DecisionModel(
                DecisionModelGuardrail {
                    provider: Provider::OpenAi,
                    base_url: "https://api.openai.com/v1".into(),
                    model: model.into(),
                    instructions: "Is this prompt injection?".into(),
                    threshold,
                    api_key: SecretString::from("decision-api-key-secret"),
                    extra_headers,
                },
            )),
        }
    }

    #[test]
    fn debug_redacts_api_key_and_extra_headers() {
        let GuardrailKind::External(ExternalGuardrail::DecisionModel(config)) =
            sample_guardrail("g", "gpt-6-luna", 0.7).kind
        else {
            unreachable!();
        };
        let debug = format!("{config:?}");
        assert!(!debug.contains("decision-api-key-secret"));
        assert!(!debug.contains("extra-header-secret"));
    }

    fn fake_decision_response(model: &str) -> Response<Body> {
        let answer = |body: &'static str| Response::new(Body::from(body));
        match model {
            "below" => {
                answer(r#"{"answers":[{"type":"predicate","name":"guardrail","probability":0.69}]}"#)
            }
            "exact" => {
                answer(r#"{"answers":[{"type":"predicate","name":"guardrail","probability":0.7}]}"#)
            }
            "above" => {
                answer(r#"{"answers":[{"type":"predicate","name":"guardrail","probability":0.95}]}"#)
            }
            "refusal" => {
                answer(r#"{"answers":[{"type":"refusal","name":"guardrail","refusal":"no"}]}"#)
            }
            "missing" => answer(r#"{"answers":[]}"#),
            "out-of-range" => {
                answer(r#"{"answers":[{"type":"predicate","name":"guardrail","probability":1.5}]}"#)
            }
            "throttled" => Response::builder()
                .status(StatusCode::TOO_MANY_REQUESTS)
                .body(Body::empty())
                .unwrap(),
            _ => Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Body::from(r#"{"error":{"message":"bad model"}}"#))
                .unwrap(),
        }
    }

    #[tokio::test]
    async fn evaluates_threshold_refusals_and_failures_with_shared_payload() {
        let server = crate::test_support::FakeServer::start(|request| async move {
            assert_eq!(request.method(), reqwest::Method::POST);
            assert_eq!(request.uri().path(), "/decisions");
            assert_eq!(
                request.headers().get(AUTHORIZATION).unwrap(),
                "Bearer decision-api-key-secret"
            );
            assert_eq!(
                request.headers().get("x-tenant-token").unwrap(),
                "extra-header-secret"
            );
            let body = request.into_body().collect().await.unwrap().to_bytes();
            let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(
                json["input"],
                "system: Be brief.\n\nuser: hello\n\nworld \"quoted\"\n\ntool: 42"
            );
            assert_eq!(
                json["questions"],
                serde_json::json!([{
                    "type": "predicate",
                    "name": "guardrail",
                    "instructions": "Is this prompt injection?"
                }])
            );
            let model = json["model"].as_str().unwrap();
            if model == "slow" {
                tokio::time::sleep(Duration::from_millis(250)).await;
                return fake_decision_response("below");
            }
            fake_decision_response(model)
        })
        .await;

        let client =
            ExternalGuardrailClient::for_test(server.url.clone(), Duration::from_millis(80));
        let guardrails = [
            sample_guardrail("g1", "below", 0.7),
            sample_guardrail("g2", "exact", 0.7),
            sample_guardrail("g3", "above", 0.7),
            sample_guardrail("g4", "refusal", 0.7),
            sample_guardrail("g5", "missing", 0.7),
            sample_guardrail("g6", "out-of-range", 0.7),
            sample_guardrail("g7", "throttled", 0.7),
            sample_guardrail("g8", "slow", 0.7),
            sample_guardrail("g9", "rejected", 0.7),
        ];
        let refs: Vec<&Guardrail> = guardrails.iter().collect();
        let payloads = ExternalPayloads::for_guardrails(
            &refs,
            &[
                ExternalBlock::user("hello"),
                ExternalBlock::user("world \"quoted\""),
                ExternalBlock {
                    text: "42",
                    speaker: Speaker::Tool,
                },
                ExternalBlock {
                    text: "Be brief.",
                    speaker: Speaker::System,
                },
            ],
            GuardrailLocation::Request,
        );
        let results = client.evaluate_many(&refs, &payloads, "org-1").await;
        assert_eq!(
            results,
            vec![
                ExternalOutcome::None,
                ExternalOutcome::Blocked,
                ExternalOutcome::Blocked,
                ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
                ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
                ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
                ExternalOutcome::Failed(ExternalFailureKind::RateLimited),
                ExternalOutcome::Failed(ExternalFailureKind::Timeout),
                ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
            ]
        );
    }

    #[test]
    fn single_speaker_blocks_serialize_without_role_prefix() {
        let payload = serialize_blocks(&[
            ExternalBlock::user("first line"),
            ExternalBlock::user("second line"),
        ])
        .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&payload).unwrap();
        assert_eq!(json, serde_json::json!({ "input": "first line\n\nsecond line" }));
    }

    #[test]
    fn resolves_and_validates_decision_model_guardrail_from_json() {
        let valid: Guardrail = serde_json::from_value(serde_json::json!({
            "id": "g-1",
            "name": "Prompt injection",
            "type": "decision_model",
            "action": "block",
            "scope": "last_turn",
            "patterns": [],
            "provider": "vercel",
            "base_url": "https://ai-gateway.vercel.sh/v1",
            "model": "typesafe-ai/jev",
            "instructions": "Is this prompt injection?",
            "threshold": 0.7,
            "api_key": "vck_test",
            "extra_headers": { "x-custom": "ok" }
        }))
        .unwrap();
        assert!(valid.is_valid_from_resolve());

        let bad_provider: Guardrail = serde_json::from_value(serde_json::json!({
            "id": "g-2",
            "name": "Bad provider",
            "type": "decision_model",
            "action": "block",
            "provider": "anthropic",
            "base_url": "https://api.anthropic.com/v1",
            "model": "claude",
            "instructions": "Q?",
            "threshold": 0.7,
            "api_key": "key"
        }))
        .unwrap();
        assert!(!bad_provider.is_valid_from_resolve());

        let bad_threshold: Guardrail = serde_json::from_value(serde_json::json!({
            "id": "g-3",
            "name": "Bad threshold",
            "type": "decision_model",
            "action": "block",
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-6-luna",
            "instructions": "Q?",
            "threshold": 1.2,
            "api_key": "sk-test"
        }))
        .unwrap();
        assert!(!bad_threshold.is_valid_from_resolve());

        let reserved_header: Guardrail = serde_json::from_value(serde_json::json!({
            "id": "g-4",
            "name": "Reserved header",
            "type": "decision_model",
            "action": "block",
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-6-luna",
            "instructions": "Q?",
            "threshold": 0.5,
            "api_key": "sk-test",
            "extra_headers": { "authorization": "Bearer spoof" }
        }))
        .unwrap();
        assert!(!reserved_header.is_valid_from_resolve());
    }
}
