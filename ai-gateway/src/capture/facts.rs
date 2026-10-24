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

impl RelayOutcome {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Eof => "eof",
            Self::Cancelled => "cancelled",
            Self::Timeout => "timeout",
            Self::TransportError => "transport_error",
        }
    }

    /// A cancellation is the caller hanging up, so it is not a failure.
    pub(crate) fn is_failure(self) -> bool {
        matches!(self, Self::Timeout | Self::TransportError)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum InputOmissionReason {
    SizeLimit,
    ContentEncoding,
    InvalidJson,
    RecordLimit,
    TelemetryBuffer,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct InputOmission {
    pub reason: InputOmissionReason,
    pub body_bytes: usize,
}

#[derive(Serialize)]
pub(crate) struct InferenceFacts {
    pub api_format: &'static str,
    pub start_time_unix_ms: u128,
    pub duration_ms: u128,
    pub first_byte_ms: Option<u128>,
    pub completion_start_ms: Option<u128>,
    pub http_status: Option<u16>,
    /// Seconds from the provider's `Retry-After` header, in milliseconds.
    pub retry_after_ms: Option<u64>,
    /// The model the gateway sent upstream, after resolving the caller's alias.
    pub upstream_model: Option<String>,
    pub request_body_bytes: usize,
    /// Provider response body bytes relayed to the caller.
    pub response_body_bytes: u64,
    pub metadata: Value,
    pub outcome: RelayOutcome,
    #[serde(flatten)]
    pub inference: ProviderFacts,
}

/// Provider adapters fill this common envelope without translating native payloads.
#[derive(Default, Serialize)]
pub(crate) struct ProviderFacts {
    /// The model the provider reported in its response.
    pub model: Option<String>,
    /// The model the caller sent in the request body.
    pub requested_model: Option<String>,
    pub model_parameters: Map<String, Value>,
    pub request_metadata: Map<String, Value>,
    pub error_message: Option<String>,
    pub usage_details: Option<Value>,
    pub input: Option<Value>,
    pub input_omission: Option<InputOmission>,
    pub output: Option<Value>,
    pub provider_response_id: Option<String>,
    pub provider_request_id: Option<String>,
    pub provider_status: Option<String>,
    pub input_complete: bool,
    pub output_complete: bool,
    pub capture_complete: bool,
}
