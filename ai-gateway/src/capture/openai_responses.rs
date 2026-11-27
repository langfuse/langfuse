//! `OpenAI` Responses request, JSON response and completed SSE item capture.
use super::{
    InputOmission, MAX_FACT_STRING, MAX_ITEMS, MAX_OUTPUT_CAPTURE_BYTES, RawRequest,
    bounded_string, error_detail, facts::ProviderFacts, response::ResponseBody,
};
use crate::{resolution::IngestionMode, telemetry};
use axum::http::HeaderMap;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub(super) struct OpenAiResponsesCapture {
    pub(super) facts: ProviderFacts,
    mode: IngestionMode,
    pub(super) body: ResponseBody,
    items: BTreeMap<u64, Value>,
    output_bytes: usize,
    terminal: bool,
    expected_items: Option<usize>,
    request_complete: bool,
    response_valid: bool,
    client_metadata: Option<Map<String, Value>>,
}

impl OpenAiResponsesCapture {
    pub(super) fn new(request: Result<RawRequest, InputOmission>, mode: IngestionMode) -> Self {
        let mut capture = Self {
            facts: ProviderFacts::default(),
            mode,
            body: ResponseBody::Unknown,
            items: BTreeMap::new(),
            output_bytes: 0,
            terminal: false,
            expected_items: None,
            request_complete: false,
            response_valid: true,
            client_metadata: None,
        };
        match request {
            Ok(request) => {
                capture.capture_request(request);
                capture.request_complete = true;
            }
            Err(omission) if mode == IngestionMode::Full => {
                capture.facts.input_omission = Some(omission);
            }
            Err(_) => {}
        }
        capture
    }

    pub(super) fn record_response(&mut self, headers: &HeaderMap) {
        self.body = ResponseBody::from_headers(headers);
        if matches!(self.body, ResponseBody::Unavailable) {
            self.response_valid = false;
        }
    }

    pub(super) fn push_bytes(&mut self, bytes: &[u8], parse_limit: usize) -> bool {
        let mut body = std::mem::replace(&mut self.body, ResponseBody::Unavailable);
        let mut completion_started = false;
        if !body.push(bytes, parse_limit, |event| {
            completion_started |= self.handle_event(event);
        }) {
            self.response_valid = false;
        }
        self.body = body;
        completion_started
    }

    pub(super) fn end_body(&mut self) {
        match std::mem::replace(&mut self.body, ResponseBody::Unavailable) {
            ResponseBody::Json(bytes) => match serde_json::from_slice::<Value>(&bytes) {
                Ok(Value::Object(response)) => {
                    self.capture_response_facts(&response);
                    if let Some(output) = response.get("output").and_then(Value::as_array) {
                        for (index, item) in output.iter().enumerate() {
                            self.store_item(index as u64, item.clone());
                        }
                        self.facts.output_complete = self.response_valid;
                    }
                }
                _ => self.response_valid = false,
            },
            ResponseBody::Sse(sse) => {
                self.response_valid &= sse.finish();
                self.facts.output_complete = self.terminal
                    && self.response_valid
                    && (self.mode != IngestionMode::Full
                        || self.expected_items.is_some_and(|count| {
                            count == self.items.len()
                                && self.items.keys().copied().eq(0..count as u64)
                        }));
            }
            _ => {}
        }
        self.facts.capture_complete = self.request_complete && self.facts.output_complete;
    }

    pub(super) fn into_facts(mut self) -> ProviderFacts {
        if matches!(self.body, ResponseBody::Sse(_)) {
            self.end_body();
        }
        if self.mode == IngestionMode::Full {
            self.facts.output = Some(Value::Array(self.items.into_values().collect()));
        }
        self.facts
    }

    /// The coding agent's `client_metadata` object removed from the request, if any.
    pub(super) fn client_metadata(&self) -> Option<&Map<String, Value>> {
        self.client_metadata.as_ref()
    }

    fn capture_request(&mut self, mut request: RawRequest) {
        self.facts.requested_model = request
            .take("model")
            .as_ref()
            .and_then(Value::as_str)
            .and_then(bounded_string);
        // Agent identifiers are recorded as `agent.*` metadata in both ingestion modes.
        self.client_metadata =
            request.take_where("client_metadata", telemetry::agent_client_metadata);
        for key in [
            "temperature",
            "top_p",
            "top_logprobs",
            "max_output_tokens",
            "service_tier",
            "parallel_tool_calls",
            "max_tool_calls",
            "truncation",
            "stream",
            "background",
            "store",
            "prompt_cache_retention",
        ] {
            if let Some(value) = request.take(key).filter(|v| {
                self.mode == IngestionMode::Full
                    || v.is_number()
                    || v.is_boolean()
                    || v.as_str().is_some_and(|s| s.len() <= MAX_FACT_STRING)
            }) {
                self.facts.model_parameters.insert(key.to_owned(), value);
            }
        }
        if self.mode == IngestionMode::Full {
            for key in [
                "reasoning",
                "text",
                "tool_choice",
                "context_management",
                "stream_options",
                "include",
                "moderation",
                "prompt_cache_options",
            ] {
                if let Some(value) = request.take(key) {
                    self.facts.model_parameters.insert(key.to_owned(), value);
                }
            }
            for key in ["metadata", "prompt_cache_key", "safety_identifier", "user"] {
                if let Some(value) = request.take(key) {
                    self.facts.request_metadata.insert(key.to_owned(), value);
                }
            }
            // Preserve native prompt context and unknown fields after projecting configuration.
            self.facts.input = request.into_input();
            self.facts.input_complete = self.facts.input.is_some();
        }
    }

    fn handle_event(&mut self, bytes: &[u8]) -> bool {
        let Ok(Value::Object(mut event)) = serde_json::from_slice(bytes) else {
            self.response_valid = false;
            return false;
        };
        match event.get("type").and_then(Value::as_str) {
            Some(
                "response.output_text.delta"
                | "response.refusal.delta"
                | "response.function_call_arguments.delta"
                | "response.custom_tool_call_input.delta"
                | "response.reasoning_text.delta"
                | "response.reasoning_summary_text.delta"
                | "response.mcp_call_arguments.delta"
                | "response.code_interpreter_call_code.delta"
                | "response.audio.delta"
                | "response.audio.transcript.delta"
                | "response.shell_call_command.delta",
            ) => {
                return event
                    .get("delta")
                    .and_then(Value::as_str)
                    .is_some_and(|delta| !delta.is_empty());
            }
            Some("response.image_generation_call.partial_image") => {
                return event
                    .get("partial_image_b64")
                    .and_then(Value::as_str)
                    .is_some_and(|image| !image.is_empty());
            }
            Some("response.output_item.done") if self.mode == IngestionMode::Full => {
                if let (Some(index), Some(item)) = (
                    event.get("output_index").and_then(Value::as_u64),
                    event.remove("item").filter(Value::is_object),
                ) {
                    self.store_item(index, item);
                } else {
                    self.response_valid = false;
                }
            }
            Some(
                "response.created"
                | "response.in_progress"
                | "response.completed"
                | "response.failed"
                | "response.incomplete",
            ) => {
                let terminal = matches!(
                    event.get("type").and_then(Value::as_str),
                    Some("response.completed" | "response.failed" | "response.incomplete")
                );
                if let Some(response) = event.get("response").and_then(Value::as_object) {
                    self.capture_response_facts(response);
                    if terminal {
                        self.terminal = true;
                        self.expected_items = response
                            .get("output")
                            .and_then(Value::as_array)
                            .map(Vec::len);
                    }
                } else {
                    self.response_valid = false;
                }
            }
            Some("error") => {
                self.facts.provider_status = Some("failed".to_owned());
                self.record_error(&event);
            }
            _ => {}
        }
        false
    }

    fn store_item(&mut self, index: u64, item: Value) {
        if self.mode != IngestionMode::Full {
            return;
        }
        let size = item.to_string().len();
        let previous = self
            .items
            .get(&index)
            .map_or(0, |item| item.to_string().len());
        if self.output_bytes - previous + size > MAX_OUTPUT_CAPTURE_BYTES
            || (!self.items.contains_key(&index) && self.items.len() >= MAX_ITEMS)
        {
            self.response_valid = false;
            return;
        }
        self.output_bytes = self.output_bytes - previous + size;
        self.items.insert(index, item);
    }

    fn capture_response_facts(&mut self, response: &Map<String, Value>) {
        if let Some(error) = response.get("error").and_then(Value::as_object) {
            self.record_error(error);
        }
        for (key, target) in [
            ("id", &mut self.facts.provider_response_id),
            ("model", &mut self.facts.model),
            ("status", &mut self.facts.provider_status),
        ] {
            if let Some(value) = response
                .get(key)
                .and_then(Value::as_str)
                .and_then(bounded_string)
            {
                *target = Some(value);
            }
        }
        if let Some(tier) = response
            .get("service_tier")
            .and_then(Value::as_str)
            .and_then(bounded_string)
        {
            self.facts
                .model_parameters
                .insert("service_tier".to_owned(), Value::String(tier));
        }
        if let Some(usage) = response.get("usage").filter(|v| v.is_object()) {
            // The enclosing JSON body or SSE event already enforces the byte limit.
            self.facts.usage_details = Some(usage.clone());
        }
        if let Some(metadata) = response.get("provider_metadata").filter(|v| v.is_object()) {
            self.facts.provider_metadata = Some(metadata.clone());
        }
    }

    fn record_error(&mut self, error: &Map<String, Value>) {
        // Provider error messages may echo prompt content, so retain them only in full mode.
        if self.mode != IngestionMode::Full {
            return;
        }
        if let Some(detail) = error_detail(error, ["code", "message"]) {
            self.facts.error_message = Some(detail);
        }
    }
}

/// Responses takes `input` as a string or a list of items, and the system prompt as
/// `instructions`. The last turn is every item after the last one the model
/// produced (an assistant message, a tool call or reasoning): the user's message or
/// the outputs of the model's tool calls. Instructions count only on the first turn.
/// The top-level members guardrails scan.
/// `previous_response_id` and `conversation` are only read to tell whether earlier
/// turns are stored upstream; `prompt` for the variables it fills a stored prompt with.
pub(super) const GUARDRAIL_MEMBERS: &[&str] = &[
    "input",
    "instructions",
    "previous_response_id",
    "conversation",
    "prompt",
];

#[derive(serde::Deserialize)]
struct GuardrailItem<'a> {
    #[serde(borrow, default, rename = "type")]
    kind: Option<&'a serde_json::value::RawValue>,
    #[serde(borrow, default)]
    role: Option<&'a serde_json::value::RawValue>,
    #[serde(borrow, default)]
    content: Option<&'a serde_json::value::RawValue>,
    /// The result of a tool call, in `*_call_output` items.
    #[serde(borrow, default)]
    output: Option<&'a serde_json::value::RawValue>,
}

impl GuardrailItem<'_> {
    /// The model's messages, reasoning and tool calls (`function_call`,
    /// `web_search_call`, `mcp_call`, ...) come from the model; user, system and
    /// developer messages are messages; tool outputs and anything else answer it.
    fn turn_item(&self) -> crate::guardrails::text::TurnItem {
        let role = self.role.and_then(crate::guardrails::text::string);
        let kind = self.kind.and_then(crate::guardrails::text::string);
        let kind = kind.as_deref().unwrap_or_default();
        match role.as_deref() {
            Some("assistant") => crate::guardrails::text::TurnItem::Model,
            Some("user" | "system" | "developer") => crate::guardrails::text::TurnItem::Message,
            _ if kind == "reasoning"
                || kind.ends_with("_call")
                || (kind.starts_with("mcp_") && kind != "mcp_approval_response") =>
            {
                crate::guardrails::text::TurnItem::Model
            }
            _ => crate::guardrails::text::TurnItem::Output,
        }
    }
}

fn classify_guardrail_item(
    item: &serde_json::value::RawValue,
) -> Result<crate::guardrails::text::TurnItem, crate::guardrails::text::Unreadable> {
    let item: GuardrailItem<'_> =
        serde_json::from_str(item.get()).map_err(|_| crate::guardrails::text::Unreadable)?;
    Ok(item.turn_item())
}

pub(super) fn guardrail_turn<'a>(
    member: impl Fn(&str) -> Option<&'a str>,
) -> Result<crate::guardrails::text::LastTurn, crate::guardrails::text::Unreadable> {
    let mut turn = crate::guardrails::text::LastTurn::default();
    let had_model_item = match member("input") {
        Some(items) if items.starts_with('[') => {
            turn.push_items("input", items, classify_guardrail_item, read_guardrail_item)?
        }
        Some(input) => {
            turn.push_member("input", input);
            false
        }
        None => false,
    };
    // Instructions are resent on every turn, also when the provider stores the earlier
    // turns, so they are scanned only on the first one.
    let continues = ["previous_response_id", "conversation"]
        .into_iter()
        .any(|name| member(name).is_some_and(|value| value != "null"));
    if let Some(instructions) = member("instructions") {
        if had_model_item || continues {
            turn.push_earlier_member("instructions", instructions);
        } else {
            turn.push_member("instructions", instructions);
        }
    }
    // Variables fill a stored prompt with new caller text on every request.
    if let Some(prompt) = member("prompt").filter(|prompt| prompt.starts_with('{')) {
        turn.push_member_with("prompt", prompt, read_guardrail_prompt);
    }
    Ok(turn)
}

#[derive(serde::Deserialize)]
struct GuardrailPrompt<'a> {
    #[serde(borrow, default)]
    variables: Option<&'a serde_json::value::RawValue>,
}

/// Variable values are strings or input parts.
fn read_guardrail_prompt(
    prompt: &serde_json::value::RawValue,
    sink: &mut dyn FnMut(crate::guardrails::text::TextLeaf<'_>),
) -> Result<(), crate::guardrails::text::Unreadable> {
    let prompt: GuardrailPrompt<'_> =
        serde_json::from_str(prompt.get()).map_err(|_| crate::guardrails::text::Unreadable)?;
    let Some(variables) = prompt
        .variables
        .filter(|variables| variables.get().starts_with('{'))
    else {
        return Ok(());
    };
    crate::guardrails::text::for_each_value(variables.get(), |value| {
        if value.get().starts_with('{') {
            crate::guardrails::text::collect_part(value, sink)
        } else {
            crate::guardrails::text::collect(value, sink)
        }
    })
}

fn read_guardrail_item(
    item: &serde_json::value::RawValue,
    sink: &mut dyn FnMut(crate::guardrails::text::TextLeaf<'_>),
) -> Result<(), crate::guardrails::text::Unreadable> {
    let item: GuardrailItem<'_> =
        serde_json::from_str(item.get()).map_err(|_| crate::guardrails::text::Unreadable)?;
    for value in [item.content, item.output].into_iter().flatten() {
        crate::guardrails::text::collect(value, sink)?;
    }
    Ok(())
}

pub(super) fn extract_response_json(
    value: &Value,
    blocks: &mut Vec<crate::guardrails::response::ResponseBlock>,
) -> Result<(), crate::guardrails::text::Unreadable> {
    use crate::guardrails::response::{
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

fn responses_delta_spec(kind: &str) -> Option<(&'static str, &'static str)> {
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

fn responses_done_spec(kind: &str) -> Option<(&'static str, &'static str, &'static str)> {
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

pub(super) fn extract_response_sse(
    frame_idx: usize,
    value: &Value,
    collector: &mut crate::guardrails::response::StreamCollector,
) -> Result<(), crate::guardrails::text::Unreadable> {
    use crate::guardrails::response::{StreamKey, ptr_push};
    use crate::guardrails::text::Unreadable;

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
        "response.content_part.done" | "response.reasoning_summary_part.done" => {
            let (index_key, text_slot) = if kind == "response.reasoning_summary_part.done" {
                ("summary_index", "reasoning_summary")
            } else {
                ("content_index", "output_text")
            };
            let part_idx = value.get(index_key).and_then(Value::as_u64).unwrap_or(0);
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

fn collect_responses_part_sse(
    frame_idx: usize,
    part: &Value,
    ptr: &str,
    output_idx: u64,
    part_idx: u64,
    text_slot: &'static str,
    collector: &mut crate::guardrails::response::StreamCollector,
) {
    use crate::guardrails::response::{StreamKey, ptr_push};

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

fn collect_responses_item_sse(
    frame_idx: usize,
    item: &Value,
    ptr: &str,
    output_idx: u64,
    collector: &mut crate::guardrails::response::StreamCollector,
) {
    use crate::guardrails::response::{StreamKey, ptr_push};

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

#[cfg(test)]
mod tests;
