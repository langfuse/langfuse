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
    stop: Map<String, Value>,
    blocks: ContentBlocks,
    terminal: bool,
    request_complete: bool,
    response_valid: bool,
}

/// Streamed content blocks rebuilt from their start, delta and stop events in
/// full mode. Only blocks that reached `content_block_stop` are recorded.
#[derive(Default)]
struct ContentBlocks {
    open: BTreeMap<u64, OpenBlock>,
    done: BTreeMap<u64, Value>,
    bytes: usize,
    valid: bool,
}

struct OpenBlock {
    block: Map<String, Value>,
    partial_json: String,
}

impl ContentBlocks {
    fn start(&mut self, index: u64, block: Map<String, Value>) {
        let size = Value::Object(block.clone()).to_string().len();
        if self.open.contains_key(&index)
            || self.done.contains_key(&index)
            || self.open.len() + self.done.len() >= MAX_ITEMS
            || !self.reserve(size)
        {
            self.valid = false;
            return;
        }
        self.open.insert(
            index,
            OpenBlock {
                block,
                partial_json: String::new(),
            },
        );
    }

    fn apply_delta(&mut self, index: u64, delta: &Map<String, Value>) {
        let text = |key: &str| delta.get(key).and_then(Value::as_str);
        let added = match delta.get("type").and_then(Value::as_str) {
            Some("text_delta") => text("text").map_or(0, str::len),
            Some("thinking_delta") => text("thinking").map_or(0, str::len),
            Some("signature_delta") => text("signature").map_or(0, str::len),
            Some("input_json_delta") => text("partial_json").map_or(0, str::len),
            Some("citations_delta") => delta.get("citation").map_or(0, |c| c.to_string().len()),
            _ => {
                self.open.remove(&index);
                self.valid = false;
                return;
            }
        };
        if !self.open.contains_key(&index) || !self.reserve(added) {
            self.open.remove(&index);
            self.valid = false;
            return;
        }
        let open = self.open.get_mut(&index).expect("checked above");
        let append = |block: &mut Map<String, Value>, key: &str, value: &str| {
            let mut current = block
                .get(key)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            current.push_str(value);
            block.insert(key.to_owned(), Value::String(current));
        };
        match delta.get("type").and_then(Value::as_str) {
            Some("text_delta") => append(&mut open.block, "text", text("text").unwrap_or("")),
            Some("thinking_delta") => {
                append(&mut open.block, "thinking", text("thinking").unwrap_or(""));
            }
            // Signatures are opaque and arrive whole, once per thinking block.
            Some("signature_delta") => {
                open.block.insert(
                    "signature".to_owned(),
                    Value::String(text("signature").unwrap_or("").to_owned()),
                );
            }
            Some("input_json_delta") => {
                open.partial_json
                    .push_str(text("partial_json").unwrap_or(""));
            }
            Some("citations_delta") => {
                if let Some(citation) = delta.get("citation") {
                    match open.block.get_mut("citations") {
                        Some(Value::Array(citations)) => citations.push(citation.clone()),
                        _ => {
                            open.block
                                .insert("citations".to_owned(), json!([citation.clone()]));
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn stop(&mut self, index: u64) {
        let Some(OpenBlock {
            mut block,
            partial_json,
        }) = self.open.remove(&index)
        else {
            self.valid = false;
            return;
        };
        // Tool inputs stream as JSON fragments that only parse once complete.
        if !partial_json.is_empty() {
            let Ok(input) = serde_json::from_str::<Value>(&partial_json) else {
                self.valid = false;
                return;
            };
            block.insert("input".to_owned(), input);
        }
        self.done.insert(index, Value::Object(block));
    }

    fn reserve(&mut self, bytes: usize) -> bool {
        match self.bytes.checked_add(bytes) {
            Some(total) if total <= MAX_CAPTURE_BYTES => {
                self.bytes = total;
                true
            }
            _ => false,
        }
    }

    fn complete(&self) -> bool {
        self.valid && self.open.is_empty()
    }

    fn content(&mut self) -> Vec<Value> {
        std::mem::take(&mut self.done).into_values().collect()
    }
}

impl AnthropicMessagesCapture {
    pub fn new(headers: &HeaderMap, body: &[u8], mode: IngestionMode) -> Self {
        let mut capture = Self {
            facts: ProviderFacts::default(),
            mode,
            body: ResponseBody::Unknown,
            usage: None,
            stop: Map::new(),
            blocks: ContentBlocks {
                valid: true,
                ..ContentBlocks::default()
            },
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
            && (self.mode != IngestionMode::Full || self.blocks.complete());
        self.facts.capture_complete = self.request_complete && self.facts.output_complete;
    }

    pub fn into_facts(mut self) -> ProviderFacts {
        if matches!(self.body, ResponseBody::Sse(_)) {
            self.end_body();
        }
        self.facts.usage_details = self.usage.take().map(Value::Object);
        if self.mode == IngestionMode::Full {
            let mut output = Map::new();
            output.insert("role".to_owned(), json!("assistant"));
            output.insert("content".to_owned(), Value::Array(self.blocks.content()));
            output.extend(std::mem::take(&mut self.stop));
            self.facts.output = Some(Value::Object(output));
        }
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
        if self.mode != IngestionMode::Full {
            return;
        }
        match message.get("content").and_then(Value::as_array) {
            Some(content) if content.len() <= MAX_ITEMS => {
                for (index, block) in content.iter().enumerate() {
                    self.blocks.done.insert(index as u64, block.clone());
                }
            }
            _ => self.blocks.valid = false,
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
            Some("content_block_start") if self.mode == IngestionMode::Full => {
                match (
                    event.get("index").and_then(Value::as_u64),
                    event.get("content_block").and_then(Value::as_object),
                ) {
                    (Some(index), Some(block)) => self.blocks.start(index, block.clone()),
                    _ => self.blocks.valid = false,
                }
            }
            Some("content_block_stop") if self.mode == IngestionMode::Full => {
                match event.get("index").and_then(Value::as_u64) {
                    Some(index) => self.blocks.stop(index),
                    None => self.blocks.valid = false,
                }
            }
            Some("content_block_delta") => {
                let delta = event.get("delta").and_then(Value::as_object);
                if self.mode == IngestionMode::Full {
                    match (event.get("index").and_then(Value::as_u64), delta) {
                        (Some(index), Some(delta)) => self.blocks.apply_delta(index, delta),
                        _ => self.blocks.valid = false,
                    }
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
        // The renderer reads the finish reason from the recorded output.
        for key in ["stop_reason", "stop_sequence"] {
            if let Some(value) = source.get(key).filter(|value| !value.is_null()) {
                self.stop.insert(key.to_owned(), value.clone());
            }
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
