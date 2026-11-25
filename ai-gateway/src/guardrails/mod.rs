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
    Input, MatchKind, PatternID, meta,
    nfa::thompson::WhichCaptures,
    util::{captures::Captures, syntax},
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
use external::{ExternalGuardrailClient, ExternalOutcome, ExternalPayloads};
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
            let has_external = guardrails.iter().any(Guardrail::is_external);
            let mut turn_text_reservation = (has_external && bytes > 0)
                .then(|| MemoryReservation::from_budget(&self.memory_budget, bytes, "guardrails"))
                .transpose()?;
            let (local, scanning) = self
                .cpu
                .run(CpuJob::ScanGuardrails, bytes, {
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
            let outcome = finalize_outcome(
                local,
                &guardrails,
                &external_outcomes,
                Some(&self.memory_budget),
            )?;
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
        // Reserve for the serialized provider payload while the prompt text is
        // still live. When no external `enforce` rule needs the text blocks
        // after I/O, drop `turn_text` and its reservation before awaiting I/O.
        let payload_reservation = MemoryReservation::from_budget(
            &self.memory_budget,
            turn_bytes.saturating_add(64),
            "guardrails",
        )?;
        let payloads = if local.external_blocks.is_empty() {
            let turn_text = local.take_turn_text();
            let payloads = ExternalPayloads::for_guardrails(&guardrails, &[turn_text.as_str()]);
            drop(turn_text);
            drop(turn_text_reservation.take());
            payloads
        } else {
            serialize_external_blocks(&guardrails, &local.external_blocks)
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

fn serialize_external_blocks(
    guardrails: &[&Guardrail],
    blocks: &[ExternalBlock],
) -> ExternalPayloads {
    if blocks.len() <= bedrock::MAX_BEDROCK_CONTENT_BLOCKS {
        let texts: Vec<&str> = blocks.iter().map(|block| block.text.as_str()).collect();
        return ExternalPayloads::for_guardrails(guardrails, &texts);
    }
    let total = blocks.iter().map(|block| block.text.len() + 1).sum();
    let mut joined = String::with_capacity(total);
    for block in blocks {
        if !joined.is_empty() {
            joined.push('\n');
        }
        joined.push_str(&block.text);
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

    fn is_external_enforce(&self) -> bool {
        self.is_external()
            && matches!(
                self.action,
                GuardrailAction::Enforce | GuardrailAction::Redact
            )
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
    Enforce,
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

/// One non-empty JSON string field sent to an enforcing external guardrail
/// (after any local regex redaction) so anonymized outputs can be spliced back
/// into the request body.
struct ExternalBlock {
    raw_range: Range<usize>,
    text: String,
}

/// Result of the CPU-bound local pass: regex matches, local redaction edits,
/// and the last turn's text/blocks when external guardrails also run.
struct LocalScan {
    active_indices: Vec<usize>,
    matched: Vec<bool>,
    local_fail_closed: Vec<bool>,
    unreadable: bool,
    turn_text: String,
    external_blocks: Vec<ExternalBlock>,
    local_redactions: Vec<BodyEdit>,
    redaction_reservations: Vec<MemoryReservation>,
}

impl LocalScan {
    fn is_unreadable(&self) -> bool {
        self.unreadable
    }

    fn has_external_input(&self) -> bool {
        !self.turn_text.is_empty() || !self.external_blocks.is_empty()
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
                    Some(GuardrailAction::Redact | GuardrailAction::Enforce) => {
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
                    Some(GuardrailAction::Redact | GuardrailAction::Enforce) => {
                        fail_closed_redact.get(slot).copied().unwrap_or(false)
                    }
                    _ => false,
                }
            })
    }
}

/// Combines local regex scan results and external guardrail outcomes into the
/// final [`Outcome`], preserving guardrail resolution order.
fn finalize_outcome(
    mut local: LocalScan,
    guardrails: &[Guardrail],
    external_outcomes: &[(usize, ExternalOutcome)],
    budget: Option<&Arc<Semaphore>>,
) -> Result<Outcome, ResolutionError> {
    let mut fail_closed_redact = local.local_fail_closed.clone();
    if local.unreadable {
        fail_closed_redact.fill(true);
    }
    for (slot, outcome) in external_outcomes {
        if outcome.is_match()
            && let Some(entry) = local.matched.get_mut(*slot)
        {
            *entry = true;
        }
        if matches!(outcome, ExternalOutcome::Blocked | ExternalOutcome::Failed)
            && let Some(entry) = fail_closed_redact.get_mut(*slot)
        {
            *entry = true;
        }
    }

    let redactions = if local.unreadable || local.any_blocking(guardrails, &fail_closed_redact) {
        Vec::new()
    } else {
        if !local.external_blocks.is_empty() {
            local.apply_external_anonymizations(
                guardrails,
                external_outcomes,
                &mut fail_closed_redact,
                budget,
            )?;
        }
        local.local_redactions
    };

    let mut findings = Vec::new();
    let mut blocked_index = None;
    for (slot, (&index, &matched)) in local.active_indices.iter().zip(&local.matched).enumerate() {
        if !local.unreadable && !matched {
            continue;
        }
        let Some(guardrail) = guardrails.get(index) else {
            continue;
        };
        let blocks = guardrail.action == GuardrailAction::Block
            || (matches!(
                guardrail.action,
                GuardrailAction::Redact | GuardrailAction::Enforce
            ) && fail_closed_redact.get(slot).copied().unwrap_or(false));
        if blocks && blocked_index.is_none() {
            blocked_index = Some(findings.len());
        }
        let finding_action = if guardrail.action == GuardrailAction::Enforce {
            if blocks {
                GuardrailAction::Block
            } else {
                GuardrailAction::Redact
            }
        } else {
            guardrail.action
        };
        findings.push(Finding {
            id: guardrail.id.clone(),
            name: guardrail.name.clone(),
            action: finding_action,
            location: GuardrailLocation::Request,
        });
    }

    let (redactions, redaction_reservations) = if blocked_index.is_some() {
        (Vec::new(), Vec::new())
    } else {
        (redactions, local.redaction_reservations)
    };
    Ok(Outcome {
        findings,
        blocked_index,
        redactions,
        redaction_reservations,
    })
}

/// Runs the local regex guardrails against `turn` and, when any active external
/// guardrail is present, collects the last turn's text/fields in the same pass.
/// Regex guardrails fail open on invalid regexes: a regex whose patterns do not
/// compile matches nothing. Fail-closed guardrails always match (blocking
/// `block`, `redact`, and `enforce` rules). An unreadable turn matches every
/// active guardrail (blocking `block`, `redact`, and `enforce` rules).
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
            external_blocks: Vec::new(),
            local_redactions: Vec::new(),
            redaction_reservations: Vec::new(),
        });
    }
    let mut regex_slots: Vec<(usize, &[String])> = active_indices
        .iter()
        .enumerate()
        .filter_map(|(slot, &index)| {
            let patterns = guardrails.get(index)?.regex_patterns()?;
            Some((slot, patterns))
        })
        .collect();
    // Put `block` rules ahead of `redact`/`log` so `LeftmostFirst` tie-breaking
    // favors blocking when two rules match at the exact same starting byte.
    regex_slots.sort_by_key(|&(slot, _)| {
        usize::from(
            active_indices
                .get(slot)
                .and_then(|&index| guardrails.get(index))
                .is_none_or(|guardrail| guardrail.action != GuardrailAction::Block),
        )
    });
    let has_external = active_indices
        .iter()
        .any(|&index| guardrails.get(index).is_some_and(Guardrail::is_external));
    let has_external_enforce = active_indices.iter().any(|&index| {
        guardrails
            .get(index)
            .is_some_and(Guardrail::is_external_enforce)
    });

    let compiled = (!regex_slots.is_empty()).then(|| compiled(&regex_slots));
    let mut state = ScanState::new(
        guardrails,
        active_indices,
        regex_slots,
        compiled,
        body,
        has_external,
        has_external_enforce,
        budget,
    );

    let unreadable = turn
        .as_ref()
        .map_or(true, |turn| state.scan_last_turn(turn, scanned));

    state.finish(unreadable)
}

struct ScanState<'g, 'b> {
    guardrails: &'g [Guardrail],
    active_indices: Vec<usize>,
    regex_slots: Vec<(usize, &'g [String])>,
    compiled: Option<Arc<Compiled>>,
    body: &'b [u8],
    has_external: bool,
    has_external_enforce: bool,
    budget: Option<&'b Arc<Semaphore>>,
    budget_exhausted: bool,
    regex_matched: Vec<bool>,
    caps: Vec<Captures>,
    span_scratch: Vec<RedactionSpan<'g>>,
    turn_text: String,
    external_blocks: Vec<ExternalBlock>,
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
        has_external_enforce: bool,
        budget: Option<&'b Arc<Semaphore>>,
    ) -> Self {
        let caps = compiled.as_ref().map_or_else(Vec::new, |compiled| {
            compiled
                .matchers
                .iter()
                .map(|matcher| matcher.regex.create_captures())
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
            has_external_enforce,
            budget,
            budget_exhausted: false,
            regex_matched: vec![false; regex_len],
            caps,
            span_scratch: Vec::new(),
            turn_text: String::new(),
            external_blocks: Vec::new(),
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
        let has_external_enforce = self.has_external_enforce;
        let budget = self.budget;
        turn.read_leaves(member(body, scanned), &mut |leaf| {
            if self.budget_exhausted {
                return;
            }
            self.span_scratch.clear();
            if let Some(compiled) = compiled {
                for (matcher, caps) in compiled.matchers.iter().zip(&mut self.caps) {
                    for_each_match(&matcher.regex, caps, leaf.text, |pattern, start, end| {
                        let Some(&owner) = matcher.owners.get(pattern.as_usize()) else {
                            return;
                        };
                        if let Some(entry) = self.regex_matched.get_mut(owner) {
                            *entry = true;
                        }
                        let Some(&(active_slot, _)) = regex_slots.get(owner) else {
                            return;
                        };
                        let Some(guardrail) = active_indices
                            .get(active_slot)
                            .and_then(|&index| guardrails.get(index))
                        else {
                            return;
                        };
                        if guardrail.action != GuardrailAction::Redact {
                            return;
                        }
                        if start < end {
                            self.span_scratch.push(RedactionSpan {
                                start,
                                end,
                                priority: active_slot,
                                label: guardrail.redaction_label(),
                            });
                        } else if let Some(flag) = self.local_fail_closed.get_mut(active_slot) {
                            *flag = true;
                        }
                    });
                }
            }
            let Ok(redacted) = apply_local_leaf_redaction(
                body,
                leaf,
                &mut self.span_scratch,
                &mut self.local_redactions,
                &mut self.local_fail_closed,
                budget,
                &mut self.redaction_reservations,
            ) else {
                self.budget_exhausted = true;
                return;
            };
            // Send locally redacted text to external guardrails so local secrets
            // never leave the gateway and Bedrock anonymizations compose cleanly.
            let text_for_external = redacted.as_deref().unwrap_or(leaf.text);
            if has_external_enforce {
                if !text_for_external.is_empty()
                    && let Some(range) = raw_range(body, leaf.raw)
                {
                    self.external_blocks.push(ExternalBlock {
                        raw_range: range,
                        text: redacted.unwrap_or_else(|| leaf.text.to_owned()),
                    });
                }
            } else if has_external && !text_for_external.is_empty() {
                if !self.turn_text.is_empty() {
                    self.turn_text.push('\n');
                }
                self.turn_text.push_str(text_for_external);
            }
        })
        .is_err()
    }

    fn finish(mut self, unreadable: bool) -> Result<LocalScan, ResolutionError> {
        if self.budget_exhausted {
            return Err(ResolutionError::Busy);
        }
        let mut matched = vec![false; self.active_indices.len()];
        for (slot, &index) in self.active_indices.iter().enumerate() {
            let Some(guardrail) = self.guardrails.get(index) else {
                continue;
            };
            if matches!(guardrail.kind, GuardrailKind::FailClosed) {
                if let Some(entry) = matched.get_mut(slot) {
                    *entry = true;
                }
                if let Some(flag) = self.local_fail_closed.get_mut(slot) {
                    *flag = true;
                }
            }
        }
        for ((active_slot, _), is_match) in self.regex_slots.into_iter().zip(self.regex_matched) {
            if is_match && let Some(entry) = matched.get_mut(active_slot) {
                *entry = true;
            }
        }
        Ok(LocalScan {
            active_indices: self.active_indices,
            matched,
            local_fail_closed: self.local_fail_closed,
            unreadable,
            turn_text: self.turn_text,
            external_blocks: self.external_blocks,
            local_redactions: self.local_redactions,
            redaction_reservations: self.redaction_reservations,
        })
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

fn apply_local_leaf_redaction(
    body: &[u8],
    leaf: text::TextLeaf<'_>,
    span_scratch: &mut Vec<RedactionSpan<'_>>,
    local_redactions: &mut Vec<BodyEdit>,
    local_fail_closed: &mut [bool],
    budget: Option<&Arc<Semaphore>>,
    reservations: &mut Vec<MemoryReservation>,
) -> Result<Option<String>, ResolutionError> {
    if span_scratch.is_empty() {
        return Ok(None);
    }
    let Some(range) = raw_range(body, leaf.raw) else {
        mark_spans_fail_closed(span_scratch, local_fail_closed);
        return Ok(None);
    };
    let Some(capacity) = redact::prepare_redactions(leaf.text, span_scratch) else {
        mark_spans_fail_closed(span_scratch, local_fail_closed);
        return Ok(None);
    };
    reserve_redaction_bytes(budget, capacity, reservations)?;
    let redacted = redact::splice_merged_spans(leaf.text, span_scratch, capacity);
    if let Ok(replacement) = serde_json::to_vec(&redacted) {
        local_redactions.push(BodyEdit { range, replacement });
        Ok(Some(redacted))
    } else {
        mark_spans_fail_closed(span_scratch, local_fail_closed);
        Ok(None)
    }
}

fn mark_spans_fail_closed(spans: &[RedactionSpan<'_>], fail_closed: &mut [bool]) {
    for span in spans {
        if let Some(flag) = fail_closed.get_mut(span.priority) {
            *flag = true;
        }
    }
}

impl LocalScan {
    /// Applies anonymized outputs returned by enforcing external guardrails
    /// onto `self.local_redactions`. Marks `fail_closed_redact[slot] = true`
    /// when an external anonymization cannot be mapped to safe edits.
    fn apply_external_anonymizations(
        &mut self,
        guardrails: &[Guardrail],
        external_outcomes: &[(usize, ExternalOutcome)],
        fail_closed_redact: &mut [bool],
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<(), ResolutionError> {
        let mut per_block_masked: Vec<Option<String>> = vec![None; self.external_blocks.len()];

        for (slot, outcome) in external_outcomes {
            let Some(guardrail) = self
                .active_indices
                .get(*slot)
                .and_then(|&index| guardrails.get(index))
            else {
                continue;
            };
            if !guardrail.is_external_enforce() {
                continue;
            }
            let ExternalOutcome::Anonymized(outputs) = outcome else {
                continue;
            };
            if !apply_external_outputs(&self.external_blocks, outputs, &mut per_block_masked) {
                if let Some(flag) = fail_closed_redact.get_mut(*slot) {
                    *flag = true;
                }
                return Ok(());
            }
        }

        for (block, masked) in self.external_blocks.iter().zip(per_block_masked) {
            let Some(masked) = masked else {
                continue;
            };
            reserve_redaction_bytes(budget, masked.len(), &mut self.redaction_reservations)?;
            let Ok(replacement) = serde_json::to_vec(&masked) else {
                fail_closed_redact.fill(true);
                return Ok(());
            };
            if let Some(existing) = self
                .local_redactions
                .iter_mut()
                .find(|edit| edit.range == block.raw_range)
            {
                existing.replacement = replacement;
            } else {
                self.local_redactions.push(BodyEdit {
                    range: block.raw_range.clone(),
                    replacement,
                });
            }
        }
        Ok(())
    }
}

fn apply_external_outputs(
    blocks: &[ExternalBlock],
    outputs: &[String],
    per_block_masked: &mut [Option<String>],
) -> bool {
    if outputs.is_empty() {
        return false;
    }
    if outputs.len() == blocks.len() {
        return merge_masked_outputs(blocks, outputs.iter().map(String::as_str), per_block_masked);
    }
    // Joined single-block fallback when text field count exceeded MAX_BEDROCK_CONTENT_BLOCKS.
    // Partition the joined output by each block's line count so multiline
    // fields still map back 1:1 when anonymization preserves line structure.
    if outputs.len() == 1
        && let Some(single) = outputs.first()
    {
        let lines: Vec<&str> = single.split('\n').collect();
        let expected_lines: usize = blocks
            .iter()
            .map(|block| block.text.bytes().filter(|&b| b == b'\n').count() + 1)
            .sum();
        if lines.len() == expected_lines {
            let mut cursor = 0usize;
            let mut reconstructed = Vec::with_capacity(blocks.len());
            for block in blocks {
                let count = block.text.bytes().filter(|&b| b == b'\n').count() + 1;
                let Some(slice) = lines.get(cursor..cursor + count) else {
                    return false;
                };
                reconstructed.push(slice.join("\n"));
                cursor += count;
            }
            return merge_masked_outputs(
                blocks,
                reconstructed.iter().map(String::as_str),
                per_block_masked,
            );
        }
    }
    false
}

/// Applies per-block masked outputs without overwriting a conflicting masked
/// output from an earlier external guardrail (fails closed if two independent
/// provider outputs disagree on the same field).
fn merge_masked_outputs<'a>(
    blocks: &[ExternalBlock],
    outputs: impl Iterator<Item = &'a str>,
    per_block_masked: &mut [Option<String>],
) -> bool {
    let mut changed = false;
    for ((block, output), slot) in blocks.iter().zip(outputs).zip(per_block_masked.iter_mut()) {
        if output == block.text {
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
/// Uses `LeftmostFirst` with captures enabled so detection and `redact` span
/// extraction share one compiled cache and run in a single pass.
fn matcher(patterns: &[(usize, &String)]) -> Option<Matcher> {
    let regex = meta::Builder::new()
        .configure(
            meta::Config::new()
                .match_kind(MatchKind::LeftmostFirst)
                .utf8_empty(false)
                .which_captures(WhichCaptures::All),
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

fn floor_char_boundary(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_char_boundary(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while index < text.len() && !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

/// Walks every non-overlapping `LeftmostFirst` match of `regex` in `text`,
/// passing `(pattern_id, start, end)` aligned to UTF-8 char boundaries.
///
/// Patterns that use capture group 1 to exclude surrounding boundary characters
/// (such as keyword lists, custom secret prefixes, and compressed IPv6) report
/// only group 1 and resume right after it so adjacent tokens still match.
fn for_each_match(
    regex: &meta::Regex,
    caps: &mut Captures,
    text: &str,
    mut on_match: impl FnMut(PatternID, usize, usize),
) {
    let mut pos = 0usize;
    while pos <= text.len() {
        let input = Input::new(text.as_bytes()).range(pos..text.len());
        regex.captures(input, caps);
        let Some(full) = caps.get_match() else {
            break;
        };
        let pattern = full.pattern();
        let (raw_start, raw_end) = match caps.get_group(1) {
            Some(group1) => (group1.start, group1.end),
            None => (full.start(), full.end()),
        };
        let start = floor_char_boundary(text, raw_start);
        let end = ceil_char_boundary(text, raw_end);
        on_match(pattern, start, end);
        if raw_end > pos {
            pos = raw_end;
        } else if pos < text.len() {
            pos = ceil_char_boundary(text, pos.saturating_add(1));
        } else {
            break;
        }
    }
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
        let local = scan_local(
            guardrails,
            body,
            scanned,
            &last_turn(api_format, body, scanned),
            None,
        )
        .unwrap();
        finalize_outcome(local, guardrails, &[], None).unwrap()
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

    fn bedrock_enforce_guardrail(id: &str) -> Guardrail {
        Guardrail {
            id: id.into(),
            name: format!("{id} name"),
            action: GuardrailAction::Enforce,
            redaction_label: None,
            kind: GuardrailKind::Bedrock(BedrockGuardrail {
                guardrail_id: "abc123def".into(),
                guardrail_version: "1".into(),
                region: "us-east-1".into(),
                api_key: SecretString::from("token"),
            }),
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
    fn redacts_nested_message_content_and_multibyte_utf8() {
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
        assert_eq!(rewritten["messages"][0]["content"], "old a@example.com");
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
    fn redacts_leftmost_first_and_adjacent_matches_across_guardrails() {
        let body =
            r#"{"messages":[{"role":"user","content":"123-45-6789a@example.com secret-token"}]}"#;
        let outcome = check_request(
            &[
                redact_guardrail("first", "[FIRST]", &[r"123-45-6789", r"secret-token"]),
                redact_guardrail("overlap", "[OVERLAP]", &[r"123-45", r"45-6789"]),
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
    fn bedrock_enforce_applies_anonymized_outputs_and_blocks_on_block_or_failure() {
        let body = r#"{"messages":[{"role":"user","content":[{"type":"text","text":"Hi Alice, call 555-0199"},{"type":"text","text":"mail bob@example.com"}]}]}"#;
        let members = scanned(body, &["messages"]);
        let guardrails = [
            bedrock_enforce_guardrail("br"),
            redact_guardrail("email", "[EMAIL]", &[EMAIL]),
        ];

        // 1. Local regex redaction runs before Bedrock, so Bedrock receives the
        //    already-redacted block and its anonymized output composes cleanly.
        let local = scan_local(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let block_texts: Vec<&str> = local
            .external_blocks
            .iter()
            .map(|block| block.text.as_str())
            .collect();
        assert_eq!(block_texts, ["Hi Alice, call 555-0199", "mail [EMAIL]"]);
        let outcome = finalize_outcome(
            local,
            &guardrails,
            &[(
                0,
                ExternalOutcome::Anonymized(vec![
                    "Hi {NAME}, call {PHONE}".into(),
                    "mail [EMAIL]".into(),
                ]),
            )],
            None,
        )
        .unwrap();
        assert!(outcome.blocking().is_none());
        let (findings, edits, _) = outcome.into_parts();
        assert_eq!(findings.len(), 2);
        assert_eq!(
            findings.first().map(|finding| finding.action),
            Some(GuardrailAction::Redact)
        );
        assert_eq!(edits.len(), 2);
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        let content = &rewritten["messages"][0]["content"];
        assert_eq!(content[0]["text"], "Hi {NAME}, call {PHONE}");
        assert_eq!(content[1]["text"], "mail [EMAIL]");

        // 2. Blocked and Failed outcomes block the request and record action Block.
        for external in [ExternalOutcome::Blocked, ExternalOutcome::Failed] {
            let local = scan_local(
                &guardrails,
                body.as_bytes(),
                &members,
                &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
                None,
            )
            .unwrap();
            let outcome = finalize_outcome(local, &guardrails, &[(0, external)], None).unwrap();
            let blocking = outcome.blocking().expect("expected blocking finding");
            assert_eq!(blocking.id, "br");
            assert_eq!(blocking.action, GuardrailAction::Block);
        }
    }

    #[test]
    fn bedrock_enforce_handles_joined_multiline_outputs_and_conflicting_outputs() {
        let guardrails = [bedrock_enforce_guardrail("br")];
        let body = r#"{"messages":[{"role":"user","content":[{"type":"text","text":"line 1\ncall 555-0199"},{"type":"text","text":"line 3\nline 4"}]}]}"#;
        let members = scanned(body, &["messages"]);

        // 1. Joined single-block output maps back across multiline fields by line count.
        let local = scan_local(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        let outcome = finalize_outcome(
            local,
            &guardrails,
            &[(
                0,
                ExternalOutcome::Anonymized(vec!["line 1\ncall {PHONE}\nline 3\nline 4".into()]),
            )],
            None,
        )
        .unwrap();
        assert!(outcome.blocking().is_none());
        let (_, edits, _) = outcome.into_parts();
        assert_eq!(edits.len(), 1);
        let rewritten: serde_json::Value =
            serde_json::from_str(&apply_edits(body, &edits)).unwrap();
        let content = &rewritten["messages"][0]["content"];
        assert_eq!(content[0]["text"], "line 1\ncall {PHONE}");
        assert_eq!(content[1]["text"], "line 3\nline 4");

        // 2. Two enforcing Bedrock guardrails returning conflicting outputs fail closed.
        let single =
            r#"{"messages":[{"role":"user","content":"mail alice@example.com or call 555-0199"}]}"#;
        let single_members = scanned(single, &["messages"]);
        let pair = [
            bedrock_enforce_guardrail("br-email"),
            bedrock_enforce_guardrail("br-phone"),
        ];
        let local = scan_local(
            &pair,
            single.as_bytes(),
            &single_members,
            &last_turn(
                ApiFormat::OpenAiChatCompletions,
                single.as_bytes(),
                &single_members,
            ),
            None,
        )
        .unwrap();
        let outcome = finalize_outcome(
            local,
            &pair,
            &[
                (
                    0,
                    ExternalOutcome::Anonymized(vec!["mail {EMAIL} or call 555-0199".into()]),
                ),
                (
                    1,
                    ExternalOutcome::Anonymized(vec![
                        "mail alice@example.com or call {PHONE}".into(),
                    ]),
                ),
            ],
            None,
        )
        .unwrap();
        let blocking = outcome
            .blocking()
            .expect("expected conflicting outputs to block");
        assert_eq!(blocking.id, "br-phone");
        assert_eq!(blocking.action, GuardrailAction::Block);
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

    fn collect_pattern_spans<'a>(
        pattern: &str,
        text: &str,
        label: &'a str,
    ) -> Vec<RedactionSpan<'a>> {
        let pattern = pattern.to_owned();
        let compiled = matcher(&[(0, &pattern)]).unwrap();
        let mut caps = compiled.regex.create_captures();
        let mut spans = Vec::new();
        for_each_match(&compiled.regex, &mut caps, text, |_, start, end| {
            if start < end {
                spans.push(RedactionSpan {
                    start,
                    end,
                    priority: 0,
                    label,
                });
            }
        });
        spans
    }

    #[test]
    fn capture_group_1_preserves_surrounding_boundaries_and_catches_adjacent_words() {
        let pattern = r"(?:^|[^A-Za-z0-9_])((?:[Ff][Oo][Oo]|[Bb][Aa][Rr]))(?:$|[^A-Za-z0-9_])";
        let text = "foo bar,foo! café foo日本語bar";
        let mut spans = collect_pattern_spans(pattern, text, "[WORD]");
        assert_eq!(
            redact::apply_redactions(text, &mut spans).as_deref(),
            Some("[WORD] [WORD],[WORD]! café [WORD]日本語[WORD]")
        );
    }

    #[test]
    fn regex_with_multibyte_utf8_never_splits_codepoints() {
        let pattern = r"(?:^|[^A-Za-z0-9_-])(acme_[A-Za-z0-9_-]{16,})(?:$|[^A-Za-z0-9_-])";
        let text = "鍵acme_1234567890abcdef🔑";
        let mut spans = collect_pattern_spans(pattern, text, "[KEY]");
        assert_eq!(
            redact::apply_redactions(text, &mut spans).as_deref(),
            Some("鍵[KEY]🔑")
        );
    }

    #[test]
    fn private_key_pattern_redacts_multiline_and_json_escaped_pem_blocks_linearly() {
        let pattern = r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----(?:(?:\s|\\[nr])+(?:[A-Za-z0-9+/=:, \t\r\n\\]|-[A-Za-z0-9])*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)?";

        // Real newlines with encrypted PEM headers.
        let text = "before\n-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,AABB\n\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\nafter";
        let mut spans = collect_pattern_spans(pattern, text, "[KEY]");
        assert_eq!(
            redact::apply_redactions(text, &mut spans).as_deref(),
            Some("before\n[KEY]\nafter")
        );

        // Literal `\n` escapes as pasted from service-account JSON or `.env`.
        let escaped = r#"{"private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvAIBADAN\n-----END PRIVATE KEY-----\n"}"#;
        let mut spans = collect_pattern_spans(pattern, escaped, "[KEY]");
        assert_eq!(
            redact::apply_redactions(escaped, &mut spans).as_deref(),
            Some(r#"{"private_key":"[KEY]\n"}"#)
        );

        // Repeated BEGIN headers without END stay linear time and match each header.
        let repeated = "-----BEGIN PRIVATE KEY-----\n".repeat(200);
        let spans = collect_pattern_spans(pattern, &repeated, "[KEY]");
        assert_eq!(spans.len(), 200);
    }
}
