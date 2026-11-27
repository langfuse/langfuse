//! Lakera Guard v2 (`POST /v2/guard`) adapter authenticated with a Lakera API
//! key (`Authorization: Bearer`). A `flagged` verdict blocks or logs; all errors
//! and timeouts fail closed so unscreened prompts never bypass the guardrail.
use std::fmt;

use axum::body::Bytes;
use reqwest::{Body, Url};
use secrecy::SecretString;
use serde::{Deserialize, Serialize, Serializer};

use crate::guardrails::{
    external::{ExternalBlock, ExternalCallFailure, ExternalGuardrailClient, ExternalOutcome},
    text::Speaker,
};

const MAX_LAKERA_RESPONSE_BYTES: usize = 64 * 1024;
/// Lakera's per-request context cap on Enterprise plans; Community plans reject
/// smaller requests themselves, which fails closed like any other error.
const MAX_LAKERA_REQUEST_BYTES: usize = 1024 * 1024;
const BLOCK_SEPARATOR: &str = "\n\n";

/// Configuration for an external Lakera Guard project resolved from Web.
#[derive(Clone)]
pub(crate) struct LakeraGuardrail {
    pub region: String,
    pub project_id: Option<String>,
    pub api_key: SecretString,
}

impl fmt::Debug for LakeraGuardrail {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LakeraGuardrail")
            .field("region", &self.region)
            .field("project_id", &self.project_id)
            .finish_non_exhaustive()
    }
}

/// Regional Lakera Guard origin, or `None` for a region Lakera does not serve.
pub(crate) fn origin(region: &str) -> Option<&'static str> {
    match region {
        "eu" => Some("https://eu.api.lakera.ai"),
        "us" => Some("https://us.api.lakera.ai"),
        "ap-southeast-1" => Some("https://ap-southeast-1.api.lakera.ai"),
        _ => None,
    }
}

/// Serializes `blocks` into a Lakera Guard request body without `project_id`,
/// one message per run of blocks with the same role. Lakera trusts system
/// prompts, screens tool outputs as untrusted, and screens only the most recent
/// user and assistant content, so consecutive blocks of a role are screened
/// together. System prompts lead, as the model reads them first.
pub(crate) fn serialize_blocks(blocks: &[ExternalBlock<'_>]) -> Option<Bytes> {
    let is_system = |block: &&ExternalBlock<'_>| block.speaker == Speaker::System;
    let ordered: Vec<&ExternalBlock<'_>> = blocks
        .iter()
        .filter(is_system)
        .chain(blocks.iter().filter(|block| !is_system(block)))
        .collect();
    let messages: Vec<GuardMessage<'_>> = ordered
        .chunk_by(|left, right| left.speaker == right.speaker)
        .map(|run| GuardMessage {
            role: run
                .first()
                .map_or("user", |block| block.speaker.chat_role()),
            content: JoinedBlocks(run),
        })
        .collect();
    serde_json::to_vec(&GuardRequest { messages })
        .ok()
        .map(Bytes::from)
}

pub(crate) async fn evaluate_one(
    client: &ExternalGuardrailClient,
    langfuse_guardrail_id: &str,
    config: &LakeraGuardrail,
    payload: Bytes,
    organization_id: &str,
) -> ExternalOutcome {
    match screen(client, config, payload).await {
        Ok(outcome) => outcome,
        Err(failure) => failure.into_outcome(
            "lakera",
            langfuse_guardrail_id,
            organization_id,
            &config.region,
        ),
    }
}

async fn screen(
    client: &ExternalGuardrailClient,
    config: &LakeraGuardrail,
    payload: Bytes,
) -> Result<ExternalOutcome, ExternalCallFailure> {
    #[cfg(test)]
    let origin = client
        .origin_override
        .clone()
        .or_else(|| origin(&config.region).map(str::to_owned));
    #[cfg(not(test))]
    let origin = origin(&config.region);
    let url = origin
        .and_then(|origin| Url::parse(&format!("{origin}/v2/guard")).ok())
        .ok_or(ExternalCallFailure::InvalidUrl)?;
    let (body, content_length) = with_project_id(payload, config.project_id.as_deref())
        .ok_or(ExternalCallFailure::Serialization)?;
    if content_length > MAX_LAKERA_REQUEST_BYTES {
        return Err(ExternalCallFailure::RequestTooLarge);
    }
    let body = client
        .post_json(
            url,
            &config.api_key,
            body,
            content_length,
            MAX_LAKERA_RESPONSE_BYTES,
        )
        .await?;
    let parsed: GuardResponse =
        serde_json::from_slice(&body).map_err(|_| ExternalCallFailure::InvalidResponse)?;
    Ok(if parsed.flagged {
        ExternalOutcome::Blocked
    } else {
        ExternalOutcome::None
    })
}

/// Prepends `project_id` to the shared payload as a separate body chunk, so
/// guardrails screening the same text never copy it.
fn with_project_id(payload: Bytes, project_id: Option<&str>) -> Option<(Body, usize)> {
    let Some(project_id) = project_id else {
        let length = payload.len();
        return Some((payload.into(), length));
    };
    let mut prefix = br#"{"project_id":"#.to_vec();
    serde_json::to_writer(&mut prefix, project_id).ok()?;
    prefix.push(b',');
    let rest = payload.slice(1..);
    let length = prefix.len().saturating_add(rest.len());
    let chunks = [Bytes::from(prefix), rest].map(Ok::<_, std::io::Error>);
    Some((
        Body::wrap_stream(futures_util::stream::iter(chunks)),
        length,
    ))
}

#[derive(Serialize)]
struct GuardRequest<'a> {
    messages: Vec<GuardMessage<'a>>,
}

#[derive(Serialize)]
struct GuardMessage<'a> {
    role: &'static str,
    content: JoinedBlocks<'a>,
}

/// Serializes blocks as one JSON string without first joining them in memory.
struct JoinedBlocks<'a>(&'a [&'a ExternalBlock<'a>]);

impl fmt::Display for JoinedBlocks<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (index, block) in self.0.iter().enumerate() {
            if index > 0 {
                formatter.write_str(BLOCK_SEPARATOR)?;
            }
            formatter.write_str(block.text)?;
        }
        Ok(())
    }
}

impl Serialize for JoinedBlocks<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

#[derive(Deserialize)]
struct GuardResponse {
    flagged: bool,
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

    fn sample_guardrail(id: &str, project_id: Option<&str>) -> Guardrail {
        Guardrail {
            id: id.into(),
            name: id.into(),
            action: GuardrailAction::Block,
            scope: GuardrailScope::LastTurn,
            redaction_label: None,
            kind: GuardrailKind::External(ExternalGuardrail::Lakera(LakeraGuardrail {
                region: "eu".into(),
                project_id: project_id.map(str::to_owned),
                api_key: SecretString::from("lakera-api-key-secret"),
            })),
        }
    }

    #[test]
    fn debug_redacts_api_key() {
        let GuardrailKind::External(ExternalGuardrail::Lakera(config)) =
            sample_guardrail("g", Some("project-1")).kind
        else {
            unreachable!();
        };
        assert!(!format!("{config:?}").contains("lakera-api-key-secret"));
    }

    #[tokio::test]
    async fn screens_blocks_as_role_messages_with_project_id_and_maps_flagged_and_failures() {
        let server = crate::test_support::FakeServer::start(|request| async move {
            assert_eq!(request.method(), reqwest::Method::POST);
            assert_eq!(request.uri().path(), "/v2/guard");
            assert_eq!(
                request.headers().get(AUTHORIZATION).unwrap(),
                "Bearer lakera-api-key-secret"
            );
            let body = request.into_body().collect().await.unwrap().to_bytes();
            let mut json: serde_json::Value = serde_json::from_slice(&body).unwrap();
            let project_id = json
                .as_object_mut()
                .unwrap()
                .remove("project_id")
                .and_then(|value| value.as_str().map(str::to_owned));
            assert_eq!(
                json,
                serde_json::json!({
                    "messages": [
                        { "role": "system", "content": "Be brief." },
                        { "role": "user", "content": "hello\n\nworld \"quoted\"" },
                        { "role": "tool", "content": "42" }
                    ]
                })
            );
            match project_id.as_deref() {
                None => Response::new(Body::from(r#"{"flagged":false}"#)),
                Some("flagged") => Response::new(Body::from(
                    r#"{"flagged":true,"metadata":{"request_uuid":"r"}}"#,
                )),
                Some("throttled") => Response::builder()
                    .status(StatusCode::TOO_MANY_REQUESTS)
                    .body(Body::empty())
                    .unwrap(),
                Some("slow") => {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    Response::new(Body::from(r#"{"flagged":false}"#))
                }
                Some("malformed") => Response::new(Body::from(r#"{"metadata":{}}"#)),
                Some(_) => Response::builder()
                    .status(StatusCode::BAD_REQUEST)
                    .body(Body::from(r#"{"message":"too long"}"#))
                    .unwrap(),
            }
        })
        .await;

        let client =
            ExternalGuardrailClient::for_test(server.url.clone(), Duration::from_millis(80));
        let guardrails = [
            sample_guardrail("g1", None),
            sample_guardrail("g2", Some("flagged")),
            sample_guardrail("g3", Some("throttled")),
            sample_guardrail("g4", Some("slow")),
            sample_guardrail("g5", Some("malformed")),
            sample_guardrail("g6", Some("rejected")),
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
                // Anthropic's top-level `system` is read after its messages.
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
                ExternalOutcome::Failed(ExternalFailureKind::RateLimited),
                ExternalOutcome::Failed(ExternalFailureKind::Timeout),
                ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
                ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
            ]
        );
    }
}
