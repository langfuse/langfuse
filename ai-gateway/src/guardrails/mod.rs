//! Guardrails: rules from the control plane checked against a request's last
//! turn before it reaches the provider and/or against the provider's response
//! before returning it to the caller. A `block` guardrail that matches refuses
//! the exchange; a `log` guardrail that matches marks its generation; a
//! `redact` guardrail replaces matched spans before forwarding or returning;
//! an `enforce` external guardrail follows the provider's block or anonymize
//! verdict. Each API format's capture module finds the request's last turn
//! (`capture::request_spec`), and `response` extracts provider output blocks.
pub(crate) mod bedrock;
pub(crate) mod external;
pub(crate) mod openai_moderation;
pub(crate) mod redact;
mod regex;
pub(crate) mod response;
pub(crate) mod spec;
pub(crate) mod text;

use std::{ops::Range, sync::Arc, time::Duration};

use axum::body::Bytes;
use regex_automata::{Input, PatternSet, util::captures::Captures};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Deserializer, Serialize, de::Error as _};
use tokio::sync::Semaphore;
use tracing::Instrument;

use crate::{
    cpu::{CpuClass, CpuJob, CpuWork},
    http::ParsedRequest,
    inference::MemoryReservation,
    observability::{ErrorOrigin, RequestObservation},
    providers::OutboundPolicy,
    resolution::{ApiFormat, ResolutionError, ResolvedRequestContext},
};
use bedrock::BedrockGuardrail;
use external::{ExternalFailureKind, ExternalGuardrailClient, ExternalOutcome, ExternalPayloads};
use openai_moderation::OpenAiModerationGuardrail;
use redact::{BodyEdit, RedactionSpan};
use regex::Compiled;
use response::{ParsedResponse, RedactionApply, ResponseFormat, ResponseParseError};
use spec::Members;
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

    pub(crate) fn memory_budget(&self) -> &Arc<Semaphore> {
        &self.memory_budget
    }

    /// Evaluates the request with the guardrails resolved for its key. Local
    /// regexes run first (applying local redactions immediately); external
    /// guardrails run afterward unless a local block already fired.
    pub(crate) async fn check(
        &self,
        api_format: ApiFormat,
        context: &ResolvedRequestContext,
        request: &ParsedRequest,
        observation: &RequestObservation,
    ) -> Result<Outcome, ResolutionError> {
        if !context.guardrails().iter().any(Guardrail::is_active) {
            return Ok(Outcome::default());
        }
        observation.record_guardrails_evaluated();
        let guardrails: Arc<[Guardrail]> = context.guardrails().into();
        let organization_id = context.attribution().organization_id().as_str().to_owned();
        let body = request.body().clone();
        let scanned = request.scanned.clone();
        let max_scan_bytes = self.max_scan_bytes;
        async move {
            let check_started = std::time::Instant::now();
            let (turn, finding) = self
                .cpu
                .run(
                    CpuJob::FindLastTurn,
                    CpuClass::Guardrailed,
                    scanned.len(),
                    {
                        let body = body.clone();
                        let scanned = scanned.clone();
                        move || {
                            let started = std::time::Instant::now();
                            let turn = last_turn(api_format, &body, &scanned);
                            (turn, started.elapsed())
                        }
                    },
                )
                .await
                .ok_or(ResolutionError::Busy)?;
            let needs_entire_input = guardrails.iter().any(|guardrail| {
                guardrail.is_active() && guardrail.scope == GuardrailScope::EntireInput
            });
            let bytes = turn
                .as_ref()
                .map_or(0, |turn| turn.bytes_for_scope(needs_entire_input));
            let has_external = guardrails.iter().any(Guardrail::is_external);
            let mut turn_text_reservation = (has_external && bytes > 0)
                .then(|| MemoryReservation::from_budget(&self.memory_budget, bytes, "guardrails"))
                .transpose()?;
            let (local, scanning) = self
                .cpu
                .run(CpuJob::ScanGuardrails, CpuClass::Guardrailed, bytes, {
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
                    GuardrailLocation::Request,
                    &mut eval,
                    &mut turn_text_reservation,
                    &organization_id,
                )
                .await?
            } else {
                drop(turn_text_reservation);
                None
            };
            let outcome = eval.finalize(
                &guardrails,
                GuardrailLocation::Request,
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

    /// Evaluates a buffered provider response (JSON or SSE) against all active
    /// output guardrails. Runs local regex detection/redaction on the CPU pool
    /// first, then any external guardrails (e.g. Bedrock `source: "OUTPUT"`).
    pub(crate) async fn check_response(
        &self,
        api_format: ApiFormat,
        format: ResponseFormat,
        context: &ResolvedRequestContext,
        body: Vec<Bytes>,
    ) -> Result<Outcome, ResolutionError> {
        if !context
            .response_guardrails()
            .iter()
            .any(Guardrail::is_active)
        {
            return Ok(Outcome::default());
        }
        let guardrails: Arc<[Guardrail]> = context.response_guardrails().into();
        let organization_id = context.attribution().organization_id().as_str().to_owned();
        let max_scan_bytes = self.max_scan_bytes;
        let has_external = guardrails.iter().any(Guardrail::is_external);
        async move {
            let check_started = std::time::Instant::now();
            let body_bytes = body.iter().map(Bytes::len).sum();
            let ((local, parsed, scanned_bytes), local_duration) = self
                .cpu
                .run(CpuJob::ScanGuardrails, CpuClass::Guardrailed, body_bytes, {
                    let guardrails = Arc::clone(&guardrails);
                    let budget = Arc::clone(&self.memory_budget);
                    move || {
                        let started = std::time::Instant::now();
                        let parsed =
                            match ParsedResponse::parse(api_format, format, body, Some(&budget)) {
                                Ok(parsed) => Some(parsed),
                                Err(ResponseParseError::Unreadable) => None,
                                Err(ResponseParseError::Busy) => {
                                    return (
                                        (Err(ResolutionError::Busy), None, body_bytes),
                                        started.elapsed(),
                                    );
                                }
                            };
                        let scanned_bytes = parsed
                            .as_ref()
                            .map_or(body_bytes, ParsedResponse::text_bytes);
                        let local = apply_local_response_guardrails(
                            &guardrails,
                            parsed.as_ref(),
                            max_scan_bytes,
                            Some(&budget),
                        );
                        ((local, parsed, scanned_bytes), started.elapsed())
                    }
                })
                .await
                .ok_or(ResolutionError::Busy)?;
            let mut eval = local?;
            let external_duration = if !eval.is_blocking() && !eval.blocks.is_empty() {
                // External guardrails receive copies of the response text.
                let mut text_reservation = parsed
                    .as_ref()
                    .map(ParsedResponse::text_bytes)
                    .filter(|&bytes| has_external && bytes > 0)
                    .map(|bytes| {
                        MemoryReservation::from_budget(&self.memory_budget, bytes, "guardrails")
                    })
                    .transpose()?;
                self.evaluate_external(
                    &guardrails,
                    GuardrailLocation::Response,
                    &mut eval,
                    &mut text_reservation,
                    &organization_id,
                )
                .await?
            } else {
                None
            };
            let outcome = eval.finalize_response(&guardrails, parsed, Some(&self.memory_budget))?;
            crate::observability::guardrails_checked(
                &organization_id,
                crate::observability::GuardrailTimings {
                    total: check_started.elapsed(),
                    local: local_duration,
                    external: external_duration,
                },
                scanned_bytes,
            );
            Ok(outcome)
        }
        .instrument(tracing::info_span!(
            "response.guardrails",
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
        location: GuardrailLocation,
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
                self.reserve_external_payload(&eval.blocks, guardrail.scope, 1)?;
            let payloads = eval
                .blocks
                .serialize_for_scope(guardrail.scope, &[guardrail], location);
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
                let reservation = self.reserve_external_payload(
                    &eval.blocks,
                    scope,
                    ExternalPayloads::count_for(&batch),
                )?;
                let payloads = eval.blocks.serialize_for_scope(scope, &batch, location);
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
        payload_count: usize,
    ) -> Result<MemoryReservation, ResolutionError> {
        MemoryReservation::from_budget(
            &self.memory_budget,
            blocks
                .external_payload_bytes_for_scope(scope)
                .saturating_add(64)
                .saturating_mul(payload_count),
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
    OpenAiModeration(OpenAiModerationGuardrail),
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
    #[serde(other)]
    Unknown,
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
    pub(crate) fn is_active(&self) -> bool {
        if self.action == GuardrailAction::Unknown || self.scope == GuardrailScope::Unknown {
            return false;
        }
        match &self.kind {
            GuardrailKind::Regex { patterns } => !patterns.is_empty(),
            GuardrailKind::Bedrock(_)
            | GuardrailKind::OpenAiModeration(_)
            | GuardrailKind::FailClosed => true,
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
            // An unknown region fails only this guardrail closed at check time,
            // so Web can add regions before every gateway knows them.
            GuardrailKind::OpenAiModeration(config) => {
                crate::resolution::valid_token(config.api_key.expose_secret())
            }
        }
    }

    fn regex_patterns(&self) -> Option<&[String]> {
        match &self.kind {
            GuardrailKind::Regex { patterns } => Some(patterns),
            GuardrailKind::Bedrock(_)
            | GuardrailKind::OpenAiModeration(_)
            | GuardrailKind::FailClosed
            | GuardrailKind::Unknown => None,
        }
    }

    fn is_external(&self) -> bool {
        self.is_active()
            && matches!(
                self.kind,
                GuardrailKind::Bedrock(_) | GuardrailKind::OpenAiModeration(_)
            )
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
            Some("openai_moderation") => {
                GuardrailKind::OpenAiModeration(OpenAiModerationGuardrail {
                    region: raw
                        .region
                        .ok_or_else(|| D::Error::missing_field("region"))?,
                    api_key: raw
                        .api_key
                        .ok_or_else(|| D::Error::missing_field("api_key"))?,
                })
            }
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

/// Where the request parse found the members its format's
/// [`text::RequestSpec`] declares.
#[derive(Clone, Debug)]
pub(crate) struct ScannedMembers {
    declared: &'static [&'static str],
    members: Vec<(&'static str, Range<usize>)>,
    /// A member appeared twice; parsers disagree on which one the provider reads.
    duplicated: bool,
}

impl ScannedMembers {
    pub(crate) fn new(declared: &'static [&'static str]) -> Self {
        Self {
            declared,
            members: Vec::new(),
            duplicated: false,
        }
    }

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
    Response,
}

impl GuardrailLocation {
    pub(crate) fn bedrock_source(self) -> &'static str {
        match self {
            Self::Request => "INPUT",
            Self::Response => "OUTPUT",
        }
    }
}

/// Fail-closed outcome for an unreadable or oversized response (e.g. non-identity
/// encoding, unsupported content type, or body exceeding the response guardrail
/// buffer cap). Blocking/redacting/enforcing rules block; log rules record a match.
pub(crate) fn fail_closed_response_outcome(
    guardrails: &[Guardrail],
    reason: BlockReason,
) -> Outcome {
    let mut findings = Vec::new();
    let mut blocked = None;
    for guardrail in guardrails.iter().filter(|guardrail| guardrail.is_active()) {
        let verdict = RuleVerdict::from_fail_closed(guardrail.action, reason);
        let Some(action) = verdict.to_finding_action(guardrail.action) else {
            continue;
        };
        if let Some(block_reason) = verdict.block_reason()
            && blocked.is_none()
        {
            blocked = Some((findings.len(), block_reason));
        }
        findings.push(Finding {
            id: guardrail.id.clone(),
            name: guardrail.name.clone(),
            action,
            location: GuardrailLocation::Response,
        });
    }
    Outcome {
        findings,
        blocked,
        redactions: Vec::new(),
        rewritten_response: None,
        redaction_reservations: Vec::new(),
    }
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

/// Why a guardrail refused a request or response.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BlockReason {
    /// Policy matched a blocking rule (or external provider returned `BLOCKED`).
    Policy,
    /// External guardrail provider returned 429.
    RateLimited,
    /// External guardrail provider timed out.
    Timeout,
    /// External guardrail provider failed or is misconfigured.
    Unavailable,
    /// Payload exceeded the guardrail scan or buffer byte cap.
    InputTooLarge,
    /// Body was unreadable or local redaction failed closed.
    Unreadable,
}

impl From<ExternalFailureKind> for BlockReason {
    fn from(kind: ExternalFailureKind) -> Self {
        match kind {
            ExternalFailureKind::RateLimited => Self::RateLimited,
            ExternalFailureKind::Timeout => Self::Timeout,
            ExternalFailureKind::Unavailable => Self::Unavailable,
        }
    }
}

/// Caller-facing rejection produced when a guardrail blocks or cannot evaluate
/// a request or response.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GuardrailRejection {
    location: GuardrailLocation,
    reason: BlockReason,
    message: Arc<str>,
}

impl GuardrailRejection {
    fn new(name: &str, location: GuardrailLocation, reason: BlockReason) -> Self {
        let message = match (location, reason) {
            (GuardrailLocation::Request, BlockReason::Policy) => {
                format!("Request blocked by guardrail \"{name}\"")
            }
            (GuardrailLocation::Response, BlockReason::Policy) => {
                format!("Response blocked by guardrail \"{name}\"")
            }
            (_, BlockReason::RateLimited) => {
                format!("Guardrail \"{name}\" is rate limited. Try again shortly.")
            }
            (_, BlockReason::Timeout) => {
                format!("Guardrail \"{name}\" timed out. Try again shortly.")
            }
            (_, BlockReason::Unavailable) => {
                format!("Guardrail \"{name}\" failed to run. Check its configuration or try again.")
            }
            (GuardrailLocation::Request, BlockReason::InputTooLarge) => {
                format!("Input too large for guardrail \"{name}\"")
            }
            (GuardrailLocation::Response, BlockReason::InputTooLarge) => {
                format!("Response too large for guardrail \"{name}\"")
            }
            (GuardrailLocation::Request, BlockReason::Unreadable) => {
                format!("Guardrail \"{name}\" could not read the request")
            }
            (GuardrailLocation::Response, BlockReason::Unreadable) => {
                format!("Guardrail \"{name}\" could not read the response")
            }
        };
        Self {
            location,
            reason,
            message: message.into(),
        }
    }

    pub(crate) fn message(&self) -> &str {
        &self.message
    }

    pub(crate) fn http_status(&self) -> axum::http::StatusCode {
        match (self.location, self.reason) {
            (_, BlockReason::Policy) | (GuardrailLocation::Request, BlockReason::Unreadable) => {
                axum::http::StatusCode::BAD_REQUEST
            }
            (_, BlockReason::RateLimited) => axum::http::StatusCode::TOO_MANY_REQUESTS,
            (_, BlockReason::Timeout | BlockReason::Unavailable) => {
                axum::http::StatusCode::SERVICE_UNAVAILABLE
            }
            (GuardrailLocation::Request, BlockReason::InputTooLarge) => {
                axum::http::StatusCode::PAYLOAD_TOO_LARGE
            }
            (GuardrailLocation::Response, BlockReason::InputTooLarge | BlockReason::Unreadable) => {
                axum::http::StatusCode::BAD_GATEWAY
            }
        }
    }

    pub(crate) fn error_type(&self) -> &'static str {
        match (self.location, self.reason) {
            (_, BlockReason::Policy)
            | (GuardrailLocation::Request, BlockReason::InputTooLarge | BlockReason::Unreadable) => {
                "invalid_request_error"
            }
            (_, BlockReason::RateLimited) => "rate_limit_error",
            (_, BlockReason::Timeout | BlockReason::Unavailable)
            | (GuardrailLocation::Response, BlockReason::InputTooLarge | BlockReason::Unreadable) => {
                "server_error"
            }
        }
    }

    pub(crate) fn error_code(&self) -> &'static str {
        match (self.location, self.reason) {
            (_, BlockReason::Policy) => "guardrail_blocked",
            (_, BlockReason::RateLimited) => "guardrail_rate_limited",
            (_, BlockReason::Timeout | BlockReason::Unavailable) => "guardrail_unavailable",
            (GuardrailLocation::Request, BlockReason::InputTooLarge) => "guardrail_input_too_large",
            (GuardrailLocation::Response, BlockReason::InputTooLarge) => {
                "guardrail_response_too_large"
            }
            (_, BlockReason::Unreadable) => "guardrail_evaluation_failed",
        }
    }

    pub(crate) fn error_origin(&self) -> ErrorOrigin {
        match (self.location, self.reason) {
            (_, BlockReason::Policy)
            | (GuardrailLocation::Request, BlockReason::InputTooLarge | BlockReason::Unreadable) => {
                ErrorOrigin::Client
            }
            (_, BlockReason::Timeout) => ErrorOrigin::ProviderTransport,
            (_, BlockReason::RateLimited | BlockReason::Unavailable)
            | (GuardrailLocation::Response, BlockReason::InputTooLarge | BlockReason::Unreadable) => {
                ErrorOrigin::Provider
            }
        }
    }

    /// Deterministic 5xx response rejections (buffer cap exceeded or unreadable
    /// response) should not be auto-retried by OpenAI/Anthropic SDKs because a
    /// retry pays for another full generation with the same outcome.
    pub(crate) fn disable_retry(&self) -> bool {
        self.location == GuardrailLocation::Response
            && matches!(
                self.reason,
                BlockReason::InputTooLarge | BlockReason::Unreadable
            )
    }
}

/// The guardrails an exchange matched, in resolution order, together with any
/// request body edits or rewritten response bytes produced by `redact` / `enforce`.
#[derive(Default)]
pub(crate) struct Outcome {
    findings: Vec<Finding>,
    blocked: Option<(usize, BlockReason)>,
    redactions: Vec<BodyEdit>,
    rewritten_response: Option<Bytes>,
    redaction_reservations: Vec<MemoryReservation>,
}

impl Outcome {
    /// The first blocking guardrail that matched, or the first `redact` /
    /// `enforce` rule that failed closed.
    #[cfg(test)]
    pub(crate) fn blocking(&self) -> Option<&Finding> {
        self.blocked.and_then(|(index, _)| self.findings.get(index))
    }

    /// Caller-facing rejection carrying the HTTP status, code, and message for
    /// the first guardrail that blocked or failed closed.
    pub(crate) fn rejection(&self) -> Option<GuardrailRejection> {
        let (index, reason) = self.blocked?;
        let finding = self.findings.get(index)?;
        Some(GuardrailRejection::new(
            &finding.name,
            finding.location,
            reason,
        ))
    }

    pub(crate) fn into_findings(self) -> Vec<Finding> {
        self.findings
    }

    pub(crate) fn into_parts(self) -> (Vec<Finding>, Vec<BodyEdit>, Vec<MemoryReservation>) {
        (self.findings, self.redactions, self.redaction_reservations)
    }

    pub(crate) fn into_response_parts(
        self,
    ) -> (Vec<Finding>, Option<Bytes>, Vec<MemoryReservation>) {
        (
            self.findings,
            self.rewritten_response,
            self.redaction_reservations,
        )
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
    let find = member(body, scanned);
    (crate::capture::request_spec(api_format).last_turn)(&Members::new(scanned.declared, &find))
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
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RuleVerdict {
    None,
    Log,
    Redact,
    Block(BlockReason),
}

impl RuleVerdict {
    fn is_block(self) -> bool {
        matches!(self, Self::Block(_))
    }

    fn block_reason(self) -> Option<BlockReason> {
        match self {
            Self::Block(reason) => Some(reason),
            Self::None | Self::Log | Self::Redact => None,
        }
    }

    fn from_local_match(action: GuardrailAction) -> Self {
        match action {
            GuardrailAction::Block | GuardrailAction::Enforce => Self::Block(BlockReason::Policy),
            GuardrailAction::Redact => Self::Redact,
            GuardrailAction::Log => Self::Log,
            GuardrailAction::Unknown => Self::None,
        }
    }

    fn from_fail_closed(action: GuardrailAction, reason: BlockReason) -> Self {
        match action {
            GuardrailAction::Log => Self::Log,
            GuardrailAction::Block | GuardrailAction::Redact | GuardrailAction::Enforce => {
                Self::Block(reason)
            }
            GuardrailAction::Unknown => Self::None,
        }
    }

    fn from_external(action: GuardrailAction, outcome: &ExternalOutcome) -> Self {
        match outcome {
            ExternalOutcome::None => Self::None,
            ExternalOutcome::Blocked => Self::from_fail_closed(action, BlockReason::Policy),
            ExternalOutcome::Failed(kind) => Self::from_fail_closed(action, (*kind).into()),
            ExternalOutcome::Anonymized(_) => match action {
                GuardrailAction::Log => Self::Log,
                GuardrailAction::Block => Self::Block(BlockReason::Policy),
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
            Self::Block(_) => Some(match configured {
                GuardrailAction::Redact => GuardrailAction::Redact,
                GuardrailAction::Block
                | GuardrailAction::Enforce
                | GuardrailAction::Log
                | GuardrailAction::Unknown => GuardrailAction::Block,
            }),
        }
    }

    fn severity(self) -> u8 {
        match self {
            Self::None => 0,
            Self::Log => 1,
            Self::Redact => 2,
            Self::Block(_) => 3,
        }
    }

    fn escalate(&mut self, next: Self) {
        if next.severity() > self.severity()
            || matches!(next, Self::Block(BlockReason::Policy))
                && !matches!(*self, Self::Block(BlockReason::Policy))
        {
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

/// Per-`TurnBlock` structural overhead (struct + heap `String` allocator slack)
/// charged against `memory_budget` when buffering leaves.
const TURN_BLOCK_OVERHEAD_BYTES: usize = size_of::<TurnBlock>() + 32;
/// Per-block JSON wrapper overhead (`{"text":{"text":""}},`) in external payloads.
const EXTERNAL_PAYLOAD_BLOCK_OVERHEAD_BYTES: usize = 24;

enum EditTarget {
    BodyRange(Range<usize>),
    ResponseBlock(usize),
    Uneditable,
}

struct TurnBlock {
    target: EditTarget,
    text: String,
    in_last_turn: bool,
    mutation: BlockMutation,
}

/// Extracted text blocks carried across local redaction and external guardrail
/// stages so `BodyEdit`s are emitted once at finalization with no duplicate merge.
#[derive(Default)]
struct TurnBlocks(Vec<TurnBlock>);

enum AnonymizeResult {
    Applied,
    Uneditable,
    Invalid,
}

impl TurnBlocks {
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    fn matches_scope(block: &TurnBlock, scope: GuardrailScope) -> bool {
        match scope {
            GuardrailScope::LastTurn => block.in_last_turn,
            GuardrailScope::EntireInput => true,
            GuardrailScope::Unknown => false,
        }
    }

    fn has_blocks_for_scope(&self, scope: GuardrailScope) -> bool {
        self.0.iter().any(|block| Self::matches_scope(block, scope))
    }

    fn external_payload_bytes_for_scope(&self, scope: GuardrailScope) -> usize {
        self.0
            .iter()
            .filter(|block| Self::matches_scope(block, scope))
            .fold(0usize, |total, block| {
                total.saturating_add(
                    block
                        .text
                        .len()
                        .saturating_add(EXTERNAL_PAYLOAD_BLOCK_OVERHEAD_BYTES),
                )
            })
    }

    fn push(
        &mut self,
        target: EditTarget,
        text: String,
        in_last_turn: bool,
        mutation: BlockMutation,
    ) {
        self.0.push(TurnBlock {
            target,
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
        location: GuardrailLocation,
    ) -> ExternalPayloads {
        let texts: Vec<&str> = self
            .0
            .iter()
            .filter(|block| Self::matches_scope(block, scope))
            .map(|block| block.text.as_str())
            .collect();
        ExternalPayloads::for_guardrails(guardrails, &texts, location)
    }

    /// Applies one enforcing external guardrail's anonymized `outputs` 1:1 onto
    /// the blocks covered by `scope`.
    fn apply_anonymized_for_scope(
        &mut self,
        scope: GuardrailScope,
        outputs: &[String],
    ) -> AnonymizeResult {
        let expected = self
            .0
            .iter()
            .filter(|block| Self::matches_scope(block, scope))
            .count();
        if outputs.is_empty() || outputs.len() != expected {
            return AnonymizeResult::Invalid;
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
            if matches!(block.target, EditTarget::Uneditable) {
                return AnonymizeResult::Uneditable;
            }
            block.text.clear();
            block.text.push_str(output);
            block.mutation = BlockMutation::External;
            changed = true;
        }
        if changed {
            AnonymizeResult::Applied
        } else {
            AnonymizeResult::Invalid
        }
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
            let EditTarget::BodyRange(range) = block.target else {
                return Ok(None);
            };
            let Ok(replacement) = serde_json::to_vec(&block.text) else {
                return Ok(None);
            };
            edits.push(BodyEdit { range, replacement });
        }
        Ok(Some(edits))
    }

    fn into_response_edits(self) -> Option<Vec<(usize, String)>> {
        let mut edits = Vec::new();
        for block in self.0 {
            if block.mutation == BlockMutation::Unchanged {
                continue;
            }
            let EditTarget::ResponseBlock(index) = block.target else {
                return None;
            };
            edits.push((index, block.text));
        }
        Some(edits)
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
        self.rules.iter().any(|rule| rule.verdict.is_block())
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
    /// onto `self.blocks`. Returns `true` when the guardrail blocked the exchange.
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
        {
            match self
                .blocks
                .apply_anonymized_for_scope(guardrail.scope, outputs)
            {
                AnonymizeResult::Applied => {}
                AnonymizeResult::Uneditable => {
                    verdict = RuleVerdict::from_fail_closed(guardrail.action, BlockReason::Policy);
                }
                AnonymizeResult::Invalid => {
                    verdict =
                        RuleVerdict::from_fail_closed(guardrail.action, BlockReason::Unavailable);
                }
            }
        }
        rule.verdict.escalate(verdict);
        rule.verdict.is_block()
    }

    /// Converts the evaluated verdicts and modified request blocks into the final
    /// [`Outcome`], preserving guardrail resolution order.
    fn finalize(
        mut self,
        guardrails: &[Guardrail],
        location: GuardrailLocation,
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
            fail_closed_rules(&mut self.rules, guardrails, BlockReason::Unreadable);
            Vec::new()
        };
        let (findings, blocked) = collect_findings(&self.rules, guardrails, location);
        let redaction_reservations = if blocked.is_some() {
            redactions.clear();
            Vec::new()
        } else {
            self.redaction_reservations
        };
        Ok(Outcome {
            findings,
            blocked,
            redactions,
            rewritten_response: None,
            redaction_reservations,
        })
    }

    /// Converts evaluated response verdicts and modified response blocks into the
    /// final [`Outcome`], rewriting `parsed` only when at least one block changed.
    fn finalize_response(
        mut self,
        guardrails: &[Guardrail],
        parsed: Option<ParsedResponse>,
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<Outcome, ResolutionError> {
        let mut rewritten_response = None;
        if !self.is_blocking() {
            match self.blocks.into_response_edits() {
                Some(edits) if edits.is_empty() => {}
                Some(edits) => {
                    let applied = match parsed {
                        Some(parsed) => parsed.apply_redactions(&edits, budget)?,
                        None => RedactionApply::Failed,
                    };
                    match applied {
                        RedactionApply::Rewritten(rewritten) => {
                            if let Some(budget) = budget
                                && !rewritten.is_empty()
                            {
                                self.redaction_reservations
                                    .push(MemoryReservation::from_budget(
                                        budget,
                                        rewritten.len(),
                                        "guardrails",
                                    )?);
                            }
                            rewritten_response = Some(rewritten);
                        }
                        RedactionApply::Unchanged => {}
                        RedactionApply::InvalidJson => {
                            for rule in &mut self.rules {
                                if rule.verdict == RuleVerdict::Redact
                                    && let Some(guardrail) = guardrails.get(rule.guardrail_index)
                                {
                                    rule.verdict.escalate(RuleVerdict::from_fail_closed(
                                        guardrail.action,
                                        BlockReason::Policy,
                                    ));
                                }
                            }
                        }
                        RedactionApply::Failed => {
                            fail_closed_rules(&mut self.rules, guardrails, BlockReason::Unreadable);
                        }
                    }
                }
                None => fail_closed_rules(&mut self.rules, guardrails, BlockReason::Unreadable),
            }
        }
        let (findings, blocked) =
            collect_findings(&self.rules, guardrails, GuardrailLocation::Response);
        let redaction_reservations = if blocked.is_some() {
            rewritten_response = None;
            Vec::new()
        } else {
            self.redaction_reservations
        };
        Ok(Outcome {
            findings,
            blocked,
            redactions: Vec::new(),
            rewritten_response,
            redaction_reservations,
        })
    }
}

fn fail_closed_rules(rules: &mut [RuleState], guardrails: &[Guardrail], reason: BlockReason) {
    for rule in rules {
        if let Some(guardrail) = guardrails.get(rule.guardrail_index) {
            rule.verdict
                .escalate(RuleVerdict::from_fail_closed(guardrail.action, reason));
        }
    }
}

fn collect_findings(
    rules: &[RuleState],
    guardrails: &[Guardrail],
    location: GuardrailLocation,
) -> (Vec<Finding>, Option<(usize, BlockReason)>) {
    let mut findings = Vec::new();
    let mut blocked = None;
    for rule in rules {
        let Some(guardrail) = guardrails.get(rule.guardrail_index) else {
            continue;
        };
        let Some(action) = rule.verdict.to_finding_action(guardrail.action) else {
            continue;
        };
        if let Some(reason) = rule.verdict.block_reason()
            && blocked.is_none()
        {
            blocked = Some((findings.len(), reason));
        }
        findings.push(Finding {
            id: guardrail.id.clone(),
            name: guardrail.name.clone(),
            action,
            location,
        });
    }
    (findings, blocked)
}

fn active_rules(guardrails: &[Guardrail]) -> Vec<RuleState> {
    guardrails
        .iter()
        .enumerate()
        .filter_map(|(guardrail_index, guardrail)| {
            guardrail.is_active().then_some(RuleState {
                guardrail_index,
                verdict: RuleVerdict::None,
            })
        })
        .collect()
}

/// Runs the local regex guardrails against a request's `turn` (applying local
/// redactions immediately) and, when any active external guardrail is present,
/// collects the text blocks covered by external guardrails in the same pass.
fn apply_local_guardrails(
    guardrails: &[Guardrail],
    body: &[u8],
    scanned: &ScannedMembers,
    turn: &Result<LastTurn, Unreadable>,
    max_scan_bytes: usize,
    budget: Option<&Arc<Semaphore>>,
) -> Result<GuardrailEvaluation, ResolutionError> {
    let rules = active_rules(guardrails);
    if rules.is_empty() {
        return Ok(GuardrailEvaluation {
            rules,
            blocks: TurnBlocks::default(),
            redaction_reservations: Vec::new(),
        });
    }

    let mut state = LocalEvalState::new(guardrails, rules, max_scan_bytes, budget);
    let unreadable = turn
        .as_ref()
        .map_or(true, |turn| state.evaluate_turn(body, turn, scanned));
    state.finish(unreadable)
}

/// Runs local regex guardrails against parsed provider response blocks
/// (applying local redactions immediately) and preserves blocks for external
/// output guardrails when configured.
fn apply_local_response_guardrails(
    guardrails: &[Guardrail],
    parsed: Option<&ParsedResponse>,
    max_scan_bytes: usize,
    budget: Option<&Arc<Semaphore>>,
) -> Result<GuardrailEvaluation, ResolutionError> {
    let rules = active_rules(guardrails);
    if rules.is_empty() {
        return Ok(GuardrailEvaluation {
            rules,
            blocks: TurnBlocks::default(),
            redaction_reservations: Vec::new(),
        });
    }

    let mut state = LocalEvalState::new(guardrails, rules, max_scan_bytes, budget);
    let unreadable = match parsed {
        Some(parsed) => {
            for (index, block) in parsed.blocks().iter().enumerate() {
                let target = if block.editable {
                    EditTarget::ResponseBlock(index)
                } else {
                    EditTarget::Uneditable
                };
                if !state.evaluate_text_block(&block.text, target, true) {
                    break;
                }
            }
            false
        }
        None => true,
    };
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
    has_regex: bool,
    has_external: bool,
    text_bytes: usize,
    regex_exceeded: bool,
}

impl ScopeTracker {
    fn for_rules(rules: &[RuleState], guardrails: &[Guardrail], scope: GuardrailScope) -> Self {
        let mut has_regex = false;
        let mut has_external = false;
        for rule in rules {
            if let Some(guardrail) = guardrails.get(rule.guardrail_index)
                && guardrail.scope == scope
            {
                if guardrail.regex_patterns().is_some() {
                    has_regex = true;
                }
                if guardrail.is_external() {
                    has_external = true;
                }
            }
        }
        Self {
            has_regex,
            has_external,
            text_bytes: 0,
            regex_exceeded: false,
        }
    }

    fn is_active(&self) -> bool {
        self.has_regex || self.has_external
    }

    fn record_bytes(&mut self, bytes: usize, max_scan_bytes: usize) {
        self.text_bytes = self.text_bytes.saturating_add(bytes);
        if self.has_regex && self.text_bytes > max_scan_bytes {
            self.regex_exceeded = true;
        }
    }

    fn is_done(&self) -> bool {
        !self.has_external && (!self.has_regex || self.regex_exceeded)
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

    fn evaluate_turn(&mut self, body: &[u8], turn: &LastTurn, scanned: &ScannedMembers) -> bool {
        let include_entire_input = self.entire_input.is_active();
        let find = member(body, scanned);
        turn.read_scoped_leaves(
            &Members::new(scanned.declared, &find),
            include_entire_input,
            &mut |leaf, in_last_turn| {
                let target =
                    raw_range(body, leaf.raw).map_or(EditTarget::Uneditable, EditTarget::BodyRange);
                self.evaluate_text_block(leaf.text, target, in_last_turn)
            },
        )
        .is_err()
    }

    fn evaluate_text_block(&mut self, text: &str, target: EditTarget, in_last_turn: bool) -> bool {
        if self.budget_exhausted {
            return false;
        }
        self.entire_input
            .record_bytes(text.len(), self.max_scan_bytes);
        if in_last_turn {
            self.last_turn.record_bytes(text.len(), self.max_scan_bytes);
        }
        if self.last_turn.is_done() && self.entire_input.is_done() {
            return false;
        }

        let regex_last_turn =
            in_last_turn && self.last_turn.has_regex && !self.last_turn.regex_exceeded;
        let regex_entire_input = self.entire_input.has_regex && !self.entire_input.regex_exceeded;
        let external_needs_leaf =
            self.entire_input.has_external || (self.last_turn.has_external && in_last_turn);
        if !regex_last_turn && !regex_entire_input && !external_needs_leaf {
            return true;
        }

        if regex_last_turn || regex_entire_input {
            self.detect_leaf(text, regex_last_turn, regex_entire_input);
            let blocking = self.rules.iter().any(|rule| rule.verdict.is_block());
            if !self.matched_redact_slots.is_empty() && !blocking {
                self.collect_redact_spans(text, in_last_turn);
            }
        } else {
            self.span_scratch.clear();
        }
        let Ok(redacted) = redact_text_block(
            text,
            target,
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
        match redacted {
            BlockRedaction::Redacted(target, text) => {
                self.blocks
                    .push(target, text, in_last_turn, BlockMutation::Local);
            }
            BlockRedaction::Unchanged(target) if external_needs_leaf && !text.is_empty() => {
                if reserve_guardrail_bytes(
                    self.budget,
                    TURN_BLOCK_OVERHEAD_BYTES,
                    &mut self.redaction_reservations,
                )
                .is_err()
                {
                    self.budget_exhausted = true;
                    return false;
                }
                self.blocks.push(
                    target,
                    text.to_owned(),
                    in_last_turn,
                    BlockMutation::Unchanged,
                );
            }
            BlockRedaction::Unchanged(_) => {}
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
                    GuardrailScope::Unknown => false,
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
                    rule.verdict.escalate(RuleVerdict::from_fail_closed(
                        guardrail.action,
                        BlockReason::Unreadable,
                    ));
                }
            });
        }
        if self.span_scratch.len() == before {
            for &slot in &self.matched_redact_slots {
                if let Some(rule) = self.rules.get_mut(slot)
                    && let Some(guardrail) = self.guardrails.get(rule.guardrail_index)
                {
                    rule.verdict.escalate(RuleVerdict::from_fail_closed(
                        guardrail.action,
                        BlockReason::Unreadable,
                    ));
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
            let regex_exceeded = guardrail.regex_patterns().is_some()
                && match guardrail.scope {
                    GuardrailScope::LastTurn => self.last_turn.regex_exceeded,
                    GuardrailScope::EntireInput => self.entire_input.regex_exceeded,
                    GuardrailScope::Unknown => false,
                };
            let fail_reason = if unreadable {
                Some(BlockReason::Unreadable)
            } else if regex_exceeded {
                Some(BlockReason::InputTooLarge)
            } else if matches!(guardrail.kind, GuardrailKind::FailClosed) {
                Some(BlockReason::Unavailable)
            } else {
                None
            };
            if let Some(reason) = fail_reason {
                rule.verdict
                    .escalate(RuleVerdict::from_fail_closed(guardrail.action, reason));
            }
        }
        if unreadable || self.rules.iter().any(|rule| rule.verdict.is_block()) {
            self.blocks.clear();
        }
        Ok(GuardrailEvaluation {
            rules: self.rules,
            blocks: self.blocks,
            redaction_reservations: self.redaction_reservations,
        })
    }
}

/// Reserves `bytes` from `budget`, merging into the existing reservation so
/// per-block reservations do not allocate one handle per leaf.
fn reserve_guardrail_bytes(
    budget: Option<&Arc<Semaphore>>,
    bytes: usize,
    reservations: &mut Vec<MemoryReservation>,
) -> Result<(), ResolutionError> {
    let Some(budget) = budget else {
        return Ok(());
    };
    if bytes == 0 {
        return Ok(());
    }
    if let Some(existing) = reservations.first_mut() {
        existing.try_reserve_additional(bytes, "guardrails")
    } else {
        reservations.push(MemoryReservation::from_budget(budget, bytes, "guardrails")?);
        Ok(())
    }
}

/// Reserves memory for an expanded replacement buffer (`String` + JSON-encoded
/// `BodyEdit` + `TurnBlock` overhead) before allocating it.
fn reserve_redaction_bytes(
    budget: Option<&Arc<Semaphore>>,
    bytes: usize,
    reservations: &mut Vec<MemoryReservation>,
) -> Result<(), ResolutionError> {
    let reserved = bytes
        .saturating_mul(2)
        .saturating_add(TURN_BLOCK_OVERHEAD_BYTES);
    reserve_guardrail_bytes(budget, reserved, reservations)
}

enum BlockRedaction {
    Unchanged(EditTarget),
    Redacted(EditTarget, String),
}

fn redact_text_block(
    text: &str,
    target: EditTarget,
    span_scratch: &mut Vec<RedactionSpan<'_>>,
    guardrails: &[Guardrail],
    rules: &mut [RuleState],
    budget: Option<&Arc<Semaphore>>,
    reservations: &mut Vec<MemoryReservation>,
) -> Result<BlockRedaction, ResolutionError> {
    if span_scratch.is_empty() {
        return Ok(BlockRedaction::Unchanged(target));
    }
    if matches!(target, EditTarget::Uneditable) {
        fail_closed_spans(span_scratch, guardrails, rules, BlockReason::Policy);
        return Ok(BlockRedaction::Unchanged(target));
    }
    let Some(capacity) = redact::prepare_redactions(text, span_scratch) else {
        fail_closed_spans(span_scratch, guardrails, rules, BlockReason::Unreadable);
        return Ok(BlockRedaction::Unchanged(target));
    };
    reserve_redaction_bytes(budget, capacity, reservations)?;
    Ok(BlockRedaction::Redacted(
        target,
        redact::splice_merged_spans(text, span_scratch, capacity),
    ))
}

fn fail_closed_spans(
    spans: &[RedactionSpan<'_>],
    guardrails: &[Guardrail],
    rules: &mut [RuleState],
    reason: BlockReason,
) {
    for span in spans {
        if let Some(rule) = rules.get_mut(span.priority)
            && let Some(guardrail) = guardrails.get(rule.guardrail_index)
        {
            rule.verdict
                .escalate(RuleVerdict::from_fail_closed(guardrail.action, reason));
        }
    }
}

#[cfg(test)]
mod tests;
