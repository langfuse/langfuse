//! Guardrails: patterns from the control plane checked against the last turn of a
//! request before it reaches the provider. A `block` guardrail that matches
//! refuses the request; a `log` guardrail that matches marks its generation. Each
//! API format's capture module finds the last turn (`capture::guardrail_turn`).
pub(crate) mod text;

use std::{
    ops::Range,
    sync::{Arc, LazyLock},
    time::Duration,
};

use quick_cache::{
    Weighter,
    sync::{Cache, GuardResult},
};
use regex_automata::{
    Input, MatchKind, PatternSet, meta, nfa::thompson::WhichCaptures, util::syntax,
};
use serde::{Deserialize, Serialize};

use crate::resolution::ApiFormat;
use text::{LastTurn, Unreadable};

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

/// Which side of the exchange a guardrail matched.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum GuardrailLocation {
    Request,
}

/// A guardrail that matched the exchange.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Finding {
    pub id: String,
    #[serde(skip)]
    pub name: String,
    pub action: GuardrailAction,
    pub location: GuardrailLocation,
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

/// A compiled regex set and, per pattern, the index of the guardrail it belongs to.
struct Matcher {
    regex: meta::Regex,
    owners: Vec<usize>,
}

/// The matchers for one set of guardrails, and the memory their regexes hold.
struct Compiled {
    matchers: Vec<Matcher>,
    bytes: u64,
}

/// Per guardrail, its patterns.
type GuardrailPatterns = Vec<Vec<String>>;

#[derive(Clone)]
struct CompiledWeight;

impl Weighter<GuardrailPatterns, Arc<Compiled>> for CompiledWeight {
    fn weight(&self, _: &GuardrailPatterns, compiled: &Arc<Compiled>) -> u64 {
        compiled.bytes
    }
}

/// Memory the cached regexes may hold in total; rarely used sets are evicted
/// first. Search caches, one per thread scanning a set, come on top.
const MAX_COMPILED_BYTES: u64 = 64 * 1024 * 1024;

/// Compiled matchers, keyed by the patterns of the guardrails they check. Every
/// request of a key resolves the same guardrails, so they compile once and the
/// check is a scan. A set compiles without blocking lookups of other sets.
static COMPILED: LazyLock<Cache<GuardrailPatterns, Arc<Compiled>, CompiledWeight>> =
    LazyLock::new(|| Cache::with_weighter(1024, MAX_COMPILED_BYTES, CompiledWeight));

/// Finds `body`'s last turn. A conversation the gateway cannot read the way a
/// provider might, such as a member or field that appears twice, is unreadable.
pub(crate) fn last_turn(
    api_format: ApiFormat,
    body: &[u8],
    scanned: &ScannedMembers,
) -> Result<LastTurn, Unreadable> {
    if scanned.duplicated {
        return Err(Unreadable);
    }
    crate::capture::guardrail_turn(api_format, member(body, scanned))
}

fn member<'a>(body: &'a [u8], scanned: &ScannedMembers) -> impl Fn(&str) -> Option<&'a str> {
    move |name| {
        let (_, range) = scanned.members.iter().find(|(member, _)| *member == name)?;
        std::str::from_utf8(body.get(range.clone())?).ok()
    }
}

/// Checks `turn`, found by [`last_turn`], against `guardrails`. Guardrails fail
/// open: one whose patterns do not compile matches nothing. An unreadable turn is
/// not a failure but a way to show the provider other text than the gateway scans,
/// so it matches every guardrail.
pub(crate) fn check(
    guardrails: &[Guardrail],
    body: &[u8],
    scanned: &ScannedMembers,
    turn: &Result<LastTurn, Unreadable>,
) -> Outcome {
    let active: Vec<&Guardrail> = guardrails
        .iter()
        .filter(|guardrail| {
            guardrail.action != GuardrailAction::Unknown && !guardrail.patterns.is_empty()
        })
        .collect();
    if active.is_empty() {
        return Outcome::default();
    }
    let compiled = compiled(&active);
    let mut matched = vec![false; active.len()];
    let mut found: Vec<PatternSet> = compiled
        .matchers
        .iter()
        .map(|matcher| PatternSet::new(matcher.regex.pattern_len()))
        .collect();
    let unreadable = turn.as_ref().map_or(true, |turn| {
        turn.read(member(body, scanned), &mut |text| {
            record_matches(&compiled.matchers, &mut found, &mut matched, text);
        })
        .is_err()
    });
    let findings = active
        .into_iter()
        .zip(matched)
        .filter(|(_, matched)| unreadable || *matched)
        .map(|(guardrail, _)| Finding {
            id: guardrail.id.clone(),
            name: guardrail.name.clone(),
            action: guardrail.action,
            location: GuardrailLocation::Request,
        })
        .collect();
    Outcome { findings }
}

/// One set over all guardrails' patterns, so each text is scanned once however
/// many guardrails apply. If it does not compile, one set per guardrail, so a bad
/// pattern only disables its own guardrail.
/// Marks the guardrails whose patterns match `text`.
fn record_matches(
    matchers: &[Matcher],
    found: &mut [PatternSet],
    matched: &mut [bool],
    text: &str,
) {
    for (matcher, found) in matchers.iter().zip(found) {
        found.clear();
        matcher
            .regex
            .which_overlapping_matches(&Input::new(text.as_bytes()), found);
        for pattern in found.iter() {
            if let Some(owner) = matcher
                .owners
                .get(pattern.as_usize())
                .and_then(|owner| matched.get_mut(*owner))
            {
                *owner = true;
            }
        }
    }
}

fn compiled(active: &[&Guardrail]) -> Arc<Compiled> {
    let key: GuardrailPatterns = active
        .iter()
        .map(|guardrail| guardrail.patterns.clone())
        .collect();
    // A request that finds the set being compiled elsewhere compiles its own copy
    // rather than parking its thread, which may be an async worker, until then.
    match COMPILED.get_value_or_guard(&key, Some(Duration::ZERO)) {
        GuardResult::Value(compiled) => compiled,
        GuardResult::Guard(guard) => {
            let compiled = compile(&key);
            let _ = guard.insert(Arc::clone(&compiled));
            compiled
        }
        GuardResult::Timeout => compile(&key),
    }
}

fn compile(key: &GuardrailPatterns) -> Arc<Compiled> {
    let owned_patterns = |owners: &[usize]| -> Vec<(usize, &String)> {
        owners
            .iter()
            .filter_map(|owner| key.get(*owner).map(|patterns| (*owner, patterns)))
            .flat_map(|(owner, patterns)| patterns.iter().map(move |pattern| (owner, pattern)))
            .collect()
    };
    let all: Vec<usize> = (0..key.len()).collect();
    let matchers: Vec<Matcher> = match matcher(&owned_patterns(&all)) {
        Some(combined) => vec![combined],
        None => all
            .iter()
            .filter_map(|owner| matcher(&owned_patterns(std::slice::from_ref(owner))))
            .collect(),
    };
    let pattern_bytes: usize = key.iter().flatten().map(String::len).sum();
    let regex_bytes: usize = matchers
        .iter()
        .map(|matcher| matcher.regex.memory_usage())
        .sum();
    // At least one, since entries weighing nothing are never evicted.
    let bytes = u64::try_from(pattern_bytes + regex_bytes)
        .unwrap_or(u64::MAX)
        .max(1);
    Arc::new(Compiled { matchers, bytes })
}

/// The patterns compiled in ASCII mode, so `\b` and `\d` stay on the fast DFA path
/// even when the text holds non-ASCII; `None` when a pattern does not compile.
/// Configured like `regex::bytes::RegexSet`: every pattern that matches is reported.
fn matcher(patterns: &[(usize, &String)]) -> Option<Matcher> {
    let regex = meta::Builder::new()
        .configure(
            meta::Config::new()
                .match_kind(MatchKind::All)
                .utf8_empty(false)
                .which_captures(WhichCaptures::None),
        )
        .syntax(syntax::Config::new().unicode(false).utf8(false))
        .build_many(
            &patterns
                .iter()
                .map(|(_, pattern)| pattern.as_str())
                .collect::<Vec<_>>(),
        )
        .inspect_err(|error| tracing::warn!(%error, "guardrail patterns failed to compile"))
        .ok()?;
    Some(Matcher {
        regex,
        owners: patterns.iter().map(|(owner, _)| *owner).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check_request(
        guardrails: &[Guardrail],
        api_format: ApiFormat,
        body: &[u8],
        scanned: &ScannedMembers,
    ) -> Outcome {
        check(
            guardrails,
            body,
            scanned,
            &last_turn(api_format, body, scanned),
        )
    }

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
        let outcome = check_request(
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
                location: GuardrailLocation::Request,
            }]
        );
    }

    #[test]
    fn one_combined_scan_reports_each_matching_guardrail() {
        let body = r#"{"messages":[{"role":"user","content":"ssn 123-45-6789"}]}"#;
        let outcome = check_request(
            &[
                guardrail("email", GuardrailAction::Log, &[EMAIL]),
                guardrail("ssn", GuardrailAction::Block, &[EMAIL, SSN]),
            ],
            ApiFormat::OpenAiChatCompletions,
            body.as_bytes(),
            &scanned(body, &["messages"]),
        );
        let ids: Vec<String> = outcome
            .into_findings()
            .into_iter()
            .map(|finding| finding.id)
            .collect();
        assert_eq!(ids, ["ssn"]);
    }

    #[test]
    fn a_message_with_a_duplicated_field_matches_every_guardrail() {
        let body = r#"{"messages":[{"role":"user","role":"user","content":"123-45-6789"}]}"#;
        let outcome = check_request(
            &[guardrail("email", GuardrailAction::Block, &[EMAIL])],
            ApiFormat::OpenAiChatCompletions,
            body.as_bytes(),
            &scanned(body, &["messages"]),
        );
        assert_eq!(
            outcome.blocking().map(|finding| finding.id.as_str()),
            Some("email")
        );
    }

    #[test]
    fn decisions_input_is_scanned() {
        let body = r#"{"input":[{"role":"user","content":[{"type":"input_text","text":"ssn 123-45-6789"}]}]}"#;
        let outcome = check_request(
            &[guardrail("ssn", GuardrailAction::Block, &[SSN])],
            ApiFormat::OpenAiDecisions,
            body.as_bytes(),
            &scanned(body, &["input"]),
        );
        assert_eq!(
            outcome.blocking().map(|finding| finding.id.as_str()),
            Some("ssn")
        );
    }

    #[test]
    fn a_duplicated_conversation_member_matches_every_guardrail() {
        let body = r#"{"messages":[{"role":"user","content":"hello"}]}"#;
        let mut members = scanned(body, &["messages"]);
        members.mark_duplicated();
        let outcome = check_request(
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
