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

use regex_automata::{Input, PatternSet, util::captures::Captures};
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
            let mut eval = local?;
            let local_duration = finding + scanning;
            let external_duration = if !eval.is_blocking() && !eval.blocks.is_empty() {
                self.evaluate_external(
                    &guardrails,
                    &mut eval,
                    &mut turn_text_reservation,
                    &organization_id,
                )
                .await?
            } else {
                drop(turn_text_reservation);
                None
            };
            let outcome = eval.finalize(&guardrails, Some(&self.memory_budget))?;
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
        guardrails: &[Guardrail],
        eval: &mut GuardrailEvaluation,
        turn_text_reservation: &mut Option<MemoryReservation>,
        organization_id: &str,
    ) -> Result<Option<Duration>, ResolutionError> {
        let targets = eval.external_targets(guardrails);
        if targets.is_empty() {
            eval.blocks.retain_modified();
            drop(turn_text_reservation.take());
            return Ok(None);
        }
        let (enforcing, observing): (Vec<_>, Vec<_>) = targets
            .into_iter()
            .partition(|(_, guardrail)| guardrail.is_external_enforce());
        let started = std::time::Instant::now();

        for (slot, guardrail) in enforcing {
            let payload_reservation = self.reserve_external_payload(&eval.blocks)?;
            let payloads = eval.blocks.serialize_for(&[guardrail]);
            let outcome = self
                .external
                .evaluate_one(guardrail, &payloads, organization_id)
                .await;
            drop(payload_reservation);
            if eval.apply_external(slot, guardrail, &outcome) {
                return Ok(Some(started.elapsed()));
            }
        }

        if !observing.is_empty() {
            let batch: Vec<&Guardrail> =
                observing.iter().map(|(_, guardrail)| *guardrail).collect();
            let payload_reservation = self.reserve_external_payload(&eval.blocks)?;
            let payloads = eval.blocks.serialize_for(&batch);
            // Free unchanged text blocks before awaiting I/O; no further enforcing rule reads them.
            eval.blocks.retain_modified();
            drop(turn_text_reservation.take());
            let results = self
                .external
                .evaluate_many(&batch, &payloads, organization_id)
                .await;
            drop(payload_reservation);
            for ((slot, guardrail), outcome) in observing.into_iter().zip(results) {
                eval.apply_external(slot, guardrail, &outcome);
            }
        }
        Ok(Some(started.elapsed()))
    }

    fn reserve_external_payload(
        &self,
        blocks: &TurnBlocks,
    ) -> Result<MemoryReservation, ResolutionError> {
        MemoryReservation::from_budget(
            &self.memory_budget,
            blocks.text_bytes().saturating_add(64),
            "guardrails",
        )
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
        self.is_external() && self.action == GuardrailAction::Enforce
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

/// Resolved per-rule outcome across local and external stages, ordered by severity.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum RuleVerdict {
    None,
    Log,
    Redact,
    Block,
}

impl RuleVerdict {
    fn from_local_match(action: GuardrailAction) -> Self {
        match action {
            GuardrailAction::Block | GuardrailAction::Enforce => Self::Block,
            GuardrailAction::Redact => Self::Redact,
            GuardrailAction::Log => Self::Log,
            GuardrailAction::Unknown => Self::None,
        }
    }

    fn from_fail_closed(action: GuardrailAction) -> Self {
        match action {
            GuardrailAction::Log => Self::Log,
            GuardrailAction::Block | GuardrailAction::Redact | GuardrailAction::Enforce => {
                Self::Block
            }
            GuardrailAction::Unknown => Self::None,
        }
    }

    fn from_external(action: GuardrailAction, outcome: &ExternalOutcome) -> Self {
        match outcome {
            ExternalOutcome::None => Self::None,
            ExternalOutcome::Blocked | ExternalOutcome::Failed => Self::from_fail_closed(action),
            ExternalOutcome::Anonymized(_) => match action {
                GuardrailAction::Log => Self::Log,
                GuardrailAction::Block => Self::Block,
                GuardrailAction::Redact | GuardrailAction::Enforce => Self::Redact,
                GuardrailAction::Unknown => Self::None,
            },
        }
    }

    fn to_finding_action(self, configured: GuardrailAction) -> Option<GuardrailAction> {
        match self {
            Self::None => None,
            Self::Log => Some(GuardrailAction::Log),
            Self::Redact => Some(GuardrailAction::Redact),
            Self::Block => Some(match configured {
                GuardrailAction::Redact => GuardrailAction::Redact,
                GuardrailAction::Block
                | GuardrailAction::Enforce
                | GuardrailAction::Log
                | GuardrailAction::Unknown => GuardrailAction::Block,
            }),
        }
    }

    fn escalate(&mut self, next: Self) {
        if next > *self {
            *self = next;
        }
    }
}

/// Evaluation state for one active guardrail, in resolution order.
struct RuleState {
    guardrail_index: usize,
    verdict: RuleVerdict,
}

/// Tracks whether a turn block needs a [`BodyEdit`] emitted at finalization and
/// whether its replacement bytes were already reserved during local redaction.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BlockMutation {
    Unchanged,
    Local,
    External,
}

struct TurnBlock {
    raw_range: Range<usize>,
    text: String,
    mutation: BlockMutation,
}

/// Last-turn text blocks carried across local redaction and external guardrail
/// stages so `BodyEdit`s are emitted once at finalization with no duplicate merge.
#[derive(Default)]
struct TurnBlocks(Vec<TurnBlock>);

impl TurnBlocks {
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    fn text_bytes(&self) -> usize {
        self.0.iter().map(|block| block.text.len()).sum()
    }

    fn push(&mut self, raw_range: Range<usize>, text: String, mutation: BlockMutation) {
        self.0.push(TurnBlock {
            raw_range,
            text,
            mutation,
        });
    }

    fn clear(&mut self) {
        self.0.clear();
    }

    fn retain_modified(&mut self) {
        self.0
            .retain(|block| block.mutation != BlockMutation::Unchanged);
    }

    fn serialize_for(&self, guardrails: &[&Guardrail]) -> ExternalPayloads {
        if self.0.len() <= bedrock::MAX_BEDROCK_CONTENT_BLOCKS {
            let texts: Vec<&str> = self.0.iter().map(|block| block.text.as_str()).collect();
            return ExternalPayloads::for_guardrails(guardrails, &texts);
        }
        let total = self.0.iter().map(|block| block.text.len() + 1).sum();
        let mut joined = String::with_capacity(total);
        for block in &self.0 {
            if !joined.is_empty() {
                joined.push('\n');
            }
            joined.push_str(&block.text);
        }
        ExternalPayloads::for_guardrails(guardrails, &[joined.as_str()])
    }

    /// Applies one enforcing external guardrail's anonymized `outputs` in place.
    /// Returns `false` if the outputs cannot be mapped 1:1 or changed nothing.
    fn apply_anonymized(&mut self, outputs: &[String]) -> bool {
        if outputs.is_empty() {
            return false;
        }
        if outputs.len() == self.0.len() {
            return self.update_in_place(outputs.iter().map(String::as_str));
        }
        // Joined single-block fallback when text field count exceeded MAX_BEDROCK_CONTENT_BLOCKS.
        // Partition by each block's line count so multiline fields still map back 1:1.
        if outputs.len() == 1
            && let Some(single) = outputs.first()
        {
            let lines: Vec<&str> = single.split('\n').collect();
            let expected_lines: usize = self
                .0
                .iter()
                .map(|block| block.text.bytes().filter(|&b| b == b'\n').count() + 1)
                .sum();
            if lines.len() == expected_lines {
                let mut cursor = 0usize;
                let mut reconstructed = Vec::with_capacity(self.0.len());
                for block in &self.0 {
                    let count = block.text.bytes().filter(|&b| b == b'\n').count() + 1;
                    let Some(slice) = lines.get(cursor..cursor + count) else {
                        return false;
                    };
                    reconstructed.push(slice.join("\n"));
                    cursor += count;
                }
                return self.update_in_place(reconstructed.iter().map(String::as_str));
            }
        }
        false
    }

    fn update_in_place<'a>(&mut self, outputs: impl Iterator<Item = &'a str>) -> bool {
        let mut changed = false;
        for (block, output) in self.0.iter_mut().zip(outputs) {
            if output == block.text {
                continue;
            }
            block.text.clear();
            block.text.push_str(output);
            block.mutation = BlockMutation::External;
            changed = true;
        }
        changed
    }

    fn into_body_edits(
        self,
        budget: Option<&Arc<Semaphore>>,
        reservations: &mut Vec<MemoryReservation>,
    ) -> Result<Option<Vec<BodyEdit>>, ResolutionError> {
        let mut edits = Vec::new();
        for block in self.0 {
            match block.mutation {
                BlockMutation::Unchanged => continue,
                BlockMutation::Local => {}
                BlockMutation::External => {
                    reserve_redaction_bytes(budget, block.text.len(), reservations)?;
                }
            }
            let Ok(replacement) = serde_json::to_vec(&block.text) else {
                return Ok(None);
            };
            edits.push(BodyEdit {
                range: block.raw_range,
                replacement,
            });
        }
        Ok(Some(edits))
    }

    #[cfg(test)]
    fn texts(&self) -> Vec<&str> {
        self.0.iter().map(|block| block.text.as_str()).collect()
    }
}

/// Evaluation state accumulated across local regex and external guardrail stages.
struct GuardrailEvaluation {
    rules: Vec<RuleState>,
    blocks: TurnBlocks,
    redaction_reservations: Vec<MemoryReservation>,
}

impl GuardrailEvaluation {
    fn is_blocking(&self) -> bool {
        self.rules
            .iter()
            .any(|rule| rule.verdict == RuleVerdict::Block)
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

    /// Records one external guardrail outcome and applies any anonymized text
    /// onto `self.blocks`. Returns `true` when the guardrail blocked the request.
    fn apply_external(
        &mut self,
        slot: usize,
        guardrail: &Guardrail,
        outcome: &ExternalOutcome,
    ) -> bool {
        let Some(rule) = self.rules.get_mut(slot) else {
            return false;
        };
        let mut verdict = RuleVerdict::from_external(guardrail.action, outcome);
        if guardrail.is_external_enforce()
            && let ExternalOutcome::Anonymized(outputs) = outcome
            && !self.blocks.apply_anonymized(outputs)
        {
            verdict = RuleVerdict::from_fail_closed(guardrail.action);
        }
        rule.verdict.escalate(verdict);
        rule.verdict == RuleVerdict::Block
    }

    /// Converts the evaluated verdicts and modified blocks into the final
    /// [`Outcome`], preserving guardrail resolution order.
    fn finalize(
        mut self,
        guardrails: &[Guardrail],
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<Outcome, ResolutionError> {
        let mut redactions = if self.is_blocking() {
            Vec::new()
        } else if let Some(edits) = self
            .blocks
            .into_body_edits(budget, &mut self.redaction_reservations)?
        {
            edits
        } else {
            for rule in &mut self.rules {
                if let Some(guardrail) = guardrails.get(rule.guardrail_index) {
                    rule.verdict
                        .escalate(RuleVerdict::from_fail_closed(guardrail.action));
                }
            }
            Vec::new()
        };

        let mut findings = Vec::new();
        let mut blocked_index = None;
        for rule in &self.rules {
            let Some(guardrail) = guardrails.get(rule.guardrail_index) else {
                continue;
            };
            let Some(action) = rule.verdict.to_finding_action(guardrail.action) else {
                continue;
            };
            if rule.verdict == RuleVerdict::Block && blocked_index.is_none() {
                blocked_index = Some(findings.len());
            }
            findings.push(Finding {
                id: guardrail.id.clone(),
                name: guardrail.name.clone(),
                action,
                location: GuardrailLocation::Request,
            });
        }

        let redaction_reservations = if blocked_index.is_some() {
            redactions.clear();
            Vec::new()
        } else {
            self.redaction_reservations
        };
        Ok(Outcome {
            findings,
            blocked_index,
            redactions,
            redaction_reservations,
        })
    }
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
) -> Result<GuardrailEvaluation, ResolutionError> {
    let rules: Vec<RuleState> = guardrails
        .iter()
        .enumerate()
        .filter_map(|(guardrail_index, guardrail)| {
            guardrail.is_active().then_some(RuleState {
                guardrail_index,
                verdict: RuleVerdict::None,
            })
        })
        .collect();
    if rules.is_empty() {
        return Ok(GuardrailEvaluation {
            rules,
            blocks: TurnBlocks::default(),
            redaction_reservations: Vec::new(),
        });
    }
    let has_external = rules.iter().any(|rule| {
        guardrails
            .get(rule.guardrail_index)
            .is_some_and(Guardrail::is_external)
    });

    let mut state = LocalEvalState::new(guardrails, rules, body, has_external, budget);
    let unreadable = turn
        .as_ref()
        .map_or(true, |turn| state.evaluate_turn(turn, scanned));
    state.finish(unreadable)
}

struct CompiledRedactor {
    compiled: Arc<Compiled>,
    caps: Vec<Captures>,
}

struct LocalEvalState<'g, 'b> {
    guardrails: &'g [Guardrail],
    rules: Vec<RuleState>,
    regex_slots: Vec<(usize, &'g [String])>,
    redact_slots: Vec<(usize, &'g [String])>,
    detector: Option<Arc<Compiled>>,
    patsets: Vec<PatternSet>,
    redactor: Option<CompiledRedactor>,
    body: &'b [u8],
    has_external: bool,
    budget: Option<&'b Arc<Semaphore>>,
    budget_exhausted: bool,
    span_scratch: Vec<RedactionSpan<'g>>,
    blocks: TurnBlocks,
    redaction_reservations: Vec<MemoryReservation>,
}

impl<'g, 'b> LocalEvalState<'g, 'b> {
    fn new(
        guardrails: &'g [Guardrail],
        rules: Vec<RuleState>,
        body: &'b [u8],
        has_external: bool,
        budget: Option<&'b Arc<Semaphore>>,
    ) -> Self {
        let regex_slots: Vec<(usize, &'g [String])> = rules
            .iter()
            .enumerate()
            .filter_map(|(slot, rule)| {
                let patterns = guardrails.get(rule.guardrail_index)?.regex_patterns()?;
                Some((slot, patterns))
            })
            .collect();
        let redact_slots: Vec<(usize, &'g [String])> = regex_slots
            .iter()
            .copied()
            .filter(|&(slot, _)| {
                rules
                    .get(slot)
                    .and_then(|rule| guardrails.get(rule.guardrail_index))
                    .is_some_and(|guardrail| guardrail.action == GuardrailAction::Redact)
            })
            .collect();
        let detector = (!regex_slots.is_empty()).then(|| regex::compiled_detector(&regex_slots));
        let patsets = detector.as_ref().map_or_else(Vec::new, |compiled| {
            compiled
                .matchers
                .iter()
                .map(|matcher| PatternSet::new(matcher.regex.pattern_len()))
                .collect()
        });
        Self {
            guardrails,
            rules,
            regex_slots,
            redact_slots,
            detector,
            patsets,
            redactor: None,
            body,
            has_external,
            budget,
            budget_exhausted: false,
            span_scratch: Vec::new(),
            blocks: TurnBlocks::default(),
            redaction_reservations: Vec::new(),
        }
    }

    fn evaluate_turn(&mut self, turn: &LastTurn, scanned: &ScannedMembers) -> bool {
        let guardrails = self.guardrails;
        let body = self.body;
        let has_external = self.has_external;
        let budget = self.budget;
        turn.read_leaves(member(body, scanned), &mut |leaf| {
            if self.budget_exhausted {
                return;
            }
            self.span_scratch.clear();
            let mut matched_redact = false;
            if let Some(detector) = self.detector.as_deref() {
                let input = Input::new(leaf.text.as_bytes());
                for (matcher, patset) in detector.matchers.iter().zip(&mut self.patsets) {
                    patset.clear();
                    matcher.regex.which_overlapping_matches(&input, patset);
                    for pattern in patset.iter() {
                        let Some(&(slot, _)) = matcher
                            .owners
                            .get(pattern.as_usize())
                            .and_then(|&owner| self.regex_slots.get(owner))
                        else {
                            continue;
                        };
                        let Some(rule) = self.rules.get_mut(slot) else {
                            continue;
                        };
                        let Some(guardrail) = guardrails.get(rule.guardrail_index) else {
                            continue;
                        };
                        rule.verdict
                            .escalate(RuleVerdict::from_local_match(guardrail.action));
                        if guardrail.action == GuardrailAction::Redact {
                            matched_redact = true;
                        }
                    }
                }
            }
            let blocking = self
                .rules
                .iter()
                .any(|rule| rule.verdict == RuleVerdict::Block);
            if matched_redact && !blocking {
                self.collect_redact_spans(leaf.text);
            }
            let Ok(redacted) = redact_leaf(
                body,
                leaf,
                &mut self.span_scratch,
                guardrails,
                &mut self.rules,
                budget,
                &mut self.redaction_reservations,
            ) else {
                self.budget_exhausted = true;
                return;
            };
            // Store locally redacted blocks (always) and unchanged non-empty blocks
            // when external guardrails also run so local secrets never leave the
            // gateway and external anonymizations compose cleanly in one pass.
            match redacted {
                Some((range, text)) => self.blocks.push(range, text, BlockMutation::Local),
                None if has_external && !leaf.text.is_empty() => {
                    if let Some(range) = raw_range(body, leaf.raw) {
                        self.blocks
                            .push(range, leaf.text.to_owned(), BlockMutation::Unchanged);
                    }
                }
                None => {}
            }
        })
        .is_err()
    }

    fn collect_redact_spans(&mut self, text: &str) {
        if self.redact_slots.is_empty() {
            return;
        }
        let redactor = self.redactor.get_or_insert_with(|| {
            let compiled = regex::compiled_redactor(&self.redact_slots);
            let caps = compiled
                .matchers
                .iter()
                .map(|matcher| matcher.regex.create_captures())
                .collect();
            CompiledRedactor { compiled, caps }
        });
        let before = self.span_scratch.len();
        for (matcher, caps) in redactor.compiled.matchers.iter().zip(&mut redactor.caps) {
            regex::for_each_match(&matcher.regex, caps, text, |pattern, start, end| {
                let Some(&(slot, _)) = matcher
                    .owners
                    .get(pattern.as_usize())
                    .and_then(|&owner| self.redact_slots.get(owner))
                else {
                    return;
                };
                let Some(rule) = self.rules.get_mut(slot) else {
                    return;
                };
                let Some(guardrail) = self.guardrails.get(rule.guardrail_index) else {
                    return;
                };
                if start < end {
                    self.span_scratch.push(RedactionSpan {
                        start,
                        end,
                        priority: slot,
                        label: guardrail.redaction_label(),
                    });
                } else {
                    rule.verdict
                        .escalate(RuleVerdict::from_fail_closed(guardrail.action));
                }
            });
        }
        if self.span_scratch.len() == before {
            for &(slot, _) in &self.redact_slots {
                if let Some(rule) = self.rules.get_mut(slot)
                    && rule.verdict == RuleVerdict::Redact
                    && let Some(guardrail) = self.guardrails.get(rule.guardrail_index)
                {
                    rule.verdict
                        .escalate(RuleVerdict::from_fail_closed(guardrail.action));
                }
            }
        }
    }

    fn finish(mut self, unreadable: bool) -> Result<GuardrailEvaluation, ResolutionError> {
        if self.budget_exhausted {
            return Err(ResolutionError::Busy);
        }
        if unreadable {
            self.blocks.clear();
        }
        for rule in &mut self.rules {
            let Some(guardrail) = self.guardrails.get(rule.guardrail_index) else {
                continue;
            };
            if unreadable || matches!(guardrail.kind, GuardrailKind::FailClosed) {
                rule.verdict
                    .escalate(RuleVerdict::from_fail_closed(guardrail.action));
            }
        }
        Ok(GuardrailEvaluation {
            rules: self.rules,
            blocks: self.blocks,
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

fn redact_leaf(
    body: &[u8],
    leaf: text::TextLeaf<'_>,
    span_scratch: &mut Vec<RedactionSpan<'_>>,
    guardrails: &[Guardrail],
    rules: &mut [RuleState],
    budget: Option<&Arc<Semaphore>>,
    reservations: &mut Vec<MemoryReservation>,
) -> Result<Option<(Range<usize>, String)>, ResolutionError> {
    if span_scratch.is_empty() {
        return Ok(None);
    }
    let Some(range) = raw_range(body, leaf.raw) else {
        fail_closed_spans(span_scratch, guardrails, rules);
        return Ok(None);
    };
    let Some(capacity) = redact::prepare_redactions(leaf.text, span_scratch) else {
        fail_closed_spans(span_scratch, guardrails, rules);
        return Ok(None);
    };
    reserve_redaction_bytes(budget, capacity, reservations)?;
    Ok(Some((
        range,
        redact::splice_merged_spans(leaf.text, span_scratch, capacity),
    )))
}

fn fail_closed_spans(
    spans: &[RedactionSpan<'_>],
    guardrails: &[Guardrail],
    rules: &mut [RuleState],
) {
    for span in spans {
        if let Some(rule) = rules.get_mut(span.priority)
            && let Some(guardrail) = guardrails.get(rule.guardrail_index)
        {
            rule.verdict
                .escalate(RuleVerdict::from_fail_closed(guardrail.action));
        }
    }
}

#[cfg(test)]
mod tests;
