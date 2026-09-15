//! Best-effort capture around the existing relay lifecycle.
mod facts;
mod openai_responses;
mod sse;

use std::time::{SystemTime, UNIX_EPOCH};

use axum::http::{HeaderMap, header};
use serde_json::{Map, Value, json};
use tokio::time::Instant;

use crate::{
    resolution::{IngestionMode, MetadataValue, ResolvedRequestContext},
    telemetry,
};
use facts::ProviderFacts;
pub(crate) use facts::{InferenceFacts, RelayOutcome};
use openai_responses::OpenAiResponsesCapture;

const MAX_CAPTURE_BYTES: usize = 1024 * 1024;
const MAX_ITEMS: usize = 256;
const MAX_FACT_STRING: usize = 512;

/// Add another adapter here when another API is supported; the relay stays shared.
enum ProtocolCapture {
    OpenAiResponses(OpenAiResponsesCapture),
}

impl ProtocolCapture {
    fn response(&mut self, headers: &HeaderMap) {
        match self {
            Self::OpenAiResponses(capture) => capture.response(headers),
        }
    }

    fn bytes(&mut self, bytes: &[u8]) {
        match self {
            Self::OpenAiResponses(capture) => capture.bytes(bytes),
        }
    }

    fn end_body(&mut self) {
        match self {
            Self::OpenAiResponses(capture) => capture.end_body(),
        }
    }

    fn into_facts(self) -> (&'static str, ProviderFacts) {
        match self {
            Self::OpenAiResponses(capture) => ("openai.responses", capture.into_facts()),
        }
    }
}

/// Owned before dispatch and moved into the response body. Drop also covers a
/// cancelled provider future before response headers have arrived.
pub(crate) struct ExecutionCapture {
    protocol: Option<ProtocolCapture>,
    started: Instant,
    start_time_unix_ms: u128,
    first_byte_ms: Option<u128>,
    http_status: Option<u16>,
    metadata: Value,
}

impl ExecutionCapture {
    pub fn openai_responses(
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
        Self {
            protocol: Some(ProtocolCapture::OpenAiResponses(
                OpenAiResponsesCapture::new(headers, body, context.ingestion_mode()),
            )),
            started,
            start_time_unix_ms,
            first_byte_ms: None,
            http_status: None,
            metadata: json!({
                "organization_id": attribution.organization_id(),
                "project_id": attribution.project_id(),
                "key_id": attribution.key_id(),
                "provider_connection_id": attribution.provider_connection_id(),
                "key_metadata": key_metadata,
                "ingestion_mode": if full { "full" } else { "usage" },
            }),
        }
    }

    pub fn response(&mut self, status: u16, headers: &HeaderMap) {
        if let Some(protocol) = &mut self.protocol {
            self.http_status = Some(status);
            protocol.response(headers);
        }
    }

    pub fn bytes(&mut self, bytes: &[u8]) {
        if let Some(protocol) = &mut self.protocol {
            if !bytes.is_empty() {
                self.first_byte_ms
                    .get_or_insert_with(|| self.started.elapsed().as_millis());
            }
            protocol.bytes(bytes);
        }
    }

    pub fn end_body(&mut self) {
        if let Some(protocol) = &mut self.protocol {
            protocol.end_body();
        }
    }

    pub fn finish(&mut self, outcome: RelayOutcome) {
        let Some(protocol) = self.protocol.take() else {
            return;
        };
        let (api_format, inference) = protocol.into_facts();
        telemetry::record(InferenceFacts {
            api_format,
            start_time_unix_ms: self.start_time_unix_ms,
            duration_ms: self.started.elapsed().as_millis(),
            first_byte_ms: self.first_byte_ms,
            http_status: self.http_status,
            metadata: std::mem::take(&mut self.metadata),
            outcome,
            inference,
        });
    }
}

impl Drop for ExecutionCapture {
    fn drop(&mut self) {
        self.finish(RelayOutcome::Cancelled);
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
