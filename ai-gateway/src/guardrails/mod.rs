//! Guardrails: rules from the control plane checked against the last turn of a
//! request before it reaches the provider. A `block` guardrail that matches
//! refuses the request; a `log` guardrail that matches marks its generation; a
//! `redact` guardrail replaces matched spans in the request before forwarding;
//! an `enforce` external guardrail follows the provider's block or anonymize
//! verdict. Each API format's capture module finds the last turn
//! (`capture::guardrail_turn`).
pub(crate) mod bedrock;
pub(crate) mod external;
pub(crate) mod redact;
mod regex;
pub(crate) mod text;

use std::{ops::Range, sync::Arc, time::Duration};

use regex_automata::util::captures::Captures;
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
use regex::Compiled;
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

    /// Evaluates the request's last turn with the guardrails resolved for its
    /// key. Local regexes run first (applying local redactions immediately);
    /// external guardrails run afterward unless a local block already fired.
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
            let check_started = std::time::Instant::now();
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
                        let local = apply_local_guardrails(
                            &guardrails,
                            &body,
                            &scanned,
                            &turn,
                            Some(&budget),
                        );
                        (local, started.elapsed())
                    }
                })
                .await
                .ok_or(ResolutionError::Busy)?;
            let mut local = local?;
            let local_duration = finding + scanning;
            let (external_outcomes, external_duration) = if !local.unreadable
                && !local.has_local_block(&guardrails)
                && !local.external_blocks.is_empty()
            {
                self.evaluate_external(
                    &local.external_targets(&guardrails),
                    &mut local,
                    &mut turn_text_reservation,
                    &organization_id,
                )
                .await?
            } else {
                drop(turn_text_reservation);
                (Vec::new(), None)
            };
            let outcome = finalize_outcome(
                local,
                &guardrails,
                &external_outcomes,
                Some(&self.memory_budget),
            )?;
            crate::observability::guardrails_checked(
                &organization_id,
                crate::observability::GuardrailTimings {
                    total: check_started.elapsed(),
                    local: local_duration,
                    external: external_duration,
                },
                bytes,
            );
            Ok(outcome)
        }
        .instrument(tracing::info_span!(
            "request.guardrails",
            otel.kind = "internal"
        ))
        .await
    }

    /// Runs enforcing external guardrails sequentially so each sees the prior
    /// guardrail's anonymized text and blocks short-circuit the rest, then runs
    /// any observing (`log`/`block`) external guardrails concurrently.
    async fn evaluate_external(
        &self,
        targets: &[(usize, &Guardrail)],
        local: &mut LocalEvaluation,
        turn_text_reservation: &mut Option<MemoryReservation>,
        organization_id: &str,
    ) -> Result<(Vec<(usize, ExternalOutcome)>, Option<Duration>), ResolutionError> {
        if targets.is_empty() {
            local.external_blocks.clear();
            drop(turn_text_reservation.take());
            return Ok((Vec::new(), None));
        }
        let (enforcing, observing): (Vec<_>, Vec<_>) = targets
            .iter()
            .copied()
            .partition(|(_, guardrail)| guardrail.is_external_enforce());
        let started = std::time::Instant::now();
        let mut outcomes = Vec::with_capacity(targets.len());
        let mut blocked = false;

        for &(slot, guardrail) in &enforcing {
            let payload_reservation = self.reserve_external_payload(&local.external_blocks)?;
            let payloads = serialize_external_blocks(&[guardrail], &local.external_blocks);
            let outcome = self
                .external
                .evaluate_one(guardrail, &payloads, organization_id)
                .await;
            drop(payload_reservation);
            match outcome {
                ExternalOutcome::None => outcomes.push((slot, ExternalOutcome::None)),
                ExternalOutcome::Blocked | ExternalOutcome::Failed => {
                    outcomes.push((slot, outcome));
                    blocked = true;
                    break;
                }
                ExternalOutcome::Anonymized(outputs) => {
                    if apply_anonymized_outputs(&mut local.external_blocks, &outputs) {
                        outcomes.push((slot, ExternalOutcome::Anonymized(Vec::new())));
                    } else {
                        outcomes.push((slot, ExternalOutcome::Blocked));
                        blocked = true;
                        break;
                    }
                }
            }
        }

        if !blocked && !observing.is_empty() {
            let guardrails: Vec<&Guardrail> =
                observing.iter().map(|(_, guardrail)| *guardrail).collect();
            let payload_reservation = self.reserve_external_payload(&local.external_blocks)?;
            let payloads = serialize_external_blocks(&guardrails, &local.external_blocks);
            // Drop text blocks before awaiting I/O when no enforcing rule needs them afterward.
            if enforcing.is_empty() {
                local.external_blocks.clear();
                drop(turn_text_reservation.take());
            }
            let results = self
                .external
                .evaluate_many(&guardrails, &payloads, organization_id)
                .await;
            drop(payload_reservation);
            outcomes.extend(
                observing
                    .iter()
                    .zip(results)
                    .map(|(&(slot, _), outcome)| (slot, outcome)),
            );
        }
        Ok((outcomes, Some(started.elapsed())))
    }

    fn reserve_external_payload(
        &self,
        blocks: &[ExternalBlock],
    ) -> Result<MemoryReservation, ResolutionError> {
        let bytes: usize = blocks.iter().map(|block| block.text.len()).sum();
        MemoryReservation::from_budget(&self.memory_budget, bytes.saturating_add(64), "guardrails")
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
/// request body edits produced by `redact` or `enforce` guardrails.
#[derive(Default)]
pub(crate) struct Outcome {
    findings: Vec<Finding>,
    blocked_index: Option<usize>,
    redactions: Vec<BodyEdit>,
    redaction_reservations: Vec<MemoryReservation>,
}

impl Outcome {
    /// The first blocking guardrail that matched, or the first `redact` /
    /// `enforce` rule that failed closed.
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

/// Evaluation state for one active guardrail, in resolution order.
struct RuleState {
    guardrail_index: usize,
    matched: bool,
    fail_closed: bool,
}

impl RuleState {
    fn blocks(&self, guardrail: &Guardrail) -> bool {
        match guardrail.action {
            GuardrailAction::Block => true,
            GuardrailAction::Redact | GuardrailAction::Enforce => self.fail_closed,
            GuardrailAction::Log | GuardrailAction::Unknown => false,
        }
    }
}

/// One non-empty JSON string field sent to external guardrails (after any local
/// regex redaction) so anonymized outputs can be chained across providers and
/// spliced back into the request body.
struct ExternalBlock {
    raw_range: Range<usize>,
    text: String,
    modified: bool,
}

/// Result of the CPU-bound local pass: per-rule state, local redaction edits,
/// and the last turn's text blocks when external guardrails also run.
struct LocalEvaluation {
    rules: Vec<RuleState>,
    unreadable: bool,
    external_blocks: Vec<ExternalBlock>,
    local_redactions: Vec<BodyEdit>,
    redaction_reservations: Vec<MemoryReservation>,
}

impl LocalEvaluation {
    fn has_local_block(&self, guardrails: &[Guardrail]) -> bool {
        self.rules.iter().any(|rule| {
            rule.matched
                && guardrails
                    .get(rule.guardrail_index)
                    .is_some_and(|guardrail| rule.blocks(guardrail))
        })
    }

    fn any_blocking(&self, guardrails: &[Guardrail]) -> bool {
        self.rules.iter().any(|rule| {
            (self.unreadable || rule.matched)
                && guardrails
                    .get(rule.guardrail_index)
                    .is_some_and(|guardrail| rule.blocks(guardrail))
        })
    }

    fn external_targets<'a>(&self, guardrails: &'a [Guardrail]) -> Vec<(usize, &'a Guardrail)> {
        self.rules
            .iter()
            .enumerate()
            .filter_map(|(slot, rule)| {
                let guardrail = guardrails.get(rule.guardrail_index)?;
                guardrail.is_external().then_some((slot, guardrail))
            })
            .collect()
    }

    /// Applies any remaining anonymized outputs sequentially onto
    /// `self.external_blocks` and emits updated [`BodyEdit`] entries for every
    /// externally modified block.
    fn apply_external_anonymizations(
        &mut self,
        guardrails: &[Guardrail],
        external_outcomes: &[(usize, ExternalOutcome)],
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<(), ResolutionError> {
        for (slot, outcome) in external_outcomes {
            let Some(rule) = self.rules.get_mut(*slot) else {
                continue;
            };
            let Some(guardrail) = guardrails.get(rule.guardrail_index) else {
                continue;
            };
            if !guardrail.is_external_enforce() {
                continue;
            }
            let ExternalOutcome::Anonymized(outputs) = outcome else {
                continue;
            };
            if !outputs.is_empty() && !apply_anonymized_outputs(&mut self.external_blocks, outputs)
            {
                rule.fail_closed = true;
                return Ok(());
            }
        }

        for block in &self.external_blocks {
            if !block.modified {
                continue;
            }
            reserve_redaction_bytes(budget, block.text.len(), &mut self.redaction_reservations)?;
            let Ok(replacement) = serde_json::to_vec(&block.text) else {
                for rule in &mut self.rules {
                    rule.fail_closed = true;
                }
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

/// Combines local regex evaluation results and external guardrail outcomes into
/// the final [`Outcome`], preserving guardrail resolution order.
fn finalize_outcome(
    mut local: LocalEvaluation,
    guardrails: &[Guardrail],
    external_outcomes: &[(usize, ExternalOutcome)],
    budget: Option<&Arc<Semaphore>>,
) -> Result<Outcome, ResolutionError> {
    if local.unreadable {
        for rule in &mut local.rules {
            rule.fail_closed = true;
        }
    }
    for (slot, outcome) in external_outcomes {
        if let Some(rule) = local.rules.get_mut(*slot) {
            if outcome.is_match() {
                rule.matched = true;
            }
            if matches!(outcome, ExternalOutcome::Blocked | ExternalOutcome::Failed) {
                rule.fail_closed = true;
            }
        }
    }

    let redactions = if local.unreadable || local.any_blocking(guardrails) {
        Vec::new()
    } else {
        if !local.external_blocks.is_empty() {
            local.apply_external_anonymizations(guardrails, external_outcomes, budget)?;
        }
        local.local_redactions
    };

    let mut findings = Vec::new();
    let mut blocked_index = None;
    for rule in &local.rules {
        if !local.unreadable && !rule.matched {
            continue;
        }
        let Some(guardrail) = guardrails.get(rule.guardrail_index) else {
            continue;
        };
        let blocks = rule.blocks(guardrail);
        if blocks && blocked_index.is_none() {
            blocked_index = Some(findings.len());
        }
        let action = if guardrail.action == GuardrailAction::Enforce {
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
            action,
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

/// Runs the local regex guardrails against `turn` (applying local redactions
/// immediately) and, when any active external guardrail is present, collects
/// the last turn's text blocks in the same pass.
fn apply_local_guardrails(
    guardrails: &[Guardrail],
    body: &[u8],
    scanned: &ScannedMembers,
    turn: &Result<LastTurn, Unreadable>,
    budget: Option<&Arc<Semaphore>>,
) -> Result<LocalEvaluation, ResolutionError> {
    let rules: Vec<RuleState> = guardrails
        .iter()
        .enumerate()
        .filter_map(|(guardrail_index, guardrail)| {
            guardrail.is_active().then_some(RuleState {
                guardrail_index,
                matched: false,
                fail_closed: false,
            })
        })
        .collect();
    if rules.is_empty() {
        return Ok(LocalEvaluation {
            rules,
            unreadable: false,
            external_blocks: Vec::new(),
            local_redactions: Vec::new(),
            redaction_reservations: Vec::new(),
        });
    }
    let mut regex_slots: Vec<(usize, &[String])> = rules
        .iter()
        .enumerate()
        .filter_map(|(slot, rule)| {
            let patterns = guardrails.get(rule.guardrail_index)?.regex_patterns()?;
            Some((slot, patterns))
        })
        .collect();
    // Put `block` rules ahead of `redact`/`log` so `LeftmostFirst` tie-breaking
    // favors blocking when two rules match at the exact same starting byte.
    regex_slots.sort_by_key(|&(slot, _)| {
        usize::from(
            rules
                .get(slot)
                .and_then(|rule| guardrails.get(rule.guardrail_index))
                .is_none_or(|guardrail| guardrail.action != GuardrailAction::Block),
        )
    });
    let has_external = rules.iter().any(|rule| {
        guardrails
            .get(rule.guardrail_index)
            .is_some_and(Guardrail::is_external)
    });
    let compiled = (!regex_slots.is_empty()).then(|| regex::compiled(&regex_slots));

    let mut state = LocalEvalState::new(
        guardrails,
        rules,
        regex_slots,
        compiled,
        body,
        has_external,
        budget,
    );
    let unreadable = turn
        .as_ref()
        .map_or(true, |turn| state.evaluate_turn(turn, scanned));
    state.finish(unreadable)
}

struct LocalEvalState<'g, 'b> {
    guardrails: &'g [Guardrail],
    rules: Vec<RuleState>,
    regex_slots: Vec<(usize, &'g [String])>,
    compiled: Option<Arc<Compiled>>,
    body: &'b [u8],
    has_external: bool,
    budget: Option<&'b Arc<Semaphore>>,
    budget_exhausted: bool,
    caps: Vec<Captures>,
    span_scratch: Vec<RedactionSpan<'g>>,
    external_blocks: Vec<ExternalBlock>,
    local_redactions: Vec<BodyEdit>,
    redaction_reservations: Vec<MemoryReservation>,
}

impl<'g, 'b> LocalEvalState<'g, 'b> {
    fn new(
        guardrails: &'g [Guardrail],
        rules: Vec<RuleState>,
        regex_slots: Vec<(usize, &'g [String])>,
        compiled: Option<Arc<Compiled>>,
        body: &'b [u8],
        has_external: bool,
        budget: Option<&'b Arc<Semaphore>>,
    ) -> Self {
        let caps = compiled.as_ref().map_or_else(Vec::new, |compiled| {
            compiled
                .matchers
                .iter()
                .map(|matcher| matcher.regex.create_captures())
                .collect()
        });
        Self {
            guardrails,
            rules,
            regex_slots,
            compiled,
            body,
            has_external,
            budget,
            budget_exhausted: false,
            caps,
            span_scratch: Vec::new(),
            external_blocks: Vec::new(),
            local_redactions: Vec::new(),
            redaction_reservations: Vec::new(),
        }
    }

    fn evaluate_turn(&mut self, turn: &LastTurn, scanned: &ScannedMembers) -> bool {
        let guardrails = self.guardrails;
        let regex_slots = &self.regex_slots;
        let compiled = self.compiled.as_deref();
        let body = self.body;
        let has_external = self.has_external;
        let budget = self.budget;
        turn.read_leaves(member(body, scanned), &mut |leaf| {
            if self.budget_exhausted {
                return;
            }
            self.span_scratch.clear();
            if let Some(compiled) = compiled {
                for (matcher, caps) in compiled.matchers.iter().zip(&mut self.caps) {
                    regex::for_each_match(
                        &matcher.regex,
                        caps,
                        leaf.text,
                        |pattern, start, end| {
                            let Some(&(slot, _)) = matcher
                                .owners
                                .get(pattern.as_usize())
                                .and_then(|&owner| regex_slots.get(owner))
                            else {
                                return;
                            };
                            let Some(rule) = self.rules.get_mut(slot) else {
                                return;
                            };
                            rule.matched = true;
                            let Some(guardrail) = guardrails.get(rule.guardrail_index) else {
                                return;
                            };
                            if guardrail.action != GuardrailAction::Redact {
                                return;
                            }
                            if start < end {
                                self.span_scratch.push(RedactionSpan {
                                    start,
                                    end,
                                    priority: slot,
                                    label: guardrail.redaction_label(),
                                });
                            } else {
                                rule.fail_closed = true;
                            }
                        },
                    );
                }
            }
            let Ok(redacted) = apply_local_leaf_redaction(
                body,
                leaf,
                &mut self.span_scratch,
                &mut self.local_redactions,
                &mut self.rules,
                budget,
                &mut self.redaction_reservations,
            ) else {
                self.budget_exhausted = true;
                return;
            };
            // Send locally redacted text to external guardrails so local secrets
            // never leave the gateway and Bedrock anonymizations compose cleanly.
            if has_external {
                let text = redacted.unwrap_or_else(|| leaf.text.to_owned());
                if !text.is_empty()
                    && let Some(range) = raw_range(body, leaf.raw)
                {
                    self.external_blocks.push(ExternalBlock {
                        raw_range: range,
                        text,
                        modified: false,
                    });
                }
            }
        })
        .is_err()
    }

    fn finish(mut self, unreadable: bool) -> Result<LocalEvaluation, ResolutionError> {
        if self.budget_exhausted {
            return Err(ResolutionError::Busy);
        }
        for rule in &mut self.rules {
            if self
                .guardrails
                .get(rule.guardrail_index)
                .is_some_and(|guardrail| matches!(guardrail.kind, GuardrailKind::FailClosed))
            {
                rule.matched = true;
                rule.fail_closed = true;
            }
        }
        Ok(LocalEvaluation {
            rules: self.rules,
            unreadable,
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
    rules: &mut [RuleState],
    budget: Option<&Arc<Semaphore>>,
    reservations: &mut Vec<MemoryReservation>,
) -> Result<Option<String>, ResolutionError> {
    if span_scratch.is_empty() {
        return Ok(None);
    }
    let Some(range) = raw_range(body, leaf.raw) else {
        mark_spans_fail_closed(span_scratch, rules);
        return Ok(None);
    };
    let Some(capacity) = redact::prepare_redactions(leaf.text, span_scratch) else {
        mark_spans_fail_closed(span_scratch, rules);
        return Ok(None);
    };
    reserve_redaction_bytes(budget, capacity, reservations)?;
    let redacted = redact::splice_merged_spans(leaf.text, span_scratch, capacity);
    if let Ok(replacement) = serde_json::to_vec(&redacted) {
        local_redactions.push(BodyEdit { range, replacement });
        Ok(Some(redacted))
    } else {
        mark_spans_fail_closed(span_scratch, rules);
        Ok(None)
    }
}

fn mark_spans_fail_closed(spans: &[RedactionSpan<'_>], rules: &mut [RuleState]) {
    for span in spans {
        if let Some(rule) = rules.get_mut(span.priority) {
            rule.fail_closed = true;
        }
    }
}

/// Applies one enforcing external guardrail's anonymized `outputs` in place onto
/// `blocks`. Returns `false` if the outputs cannot be mapped 1:1 onto `blocks`
/// or left every block unchanged despite `GUARDRAIL_INTERVENED`.
fn apply_anonymized_outputs(blocks: &mut [ExternalBlock], outputs: &[String]) -> bool {
    if outputs.is_empty() {
        return false;
    }
    if outputs.len() == blocks.len() {
        return update_blocks_in_place(blocks, outputs.iter().map(String::as_str));
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
            for block in &*blocks {
                let count = block.text.bytes().filter(|&b| b == b'\n').count() + 1;
                let Some(slice) = lines.get(cursor..cursor + count) else {
                    return false;
                };
                reconstructed.push(slice.join("\n"));
                cursor += count;
            }
            return update_blocks_in_place(blocks, reconstructed.iter().map(String::as_str));
        }
    }
    false
}

fn update_blocks_in_place<'a>(
    blocks: &mut [ExternalBlock],
    outputs: impl Iterator<Item = &'a str>,
) -> bool {
    let mut changed = false;
    for (block, output) in blocks.iter_mut().zip(outputs) {
        if output == block.text {
            continue;
        }
        block.text.clear();
        block.text.push_str(output);
        block.modified = true;
        changed = true;
    }
    changed
}

#[cfg(test)]
mod tests;
