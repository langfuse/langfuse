use super::{
    MAX_CAPTURE_BYTES, MAX_FACT_STRING, bounded_string, facts::ProviderFacts, identity_encoding,
    response::ResponseBody,
};
use crate::resolution::IngestionMode;
use axum::http::HeaderMap;
use serde_json::{Map, Value};

pub(super) struct AnthropicMessagesCapture {
    facts: ProviderFacts,
    mode: IngestionMode,
    body: ResponseBody,
    usage: Option<Map<String, Value>>,
    terminal: bool,
    request_complete: bool,
    response_valid: bool,
}

impl AnthropicMessagesCapture {
    pub fn new(headers: &HeaderMap, body: &[u8], mode: IngestionMode) -> Self {
        let mut capture = Self {
            facts: ProviderFacts::default(),
            mode,
            body: ResponseBody::Unknown,
            usage: None,
            terminal: false,
            request_complete: false,
            response_valid: true,
        };
        if identity_encoding(headers)
            && body.len() <= MAX_CAPTURE_BYTES
            && let Ok(Value::Object(request)) = serde_json::from_slice(body)
        {
            capture.capture_request(&request);
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
        self.facts.output_complete =
            self.terminal && self.response_valid && self.mode != IngestionMode::Full;
        self.facts.capture_complete = self.request_complete && self.facts.output_complete;
    }

    pub fn into_facts(mut self) -> ProviderFacts {
        if matches!(self.body, ResponseBody::Sse(_)) {
            self.end_body();
        }
        self.facts.usage_details = self.usage.take().map(Value::Object);
        self.facts
    }

    fn capture_request(&mut self, request: &Map<String, Value>) {
        self.facts.requested_model = request
            .get("model")
            .and_then(Value::as_str)
            .and_then(bounded_string);
        self.facts.model.clone_from(&self.facts.requested_model);
        for key in [
            "max_tokens",
            "temperature",
            "top_p",
            "top_k",
            "stream",
            "service_tier",
        ] {
            if let Some(value) = request.get(key).filter(|v| {
                v.is_number()
                    || v.is_boolean()
                    || v.as_str().is_some_and(|s| s.len() <= MAX_FACT_STRING)
            }) {
                self.facts
                    .model_parameters
                    .insert(key.to_owned(), value.clone());
            }
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
            Some("content_block_delta") => {
                return event
                    .get("delta")
                    .and_then(Value::as_object)
                    .is_some_and(|delta| {
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
