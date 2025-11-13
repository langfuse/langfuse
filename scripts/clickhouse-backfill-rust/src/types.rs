use chrono::{DateTime, NaiveDate, Utc};
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use fixnum::{FixedPoint, typenum::U12};

// For Decimal(18, 12) - 12 decimal places
pub type Decimal18_12 = FixedPoint<i64, U12>;

/// Trace-level attributes loaded into memory for enrichment
#[derive(Debug, Clone, Row, Deserialize)]
pub struct TraceAttrs {
    pub project_id: String,
    pub id: String,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub metadata: Vec<(String, String)>,
    pub tags: Vec<String>,
    pub public: bool,
    pub bookmarked: bool,
    pub version: Option<String>,
    pub release: Option<String>,
}

/// Observation record from source table
#[derive(Debug, Clone, Row, Deserialize)]
pub struct Observation {
    pub project_id: String,
    pub id: String,
    pub trace_id: String,
    pub r#type: String,
    pub parent_observation_id: Option<String>,
    pub name: String,
    pub environment: String,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis")]
    pub start_time: DateTime<Utc>,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis::option")]
    pub end_time: Option<DateTime<Utc>>,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis::option")]
    pub completion_start_time: Option<DateTime<Utc>>,
    pub metadata:  Vec<(String, String)>,
    pub level: String,
    pub status_message: Option<String>,
    pub version: Option<String>,
    pub input: Option<String>,
    pub output: Option<String>,
    pub internal_model_id: Option<String>,
    pub provided_model_name: Option<String>,
    pub model_parameters: Option<String>,
    pub provided_usage_details:  Vec<(String, u64)>,
    pub usage_details:  Vec<(String, u64)>,
    pub provided_cost_details: Vec<(String, Decimal18_12)>,
    pub cost_details: Vec<(String, Decimal18_12)>,
    pub prompt_id: Option<String>,
    pub prompt_name: Option<String>,
    pub prompt_version: Option<u16>,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis")]
    pub updated_at: DateTime<Utc>,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis")]
    pub event_ts: DateTime<Utc>,
    pub is_deleted: u8,
}

/// Event record for target table
#[derive(Debug, Clone, Row, Serialize)]
pub struct Event {
    pub project_id: String,
    pub trace_id: String,
    pub span_id: String,
    pub parent_span_id: String,
    pub name: String,
    pub r#type: String,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis")]
    pub start_time: DateTime<Utc>,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis::option")]
    pub end_time: Option<DateTime<Utc>>,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis::option")]
    pub completion_start_time: Option<DateTime<Utc>>,
    pub metadata: String,
    pub metadata_names: Vec<String>,
    pub metadata_raw_values: Vec<String>,
    pub tags: Vec<String>,
    pub level: String,
    pub status_message: String,
    pub version: String,
    pub user_id: String,
    pub session_id: String,
    pub prompt_id: String,
    pub prompt_name: String,
    pub prompt_version: Option<u16>,
    pub model_id: String,
    pub provided_model_name: String,
    pub model_parameters: String,
    pub provided_usage_details: Vec<(String, u64)>,
    pub usage_details: Vec<(String, u64)>,
    pub provided_cost_details: Vec<(String, Decimal18_12)>,
    pub cost_details: Vec<(String, Decimal18_12)>,
    pub input: String,
    pub output: String,
    pub environment: String,
    pub release: String,
    pub public: bool,
    pub bookmarked: bool,
    pub source: String,
    pub service_name: String,
    pub service_version: String,
    pub scope_name: String,
    pub scope_version: String,
    pub telemetry_sdk_name: String,
    pub telemetry_sdk_language: String,
    pub telemetry_sdk_version: String,
    pub experiment_id: String,
    pub experiment_name: String,
    pub experiment_metadata_names: Vec<String>,
    pub experiment_metadata_values: Vec<String>,
    pub experiment_description: String,
    pub experiment_dataset_id: String,
    pub experiment_item_id: String,
    pub experiment_item_expected_output: String,
    pub experiment_item_metadata_names: Vec<String>,
    pub experiment_item_metadata_values: Vec<String>,
    pub experiment_item_root_span_id: String,
    pub blob_storage_file_path: String,
    pub event_bytes: u64,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis")]
    pub updated_at: DateTime<Utc>,
    #[serde(with = "clickhouse::serde::chrono::datetime64::millis")]
    pub event_ts: DateTime<Utc>,
    pub is_deleted: u8,
}

/// Cursor for resumable streaming
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Cursor {
    pub project_id: String,
    pub r#type: String,
    pub date: NaiveDate,
    pub id: String,
}

impl Cursor {
    pub fn new(project_id: String, r#type: String, date: NaiveDate, id: String) -> Self {
        Self {
            project_id,
            r#type,
            date,
            id,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.project_id.is_empty() && self.r#type.is_empty() && self.id.is_empty()
    }
}

/// Checkpoint state persisted to disk
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CheckpointState {
    pub partition: String,
    pub cursor: Cursor,
    pub rows_processed: u64,
    pub last_updated: DateTime<Utc>,
}

/// Helper function to extract metadata names and raw values
pub fn extract_metadata_arrays(metadata: &JsonValue) -> (Vec<String>, Vec<String>) {
    match metadata {
        JsonValue::Object(map) => {
            let mut names = Vec::new();
            let mut values = Vec::new();
            for (key, value) in map.iter() {
                names.push(key.clone());
                values.push(value.to_string());
            }
            (names, values)
        }
        _ => (Vec::new(), Vec::new()),
    }
}
