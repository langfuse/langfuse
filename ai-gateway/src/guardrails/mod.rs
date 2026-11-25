//! Guardrails: rules from the control plane checked against the last turn of a
//! request before it reaches the provider. A `block` guardrail that matches
//! refuses the request; a `log` guardrail that matches marks its generation. Each
//! API format's capture module finds the last turn (`capture::guardrail_turn`).
pub(crate) mod bedrock;
pub(crate) mod external;
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
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Deserializer, Serialize, de::Error as _};
use tokio::sync::Semaphore;
use tracing::Instrument;

use crate::{
    cpu::{CpuJob, CpuWork},
    http::ParsedRequest,
    inference::MemoryReservation,
    providers::OutboundPolicy,
    resolution::{ApiFormat, ResolutionError, ResolvedRequestContext},
};
use bedrock::BedrockGuardrail;
use external::{ExternalGuardrailClient, ExternalPayloads};
use text::{LastTurn, Unreadable};

/// Evaluates local regex and external provider guardrails against a request's
/// last turn, keeping CPU work off the async workers and reserving memory for
/// external prompt copies.
pub(crate) struct Guardrails {
    external: ExternalGuardrailClient,
    cpu: CpuWork,
    memory_budget: Arc<Semaphore>,
}

impl Guardrails {
    pub(crate) fn new(
        policy: OutboundPolicy,
        external_timeout: Duration,
        cpu: CpuWork,
        memory_budget: Arc<Semaphore>,
    ) -> Result<Self, ResolutionError> {
        Ok(Self {
            external: ExternalGuardrailClient::new(policy, external_timeout)?,
            cpu,
            memory_budget,
        })
    }

    /// Scans the request's last turn with the guardrails resolved for its key.
    /// Finding the last turn reads the whole conversation; the scan reads only
    /// the last turn, so each step leaves the async worker based on what it reads.
    /// External guardrails run concurrently after local regexes unless a local
    /// `block` rule already matched.
    pub(crate) async fn check(
        &self,
        api_format: ApiFormat,
        context: &ResolvedRequestContext,
        request: &ParsedRequest,
    ) -> Result<Outcome, ResolutionError> {
        if !context.guardrails().iter().any(Guardrail::is_active) {
            return Ok(Outcome::default());
        }
        let guardrails: Arc<[Guardrail]> = context.guardrails().into();
        let organization_id = context.attribution().organization_id().as_str().to_owned();
        let body = request.body().clone();
        let scanned = request.scanned.clone();
        async move {
            let (turn, finding) = self
                .cpu
                .run(CpuJob::FindLastTurn, scanned.len(), {
                    let body = body.clone();
                    let scanned = scanned.clone();
                    move || {
                        let started = std::time::Instant::now();
                        let turn = last_turn(api_format, &body, &scanned);
                        (turn, started.elapsed())
                    }
                })
                .await
                .ok_or(ResolutionError::Busy)?;
            let bytes = turn.as_ref().map_or(0, LastTurn::bytes);
            let has_external = guardrails.iter().any(Guardrail::is_external);
            let turn_text_reservation = (has_external && bytes > 0)
                .then(|| MemoryReservation::try_reserve(&self.memory_budget, bytes, "guardrails"))
                .transpose()?;
            let (mut local, scanning) = self
                .cpu
                .run(CpuJob::ScanGuardrails, bytes, {
                    let guardrails = Arc::clone(&guardrails);
                    move || {
                        let started = std::time::Instant::now();
                        let local = scan_local(&guardrails, &body, &scanned, &turn);
                        (local, started.elapsed())
                    }
                })
                .await
                .ok_or(ResolutionError::Busy)?;
            let turn_text = local.take_turn_text();
            let mut total_duration = finding + scanning;
            let external_matches = if !local.is_unreadable()
                && !local.has_local_block(&guardrails)
                && !turn_text.is_empty()
            {
                let (matches, elapsed) = self
                    .evaluate_external(
                        &local.external_targets(&guardrails),
                        turn_text,
                        turn_text_reservation,
                        bytes,
                        &organization_id,
                    )
                    .await?;
                total_duration += elapsed;
                matches
            } else {
                drop(turn_text);
                drop(turn_text_reservation);
                Vec::new()
            };
            crate::observability::guardrails_checked(&organization_id, total_duration, bytes);
            Ok(local.into_outcome(&guardrails, &external_matches))
        }
        .instrument(tracing::info_span!(
            "request.guardrails",
            otel.kind = "internal"
        ))
        .await
    }

    async fn evaluate_external(
        &self,
        targets: &[(usize, &Guardrail)],
        turn_text: String,
        turn_text_reservation: Option<MemoryReservation>,
        turn_bytes: usize,
        organization_id: &str,
    ) -> Result<(Vec<(usize, bool)>, Duration), ResolutionError> {
        if targets.is_empty() {
            drop(turn_text);
            drop(turn_text_reservation);
            return Ok((Vec::new(), Duration::ZERO));
        }
        // Reserve for the serialized provider payload while `turn_text` is
        // still live, then release `turn_text` and its budget before awaiting I/O.
        let payload_reservation = MemoryReservation::try_reserve(
            &self.memory_budget,
            turn_bytes.saturating_add(64),
            "guardrails",
        )?;
        let guardrails: Vec<&Guardrail> = targets.iter().map(|(_, guardrail)| *guardrail).collect();
        let payloads = ExternalPayloads::serialize(&guardrails, &turn_text);
        drop(turn_text);
        drop(turn_text_reservation);
        let started = std::time::Instant::now();
        let results = self
            .external
            .evaluate_many(&guardrails, &payloads, organization_id)
            .await;
        let elapsed = started.elapsed();
        drop(payload_reservation);
        let matches = targets
            .iter()
            .zip(results)
            .map(|((slot, _), matched)| (*slot, matched))
            .collect();
        Ok((matches, elapsed))
    }

    #[cfg(test)]
    pub(crate) fn with_external(mut self, external: ExternalGuardrailClient) -> Self {
        self.external = external;
        self
    }

    #[cfg(test)]
    pub(crate) fn set_memory_budget(&mut self, memory_budget: Arc<Semaphore>) {
        self.memory_budget = memory_budget;
    }
}

/// Provider-specific configuration of a resolved guardrail.
#[derive(Clone, Debug)]
pub(crate) enum GuardrailKind {
    Regex {
        patterns: Vec<String>,
    },
    Bedrock(BedrockGuardrail),
    /// Control plane could not decrypt or validate a fail-closed guardrail;
    /// always matches so the gateway enforces its action without forwarding
    /// unscreened requests.
    FailClosed,
    /// A guardrail type this gateway does not know skips the guardrail rather
    /// than failing resolution, so Web can add types before every gateway upgrades.
    Unknown,
}

/// A guardrail assigned to the request's key, its user or its organization.
#[derive(Clone, Debug)]
pub(crate) struct Guardrail {
    pub id: String,
    pub name: String,
    pub action: GuardrailAction,
    pub kind: GuardrailKind,
}

impl Guardrail {
    fn is_active(&self) -> bool {
        if self.action == GuardrailAction::Unknown {
            return false;
        }
        match &self.kind {
            GuardrailKind::Regex { patterns } => !patterns.is_empty(),
            GuardrailKind::Bedrock(_) | GuardrailKind::FailClosed => true,
            GuardrailKind::Unknown => false,
        }
    }

    pub(crate) fn is_valid_from_resolve(&self) -> bool {
        match &self.kind {
            GuardrailKind::Regex { .. } | GuardrailKind::FailClosed | GuardrailKind::Unknown => {
                true
            }
            GuardrailKind::Bedrock(config) => {
                crate::resolution::bedrock::is_aws_region(&config.region)
                    && crate::resolution::bedrock::is_guardrail_id(&config.guardrail_id)
                    && crate::resolution::bedrock::is_guardrail_version(&config.guardrail_version)
                    && crate::resolution::valid_token(config.api_key.expose_secret())
            }
        }
    }

    fn regex_patterns(&self) -> Option<&[String]> {
        match &self.kind {
            GuardrailKind::Regex { patterns } => Some(patterns),
            GuardrailKind::Bedrock(_) | GuardrailKind::FailClosed | GuardrailKind::Unknown => None,
        }
    }

    fn is_external(&self) -> bool {
        self.is_active() && matches!(self.kind, GuardrailKind::Bedrock(_))
    }
}

impl<'de> Deserialize<'de> for Guardrail {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct RawGuardrail {
            id: String,
            name: String,
            action: GuardrailAction,
            #[serde(rename = "type", default)]
            kind: Option<String>,
            #[serde(default)]
            patterns: Vec<String>,
            #[serde(default)]
            guardrail_id: Option<String>,
            #[serde(default)]
            guardrail_version: Option<String>,
            #[serde(default)]
            region: Option<String>,
            #[serde(default)]
            api_key: Option<SecretString>,
        }

        let raw = RawGuardrail::deserialize(deserializer)?;
        let kind = match raw.kind.as_deref() {
            // Absent `type` preserves compatibility with Web builds predating external guardrails.
            None | Some("regex") => GuardrailKind::Regex {
                patterns: raw.patterns,
            },
            Some("bedrock") => GuardrailKind::Bedrock(BedrockGuardrail {
                guardrail_id: raw
                    .guardrail_id
                    .ok_or_else(|| D::Error::missing_field("guardrail_id"))?,
                guardrail_version: raw
                    .guardrail_version
                    .ok_or_else(|| D::Error::missing_field("guardrail_version"))?,
                region: raw
                    .region
                    .ok_or_else(|| D::Error::missing_field("region"))?,
                api_key: raw
                    .api_key
                    .ok_or_else(|| D::Error::missing_field("api_key"))?,
            }),
            Some("fail_closed") => GuardrailKind::FailClosed,
            Some(_) => GuardrailKind::Unknown,
        };
        Ok(Self {
            id: raw.id,
            name: raw.name,
            action: raw.action,
            kind,
        })
    }
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
fn last_turn(
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

/// Result of the CPU-bound local pass: regex matches plus the last turn's text
/// when external guardrails also need to evaluate it.
struct LocalScan {
    active_indices: Vec<usize>,
    matched: Vec<bool>,
    unreadable: bool,
    turn_text: String,
}

impl LocalScan {
    fn is_unreadable(&self) -> bool {
        self.unreadable
    }

    fn has_local_block(&self, guardrails: &[Guardrail]) -> bool {
        self.active_indices
            .iter()
            .zip(&self.matched)
            .any(|(&index, &matched)| {
                matched
                    && guardrails
                        .get(index)
                        .is_some_and(|guardrail| guardrail.action == GuardrailAction::Block)
            })
    }

    fn external_targets<'a>(&self, guardrails: &'a [Guardrail]) -> Vec<(usize, &'a Guardrail)> {
        self.active_indices
            .iter()
            .enumerate()
            .filter_map(|(slot, &index)| {
                let guardrail = guardrails.get(index)?;
                guardrail.is_external().then_some((slot, guardrail))
            })
            .collect()
    }

    fn take_turn_text(&mut self) -> String {
        std::mem::take(&mut self.turn_text)
    }

    fn into_outcome(
        mut self,
        guardrails: &[Guardrail],
        external_matches: &[(usize, bool)],
    ) -> Outcome {
        for &(slot, matched) in external_matches {
            if matched && let Some(entry) = self.matched.get_mut(slot) {
                *entry = true;
            }
        }
        let findings = self
            .active_indices
            .into_iter()
            .zip(self.matched)
            .filter(|(_, matched)| self.unreadable || *matched)
            .filter_map(|(index, _)| {
                let guardrail = guardrails.get(index)?;
                Some(Finding {
                    id: guardrail.id.clone(),
                    name: guardrail.name.clone(),
                    action: guardrail.action,
                    location: GuardrailLocation::Request,
                })
            })
            .collect();
        Outcome { findings }
    }
}

/// Runs the local regex guardrails against `turn` and, when any active external
/// guardrail is present, collects the last turn's text in the same pass.
/// Regex guardrails fail open: a regex whose patterns do not compile matches
/// nothing. Fail-closed guardrails always match.
/// An unreadable turn is not a failure but a way to show the provider other text
/// than the gateway scans, so it matches every active guardrail.
fn scan_local(
    guardrails: &[Guardrail],
    body: &[u8],
    scanned: &ScannedMembers,
    turn: &Result<LastTurn, Unreadable>,
) -> LocalScan {
    let active_indices: Vec<usize> = guardrails
        .iter()
        .enumerate()
        .filter_map(|(index, guardrail)| guardrail.is_active().then_some(index))
        .collect();
    if active_indices.is_empty() {
        return LocalScan {
            active_indices,
            matched: Vec::new(),
            unreadable: false,
            turn_text: String::new(),
        };
    }
    let regex_slots: Vec<(usize, &[String])> = active_indices
        .iter()
        .enumerate()
        .filter_map(|(slot, &index)| {
            let patterns = guardrails.get(index)?.regex_patterns()?;
            Some((slot, patterns))
        })
        .collect();
    let collect_text = active_indices
        .iter()
        .any(|&index| guardrails.get(index).is_some_and(Guardrail::is_external));

    let compiled = (!regex_slots.is_empty()).then(|| compiled(&regex_slots));
    let mut regex_matched = vec![false; regex_slots.len()];
    let mut found: Vec<PatternSet> = compiled
        .as_ref()
        .map(|compiled| {
            compiled
                .matchers
                .iter()
                .map(|matcher| PatternSet::new(matcher.regex.pattern_len()))
                .collect()
        })
        .unwrap_or_default();
    let mut turn_text = String::new();
    let unreadable = turn.as_ref().map_or(true, |turn| {
        turn.read(member(body, scanned), &mut |text| {
            if let Some(compiled) = &compiled {
                record_matches(&compiled.matchers, &mut found, &mut regex_matched, text);
            }
            if collect_text && !text.is_empty() {
                if !turn_text.is_empty() {
                    turn_text.push('\n');
                }
                turn_text.push_str(text);
            }
        })
        .is_err()
    });
    let mut matched: Vec<bool> = active_indices
        .iter()
        .map(|&index| {
            matches!(
                guardrails.get(index).map(|guardrail| &guardrail.kind),
                Some(GuardrailKind::FailClosed)
            )
        })
        .collect();
    for ((slot, _), is_match) in regex_slots.into_iter().zip(regex_matched) {
        if is_match && let Some(entry) = matched.get_mut(slot) {
            *entry = true;
        }
    }
    LocalScan {
        active_indices,
        matched,
        unreadable,
        turn_text,
    }
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

fn compiled(active: &[(usize, &[String])]) -> Arc<Compiled> {
    let key: GuardrailPatterns = active
        .iter()
        .map(|(_, patterns)| (*patterns).to_vec())
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
        scan_local(
            guardrails,
            body,
            scanned,
            &last_turn(api_format, body, scanned),
        )
        .into_outcome(guardrails, &[])
    }

    const SSN: &str = r"\b\d{3}-\d{2}-\d{4}\b";
    const EMAIL: &str = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b";

    fn guardrail(id: &str, action: GuardrailAction, patterns: &[&str]) -> Guardrail {
        Guardrail {
            id: id.into(),
            name: format!("{id} name"),
            action,
            kind: GuardrailKind::Regex {
                patterns: patterns
                    .iter()
                    .map(|pattern| (*pattern).to_owned())
                    .collect(),
            },
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
