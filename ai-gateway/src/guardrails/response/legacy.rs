//! The response parser and extractors as they were before the per-format specs,
//! kept as a test oracle: the equivalence fuzz test below compares them with
//! [`super::ParsedResponse`] on generated responses.

use std::{
    collections::{HashMap, HashSet},
    fmt,
    ops::Range,
    sync::Arc,
};

use axum::body::Bytes;
use serde::de::{DeserializeSeed, Error as _, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};
use tokio::sync::Semaphore;

use super::ResponseParseError;
use crate::{
    guardrails::text::Unreadable,
    inference::MemoryReservation,
    resolution::{ApiFormat, ResolutionError},
};
use serde_json::Map as JsonMap;

const MAX_JSON_DEPTH: usize = 32;
/// Batch size for charging dynamic `serde_json::Value` parse overhead to `memory_budget`.
const PARSE_RESERVATION_BATCH_BYTES: usize = 16 * 1024;
/// Per-element overhead of a `serde_json::Value` stored inside a `Vec`.
const VALUE_NODE_OVERHEAD_BYTES: usize = size_of::<Value>() + 16;
/// Per-entry overhead of a `serde_json::Map` (`BTreeMap<String, Value>` node + key + value).
const MAP_ENTRY_OVERHEAD_BYTES: usize = size_of::<String>() + size_of::<Value>() + 64;

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

/// One logical text block extracted from a provider response.
#[derive(Debug)]
pub(crate) struct ResponseBlock {
    pub text: String,
    pub editable: bool,
    /// True when the string holds JSON-encoded tool arguments that must remain
    /// valid JSON after redaction.
    json_encoded: bool,
    /// `(frame_index, json_pointer)` slots for a streamed delta sequence.
    deltas: Vec<(usize, String)>,
    /// `(frame_index, json_pointer)` slots for complete strings (`None` = JSON body).
    leaves: Vec<(Option<usize>, String)>,
}

/// Outcome of splicing response redactions back into the raw JSON or SSE body.
pub(crate) enum RedactionApply {
    Rewritten(Bytes),
    Unchanged,
    /// Redacting a JSON-encoded tool-argument block would produce invalid JSON.
    InvalidJson,
    Failed,
}

/// Parsed response body paired with its extracted logical text blocks.
pub(crate) struct ParsedResponse {
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
        frames: Vec<Range<usize>>,
        _frames_reservation: Option<MemoryReservation>,
    },
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
        format: super::ResponseFormat,
        body: Bytes,
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<Self, ResponseParseError> {
        match format {
            super::ResponseFormat::Json => parse_json(api_format, body, budget),
            super::ResponseFormat::Sse => parse_sse(api_format, body, budget),
        }
    }

    /// Rewrites every modified `(block_index, redacted_text)` in place and
    /// serializes the updated body.
    pub(crate) fn apply_redactions(
        self,
        edits: &[(usize, String)],
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<RedactionApply, ResolutionError> {
        if edits.is_empty() {
            return Ok(RedactionApply::Unchanged);
        }
        let mut json_edits: Vec<(&str, &str)> = Vec::new();
        let mut sse_edits: HashMap<usize, Vec<(&str, &str)>> = HashMap::new();
        for (index, replacement) in edits {
            let Some(block) = self.blocks.get(*index) else {
                return Ok(RedactionApply::Failed);
            };
            if !block.editable {
                return Ok(RedactionApply::Failed);
            }
            if block.json_encoded
                && serde_json::from_str::<serde::de::IgnoredAny>(replacement).is_err()
            {
                return Ok(RedactionApply::InvalidJson);
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
                    return Ok(RedactionApply::Failed);
                }
                let _out_reservation = budget
                    .filter(|_| !raw.is_empty())
                    .map(|budget| MemoryReservation::from_budget(budget, raw.len(), "guardrails"))
                    .transpose()?;
                let (mut value, _res) = match parse_unique_json(&raw, budget) {
                    Ok(parsed) => parsed,
                    Err(ResponseParseError::Busy) => return Err(ResolutionError::Busy),
                    Err(ResponseParseError::Unreadable) => return Ok(RedactionApply::Failed),
                };
                for (ptr, text) in json_edits {
                    let Some(target) = value.pointer_mut(ptr) else {
                        return Ok(RedactionApply::Failed);
                    };
                    *target = Value::String(text.to_owned());
                }
                Ok(serde_json::to_vec(&value)
                    .map(Bytes::from)
                    .map_or(RedactionApply::Failed, RedactionApply::Rewritten))
            }
            ParsedBody::Sse { raw, frames, .. } => {
                if !json_edits.is_empty() {
                    return Ok(RedactionApply::Failed);
                }
                Ok(apply_sse_redactions(&raw, &frames, &sse_edits, budget)?
                    .map_or(RedactionApply::Failed, RedactionApply::Rewritten))
            }
        }
    }
}

fn apply_sse_redactions(
    raw: &[u8],
    frames: &[Range<usize>],
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
    for (frame_idx, raw_range) in frames.iter().enumerate() {
        let Some(raw_slice) = text.get(raw_range.clone()) else {
            return Ok(None);
        };
        let Some(edits_for_frame) = sse_edits.get(&frame_idx) else {
            out.push_str(raw_slice);
            continue;
        };
        let Some((prefix, Some(payload))) = split_single_sse_frame(raw_slice) else {
            return Ok(None);
        };
        let (mut value, _res) = match parse_unique_json(payload.as_bytes(), budget) {
            Ok(parsed) => parsed,
            Err(ResponseParseError::Busy) => return Err(ResolutionError::Busy),
            Err(ResponseParseError::Unreadable) => return Ok(None),
        };
        for &(ptr, replacement) in edits_for_frame {
            let Some(target) = value.pointer_mut(ptr) else {
                return Ok(None);
            };
            *target = Value::String(replacement.to_owned());
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
        extract_response_json(api_format, &value, &mut blocks)?;
    }
    let blocks_reservation = reserve_retained_blocks(&blocks, budget)?;
    Ok(ParsedResponse {
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
) -> Result<usize, ResponseParseError> {
    if data_lines.is_empty() {
        return Ok(0);
    }
    let payload = data_lines.join("\n");
    if payload == "[DONE]" {
        return Ok(0);
    }
    let (value, _frame_reservation) = parse_unique_json(payload.as_bytes(), budget)?;
    extract_response_sse(api_format, frame_idx, &value, collector)?;
    Ok(collector.take_growth_bytes())
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
            let growth = parse_sse_frame(
                api_format,
                frames.len(),
                &data_lines,
                budget,
                &mut collector,
            )?;
            if !frames_budget.charge(size_of::<Range<usize>>().saturating_add(growth)) {
                return Err(ResponseParseError::Busy);
            }
            frames.push(event_start..cursor);
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
        if !frames_budget.charge(size_of::<Range<usize>>()) {
            return Err(ResponseParseError::Busy);
        }
        frames.push(event_start..bytes.len());
    }
    if !frames_budget.flush() {
        return Err(ResponseParseError::Busy);
    }
    let blocks = collector.finish();
    Ok(ParsedResponse {
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

impl StreamKey {
    fn is_json_encoded(self) -> bool {
        matches!(
            self,
            Self::ChatToolArgs(_, _)
                | Self::Chat(_, "function_call")
                | Self::Anthropic(_, "partial_json")
                | Self::Responses(_, _, "function_call_args" | "mcp_call_args")
        )
    }
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
            json_encoded: key.is_json_encoded(),
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
        self.push_leaf_inner(
            frame_idx,
            text,
            ptr,
            key.is_some_and(StreamKey::is_json_encoded),
        );
    }

    pub(crate) fn push_leaf(&mut self, frame_idx: usize, text: &str, ptr: String) {
        self.push_leaf_inner(frame_idx, text, ptr, false);
    }

    fn push_leaf_inner(&mut self, frame_idx: usize, text: &str, ptr: String, json_encoded: bool) {
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
            json_encoded,
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

pub(crate) fn push_leaf(blocks: &mut Vec<ResponseBlock>, text: &str, ptr: String, editable: bool) {
    push_leaf_inner(blocks, text, ptr, editable, false);
}

pub(crate) fn push_json_leaf(blocks: &mut Vec<ResponseBlock>, text: &str, ptr: String) {
    push_leaf_inner(blocks, text, ptr, true, true);
}

fn push_leaf_inner(
    blocks: &mut Vec<ResponseBlock>,
    text: &str,
    ptr: String,
    editable: bool,
    json_encoded: bool,
) {
    if text.is_empty() {
        return;
    }
    blocks.push(ResponseBlock {
        text: text.to_owned(),
        editable,
        json_encoded,
        deltas: Vec::new(),
        leaves: vec![(None, ptr)],
    });
}

/// Attaches a duplicate summary field (e.g. `output_text`) to an already
/// collected block with identical text so Bedrock sees one block and every copy
/// is rewritten together.
pub(crate) fn attach_matching_or_push_leaf(
    blocks: &mut Vec<ResponseBlock>,
    text: &str,
    ptr: String,
) {
    if text.is_empty() {
        return;
    }
    if let Some(block) = blocks.iter_mut().find(|block| block.text == text) {
        block.leaves.push((None, ptr));
        return;
    }
    push_leaf(blocks, text, ptr, true);
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
                        for key in ["text", "refusal", "content"] {
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
    ptr: &str,
    depth: usize,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
    visit_text_or_parts(value, ptr, depth, &mut |leaf_ptr, text| {
        push_leaf(blocks, text, leaf_ptr, true);
    })
}

pub(crate) fn visit_all_strings(
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
                visit_all_strings(item, &ptr_index(ptr, index), depth + 1, visit)?;
            }
        }
        Value::Object(map) => {
            for (key, field) in map {
                visit_all_strings(field, &ptr_push(ptr, key), depth + 1, visit)?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub(crate) fn collect_all_strings(
    value: &Value,
    ptr: &str,
    depth: usize,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
    visit_all_strings(value, ptr, depth, &mut |leaf_ptr, text| {
        push_leaf(blocks, text, leaf_ptr, true);
    })
}

fn extract_response_json(
    api_format: ApiFormat,
    value: &Value,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
    match api_format {
        ApiFormat::OpenAiChatCompletions => chat_extract_response_json(value, blocks),
        ApiFormat::AnthropicMessages => anthropic_extract_response_json(value, blocks),
        ApiFormat::OpenAiResponses => responses_extract_response_json(value, blocks),
        ApiFormat::OpenAiDecisions | ApiFormat::OpenAiEmbeddings => Err(Unreadable),
    }
}

fn extract_response_sse(
    api_format: ApiFormat,
    frame_idx: usize,
    value: &Value,
    collector: &mut StreamCollector,
) -> Result<(), Unreadable> {
    match api_format {
        ApiFormat::OpenAiChatCompletions => chat_extract_response_sse(frame_idx, value, collector),
        ApiFormat::AnthropicMessages => anthropic_extract_response_sse(frame_idx, value, collector),
        ApiFormat::OpenAiResponses => responses_extract_response_sse(frame_idx, value, collector),
        ApiFormat::OpenAiDecisions | ApiFormat::OpenAiEmbeddings => Err(Unreadable),
    }
}

fn chat_extract_response_json(
    value: &Value,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
    use self::{collect_text_or_parts, ptr_push, push_json_leaf, push_leaf};
    use crate::guardrails::text::Unreadable;

    let Some(choices) = value.get("choices").filter(|v| !v.is_null()) else {
        return Ok(());
    };
    let choices = choices.as_array().ok_or(Unreadable)?;
    for (index, choice) in choices.iter().enumerate() {
        let Some(message) = choice.get("message").filter(|v| !v.is_null()) else {
            continue;
        };
        let msg_ptr = format!("/choices/{index}/message");
        let map = message.as_object().ok_or(Unreadable)?;
        for key in ["content", "refusal", "reasoning", "reasoning_content"] {
            if let Some(field) = map.get(key) {
                collect_text_or_parts(field, &ptr_push(&msg_ptr, key), 0, blocks)?;
            }
        }
        if let Some(calls) = map.get("tool_calls").filter(|v| !v.is_null()) {
            for (call_idx, call) in calls.as_array().ok_or(Unreadable)?.iter().enumerate() {
                if let Some(args) = call.pointer("/function/arguments").and_then(Value::as_str) {
                    push_json_leaf(
                        blocks,
                        args,
                        format!("{msg_ptr}/tool_calls/{call_idx}/function/arguments"),
                    );
                }
                if let Some(input) = call.pointer("/custom/input").and_then(Value::as_str) {
                    push_leaf(
                        blocks,
                        input,
                        format!("{msg_ptr}/tool_calls/{call_idx}/custom/input"),
                        true,
                    );
                }
            }
        }
        if let Some(args) = message
            .pointer("/function_call/arguments")
            .and_then(Value::as_str)
        {
            push_json_leaf(blocks, args, format!("{msg_ptr}/function_call/arguments"));
        }
    }
    Ok(())
}

fn chat_extract_response_sse(
    frame_idx: usize,
    value: &Value,
    collector: &mut StreamCollector,
) -> Result<(), Unreadable> {
    use self::{StreamKey, ptr_push, visit_text_or_parts};
    use crate::guardrails::text::Unreadable;

    let Some(choices) = value.get("choices").filter(|v| !v.is_null()) else {
        return Ok(());
    };
    for (pos, choice) in choices.as_array().ok_or(Unreadable)?.iter().enumerate() {
        let choice_idx = choice.get("index").and_then(Value::as_u64).unwrap_or(0);
        let Some(delta) = choice.get("delta").filter(|v| !v.is_null()) else {
            continue;
        };
        let delta_ptr = format!("/choices/{pos}/delta");
        let map = delta.as_object().ok_or(Unreadable)?;
        for key in ["content", "refusal", "reasoning", "reasoning_content"] {
            match map.get(key) {
                None | Some(Value::Null) => {}
                Some(Value::String(text)) => {
                    collector.push_delta(
                        StreamKey::Chat(choice_idx, key),
                        frame_idx,
                        ptr_push(&delta_ptr, key),
                        text,
                    );
                }
                Some(field @ Value::Array(_)) => {
                    visit_text_or_parts(
                        field,
                        &ptr_push(&delta_ptr, key),
                        0,
                        &mut |leaf_ptr, text| {
                            collector.push_delta(
                                StreamKey::Chat(choice_idx, key),
                                frame_idx,
                                leaf_ptr,
                                text,
                            );
                        },
                    )?;
                }
                Some(_) => return Err(Unreadable),
            }
        }
        if let Some(calls) = map.get("tool_calls").filter(|v| !v.is_null()) {
            for (call_pos, call) in calls.as_array().ok_or(Unreadable)?.iter().enumerate() {
                let call_idx = call.get("index").and_then(Value::as_u64).unwrap_or(0);
                if let Some(args) = call.pointer("/function/arguments").and_then(Value::as_str) {
                    collector.push_delta(
                        StreamKey::ChatToolArgs(choice_idx, call_idx),
                        frame_idx,
                        format!("{delta_ptr}/tool_calls/{call_pos}/function/arguments"),
                        args,
                    );
                }
                if let Some(input) = call.pointer("/custom/input").and_then(Value::as_str) {
                    collector.push_delta(
                        StreamKey::ChatToolCustomInput(choice_idx, call_idx),
                        frame_idx,
                        format!("{delta_ptr}/tool_calls/{call_pos}/custom/input"),
                        input,
                    );
                }
            }
        }
        if let Some(args) = delta
            .pointer("/function_call/arguments")
            .and_then(Value::as_str)
        {
            collector.push_delta(
                StreamKey::Chat(choice_idx, "function_call"),
                frame_idx,
                format!("{delta_ptr}/function_call/arguments"),
                args,
            );
        }
    }
    Ok(())
}

fn anthropic_extract_response_json(
    value: &Value,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
    use self::{collect_all_strings, push_leaf};
    use crate::guardrails::text::Unreadable;

    let Some(content) = value.get("content").filter(|v| !v.is_null()) else {
        return Ok(());
    };
    for (index, item) in content.as_array().ok_or(Unreadable)?.iter().enumerate() {
        let map = item.as_object().ok_or(Unreadable)?;
        let item_ptr = format!("/content/{index}");
        let is_signed = map
            .get("signature")
            .and_then(Value::as_str)
            .is_some_and(|sig| !sig.is_empty());
        if let Some(thinking) = map.get("thinking").and_then(Value::as_str) {
            // Rewriting signed thinking invalidates the provider signature on later turns.
            push_leaf(blocks, thinking, format!("{item_ptr}/thinking"), !is_signed);
        }
        if let Some(text) = map.get("text").and_then(Value::as_str) {
            push_leaf(blocks, text, format!("{item_ptr}/text"), true);
        }
        if let Some(input) = map.get("input").filter(|v| !v.is_null()) {
            collect_all_strings(input, &format!("{item_ptr}/input"), 0, blocks)?;
        }
    }
    Ok(())
}

fn anthropic_extract_response_sse(
    frame_idx: usize,
    value: &Value,
    collector: &mut StreamCollector,
) -> Result<(), Unreadable> {
    use self::{StreamKey, visit_all_strings};

    let index = value.get("index").and_then(Value::as_u64).unwrap_or(0);
    match value.get("type").and_then(Value::as_str) {
        Some("content_block_start") => {
            let Some(block) = value.get("content_block").and_then(Value::as_object) else {
                return Ok(());
            };
            if block
                .get("signature")
                .and_then(Value::as_str)
                .is_some_and(|sig| !sig.is_empty())
            {
                collector.mark_signed_thinking(index);
            }
            for key in ["text", "thinking"] {
                if let Some(text) = block.get(key).and_then(Value::as_str) {
                    collector.push_delta(
                        StreamKey::Anthropic(index, key),
                        frame_idx,
                        format!("/content_block/{key}"),
                        text,
                    );
                }
            }
            if let Some(input) = block.get("input").filter(|v| !v.is_null()) {
                visit_all_strings(input, "/content_block/input", 0, &mut |leaf_ptr, text| {
                    collector.push_leaf(frame_idx, text, leaf_ptr);
                })?;
            }
        }
        Some("content_block_delta") => {
            if let Some(delta) = value.get("delta").and_then(Value::as_object) {
                anthropic_extract_response_sse_delta(frame_idx, index, delta, collector);
            }
        }
        _ => {}
    }
    Ok(())
}

fn anthropic_extract_response_sse_delta(
    frame_idx: usize,
    index: u64,
    delta: &JsonMap<String, Value>,
    collector: &mut StreamCollector,
) {
    use self::StreamKey;

    match delta.get("type").and_then(Value::as_str) {
        Some("signature_delta") => {
            if delta
                .get("signature")
                .and_then(Value::as_str)
                .is_some_and(|sig| !sig.is_empty())
            {
                collector.mark_signed_thinking(index);
            }
        }
        Some("text_delta") => {
            if let Some(text) = delta.get("text").and_then(Value::as_str) {
                collector.push_delta(
                    StreamKey::Anthropic(index, "text"),
                    frame_idx,
                    "/delta/text".into(),
                    text,
                );
            }
        }
        Some("thinking_delta") => {
            if let Some(text) = delta.get("thinking").and_then(Value::as_str) {
                collector.push_delta(
                    StreamKey::Anthropic(index, "thinking"),
                    frame_idx,
                    "/delta/thinking".into(),
                    text,
                );
            }
        }
        Some("input_json_delta") => {
            if let Some(text) = delta.get("partial_json").and_then(Value::as_str) {
                collector.push_delta(
                    StreamKey::Anthropic(index, "partial_json"),
                    frame_idx,
                    "/delta/partial_json".into(),
                    text,
                );
            }
        }
        _ => {}
    }
}

fn responses_extract_response_json(
    value: &Value,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
    use self::{
        attach_matching_or_push_leaf, collect_text_or_parts, ptr_index, ptr_push, push_json_leaf,
    };
    use crate::guardrails::text::Unreadable;

    if let Some(output) = value.get("output").filter(|v| !v.is_null()) {
        let output_ptr = ptr_push("", "output");
        for (index, item) in output.as_array().ok_or(Unreadable)?.iter().enumerate() {
            let map = item.as_object().ok_or(Unreadable)?;
            let item_ptr = ptr_index(&output_ptr, index);
            for key in ["content", "summary", "text", "refusal", "input"] {
                if let Some(field) = map.get(key) {
                    collect_text_or_parts(field, &ptr_push(&item_ptr, key), 0, blocks)?;
                }
            }
            if let Some(args) = map.get("arguments").and_then(Value::as_str) {
                push_json_leaf(blocks, args, ptr_push(&item_ptr, "arguments"));
            }
        }
    }
    if let Some(output_text) = value.get("output_text").and_then(Value::as_str) {
        attach_matching_or_push_leaf(blocks, output_text, ptr_push("", "output_text"));
    }
    Ok(())
}

fn responses_responses_delta_spec(kind: &str) -> Option<(&'static str, &'static str)> {
    match kind {
        "response.output_text.delta" => Some(("content_index", "output_text")),
        "response.refusal.delta" => Some(("content_index", "refusal")),
        "response.function_call_arguments.delta" => Some(("", "function_call_args")),
        "response.custom_tool_call_input.delta" => Some(("", "custom_tool_call_input")),
        "response.mcp_call_arguments.delta" => Some(("", "mcp_call_args")),
        "response.reasoning_text.delta" => Some(("content_index", "reasoning_text")),
        "response.reasoning_summary_text.delta" => Some(("summary_index", "reasoning_summary")),
        _ => None,
    }
}

fn responses_responses_done_spec(kind: &str) -> Option<(&'static str, &'static str, &'static str)> {
    match kind {
        "response.output_text.done" => Some(("text", "content_index", "output_text")),
        "response.refusal.done" => Some(("refusal", "content_index", "refusal")),
        "response.function_call_arguments.done" => Some(("arguments", "", "function_call_args")),
        "response.custom_tool_call_input.done" => Some(("input", "", "custom_tool_call_input")),
        "response.mcp_call_arguments.done" => Some(("arguments", "", "mcp_call_args")),
        "response.reasoning_text.done" => Some(("text", "content_index", "reasoning_text")),
        "response.reasoning_summary_text.done" => {
            Some(("text", "summary_index", "reasoning_summary"))
        }
        _ => None,
    }
}

fn responses_extract_response_sse(
    frame_idx: usize,
    value: &Value,
    collector: &mut StreamCollector,
) -> Result<(), Unreadable> {
    use self::{StreamKey, ptr_push};
    use crate::guardrails::text::Unreadable;

    let Some(kind) = value.get("type").and_then(Value::as_str) else {
        return Ok(());
    };
    let output_idx = value
        .get("output_index")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if let Some((index_field, slot)) = responses_responses_delta_spec(kind) {
        let part_idx = value.get(index_field).and_then(Value::as_u64).unwrap_or(0);
        if let Some(text) = value.get("delta").and_then(Value::as_str) {
            collector.push_delta(
                StreamKey::Responses(output_idx, part_idx, slot),
                frame_idx,
                "/delta".into(),
                text,
            );
        }
        return Ok(());
    }
    if let Some((field, index_field, slot)) = responses_responses_done_spec(kind) {
        let part_idx = value.get(index_field).and_then(Value::as_u64).unwrap_or(0);
        if let Some(text) = value.get(field).and_then(Value::as_str) {
            collector.push_summary(
                Some(StreamKey::Responses(output_idx, part_idx, slot)),
                frame_idx,
                ptr_push("", field),
                text,
            );
        }
        return Ok(());
    }
    match kind {
        "response.content_part.done" | "response.reasoning_summary_part.done" => {
            let (index_key, text_slot) = if kind == "response.reasoning_summary_part.done" {
                ("summary_index", "reasoning_summary")
            } else {
                ("content_index", "output_text")
            };
            let part_idx = value.get(index_key).and_then(Value::as_u64).unwrap_or(0);
            if let Some(part) = value.get("part") {
                responses_collect_responses_part_sse(
                    frame_idx, part, "/part", output_idx, part_idx, text_slot, collector,
                );
            }
        }
        "response.output_item.done" => {
            if let Some(item) = value.get("item") {
                responses_collect_responses_item_sse(
                    frame_idx, item, "/item", output_idx, collector,
                );
            }
        }
        "response.completed" | "response.incomplete" => {
            let Some(resp) = value.get("response") else {
                return Ok(());
            };
            if let Some(output) = resp.get("output").filter(|v| !v.is_null()) {
                for (index, item) in output.as_array().ok_or(Unreadable)?.iter().enumerate() {
                    responses_collect_responses_item_sse(
                        frame_idx,
                        item,
                        &format!("/response/output/{index}"),
                        index as u64,
                        collector,
                    );
                }
            }
            if let Some(output_text) = resp.get("output_text").and_then(Value::as_str) {
                collector.attach_or_push_leaf(
                    frame_idx,
                    output_text,
                    "/response/output_text".into(),
                );
            }
        }
        _ => {}
    }
    Ok(())
}

fn responses_collect_responses_part_sse(
    frame_idx: usize,
    part: &Value,
    ptr: &str,
    output_idx: u64,
    part_idx: u64,
    text_slot: &'static str,
    collector: &mut StreamCollector,
) {
    use self::{StreamKey, ptr_push};

    for (field, slot) in [("text", text_slot), ("refusal", "refusal")] {
        if let Some(text) = part.get(field).and_then(Value::as_str) {
            collector.push_summary(
                Some(StreamKey::Responses(output_idx, part_idx, slot)),
                frame_idx,
                ptr_push(ptr, field),
                text,
            );
        }
    }
}

fn responses_collect_responses_item_sse(
    frame_idx: usize,
    item: &Value,
    ptr: &str,
    output_idx: u64,
    collector: &mut StreamCollector,
) {
    use self::{StreamKey, ptr_push};

    let item_type = item.get("type").and_then(Value::as_str);
    if let Some(content) = item.get("content").and_then(Value::as_array) {
        let text_slot = if item_type == Some("reasoning") {
            "reasoning_text"
        } else {
            "output_text"
        };
        for (idx, part) in content.iter().enumerate() {
            responses_collect_responses_part_sse(
                frame_idx,
                part,
                &format!("{ptr}/content/{idx}"),
                output_idx,
                idx as u64,
                text_slot,
                collector,
            );
        }
    }
    if let Some(summary) = item.get("summary").and_then(Value::as_array) {
        for (idx, part) in summary.iter().enumerate() {
            responses_collect_responses_part_sse(
                frame_idx,
                part,
                &format!("{ptr}/summary/{idx}"),
                output_idx,
                idx as u64,
                "reasoning_summary",
                collector,
            );
        }
    }
    let arg_slot = if item_type == Some("mcp_call") {
        "mcp_call_args"
    } else {
        "function_call_args"
    };
    for (field, slot) in [("arguments", arg_slot), ("input", "custom_tool_call_input")] {
        if let Some(text) = item.get(field).and_then(Value::as_str) {
            collector.push_summary(
                Some(StreamKey::Responses(output_idx, 0, slot)),
                frame_idx,
                ptr_push(ptr, field),
                text,
            );
        }
    }
    for field in ["text", "refusal"] {
        if let Some(text) = item.get(field).and_then(Value::as_str) {
            collector.push_summary(None, frame_idx, ptr_push(ptr, field), text);
        }
    }
}

mod tests;
