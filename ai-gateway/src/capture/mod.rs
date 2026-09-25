mod anthropic_messages;
mod facts;
mod openai_responses;
mod response;
mod sse;

use std::time::{SystemTime, UNIX_EPOCH};

use axum::http::{HeaderMap, header};
use serde_json::{Map, Value, json};
use tokio::time::Instant;

use crate::{
    resolution::{ApiFormat, IngestionMode, MetadataValue, ResolvedRequestContext},
    telemetry,
};
use anthropic_messages::AnthropicMessagesCapture;
pub(crate) use facts::ProviderFacts;
pub(crate) use facts::{InferenceFacts, InputOmission, InputOmissionReason, RelayOutcome};
use openai_responses::OpenAiResponsesCapture;

/// Full-mode request bodies up to this size are recorded as the observation input.
/// Telemetry record and payload limits are sized so an input at this limit is delivered.
pub(crate) const MAX_INPUT_CAPTURE_BYTES: usize = 5 * 1024 * 1024;
pub(crate) const MAX_OUTPUT_CAPTURE_BYTES: usize = 1024 * 1024;
const MAX_ITEMS: usize = 256;
const MAX_FACT_STRING: usize = 512;

enum ProtocolCapture {
    OpenAiResponses(OpenAiResponsesCapture),
    AnthropicMessages(AnthropicMessagesCapture),
}

impl ProtocolCapture {
    fn new(api_format: ApiFormat, headers: &HeaderMap, body: &[u8], mode: IngestionMode) -> Self {
        match api_format {
            ApiFormat::OpenAiResponses => {
                Self::OpenAiResponses(OpenAiResponsesCapture::new(headers, body, mode))
            }
            ApiFormat::AnthropicMessages => {
                Self::AnthropicMessages(AnthropicMessagesCapture::new(headers, body, mode))
            }
        }
    }

    fn record_response(&mut self, headers: &HeaderMap) {
        match self {
            Self::OpenAiResponses(capture) => capture.record_response(headers),
            Self::AnthropicMessages(capture) => capture.record_response(headers),
        }
    }

    fn push_bytes(&mut self, bytes: &[u8]) -> bool {
        match self {
            Self::OpenAiResponses(capture) => capture.push_bytes(bytes),
            Self::AnthropicMessages(capture) => capture.push_bytes(bytes),
        }
    }

    fn end_body(&mut self) {
        match self {
            Self::OpenAiResponses(capture) => capture.end_body(),
            Self::AnthropicMessages(capture) => capture.end_body(),
        }
    }

    fn into_facts(self) -> (&'static str, ProviderFacts) {
        match self {
            Self::OpenAiResponses(capture) => ("openai.responses", capture.into_facts()),
            Self::AnthropicMessages(capture) => ("anthropic.messages", capture.into_facts()),
        }
    }

    fn client_metadata(&self) -> Option<&Map<String, Value>> {
        match self {
            Self::OpenAiResponses(capture) => capture.client_metadata(),
            Self::AnthropicMessages(_) => None,
        }
    }
}

/// Owned before dispatch and moved into the response body. Drop also covers a
/// cancelled provider future before response headers have arrived.
pub(crate) struct ExecutionCapture {
    span: tracing::Span,
    protocol: Option<ProtocolCapture>,
    started: Instant,
    start_time_unix_ms: u128,
    first_byte_ms: Option<u128>,
    completion_start_ms: Option<u128>,
    http_status: Option<u16>,
    metadata: Value,
    delivery: Option<(telemetry::Telemetry, telemetry::DeliveryContext)>,
}

impl ExecutionCapture {
    pub fn unobserved() -> Self {
        Self {
            span: tracing::Span::current(),
            protocol: None,
            started: Instant::now(),
            start_time_unix_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis(),
            first_byte_ms: None,
            completion_start_ms: None,
            http_status: None,
            metadata: json!({}),
            delivery: None,
        }
    }

    pub fn for_request(
        api_format: ApiFormat,
        context: &ResolvedRequestContext,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Self {
        let started = Instant::now();
        let start_time_unix_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let attribution = context.attribution();
        // Copy only attribution; never retain provider or ingestion credentials.
        // The entire resolver response, including key metadata, is bounded at 256 KiB.
        let key_metadata: Map<String, Value> = attribution
            .key_metadata()
            .iter()
            .map(|(key, value)| {
                let value = match value {
                    MetadataValue::String(value) => Value::String(value.clone()),
                    MetadataValue::Number(value) => Value::Number(value.clone()),
                    MetadataValue::Bool(value) => Value::Bool(*value),
                };
                (key.clone(), value)
            })
            .collect();
        let full = context.ingestion_mode() == IngestionMode::Full;
        let span = tracing::Span::current();
        // Parsing the whole request is CPU-bound and scales with the body.
        let protocol = tracing::info_span!(
            "request.capture",
            otel.kind = "internal",
            http.request.body.size = i64::try_from(body.len()).unwrap_or(i64::MAX)
        )
        .in_scope(|| ProtocolCapture::new(api_format, headers, body, context.ingestion_mode()));
        Self {
            span,
            protocol: Some(protocol),
            started,
            start_time_unix_ms,
            first_byte_ms: None,
            completion_start_ms: None,
            http_status: None,
            metadata: json!({
                "organization_id": attribution.organization_id(),
                "project_id": attribution.project_id(),
                "key_id": attribution.key_id(),
                "provider_connection_id": attribution.provider_connection_id(),
                "key_metadata": key_metadata,
                "ingestion_mode": if full { "full" } else { "usage" },
            }),
            delivery: None,
        }
    }

    pub fn deliver_to(
        &mut self,
        telemetry: telemetry::Telemetry,
        context: &ResolvedRequestContext,
        headers: &HeaderMap,
    ) {
        let client_metadata = self
            .protocol
            .as_ref()
            .and_then(ProtocolCapture::client_metadata);
        self.delivery = Some((
            telemetry,
            telemetry::DeliveryContext::from_resolved(context, headers, client_metadata),
        ));
    }

    pub fn record_response(&mut self, status: u16, headers: &HeaderMap) {
        if let Some(protocol) = &mut self.protocol {
            self.http_status = Some(status);
            protocol.record_response(headers);
        }
    }

    pub fn push_bytes(&mut self, bytes: &[u8]) {
        if let Some(protocol) = &mut self.protocol {
            if !bytes.is_empty() {
                self.first_byte_ms
                    .get_or_insert_with(|| self.started.elapsed().as_millis());
            }
            if protocol.push_bytes(bytes) {
                self.completion_start_ms
                    .get_or_insert_with(|| self.started.elapsed().as_millis());
            }
        }
    }

    pub fn end_body(&mut self) {
        if let Some(protocol) = &mut self.protocol {
            protocol.end_body();
        }
    }

    pub fn finish(&mut self, outcome: RelayOutcome) {
        let span = self.span.clone();
        let _entered = span.enter();
        let Some(protocol) = self.protocol.take() else {
            return;
        };
        let (api_format, inference) = protocol.into_facts();
        let facts = InferenceFacts {
            api_format,
            start_time_unix_ms: self.start_time_unix_ms,
            duration_ms: self.started.elapsed().as_millis(),
            first_byte_ms: self.first_byte_ms,
            completion_start_ms: self.completion_start_ms,
            http_status: self.http_status,
            metadata: std::mem::take(&mut self.metadata),
            outcome,
            inference,
        };
        telemetry::debug_record(&facts);
        crate::observability::execution_finished(&facts);
        if let Some((telemetry, context)) = self.delivery.take() {
            telemetry.record(context, facts);
        }
    }
}

impl Drop for ExecutionCapture {
    fn drop(&mut self) {
        self.finish(RelayOutcome::Cancelled);
    }
}

/// Parses a request body for capture, or explains why it was left unparsed.
fn parse_request(headers: &HeaderMap, body: &[u8]) -> Result<Map<String, Value>, InputOmission> {
    let reason = if !identity_encoding(headers) {
        InputOmissionReason::ContentEncoding
    } else if body.len() > MAX_INPUT_CAPTURE_BYTES {
        InputOmissionReason::SizeLimit
    } else if let Ok(Value::Object(request)) = serde_json::from_slice(body) {
        return Ok(request);
    } else {
        InputOmissionReason::InvalidJson
    };
    Err(InputOmission {
        reason,
        body_bytes: body.len(),
    })
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
