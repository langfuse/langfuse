//! Format-agnostic response guardrail parsing, memory budgeting, and in-place
//! redaction for non-streaming JSON and streaming SSE provider outputs.
//!
//! Format-specific JSON/SSE field extraction and `logprobs` scrubbing live in
//! the provider protocol modules under [`crate::capture`]. Each logical model
//! output (a JSON leaf, or an SSE delta stream plus any matching summary fields)
//! is collected once as a [`ResponseBlock`]. When no guardrail redacts the
//! response, the caller relays the original raw bytes untouched; when redaction
//! fires, modified strings and `logprobs` token copies are rewritten in place
//! via JSON pointers.
use std::{
    collections::{HashMap, HashSet},
    fmt,
    ops::Range,
    sync::Arc,
};

use axum::body::Bytes;
use axum::http::{HeaderMap, header};
use serde::de::{DeserializeSeed, Error as _, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};
use tokio::sync::Semaphore;

use crate::{
    capture,
    guardrails::text::Unreadable,
    inference::MemoryReservation,
    resolution::{ApiFormat, ResolutionError},
    transport::identity_encoding,
};

const MAX_JSON_DEPTH: usize = 32;
/// Batch size for charging dynamic `serde_json::Value` parse overhead to `memory_budget`.
const PARSE_RESERVATION_BATCH_BYTES: usize = 16 * 1024;
/// Per-element overhead of a `serde_json::Value` stored inside a `Vec`.
const VALUE_NODE_OVERHEAD_BYTES: usize = size_of::<Value>() + 16;
/// Per-entry overhead of a `serde_json::Map` (`BTreeMap<String, Value>` node + key + value).
const MAP_ENTRY_OVERHEAD_BYTES: usize = size_of::<String>() + size_of::<Value>() + 64;

/// Failure mode when parsing a response body for guardrails.
#[derive(Debug)]
pub(crate) enum ResponseParseError {
    Unreadable,
    Busy,
}

impl From<Unreadable> for ResponseParseError {
    fn from(_: Unreadable) -> Self {
        Self::Unreadable
    }
}

/// Tracks dynamic memory reservations while building a temporary `serde_json::Value` tree.
struct ParseBudget {
    reservation: Option<MemoryReservation>,
    pending: usize,
    exhausted: bool,
}

impl ParseBudget {
    fn new(budget: Option<&Arc<Semaphore>>) -> Result<Self, ResponseParseError> {
        let reservation = budget
            .map(|budget| MemoryReservation::from_budget(budget, 0, "guardrails"))
            .transpose()
            .map_err(|_| ResponseParseError::Busy)?;
        Ok(Self {
            reservation,
            pending: 0,
            exhausted: false,
        })
    }

    fn charge(&mut self, bytes: usize) -> bool {
        if self.reservation.is_none() || bytes == 0 {
            return true;
        }
        self.pending = self.pending.saturating_add(bytes);
        if self.pending >= PARSE_RESERVATION_BATCH_BYTES {
            return self.flush();
        }
        true
    }

    fn flush(&mut self) -> bool {
        let Some(reservation) = self.reservation.as_mut() else {
            return true;
        };
        if self.pending == 0 {
            return true;
        }
        let amount = std::mem::take(&mut self.pending);
        if reservation
            .try_reserve_additional(amount, "guardrails")
            .is_err()
        {
            self.exhausted = true;
            return false;
        }
        true
    }
}

/// Supported response wire formats that response guardrails can inspect.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ResponseFormat {
    Json,
    Sse,
}

impl ResponseFormat {
    /// Returns the wire format when headers carry uncompressed JSON or SSE;
    /// `None` marks the response unreadable so enforcing guardrails fail closed.
    pub(crate) fn from_headers(headers: &HeaderMap) -> Option<Self> {
        if !identity_encoding(headers) {
            return None;
        }
        let content_type = headers
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim();
        if content_type.eq_ignore_ascii_case("text/event-stream") {
            Some(Self::Sse)
        } else if content_type.eq_ignore_ascii_case("application/json") {
            Some(Self::Json)
        } else {
            None
        }
    }
}

/// One logical text block extracted from a provider response.
#[derive(Debug)]
pub(crate) struct ResponseBlock {
    pub text: String,
    pub editable: bool,
    /// `(frame_index, json_pointer)` slots for a streamed delta sequence.
    deltas: Vec<(usize, String)>,
    /// `(frame_index, json_pointer)` slots for complete strings (`None` = JSON body).
    leaves: Vec<(Option<usize>, String)>,
}

/// Parsed response body paired with its extracted logical text blocks.
pub(crate) struct ParsedResponse {
    api_format: ApiFormat,
    body: ParsedBody,
    blocks: Vec<ResponseBlock>,
    /// Memory budget held for retained `ResponseBlock` strings and JSON pointers
    /// across external guardrail I/O until `finalize_response` consumes `self`.
    _blocks_reservation: Option<MemoryReservation>,
}

enum ParsedBody {
    Json(Bytes),
    Sse {
        raw: Bytes,
        frames: Vec<SseFrameSpan>,
        _frames_reservation: Option<MemoryReservation>,
    },
}

struct SseFrameSpan {
    raw_range: Range<usize>,
    has_logprobs: bool,
}

fn blocks_retained_bytes(blocks: &[ResponseBlock]) -> usize {
    blocks.iter().fold(0usize, |total, block| {
        let deltas_bytes: usize = block
            .deltas
            .iter()
            .map(|(_, ptr)| size_of::<(usize, String)>().saturating_add(ptr.capacity()))
            .sum();
        let leaves_bytes: usize = block
            .leaves
            .iter()
            .map(|(_, ptr)| size_of::<(Option<usize>, String)>().saturating_add(ptr.capacity()))
            .sum();
        total
            .saturating_add(size_of::<ResponseBlock>())
            .saturating_add(block.text.capacity())
            .saturating_add(deltas_bytes)
            .saturating_add(leaves_bytes)
    })
}

fn reserve_retained_blocks(
    blocks: &[ResponseBlock],
    budget: Option<&Arc<Semaphore>>,
) -> Result<Option<MemoryReservation>, ResponseParseError> {
    let bytes = blocks_retained_bytes(blocks);
    if bytes == 0 {
        return Ok(None);
    }
    budget
        .map(|budget| MemoryReservation::from_budget(budget, bytes, "guardrails"))
        .transpose()
        .map_err(|_| ResponseParseError::Busy)
}

impl ParsedResponse {
    /// Parses `body` according to `api_format` and `format`, dynamically
    /// charging temporary `serde_json::Value` allocations against `budget`,
    /// and retains only the raw bytes plus lightweight span metadata.
    pub(crate) fn parse(
        api_format: ApiFormat,
        format: ResponseFormat,
        body: Bytes,
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<Self, ResponseParseError> {
        match format {
            ResponseFormat::Json => parse_json(api_format, body, budget),
            ResponseFormat::Sse => parse_sse(api_format, body, budget),
        }
    }

    pub(crate) fn blocks(&self) -> &[ResponseBlock] {
        &self.blocks
    }

    pub(crate) fn text_bytes(&self) -> usize {
        self.blocks.iter().map(|block| block.text.len()).sum()
    }

    /// Rewrites every modified `(block_index, redacted_text)` in place, scrubs
    /// `logprobs` token copies, and serializes the updated body.
    pub(crate) fn apply_redactions(
        self,
        edits: &[(usize, String)],
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<Option<Bytes>, ResolutionError> {
        if edits.is_empty() {
            return Ok(None);
        }
        let mut json_edits: Vec<(&str, &str)> = Vec::new();
        let mut sse_edits: HashMap<usize, Vec<(&str, &str)>> = HashMap::new();
        for (index, replacement) in edits {
            let Some(block) = self.blocks.get(*index) else {
                return Ok(None);
            };
            if !block.editable {
                return Ok(None);
            }
            for (pos, (frame_idx, ptr)) in block.deltas.iter().enumerate() {
                let text = if pos == 0 { replacement.as_str() } else { "" };
                sse_edits
                    .entry(*frame_idx)
                    .or_default()
                    .push((ptr.as_str(), text));
            }
            for (frame_idx, ptr) in &block.leaves {
                match frame_idx {
                    None => json_edits.push((ptr.as_str(), replacement.as_str())),
                    Some(idx) => sse_edits
                        .entry(*idx)
                        .or_default()
                        .push((ptr.as_str(), replacement.as_str())),
                }
            }
        }
        match self.body {
            ParsedBody::Json(raw) => {
                if !sse_edits.is_empty() {
                    return Ok(None);
                }
                let _out_reservation = budget
                    .filter(|_| !raw.is_empty())
                    .map(|budget| MemoryReservation::from_budget(budget, raw.len(), "guardrails"))
                    .transpose()?;
                let (mut value, _res) = match parse_unique_json(&raw, budget) {
                    Ok(parsed) => parsed,
                    Err(ResponseParseError::Busy) => return Err(ResolutionError::Busy),
                    Err(ResponseParseError::Unreadable) => return Ok(None),
                };
                for (ptr, text) in json_edits {
                    let Some(target) = value.pointer_mut(ptr) else {
                        return Ok(None);
                    };
                    *target = Value::String(text.to_owned());
                }
                capture::scrub_response_logprobs(self.api_format, &mut value);
                Ok(serde_json::to_vec(&value).ok().map(Bytes::from))
            }
            ParsedBody::Sse { raw, frames, .. } => {
                if !json_edits.is_empty() {
                    return Ok(None);
                }
                apply_sse_redactions(self.api_format, &raw, &frames, &sse_edits, budget)
            }
        }
    }
}

fn apply_sse_redactions(
    api_format: ApiFormat,
    raw: &[u8],
    frames: &[SseFrameSpan],
    sse_edits: &HashMap<usize, Vec<(&str, &str)>>,
    budget: Option<&Arc<Semaphore>>,
) -> Result<Option<Bytes>, ResolutionError> {
    let Ok(text) = std::str::from_utf8(raw) else {
        return Ok(None);
    };
    let _out_reservation = budget
        .filter(|_| !text.is_empty())
        .map(|budget| MemoryReservation::from_budget(budget, text.len(), "guardrails"))
        .transpose()?;
    let mut out = String::with_capacity(text.len());
    for (frame_idx, frame) in frames.iter().enumerate() {
        let Some(raw_slice) = text.get(frame.raw_range.clone()) else {
            return Ok(None);
        };
        let frame_edits = sse_edits.get(&frame_idx);
        if frame_edits.is_none() && !frame.has_logprobs {
            out.push_str(raw_slice);
            continue;
        }
        let Some((prefix, Some(payload))) = split_single_sse_frame(raw_slice) else {
            return Ok(None);
        };
        let (mut value, _res) = match parse_unique_json(payload.as_bytes(), budget) {
            Ok(parsed) => parsed,
            Err(ResponseParseError::Busy) => return Err(ResolutionError::Busy),
            Err(ResponseParseError::Unreadable) => return Ok(None),
        };
        if let Some(edits_for_frame) = frame_edits {
            for &(ptr, replacement) in edits_for_frame {
                let Some(target) = value.pointer_mut(ptr) else {
                    return Ok(None);
                };
                *target = Value::String(replacement.to_owned());
            }
        }
        let scrubbed = capture::scrub_response_logprobs(api_format, &mut value);
        if frame_edits.is_none() && !scrubbed {
            out.push_str(raw_slice);
            continue;
        }
        let Ok(encoded) = serde_json::to_string(&value) else {
            return Ok(None);
        };
        out.push_str(&prefix);
        out.push_str("data: ");
        out.push_str(&encoded);
        out.push_str("\n\n");
    }
    Ok(Some(Bytes::from(out)))
}

fn split_single_sse_frame(frame: &str) -> Option<(String, Option<String>)> {
    let mut prefix = String::new();
    let mut data_lines: Vec<&str> = Vec::new();
    let bytes = frame.as_bytes();
    let mut cursor = 0usize;
    while cursor < bytes.len() {
        let line_start = cursor;
        while bytes
            .get(cursor)
            .is_some_and(|&byte| byte != b'\n' && byte != b'\r')
        {
            cursor += 1;
        }
        let line = frame.get(line_start..cursor)?;
        let eol_start = cursor;
        if bytes.get(cursor) == Some(&b'\r') {
            cursor += 1;
            if bytes.get(cursor) == Some(&b'\n') {
                cursor += 1;
            }
        } else if bytes.get(cursor) == Some(&b'\n') {
            cursor += 1;
        }
        if line.is_empty() {
            break;
        }
        if let Some(rest) = line.strip_prefix("data:") {
            data_lines.push(rest.strip_prefix(' ').unwrap_or(rest));
        } else if line == "data" {
            data_lines.push("");
        } else {
            prefix.push_str(frame.get(line_start..cursor)?);
            if cursor == eol_start {
                prefix.push('\n');
            }
        }
    }
    let payload = (!data_lines.is_empty()).then(|| data_lines.join("\n"));
    Some((prefix, payload))
}

/// Parses JSON into [`Value`] while rejecting duplicate object keys and
/// charging dynamic `Value` tree memory overhead against `budget`.
fn parse_unique_json(
    bytes: &[u8],
    budget: Option<&Arc<Semaphore>>,
) -> Result<(Value, Option<MemoryReservation>), ResponseParseError> {
    struct UniqueValue<'a> {
        budget: &'a mut ParseBudget,
    }

    impl<'de> DeserializeSeed<'de> for UniqueValue<'_> {
        type Value = Value;

        fn deserialize<D: serde::Deserializer<'de>>(
            self,
            deserializer: D,
        ) -> Result<Self::Value, D::Error> {
            deserializer.deserialize_any(self)
        }
    }

    impl<'de> Visitor<'de> for UniqueValue<'_> {
        type Value = Value;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("any valid JSON value without duplicate object keys")
        }

        fn visit_bool<E>(self, v: bool) -> Result<Value, E> {
            Ok(Value::Bool(v))
        }
        fn visit_i64<E>(self, v: i64) -> Result<Value, E> {
            Ok(Value::Number(v.into()))
        }
        fn visit_u64<E>(self, v: u64) -> Result<Value, E> {
            Ok(Value::Number(v.into()))
        }
        fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<Value, E> {
            Number::from_f64(v)
                .map(Value::Number)
                .ok_or_else(|| E::custom("non-finite float"))
        }
        fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<Value, E> {
            if !self.budget.charge(v.len().saturating_add(32)) {
                return Err(E::custom("memory budget exhausted"));
            }
            Ok(Value::String(v.to_owned()))
        }
        fn visit_string<E: serde::de::Error>(self, v: String) -> Result<Value, E> {
            if !self.budget.charge(v.len().saturating_add(32)) {
                return Err(E::custom("memory budget exhausted"));
            }
            Ok(Value::String(v))
        }
        fn visit_unit<E>(self) -> Result<Value, E> {
            Ok(Value::Null)
        }
        fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Value, A::Error> {
            let mut items = Vec::new();
            while let Some(item) = seq.next_element_seed(UniqueValue {
                budget: self.budget,
            })? {
                if !self.budget.charge(VALUE_NODE_OVERHEAD_BYTES) {
                    return Err(A::Error::custom("memory budget exhausted"));
                }
                items.push(item);
            }
            Ok(Value::Array(items))
        }
        fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Value, A::Error> {
            let mut entries = Map::new();
            while let Some(key) = map.next_key::<String>()? {
                if entries.contains_key(&key) {
                    return Err(A::Error::custom("duplicate object key"));
                }
                if !self
                    .budget
                    .charge(key.len().saturating_add(MAP_ENTRY_OVERHEAD_BYTES))
                {
                    return Err(A::Error::custom("memory budget exhausted"));
                }
                let value = map.next_value_seed(UniqueValue {
                    budget: self.budget,
                })?;
                entries.insert(key, value);
            }
            Ok(Value::Object(entries))
        }
    }

    let mut parse_budget = ParseBudget::new(budget)?;
    let mut deserializer = serde_json::Deserializer::from_slice(bytes);
    let parsed = UniqueValue {
        budget: &mut parse_budget,
    }
    .deserialize(&mut deserializer)
    .and_then(|value| deserializer.end().map(|()| value));
    match parsed {
        Ok(value) => {
            if !parse_budget.flush() {
                return Err(ResponseParseError::Busy);
            }
            Ok((value, parse_budget.reservation))
        }
        Err(_) if parse_budget.exhausted => Err(ResponseParseError::Busy),
        Err(_) => Err(ResponseParseError::Unreadable),
    }
}

fn parse_json(
    api_format: ApiFormat,
    body: Bytes,
    budget: Option<&Arc<Semaphore>>,
) -> Result<ParsedResponse, ResponseParseError> {
    let mut blocks = Vec::new();
    {
        let (value, _parse_reservation) = parse_unique_json(&body, budget)?;
        if !value.is_object() {
            return Err(ResponseParseError::Unreadable);
        }
        capture::extract_response_json(api_format, &value, &mut blocks)?;
    }
    let blocks_reservation = reserve_retained_blocks(&blocks, budget)?;
    Ok(ParsedResponse {
        api_format,
        body: ParsedBody::Json(body),
        blocks,
        _blocks_reservation: blocks_reservation,
    })
}

fn parse_sse_frame(
    api_format: ApiFormat,
    frame_idx: usize,
    data_lines: &[&str],
    budget: Option<&Arc<Semaphore>>,
    collector: &mut StreamCollector,
) -> Result<(bool, usize), ResponseParseError> {
    if data_lines.is_empty() {
        return Ok((false, 0));
    }
    let payload = data_lines.join("\n");
    if payload == "[DONE]" {
        return Ok((false, 0));
    }
    let (value, _frame_reservation) = parse_unique_json(payload.as_bytes(), budget)?;
    let has_logprobs = capture::has_response_logprobs(api_format, &value);
    capture::extract_response_sse(api_format, frame_idx, &value, collector)?;
    Ok((has_logprobs, collector.take_growth_bytes()))
}

fn parse_sse(
    api_format: ApiFormat,
    raw: Bytes,
    budget: Option<&Arc<Semaphore>>,
) -> Result<ParsedResponse, ResponseParseError> {
    if !matches!(
        api_format,
        ApiFormat::OpenAiChatCompletions
            | ApiFormat::AnthropicMessages
            | ApiFormat::OpenAiResponses
    ) {
        return Err(ResponseParseError::Unreadable);
    }
    let text = std::str::from_utf8(&raw).map_err(|_| ResponseParseError::Unreadable)?;
    let bytes = text.as_bytes();
    let mut frames = Vec::new();
    let mut frames_budget = ParseBudget::new(budget)?;
    let mut collector = StreamCollector::default();
    let mut cursor = 0usize;
    let mut event_start = 0usize;
    let mut data_lines: Vec<&str> = Vec::new();

    while cursor < bytes.len() {
        let line_start = cursor;
        while bytes
            .get(cursor)
            .is_some_and(|&byte| byte != b'\n' && byte != b'\r')
        {
            cursor += 1;
        }
        let line = text
            .get(line_start..cursor)
            .ok_or(ResponseParseError::Unreadable)?;
        match bytes.get(cursor) {
            Some(&b'\r') => {
                cursor += 1;
                if bytes.get(cursor) == Some(&b'\n') {
                    cursor += 1;
                }
            }
            Some(&b'\n') => cursor += 1,
            _ if !line.is_empty() => return Err(ResponseParseError::Unreadable),
            _ => {}
        }
        if line.is_empty() {
            let (has_logprobs, growth) = parse_sse_frame(
                api_format,
                frames.len(),
                &data_lines,
                budget,
                &mut collector,
            )?;
            if !frames_budget.charge(size_of::<SseFrameSpan>().saturating_add(growth)) {
                return Err(ResponseParseError::Busy);
            }
            frames.push(SseFrameSpan {
                raw_range: event_start..cursor,
                has_logprobs,
            });
            data_lines.clear();
            event_start = cursor;
            continue;
        }
        if let Some(rest) = line.strip_prefix("data:") {
            data_lines.push(rest.strip_prefix(' ').unwrap_or(rest));
        } else if line == "data" {
            data_lines.push("");
        }
    }
    if !data_lines.is_empty() {
        return Err(ResponseParseError::Unreadable);
    }
    if event_start < bytes.len() {
        if !frames_budget.charge(size_of::<SseFrameSpan>()) {
            return Err(ResponseParseError::Busy);
        }
        frames.push(SseFrameSpan {
            raw_range: event_start..bytes.len(),
            has_logprobs: false,
        });
    }
    if !frames_budget.flush() {
        return Err(ResponseParseError::Busy);
    }
    let blocks = collector.finish();
    Ok(ParsedResponse {
        api_format,
        body: ParsedBody::Sse {
            raw,
            frames,
            _frames_reservation: frames_budget.reservation,
        },
        blocks,
        _blocks_reservation: None,
    })
}

// ---------------------------------------------------------------------------
// Shared extraction helpers used by provider protocol modules in `capture`
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum StreamKey {
    Chat(u64, &'static str),
    ChatToolArgs(u64, u64),
    ChatToolCustomInput(u64, u64),
    Anthropic(u64, &'static str),
    Responses(u64, u64, &'static str),
}

#[derive(Default)]
pub(crate) struct StreamCollector {
    blocks: Vec<ResponseBlock>,
    by_key: HashMap<StreamKey, usize>,
    signed_thinking: HashSet<u64>,
    /// Retained bytes allocated by `StreamCollector` since the last `take_growth_bytes`.
    growth_bytes: usize,
}

impl StreamCollector {
    pub(crate) fn push_delta(&mut self, key: StreamKey, frame_idx: usize, ptr: String, text: &str) {
        if text.is_empty() {
            return;
        }
        let ptr_bytes = size_of::<(usize, String)>().saturating_add(ptr.capacity());
        if let Some(&slot) = self.by_key.get(&key)
            && let Some(block) = self.blocks.get_mut(slot)
        {
            let prev_cap = block.text.capacity();
            block.text.push_str(text);
            block.deltas.push((frame_idx, ptr));
            self.growth_bytes = self
                .growth_bytes
                .saturating_add(block.text.capacity().saturating_sub(prev_cap))
                .saturating_add(ptr_bytes);
            return;
        }
        let owned = text.to_owned();
        let added = size_of::<ResponseBlock>()
            .saturating_add(owned.capacity())
            .saturating_add(ptr_bytes);
        let slot = self.blocks.len();
        self.blocks.push(ResponseBlock {
            text: owned,
            editable: true,
            deltas: vec![(frame_idx, ptr)],
            leaves: Vec::new(),
        });
        self.by_key.insert(key, slot);
        self.growth_bytes = self.growth_bytes.saturating_add(added);
    }

    pub(crate) fn push_summary(
        &mut self,
        key: Option<StreamKey>,
        frame_idx: usize,
        ptr: String,
        text: &str,
    ) {
        if text.is_empty() {
            return;
        }
        let ptr_bytes = size_of::<(Option<usize>, String)>().saturating_add(ptr.capacity());
        if let Some(key) = key
            && let Some(&slot) = self.by_key.get(&key)
            && let Some(block) = self.blocks.get_mut(slot)
            && block.text == text
        {
            block.leaves.push((Some(frame_idx), ptr));
            self.growth_bytes = self.growth_bytes.saturating_add(ptr_bytes);
            return;
        }
        self.push_leaf(frame_idx, text, ptr);
    }

    pub(crate) fn push_leaf(&mut self, frame_idx: usize, text: &str, ptr: String) {
        if text.is_empty() {
            return;
        }
        let owned = text.to_owned();
        let added = size_of::<ResponseBlock>()
            .saturating_add(owned.capacity())
            .saturating_add(size_of::<(Option<usize>, String)>())
            .saturating_add(ptr.capacity());
        self.blocks.push(ResponseBlock {
            text: owned,
            editable: true,
            deltas: Vec::new(),
            leaves: vec![(Some(frame_idx), ptr)],
        });
        self.growth_bytes = self.growth_bytes.saturating_add(added);
    }

    pub(crate) fn attach_or_push_leaf(&mut self, frame_idx: usize, text: &str, ptr: String) {
        if text.is_empty() {
            return;
        }
        if let Some(block) = self.blocks.iter_mut().find(|block| block.text == text) {
            let ptr_bytes = size_of::<(Option<usize>, String)>().saturating_add(ptr.capacity());
            block.leaves.push((Some(frame_idx), ptr));
            self.growth_bytes = self.growth_bytes.saturating_add(ptr_bytes);
            return;
        }
        self.push_leaf(frame_idx, text, ptr);
    }

    fn take_growth_bytes(&mut self) -> usize {
        std::mem::take(&mut self.growth_bytes)
    }

    pub(crate) fn mark_signed_thinking(&mut self, index: u64) {
        self.signed_thinking.insert(index);
    }

    fn finish(mut self) -> Vec<ResponseBlock> {
        for index in self.signed_thinking {
            if let Some(&slot) = self.by_key.get(&StreamKey::Anthropic(index, "thinking"))
                && let Some(block) = self.blocks.get_mut(slot)
            {
                block.editable = false;
            }
        }
        self.blocks
    }
}

pub(crate) fn ptr_push(base: &str, key: &str) -> String {
    let mut out = String::with_capacity(base.len() + key.len() + 1);
    out.push_str(base);
    out.push('/');
    for ch in key.chars() {
        match ch {
            '~' => out.push_str("~0"),
            '/' => out.push_str("~1"),
            other => out.push(other),
        }
    }
    out
}

pub(crate) fn ptr_index(base: &str, index: usize) -> String {
    format!("{base}/{index}")
}

pub(crate) fn push_leaf(
    blocks: &mut Vec<ResponseBlock>,
    frame_idx: Option<usize>,
    text: &str,
    ptr: String,
    editable: bool,
) {
    if text.is_empty() {
        return;
    }
    blocks.push(ResponseBlock {
        text: text.to_owned(),
        editable,
        deltas: Vec::new(),
        leaves: vec![(frame_idx, ptr)],
    });
}

/// Attaches a duplicate summary field (e.g. `output_text`) to an already
/// collected block with identical text so Bedrock sees one block and every copy
/// is rewritten together.
pub(crate) fn attach_matching_or_push_leaf(
    blocks: &mut Vec<ResponseBlock>,
    frame_idx: Option<usize>,
    text: &str,
    ptr: String,
) {
    if text.is_empty() {
        return;
    }
    if let Some(block) = blocks.iter_mut().find(|block| block.text == text) {
        block.leaves.push((frame_idx, ptr));
        return;
    }
    push_leaf(blocks, frame_idx, text, ptr, true);
}

pub(crate) fn visit_text_or_parts(
    value: &Value,
    ptr: &str,
    depth: usize,
    visit: &mut impl FnMut(String, &str),
) -> Result<(), Unreadable> {
    if depth > MAX_JSON_DEPTH {
        return Err(Unreadable);
    }
    match value {
        Value::String(text) => visit(ptr.to_owned(), text),
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                let item_ptr = ptr_index(ptr, index);
                match item {
                    Value::String(text) => visit(item_ptr, text),
                    Value::Object(map) => {
                        for key in ["text", "refusal", "transcript", "content"] {
                            if let Some(field) = map.get(key) {
                                visit_text_or_parts(
                                    field,
                                    &ptr_push(&item_ptr, key),
                                    depth + 1,
                                    visit,
                                )?;
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
    Ok(())
}

pub(crate) fn collect_text_or_parts(
    value: &Value,
    frame_idx: Option<usize>,
    ptr: &str,
    depth: usize,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
    visit_text_or_parts(value, ptr, depth, &mut |leaf_ptr, text| {
        push_leaf(blocks, frame_idx, text, leaf_ptr, true);
    })
}

pub(crate) fn visit_all_strings(
    value: &Value,
    ptr: &str,
    skip_keys: &[&str],
    depth: usize,
    visit: &mut impl FnMut(String, &str),
) -> Result<(), Unreadable> {
    if depth > MAX_JSON_DEPTH {
        return Err(Unreadable);
    }
    match value {
        Value::String(text) => visit(ptr.to_owned(), text),
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                visit_all_strings(item, &ptr_index(ptr, index), skip_keys, depth + 1, visit)?;
            }
        }
        Value::Object(map) => {
            for (key, field) in map {
                if !skip_keys.contains(&key.as_str()) {
                    visit_all_strings(field, &ptr_push(ptr, key), skip_keys, depth + 1, visit)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

pub(crate) fn collect_all_strings(
    value: &Value,
    frame_idx: Option<usize>,
    ptr: &str,
    skip_keys: &[&str],
    depth: usize,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
    visit_all_strings(value, ptr, skip_keys, depth, &mut |leaf_ptr, text| {
        push_leaf(blocks, frame_idx, text, leaf_ptr, true);
    })
}

pub(crate) fn collect_citation_fields(
    citation: &Value,
    base_ptr: &str,
    on_field: &mut impl FnMut(&str, String),
) {
    let Some(map) = citation.as_object() else {
        return;
    };
    for key in [
        "cited_text",
        "document_title",
        "title",
        "url",
        "source",
        "filename",
        "text",
        "quote",
    ] {
        if let Some(text) = map.get(key).and_then(Value::as_str) {
            on_field(text, ptr_push(base_ptr, key));
        }
    }
    for nested_key in ["url_citation", "file_citation", "file_path"] {
        if let Some(nested) = map.get(nested_key) {
            collect_citation_fields(nested, &ptr_push(base_ptr, nested_key), on_field);
        }
    }
}

pub(crate) fn collect_annotations(
    annotations: &Value,
    base_ptr: &str,
    on_field: &mut impl FnMut(&str, String),
) -> Result<(), Unreadable> {
    for (idx, annotation) in annotations.as_array().ok_or(Unreadable)?.iter().enumerate() {
        let ann_ptr = ptr_index(base_ptr, idx);
        collect_citation_fields(annotation, &ann_ptr, on_field);
    }
    Ok(())
}
