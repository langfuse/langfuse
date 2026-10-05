//! `OpenAI` Chat Completions request, JSON response and streamed choice capture.
use super::{
    MAX_FACT_STRING, MAX_ITEMS, MAX_OUTPUT_CAPTURE_BYTES, bounded_string, facts::ProviderFacts,
    parse_request, response::ResponseBody,
};
use crate::resolution::IngestionMode;
use axum::http::HeaderMap;
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

const SCALAR_PARAMETERS: [&str; 17] = [
    "temperature",
    "top_p",
    "n",
    "max_tokens",
    "max_completion_tokens",
    "presence_penalty",
    "frequency_penalty",
    "seed",
    "logprobs",
    "top_logprobs",
    "service_tier",
    "parallel_tool_calls",
    "reasoning_effort",
    "verbosity",
    "stream",
    "store",
    "prompt_cache_retention",
];
/// Structured configuration projected out of the recorded input in full mode.
const STRUCTURED_PARAMETERS: [&str; 10] = [
    "stop",
    "response_format",
    "tool_choice",
    "function_call",
    "stream_options",
    "logit_bias",
    "modalities",
    "audio",
    "prediction",
    "web_search_options",
];
const REQUEST_METADATA: [&str; 4] = ["metadata", "prompt_cache_key", "safety_identifier", "user"];
/// Streamed fields that identify rather than extend; repeated values replace.
const IDENTITY_FIELDS: [&str; 3] = ["role", "id", "type"];

pub(super) struct OpenAiChatCompletionsCapture {
    facts: ProviderFacts,
    mode: IngestionMode,
    body: ResponseBody,
    /// Present only in full mode; usage mode never records output.
    output: Option<Choices>,
    terminal: bool,
    request_complete: bool,
    response_valid: bool,
}

/// A capture gap: the recorded output no longer matches what was relayed.
struct Gap;

/// Choices rebuilt in full mode. Streamed choices are merged from their deltas;
/// a choice that cannot be rebuilt exactly is dropped rather than recorded wrong.
#[derive(Default)]
struct Choices {
    choices: BTreeMap<u64, Choice>,
    bytes: usize,
}

#[derive(Default)]
struct Choice {
    fields: Map<String, Value>,
    message: Map<String, Value>,
    tool_calls: BTreeMap<u64, Map<String, Value>>,
    broken: bool,
}

impl Choices {
    fn apply_chunk(&mut self, choice: &Map<String, Value>) -> Result<(), Gap> {
        let index = choice.get("index").and_then(Value::as_u64).ok_or(Gap)?;
        if !self.choices.contains_key(&index) && self.choices.len() >= MAX_ITEMS {
            return Err(Gap);
        }
        let entry = self.choices.entry(index).or_default();
        if entry.broken {
            return Err(Gap);
        }
        let merged = Self::merge_choice(entry, choice, &mut self.bytes);
        if merged.is_err() {
            entry.broken = true;
        }
        merged
    }

    fn merge_choice(
        choice: &mut Choice,
        source: &Map<String, Value>,
        bytes: &mut usize,
    ) -> Result<(), Gap> {
        for (key, value) in source {
            match key.as_str() {
                "index" => {}
                "delta" => {
                    for (key, value) in value.as_object().ok_or(Gap)? {
                        if key == "tool_calls" {
                            Self::merge_tool_calls(choice, value, bytes)?;
                        } else {
                            merge_field(&mut choice.message, key, value, bytes)?;
                        }
                    }
                }
                "finish_reason" if !value.is_null() => {
                    reserve(bytes, value.to_string().len())?;
                    choice.fields.insert(key.clone(), value.clone());
                }
                _ => merge_field(&mut choice.fields, key, value, bytes)?,
            }
        }
        Ok(())
    }

    fn merge_tool_calls(choice: &mut Choice, calls: &Value, bytes: &mut usize) -> Result<(), Gap> {
        for call in calls.as_array().ok_or(Gap)? {
            let call = call.as_object().ok_or(Gap)?;
            let index = call.get("index").and_then(Value::as_u64).ok_or(Gap)?;
            if !choice.tool_calls.contains_key(&index) && choice.tool_calls.len() >= MAX_ITEMS {
                return Err(Gap);
            }
            let target = choice.tool_calls.entry(index).or_default();
            for (key, value) in call {
                if key != "index" {
                    merge_field(target, key, value, bytes)?;
                }
            }
        }
        Ok(())
    }

    /// A non-streamed response carries its complete choices at once.
    fn record_choices(&mut self, choices: &[Value]) -> Result<(), Gap> {
        if choices.len() > MAX_ITEMS {
            return Err(Gap);
        }
        for (position, choice) in choices.iter().enumerate() {
            let fields = choice.as_object().ok_or(Gap)?.clone();
            let index = fields
                .get("index")
                .and_then(Value::as_u64)
                .unwrap_or(position as u64);
            self.choices.insert(
                index,
                Choice {
                    fields,
                    ..Choice::default()
                },
            );
        }
        Ok(())
    }

    fn is_complete(&self) -> bool {
        self.choices
            .values()
            .all(|choice| !choice.broken && choice.fields.contains_key("finish_reason"))
    }

    fn into_value(self) -> Value {
        let choices = self
            .choices
            .into_iter()
            .filter(|(_, choice)| !choice.broken)
            .map(|(index, mut choice)| {
                // A JSON choice is already native; a streamed one gains its message.
                if !choice.message.is_empty() || !choice.tool_calls.is_empty() {
                    if !choice.tool_calls.is_empty() {
                        choice.message.insert(
                            "tool_calls".to_owned(),
                            Value::Array(
                                choice.tool_calls.into_values().map(Value::Object).collect(),
                            ),
                        );
                    }
                    choice
                        .fields
                        .insert("message".to_owned(), Value::Object(choice.message));
                }
                choice.fields.entry("index").or_insert(json!(index));
                Value::Object(choice.fields)
            })
            .collect();
        json!({ "choices": Value::Array(choices) })
    }
}

/// Streamed text fragments append, arrays extend and objects merge field by
/// field; identity fields and scalars replace. Nulls carry no fragment.
fn merge_field(
    target: &mut Map<String, Value>,
    key: &str,
    value: &Value,
    bytes: &mut usize,
) -> Result<(), Gap> {
    match (target.get_mut(key), value) {
        (_, Value::Null) => Ok(()),
        (Some(Value::String(current)), Value::String(fragment))
            if !IDENTITY_FIELDS.contains(&key) =>
        {
            reserve(bytes, fragment.len())?;
            current.push_str(fragment);
            Ok(())
        }
        (Some(Value::Array(current)), Value::Array(items)) => {
            reserve(bytes, value.to_string().len())?;
            current.extend(items.iter().cloned());
            Ok(())
        }
        (Some(Value::Object(current)), Value::Object(fields)) => {
            for (key, value) in fields {
                merge_field(current, key, value, bytes)?;
            }
            Ok(())
        }
        (Some(current), _) if current.is_object() || current.is_array() => Err(Gap),
        (_, value) => {
            reserve(bytes, value.to_string().len())?;
            target.insert(key.to_owned(), value.clone());
            Ok(())
        }
    }
}

fn reserve(used: &mut usize, bytes: usize) -> Result<(), Gap> {
    match used.checked_add(bytes) {
        Some(total) if total <= MAX_OUTPUT_CAPTURE_BYTES => {
            *used = total;
            Ok(())
        }
        _ => Err(Gap),
    }
}

/// The first generated text, refusal, tool or function arguments, or audio.
fn has_generated_content(delta: &Map<String, Value>) -> bool {
    let nonempty = |value: Option<&Value>| {
        value
            .and_then(Value::as_str)
            .is_some_and(|value| !value.is_empty())
    };
    let arguments = |call: &Value| nonempty(call.pointer("/function/arguments"));
    nonempty(delta.get("content"))
        || nonempty(delta.get("refusal"))
        || delta
            .get("tool_calls")
            .and_then(Value::as_array)
            .is_some_and(|calls| calls.iter().any(arguments))
        || nonempty(
            delta
                .get("function_call")
                .and_then(|call| call.get("arguments")),
        )
        || delta
            .get("audio")
            .is_some_and(|audio| nonempty(audio.get("data")) || nonempty(audio.get("transcript")))
}

impl OpenAiChatCompletionsCapture {
    pub fn new(headers: &HeaderMap, body: &[u8], mode: IngestionMode) -> Self {
        let mut capture = Self {
            facts: ProviderFacts::default(),
            mode,
            body: ResponseBody::Unknown,
            output: (mode == IngestionMode::Full).then(Choices::default),
            terminal: false,
            request_complete: false,
            response_valid: true,
        };
        match parse_request(headers, body) {
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

    pub fn record_response(&mut self, headers: &HeaderMap) {
        self.facts.provider_request_id = headers
            .get("x-request-id")
            .and_then(|v| v.to_str().ok())
            .and_then(bounded_string);
        self.body = ResponseBody::from_headers(headers);
        if matches!(self.body, ResponseBody::Unavailable) {
            self.response_valid = false;
        }
    }

    pub fn push_bytes(&mut self, bytes: &[u8]) -> bool {
        let mut body = std::mem::replace(&mut self.body, ResponseBody::Unavailable);
        let mut completion_started = false;
        if !body.push(bytes, |event| {
            completion_started |= self.handle_event(event);
        }) {
            self.response_valid = false;
        }
        self.body = body;
        completion_started
    }

    pub fn end_body(&mut self) {
        match std::mem::replace(&mut self.body, ResponseBody::Unavailable) {
            ResponseBody::Json(bytes) => match serde_json::from_slice::<Value>(&bytes) {
                Ok(Value::Object(response)) => {
                    self.capture_chunk_facts(&response);
                    if let Some(choices) = response.get("choices").and_then(Value::as_array) {
                        self.capture_json_choices(choices);
                        self.terminal = true;
                    }
                }
                _ => self.response_valid = false,
            },
            ResponseBody::Sse(sse) => {
                self.response_valid &= sse.finish();
            }
            ResponseBody::Unknown | ResponseBody::Unavailable => {}
        }
        self.facts.output_complete = self.terminal
            && self.response_valid
            && self.output.as_ref().is_none_or(Choices::is_complete);
        self.facts.capture_complete = self.request_complete && self.facts.output_complete;
    }

    pub fn into_facts(mut self) -> ProviderFacts {
        if matches!(self.body, ResponseBody::Sse(_)) {
            self.end_body();
        }
        self.facts.output = self.output.take().map(Choices::into_value);
        self.facts
    }

    fn capture_request(&mut self, mut request: Map<String, Value>) {
        self.facts.requested_model = request
            .remove("model")
            .as_ref()
            .and_then(Value::as_str)
            .and_then(bounded_string);
        self.facts.model.clone_from(&self.facts.requested_model);
        for key in SCALAR_PARAMETERS {
            if let Some(value) = request.remove(key).filter(|v| {
                self.mode == IngestionMode::Full
                    || v.is_number()
                    || v.is_boolean()
                    || v.as_str().is_some_and(|s| s.len() <= MAX_FACT_STRING)
            }) {
                self.facts.model_parameters.insert(key.to_owned(), value);
            }
        }
        if self.mode == IngestionMode::Full {
            for key in STRUCTURED_PARAMETERS {
                if let Some(value) = request.remove(key) {
                    self.facts.model_parameters.insert(key.to_owned(), value);
                }
            }
            for key in REQUEST_METADATA {
                if let Some(value) = request.remove(key) {
                    self.facts.request_metadata.insert(key.to_owned(), value);
                }
            }
            // `messages`, `tools`, legacy `functions` and unknown fields remain native.
            self.facts.input = Some(Value::Object(request));
            self.facts.input_complete = true;
        }
    }

    fn capture_json_choices(&mut self, choices: &[Value]) {
        for choice in choices {
            if let Some(reason) = choice.get("finish_reason") {
                self.capture_finish_reason(reason);
            }
        }
        if self
            .output
            .as_mut()
            .is_some_and(|output| output.record_choices(choices).is_err())
        {
            self.response_valid = false;
        }
    }

    fn handle_event(&mut self, bytes: &[u8]) -> bool {
        if bytes == b"[DONE]" {
            self.terminal = true;
            return false;
        }
        let Ok(Value::Object(chunk)) = serde_json::from_slice(bytes) else {
            self.response_valid = false;
            return false;
        };
        self.capture_chunk_facts(&chunk);
        let Some(choices) = chunk.get("choices") else {
            return false;
        };
        let Some(choices) = choices.as_array() else {
            self.response_valid = false;
            return false;
        };
        let mut completion_started = false;
        for choice in choices {
            let Some(choice) = choice.as_object() else {
                self.response_valid = false;
                continue;
            };
            if let Some(reason) = choice.get("finish_reason") {
                self.capture_finish_reason(reason);
            }
            completion_started |= choice
                .get("delta")
                .and_then(Value::as_object)
                .is_some_and(has_generated_content);
            if self
                .output
                .as_mut()
                .is_some_and(|output| output.apply_chunk(choice).is_err())
            {
                self.response_valid = false;
            }
        }
        completion_started
    }

    /// Facts every chunk and the JSON response carry at their top level.
    fn capture_chunk_facts(&mut self, chunk: &Map<String, Value>) {
        if let Some(error) = chunk.get("error").and_then(Value::as_object) {
            self.facts.provider_status = Some("failed".to_owned());
            self.record_error(error);
        }
        for (key, target) in [
            ("id", &mut self.facts.provider_response_id),
            ("model", &mut self.facts.model),
        ] {
            if let Some(value) = chunk
                .get(key)
                .and_then(Value::as_str)
                .and_then(bounded_string)
            {
                *target = Some(value);
            }
        }
        if let Some(tier) = chunk
            .get("service_tier")
            .and_then(Value::as_str)
            .and_then(bounded_string)
        {
            self.facts
                .model_parameters
                .insert("service_tier".to_owned(), Value::String(tier));
        }
        if let Some(usage) = chunk.get("usage").filter(|v| v.is_object()) {
            // The enclosing JSON body or SSE event already enforces the byte limit.
            self.facts.usage_details = Some(usage.clone());
        }
    }

    /// A truncated or filtered choice makes the response incomplete; failure wins.
    fn capture_finish_reason(&mut self, reason: &Value) {
        let Some(reason) = reason.as_str() else {
            return;
        };
        let status = match reason {
            "length" | "content_filter" => "incomplete",
            _ => "completed",
        };
        match self.facts.provider_status.as_deref() {
            Some("failed" | "incomplete") => {}
            _ => self.facts.provider_status = Some(status.to_owned()),
        }
    }

    fn record_error(&mut self, error: &Map<String, Value>) {
        // Provider error messages may echo prompt content, so retain them only in full mode.
        if self.mode != IngestionMode::Full {
            return;
        }
        let detail = ["code", "message"]
            .into_iter()
            .filter_map(|key| error.get(key).and_then(Value::as_str))
            .filter(|value| !value.is_empty())
            .map(|value| &value[..value.floor_char_boundary(MAX_FACT_STRING)])
            .collect::<Vec<_>>()
            .join(": ");
        if !detail.is_empty() {
            self.facts.error_message =
                Some(detail[..detail.floor_char_boundary(MAX_FACT_STRING)].to_owned());
        }
    }
}

#[cfg(test)]
mod tests;
