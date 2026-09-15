//! Owned facts at the capture/telemetry boundary. Content and usage remain native JSON.
use serde::Serialize;
use serde_json::{Map, Value};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum RelayOutcome {
    Eof,
    Cancelled,
    Timeout,
    TransportError,
}

#[derive(Serialize)]
pub(crate) struct InferenceFacts {
    pub api_format: &'static str,
    pub start_time_unix_ms: u128,
    pub duration_ms: u128,
    pub first_byte_ms: Option<u128>,
    pub http_status: Option<u16>,
    pub metadata: Value,
    pub outcome: RelayOutcome,
    #[serde(flatten)]
    pub inference: ProviderFacts,
}

/// Provider adapters fill this common envelope without translating native payloads.
#[derive(Default, Serialize)]
pub(crate) struct ProviderFacts {
    pub model: Option<String>,
    pub requested_model: Option<String>,
    pub model_parameters: Map<String, Value>,
    pub usage_details: Option<Value>,
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub provider_response_id: Option<String>,
    pub provider_request_id: Option<String>,
    pub provider_status: Option<String>,
    pub input_complete: bool,
    pub output_complete: bool,
    pub capture_complete: bool,
}
