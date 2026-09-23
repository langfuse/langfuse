use super::{
    MAX_CAPTURE_BYTES, MAX_FACT_STRING, MAX_ITEMS, bounded_string, facts::ProviderFacts,
    identity_encoding, response::ResponseBody,
};
use crate::resolution::IngestionMode;
use axum::http::HeaderMap;
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

const SCALAR_PARAMETERS: [&str; 7] = [
    "max_tokens",
    "temperature",
    "top_p",
    "top_k",
    "stream",
    "service_tier",
    "speed",
];
/// Structured configuration projected out of the recorded input in full mode.
const STRUCTURED_PARAMETERS: [&str; 5] = [
    "stop_sequences",
    "thinking",
    "tool_choice",
    "context_management",
    "output_config",
];

pub(super) struct AnthropicMessagesCapture {
    facts: ProviderFacts,
    mode: IngestionMode,
    body: ResponseBody,
    usage: Option<Map<String, Value>>,
    /// Present only in full mode; usage mode never records output.
    output: Option<AssistantMessage>,
    terminal: bool,
    request_complete: bool,
    response_valid: bool,
}

/// A capture gap: the recorded output no longer matches what was relayed.
struct Gap;

/// The assistant message rebuilt in full mode. Streamed blocks are assembled
/// from their start, delta and stop events; only stopped blocks are recorded.
#[derive(Default)]
struct AssistantMessage {
    stop: Map<String, Value>,
    blocks: BTreeMap<u64, Block>,
    bytes: usize,
}

struct Block {
    fields: Map<String, Value>,
    partial_json: String,
    finished: bool,
}

impl AssistantMessage {
    fn start(&mut self, index: u64, fields: Map<String, Value>) -> Result<(), Gap> {
        if self.blocks.contains_key(&index) || self.blocks.len() >= MAX_ITEMS {
            return Err(Gap);
        }
        let size = serde_json::to_string(&fields).map_or(usize::MAX, |json| json.len());
        reserve(&mut self.bytes, size)?;
        self.blocks.insert(
            index,
            Block {
                fields,
                partial_json: String::new(),
                finished: false,
            },
        );
        Ok(())
    }

    /// A block that cannot be rebuilt exactly is dropped rather than recorded wrong.
    fn apply_delta(&mut self, index: u64, delta: &Map<String, Value>) -> Result<(), Gap> {
        let applied = self.try_apply_delta(index, delta);
        if applied.is_err() {
            self.blocks.remove(&index);
        }
        applied
    }

    fn try_apply_delta(&mut self, index: u64, delta: &Map<String, Value>) -> Result<(), Gap> {
        let block = self
            .blocks
            .get_mut(&index)
            .filter(|block| !block.finished)
            .ok_or(Gap)?;
        let kind = delta.get("type").and_then(Value::as_str).ok_or(Gap)?;
        if kind == "citations_delta" {
            let citation = delta.get("citation").ok_or(Gap)?;
            reserve(&mut self.bytes, citation.to_string().len())?;
            match block.fields.get_mut("citations") {
                Some(Value::Array(citations)) => citations.push(citation.clone()),
                _ => {
                    block
                        .fields
                        .insert("citations".to_owned(), Value::Array(vec![citation.clone()]));
                }
            }
            return Ok(());
        }
        // Every other delta appends a string fragment to one field of the block.
        let (field, source) = match kind {
            "text_delta" => ("text", "text"),
            "thinking_delta" => ("thinking", "thinking"),
            "signature_delta" => ("signature", "signature"),
            "input_json_delta" => ("", "partial_json"),
            _ => return Err(Gap),
        };
        let fragment = delta.get(source).and_then(Value::as_str).ok_or(Gap)?;
        reserve(&mut self.bytes, fragment.len())?;
        if field.is_empty() {
            block.partial_json.push_str(fragment);
        } else if let Some(Value::String(current)) = block.fields.get_mut(field) {
            current.push_str(fragment);
        } else {
            block
                .fields
                .insert(field.to_owned(), Value::String(fragment.to_owned()));
        }
        Ok(())
    }

    fn stop_block(&mut self, index: u64) -> Result<(), Gap> {
        let block = self
            .blocks
            .get_mut(&index)
            .filter(|block| !block.finished)
            .ok_or(Gap)?;
        // Tool inputs stream as JSON fragments that only parse once complete.
        if !block.partial_json.is_empty() {
            let Ok(input) = serde_json::from_str::<Value>(&block.partial_json) else {
                self.blocks.remove(&index);
                return Err(Gap);
            };
            block.fields.insert("input".to_owned(), input);
            block.partial_json = String::new();
        }
        block.finished = true;
        Ok(())
    }

    /// A non-streamed response carries its complete content at once.
    fn record_content(&mut self, content: Option<&Vec<Value>>) -> Result<(), Gap> {
        let content = content
            .filter(|content| content.len() <= MAX_ITEMS)
            .ok_or(Gap)?;
        for (index, fields) in content.iter().enumerate() {
            let fields = fields.as_object().ok_or(Gap)?.clone();
            self.blocks.insert(
                index as u64,
                Block {
                    fields,
                    partial_json: String::new(),
                    finished: true,
                },
            );
        }
        Ok(())
    }

    /// The renderer reads the finish reason from the recorded output.
    fn record_stop(&mut self, source: &Map<String, Value>) {
        for key in ["stop_reason", "stop_sequence"] {
            if let Some(value) = source.get(key).filter(|value| !value.is_null()) {
                self.stop.insert(key.to_owned(), value.clone());
            }
        }
    }

    fn is_complete(&self) -> bool {
        self.blocks.values().all(|block| block.finished)
    }

    fn into_value(self) -> Value {
        let content = self
            .blocks
            .into_values()
            .filter(|block| block.finished)
            .map(|block| Value::Object(block.fields))
            .collect();
        let mut message = Map::new();
        message.insert("role".to_owned(), json!("assistant"));
        message.insert("content".to_owned(), Value::Array(content));
        message.extend(self.stop);
        Value::Object(message)
    }
}

fn reserve(used: &mut usize, bytes: usize) -> Result<(), Gap> {
    match used.checked_add(bytes) {
        Some(total) if total <= MAX_CAPTURE_BYTES => {
            *used = total;
            Ok(())
        }
        _ => Err(Gap),
    }
}

fn block_index(event: &Map<String, Value>) -> Option<u64> {
    event.get("index").and_then(Value::as_u64)
}

impl AnthropicMessagesCapture {
    pub fn new(headers: &HeaderMap, body: &[u8], mode: IngestionMode) -> Self {
        let mut capture = Self {
            facts: ProviderFacts::default(),
            mode,
            body: ResponseBody::Unknown,
            usage: None,
            output: (mode == IngestionMode::Full).then(AssistantMessage::default),
            terminal: false,
            request_complete: false,
            response_valid: true,
        };
        if identity_encoding(headers)
            && body.len() <= MAX_CAPTURE_BYTES
            && let Ok(Value::Object(request)) = serde_json::from_slice(body)
        {
            capture.capture_request(request);
            capture.request_complete = true;
        }
        capture
    }

    pub fn record_response(&mut self, headers: &HeaderMap) {
        self.facts.provider_request_id = headers
            .get("request-id")
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
                    if response.get("type").and_then(Value::as_str) == Some("error") {
                        self.record_failure(&response);
                    } else {
                        self.capture_message(&response);
                        self.capture_json_content(&response);
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
            && self
                .output
                .as_ref()
                .is_none_or(AssistantMessage::is_complete);
        self.facts.capture_complete = self.request_complete && self.facts.output_complete;
    }

    pub fn into_facts(mut self) -> ProviderFacts {
        if matches!(self.body, ResponseBody::Sse(_)) {
            self.end_body();
        }
        self.facts.usage_details = self.usage.take().map(Value::Object);
        self.facts.output = self.output.take().map(AssistantMessage::into_value);
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
                v.is_number()
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
            // Claude Code stores its session identifiers here; it is request
            // metadata rather than prompt content.
            if let Some(value) = request.remove("metadata") {
                self.facts
                    .request_metadata
                    .insert("metadata".to_owned(), value);
            }
            // `system`, `messages`, `tools` and unknown fields remain native.
            self.facts.input = Some(Value::Object(request));
            self.facts.input_complete = true;
        }
    }

    fn capture_json_content(&mut self, message: &Map<String, Value>) {
        let content = message.get("content").and_then(Value::as_array);
        if self
            .output
            .as_mut()
            .is_some_and(|output| output.record_content(content).is_err())
        {
            self.response_valid = false;
        }
    }

    fn handle_event(&mut self, bytes: &[u8]) -> bool {
        let Ok(Value::Object(event)) = serde_json::from_slice(bytes) else {
            self.response_valid = false;
            return false;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("message_start") => {
                if let Some(message) = event.get("message").and_then(Value::as_object) {
                    self.capture_message(message);
                } else {
                    self.response_valid = false;
                }
            }
            Some("content_block_start") => {
                let block = event.get("content_block").and_then(Value::as_object);
                if self.output.as_mut().is_some_and(|output| {
                    block_index(&event)
                        .zip(block)
                        .is_none_or(|(index, block)| output.start(index, block.clone()).is_err())
                }) {
                    self.response_valid = false;
                }
            }
            Some("content_block_stop") => {
                if self.output.as_mut().is_some_and(|output| {
                    block_index(&event).is_none_or(|index| output.stop_block(index).is_err())
                }) {
                    self.response_valid = false;
                }
            }
            Some("content_block_delta") => {
                let delta = event.get("delta").and_then(Value::as_object);
                if self.output.as_mut().is_some_and(|output| {
                    block_index(&event)
                        .zip(delta)
                        .is_none_or(|(index, delta)| output.apply_delta(index, delta).is_err())
                }) {
                    self.response_valid = false;
                }
                return delta.is_some_and(|delta| {
                    ["text", "thinking", "partial_json"].iter().any(|key| {
                        delta
                            .get(*key)
                            .and_then(Value::as_str)
                            .is_some_and(|content| !content.is_empty())
                    })
                });
            }
            Some("message_delta") => {
                if let Some(delta) = event.get("delta").and_then(Value::as_object) {
                    self.capture_stop(delta);
                }
                if let Some(usage) = event.get("usage").and_then(Value::as_object) {
                    self.merge_usage(usage);
                }
            }
            Some("message_stop") => self.terminal = true,
            Some("error") => self.record_failure(&event),
            _ => {}
        }
        false
    }

    fn capture_message(&mut self, message: &Map<String, Value>) {
        for (key, target) in [
            ("id", &mut self.facts.provider_response_id),
            ("model", &mut self.facts.model),
        ] {
            if let Some(value) = message
                .get(key)
                .and_then(Value::as_str)
                .and_then(bounded_string)
            {
                *target = Some(value);
            }
        }
        self.capture_stop(message);
        if let Some(usage) = message.get("usage").and_then(Value::as_object) {
            self.merge_usage(usage);
        }
    }

    fn capture_stop(&mut self, source: &Map<String, Value>) {
        let Some(stop_reason) = source.get("stop_reason").and_then(Value::as_str) else {
            return;
        };
        if let Some(output) = &mut self.output {
            output.record_stop(source);
        }
        self.facts.provider_status = Some(
            match stop_reason {
                "max_tokens" | "model_context_window_exceeded" => "incomplete",
                _ => "completed",
            }
            .to_owned(),
        );
    }

    fn merge_usage(&mut self, usage: &Map<String, Value>) {
        let merged = self.usage.get_or_insert_with(Map::new);
        for (key, value) in usage {
            if !value.is_null() {
                merged.insert(key.clone(), value.clone());
            }
        }
    }

    fn record_failure(&mut self, envelope: &Map<String, Value>) {
        self.facts.provider_status = Some("failed".to_owned());
        if self.mode != IngestionMode::Full {
            return;
        }
        let Some(error) = envelope.get("error").and_then(Value::as_object) else {
            return;
        };
        let detail = ["type", "message"]
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
