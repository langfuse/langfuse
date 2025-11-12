use chrono::{DateTime, NaiveDate, Utc};
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;

/// Trace-level attributes loaded into memory for enrichment
#[derive(Debug, Clone, Row, Deserialize)]
pub struct TraceAttrs {
    pub project_id: String,
    pub id: String,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub metadata: Vec<(String, String)>,
    pub tags: Vec<String>,
    pub public: u8,
    pub bookmarked: u8,
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
    pub name: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub completion_start_time: Option<DateTime<Utc>>,
    pub metadata: Option<String>,
    pub level: Option<String>,
    pub status_message: Option<String>,
    pub version: Option<String>,
    pub input: Option<String>,
    pub output: Option<String>,
    pub internal_model_id: Option<String>,
    pub provided_model_name: Option<String>,
    pub model_parameters: Option<String>,
    pub provided_usage_details: Option<String>,
    pub usage_details: Option<String>,
    pub provided_cost_details: Option<String>,
    pub cost_details: Option<String>,
    pub prompt_id: Option<String>,
    pub prompt_name: Option<String>,
    pub prompt_version: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub completion_start_time: Option<DateTime<Utc>>,
    pub metadata: Option<String>,
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
    pub prompt_version: i32,
    pub model_id: String,
    pub provided_model_name: String,
    pub model_parameters: String,
    pub provided_usage_details: String,
    pub usage_details: String,
    pub provided_cost_details: String,
    pub cost_details: String,
    pub input: String,
    pub output: String,
    pub environment: String,
    pub release: String,
    pub public: u8,
    pub bookmarked: u8,
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
    pub experiment_metadata: String,
    pub experiment_metadata_names: Vec<String>,
    pub experiment_metadata_raw_values: Vec<String>,
    pub experiment_item_id: String,
    pub experiment_item_metadata: String,
    pub experiment_item_metadata_names: Vec<String>,
    pub experiment_item_metadata_raw_values: Vec<String>,
    pub experiment_run_id: String,
    pub experiment_run_name: String,
    pub experiment_run_metadata: String,
    pub experiment_run_metadata_names: Vec<String>,
    pub experiment_run_metadata_raw_values: Vec<String>,
    pub blob_storage_file_path: String,
    pub event_bytes: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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

/// Helper function to parse JSON string to HashMap
pub fn parse_json_to_map(json_str: Option<&str>) -> HashMap<String, JsonValue> {
    json_str
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default()
}

// /// Helper function to parse JSON string to Value
// pub fn parse_json_to_value(json_str: Option<&str>) -> Option<JsonValue> {
//     json_str.and_then(|s| serde_json::from_str(s).ok())
// }

// /// Helper function to convert HashMap to JSON string
// pub fn map_to_json_string(map: &HashMap<String, JsonValue>) -> String {
//     serde_json::to_string(map).unwrap_or_else(|_| "{}".to_string())
// }

/// Helper function to extract metadata names and raw values
pub fn extract_metadata_arrays(metadata: &Option<JsonValue>) -> (Vec<String>, Vec<String>) {
    match metadata {
        Some(JsonValue::Object(map)) => {
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
