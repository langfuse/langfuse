//! `OpenAI` Responses request, JSON response and completed SSE item capture.
use super::{
    MAX_CAPTURE_BYTES, MAX_FACT_STRING, MAX_ITEMS, bounded_string, facts::ProviderFacts,
    identity_encoding, sse::SseDecoder,
};
use crate::resolution::IngestionMode;
use axum::http::{HeaderMap, header};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

enum ResponseBody {
    Unknown,
    Json(Vec<u8>),
    Sse(SseDecoder),
    Unavailable,
}

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
        };
        if identity_encoding(headers)
            && body.len() <= MAX_CAPTURE_BYTES
            && let Ok(Value::Object(request)) = serde_json::from_slice(body)
        {
            capture.request(request);
            capture.request_complete = true;
        }
        capture
    }

    pub fn response(&mut self, headers: &HeaderMap) {
        self.facts.provider_request_id = headers
            .get("x-request-id")
            .and_then(|v| v.to_str().ok())
            .and_then(bounded_string);
        let content_type = headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim();
        self.body = if !identity_encoding(headers) {
            ResponseBody::Unavailable
        } else if content_type.eq_ignore_ascii_case("text/event-stream") {
            ResponseBody::Sse(SseDecoder::default())
        } else if content_type.eq_ignore_ascii_case("application/json") {
            ResponseBody::Json(Vec::new())
        } else {
            ResponseBody::Unavailable
        };
        if matches!(self.body, ResponseBody::Unavailable) {
            self.response_valid = false;
        }
    }

    pub fn bytes(&mut self, bytes: &[u8]) {
        let mut body = std::mem::replace(&mut self.body, ResponseBody::Unavailable);
        match &mut body {
            ResponseBody::Sse(sse) => {
                sse.push(bytes, MAX_CAPTURE_BYTES, |event| self.event(event));
            }
            ResponseBody::Json(buffer)
                if buffer.len().saturating_add(bytes.len()) <= MAX_CAPTURE_BYTES =>
            {
                buffer.extend_from_slice(bytes);
            }
            ResponseBody::Json(_) => {
                body = ResponseBody::Unavailable;
                self.response_valid = false;
            }
            _ => {}
        }
        self.body = body;
    }

    pub fn end_body(&mut self) {
        match std::mem::replace(&mut self.body, ResponseBody::Unavailable) {
            ResponseBody::Json(bytes) => match serde_json::from_slice::<Value>(&bytes) {
                Ok(Value::Object(response)) => {
                    self.response_facts(&response);
                    if let Some(output) = response.get("output").and_then(Value::as_array) {
                        for (index, item) in output.iter().enumerate() {
                            self.item(index as u64, item.clone());
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
        if self.mode == IngestionMode::Full {
            self.facts.output = Some(Value::Array(self.items.into_values().collect()));
        }
        self.facts
    }

    fn request(&mut self, request: Map<String, Value>) {
        self.facts.requested_model = request
            .get("model")
            .and_then(Value::as_str)
            .and_then(bounded_string);
        self.facts.model.clone_from(&self.facts.requested_model);
        for key in ["temperature", "top_p", "max_output_tokens", "service_tier"] {
            if let Some(value) = request
                .get(key)
                .filter(|v| v.is_number() || v.as_str().is_some_and(|s| s.len() <= MAX_FACT_STRING))
            {
                self.facts
                    .model_parameters
                    .insert(key.to_owned(), value.clone());
            }
        }
        if self.mode == IngestionMode::Full {
            for key in ["reasoning", "text"] {
                if let Some(value) = request.get(key) {
                    self.facts
                        .model_parameters
                        .insert(key.to_owned(), value.clone());
                }
            }
            // Keep the original request object, including native instructions/input
            // and unknown fields. Authentication headers are never part of this value.
            self.facts.input = Some(Value::Object(request));
            self.facts.input_complete = true;
        }
    }

    fn event(&mut self, bytes: &[u8]) {
        let Ok(Value::Object(mut event)) = serde_json::from_slice(bytes) else {
            self.response_valid = false;
            return;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("response.output_item.done") if self.mode == IngestionMode::Full => {
                if let (Some(index), Some(item)) = (
                    event.get("output_index").and_then(Value::as_u64),
                    event.remove("item").filter(Value::is_object),
                ) {
                    self.item(index, item);
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
                    self.response_facts(response);
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
            Some("error") => self.facts.provider_status = Some("failed".to_owned()),
            _ => {}
        }
    }

    fn item(&mut self, index: u64, item: Value) {
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

    fn response_facts(&mut self, response: &Map<String, Value>) {
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
}

#[cfg(test)]
mod tests;
