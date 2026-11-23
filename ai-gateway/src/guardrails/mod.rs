//! Guardrails: patterns from the control plane checked against the last turn of a
//! request before it reaches the provider. A `block` guardrail that matches
//! refuses the request; a `log` guardrail that matches marks its generation. Each
//! API format's capture module finds the last turn (`capture::guardrail_last_turn`).
pub(crate) mod text;

use std::{
    collections::HashMap,
    ops::Range,
    sync::{Arc, LazyLock, Mutex, PoisonError},
};

use regex::bytes::{RegexSet, RegexSetBuilder};
use serde::{Deserialize, Serialize};

use crate::resolution::ApiFormat;

/// A guardrail assigned to the request's key, its user or its organization.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct Guardrail {
    pub id: String,
    pub name: String,
    pub action: GuardrailAction,
    /// Regex patterns; the guardrail matches when any of them does.
    pub patterns: Vec<String>,
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

/// Where the request parse found the members of `capture::guardrail_members`.
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

/// Compiled guardrails, keyed by their patterns. Every request of a key resolves
/// the same guardrails, so each compiles once and the check is a scan. Cleared
/// when full rather than evicted: sets are few and cheap to rebuild.
static COMPILED: LazyLock<Mutex<HashMap<Vec<String>, Arc<RegexSet>>>> =
    LazyLock::new(Mutex::default);
const MAX_COMPILED: usize = 1024;

/// Checks `body`'s last turn against `guardrails`. Guardrails fail open: one whose
/// patterns do not compile matches nothing. A conversation member that appears
/// twice is not a failure but a way to show the provider other text than the
/// gateway scans, so it matches every guardrail.
pub(crate) fn check(
    guardrails: &[Guardrail],
    api_format: ApiFormat,
    body: &[u8],
    scanned: &ScannedMembers,
) -> Outcome {
    let active = guardrails.iter().filter(|guardrail| {
        guardrail.action != GuardrailAction::Unknown && !guardrail.patterns.is_empty()
    });
    if active.clone().next().is_none() || crate::capture::guardrail_members(api_format).is_empty() {
        return Outcome::default();
    }
    let texts = if scanned.duplicated {
        Vec::new()
    } else {
        last_turn(api_format, body, scanned)
    };
    let findings = active
        .filter(|guardrail| {
            scanned.duplicated
                || compiled(&guardrail.patterns)
                    .is_some_and(|set| texts.iter().any(|text| set.is_match(text.as_bytes())))
        })
        .map(|guardrail| Finding {
            id: guardrail.id.clone(),
            name: guardrail.name.clone(),
            action: guardrail.action,
        })
        .collect();
    Outcome { findings }
}

fn last_turn<'a>(
    api_format: ApiFormat,
    body: &'a [u8],
    scanned: &ScannedMembers,
) -> Vec<std::borrow::Cow<'a, str>> {
    let member = |name: &str| {
        let (_, range) = scanned.members.iter().find(|(member, _)| *member == name)?;
        std::str::from_utf8(body.get(range.clone())?).ok()
    };
    let mut texts = Vec::new();
    crate::capture::guardrail_last_turn(api_format, member, &mut texts);
    texts
}

/// The patterns compiled in ASCII mode, so `\b` and `\d` stay on the fast DFA path
/// even when the text holds non-ASCII; `None` when a pattern does not compile.
fn compiled(patterns: &[String]) -> Option<Arc<RegexSet>> {
    let mut cache = COMPILED.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some(set) = cache.get(patterns) {
        return Some(Arc::clone(set));
    }
    let set = RegexSetBuilder::new(patterns)
        .unicode(false)
        .build()
        .inspect_err(|error| tracing::warn!(%error, "guardrail patterns failed to compile"))
        .ok()?;
    if cache.len() >= MAX_COMPILED {
        cache.clear();
    }
    let set = Arc::new(set);
    cache.insert(patterns.to_vec(), Arc::clone(&set));
    Some(set)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SSN: &str = r"\b\d{3}-\d{2}-\d{4}\b";
    const EMAIL: &str = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b";

    fn guardrail(id: &str, action: GuardrailAction, patterns: &[&str]) -> Guardrail {
        Guardrail {
            id: id.into(),
            name: format!("{id} name"),
            action,
            patterns: patterns
                .iter()
                .map(|pattern| (*pattern).to_owned())
                .collect(),
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
    fn only_guardrails_whose_patterns_match_the_last_turn_fire() {
        let body = r#"{"messages":[{"role":"user","content":"ssn 123-45-6789"},{"role":"assistant","content":"ok"},{"role":"user","content":"mail me at a@example.com"}]}"#;
        let outcome = check(
            &[
                guardrail("ssn", GuardrailAction::Block, &[SSN]),
                guardrail("email", GuardrailAction::Log, &[EMAIL]),
                guardrail("invalid", GuardrailAction::Block, &[r"(unclosed"]),
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
    fn a_duplicated_conversation_member_matches_every_guardrail() {
        let body = r#"{"messages":[{"role":"user","content":"hello"}]}"#;
        let mut members = scanned(body, &["messages"]);
        members.mark_duplicated();
        let outcome = check(
            &[guardrail("ssn", GuardrailAction::Block, &[SSN])],
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
