//! `OpenAI` Responses request, JSON response and completed SSE item capture.
use super::{
    MAX_CAPTURE_BYTES, MAX_FACT_STRING, MAX_ITEMS, bounded_string, facts::ProviderFacts,
    identity_encoding, response::ResponseBody,
};
use crate::{resolution::IngestionMode, telemetry};
use axum::http::HeaderMap;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub(super) struct OpenAiResponsesCapture {
    facts: ProviderFacts,
    mode: IngestionMode,
    body: ResponseBody,
    items: BTreeMap<u64, Value>,
    output_bytes: usize,
    terminal: bool,
    expected_items: Option<usize>,
    request_complete: bool,
    response_valid: bool,
    client_metadata: Option<Map<String, Value>>,
}

impl OpenAiResponsesCapture {
    pub fn new(headers: &HeaderMap, body: &[u8], mode: IngestionMode) -> Self {
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

    pub fn into_facts(mut self) -> ProviderFacts {
        if matches!(self.body, ResponseBody::Sse(_)) {
            self.end_body();
        }
        if self.mode == IngestionMode::Full {
            self.facts.output = Some(Value::Array(self.items.into_values().collect()));
        }
        self.facts
    }

    /// The coding agent's `client_metadata` object removed from the request, if any.
    pub fn client_metadata(&self) -> Option<&Map<String, Value>> {
        self.client_metadata.as_ref()
    }

    fn capture_request(&mut self, mut request: Map<String, Value>) {
        self.facts.requested_model = request
            .get("model")
            .and_then(Value::as_str)
            .and_then(bounded_string);
        self.facts.model.clone_from(&self.facts.requested_model);
        request.remove("model");
        // Agent identifiers are recorded as `agent.*` metadata in both ingestion modes.
        self.client_metadata = telemetry::take_agent_client_metadata(&mut request);
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
                if let Some(value) = request.remove(key) {
                    self.facts.model_parameters.insert(key.to_owned(), value);
                }
            }
            for key in ["metadata", "prompt_cache_key", "safety_identifier", "user"] {
                if let Some(value) = request.remove(key) {
                    self.facts.request_metadata.insert(key.to_owned(), value);
                }
            }
            // Preserve native prompt context and unknown fields after projecting configuration.
            self.facts.input = Some(Value::Object(request));
            self.facts.input_complete = true;
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
        if self.output_bytes - previous + size > MAX_CAPTURE_BYTES
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
