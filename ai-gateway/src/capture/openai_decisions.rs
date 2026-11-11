//! `OpenAI` Decisions request and JSON response capture.
use super::{
    RawRequest, bounded_string, error_detail, facts::ProviderFacts, parse_request,
    response::ResponseBody,
};
use crate::resolution::IngestionMode;
use axum::http::HeaderMap;
use serde_json::{Map, Value};

pub(super) struct OpenAiDecisionsCapture {
    pub(super) facts: ProviderFacts,
    mode: IngestionMode,
    body: ResponseBody,
    request_complete: bool,
}

impl OpenAiDecisionsCapture {
    pub(super) fn new(headers: &HeaderMap, body: &[u8], mode: IngestionMode) -> Self {
        let mut capture = Self {
            facts: ProviderFacts::default(),
            mode,
            body: ResponseBody::Unknown,
            request_complete: false,
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

    pub(super) fn record_response(&mut self, headers: &HeaderMap) {
        self.body = ResponseBody::from_headers(headers);
    }

    /// Decisions answers in a single JSON body, so completion never starts early.
    pub(super) fn push_bytes(&mut self, bytes: &[u8]) -> bool {
        self.body.push(bytes, |_| {});
        false
    }

    pub(super) fn end_body(&mut self) {
        let ResponseBody::Json(bytes) =
            std::mem::replace(&mut self.body, ResponseBody::Unavailable)
        else {
            return;
        };
        let Ok(Value::Object(mut response)) = serde_json::from_slice::<Value>(&bytes) else {
            return;
        };
        if let Some(error) = response.get("error").and_then(Value::as_object) {
            self.record_error(error);
        }
        for (key, target) in [
            ("id", &mut self.facts.provider_response_id),
            ("model", &mut self.facts.model),
        ] {
            if let Some(value) = response
                .get(key)
                .and_then(Value::as_str)
                .and_then(bounded_string)
            {
                *target = Some(value);
            }
        }
        if let Some(usage) = response.remove("usage").filter(Value::is_object) {
            self.facts.usage_details = Some(usage);
        }
        if let Some(metadata) = response
            .remove("provider_metadata")
            .filter(Value::is_object)
        {
            self.facts.provider_metadata = Some(metadata);
        }
        if let Some(answers) = response.remove("answers").filter(Value::is_array) {
            if self.mode == IngestionMode::Full {
                self.facts.output = Some(answers);
            }
            self.facts.output_complete = true;
        }
        self.facts.capture_complete = self.request_complete && self.facts.output_complete;
    }

    pub(super) fn into_facts(self) -> ProviderFacts {
        self.facts
    }

    fn capture_request(&mut self, mut request: RawRequest) {
        self.facts.requested_model = request
            .take("model")
            .as_ref()
            .and_then(Value::as_str)
            .and_then(bounded_string);
        if self.mode != IngestionMode::Full {
            return;
        }
        if let Some(value) = request.take("prompt_cache_options") {
            self.facts
                .model_parameters
                .insert("prompt_cache_options".to_owned(), value);
        }
        for key in ["prompt_cache_key", "safety_identifier"] {
            if let Some(value) = request.take(key) {
                self.facts.request_metadata.insert(key.to_owned(), value);
            }
        }
        // `input` and `questions` stay together as the recorded input.
        self.facts.input = request.into_input();
        self.facts.input_complete = self.facts.input.is_some();
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

#[cfg(test)]
mod tests;
