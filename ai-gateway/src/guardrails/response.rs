//! Format-agnostic response guardrail parsing, memory budgeting, and in-place
//! redaction for non-streaming JSON and streaming SSE provider outputs.
//!
//! Each API format declares where its responses carry text as a [`spec`] tree in
//! its [`crate::capture`] module. Each logical model output (a JSON leaf, or an
//! SSE delta stream plus any matching summary fields) is collected once as a
//! [`ResponseBlock`] with the byte span of each string it came from. When no
//! guardrail redacts the response, the caller relays the original raw bytes
//! untouched; when redaction fires, the modified strings' spans are replaced.

pub(crate) mod spec;

use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
    ops::Range,
    sync::Arc,
};

use axum::body::Bytes;
use axum::http::{HeaderMap, header};
use tokio::sync::Semaphore;

use crate::{
    capture,
    guardrails::text::Unreadable,
    inference::MemoryReservation,
    resolution::{ApiFormat, ResolutionError},
    transport::identity_encoding,
};

/// Batch size for charging dynamic parse memory to `memory_budget`.
const PARSE_RESERVATION_BATCH_BYTES: usize = 16 * 1024;
/// A replacement for the later deltas of a redacted stream.
const EMPTY_JSON_STRING: &str = "\"\"";

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

/// Tracks dynamic memory reservations while reading a response.
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

    /// The error for a read that stopped: `Busy` when it ran out of budget.
    fn failure(&self) -> ResponseParseError {
        if self.exhausted {
            ResponseParseError::Busy
        } else {
            ResponseParseError::Unreadable
        }
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
    /// True when the string holds JSON-encoded tool arguments that must remain
    /// valid JSON after redaction.
    json_encoded: bool,
    /// Body spans of the JSON strings of a streamed delta sequence.
    deltas: Vec<Range<usize>>,
    /// Body spans of JSON strings that each hold the complete text.
    leaves: Vec<Range<usize>>,
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
    body: Body,
    blocks: Vec<ResponseBlock>,
    /// Memory budget held for the retained blocks across external guardrail
    /// I/O until `finalize_response` consumes `self`.
    _reservation: Option<MemoryReservation>,
}

impl ParsedResponse {
    /// Parses the buffered `chunks` of a response according to `api_format` and
    /// `format`, charging parse and retained memory against `budget`, and keeps
    /// only the raw bytes plus the spans of the text found.
    pub(crate) fn parse(
        api_format: ApiFormat,
        format: ResponseFormat,
        chunks: Vec<Bytes>,
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<Self, ResponseParseError> {
        let spec = capture::response_spec(api_format).ok_or(ResponseParseError::Unreadable)?;
        match format {
            ResponseFormat::Json => parse_json(&spec.json, Body::new(chunks), budget),
            ResponseFormat::Sse => parse_sse(&spec.sse, Body::new(chunks), budget),
        }
    }

    pub(crate) fn blocks(&self) -> &[ResponseBlock] {
        &self.blocks
    }

    pub(crate) fn text_bytes(&self) -> usize {
        self.blocks.iter().map(|block| block.text.len()).sum()
    }

    /// Replaces the strings of every modified `(block_index, redacted_text)`:
    /// a stream's first delta takes the text and its later deltas become empty.
    pub(crate) fn apply_redactions(
        self,
        edits: &[(usize, String)],
        budget: Option<&Arc<Semaphore>>,
    ) -> Result<RedactionApply, ResolutionError> {
        if edits.is_empty() {
            return Ok(RedactionApply::Unchanged);
        }
        let mut splices: Vec<(Range<usize>, Cow<'_, str>)> = Vec::new();
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
            let Ok(encoded) = serde_json::to_string(replacement) else {
                return Ok(RedactionApply::Failed);
            };
            for (position, span) in block.deltas.iter().enumerate() {
                let text = if position == 0 {
                    Cow::Owned(encoded.clone())
                } else {
                    Cow::Borrowed(EMPTY_JSON_STRING)
                };
                splices.push((span.clone(), text));
            }
            for span in &block.leaves {
                splices.push((span.clone(), Cow::Owned(encoded.clone())));
            }
        }
        splices.sort_unstable_by_key(|(span, _)| span.start);
        let mut len = self.body.len;
        for pair in splices.windows(2) {
            if let [(earlier, _), (later, _)] = pair
                && earlier.end > later.start
            {
                return Ok(RedactionApply::Failed);
            }
        }
        for (span, text) in &splices {
            len = (len - span.len()).saturating_add(text.len());
        }
        let _out_reservation = budget
            .filter(|_| len > 0)
            .map(|budget| MemoryReservation::from_budget(budget, len, "guardrails"))
            .transpose()?;
        let mut out = Vec::with_capacity(len);
        let mut copied = 0;
        for (span, text) in splices {
            let Some(unchanged) = self.body.slice(copied..span.start) else {
                return Ok(RedactionApply::Failed);
            };
            out.extend_from_slice(&unchanged);
            out.extend_from_slice(text.as_bytes());
            copied = span.end;
        }
        let Some(rest) = self.body.slice(copied..self.body.len) else {
            return Ok(RedactionApply::Failed);
        };
        out.extend_from_slice(&rest);
        Ok(RedactionApply::Rewritten(Bytes::from(out)))
    }
}

/// A buffered body as the chunks it arrived in, so buffering never copies or
/// over-allocates it.
struct Body {
    chunks: Vec<Bytes>,
    /// Offset of each chunk in the whole body.
    starts: Vec<usize>,
    len: usize,
}

impl Body {
    fn new(chunks: Vec<Bytes>) -> Self {
        let mut starts = Vec::with_capacity(chunks.len());
        let mut len = 0usize;
        for chunk in &chunks {
            starts.push(len);
            len = len.saturating_add(chunk.len());
        }
        Self {
            chunks,
            starts,
            len,
        }
    }

    /// Bytes of `range`, borrowed unless they span chunks.
    fn slice(&self, range: Range<usize>) -> Option<Cow<'_, [u8]>> {
        if range.is_empty() {
            return (range.start <= self.len).then_some(Cow::Borrowed(&[]));
        }
        let first = self
            .starts
            .partition_point(|&start| start <= range.start)
            .checked_sub(1)?;
        let start = *self.starts.get(first)?;
        if let Some(bytes) = self
            .chunks
            .get(first)?
            .get(range.start - start..range.end - start)
        {
            return Some(Cow::Borrowed(bytes));
        }
        let mut out = Vec::with_capacity(range.len());
        for (chunk, &start) in self.chunks.iter().zip(&self.starts).skip(first) {
            if start >= range.end {
                break;
            }
            let end = (range.end - start).min(chunk.len());
            out.extend_from_slice(chunk.get(range.start.saturating_sub(start)..end)?);
        }
        (out.len() == range.len()).then_some(Cow::Owned(out))
    }

    /// Calls `on_frame` with the span of each SSE event, ending after the blank
    /// line that ends it, and the spans of its `data` values; a trailing event
    /// without a blank line is passed as incomplete. A last line without a line
    /// ending is unreadable, as is a trailing event with data, since the stream
    /// was cut off.
    fn split_frames(
        &self,
        mut on_frame: impl FnMut(Range<usize>, &[Range<usize>], bool) -> Result<(), ResponseParseError>,
    ) -> Result<(), ResponseParseError> {
        let mut lines = LineState::default();
        for (chunk, &start) in self.chunks.iter().zip(&self.starts) {
            let mut offset = 0;
            while let Some(&byte) = chunk.get(offset) {
                let pos = start + offset;
                if let Some(end) = lines.cr_end.take() {
                    if byte == b'\n' {
                        lines.end_line(end, pos + 1, &mut on_frame)?;
                        offset += 1;
                        continue;
                    }
                    lines.end_line(end, pos, &mut on_frame)?;
                }
                let rest = chunk.get(offset..).unwrap_or_default();
                let Some(eol) = rest.iter().position(|&b| b == b'\n' || b == b'\r') else {
                    lines.push_head(pos, rest);
                    break;
                };
                lines.push_head(pos, rest.get(..eol).unwrap_or_default());
                let end = pos + eol;
                if rest.get(eol) == Some(&b'\r') {
                    lines.cr_end = Some(end);
                } else {
                    lines.end_line(end, end + 1, &mut on_frame)?;
                }
                offset += eol + 1;
            }
        }
        if let Some(end) = lines.cr_end.take() {
            lines.end_line(end, self.len, &mut on_frame)?;
        } else if lines.line_start < self.len {
            return Err(ResponseParseError::Unreadable);
        }
        if !lines.data.is_empty() {
            return Err(ResponseParseError::Unreadable);
        }
        if lines.event_start < self.len {
            on_frame(lines.event_start..self.len, &[], false)?;
        }
        Ok(())
    }
}

#[derive(Default)]
struct LineState {
    event_start: usize,
    line_start: usize,
    /// The first bytes of the current line, enough to recognize `data: `.
    head: [u8; 6],
    /// Where a line ended at `\r`, until the next byte shows whether `\n` follows.
    cr_end: Option<usize>,
    /// Spans of the current event's `data` values.
    data: Vec<Range<usize>>,
}

impl LineState {
    fn push_head(&mut self, pos: usize, bytes: &[u8]) {
        let seen = pos - self.line_start;
        for (slot, &byte) in self.head.iter_mut().skip(seen).zip(bytes) {
            *slot = byte;
        }
    }

    fn end_line(
        &mut self,
        end: usize,
        next: usize,
        on_frame: &mut impl FnMut(Range<usize>, &[Range<usize>], bool) -> Result<(), ResponseParseError>,
    ) -> Result<(), ResponseParseError> {
        let len = end - self.line_start;
        if len == 0 {
            on_frame(self.event_start..next, &self.data, true)?;
            self.event_start = next;
            self.data.clear();
        } else if len == 4 && self.head.starts_with(b"data") {
            self.data.push(end..end);
        } else if self.head.starts_with(b"data:") {
            let space = usize::from(len > 5 && self.head.get(5) == Some(&b' '));
            self.data.push(self.line_start + 5 + space..end);
        }
        self.line_start = next;
        self.head = [0; 6];
        Ok(())
    }
}

/// The joined `data` values of the SSE event `frame` that starts at `offset`,
/// borrowed when it has one.
fn frame_payload<'f>(frame: &'f str, offset: usize, data: &[Range<usize>]) -> Option<Cow<'f, str>> {
    let value = |range: &Range<usize>| frame.get(range.start - offset..range.end - offset);
    if let [single] = data {
        return value(single).map(Cow::Borrowed);
    }
    let mut joined = String::new();
    for (i, range) in data.iter().enumerate() {
        if i > 0 {
            joined.push('\n');
        }
        joined.push_str(value(range)?);
    }
    Some(Cow::Owned(joined))
}

/// Validates `payload` and reads its text along `node` into `collector`,
/// charging the read's temporary memory against `budget` until it returns.
/// `data` are the body spans that make up `payload`.
fn read_value(
    node: &spec::Node,
    payload: &str,
    data: &[Range<usize>],
    collector: &mut StreamCollector,
    budget: Option<&Arc<Semaphore>>,
) -> Result<(), ResponseParseError> {
    let mut read_budget = ParseBudget::new(budget)?;
    spec::validate(payload.as_bytes(), &mut read_budget)?;
    spec::read(node, payload, data, collector, &mut read_budget)
        .map_err(|Unreadable| read_budget.failure())?;
    if read_budget.flush() {
        Ok(())
    } else {
        Err(ResponseParseError::Busy)
    }
}

fn parse_json(
    node: &spec::Node,
    body: Body,
    budget: Option<&Arc<Semaphore>>,
) -> Result<ParsedResponse, ResponseParseError> {
    let retained = ParseBudget::new(budget)?;
    let mut collector = StreamCollector::default();
    {
        let raw = body.slice(0..body.len).ok_or(Unreadable)?;
        let _copy = budget
            .filter(|_| matches!(raw, Cow::Owned(_)))
            .map(|budget| MemoryReservation::from_budget(budget, raw.len(), "guardrails"))
            .transpose()
            .map_err(|_| ResponseParseError::Busy)?;
        let text = std::str::from_utf8(&raw).map_err(|_| Unreadable)?;
        if !text.trim_ascii().starts_with('{') {
            return Err(ResponseParseError::Unreadable);
        }
        read_value(
            node,
            text,
            std::slice::from_ref(&(0..body.len)),
            &mut collector,
            budget,
        )?;
    }
    finish(body, collector, retained)
}

fn parse_sse(
    node: &spec::Node,
    body: Body,
    budget: Option<&Arc<Semaphore>>,
) -> Result<ParsedResponse, ResponseParseError> {
    let mut retained = ParseBudget::new(budget)?;
    if !retained.charge(body.starts.capacity() * size_of::<usize>()) {
        return Err(ResponseParseError::Busy);
    }
    let mut collector = StreamCollector::default();
    body.split_frames(|range, data, complete| {
        let raw = body.slice(range.clone()).ok_or(Unreadable)?;
        let frame = std::str::from_utf8(&raw).map_err(|_| Unreadable)?;
        if complete
            && !data.is_empty()
            && let Some(payload) = frame_payload(frame, range.start, data)
            && payload != "[DONE]"
        {
            // Owned only when the frame spans chunks or has several data lines.
            let copied = size_of_val(data)
                + usize::from(matches!(raw, Cow::Owned(_))) * raw.len()
                + usize::from(matches!(payload, Cow::Owned(_))) * payload.len();
            let _copies = budget
                .filter(|_| copied > 0)
                .map(|budget| MemoryReservation::from_budget(budget, copied, "guardrails"))
                .transpose()
                .map_err(|_| ResponseParseError::Busy)?;
            read_value(node, &payload, data, &mut collector, budget)?;
        }
        if retained.charge(collector.take_growth_bytes()) {
            Ok(())
        } else {
            Err(ResponseParseError::Busy)
        }
    })?;
    finish(body, collector, retained)
}

fn finish(
    body: Body,
    mut collector: StreamCollector,
    mut retained: ParseBudget,
) -> Result<ParsedResponse, ResponseParseError> {
    if !retained.charge(collector.take_growth_bytes()) || !retained.flush() {
        return Err(ResponseParseError::Busy);
    }
    Ok(ParsedResponse {
        body,
        blocks: collector.finish(),
        _reservation: retained.reservation,
    })
}

/// A streamed text: its `slot` name and the stream indices above it, such as a
/// choice and a tool call.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) struct StreamKey {
    slot: &'static str,
    index: [u64; 2],
}

/// Collects the [`ResponseBlock`]s of one response as [`spec::read`] finds text.
#[derive(Default)]
pub(crate) struct StreamCollector {
    blocks: Vec<ResponseBlock>,
    by_key: HashMap<StreamKey, usize>,
    signed_thinking: HashSet<u64>,
    /// The last delta's stream and block, which most deltas repeat.
    last_delta: Option<(StreamKey, usize)>,
    /// Retained bytes allocated by `StreamCollector` since the last `take_growth_bytes`.
    growth_bytes: usize,
}

impl StreamCollector {
    fn push_delta(&mut self, key: StreamKey, json: bool, span: Range<usize>, text: &str) {
        if text.is_empty() {
            return;
        }
        let slot = match self.last_delta {
            Some((last, slot)) if last == key => Some(slot),
            _ => self.by_key.get(&key).copied(),
        };
        if let Some(slot) = slot
            && let Some(block) = self.blocks.get_mut(slot)
        {
            self.last_delta = Some((key, slot));
            let (text_capacity, deltas_capacity) = (block.text.capacity(), block.deltas.capacity());
            block.text.push_str(text);
            block.deltas.push(span);
            self.growth_bytes = self
                .growth_bytes
                .saturating_add(block.text.capacity() - text_capacity)
                .saturating_add(
                    (block.deltas.capacity() - deltas_capacity) * size_of::<Range<usize>>(),
                );
            return;
        }
        self.by_key.insert(key, self.blocks.len());
        self.growth_bytes = self
            .growth_bytes
            .saturating_add(size_of::<(StreamKey, usize)>());
        self.push_block(ResponseBlock {
            text: text.to_owned(),
            editable: true,
            json_encoded: json,
            deltas: vec![span],
            leaves: Vec::new(),
        });
    }

    fn push_summary(&mut self, key: StreamKey, json: bool, span: Range<usize>, text: &str) {
        if let Some(&slot) = self.by_key.get(&key)
            && let Some(block) = self.blocks.get_mut(slot)
            && block.text == text
        {
            self.growth_bytes = self.growth_bytes.saturating_add(size_of::<Range<usize>>());
            block.leaves.push(span);
            return;
        }
        self.push_leaf(span, text, json, true);
    }

    fn push_leaf(&mut self, span: Range<usize>, text: &str, json_encoded: bool, editable: bool) {
        if text.is_empty() {
            return;
        }
        self.push_block(ResponseBlock {
            text: text.to_owned(),
            editable,
            json_encoded,
            deltas: Vec::new(),
            leaves: vec![span],
        });
    }

    /// Attaches a duplicate summary field (e.g. `output_text`) to an already
    /// collected block with identical text so Bedrock sees one block and every
    /// copy is rewritten together.
    fn attach_or_push_leaf(&mut self, span: Range<usize>, text: &str) {
        if text.is_empty() {
            return;
        }
        if let Some(block) = self.blocks.iter_mut().find(|block| block.text == text) {
            self.growth_bytes = self.growth_bytes.saturating_add(size_of::<Range<usize>>());
            block.leaves.push(span);
            return;
        }
        self.push_leaf(span, text, false, true);
    }

    fn push_block(&mut self, block: ResponseBlock) {
        self.growth_bytes = self
            .growth_bytes
            .saturating_add(size_of::<ResponseBlock>())
            .saturating_add(block.text.capacity())
            .saturating_add(
                (block.deltas.capacity() + block.leaves.capacity()) * size_of::<Range<usize>>(),
            );
        self.blocks.push(block);
    }

    fn take_growth_bytes(&mut self) -> usize {
        std::mem::take(&mut self.growth_bytes)
    }

    fn mark_signed_thinking(&mut self, index: u64) {
        self.signed_thinking.insert(index);
    }

    fn finish(mut self) -> Vec<ResponseBlock> {
        for index in self.signed_thinking {
            let key = StreamKey {
                slot: "thinking",
                index: [index, 0],
            };
            if let Some(&slot) = self.by_key.get(&key)
                && let Some(block) = self.blocks.get_mut(slot)
            {
                block.editable = false;
            }
        }
        self.blocks
    }
}
