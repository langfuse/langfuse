//! Best-effort Responses capture. Native bytes never depend on this observer.
mod sse;

use std::{
    collections::BTreeMap,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::http::{HeaderMap, header};
use serde::Serialize;
use serde_json::{Map, Value, json};
use tokio::time::Instant;

use crate::resolution::{IngestionMode, ResolvedRequestContext};

const MAX_CAPTURE_BYTES: usize = 1024 * 1024;
const MAX_ITEMS: usize = 256;
const MAX_FACT_STRING: usize = 512;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Outcome {
    Eof,
    Cancelled,
    Timeout,
    TransportError,
}

#[derive(Serialize)]
struct Record {
    name: &'static str,
    observation_type: &'static str,
    start_time_unix_ms: u128,
    duration_ms: u128,
    first_byte_ms: Option<u128>,
    http_status: Option<u16>,
    model: Option<String>,
    requested_model: Option<String>,
    model_parameters: Map<String, Value>,
    usage_details: Option<Value>,
    input: Option<Value>,
    output: Option<Vec<Value>>,
    metadata: Value,
    provider_response_id: Option<String>,
    provider_request_id: Option<String>,
    provider_status: Option<String>,
    input_complete: bool,
    output_complete: bool,
    observation_complete: bool,
    outcome: Outcome,
}

enum ResponseBody {
    Unknown,
    Json(Vec<u8>),
    Sse(sse::Sse),
    Unavailable,
}

struct Capture {
    record: Record,
    full: bool,
    items: BTreeMap<u64, Value>,
    output_bytes: usize,
    terminal: bool,
    expected_items: Option<usize>,
}

/// Owned before dispatch and moved into the response body. Drop also covers a
/// cancelled provider future before response headers have arrived.
pub(crate) struct Observation {
    capture: Option<Capture>,
    body: ResponseBody,
    started: Instant,
}

impl Observation {
    pub fn new(context: &ResolvedRequestContext, headers: &HeaderMap, body: &[u8]) -> Self {
        let started = Instant::now();
        let attribution = context.attribution();
        // Copy only attribution; never retain provider or ingestion credentials.
        let key_metadata: Map<String, Value> = attribution
            .key_metadata()
            .iter()
            .map(|(key, value)| {
                use crate::resolution::MetadataValue;
                let value = match value {
                    MetadataValue::String(value) => Value::String(value.clone()),
                    MetadataValue::Number(value) => Value::Number(value.clone()),
                    MetadataValue::Bool(value) => Value::Bool(*value),
                };
                (key.clone(), value)
            })
            .collect();
        let full = context.ingestion_mode() == IngestionMode::Full;
        let mut capture = Capture {
            record: Record {
                name: "openai.responses",
                observation_type: "generation",
                start_time_unix_ms: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis(),
                duration_ms: 0,
                first_byte_ms: None,
                http_status: None,
                model: None,
                requested_model: None,
                model_parameters: Map::new(),
                usage_details: None,
                input: None,
                output: None,
                metadata: json!({
                    "organization_id": attribution.organization_id(),
                    "project_id": attribution.project_id(),
                    "key_id": attribution.key_id(),
                    "provider_connection_id": attribution.provider_connection_id(),
                    "key_metadata": key_metadata,
                    "ingestion_mode": if full { "full" } else { "usage" },
                }),
                provider_response_id: None,
                provider_request_id: None,
                provider_status: None,
                input_complete: false,
                output_complete: false,
                observation_complete: true,
                outcome: Outcome::Cancelled,
            },
            full,
            items: BTreeMap::new(),
            output_bytes: 0,
            terminal: false,
            expected_items: None,
        };
        if identity_encoding(headers) && body.len() <= MAX_CAPTURE_BYTES {
            if let Ok(Value::Object(request)) = serde_json::from_slice(body) {
                capture.request(request);
            } else {
                capture.record.observation_complete = false;
            }
        } else {
            capture.record.observation_complete = false;
        }
        Self {
            capture: Some(capture),
            body: ResponseBody::Unknown,
            started,
        }
    }

    pub fn response(&mut self, status: u16, headers: &HeaderMap) {
        let Some(capture) = &mut self.capture else {
            return;
        };
        capture.record.http_status = Some(status);
        capture.record.provider_request_id = headers
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
            ResponseBody::Sse(sse::Sse::default())
        } else if content_type.eq_ignore_ascii_case("application/json") {
            ResponseBody::Json(Vec::new())
        } else {
            ResponseBody::Unavailable
        };
        if matches!(self.body, ResponseBody::Unavailable) {
            capture.record.observation_complete = false;
        }
    }

    pub fn bytes(&mut self, bytes: &[u8]) {
        let Some(capture) = &mut self.capture else {
            return;
        };
        if !bytes.is_empty() {
            capture
                .record
                .first_byte_ms
                .get_or_insert_with(|| self.started.elapsed().as_millis());
        }
        match &mut self.body {
            ResponseBody::Sse(sse) => {
                sse.push(bytes, MAX_CAPTURE_BYTES, |event| capture.event(event));
            }
            ResponseBody::Json(buffer)
                if buffer.len().saturating_add(bytes.len()) <= MAX_CAPTURE_BYTES =>
            {
                buffer.extend_from_slice(bytes);
            }
            ResponseBody::Json(_) => {
                self.body = ResponseBody::Unavailable;
                capture.record.observation_complete = false;
            }
            _ => {}
        }
    }

    pub fn end_body(&mut self) {
        let Some(capture) = &mut self.capture else {
            return;
        };
        match std::mem::replace(&mut self.body, ResponseBody::Unavailable) {
            ResponseBody::Json(bytes) => match serde_json::from_slice::<Value>(&bytes) {
                Ok(Value::Object(response)) => {
                    capture.response_facts(&response);
                    if let Some(output) = response.get("output").and_then(Value::as_array) {
                        for (index, item) in output.iter().enumerate() {
                            capture.item(index as u64, item.clone());
                        }
                        capture.record.output_complete = capture.record.observation_complete;
                    }
                }
                _ => capture.record.observation_complete = false,
            },
            ResponseBody::Sse(sse) => {
                capture.record.observation_complete &= sse.finish();
                capture.record.output_complete = capture.terminal
                    && capture.record.observation_complete
                    && (!capture.full
                        || capture.expected_items.is_some_and(|count| {
                            count == capture.items.len()
                                && capture.items.keys().copied().eq(0..count as u64)
                        }));
            }
            _ => {}
        }
    }

    pub fn finish(&mut self, outcome: Outcome) {
        let Some(mut capture) = self.capture.take() else {
            return;
        };
        capture.record.duration_ms = self.started.elapsed().as_millis();
        capture.record.outcome = outcome;
        if outcome != Outcome::Eof {
            capture.record.output_complete = false;
        }
        if capture.full {
            capture.record.output = Some(capture.items.into_values().collect());
        }
        // Full mode explicitly includes prompts and completed output in this
        // debug-only diagnostic. No raw headers or auth context are serialized.
        tracing::debug!(capture = %format_args!("{:#}", json!(capture.record)), "gateway response captured");
    }
}

impl Drop for Observation {
    fn drop(&mut self) {
        self.finish(Outcome::Cancelled);
    }
}

impl Capture {
    fn request(&mut self, mut request: Map<String, Value>) {
        self.record.requested_model = request
            .get("model")
            .and_then(Value::as_str)
            .and_then(bounded_string);
        self.record.model.clone_from(&self.record.requested_model);
        for key in ["temperature", "top_p", "max_output_tokens", "service_tier"] {
            if let Some(value) = request
                .remove(key)
                .filter(|v| v.is_number() || v.as_str().is_some_and(|s| s.len() <= MAX_FACT_STRING))
            {
                self.record.model_parameters.insert(key.to_owned(), value);
            }
        }
        if !self.full {
            return;
        }
        for key in ["reasoning", "text"] {
            if let Some(value) = request.remove(key) {
                self.record.model_parameters.insert(key.to_owned(), value);
            }
        }
        let mut messages = Vec::new();
        if let Some(instructions) = request.remove("instructions").filter(|v| !v.is_null()) {
            messages.push(json!({"role": "system", "content": instructions}));
        }
        match request.remove("input") {
            Some(Value::String(text)) => messages.push(json!({"role": "user", "content": text})),
            Some(Value::Array(items)) => messages.extend(items),
            None | Some(Value::Null) => {}
            Some(_) => {
                self.record.observation_complete = false;
                return;
            }
        }
        let mut input = json!({"messages": messages});
        for key in [
            "tools",
            "tool_choice",
            "parallel_tool_calls",
            "previous_response_id",
            "conversation",
        ] {
            if let Some(value) = request.remove(key) {
                input[key] = value;
            }
        }
        self.record.input = Some(input);
        self.record.input_complete = true;
    }

    fn event(&mut self, bytes: &[u8]) {
        let Ok(Value::Object(mut event)) = serde_json::from_slice(bytes) else {
            self.record.observation_complete = false;
            return;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("response.output_item.done") if self.full => {
                if let (Some(index), Some(item)) = (
                    event.get("output_index").and_then(Value::as_u64),
                    event.remove("item").filter(Value::is_object),
                ) {
                    self.item(index, item);
                } else {
                    self.record.observation_complete = false;
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
                    self.record.observation_complete = false;
                }
            }
            Some("error") => self.record.provider_status = Some("failed".to_owned()),
            _ => {}
        }
    }

    fn item(&mut self, index: u64, item: Value) {
        if !self.full {
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
            self.record.observation_complete = false;
            return;
        }
        self.output_bytes = self.output_bytes - previous + size;
        self.items.insert(index, item);
    }

    fn response_facts(&mut self, response: &Map<String, Value>) {
        for (key, target) in [
            ("id", &mut self.record.provider_response_id),
            ("model", &mut self.record.model),
            ("status", &mut self.record.provider_status),
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
            self.record
                .model_parameters
                .insert("service_tier".to_owned(), Value::String(tier));
        }
        if let Some(usage) = response.get("usage").and_then(Value::as_object) {
            let mut captured = Map::new();
            for key in ["input_tokens", "output_tokens", "total_tokens"] {
                if let Some(value) = usage.get(key).and_then(Value::as_u64) {
                    captured.insert(key.to_owned(), value.into());
                }
            }
            for (group, key) in [
                ("input_tokens_details", "cached_tokens"),
                ("output_tokens_details", "reasoning_tokens"),
            ] {
                if let Some(value) = usage
                    .get(group)
                    .and_then(|v| v.get(key))
                    .and_then(Value::as_u64)
                {
                    captured.insert(group.to_owned(), json!({key: value}));
                }
            }
            if !captured.is_empty() {
                self.record.usage_details = Some(Value::Object(captured));
            }
        }
    }
}

fn bounded_string(value: &str) -> Option<String> {
    (value.len() <= MAX_FACT_STRING).then(|| value.to_owned())
}

fn identity_encoding(headers: &HeaderMap) -> bool {
    headers
        .get_all(header::CONTENT_ENCODING)
        .iter()
        .all(|v| v.to_str().is_ok_and(|v| v.eq_ignore_ascii_case("identity")))
}

#[cfg(test)]
mod tests;
