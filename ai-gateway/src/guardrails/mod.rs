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
/// configured scope (`last_turn` or `entire_input`), keeping CPU work off the
/// async workers and reserving memory for external prompt copies.
pub(crate) struct Guardrails {
    external: ExternalGuardrailClient,
    max_scan_bytes: usize,
    cpu: CpuWork,
    memory_budget: Arc<Semaphore>,
}

impl Guardrails {
    pub(crate) fn new(
        policy: OutboundPolicy,
        external_timeout: Duration,
        max_scan_bytes: usize,
        cpu: CpuWork,
        memory_budget: Arc<Semaphore>,
    ) -> Result<Self, ResolutionError> {
        Ok(Self {
            external: ExternalGuardrailClient::new(policy, external_timeout)?,
            max_scan_bytes,
            cpu,
            memory_budget,
        })
    }

    /// Evaluates the request with the guardrails resolved for its key. Local
    /// regexes run first (applying local redactions immediately); external
    /// guardrails run afterward unless a local block already fired.
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
        let max_scan_bytes = self.max_scan_bytes;
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
            let needs_entire_input = guardrails.iter().any(|guardrail| {
                guardrail.is_active() && guardrail.scope == GuardrailScope::EntireInput
            });
            let bytes = turn
                .as_ref()
                .map_or(0, |turn| turn.bytes_for_scope(needs_entire_input));
            let has_external = guardrails.iter().any(Guardrail::is_external);
            let external_reservation_bytes = bytes.min(max_scan_bytes);
            let mut turn_text_reservation = (has_external && external_reservation_bytes > 0)
                .then(|| {
                    MemoryReservation::from_budget(
                        &self.memory_budget,
                        external_reservation_bytes,
                        "guardrails",
                    )
                })
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
                            max_scan_bytes,
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
            if !eval.blocks.has_blocks_for_scope(guardrail.scope) {
                continue;
            }
            let payload_reservation =
                self.reserve_external_payload(&eval.blocks, guardrail.scope)?;
            let payloads = eval
                .blocks
                .serialize_for_scope(guardrail.scope, &[guardrail]);
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
            struct ObservingBatch<'a> {
                group: Vec<(usize, &'a Guardrail)>,
                payloads: ExternalPayloads,
                reservation: MemoryReservation,
            }
            let (entire_observing, last_turn_observing): (Vec<_>, Vec<_>) = observing
                .into_iter()
                .partition(|(_, guardrail)| guardrail.scope == GuardrailScope::EntireInput);
            let mut scope_batches = Vec::new();
            for (scope, group) in [
                (GuardrailScope::EntireInput, entire_observing),
                (GuardrailScope::LastTurn, last_turn_observing),
            ] {
                if group.is_empty() || !eval.blocks.has_blocks_for_scope(scope) {
                    continue;
                }
                let batch: Vec<&Guardrail> =
                    group.iter().map(|(_, guardrail)| *guardrail).collect();
                let reservation = self.reserve_external_payload(&eval.blocks, scope)?;
                let payloads = eval.blocks.serialize_for_scope(scope, &batch);
                scope_batches.push(ObservingBatch {
                    group,
                    payloads,
                    reservation,
                });
            }
            // Free unchanged text blocks before awaiting I/O; no further enforcing rule reads them.
            eval.blocks.retain_modified();
            drop(turn_text_reservation.take());
            for ObservingBatch {
                group,
                payloads,
                reservation,
            } in scope_batches
            {
                let batch: Vec<&Guardrail> =
                    group.iter().map(|(_, guardrail)| *guardrail).collect();
                let results = self
                    .external
                    .evaluate_many(&batch, &payloads, organization_id)
                    .await;
                drop(reservation);
                for ((slot, guardrail), outcome) in group.into_iter().zip(results) {
                    eval.apply_external(slot, guardrail, &outcome);
                }
            }
        }
        Ok(Some(started.elapsed()))
    }

    fn reserve_external_payload(
        &self,
        blocks: &TurnBlocks,
        scope: GuardrailScope,
    ) -> Result<MemoryReservation, ResolutionError> {
        MemoryReservation::from_budget(
            &self.memory_budget,
            blocks.text_bytes_for_scope(scope).saturating_add(64),
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

/// Which part of the request input a guardrail evaluates.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum GuardrailScope {
    #[default]
    LastTurn,
    EntireInput,
}

/// A guardrail assigned to the request's key, its user or its organization.
#[derive(Clone, Debug)]
pub(crate) struct Guardrail {
    pub id: String,
    pub name: String,
    pub action: GuardrailAction,
    pub scope: GuardrailScope,
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
            scope: GuardrailScope,
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
            scope: raw.scope,
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
    in_last_turn: bool,
    mutation: BlockMutation,
}

/// Extracted text blocks carried across local redaction and external guardrail
/// stages so `BodyEdit`s are emitted once at finalization with no duplicate merge.
#[derive(Default)]
struct TurnBlocks(Vec<TurnBlock>);

impl TurnBlocks {
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    fn matches_scope(block: &TurnBlock, scope: GuardrailScope) -> bool {
        match scope {
            GuardrailScope::LastTurn => block.in_last_turn,
            GuardrailScope::EntireInput => true,
        }
    }

    fn has_blocks_for_scope(&self, scope: GuardrailScope) -> bool {
        self.0.iter().any(|block| Self::matches_scope(block, scope))
    }

    fn text_bytes_for_scope(&self, scope: GuardrailScope) -> usize {
        self.0
            .iter()
            .filter(|block| Self::matches_scope(block, scope))
            .map(|block| block.text.len())
            .sum()
    }

    fn push(
        &mut self,
        raw_range: Range<usize>,
        text: String,
        in_last_turn: bool,
        mutation: BlockMutation,
    ) {
        self.0.push(TurnBlock {
            raw_range,
            text,
            in_last_turn,
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

    fn serialize_for_scope(
        &self,
        scope: GuardrailScope,
        guardrails: &[&Guardrail],
    ) -> ExternalPayloads {
        let texts: Vec<&str> = self
            .0
            .iter()
            .filter(|block| Self::matches_scope(block, scope))
            .map(|block| block.text.as_str())
            .collect();
        ExternalPayloads::for_guardrails(guardrails, &texts)
    }

    /// Applies one enforcing external guardrail's anonymized `outputs` 1:1 onto
    /// the blocks covered by `scope`. Returns `false` if the outputs cannot be
    /// mapped 1:1 or changed nothing.
    fn apply_anonymized_for_scope(&mut self, scope: GuardrailScope, outputs: &[String]) -> bool {
        let expected = self
            .0
            .iter()
            .filter(|block| Self::matches_scope(block, scope))
            .count();
        if outputs.is_empty() || outputs.len() != expected {
            return false;
        }
        let mut changed = false;
        for (block, output) in self
            .0
            .iter_mut()
            .filter(|block| Self::matches_scope(block, scope))
            .zip(outputs)
        {
            if output.as_str() == block.text {
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
            && !self
                .blocks
                .apply_anonymized_for_scope(guardrail.scope, outputs)
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
/// the text blocks covered by external guardrails in the same pass.
fn apply_local_guardrails(
    guardrails: &[Guardrail],
    body: &[u8],
    scanned: &ScannedMembers,
    turn: &Result<LastTurn, Unreadable>,
    max_scan_bytes: usize,
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

    let mut state = LocalEvalState::new(guardrails, rules, body, max_scan_bytes, budget);
    let unreadable = turn
        .as_ref()
        .map_or(true, |turn| state.evaluate_turn(turn, scanned));
    state.finish(unreadable)
}

struct CompiledRedactor {
    compiled: Arc<Compiled>,
    caps: Vec<Captures>,
}

impl CompiledRedactor {
    fn from_slots(slots: &[(usize, &[String])]) -> Self {
        let compiled = regex::compiled_redactor(slots);
        let caps = compiled
            .matchers
            .iter()
            .map(|matcher| matcher.regex.create_captures())
            .collect();
        Self { compiled, caps }
    }
}

struct ScopeTracker {
    active: bool,
    has_external: bool,
    text_bytes: usize,
    exceeded: bool,
}

impl ScopeTracker {
    fn for_rules(rules: &[RuleState], guardrails: &[Guardrail], scope: GuardrailScope) -> Self {
        let mut active = false;
        let mut has_external = false;
        for rule in rules {
            if let Some(guardrail) = guardrails.get(rule.guardrail_index)
                && guardrail.scope == scope
            {
                active = true;
                if guardrail.is_external() {
                    has_external = true;
                }
            }
        }
        Self {
            active,
            has_external,
            text_bytes: 0,
            exceeded: false,
        }
    }

    fn record_bytes(&mut self, bytes: usize, max_scan_bytes: usize) {
        self.text_bytes = self.text_bytes.saturating_add(bytes);
        if self.active && self.text_bytes > max_scan_bytes {
            self.exceeded = true;
        }
    }

    fn is_done(&self) -> bool {
        !self.active || self.exceeded
    }
}

struct LocalEvalState<'g, 'b> {
    guardrails: &'g [Guardrail],
    rules: Vec<RuleState>,
    regex_slots: Vec<(usize, &'g [String])>,
    redact_slots: Vec<(usize, &'g [String])>,
    entire_input_redact_slots: Vec<(usize, &'g [String])>,
    detector: Option<Arc<Compiled>>,
    patsets: Vec<PatternSet>,
    last_turn_redactor: Option<CompiledRedactor>,
    entire_input_redactor: Option<CompiledRedactor>,
    matched_redact_slots: Vec<usize>,
    body: &'b [u8],
    max_scan_bytes: usize,
    last_turn: ScopeTracker,
    entire_input: ScopeTracker,
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
        max_scan_bytes: usize,
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
        let entire_input_redact_slots: Vec<(usize, &'g [String])> = redact_slots
            .iter()
            .copied()
            .filter(|&(slot, _)| {
                rules
                    .get(slot)
                    .and_then(|rule| guardrails.get(rule.guardrail_index))
                    .is_some_and(|guardrail| guardrail.scope == GuardrailScope::EntireInput)
            })
            .collect();
        let last_turn = ScopeTracker::for_rules(&rules, guardrails, GuardrailScope::LastTurn);
        let entire_input = ScopeTracker::for_rules(&rules, guardrails, GuardrailScope::EntireInput);
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
            entire_input_redact_slots,
            detector,
            patsets,
            last_turn_redactor: None,
            entire_input_redactor: None,
            matched_redact_slots: Vec::new(),
            body,
            max_scan_bytes,
            last_turn,
            entire_input,
            budget,
            budget_exhausted: false,
            span_scratch: Vec::new(),
            blocks: TurnBlocks::default(),
            redaction_reservations: Vec::new(),
        }
    }

    fn evaluate_turn(&mut self, turn: &LastTurn, scanned: &ScannedMembers) -> bool {
        let body = self.body;
        let include_entire_input = self.entire_input.active;
        turn.read_scoped_leaves(
            member(body, scanned),
            include_entire_input,
            &mut |leaf, in_last_turn| self.evaluate_leaf(leaf, in_last_turn),
        )
        .is_err()
    }

    fn evaluate_leaf(&mut self, leaf: text::TextLeaf<'_>, in_last_turn: bool) -> bool {
        if self.budget_exhausted {
            return false;
        }
        self.entire_input
            .record_bytes(leaf.text.len(), self.max_scan_bytes);
        if in_last_turn {
            self.last_turn
                .record_bytes(leaf.text.len(), self.max_scan_bytes);
        }
        if self.last_turn.is_done() && self.entire_input.is_done() {
            return false;
        }

        let leaf_covered_by_last_turn = in_last_turn && !self.last_turn.exceeded;
        let leaf_covered_by_entire_input = self.entire_input.active && !self.entire_input.exceeded;
        if !leaf_covered_by_last_turn && !leaf_covered_by_entire_input {
            return true;
        }

        self.detect_leaf(
            leaf.text,
            leaf_covered_by_last_turn,
            leaf_covered_by_entire_input,
        );
        let blocking = self
            .rules
            .iter()
            .any(|rule| rule.verdict == RuleVerdict::Block);
        if !self.matched_redact_slots.is_empty() && !blocking {
            self.collect_redact_spans(leaf.text, in_last_turn);
        }
        let Ok(redacted) = redact_leaf(
            self.body,
            leaf,
            &mut self.span_scratch,
            self.guardrails,
            &mut self.rules,
            self.budget,
            &mut self.redaction_reservations,
        ) else {
            self.budget_exhausted = true;
            return false;
        };
        // Store locally redacted blocks (always) and unchanged non-empty blocks
        // covered by an external guardrail's scope so local secrets never leave
        // the gateway and external anonymizations compose cleanly in one pass.
        let external_needs_leaf =
            self.entire_input.has_external || (self.last_turn.has_external && in_last_turn);
        match redacted {
            Some((range, text)) => {
                self.blocks
                    .push(range, text, in_last_turn, BlockMutation::Local);
            }
            None if external_needs_leaf && !leaf.text.is_empty() => {
                if let Some(range) = raw_range(self.body, leaf.raw) {
                    self.blocks.push(
                        range,
                        leaf.text.to_owned(),
                        in_last_turn,
                        BlockMutation::Unchanged,
                    );
                }
            }
            None => {}
        }
        true
    }

    fn detect_leaf(&mut self, text: &str, covered_by_last_turn: bool, covered_by_entire: bool) {
        self.span_scratch.clear();
        self.matched_redact_slots.clear();
        let Some(detector) = self.detector.as_deref() else {
            return;
        };
        let input = Input::new(text.as_bytes());
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
                let Some(guardrail) = self.guardrails.get(rule.guardrail_index) else {
                    continue;
                };
                let applies = match guardrail.scope {
                    GuardrailScope::LastTurn => covered_by_last_turn,
                    GuardrailScope::EntireInput => covered_by_entire,
                };
                if !applies {
                    continue;
                }
                rule.verdict
                    .escalate(RuleVerdict::from_local_match(guardrail.action));
                if guardrail.action == GuardrailAction::Redact
                    && !self.matched_redact_slots.contains(&slot)
                {
                    self.matched_redact_slots.push(slot);
                }
            }
        }
    }

    fn collect_redact_spans(&mut self, text: &str, in_last_turn: bool) {
        let (slots, redactor_slot) = if in_last_turn {
            (&self.redact_slots, &mut self.last_turn_redactor)
        } else {
            (
                &self.entire_input_redact_slots,
                &mut self.entire_input_redactor,
            )
        };
        if slots.is_empty() {
            return;
        }
        let redactor = redactor_slot.get_or_insert_with(|| CompiledRedactor::from_slots(slots));
        let before = self.span_scratch.len();
        for (matcher, caps) in redactor.compiled.matchers.iter().zip(&mut redactor.caps) {
            regex::for_each_match(&matcher.regex, caps, text, |pattern, start, end| {
                let Some(&(slot, _)) = matcher
                    .owners
                    .get(pattern.as_usize())
                    .and_then(|&owner| slots.get(owner))
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
            for &slot in &self.matched_redact_slots {
                if let Some(rule) = self.rules.get_mut(slot)
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
        for rule in &mut self.rules {
            let Some(guardrail) = self.guardrails.get(rule.guardrail_index) else {
                continue;
            };
            let exceeded = match guardrail.scope {
                GuardrailScope::LastTurn => self.last_turn.exceeded,
                GuardrailScope::EntireInput => self.entire_input.exceeded,
            };
            if unreadable || exceeded || matches!(guardrail.kind, GuardrailKind::FailClosed) {
                rule.verdict
                    .escalate(RuleVerdict::from_fail_closed(guardrail.action));
            }
        }
        if unreadable
            || self
                .rules
                .iter()
                .any(|rule| rule.verdict == RuleVerdict::Block)
        {
            self.blocks.clear();
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
