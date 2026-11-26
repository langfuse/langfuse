//! Response text extraction and in-place redaction for non-streaming JSON and
//! streaming SSE provider outputs.
//!
//! Each logical model output (a JSON leaf, or an SSE delta stream plus any
//! matching `OpenAI` Responses summary fields) is collected once as a
//! [`ResponseBlock`]. When no guardrail redacts the response, the caller relays
//! the original raw bytes untouched; when redaction fires, modified strings and
//! `logprobs` token copies are rewritten in place via JSON pointers.
use std::{
    collections::{HashMap, HashSet},
    fmt,
};

use axum::body::Bytes;
use axum::http::{HeaderMap, header};
use serde::de::{DeserializeSeed, Error as _, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};

use crate::{guardrails::text::Unreadable, resolution::ApiFormat, transport::identity_encoding};

const MAX_JSON_DEPTH: usize = 32;

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
}

enum ParsedBody {
    Json(Value),
    Sse(Vec<SseFrame>),
}

struct SseFrame {
    /// Non-data lines (`event:`, `id:`, etc.) preserved before `data:` on rewrite.
    prefix: String,
    json: Option<Value>,
    modified: bool,
    raw: String,
}

impl ParsedResponse {
    /// Parses `body` according to `api_format` and `format` and extracts all
    /// logical model output text blocks.
    pub(crate) fn parse(
        api_format: ApiFormat,
        format: ResponseFormat,
        body: &[u8],
    ) -> Result<Self, Unreadable> {
        match format {
            ResponseFormat::Json => parse_json(api_format, body),
            ResponseFormat::Sse => parse_sse(api_format, body),
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
    pub(crate) fn apply_redactions(mut self, edits: &[(usize, String)]) -> Option<Bytes> {
        if edits.is_empty() {
            return None;
        }
        for (index, replacement) in edits {
            let block = self.blocks.get(*index)?;
            if !block.editable {
                return None;
            }
            for (pos, (frame_idx, ptr)) in block.deltas.iter().enumerate() {
                let text = if pos == 0 { replacement.as_str() } else { "" };
                set_string(&mut self.body, Some(*frame_idx), ptr, text)?;
            }
            for (frame_idx, ptr) in &block.leaves {
                set_string(&mut self.body, *frame_idx, ptr, replacement)?;
            }
        }
        scrub_logprobs(self.api_format, &mut self.body);
        serialize_body(self.body)
    }
}

fn set_string(
    body: &mut ParsedBody,
    frame_idx: Option<usize>,
    ptr: &str,
    text: &str,
) -> Option<()> {
    let target = match (body, frame_idx) {
        (ParsedBody::Json(root), None) => root.pointer_mut(ptr)?,
        (ParsedBody::Sse(frames), Some(index)) => {
            let frame = frames.get_mut(index)?;
            frame.modified = true;
            frame.json.as_mut()?.pointer_mut(ptr)?
        }
        _ => return None,
    };
    *target = Value::String(text.to_owned());
    Some(())
}

fn serialize_body(body: ParsedBody) -> Option<Bytes> {
    match body {
        ParsedBody::Json(value) => serde_json::to_vec(&value).ok().map(Bytes::from),
        ParsedBody::Sse(frames) => {
            let mut out = String::new();
            for frame in frames {
                if !frame.modified {
                    out.push_str(&frame.raw);
                    continue;
                }
                let encoded = serde_json::to_string(frame.json.as_ref()?).ok()?;
                out.push_str(&frame.prefix);
                out.push_str("data: ");
                out.push_str(&encoded);
                out.push_str("\n\n");
            }
            Some(Bytes::from(out))
        }
    }
}

fn scrub_logprobs(api_format: ApiFormat, body: &mut ParsedBody) {
    match body {
        ParsedBody::Json(value) => {
            scrub_logprobs_value(api_format, value);
        }
        ParsedBody::Sse(frames) => {
            for frame in frames {
                if let Some(value) = frame.json.as_mut()
                    && scrub_logprobs_value(api_format, value)
                {
                    frame.modified = true;
                }
            }
        }
    }
}

/// Scrubs non-null `logprobs` fields (`null` for Chat Completions objects, `[]`
/// for Responses arrays) so token-level copies cannot leak redacted text.
fn scrub_logprobs_value(api_format: ApiFormat, value: &mut Value) -> bool {
    let mut changed = false;
    match api_format {
        ApiFormat::OpenAiChatCompletions => {
            if let Some(choices) = value.get_mut("choices").and_then(Value::as_array_mut) {
                for choice in choices {
                    if let Some(lp) = choice.get_mut("logprobs")
                        && !lp.is_null()
                    {
                        *lp = Value::Null;
                        changed = true;
                    }
                }
            }
        }
        ApiFormat::OpenAiResponses => {
            changed |= clear_logprobs_array(value.get_mut("logprobs"));
            if let Some(part) = value.get_mut("part") {
                changed |= clear_logprobs_array(part.get_mut("logprobs"));
            }
            if let Some(item) = value.get_mut("item") {
                changed |= scrub_responses_item_logprobs(item);
            }
            if let Some(resp) = value.get_mut("response") {
                changed |= scrub_responses_output_logprobs(resp);
            }
            changed |= scrub_responses_output_logprobs(value);
        }
        ApiFormat::AnthropicMessages | ApiFormat::OpenAiDecisions | ApiFormat::OpenAiEmbeddings => {
        }
    }
    changed
}

fn scrub_responses_output_logprobs(container: &mut Value) -> bool {
    let mut changed = false;
    if let Some(output) = container.get_mut("output").and_then(Value::as_array_mut) {
        for item in output {
            changed |= scrub_responses_item_logprobs(item);
        }
    }
    changed
}

fn scrub_responses_item_logprobs(item: &mut Value) -> bool {
    let mut changed = false;
    if let Some(content) = item.get_mut("content").and_then(Value::as_array_mut) {
        for part in content {
            changed |= clear_logprobs_array(part.get_mut("logprobs"));
        }
    }
    changed
}

fn clear_logprobs_array(slot: Option<&mut Value>) -> bool {
    if let Some(value) = slot
        && value.is_array()
    {
        *value = Value::Array(Vec::new());
        return true;
    }
    false
}

fn ptr_push(base: &str, key: &str) -> String {
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

fn ptr_index(base: &str, index: usize) -> String {
    format!("{base}/{index}")
}

// ---------------------------------------------------------------------------
// Non-streaming JSON extraction
// ---------------------------------------------------------------------------

/// Parses JSON into [`Value`] while rejecting any object with duplicate keys
/// so hidden earlier keys cannot bypass response guardrails.
fn parse_unique_json(bytes: &[u8]) -> Result<Value, Unreadable> {
    struct UniqueValue;

    impl<'de> DeserializeSeed<'de> for UniqueValue {
        type Value = Value;

        fn deserialize<D: serde::Deserializer<'de>>(
            self,
            deserializer: D,
        ) -> Result<Self::Value, D::Error> {
            deserializer.deserialize_any(self)
        }
    }

    impl<'de> Visitor<'de> for UniqueValue {
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
        fn visit_str<E>(self, v: &str) -> Result<Value, E> {
            Ok(Value::String(v.to_owned()))
        }
        fn visit_string<E>(self, v: String) -> Result<Value, E> {
            Ok(Value::String(v))
        }
        fn visit_unit<E>(self) -> Result<Value, E> {
            Ok(Value::Null)
        }
        fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Value, A::Error> {
            let mut items = Vec::new();
            while let Some(item) = seq.next_element_seed(UniqueValue)? {
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
                let value = map.next_value_seed(UniqueValue)?;
                entries.insert(key, value);
            }
            Ok(Value::Object(entries))
        }
    }

    let mut deserializer = serde_json::Deserializer::from_slice(bytes);
    UniqueValue
        .deserialize(&mut deserializer)
        .and_then(|value| deserializer.end().map(|()| value))
        .map_err(|_| Unreadable)
}

fn parse_json(api_format: ApiFormat, body: &[u8]) -> Result<ParsedResponse, Unreadable> {
    let value = parse_unique_json(body)?;
    if !value.is_object() {
        return Err(Unreadable);
    }
    let mut blocks = Vec::new();
    match api_format {
        ApiFormat::OpenAiChatCompletions => extract_chat_json(&value, &mut blocks)?,
        ApiFormat::AnthropicMessages => extract_anthropic_json(&value, &mut blocks)?,
        ApiFormat::OpenAiResponses => extract_responses_json(&value, "", &mut blocks)?,
        ApiFormat::OpenAiDecisions => {
            if let Some(answers) = value.get("answers").filter(|v| !v.is_null()) {
                collect_all_strings(answers, None, "/answers", &["type", "name"], 0, &mut blocks)?;
            }
        }
        ApiFormat::OpenAiEmbeddings => {}
    }
    Ok(ParsedResponse {
        api_format,
        body: ParsedBody::Json(value),
        blocks,
    })
}

fn push_leaf(
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

fn attach_matching_or_push_leaf(
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

fn visit_text_or_parts(
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

fn collect_text_or_parts(
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

fn collect_all_strings(
    value: &Value,
    frame_idx: Option<usize>,
    ptr: &str,
    skip_keys: &[&str],
    depth: usize,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
    if depth > MAX_JSON_DEPTH {
        return Err(Unreadable);
    }
    match value {
        Value::String(text) => push_leaf(blocks, frame_idx, text, ptr.to_owned(), true),
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                collect_all_strings(
                    item,
                    frame_idx,
                    &ptr_index(ptr, index),
                    skip_keys,
                    depth + 1,
                    blocks,
                )?;
            }
        }
        Value::Object(map) => {
            for (key, field) in map {
                if !skip_keys.contains(&key.as_str()) {
                    collect_all_strings(
                        field,
                        frame_idx,
                        &ptr_push(ptr, key),
                        skip_keys,
                        depth + 1,
                        blocks,
                    )?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn extract_chat_json(value: &Value, blocks: &mut Vec<ResponseBlock>) -> Result<(), Unreadable> {
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
                collect_text_or_parts(field, None, &ptr_push(&msg_ptr, key), 0, blocks)?;
            }
        }
        if let Some(calls) = map.get("tool_calls").filter(|v| !v.is_null()) {
            for (call_idx, call) in calls.as_array().ok_or(Unreadable)?.iter().enumerate() {
                if let Some(args) = call.pointer("/function/arguments").and_then(Value::as_str) {
                    push_leaf(
                        blocks,
                        None,
                        args,
                        format!("{msg_ptr}/tool_calls/{call_idx}/function/arguments"),
                        true,
                    );
                }
            }
        }
        if let Some(args) = message
            .pointer("/function_call/arguments")
            .and_then(Value::as_str)
        {
            push_leaf(
                blocks,
                None,
                args,
                format!("{msg_ptr}/function_call/arguments"),
                true,
            );
        }
        if let Some(transcript) = message.pointer("/audio/transcript").and_then(Value::as_str) {
            push_leaf(
                blocks,
                None,
                transcript,
                format!("{msg_ptr}/audio/transcript"),
                true,
            );
        }
        if let Some(annotations) = map.get("annotations").filter(|v| !v.is_null()) {
            collect_annotations(
                annotations,
                &format!("{msg_ptr}/annotations"),
                &mut |text, ptr| push_leaf(blocks, None, text, ptr, true),
            )?;
        }
    }
    Ok(())
}

fn extract_anthropic_json(
    value: &Value,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
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
            push_leaf(
                blocks,
                None,
                thinking,
                format!("{item_ptr}/thinking"),
                !is_signed,
            );
        }
        for key in ["text", "content"] {
            if let Some(field) = map.get(key) {
                collect_text_or_parts(field, None, &ptr_push(&item_ptr, key), 0, blocks)?;
            }
        }
        if let Some(citations) = map.get("citations").filter(|v| !v.is_null()) {
            for (cit_idx, citation) in citations.as_array().ok_or(Unreadable)?.iter().enumerate() {
                let cit_ptr = format!("{item_ptr}/citations/{cit_idx}");
                collect_citation_fields(citation, &cit_ptr, &mut |text, ptr| {
                    push_leaf(blocks, None, text, ptr, true);
                });
            }
        }
        if let Some(input) = map.get("input").filter(|v| !v.is_null()) {
            collect_all_strings(input, None, &format!("{item_ptr}/input"), &[], 0, blocks)?;
        }
    }
    Ok(())
}

fn collect_citation_fields(
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

fn collect_annotations(
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

fn extract_responses_json(
    value: &Value,
    base_ptr: &str,
    blocks: &mut Vec<ResponseBlock>,
) -> Result<(), Unreadable> {
    if let Some(output) = value.get("output").filter(|v| !v.is_null()) {
        let output_ptr = ptr_push(base_ptr, "output");
        for (index, item) in output.as_array().ok_or(Unreadable)?.iter().enumerate() {
            let map = item.as_object().ok_or(Unreadable)?;
            let item_ptr = ptr_index(&output_ptr, index);
            for key in [
                "content",
                "summary",
                "text",
                "refusal",
                "arguments",
                "input",
                "code",
                "command",
            ] {
                if let Some(field) = map.get(key) {
                    collect_text_or_parts(field, None, &ptr_push(&item_ptr, key), 0, blocks)?;
                }
            }
            if let Some(content) = map.get("content").and_then(Value::as_array) {
                for (part_idx, part) in content.iter().enumerate() {
                    if let Some(annotations) = part.get("annotations").filter(|v| !v.is_null()) {
                        collect_annotations(
                            annotations,
                            &format!("{item_ptr}/content/{part_idx}/annotations"),
                            &mut |text, ptr| push_leaf(blocks, None, text, ptr, true),
                        )?;
                    }
                }
            }
        }
    }
    if let Some(output_text) = value.get("output_text").and_then(Value::as_str) {
        attach_matching_or_push_leaf(blocks, None, output_text, ptr_push(base_ptr, "output_text"));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Streaming SSE extraction
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum StreamKey {
    Chat(u64, &'static str),
    ChatToolArgs(u64, u64),
    Anthropic(u64, &'static str),
    Responses(u64, u64, &'static str),
}

#[derive(Default)]
struct StreamCollector {
    blocks: Vec<ResponseBlock>,
    by_key: HashMap<StreamKey, usize>,
    signed_thinking: HashSet<u64>,
}

impl StreamCollector {
    fn push_delta(&mut self, key: StreamKey, frame_idx: usize, ptr: String, text: &str) {
        if text.is_empty() {
            return;
        }
        if let Some(&slot) = self.by_key.get(&key)
            && let Some(block) = self.blocks.get_mut(slot)
        {
            block.text.push_str(text);
            block.deltas.push((frame_idx, ptr));
            return;
        }
        let slot = self.blocks.len();
        self.blocks.push(ResponseBlock {
            text: text.to_owned(),
            editable: true,
            deltas: vec![(frame_idx, ptr)],
            leaves: Vec::new(),
        });
        self.by_key.insert(key, slot);
    }

    fn push_summary(&mut self, key: Option<StreamKey>, frame_idx: usize, ptr: String, text: &str) {
        if text.is_empty() {
            return;
        }
        if let Some(key) = key
            && let Some(&slot) = self.by_key.get(&key)
            && let Some(block) = self.blocks.get_mut(slot)
            && block.text == text
        {
            block.leaves.push((Some(frame_idx), ptr));
            return;
        }
        self.blocks.push(ResponseBlock {
            text: text.to_owned(),
            editable: true,
            deltas: Vec::new(),
            leaves: vec![(Some(frame_idx), ptr)],
        });
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

fn parse_sse(api_format: ApiFormat, body: &[u8]) -> Result<ParsedResponse, Unreadable> {
    if !matches!(
        api_format,
        ApiFormat::OpenAiChatCompletions
            | ApiFormat::AnthropicMessages
            | ApiFormat::OpenAiResponses
    ) {
        return Err(Unreadable);
    }
    let frames = split_sse_frames(body)?;
    let mut collector = StreamCollector::default();
    for (frame_idx, frame) in frames.iter().enumerate() {
        let Some(value) = frame.json.as_ref() else {
            continue;
        };
        match api_format {
            ApiFormat::OpenAiChatCompletions => {
                extract_chat_sse(frame_idx, value, &mut collector)?;
            }
            ApiFormat::AnthropicMessages => {
                extract_anthropic_sse(frame_idx, value, &mut collector)?;
            }
            ApiFormat::OpenAiResponses => {
                extract_responses_sse(frame_idx, value, &mut collector)?;
            }
            ApiFormat::OpenAiDecisions | ApiFormat::OpenAiEmbeddings => return Err(Unreadable),
        }
    }
    Ok(ParsedResponse {
        api_format,
        body: ParsedBody::Sse(frames),
        blocks: collector.finish(),
    })
}

fn split_sse_frames(body: &[u8]) -> Result<Vec<SseFrame>, Unreadable> {
    let text = std::str::from_utf8(body).map_err(|_| Unreadable)?;
    let bytes = text.as_bytes();
    let mut frames = Vec::new();
    let mut cursor = 0usize;
    let mut event_start = 0usize;
    let mut prefix = String::new();
    let mut data_lines: Vec<&str> = Vec::new();

    while cursor < bytes.len() {
        let line_start = cursor;
        while bytes
            .get(cursor)
            .is_some_and(|&byte| byte != b'\n' && byte != b'\r')
        {
            cursor += 1;
        }
        let line = text.get(line_start..cursor).ok_or(Unreadable)?;
        let eol_start = cursor;
        match bytes.get(cursor) {
            Some(&b'\r') => {
                cursor += 1;
                if bytes.get(cursor) == Some(&b'\n') {
                    cursor += 1;
                }
            }
            Some(&b'\n') => cursor += 1,
            _ if !line.is_empty() => return Err(Unreadable),
            _ => {}
        }
        if line.is_empty() {
            let raw = text.get(event_start..cursor).ok_or(Unreadable)?.to_owned();
            let json = if data_lines.is_empty() {
                None
            } else {
                let payload = data_lines.join("\n");
                if payload == "[DONE]" {
                    None
                } else {
                    Some(parse_unique_json(payload.as_bytes())?)
                }
            };
            frames.push(SseFrame {
                prefix: std::mem::take(&mut prefix),
                json,
                modified: false,
                raw,
            });
            data_lines.clear();
            event_start = cursor;
            continue;
        }
        if let Some(rest) = line.strip_prefix("data:") {
            data_lines.push(rest.strip_prefix(' ').unwrap_or(rest));
        } else if line == "data" {
            data_lines.push("");
        } else {
            prefix.push_str(text.get(line_start..cursor).ok_or(Unreadable)?);
            if cursor == eol_start {
                prefix.push('\n');
            }
        }
    }
    if !data_lines.is_empty() {
        return Err(Unreadable);
    }
    if event_start < bytes.len() {
        frames.push(SseFrame {
            prefix: String::new(),
            json: None,
            modified: false,
            raw: text.get(event_start..).ok_or(Unreadable)?.to_owned(),
        });
    }
    Ok(frames)
}

fn extract_chat_sse(
    frame_idx: usize,
    value: &Value,
    collector: &mut StreamCollector,
) -> Result<(), Unreadable> {
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
        if let Some(transcript) = delta.pointer("/audio/transcript").and_then(Value::as_str) {
            collector.push_delta(
                StreamKey::Chat(choice_idx, "audio"),
                frame_idx,
                format!("{delta_ptr}/audio/transcript"),
                transcript,
            );
        }
        if let Some(annotations) = map.get("annotations").filter(|v| !v.is_null()) {
            collect_annotations(
                annotations,
                &format!("{delta_ptr}/annotations"),
                &mut |text, ptr| {
                    attach_matching_or_push_leaf(&mut collector.blocks, Some(frame_idx), text, ptr);
                },
            )?;
        }
    }
    Ok(())
}

fn extract_anthropic_sse(
    frame_idx: usize,
    value: &Value,
    collector: &mut StreamCollector,
) -> Result<(), Unreadable> {
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
                collector.signed_thinking.insert(index);
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
            if let Some(content) = block.get("content").filter(|v| !v.is_null()) {
                collect_text_or_parts(
                    content,
                    Some(frame_idx),
                    "/content_block/content",
                    0,
                    &mut collector.blocks,
                )?;
            }
            if let Some(citations) = block.get("citations").filter(|v| !v.is_null()) {
                for (cit_idx, citation) in
                    citations.as_array().ok_or(Unreadable)?.iter().enumerate()
                {
                    let cit_ptr = format!("/content_block/citations/{cit_idx}");
                    collect_citation_fields(citation, &cit_ptr, &mut |text, ptr| {
                        collector.push_summary(None, frame_idx, ptr, text);
                    });
                }
            }
            if let Some(input) = block.get("input").filter(|v| !v.is_null()) {
                collect_all_strings(
                    input,
                    Some(frame_idx),
                    "/content_block/input",
                    &[],
                    0,
                    &mut collector.blocks,
                )?;
            }
        }
        Some("content_block_delta") => {
            if let Some(delta) = value.get("delta").and_then(Value::as_object) {
                extract_anthropic_sse_delta(frame_idx, index, delta, collector);
            }
        }
        _ => {}
    }
    Ok(())
}

fn extract_anthropic_sse_delta(
    frame_idx: usize,
    index: u64,
    delta: &Map<String, Value>,
    collector: &mut StreamCollector,
) {
    match delta.get("type").and_then(Value::as_str) {
        Some("signature_delta") => {
            if delta
                .get("signature")
                .and_then(Value::as_str)
                .is_some_and(|sig| !sig.is_empty())
            {
                collector.signed_thinking.insert(index);
            }
        }
        Some("citations_delta") => {
            if let Some(citation) = delta.get("citation") {
                collect_citation_fields(citation, "/delta/citation", &mut |text, ptr| {
                    collector.push_summary(None, frame_idx, ptr, text);
                });
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

fn responses_delta_spec(kind: &str) -> Option<(&'static str, &'static str)> {
    match kind {
        "response.output_text.delta" => Some(("content_index", "output_text")),
        "response.refusal.delta" => Some(("content_index", "refusal")),
        "response.function_call_arguments.delta" => Some(("", "function_call_args")),
        "response.custom_tool_call_input.delta" => Some(("", "custom_tool_call_input")),
        "response.reasoning_text.delta" => Some(("content_index", "reasoning_text")),
        "response.reasoning_summary_text.delta" => Some(("summary_index", "reasoning_summary")),
        "response.mcp_call_arguments.delta" => Some(("", "mcp_call_args")),
        "response.code_interpreter_call_code.delta" => Some(("", "code_interpreter_code")),
        "response.audio.transcript.delta" => Some(("content_index", "audio_transcript")),
        "response.shell_call_command.delta" => Some(("", "shell_call_command")),
        _ => None,
    }
}

fn responses_done_spec(kind: &str) -> Option<(&'static str, &'static str, &'static str)> {
    match kind {
        "response.output_text.done" => Some(("text", "content_index", "output_text")),
        "response.refusal.done" => Some(("refusal", "content_index", "refusal")),
        "response.function_call_arguments.done" => Some(("arguments", "", "function_call_args")),
        "response.custom_tool_call_input.done" => Some(("input", "", "custom_tool_call_input")),
        "response.reasoning_text.done" => Some(("text", "content_index", "reasoning_text")),
        "response.reasoning_summary_text.done" => {
            Some(("text", "summary_index", "reasoning_summary"))
        }
        "response.mcp_call_arguments.done" => Some(("arguments", "", "mcp_call_args")),
        "response.code_interpreter_call_code.done" => Some(("code", "", "code_interpreter_code")),
        "response.audio.transcript.done" => {
            Some(("transcript", "content_index", "audio_transcript"))
        }
        "response.shell_call_command.done" => Some(("command", "", "shell_call_command")),
        _ => None,
    }
}

fn extract_responses_sse(
    frame_idx: usize,
    value: &Value,
    collector: &mut StreamCollector,
) -> Result<(), Unreadable> {
    let Some(kind) = value.get("type").and_then(Value::as_str) else {
        return Ok(());
    };
    let output_idx = value
        .get("output_index")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if let Some((index_field, slot)) = responses_delta_spec(kind) {
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
    if let Some((field, index_field, slot)) = responses_done_spec(kind) {
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
        "response.output_text.annotation.added" => {
            if let Some(annotation) = value.get("annotation") {
                collect_citation_fields(annotation, "/annotation", &mut |text, ptr| {
                    attach_matching_or_push_leaf(&mut collector.blocks, Some(frame_idx), text, ptr);
                });
            }
        }
        "response.content_part.done" | "response.reasoning_summary_part.done" => {
            let (part_idx, text_slot) = if kind == "response.reasoning_summary_part.done" {
                (
                    value
                        .get("summary_index")
                        .and_then(Value::as_u64)
                        .unwrap_or(0),
                    "reasoning_summary",
                )
            } else {
                (
                    value
                        .get("content_index")
                        .and_then(Value::as_u64)
                        .unwrap_or(0),
                    "output_text",
                )
            };
            if let Some(part) = value.get("part") {
                collect_responses_part_sse(
                    frame_idx, part, "/part", output_idx, part_idx, text_slot, collector,
                );
            }
        }
        "response.output_item.done" => {
            if let Some(item) = value.get("item") {
                collect_responses_item_sse(frame_idx, item, "/item", output_idx, collector);
            }
        }
        "response.completed" | "response.incomplete" => {
            let Some(resp) = value.get("response") else {
                return Ok(());
            };
            if let Some(output) = resp.get("output").filter(|v| !v.is_null()) {
                for (index, item) in output.as_array().ok_or(Unreadable)?.iter().enumerate() {
                    collect_responses_item_sse(
                        frame_idx,
                        item,
                        &format!("/response/output/{index}"),
                        index as u64,
                        collector,
                    );
                }
            }
            if let Some(output_text) = resp.get("output_text").and_then(Value::as_str) {
                attach_matching_or_push_leaf(
                    &mut collector.blocks,
                    Some(frame_idx),
                    output_text,
                    "/response/output_text".into(),
                );
            }
        }
        _ => {}
    }
    Ok(())
}

fn collect_responses_part_sse(
    frame_idx: usize,
    part: &Value,
    ptr: &str,
    output_idx: u64,
    part_idx: u64,
    text_slot: &'static str,
    collector: &mut StreamCollector,
) {
    for (field, slot) in [
        ("text", text_slot),
        ("refusal", "refusal"),
        ("transcript", "audio_transcript"),
    ] {
        if let Some(text) = part.get(field).and_then(Value::as_str) {
            collector.push_summary(
                Some(StreamKey::Responses(output_idx, part_idx, slot)),
                frame_idx,
                ptr_push(ptr, field),
                text,
            );
        }
    }
    if let Some(annotations) = part.get("annotations").and_then(Value::as_array) {
        for (idx, annotation) in annotations.iter().enumerate() {
            collect_citation_fields(
                annotation,
                &format!("{ptr}/annotations/{idx}"),
                &mut |text, leaf_ptr| {
                    attach_matching_or_push_leaf(
                        &mut collector.blocks,
                        Some(frame_idx),
                        text,
                        leaf_ptr,
                    );
                },
            );
        }
    }
}

fn collect_responses_item_sse(
    frame_idx: usize,
    item: &Value,
    ptr: &str,
    output_idx: u64,
    collector: &mut StreamCollector,
) {
    let item_type = item.get("type").and_then(Value::as_str);
    if let Some(content) = item.get("content").and_then(Value::as_array) {
        let text_slot = if item_type == Some("reasoning") {
            "reasoning_text"
        } else {
            "output_text"
        };
        for (idx, part) in content.iter().enumerate() {
            collect_responses_part_sse(
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
            collect_responses_part_sse(
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
    for (field, slot) in [
        ("arguments", arg_slot),
        ("input", "custom_tool_call_input"),
        ("code", "code_interpreter_code"),
        ("command", "shell_call_command"),
    ] {
        if let Some(text) = item.get(field).and_then(Value::as_str) {
            collector.push_summary(
                Some(StreamKey::Responses(output_idx, 0, slot)),
                frame_idx,
                ptr_push(ptr, field),
                text,
            );
        } else if field == "command"
            && let Some(cmds) = item.get("command").and_then(Value::as_array)
        {
            for (idx, cmd) in cmds.iter().enumerate() {
                if let Some(text) = cmd.as_str() {
                    collector.push_summary(None, frame_idx, format!("{ptr}/command/{idx}"), text);
                }
            }
        }
    }
    for field in ["text", "refusal"] {
        if let Some(text) = item.get(field).and_then(Value::as_str) {
            collector.push_summary(None, frame_idx, ptr_push(ptr, field), text);
        }
    }
}
