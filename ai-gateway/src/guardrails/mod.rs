//! Guardrails: rules from the control plane checked against the last turn of a
//! request before it reaches the provider. A `block` guardrail that matches
//! refuses the request; a `log` guardrail that matches marks its generation; a
//! `redact` guardrail replaces matched spans in the request before forwarding.
//! Each API format's capture module finds the last turn (`capture::guardrail_turn`).
pub(crate) mod bedrock;
pub(crate) mod external;
pub(crate) mod redact;
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
use external::{ExternalGuardrailClient, ExternalMatch, ExternalOutcome, ExternalPayloads};
use redact::{BodyEdit, RedactionSpan};
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
            let has_local_redact = guardrails.iter().any(Guardrail::is_local_redact);
            let scan_bytes = if has_local_redact {
                scanned.len()
            } else {
                bytes
            };
            let has_external = guardrails.iter().any(Guardrail::is_external);
            let mut turn_text_reservation = (has_external && bytes > 0)
                .then(|| MemoryReservation::from_budget(&self.memory_budget, bytes, "guardrails"))
                .transpose()?;
            let (local, scanning) = self
                .cpu
                .run(CpuJob::ScanGuardrails, scan_bytes, {
                    let guardrails = Arc::clone(&guardrails);
                    let budget = Arc::clone(&self.memory_budget);
                    move || {
                        let started = std::time::Instant::now();
                        let local = scan_local(&guardrails, &body, &scanned, &turn, Some(&budget));
                        (local, started.elapsed())
                    }
                })
                .await
                .ok_or(ResolutionError::Busy)?;
            let mut local = local?;
            let mut total_duration = finding + scanning;
            let external_outcomes = if !local.is_unreadable()
                && !local.has_local_block(&guardrails)
                && local.has_external_input()
            {
                let (outcomes, elapsed) = self
                    .evaluate_external(
                        &local.external_targets(&guardrails),
                        &mut local,
                        &mut turn_text_reservation,
                        bytes,
                        &organization_id,
                    )
                    .await?;
                total_duration += elapsed;
                outcomes
            } else {
                drop(turn_text_reservation);
                Vec::new()
            };
            let (outcome, finalizing) = if local.has_external_leaves() {
                self.cpu
                    .run(CpuJob::ScanGuardrails, bytes, {
                        let guardrails = Arc::clone(&guardrails);
                        let budget = Arc::clone(&self.memory_budget);
                        move || {
                            let started = std::time::Instant::now();
                            let outcome =
                                local.into_outcome(&guardrails, &external_outcomes, Some(&budget));
                            (outcome, started.elapsed())
                        }
                    })
                    .await
                    .ok_or(ResolutionError::Busy)?
            } else {
                let started = std::time::Instant::now();
                let outcome =
                    local.into_outcome(&guardrails, &external_outcomes, Some(&self.memory_budget));
                (outcome, started.elapsed())
            };
            total_duration += finalizing;
            let outcome = outcome?;
            crate::observability::guardrails_checked(&organization_id, total_duration, bytes);
            Ok(outcome)
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
        local: &mut LocalScan,
        turn_text_reservation: &mut Option<MemoryReservation>,
        turn_bytes: usize,
        organization_id: &str,
    ) -> Result<(Vec<(usize, ExternalOutcome)>, Duration), ResolutionError> {
        if targets.is_empty() {
            local.clear_turn_text();
            drop(turn_text_reservation.take());
            return Ok((Vec::new(), Duration::ZERO));
        }
        let guardrails: Vec<&Guardrail> = targets.iter().map(|(_, guardrail)| *guardrail).collect();
        let has_external_redact = !local.external_leaves.is_empty();
        // Reserve for the serialized provider payload while the prompt text is
        // still live. When no external `redact` rule needs the original leaves
        // after I/O, drop `turn_text` and its reservation before awaiting I/O.
        let payload_reservation = MemoryReservation::from_budget(
            &self.memory_budget,
            turn_bytes.saturating_add(64),
            "guardrails",
        )?;
        let payloads = if has_external_redact {
            serialize_external_leaves(&guardrails, &local.external_leaves)
        } else {
            let turn_text = local.take_turn_text();
            let payloads = ExternalPayloads::for_guardrails(&guardrails, &[turn_text.as_str()]);
            drop(turn_text);
            drop(turn_text_reservation.take());
            payloads
        };
        let started = std::time::Instant::now();
        let results = self
            .external
            .evaluate_many(&guardrails, &payloads, organization_id)
            .await;
        let elapsed = started.elapsed();
        drop(payload_reservation);
        let outcomes = targets
            .iter()
            .zip(results)
            .map(|((slot, _), outcome)| (*slot, outcome))
            .collect();
        Ok((outcomes, elapsed))
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

fn serialize_external_leaves(
    guardrails: &[&Guardrail],
    leaves: &[ExternalLeaf],
) -> ExternalPayloads {
    if leaves.len() <= bedrock::MAX_BEDROCK_CONTENT_BLOCKS {
        let blocks: Vec<&str> = leaves.iter().map(|leaf| leaf.text.as_str()).collect();
        return ExternalPayloads::for_guardrails(guardrails, &blocks);
    }
    let total = leaves.iter().map(|leaf| leaf.text.len() + 1).sum();
    let mut joined = String::with_capacity(total);
    for leaf in leaves {
        if !joined.is_empty() {
            joined.push('\n');
        }
        joined.push_str(&leaf.text);
    }
    ExternalPayloads::for_guardrails(guardrails, &[joined.as_str()])
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
    pub redaction_label: Option<String>,
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
                    && !config.guardrail_id.trim().is_empty()
                    && !config.guardrail_version.trim().is_empty()
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

    fn is_external_redact(&self) -> bool {
        self.is_external() && self.action == GuardrailAction::Redact
    }

    fn is_local_redact(&self) -> bool {
        self.is_active()
            && self.action == GuardrailAction::Redact
            && self.regex_patterns().is_some()
    }

    fn redaction_label(&self) -> &str {
        self.redaction_label
            .as_deref()
            .filter(|label| !label.is_empty())
            .unwrap_or(redact::DEFAULT_REDACTION_LABEL)
    }
}

impl<'de> Deserialize<'de> for Guardrail {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct RawGuardrail {
            id: String,
            name: String,
            action: GuardrailAction,
            #[serde(default)]
            redaction_label: Option<String>,
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
            redaction_label: raw.redaction_label,
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
    Redact,
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

/// The guardrails a request matched, in resolution order, together with any
/// request body edits produced by `redact` guardrails.
#[derive(Default)]
pub(crate) struct Outcome {
    findings: Vec<Finding>,
    blocked_index: Option<usize>,
    redactions: Vec<BodyEdit>,
    redaction_reservations: Vec<MemoryReservation>,
}

impl Outcome {
    /// The first matching `block` guardrail, or a `redact` guardrail that
    /// failed closed because the request could not be safely redacted.
    pub(crate) fn blocking(&self) -> Option<&Finding> {
        self.blocked_index
            .and_then(|index| self.findings.get(index))
    }

    pub(crate) fn into_findings(self) -> Vec<Finding> {
        self.findings
    }

    pub(crate) fn into_parts(self) -> (Vec<Finding>, Vec<BodyEdit>, Vec<MemoryReservation>) {
        (self.findings, self.redactions, self.redaction_reservations)
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

fn raw_range(body: &[u8], raw: &str) -> Option<Range<usize>> {
    let start = raw.as_ptr().addr().checked_sub(body.as_ptr().addr())?;
    let end = start.checked_add(raw.len())?;
    (end <= body.len()).then_some(start..end)
}

/// One non-empty JSON string leaf retained when an external `redact` guardrail
/// needs its response mapped back onto the request body.
struct ExternalLeaf {
    raw_range: Range<usize>,
    text: String,
    local_redact_slots: Vec<usize>,
}

/// Result of the CPU-bound local pass: regex matches, local redaction edits,
/// and the last turn's text/leaves when external guardrails also run.
struct LocalScan {
    active_indices: Vec<usize>,
    matched: Vec<bool>,
    local_fail_closed: Vec<bool>,
    unreadable: bool,
    turn_text: String,
    external_leaves: Vec<ExternalLeaf>,
    local_redactions: Vec<BodyEdit>,
    redaction_reservations: Vec<MemoryReservation>,
}

impl LocalScan {
    fn is_unreadable(&self) -> bool {
        self.unreadable
    }

    fn has_external_input(&self) -> bool {
        !self.turn_text.is_empty() || !self.external_leaves.is_empty()
    }

    fn has_external_leaves(&self) -> bool {
        !self.external_leaves.is_empty()
    }

    fn has_local_block(&self, guardrails: &[Guardrail]) -> bool {
        self.active_indices
            .iter()
            .enumerate()
            .any(|(slot, &index)| {
                let matched = self.matched.get(slot).copied().unwrap_or(false);
                if !matched {
                    return false;
                }
                match guardrails.get(index).map(|guardrail| guardrail.action) {
                    Some(GuardrailAction::Block) => true,
                    Some(GuardrailAction::Redact) => {
                        self.local_fail_closed.get(slot).copied().unwrap_or(false)
                    }
                    _ => false,
                }
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

    fn clear_turn_text(&mut self) {
        self.turn_text.clear();
    }

    fn into_outcome(
        mut self,
        guardrails: &[Guardrail],
        external_outcomes: &[(usize, ExternalOutcome)],
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<Outcome, ResolutionError> {
        let mut fail_closed_redact = self.local_fail_closed.clone();
        if self.unreadable {
            fail_closed_redact.fill(true);
        }
        for (slot, outcome) in external_outcomes {
            if outcome.is_match()
                && let Some(entry) = self.matched.get_mut(*slot)
            {
                *entry = true;
            }
            if matches!(outcome, ExternalOutcome::Failed)
                && let Some(entry) = fail_closed_redact.get_mut(*slot)
            {
                *entry = true;
            }
        }

        let redactions = if self.unreadable || self.any_blocking(guardrails, &fail_closed_redact) {
            Vec::new()
        } else if !self.external_leaves.is_empty() {
            let mut combined = build_combined_redactions(
                guardrails,
                &self.active_indices,
                &self.external_leaves,
                external_outcomes,
                &mut fail_closed_redact,
                budget,
                &mut self.redaction_reservations,
            )?;
            // Earlier-turn local regex redactions are strictly disjoint from
            // last-turn `external_leaves` ranges and splice in the same pass.
            combined.extend(self.local_redactions);
            combined
        } else {
            self.local_redactions
        };

        let mut findings = Vec::new();
        let mut blocked_index = None;
        for (slot, (&index, &matched)) in self.active_indices.iter().zip(&self.matched).enumerate()
        {
            if !self.unreadable && !matched {
                continue;
            }
            let Some(guardrail) = guardrails.get(index) else {
                continue;
            };
            let blocks = guardrail.action == GuardrailAction::Block
                || (guardrail.action == GuardrailAction::Redact
                    && fail_closed_redact.get(slot).copied().unwrap_or(false));
            if blocks && blocked_index.is_none() {
                blocked_index = Some(findings.len());
            }
            findings.push(Finding {
                id: guardrail.id.clone(),
                name: guardrail.name.clone(),
                action: guardrail.action,
                location: GuardrailLocation::Request,
            });
        }

        let (redactions, redaction_reservations) = if blocked_index.is_some() {
            (Vec::new(), Vec::new())
        } else {
            (redactions, self.redaction_reservations)
        };
        Ok(Outcome {
            findings,
            blocked_index,
            redactions,
            redaction_reservations,
        })
    }

    fn any_blocking(&self, guardrails: &[Guardrail], fail_closed_redact: &[bool]) -> bool {
        self.active_indices
            .iter()
            .enumerate()
            .any(|(slot, &index)| {
                let matched = self.unreadable || self.matched.get(slot).copied().unwrap_or(false);
                if !matched {
                    return false;
                }
                match guardrails.get(index).map(|guardrail| guardrail.action) {
                    Some(GuardrailAction::Block) => true,
                    Some(GuardrailAction::Redact) => {
                        fail_closed_redact.get(slot).copied().unwrap_or(false)
                    }
                    _ => false,
                }
            })
    }
}

/// Runs the local regex guardrails against `turn` and, when any active external
/// guardrail is present, collects the last turn's text/leaves in the same pass.
/// Regex guardrails fail open on invalid regexes: a regex whose patterns do not
/// compile matches nothing. Fail-closed guardrails always match (blocking both
/// `block` and `redact` rules). An unreadable turn matches every active
/// guardrail (blocking `block` and `redact` rules).
fn scan_local(
    guardrails: &[Guardrail],
    body: &[u8],
    scanned: &ScannedMembers,
    turn: &Result<LastTurn, Unreadable>,
    budget: Option<&Arc<Semaphore>>,
) -> Result<LocalScan, ResolutionError> {
    let active_indices: Vec<usize> = guardrails
        .iter()
        .enumerate()
        .filter_map(|(index, guardrail)| guardrail.is_active().then_some(index))
        .collect();
    if active_indices.is_empty() {
        return Ok(LocalScan {
            active_indices,
            matched: Vec::new(),
            local_fail_closed: Vec::new(),
            unreadable: false,
            turn_text: String::new(),
            external_leaves: Vec::new(),
            local_redactions: Vec::new(),
            redaction_reservations: Vec::new(),
        });
    }
    let regex_slots: Vec<(usize, &[String])> = active_indices
        .iter()
        .enumerate()
        .filter_map(|(slot, &index)| {
            let patterns = guardrails.get(index)?.regex_patterns()?;
            Some((slot, patterns))
        })
        .collect();
    let has_external = active_indices
        .iter()
        .any(|&index| guardrails.get(index).is_some_and(Guardrail::is_external));
    let has_external_redact = active_indices.iter().any(|&index| {
        guardrails
            .get(index)
            .is_some_and(Guardrail::is_external_redact)
    });
    let has_local_redact = active_indices.iter().any(|&index| {
        guardrails
            .get(index)
            .is_some_and(Guardrail::is_local_redact)
    });

    let compiled = (!regex_slots.is_empty()).then(|| compiled(&regex_slots));
    let mut state = ScanState::new(
        guardrails,
        active_indices,
        regex_slots,
        compiled,
        body,
        has_external,
        has_external_redact,
        budget,
    );

    let unreadable = turn
        .as_ref()
        .map_or(true, |turn| state.scan_last_turn(turn, scanned));
    let earlier_unreadable = if !unreadable
        && !state.budget_exhausted
        && has_local_redact
        && let Ok(turn) = turn
    {
        state.scan_earlier_turns(turn, scanned)
    } else {
        false
    };

    state.finish(unreadable, earlier_unreadable)
}

struct ScanState<'g, 'b> {
    guardrails: &'g [Guardrail],
    active_indices: Vec<usize>,
    regex_slots: Vec<(usize, &'g [String])>,
    compiled: Option<Arc<Compiled>>,
    body: &'b [u8],
    has_external: bool,
    has_external_redact: bool,
    budget: Option<&'b Arc<Semaphore>>,
    budget_exhausted: bool,
    regex_matched: Vec<bool>,
    leaf_matched: Vec<bool>,
    found: Vec<PatternSet>,
    span_scratch: Vec<RedactionSpan<'g>>,
    turn_text: String,
    external_leaves: Vec<ExternalLeaf>,
    local_redactions: Vec<BodyEdit>,
    redaction_reservations: Vec<MemoryReservation>,
    local_fail_closed: Vec<bool>,
}

impl<'g, 'b> ScanState<'g, 'b> {
    #[expect(
        clippy::too_many_arguments,
        reason = "groups scan inputs and reusable scratch buffers for scan_local"
    )]
    fn new(
        guardrails: &'g [Guardrail],
        active_indices: Vec<usize>,
        regex_slots: Vec<(usize, &'g [String])>,
        compiled: Option<Arc<Compiled>>,
        body: &'b [u8],
        has_external: bool,
        has_external_redact: bool,
        budget: Option<&'b Arc<Semaphore>>,
    ) -> Self {
        let found = compiled.as_ref().map_or_else(Vec::new, |compiled| {
            compiled
                .matchers
                .iter()
                .map(|matcher| PatternSet::new(matcher.regex.pattern_len()))
                .collect()
        });
        let regex_len = regex_slots.len();
        let active_len = active_indices.len();
        Self {
            guardrails,
            active_indices,
            regex_slots,
            compiled,
            body,
            has_external,
            has_external_redact,
            budget,
            budget_exhausted: false,
            regex_matched: vec![false; regex_len],
            leaf_matched: vec![false; regex_len],
            found,
            span_scratch: Vec::new(),
            turn_text: String::new(),
            external_leaves: Vec::new(),
            local_redactions: Vec::new(),
            redaction_reservations: Vec::new(),
            local_fail_closed: vec![false; active_len],
        }
    }

    fn scan_last_turn(&mut self, turn: &LastTurn, scanned: &ScannedMembers) -> bool {
        let guardrails = self.guardrails;
        let active_indices = &self.active_indices;
        let regex_slots = &self.regex_slots;
        let compiled = self.compiled.as_deref();
        let body = self.body;
        let has_external = self.has_external;
        let has_external_redact = self.has_external_redact;
        let budget = self.budget;
        turn.read_leaves(member(body, scanned), &mut |leaf| {
            if self.budget_exhausted {
                return;
            }
            self.leaf_matched.fill(false);
            if let Some(compiled) = compiled {
                record_leaf_matches(
                    &compiled.matchers,
                    &mut self.found,
                    &mut self.leaf_matched,
                    leaf.text,
                );
                for (overall, &matched) in self.regex_matched.iter_mut().zip(&self.leaf_matched) {
                    *overall |= matched;
                }
            }
            let matched_redact_slots = matched_local_redact_slots(
                guardrails,
                active_indices,
                regex_slots,
                &self.leaf_matched,
            );
            if has_external_redact {
                push_external_leaf(body, leaf, matched_redact_slots, &mut self.external_leaves);
                return;
            }
            if apply_local_leaf_redaction(
                guardrails,
                active_indices,
                &matched_redact_slots,
                body,
                leaf,
                &mut self.span_scratch,
                &mut self.local_redactions,
                &mut self.local_fail_closed,
                budget,
                &mut self.redaction_reservations,
            )
            .is_err()
            {
                self.budget_exhausted = true;
                return;
            }
            if has_external && !leaf.text.is_empty() {
                if !self.turn_text.is_empty() {
                    self.turn_text.push('\n');
                }
                self.turn_text.push_str(leaf.text);
            }
        })
        .is_err()
    }

    fn scan_earlier_turns(&mut self, turn: &LastTurn, scanned: &ScannedMembers) -> bool {
        let Some(compiled) = self.compiled.as_deref() else {
            return false;
        };
        let guardrails = self.guardrails;
        let active_indices = &self.active_indices;
        let regex_slots = &self.regex_slots;
        let body = self.body;
        let budget = self.budget;
        turn.read_earlier_leaves(member(body, scanned), &mut |leaf| {
            if self.budget_exhausted {
                return;
            }
            self.leaf_matched.fill(false);
            record_leaf_matches(
                &compiled.matchers,
                &mut self.found,
                &mut self.leaf_matched,
                leaf.text,
            );
            let matched_redact_slots = matched_local_redact_slots(
                guardrails,
                active_indices,
                regex_slots,
                &self.leaf_matched,
            );
            if matched_redact_slots.is_empty() {
                return;
            }
            // Only mark `redact` regex guardrails matched on earlier turns;
            // `block` and `log` remain scoped to the last turn.
            for ((&(slot, _), &matched), overall) in regex_slots
                .iter()
                .zip(&self.leaf_matched)
                .zip(&mut self.regex_matched)
            {
                if matched
                    && active_indices
                        .get(slot)
                        .and_then(|&index| guardrails.get(index))
                        .is_some_and(Guardrail::is_local_redact)
                {
                    *overall = true;
                }
            }
            if apply_local_leaf_redaction(
                guardrails,
                active_indices,
                &matched_redact_slots,
                body,
                leaf,
                &mut self.span_scratch,
                &mut self.local_redactions,
                &mut self.local_fail_closed,
                budget,
                &mut self.redaction_reservations,
            )
            .is_err()
            {
                self.budget_exhausted = true;
            }
        })
        .is_err()
    }

    fn finish(
        mut self,
        unreadable: bool,
        earlier_unreadable: bool,
    ) -> Result<LocalScan, ResolutionError> {
        if self.budget_exhausted {
            return Err(ResolutionError::Busy);
        }
        let mut matched = vec![false; self.active_indices.len()];
        for (slot, &index) in self.active_indices.iter().enumerate() {
            let Some(guardrail) = self.guardrails.get(index) else {
                continue;
            };
            let fail_closed = matches!(guardrail.kind, GuardrailKind::FailClosed)
                || (earlier_unreadable && guardrail.is_local_redact());
            if fail_closed {
                if let Some(entry) = matched.get_mut(slot) {
                    *entry = true;
                }
                if let Some(flag) = self.local_fail_closed.get_mut(slot) {
                    *flag = true;
                }
            }
        }
        for ((slot, _), is_match) in self.regex_slots.into_iter().zip(self.regex_matched) {
            if is_match && let Some(entry) = matched.get_mut(slot) {
                *entry = true;
            }
        }
        Ok(LocalScan {
            active_indices: self.active_indices,
            matched,
            local_fail_closed: self.local_fail_closed,
            unreadable,
            turn_text: self.turn_text,
            external_leaves: self.external_leaves,
            local_redactions: self.local_redactions,
            redaction_reservations: self.redaction_reservations,
        })
    }
}

fn push_external_leaf(
    body: &[u8],
    leaf: text::TextLeaf<'_>,
    local_redact_slots: Vec<usize>,
    external_leaves: &mut Vec<ExternalLeaf>,
) {
    if !leaf.text.is_empty()
        && let Some(range) = raw_range(body, leaf.raw)
    {
        external_leaves.push(ExternalLeaf {
            raw_range: range,
            text: leaf.text.to_owned(),
            local_redact_slots,
        });
    }
}

/// Reserves memory for an expanded replacement buffer (`String` + JSON-encoded
/// `BodyEdit` + body growth) before allocating it.
fn reserve_redaction_bytes(
    budget: Option<&Arc<Semaphore>>,
    bytes: usize,
    reservations: &mut Vec<MemoryReservation>,
) -> Result<(), ResolutionError> {
    let Some(budget) = budget else {
        return Ok(());
    };
    let reserved = bytes.saturating_mul(2);
    if reserved == 0 {
        return Ok(());
    }
    reservations.push(MemoryReservation::from_budget(
        budget,
        reserved,
        "guardrails",
    )?);
    Ok(())
}

#[expect(
    clippy::too_many_arguments,
    reason = "internal helper keeping scan_local concise while reusing span_scratch across leaves"
)]
fn apply_local_leaf_redaction<'a>(
    guardrails: &'a [Guardrail],
    active_indices: &[usize],
    matched_redact_slots: &[usize],
    body: &[u8],
    leaf: text::TextLeaf<'_>,
    span_scratch: &mut Vec<RedactionSpan<'a>>,
    local_redactions: &mut Vec<BodyEdit>,
    local_fail_closed: &mut [bool],
    budget: Option<&Arc<Semaphore>>,
    reservations: &mut Vec<MemoryReservation>,
) -> Result<(), ResolutionError> {
    if matched_redact_slots.is_empty() {
        return Ok(());
    }
    let Some(range) = raw_range(body, leaf.raw) else {
        mark_fail_closed(matched_redact_slots, local_fail_closed);
        return Ok(());
    };
    span_scratch.clear();
    let all_covered = collect_local_redact_spans(
        guardrails,
        active_indices,
        matched_redact_slots,
        leaf.text,
        span_scratch,
        Some(local_fail_closed),
    );
    if !all_covered {
        return Ok(());
    }
    let Some(capacity) = redact::prepare_redactions(leaf.text, span_scratch) else {
        mark_fail_closed(matched_redact_slots, local_fail_closed);
        return Ok(());
    };
    reserve_redaction_bytes(budget, capacity, reservations)?;
    let redacted = redact::splice_merged_spans(leaf.text, span_scratch, capacity);
    if let Ok(replacement) = serde_json::to_vec(&redacted) {
        local_redactions.push(BodyEdit { range, replacement });
    } else {
        mark_fail_closed(matched_redact_slots, local_fail_closed);
    }
    Ok(())
}

fn mark_fail_closed(slots: &[usize], fail_closed: &mut [bool]) {
    for &slot in slots {
        if let Some(flag) = fail_closed.get_mut(slot) {
            *flag = true;
        }
    }
}

fn matched_local_redact_slots(
    guardrails: &[Guardrail],
    active_indices: &[usize],
    regex_slots: &[(usize, &[String])],
    leaf_matched: &[bool],
) -> Vec<usize> {
    let mut slots = Vec::new();
    for (&(slot, _), &matched) in regex_slots.iter().zip(leaf_matched) {
        if matched
            && let Some(guardrail) = active_indices
                .get(slot)
                .and_then(|&index| guardrails.get(index))
            && guardrail.action == GuardrailAction::Redact
        {
            slots.push(slot);
        }
    }
    slots
}

/// Collects spans for each guardrail in `slots`. When `fail_closed` is `Some`,
/// every slot is expected to have matched `text`; any slot that fails to
/// produce a valid span marks `fail_closed[slot] = true` and returns `false`.
fn collect_local_redact_spans<'a>(
    guardrails: &'a [Guardrail],
    active_indices: &[usize],
    slots: &[usize],
    text: &str,
    out: &mut Vec<RedactionSpan<'a>>,
    mut fail_closed: Option<&mut [bool]>,
) -> bool {
    let mut all_covered = true;
    for &slot in slots {
        let Some(guardrail) = active_indices
            .get(slot)
            .and_then(|&index| guardrails.get(index))
        else {
            continue;
        };
        let Some(patterns) = guardrail.regex_patterns() else {
            continue;
        };
        let label = guardrail.redaction_label();
        let before = out.len();
        for pattern in patterns {
            if let Some(regex) = redact::redact_regex(pattern) {
                redact::find_regex_spans(&regex, text, slot, label, out);
            }
        }
        if out.len() == before
            && let Some(flags) = fail_closed.as_deref_mut()
        {
            if let Some(flag) = flags.get_mut(slot) {
                *flag = true;
            }
            all_covered = false;
        }
    }
    all_covered
}

enum LeafRedactionError {
    FailClosed,
    Busy,
}

/// Combines local regex `redact` spans with external provider redaction results
/// (assessment match substrings/offsets or masked/anonymized outputs) into
/// per-leaf [`BodyEdit`] entries. Marks `fail_closed_redact[slot] = true` when
/// an external `redact` intervention cannot be mapped to safe edits.
fn build_combined_redactions(
    guardrails: &[Guardrail],
    active_indices: &[usize],
    leaves: &[ExternalLeaf],
    external_outcomes: &[(usize, ExternalOutcome)],
    fail_closed_redact: &mut [bool],
    budget: Option<&Arc<Semaphore>>,
    reservations: &mut Vec<MemoryReservation>,
) -> Result<Vec<BodyEdit>, ResolutionError> {
    let mut per_leaf_spans: Vec<Vec<RedactionSpan<'_>>> = vec![Vec::new(); leaves.len()];
    let mut per_leaf_masked: Vec<Option<String>> = vec![None; leaves.len()];
    let mut span_applied_external: Vec<(usize, &ExternalMatch)> = Vec::new();

    for (slot, outcome) in external_outcomes {
        let Some(guardrail) = active_indices
            .get(*slot)
            .and_then(|&index| guardrails.get(index))
        else {
            continue;
        };
        if guardrail.action != GuardrailAction::Redact {
            continue;
        }
        let ExternalOutcome::Matched(ext_match) = outcome else {
            continue;
        };
        if ext_match.has_unmappable_intervention {
            if let Some(flag) = fail_closed_redact.get_mut(*slot) {
                *flag = true;
            }
            return Ok(Vec::new());
        }
        let label = guardrail.redaction_label();
        let added_spans =
            collect_external_match_spans(leaves, ext_match, *slot, label, &mut per_leaf_spans);
        if added_spans {
            span_applied_external.push((*slot, ext_match));
            continue;
        }
        if !apply_external_outputs(leaves, ext_match, &mut per_leaf_masked) {
            if let Some(flag) = fail_closed_redact.get_mut(*slot) {
                *flag = true;
            }
            return Ok(Vec::new());
        }
    }

    let all_local_redact_slots: Vec<usize> = active_indices
        .iter()
        .enumerate()
        .filter_map(|(slot, &index)| {
            let guardrail = guardrails.get(index)?;
            (guardrail.action == GuardrailAction::Redact && guardrail.regex_patterns().is_some())
                .then_some(slot)
        })
        .collect();

    let mut edits = Vec::new();
    for (leaf_index, leaf) in leaves.iter().enumerate() {
        let masked_base = per_leaf_masked.get(leaf_index).and_then(Option::as_deref);
        let external_spans = per_leaf_spans
            .get_mut(leaf_index)
            .map(std::mem::take)
            .unwrap_or_default();
        match redact_external_leaf(
            guardrails,
            active_indices,
            &all_local_redact_slots,
            &span_applied_external,
            leaf,
            masked_base,
            external_spans,
            fail_closed_redact,
            budget,
            reservations,
        ) {
            Ok(Some(edit)) => edits.push(edit),
            Ok(None) => {}
            Err(LeafRedactionError::FailClosed) => return Ok(Vec::new()),
            Err(LeafRedactionError::Busy) => return Err(ResolutionError::Busy),
        }
    }
    Ok(edits)
}

#[expect(
    clippy::too_many_arguments,
    reason = "internal helper factoring per-leaf external+local redaction out of build_combined_redactions"
)]
fn redact_external_leaf<'a>(
    guardrails: &'a [Guardrail],
    active_indices: &[usize],
    all_local_redact_slots: &[usize],
    span_applied_external: &[(usize, &ExternalMatch)],
    leaf: &ExternalLeaf,
    masked_base: Option<&str>,
    mut external_spans: Vec<RedactionSpan<'a>>,
    fail_closed_redact: &mut [bool],
    budget: Option<&Arc<Semaphore>>,
    reservations: &mut Vec<MemoryReservation>,
) -> Result<Option<BodyEdit>, LeafRedactionError> {
    let base_text = masked_base.unwrap_or(&leaf.text);
    let mut spans = if masked_base.is_some() {
        // Re-run span finders against the masked base so both provider
        // anonymization and local/span redactions apply together.
        let mut combined = Vec::new();
        collect_local_redact_spans(
            guardrails,
            active_indices,
            all_local_redact_slots,
            base_text,
            &mut combined,
            None,
        );
        for &(slot, ext_match) in span_applied_external {
            if let Some(guardrail) = active_indices
                .get(slot)
                .and_then(|&index| guardrails.get(index))
            {
                let label = guardrail.redaction_label();
                for item in &ext_match.items {
                    if let Some(needle) = item.matched_text.as_deref() {
                        redact::find_literal_spans(base_text, needle, slot, label, &mut combined);
                    }
                }
            }
        }
        combined
    } else {
        if !leaf.local_redact_slots.is_empty()
            && !collect_local_redact_spans(
                guardrails,
                active_indices,
                &leaf.local_redact_slots,
                base_text,
                &mut external_spans,
                Some(fail_closed_redact),
            )
        {
            return Err(LeafRedactionError::FailClosed);
        }
        external_spans
    };

    if let Some(capacity) = redact::prepare_redactions(base_text, &mut spans) {
        reserve_redaction_bytes(budget, capacity, reservations)
            .map_err(|_| LeafRedactionError::Busy)?;
        let redacted = redact::splice_merged_spans(base_text, &spans, capacity);
        let replacement =
            serde_json::to_vec(&redacted).map_err(|_| LeafRedactionError::FailClosed)?;
        return Ok(Some(BodyEdit {
            range: leaf.raw_range.clone(),
            replacement,
        }));
    }
    if masked_base.is_some() {
        reserve_redaction_bytes(budget, base_text.len(), reservations)
            .map_err(|_| LeafRedactionError::Busy)?;
        let replacement =
            serde_json::to_vec(base_text).map_err(|_| LeafRedactionError::FailClosed)?;
        return Ok(Some(BodyEdit {
            range: leaf.raw_range.clone(),
            replacement,
        }));
    }
    Ok(None)
}

/// Maps every reported item in `ext_match.items` onto `per_leaf_spans`.
/// Returns `true` only when `ext_match.items` is non-empty and every reported
/// item mapped to at least one valid span; otherwise leaves `per_leaf_spans`
/// untouched so the caller falls back to provider `outputs` or fails closed.
fn collect_external_match_spans<'a>(
    leaves: &[ExternalLeaf],
    ext_match: &ExternalMatch,
    priority: usize,
    label: &'a str,
    per_leaf_spans: &mut [Vec<RedactionSpan<'a>>],
) -> bool {
    if ext_match.items.is_empty() {
        return false;
    }
    let mut staged: Vec<Vec<RedactionSpan<'a>>> = vec![Vec::new(); leaves.len()];
    for item in &ext_match.items {
        let mut item_covered = false;
        if let Some((assessment_index, range)) = &item.offset {
            let target_leaf = if leaves.len() == 1 {
                Some(0)
            } else if ext_match.assessment_count == leaves.len() {
                Some(*assessment_index)
            } else {
                None
            };
            if let Some(leaf_index) = target_leaf
                && let (Some(leaf), Some(spans)) =
                    (leaves.get(leaf_index), staged.get_mut(leaf_index))
                && range.start < range.end
                && range.end <= leaf.text.len()
                && leaf.text.is_char_boundary(range.start)
                && leaf.text.is_char_boundary(range.end)
            {
                spans.push(RedactionSpan {
                    start: range.start,
                    end: range.end,
                    priority,
                    label,
                });
                item_covered = true;
            }
        }
        if !item_covered
            && let Some(needle) = item.matched_text.as_deref()
        {
            for (leaf, spans) in leaves.iter().zip(staged.iter_mut()) {
                let before = spans.len();
                redact::find_literal_spans(&leaf.text, needle, priority, label, spans);
                if spans.len() > before {
                    item_covered = true;
                }
            }
        }
        if !item_covered {
            return false;
        }
    }
    for (dest, mut added) in per_leaf_spans.iter_mut().zip(staged) {
        dest.append(&mut added);
    }
    true
}

fn apply_external_outputs(
    leaves: &[ExternalLeaf],
    ext_match: &ExternalMatch,
    per_leaf_masked: &mut [Option<String>],
) -> bool {
    if ext_match.outputs.is_empty() {
        return false;
    }
    if ext_match.outputs.len() == leaves.len() {
        return merge_masked_outputs(
            leaves,
            ext_match.outputs.iter().map(String::as_str),
            per_leaf_masked,
        );
    }
    // Joined single-block fallback when leaf count exceeded MAX_BEDROCK_CONTENT_BLOCKS.
    // Partition the joined output by each original leaf's line count so multiline
    // leaves still map back 1:1 when anonymization preserves line structure.
    if ext_match.outputs.len() == 1
        && let Some(single) = ext_match.outputs.first()
    {
        let lines: Vec<&str> = single.split('\n').collect();
        let expected_lines: usize = leaves
            .iter()
            .map(|leaf| leaf.text.bytes().filter(|&b| b == b'\n').count() + 1)
            .sum();
        if lines.len() == expected_lines {
            let mut cursor = 0usize;
            let mut reconstructed = Vec::with_capacity(leaves.len());
            for leaf in leaves {
                let count = leaf.text.bytes().filter(|&b| b == b'\n').count() + 1;
                let Some(slice) = lines.get(cursor..cursor + count) else {
                    return false;
                };
                reconstructed.push(slice.join("\n"));
                cursor += count;
            }
            return merge_masked_outputs(
                leaves,
                reconstructed.iter().map(String::as_str),
                per_leaf_masked,
            );
        }
    }
    false
}

/// Applies per-leaf masked outputs without overwriting a conflicting masked
/// output from an earlier external guardrail (fails closed if two independent
/// provider outputs disagree on the same leaf).
fn merge_masked_outputs<'a>(
    leaves: &[ExternalLeaf],
    outputs: impl Iterator<Item = &'a str>,
    per_leaf_masked: &mut [Option<String>],
) -> bool {
    let mut changed = false;
    for ((leaf, output), slot) in leaves.iter().zip(outputs).zip(per_leaf_masked.iter_mut()) {
        if output == leaf.text {
            continue;
        }
        if let Some(existing) = slot.as_deref()
            && existing != output
        {
            return false;
        }
        *slot = Some(output.to_owned());
        changed = true;
    }
    changed
}

/// Marks the guardrails whose patterns match `text`.
fn record_leaf_matches(
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
            None,
        )
        .unwrap()
        .into_outcome(guardrails, &[], None)
        .unwrap()
    }

    fn apply_edits(body: &str, edits: &[BodyEdit]) -> String {
        let mut sorted: Vec<&BodyEdit> = edits.iter().collect();
        sorted.sort_by_key(|edit| edit.range.start);
        let mut out = Vec::new();
        let mut cursor = 0;
        for edit in sorted {
            out.extend_from_slice(&body.as_bytes()[cursor..edit.range.start]);
            out.extend_from_slice(&edit.replacement);
            cursor = edit.range.end;
        }
        out.extend_from_slice(&body.as_bytes()[cursor..]);
        String::from_utf8(out).unwrap()
    }

    const SSN: &str = r"\b\d{3}-\d{2}-\d{4}\b";
    const EMAIL: &str = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b";
    const PHONE: &str = r"\b\d{3}-\d{4}\b";

    fn guardrail(id: &str, action: GuardrailAction, patterns: &[&str]) -> Guardrail {
        Guardrail {
            id: id.into(),
            name: format!("{id} name"),
            action,
            redaction_label: None,
            kind: GuardrailKind::Regex {
                patterns: patterns
                    .iter()
                    .map(|pattern| (*pattern).to_owned())
                    .collect(),
            },
        }
    }

    fn redact_guardrail(id: &str, label: &str, patterns: &[&str]) -> Guardrail {
        let mut rule = guardrail(id, GuardrailAction::Redact, patterns);
        rule.redaction_label = Some(label.to_owned());
        rule
    }

    fn bedrock_redact_guardrail(id: &str, label: &str) -> Guardrail {
        Guardrail {
            id: id.into(),
            name: format!("{id} name"),
            action: GuardrailAction::Redact,
            redaction_label: Some(label.to_owned()),
            kind: GuardrailKind::Bedrock(BedrockGuardrail {
                guardrail_id: "abc123def".into(),
                guardrail_version: "1".into(),
                region: "us-east-1".into(),
                api_key: SecretString::from("token"),
            }),
        }
    }

    fn match_item(text: &str) -> external::ExternalMatchItem {
        external::ExternalMatchItem {
            matched_text: Some(text.to_owned()),
            offset: None,
        }
    }

    fn offset_item(index: usize, range: Range<usize>) -> external::ExternalMatchItem {
        external::ExternalMatchItem {
            matched_text: None,
            offset: Some((index, range)),
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

    #[test]
    fn redacts_nested_message_content_multibyte_utf8_and_earlier_turns() {
        let body = r#"{"messages":[{"role":"user","content":"old a@example.com"},{"role":"assistant","content":"ok"},{"role":"user","content":[{"type":"text","text":"café a@example.com 🚀"},{"type":"image_url","image_url":{"url":"data:image/png;base64,AAAA"}},{"type":"tool_result","tool_use_id":"t1","content":[{"type":"text","text":"call 555-1234 and ssn 123-45-6789"}]}]}]}"#;
        let outcome = check_request(
            &[
                redact_guardrail("email", "[EMAIL]", &[EMAIL]),
                redact_guardrail("phone", "[PHONE]", &[PHONE]),
                redact_guardrail("ssn", "[SSN]", &[SSN]),
            ],
            ApiFormat::OpenAiChatCompletions,
            body.as_bytes(),
            &scanned(body, &["messages"]),
        );
        assert!(outcome.blocking().is_none());
        let (findings, edits, _) = outcome.into_parts();
        let ids: Vec<&str> = findings.iter().map(|f| f.id.as_str()).collect();
        assert_eq!(ids, ["email", "phone", "ssn"]);
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        // Earlier turns are also redacted so stateless multi-turn resends cannot leak PII.
        assert_eq!(rewritten["messages"][0]["content"], "old [EMAIL]");
        assert_eq!(
            rewritten["messages"][2]["content"][0]["text"],
            "café [EMAIL] 🚀"
        );
        assert_eq!(
            rewritten["messages"][2]["content"][1]["image_url"]["url"],
            "data:image/png;base64,AAAA"
        );
        assert_eq!(
            rewritten["messages"][2]["content"][2]["content"][0]["text"],
            "call [PHONE] and ssn [SSN]"
        );
    }

    #[test]
    fn redacts_overlapping_and_adjacent_matches_across_guardrails() {
        let body = r#"{"messages":[{"role":"user","content":"123-45-6789a@example.com secret-token-12345678"}]}"#;
        let outcome = check_request(
            &[
                redact_guardrail("first", "[FIRST]", &[r"123-45-6789", r"secret-token"]),
                redact_guardrail("overlap", "[OVERLAP]", &[r"45-6789", r"token-12345678"]),
                redact_guardrail("email", "[EMAIL]", &[r"a@example\.com"]),
            ],
            ApiFormat::OpenAiChatCompletions,
            body.as_bytes(),
            &scanned(body, &["messages"]),
        );
        assert!(outcome.blocking().is_none());
        let (_, edits, _) = outcome.into_parts();
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        assert_eq!(
            rewritten["messages"][0]["content"],
            "[FIRST][EMAIL] [FIRST]"
        );
    }

    #[test]
    fn unreadable_body_fails_closed_for_redact_guardrail() {
        let body = r#"{"messages":[{"role":"user","role":"user","content":"a@example.com"}]}"#;
        let outcome = check_request(
            &[redact_guardrail("email", "[EMAIL]", &[EMAIL])],
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
    fn bedrock_redact_applies_assessment_matches_and_offsets() {
        let body = r#"{"messages":[{"role":"user","content":[{"type":"text","text":"Hi Alice, call 555-0199"},{"type":"text","text":"mail bob@example.com"}]}]}"#;
        let members = scanned(body, &["messages"]);
        let guardrails = [bedrock_redact_guardrail("br", "[PII]")];

        // 1. Assessment literal matches redact across nested leaves using the configured label.
        let local = scan_local(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let outcome = local
            .into_outcome(
                &guardrails,
                &[(
                    0,
                    ExternalOutcome::Matched(ExternalMatch {
                        items: vec![match_item("555-0199"), match_item("bob@example.com")],
                        assessment_count: 2,
                        outputs: vec!["Hi Alice, call {PHONE}".into(), "mail {EMAIL}".into()],
                        has_unmappable_intervention: false,
                    }),
                )],
                None,
            )
            .unwrap();
        assert!(outcome.blocking().is_none());
        let (_, edits, _) = outcome.into_parts();
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        assert_eq!(
            rewritten["messages"][0]["content"][0]["text"],
            "Hi Alice, call [PII]"
        );
        assert_eq!(rewritten["messages"][0]["content"][1]["text"], "mail [PII]");

        // 2. Explicit offsets redact exact byte ranges per leaf.
        let local = scan_local(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let outcome = local
            .into_outcome(
                &guardrails,
                &[(
                    0,
                    ExternalOutcome::Matched(ExternalMatch {
                        items: vec![offset_item(0, 3..8), offset_item(1, 5..20)],
                        assessment_count: 2,
                        outputs: Vec::new(),
                        has_unmappable_intervention: false,
                    }),
                )],
                None,
            )
            .unwrap();
        assert!(outcome.blocking().is_none());
        let (_, edits, _) = outcome.into_parts();
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        assert_eq!(
            rewritten["messages"][0]["content"][0]["text"],
            "Hi [PII], call 555-0199"
        );
        assert_eq!(rewritten["messages"][0]["content"][1]["text"], "mail [PII]");
    }

    #[test]
    fn bedrock_redact_applies_anonymized_outputs_and_fails_closed() {
        let body = r#"{"messages":[{"role":"user","content":[{"type":"text","text":"Hi Alice, call 555-0199"},{"type":"text","text":"mail bob@example.com"}]}]}"#;
        let members = scanned(body, &["messages"]);
        let guardrails = [bedrock_redact_guardrail("br", "[PII]")];

        // 1. Anonymized outputs apply when assessments carry no matches/offsets.
        let local = scan_local(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let outcome = local
            .into_outcome(
                &guardrails,
                &[(
                    0,
                    ExternalOutcome::Matched(ExternalMatch {
                        items: Vec::new(),
                        assessment_count: 0,
                        outputs: vec![
                            "Hi {NAME}, call {PHONE}".into(),
                            "mail bob@example.com".into(),
                        ],
                        has_unmappable_intervention: false,
                    }),
                )],
                None,
            )
            .unwrap();
        assert!(outcome.blocking().is_none());
        let (_, edits, _) = outcome.into_parts();
        // Only the changed leaf emits a body edit.
        assert_eq!(edits.len(), 1);
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        assert_eq!(
            rewritten["messages"][0]["content"][0]["text"],
            "Hi {NAME}, call {PHONE}"
        );
        assert_eq!(
            rewritten["messages"][0]["content"][1]["text"],
            "mail bob@example.com"
        );

        // 2. External failure fails closed for redact guardrails.
        let local = scan_local(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let outcome = local
            .into_outcome(&guardrails, &[(0, ExternalOutcome::Failed)], None)
            .unwrap();
        assert_eq!(
            outcome.blocking().map(|finding| finding.id.as_str()),
            Some("br")
        );
    }

    #[test]
    fn bedrock_redact_handles_joined_multiline_outputs_and_offset_fallback() {
        let guardrails = [bedrock_redact_guardrail("br", "[PII]")];
        let body = r#"{"messages":[{"role":"user","content":[{"type":"text","text":"line 1\ncall 555-0199"},{"type":"text","text":"line 3\nline 4"}]}]}"#;
        let members = scanned(body, &["messages"]);

        // 1. Joined single-block output maps back across multiline leaves by line count.
        let local = scan_local(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let outcome = local
            .into_outcome(
                &guardrails,
                &[(
                    0,
                    ExternalOutcome::Matched(ExternalMatch {
                        outputs: vec!["line 1\ncall {PHONE}\nline 3\nline 4".into()],
                        ..ExternalMatch::default()
                    }),
                )],
                None,
            )
            .unwrap();
        assert!(outcome.blocking().is_none());
        let (_, edits, _) = outcome.into_parts();
        assert_eq!(edits.len(), 1);
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        assert_eq!(
            rewritten["messages"][0]["content"][0]["text"],
            "line 1\ncall {PHONE}"
        );
        assert_eq!(
            rewritten["messages"][0]["content"][1]["text"],
            "line 3\nline 4"
        );

        // 2. Unmappable offsets fall back to retained literal match strings.
        let local = scan_local(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let outcome = local
            .into_outcome(
                &guardrails,
                &[(
                    0,
                    ExternalOutcome::Matched(ExternalMatch {
                        items: vec![external::ExternalMatchItem {
                            matched_text: Some("555-0199".into()),
                            offset: Some((0, 99..120)),
                        }],
                        assessment_count: 1,
                        ..ExternalMatch::default()
                    }),
                )],
                None,
            )
            .unwrap();
        assert!(outcome.blocking().is_none());
        let (_, edits, _) = outcome.into_parts();
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        assert_eq!(
            rewritten["messages"][0]["content"][0]["text"],
            "line 1\ncall [PII]"
        );
    }

    #[test]
    fn bedrock_redact_fails_closed_on_partial_match_coverage() {
        let guardrails = [bedrock_redact_guardrail("br", "[PII]")];
        let body = r#"{"messages":[{"role":"user","content":[{"type":"text","text":"line 1\ncall 555-0199"},{"type":"text","text":"line 3\nline 4"}]}]}"#;
        let members = scanned(body, &["messages"]);
        let local = scan_local(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let outcome = local
            .into_outcome(
                &guardrails,
                &[(
                    0,
                    ExternalOutcome::Matched(ExternalMatch {
                        items: vec![match_item("555-0199"), match_item("555-0199\nline 3")],
                        assessment_count: 1,
                        ..ExternalMatch::default()
                    }),
                )],
                None,
            )
            .unwrap();
        assert_eq!(
            outcome.blocking().map(|finding| finding.id.as_str()),
            Some("br")
        );
    }

    #[test]
    fn bedrock_redact_fails_closed_on_unmappable_policy_or_conflicting_outputs() {
        let body =
            r#"{"messages":[{"role":"user","content":"mail alice@example.com or call 555-0199"}]}"#;
        let members = scanned(body, &["messages"]);

        // Mixed blocked topic + redactable PII match must fail closed.
        let single = [bedrock_redact_guardrail("br", "[PII]")];
        let local = scan_local(
            &single,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let outcome = local
            .into_outcome(
                &single,
                &[(
                    0,
                    ExternalOutcome::Matched(ExternalMatch {
                        items: vec![match_item("alice@example.com")],
                        assessment_count: 1,
                        outputs: Vec::new(),
                        has_unmappable_intervention: true,
                    }),
                )],
                None,
            )
            .unwrap();
        assert_eq!(
            outcome.blocking().map(|finding| finding.id.as_str()),
            Some("br")
        );

        // Two Bedrock REDACT guardrails returning conflicting anonymized outputs on the same leaf fail closed.
        let pair = [
            bedrock_redact_guardrail("br-email", "[EMAIL]"),
            bedrock_redact_guardrail("br-phone", "[PHONE]"),
        ];
        let local = scan_local(
            &pair,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let outcome = local
            .into_outcome(
                &pair,
                &[
                    (
                        0,
                        ExternalOutcome::Matched(ExternalMatch {
                            outputs: vec!["mail {EMAIL} or call 555-0199".into()],
                            ..ExternalMatch::default()
                        }),
                    ),
                    (
                        1,
                        ExternalOutcome::Matched(ExternalMatch {
                            outputs: vec!["mail alice@example.com or call {PHONE}".into()],
                            ..ExternalMatch::default()
                        }),
                    ),
                ],
                None,
            )
            .unwrap();
        assert_eq!(
            outcome.blocking().map(|finding| finding.id.as_str()),
            Some("br-phone")
        );
    }

    #[test]
    fn boundary_wrapped_contains_and_prefix_patterns_redact_cleanly() {
        let contains = r"(?:^|[^A-Za-z0-9_])((?:[Ff][Aa][Ll][Cc][Oo][Nn]))(?:$|[^A-Za-z0-9_])";
        let prefix = r"(?:^|[^A-Za-z0-9_-])(acme_[A-Za-z0-9_-]{16,})(?:$|[^A-Za-z0-9_-])";
        let body =
            r#"{"messages":[{"role":"user","content":"café Falcon鍵acme_1234567890abcdef🔑"}]}"#;
        let outcome = check_request(
            &[
                redact_guardrail("kw", "[CODENAME]", &[contains]),
                redact_guardrail("sec", "[SECRET]", &[prefix]),
            ],
            ApiFormat::OpenAiChatCompletions,
            body.as_bytes(),
            &scanned(body, &["messages"]),
        );
        assert!(outcome.blocking().is_none());
        let (_, edits, _) = outcome.into_parts();
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        assert_eq!(
            rewritten["messages"][0]["content"],
            "café [CODENAME]鍵[SECRET]🔑"
        );
    }

    #[test]
    fn redaction_respects_memory_budget_and_returns_busy() {
        let body = r#"{"messages":[{"role":"user","content":"a@b.co a@b.co a@b.co a@b.co"}]}"#;
        let members = scanned(body, &["messages"]);
        let long_label = "[REDACTED_EMAIL_ADDRESS_LONGER_THAN_MATCH_1234567890]";
        let guardrails = [redact_guardrail("email", long_label, &[EMAIL])];
        let tight_budget = Arc::new(Semaphore::new(64));
        let result = scan_local(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            Some(&tight_budget),
        );
        assert!(matches!(result, Err(ResolutionError::Busy)));
    }

    #[test]
    fn redacts_anthropic_system_prompt_on_later_turns_and_isolates_earlier_unreadability() {
        // 1. Anthropic `system` is still redacted on turn 2 while `log` stays last-turn only.
        let body = r#"{"system":"support email a@example.com","messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"},{"role":"user","content":"follow up"}]}"#;
        let outcome = check_request(
            &[
                guardrail("log-email", GuardrailAction::Log, &[EMAIL]),
                redact_guardrail("redact-email", "[EMAIL]", &[EMAIL]),
            ],
            ApiFormat::AnthropicMessages,
            body.as_bytes(),
            &scanned(body, &["system", "messages"]),
        );
        assert!(outcome.blocking().is_none());
        let (findings, edits, _) = outcome.into_parts();
        let ids: Vec<&str> = findings.iter().map(|f| f.id.as_str()).collect();
        assert_eq!(ids, ["redact-email"]);
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        assert_eq!(rewritten["system"], "support email [EMAIL]");

        // 2. An unreadable earlier turn fails closed only the local redact rule, not unrelated last-turn rules.
        let malformed_history = r#"{"messages":[{"role":"user","content":"bad \ud83d"},{"role":"assistant","content":"ok"},{"role":"user","content":"clean"}]}"#;
        let outcome = check_request(
            &[
                guardrail("block-ssn", GuardrailAction::Block, &[SSN]),
                redact_guardrail("redact-email", "[EMAIL]", &[EMAIL]),
            ],
            ApiFormat::OpenAiChatCompletions,
            malformed_history.as_bytes(),
            &scanned(malformed_history, &["messages"]),
        );
        assert_eq!(
            outcome.blocking().map(|finding| finding.id.as_str()),
            Some("redact-email")
        );
        let ids: Vec<String> = outcome.into_findings().into_iter().map(|f| f.id).collect();
        assert_eq!(ids, ["redact-email"]);
    }
}
