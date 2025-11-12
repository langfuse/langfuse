use anyhow::Result;
use dashmap::DashMap;
use serde_json::{json, Value as JsonValue};
use std::collections::HashMap;
use std::sync::Arc;

use crate::types::{Event, Observation, TraceAttrs, extract_metadata_arrays, parse_json_to_map};

/// Transform an observation into an event with trace enrichment
pub fn transform_observation_to_event(
    obs: &Observation,
    trace_attrs_map: &Arc<DashMap<(String, String), TraceAttrs>>,
) -> Result<Event> {
    let trace_key = (obs.project_id.clone(), obs.trace_id.clone());

    // Get trace attributes if available
    let trace_attrs = trace_attrs_map.get(&trace_key);

    // Calculate parent_span_id
    let parent_span_id = calculate_parent_span_id(&obs.id, &obs.trace_id, &obs.parent_observation_id);

    // Determine if this is a root observation (no parent)
    let is_root = obs.parent_observation_id.is_none();

    // Get bookmarked status (only for root observations)
    let bookmarked = if is_root {
        trace_attrs.as_ref().map(|t| t.bookmarked).unwrap_or(0)
    } else {
        0
    };

    // Merge metadata: observation metadata + trace metadata
    let merged_metadata = merge_metadata(&obs.metadata, trace_attrs.as_ref().map(|v| &**v));

    // Detect source
    let source = detect_source(&merged_metadata);

    // Extract metadata arrays
    let (metadata_names, metadata_raw_values) = extract_metadata_arrays(&merged_metadata);

    // Parse usage and cost details from JSON strings to Maps
    let provided_usage_details = parse_json_to_map(obs.provided_usage_details.as_deref());
    let usage_details = parse_json_to_map(obs.usage_details.as_deref());
    let provided_cost_details = parse_json_to_map(obs.provided_cost_details.as_deref());
    let cost_details = parse_json_to_map(obs.cost_details.as_deref());

    // Serialize maps to JSON strings for Map columns
    let provided_usage_details_str = serde_json::to_string(&provided_usage_details)?;
    let usage_details_str = serde_json::to_string(&usage_details)?;
    let provided_cost_details_str = serde_json::to_string(&provided_cost_details)?;
    let cost_details_str = serde_json::to_string(&cost_details)?;

    // Build the event
    let event = Event {
        project_id: obs.project_id.clone(),
        trace_id: obs.trace_id.clone(),
        span_id: obs.id.clone(),
        parent_span_id,
        name: obs.name.clone().unwrap_or_default(),
        r#type: obs.r#type.clone(),
        start_time: obs.start_time,
        end_time: obs.end_time,
        completion_start_time: obs.completion_start_time,
        metadata: merged_metadata.as_ref().map(|m| m.to_string()),
        metadata_names,
        metadata_raw_values,
        tags: trace_attrs.as_ref().map(|t| t.tags.clone()).unwrap_or_default(),
        level: obs.level.clone().unwrap_or_default(),
        status_message: obs.status_message.clone().unwrap_or_default(),
        version: obs.version.clone().unwrap_or_default(),
        user_id: trace_attrs.as_ref().and_then(|t| t.user_id.clone()).unwrap_or_default(),
        session_id: trace_attrs.as_ref().and_then(|t| t.session_id.clone()).unwrap_or_default(),
        prompt_id: obs.prompt_id.clone().unwrap_or_default(),
        prompt_name: obs.prompt_name.clone().unwrap_or_default(),
        prompt_version: obs.prompt_version.unwrap_or(0),
        model_id: obs.internal_model_id.clone().unwrap_or_default(),
        provided_model_name: obs.provided_model_name.clone().unwrap_or_default(),
        model_parameters: obs.model_parameters.clone().unwrap_or_default(),
        provided_usage_details: provided_usage_details_str,
        usage_details: usage_details_str,
        provided_cost_details: provided_cost_details_str,
        cost_details: cost_details_str,
        input: obs.input.clone().unwrap_or_default(),
        output: obs.output.clone().unwrap_or_default(),
        environment: String::new(), // Not in observations table
        release: trace_attrs.as_ref().and_then(|t| t.release.clone()).unwrap_or_default(),
        public: trace_attrs.as_ref().map(|t| t.public).unwrap_or(0),
        bookmarked,
        source,
        service_name: String::new(),
        service_version: String::new(),
        scope_name: String::new(),
        scope_version: String::new(),
        telemetry_sdk_name: String::new(),
        telemetry_sdk_language: String::new(),
        telemetry_sdk_version: String::new(),
        experiment_id: String::new(),
        experiment_name: String::new(),
        experiment_metadata: String::new(),
        experiment_metadata_names: Vec::new(),
        experiment_metadata_raw_values: Vec::new(),
        experiment_item_id: String::new(),
        experiment_item_metadata: String::new(),
        experiment_item_metadata_names: Vec::new(),
        experiment_item_metadata_raw_values: Vec::new(),
        experiment_run_id: String::new(),
        experiment_run_name: String::new(),
        experiment_run_metadata: String::new(),
        experiment_run_metadata_names: Vec::new(),
        experiment_run_metadata_raw_values: Vec::new(),
        blob_storage_file_path: String::new(),
        event_bytes: 0,
        created_at: obs.created_at,
        updated_at: obs.updated_at,
        event_ts: obs.event_ts,
        is_deleted: obs.is_deleted,
    };

    Ok(event)
}

/// Calculate parent_span_id from observation relationships
fn calculate_parent_span_id(obs_id: &str, trace_id: &str, parent_observation_id: &Option<String>) -> String {
    // If this is a root observation (id == "t-{trace_id}"), parent is empty
    if obs_id == format!("t-{}", trace_id) {
        return String::new();
    }

    // If there's a parent_observation_id, use it; otherwise use "t-{trace_id}"
    parent_observation_id
        .clone()
        .unwrap_or_else(|| format!("t-{}", trace_id))
}

/// Merge observation metadata with trace metadata
fn merge_metadata(obs_metadata_str: &Option<String>, trace_attrs: Option<&TraceAttrs>) -> Option<JsonValue> {
    let mut merged: HashMap<String, JsonValue> = HashMap::new();

    // Start with trace metadata if available (Vec<(String, String)> from ClickHouse)
    if let Some(attrs) = trace_attrs {
        if !attrs.metadata.is_empty() {
            for (k, v) in &attrs.metadata {
                // Parse the string value as JSON if possible, otherwise keep as string
                let json_val = serde_json::from_str(v).unwrap_or_else(|_| JsonValue::String(v.clone()));
                merged.insert(k.clone(), json_val);
            }
        }
    }

    // Overlay observation metadata (takes precedence)
    if let Some(obs_meta_str) = obs_metadata_str {
        if let Ok(obs_meta) = serde_json::from_str::<JsonValue>(obs_meta_str) {
            if let Some(obj) = obs_meta.as_object() {
                for (k, v) in obj.iter() {
                    merged.insert(k.clone(), v.clone());
                }
            }
        }
    }

    if merged.is_empty() {
        None
    } else {
        Some(json!(merged))
    }
}

/// Detect ingestion source (otel vs ingestion-api)
fn detect_source(metadata: &Option<JsonValue>) -> String {
    if let Some(meta) = metadata {
        if let Some(obj) = meta.as_object() {
            if obj.contains_key("resourceAttributes") {
                return "otel".to_string();
            }
        }
    }
    "ingestion-api".to_string()
}

/// Transform a batch of observations to events in parallel
pub fn transform_batch(
    observations: Vec<Observation>,
    trace_attrs_map: &Arc<DashMap<(String, String), TraceAttrs>>,
) -> Result<Vec<Event>> {
    observations
        .iter()
        .map(|obs| transform_observation_to_event(obs, trace_attrs_map))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_calculate_parent_span_id() {
        // Root observation
        let parent = calculate_parent_span_id("t-trace123", "trace123", &None);
        assert_eq!(parent, "");

        // Non-root with parent
        let parent = calculate_parent_span_id("obs-456", "trace123", &Some("obs-123".to_string()));
        assert_eq!(parent, "obs-123");

        // Non-root without parent (should default to trace root)
        let parent = calculate_parent_span_id("obs-456", "trace123", &None);
        assert_eq!(parent, "t-trace123");
    }

    #[test]
    fn test_detect_source() {
        // With resourceAttributes
        let meta = Some(json!({
            "resourceAttributes": {}
        }));
        assert_eq!(detect_source(&meta), "otel");

        // Without resourceAttributes
        let meta = Some(json!({
            "foo": "bar"
        }));
        assert_eq!(detect_source(&meta), "ingestion-api");

        // No metadata
        assert_eq!(detect_source(&None), "ingestion-api");
    }

    #[test]
    fn test_merge_metadata() {
        let metadata_vec = vec![
            ("trace_key".to_string(), "trace_value".to_string()),
            ("shared_key".to_string(), "from_trace".to_string()),
        ];

        let trace_attrs = TraceAttrs {
            project_id: "p1".to_string(),
            id: "t1".to_string(),
            user_id: None,
            session_id: None,
            metadata: metadata_vec,
            tags: vec![],
            public: 0,
            bookmarked: 0,
            release: None,
        };

        let obs_metadata = Some(r#"{"obs_key": "obs_value", "shared_key": "from_obs"}"#.to_string());

        let merged = merge_metadata(&obs_metadata, Some(&trace_attrs));

        assert!(merged.is_some());
        let obj = merged.unwrap();
        assert_eq!(obj["trace_key"], "trace_value");
        assert_eq!(obj["obs_key"], "obs_value");
        assert_eq!(obj["shared_key"], "from_obs"); // Observation takes precedence
    }
}
