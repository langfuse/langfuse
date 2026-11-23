//! Guardrails: built-in rules checked against the last turn of a request before it
//! reaches the provider. A `block` guardrail that matches refuses the request; a
//! `log` guardrail that matches marks its generation. Each API format names the
//! members holding the conversation and finds the last turn in them.
mod anthropic_messages;
mod chat_completions;
mod embeddings;
mod presets;
mod responses;
mod text;

use std::{borrow::Cow, ops::Range};

use serde::{Deserialize, Serialize};

use crate::resolution::ApiFormat;
use presets::{Matches, Preset};

/// A guardrail assigned to the request's key, its user or its organization.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct Guardrail {
    pub id: String,
    pub name: String,
    pub action: GuardrailAction,
    pub presets: Vec<Preset>,
}

/// An action this gateway does not know skips the guardrail rather than failing
/// resolution, so Web can add actions before every gateway supports them.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum GuardrailAction {
    Block,
    Log,
    #[serde(other)]
    #[serde(skip_serializing)]
    Unknown,
}

/// The top-level members of the format that hold the conversation.
pub(crate) fn scanned_members(api_format: ApiFormat) -> &'static [&'static str] {
    match api_format {
        ApiFormat::OpenAiChatCompletions => chat_completions::MEMBERS,
        ApiFormat::OpenAiResponses => responses::MEMBERS,
        ApiFormat::AnthropicMessages => anthropic_messages::MEMBERS,
        ApiFormat::OpenAiEmbeddings => embeddings::MEMBERS,
        ApiFormat::OpenAiDecisions => &[],
    }
}

/// Where the request parse found the members of `scanned_members`.
#[derive(Clone, Debug, Default)]
pub(crate) struct ScannedMembers {
    members: Vec<(&'static str, Range<usize>)>,
    /// A member appeared twice; parsers disagree on which one the provider reads.
    duplicated: bool,
}

impl ScannedMembers {
    pub(crate) fn push(&mut self, name: &'static str, range: Range<usize>) {
        self.members.push((name, range));
    }

    pub(crate) fn mark_duplicated(&mut self) {
        self.duplicated = true;
    }

    /// Bytes of the members, which decides whether the check leaves the async worker.
    pub(crate) fn len(&self) -> usize {
        self.members.iter().map(|(_, range)| range.len()).sum()
    }
}

/// A guardrail that matched the request.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Finding {
    pub id: String,
    #[serde(skip)]
    pub name: String,
    pub action: GuardrailAction,
}

/// The guardrails a request matched, in resolution order.
#[derive(Debug, Default)]
pub(crate) struct Outcome {
    findings: Vec<Finding>,
}

impl Outcome {
    /// The first matching `block` guardrail.
    pub(crate) fn blocking(&self) -> Option<&Finding> {
        self.findings
            .iter()
            .find(|finding| finding.action == GuardrailAction::Block)
    }

    pub(crate) fn into_findings(self) -> Vec<Finding> {
        self.findings
    }
}

/// Checks `body`'s last turn against `guardrails`. A request that cannot be
/// scanned, because a conversation member appears twice or the rules failed to
/// compile, counts as matching every guardrail, so `block` guardrails fail closed.
pub(crate) fn check(
    guardrails: &[Guardrail],
    api_format: ApiFormat,
    body: &[u8],
    scanned: &ScannedMembers,
) -> Outcome {
    let active: Vec<(&Guardrail, Matches)> = guardrails
        .iter()
        .filter(|guardrail| guardrail.action != GuardrailAction::Unknown)
        .map(|guardrail| (guardrail, Matches::of(&guardrail.presets)))
        .filter(|(_, matches)| !matches.is_empty())
        .collect();
    if active.is_empty() || scanned_members(api_format).is_empty() {
        return Outcome::default();
    }
    let matched = if scanned.duplicated {
        Matches::ALL
    } else {
        let wanted = active
            .iter()
            .fold(Matches::default(), |wanted, (_, matches)| {
                wanted.union(*matches)
            });
        let texts = last_turn(api_format, body, scanned);
        presets::scan(texts.iter().map(AsRef::as_ref), wanted).unwrap_or(Matches::ALL)
    };
    Outcome {
        findings: active
            .into_iter()
            .filter(|(_, matches)| matches.intersects(matched))
            .map(|(guardrail, _)| Finding {
                id: guardrail.id.clone(),
                name: guardrail.name.clone(),
                action: guardrail.action,
            })
            .collect(),
    }
}

fn last_turn<'a>(
    api_format: ApiFormat,
    body: &'a [u8],
    scanned: &ScannedMembers,
) -> Vec<Cow<'a, str>> {
    let member = |name: &str| {
        let (_, range) = scanned.members.iter().find(|(member, _)| *member == name)?;
        std::str::from_utf8(body.get(range.clone())?).ok()
    };
    let mut texts = Vec::new();
    match api_format {
        ApiFormat::OpenAiChatCompletions => chat_completions::last_turn(member, &mut texts),
        ApiFormat::OpenAiResponses => responses::last_turn(member, &mut texts),
        ApiFormat::AnthropicMessages => anthropic_messages::last_turn(member, &mut texts),
        ApiFormat::OpenAiEmbeddings => embeddings::last_turn(member, &mut texts),
        ApiFormat::OpenAiDecisions => {}
    }
    texts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn guardrail(id: &str, action: GuardrailAction, presets: &[Preset]) -> Guardrail {
        Guardrail {
            id: id.into(),
            name: format!("{id} name"),
            action,
            presets: presets.to_vec(),
        }
    }

    fn scanned(body: &str, members: &[&'static str]) -> ScannedMembers {
        let parsed: std::collections::BTreeMap<&str, &serde_json::value::RawValue> =
            serde_json::from_str(body).unwrap();
        let mut scanned = ScannedMembers::default();
        for name in members {
            let value = parsed[name].get();
            let start = value.as_ptr().addr() - body.as_ptr().addr();
            scanned.push(name, start..start + value.len());
        }
        scanned
    }

    #[test]
    fn only_guardrails_whose_presets_match_the_last_turn_fire() {
        let body = r#"{"messages":[{"role":"user","content":"ssn 123-45-6789"},{"role":"assistant","content":"ok"},{"role":"user","content":"mail me at a@example.com"}]}"#;
        let outcome = check(
            &[
                guardrail("ssn", GuardrailAction::Block, &[Preset::UsSsn]),
                guardrail("email", GuardrailAction::Log, &[Preset::Email]),
                guardrail("unknown", GuardrailAction::Block, &[Preset::Unknown]),
            ],
            ApiFormat::OpenAiChatCompletions,
            body.as_bytes(),
            &scanned(body, &["messages"]),
        );
        assert!(outcome.blocking().is_none());
        assert_eq!(
            outcome.into_findings(),
            [Finding {
                id: "email".into(),
                name: "email name".into(),
                action: GuardrailAction::Log,
            }]
        );
    }

    #[test]
    fn an_unscannable_request_matches_every_guardrail() {
        let body = r#"{"messages":[{"role":"user","content":"hello"}]}"#;
        let mut members = scanned(body, &["messages"]);
        members.mark_duplicated();
        let outcome = check(
            &[guardrail("ssn", GuardrailAction::Block, &[Preset::UsSsn])],
            ApiFormat::OpenAiChatCompletions,
            body.as_bytes(),
            &members,
        );
        assert_eq!(
            outcome.blocking().map(|finding| finding.id.as_str()),
            Some("ssn")
        );
    }
}
