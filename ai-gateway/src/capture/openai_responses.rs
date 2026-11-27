//! `OpenAI` Responses request, JSON response and completed SSE item capture.
use super::{
    InputOmission, MAX_FACT_STRING, MAX_ITEMS, MAX_OUTPUT_CAPTURE_BYTES, RawRequest,
    bounded_string, error_detail, facts::ProviderFacts, response::ResponseBody,
};
use crate::{resolution::IngestionMode, telemetry};
use axum::http::HeaderMap;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

use crate::guardrails::spec::{
    Emit, JSON_LEAF, LEAF, Node, Object, ResponseSpec, delta, each, json_delta, json_summary,
    keyed_each, maybe_keyed_each, parts, summary, text,
};

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
/// Where Responses API requests carry the conversation guardrails scan.
pub(super) const REQUEST: crate::guardrails::spec::RequestSpec =
    crate::guardrails::spec::RequestSpec {
        members: &[
            "input",
            "instructions",
            "previous_response_id",
            "conversation",
            "prompt",
        ],
        last_turn: guardrail_turn,
    };

#[derive(serde::Deserialize)]
struct GuardrailItem<'a> {
    #[serde(borrow, default, rename = "type")]
    kind: Option<&'a serde_json::value::RawValue>,
    #[serde(borrow, default)]
    role: Option<&'a serde_json::value::RawValue>,
    /// `content` and `output` (a tool call's result) are read by `GUARDRAIL_ITEM`;
    /// declared so that a duplicate makes the input unreadable even where it is
    /// not read.
    #[serde(borrow, default, rename = "content")]
    _content: Option<&'a serde_json::value::RawValue>,
    #[serde(borrow, default, rename = "output")]
    _output: Option<&'a serde_json::value::RawValue>,
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
    let item: GuardrailItem<'_> = crate::guardrails::text::object_item(item)?;
    Ok(item.turn_item())
}

pub(super) fn guardrail_turn(
    members: &crate::guardrails::spec::Members<'_, '_>,
) -> Result<crate::guardrails::text::LastTurn, crate::guardrails::text::Unreadable> {
    let mut turn = crate::guardrails::text::LastTurn::default();
    let had_model_item = match members.get("input")? {
        Some(items) if items.starts_with('[') => {
            turn.push_items("input", items, classify_guardrail_item, &GUARDRAIL_ITEM)?
        }
        Some(input) => {
            turn.push_member("input", input);
            false
        }
        None => false,
    };
    // Instructions are resent on every turn, also when the provider stores the earlier
    // turns, so they are scanned only on the first one.
    let mut continues = false;
    for name in ["previous_response_id", "conversation"] {
        continues |= members.get(name)?.is_some_and(|value| value != "null");
    }
    if let Some(instructions) = members.get("instructions")? {
        if had_model_item || continues {
            turn.push_earlier_member("instructions", instructions);
        } else {
            turn.push_member("instructions", instructions);
        }
    }
    // Variables fill a stored prompt with new caller text on every request.
    if let Some(prompt) = members
        .get("prompt")?
        .filter(|prompt| prompt.starts_with('{'))
    {
        turn.push_member_with("prompt", prompt, &GUARDRAIL_PROMPT);
    }
    Ok(turn)
}

/// A conversation item's text: a message's `content`, a tool output's `output`.
const GUARDRAIL_ITEM: Node = Object::new(&[
    ("content", crate::guardrails::spec::CONTENT),
    ("output", crate::guardrails::spec::CONTENT),
])
.node();

/// A stored prompt's variables, which fill it with new caller text on every
/// request: each a string, or input parts.
const GUARDRAIL_PROMPT: Node = Object::new(&[(
    "variables",
    Node::Values(&Node::OneOf(&[
        crate::guardrails::spec::PART,
        crate::guardrails::spec::CONTENT,
    ])),
)])
.node();

/// Where Responses API responses carry model text.
pub(super) const RESPONSE: ResponseSpec = ResponseSpec {
    json: Object::new(&[
        ("output", each(&OUTPUT_ITEM)),
        ("output_text", text(Emit::Copy)),
    ])
    .node(),
    sse: Object::new(&[]).by("type", EVENTS, None).node(),
};

const OUTPUT_ITEM: Node = Object::new(&[
    ("content", parts(LEAF)),
    ("summary", parts(LEAF)),
    ("text", parts(LEAF)),
    ("refusal", parts(LEAF)),
    ("input", parts(LEAF)),
    ("arguments", text(JSON_LEAF)),
])
.strict()
.node();

const PART: &[&str] = &["output_index", "content_index"];
const SUMMARY_PART: &[&str] = &["output_index", "summary_index"];
const ITEM: &[&str] = &["output_index"];

/// An event of `$type` whose `$field` holds text, with stream indices from `$index`.
macro_rules! event {
    ($type:literal, $index:expr, $field:literal, $emit:expr) => {
        ($type, Object::new(&[($field, text($emit))]).indexed($index))
    };
}

/// An output item's text parts and tool input, with its tool arguments in `$arguments`.
macro_rules! item {
    ($content:expr, $arguments:literal) => {
        Object::new(&[
            ("content", maybe_keyed_each(&$content)),
            ("summary", maybe_keyed_each(&SUMMARY_TEXT_PART)),
            ("arguments", text(json_summary($arguments))),
            ("input", text(summary("custom_tool_call_input"))),
            ("text", text(LEAF)),
            ("refusal", text(LEAF)),
        ])
    };
}

/// Text and refusal of a content part, text in the `$slot` stream.
macro_rules! text_part {
    ($slot:literal) => {
        Object::new(&[
            ("text", text(summary($slot))),
            ("refusal", text(summary("refusal"))),
        ])
        .node()
    };
}

/// Streamed events, each a piece of a stream (`*.delta`) or a complete copy of one.
#[rustfmt::skip]
const EVENTS: &[(&str, Object)] = &[
    event!("response.output_text.delta", PART, "delta", delta("output_text")),
    event!("response.refusal.delta", PART, "delta", delta("refusal")),
    event!("response.function_call_arguments.delta", ITEM, "delta", json_delta("function_call_args")),
    event!("response.custom_tool_call_input.delta", ITEM, "delta", delta("custom_tool_call_input")),
    event!("response.mcp_call_arguments.delta", ITEM, "delta", json_delta("mcp_call_args")),
    event!("response.reasoning_text.delta", PART, "delta", delta("reasoning_text")),
    event!("response.reasoning_summary_text.delta", SUMMARY_PART, "delta", delta("reasoning_summary")),
    event!("response.output_text.done", PART, "text", summary("output_text")),
    event!("response.refusal.done", PART, "refusal", summary("refusal")),
    event!("response.function_call_arguments.done", ITEM, "arguments", json_summary("function_call_args")),
    event!("response.custom_tool_call_input.done", ITEM, "input", summary("custom_tool_call_input")),
    event!("response.mcp_call_arguments.done", ITEM, "arguments", json_summary("mcp_call_args")),
    event!("response.reasoning_text.done", PART, "text", summary("reasoning_text")),
    event!("response.reasoning_summary_text.done", SUMMARY_PART, "text", summary("reasoning_summary")),
    ("response.content_part.done", Object::new(&[("part", OUTPUT_TEXT_PART)]).indexed(PART)),
    ("response.reasoning_summary_part.done", Object::new(&[("part", SUMMARY_TEXT_PART)]).indexed(SUMMARY_PART)),
    ("response.output_item.done", Object::new(&[("item", STREAMED_ITEM)]).indexed(ITEM)),
    ("response.completed", COMPLETED),
    ("response.incomplete", COMPLETED),
];

const COMPLETED: Object = Object::new(&[(
    "response",
    Object::new(&[
        ("output", keyed_each(&STREAMED_ITEM)),
        ("output_text", text(Emit::Copy)),
    ])
    .node(),
)]);

/// An output item in a streamed event: complete copies of its streams.
const STREAMED_ITEM: Node = Object::new(&[])
    .by(
        "type",
        &[
            (
                "reasoning",
                item!(REASONING_TEXT_PART, "function_call_args"),
            ),
            ("mcp_call", item!(OUTPUT_TEXT_PART, "mcp_call_args")),
        ],
        Some(&item!(OUTPUT_TEXT_PART, "function_call_args")),
    )
    .node();

const OUTPUT_TEXT_PART: Node = text_part!("output_text");
const REASONING_TEXT_PART: Node = text_part!("reasoning_text");
const SUMMARY_TEXT_PART: Node = text_part!("reasoning_summary");

#[cfg(test)]
mod tests;
