//! The output row: same column set sql/transform-v2.sql inserts, minus
//! event_ts (left to the column DEFAULT now64(6), the SQL writes the same).
//! Field names are the column names on the wire; DateTime64(6) travels as
//! microsecond ticks, Map as key/value pairs, the manifest as tuples.

use clickhouse::Row;
use serde::Serialize;

/// One media_manifest entry: (media_id, content_type, field, byte_offset, byte_length).
pub type MediaRef = (String, String, String, u32, u32);

#[derive(Row, Serialize)]
pub struct EventRow {
    pub project_id: String,
    pub trace_id: String,
    pub span_id: String,
    pub parent_span_id: String,
    pub start_time: i64,       // DateTime64(6)
    pub end_time: Option<i64>, // Nullable(DateTime64(6))
    pub name: String,
    #[serde(rename = "type")]
    pub observation_type: String,
    pub environment: String,
    pub version: String,
    pub release: String,
    pub trace_name: String,
    pub user_id: String,
    pub session_id: String,
    pub level: String,
    pub status_message: String,
    pub prompt_name: String,
    pub prompt_version: Option<u16>,
    pub provided_model_name: String,
    pub provided_usage_details: Vec<(String, u64)>, // Map(LowCardinality(String), UInt64)
    pub usage_details: Vec<(String, u64)>,
    pub input: String,
    pub output: String,
    pub metadata_names: Vec<String>,
    pub metadata_values: Vec<String>,
    pub source: String,
    pub service_name: String,
    pub service_version: String,
    pub scope_name: String,
    pub scope_version: String,
    pub telemetry_sdk_language: String,
    pub telemetry_sdk_name: String,
    pub telemetry_sdk_version: String,
    pub blob_storage_file_path: String,
    pub event_bytes: u64,
    pub span_kind: u8,
    pub has_media: u8,
    pub media_manifest: Vec<MediaRef>,
}
