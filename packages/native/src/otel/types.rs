//! Rust event data used between OTLP decoding and storage.
//!
//! `OwnedEvent` contains an `OtelStorageRow` plus input, output, metadata and lookup
//! inputs. Payloads remain Rust `Value`s until `OwnedEvent::into_storage` serializes
//! them into row fields.
//!
//! `otel_enrichment::enrich` turns worker lookup results into `EnrichmentResult`.
//! `into_storage` applies that result and the project/timestamp fields supplied by
//! `StorageContext`.

use std::collections::{BTreeMap, HashSet};

use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use indexmap::IndexMap;

use super::attributes::{for_each_javascript_object_entry_owned, javascript_json_stringify};
use super::value::{Object, Value};

/// An owned object map used during normalization.
pub type JsonObject = Object;

/// Fields returned by `otel_enrichment::enrich` and applied by `OwnedEvent::into_storage`.
#[derive(Clone, Debug, Default)]
pub struct EnrichmentResult {
    pub prompt_id: Option<String>,
    pub model_id: Option<String>,
    pub usage_details: IndexMap<String, Value>,
    pub cost_details: BTreeMap<String, Value>,
    pub usage_pricing_tier_id: Option<String>,
    pub usage_pricing_tier_name: Option<String>,
    pub skills_available: Vec<crate::native_codec::SkillReference>,
    pub skills_resource_loaded: Vec<crate::native_codec::SkillResourceLoaded>,
}

/// Skill catalog entries before the worker resolves project-local IDs.
#[derive(Clone, Debug)]
pub struct SkillAvailableInput {
    pub name: String,
    pub version: Option<u32>,
}

/// A tool call that loaded a skill resource before project-local resolution.
#[derive(Clone, Debug)]
pub struct SkillResourceInput {
    pub skill_name: String,
    pub file_path: String,
    pub skill_version: Option<u32>,
}

/// Values supplied by the queue/storage adapter at the finalization boundary.
#[derive(Clone, Debug)]
pub struct StorageContext {
    pub blob_storage_file_path: String,
    pub created_at: String,
    pub updated_at: String,
    pub event_ts: String,
}

/// The row stores normalized fields. Input, output and metadata remain `Value`s
/// until `into_storage` serializes them.
#[derive(Clone, Debug)]
pub struct OwnedEvent {
    pub row: crate::native_schema::OtelStorageRow,
    pub prompt_version_lookup: Option<f64>,
    pub model_parameters: Option<Value>,
    pub provided_usage_details: IndexMap<String, Value>,
    pub provided_cost_details: BTreeMap<String, Value>,
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub metadata: JsonObject,
    pub skills_available: Vec<SkillAvailableInput>,
    pub skills_resource_loaded: Vec<SkillResourceInput>,
}

impl std::ops::Deref for OwnedEvent {
    type Target = crate::native_schema::OtelStorageRow;
    fn deref(&self) -> &Self::Target {
        &self.row
    }
}
impl std::ops::DerefMut for OwnedEvent {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.row
    }
}

impl Default for OwnedEvent {
    fn default() -> Self {
        Self {
            row: crate::native_schema::OtelStorageRow {
                event_type: "SPAN".into(),
                environment: "default".into(),
                level: "DEFAULT".into(),
                source: "otel".into(),
                ..Default::default()
            },
            prompt_version_lookup: None,
            model_parameters: None,
            input: None,
            output: None,
            provided_usage_details: IndexMap::new(),
            provided_cost_details: BTreeMap::new(),
            metadata: JsonObject::new(),
            skills_available: Vec::new(),
            skills_resource_loaded: Vec::new(),
        }
    }
}

impl OwnedEvent {
    pub fn into_storage(
        mut self,
        enrichment: EnrichmentResult,
        context: &StorageContext,
    ) -> crate::native_schema::OtelStorageRow {
        let row = &mut self.row;
        row.input = json_storage_string(self.input);
        row.output = json_storage_string(self.output);
        row.model_parameters = json_storage_string(self.model_parameters);
        (row.metadata_names, row.metadata_values) = flatten_object_owned(self.metadata);
        row.provided_usage_details = storage_map(self.provided_usage_details);
        row.provided_cost_details = storage_map(self.provided_cost_details);
        row.prompt_id = enrichment.prompt_id;
        row.model_id = enrichment.model_id;
        row.usage_details = storage_map(enrichment.usage_details);
        row.cost_details = storage_map(enrichment.cost_details);
        row.usage_pricing_tier_id = enrichment.usage_pricing_tier_id;
        row.usage_pricing_tier_name = enrichment.usage_pricing_tier_name;
        row.skills_available = enrichment.skills_available;
        row.skills_resource_loaded = enrichment.skills_resource_loaded;
        row.start_time = to_clickhouse_datetime(&row.start_time);
        row.end_time = to_clickhouse_datetime(&row.end_time);
        row.completion_start_time = row
            .completion_start_time
            .take()
            .map(|time| to_clickhouse_datetime(&time));
        row.created_at = to_clickhouse_datetime(&context.created_at);
        row.updated_at = to_clickhouse_datetime(&context.updated_at);
        row.event_ts = to_clickhouse_datetime(&context.event_ts);
        row.blob_storage_file_path = context.blob_storage_file_path.clone();
        self.row
    }
}

fn storage_map<I>(values: I) -> BTreeMap<String, serde_json::Value>
where
    I: IntoIterator<Item = (String, Value)>,
{
    values
        .into_iter()
        .map(|(key, value)| (key, value.into_serde_lossy()))
        .collect()
}

pub(crate) fn to_clickhouse_datetime(value: &str) -> String {
    if value.as_bytes().get(10) == Some(&b' ') {
        return value.to_owned();
    }
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value) {
        return parsed
            .with_timezone(&Utc)
            .to_rfc3339_opts(SecondsFormat::Millis, true)
            .replace('T', " ")
            .trim_end_matches('Z')
            .to_owned();
    }
    if let Ok(parsed) = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f") {
        return parsed.format("%Y-%m-%d %H:%M:%S%.3f").to_string();
    }
    value.to_owned()
}

/// Flatten metadata while consuming the event so keys and leaf strings can be moved.
pub(crate) fn flatten_object_owned(value: JsonObject) -> (Vec<String>, Vec<String>) {
    fn walk(
        prefix: String,
        identity: Vec<u8>,
        value: Value,
        names: &mut Vec<String>,
        values: &mut Vec<String>,
        seen: &mut HashSet<Vec<u8>>,
    ) {
        match value {
            Value::Object(object) => {
                for_each_javascript_object_entry_owned(object, |key, value| {
                    let path = if prefix.is_empty() {
                        key.as_str().to_owned()
                    } else {
                        format!("{prefix}.{}", key.as_str())
                    };
                    let mut child_identity = identity.clone();
                    if !child_identity.is_empty() {
                        child_identity.push(b'.');
                    }
                    child_identity.extend_from_slice(key.as_bytes());
                    walk(path, child_identity, value, names, values, seen);
                });
            }
            value => {
                if seen.insert(identity) {
                    names.push(prefix);
                    values.push(stringify_value_owned(value));
                }
            }
        }
    }

    let mut names = Vec::new();
    let mut values = Vec::new();
    let mut seen = HashSet::new();
    for_each_javascript_object_entry_owned(value, |key, value| {
        walk(
            key.as_str().to_owned(),
            key.as_bytes().to_vec(),
            value,
            &mut names,
            &mut values,
            &mut seen,
        );
    });
    (names, values)
}

pub(crate) fn stringify_value_owned(value: Value) -> String {
    match value {
        Value::String(value) => value.into_utf8_lossy(),
        Value::Null => String::new(),
        value => javascript_json_stringify(&value),
    }
}

pub(crate) fn json_storage_string(value: Option<Value>) -> Option<String> {
    value.and_then(|value| match value {
        Value::Null => None,
        Value::String(value) => Some(value.into_utf8_lossy()),
        value => Some(javascript_json_stringify(&value)),
    })
}

#[cfg(test)]
mod tests {
    use crate::otel::value::{json, Value};

    use super::to_clickhouse_datetime;
    use super::{flatten_object_owned, json_storage_string, JsonObject};

    #[test]
    fn storage_strings_omit_null_but_preserve_literal_null() {
        assert_eq!(json_storage_string(Some(Value::Null)), None);
        assert_eq!(
            json_storage_string(Some(json!("null"))),
            Some("null".to_owned())
        );
    }

    #[test]
    fn storage_timestamps_match_clickhouse_json_shape() {
        assert_eq!(
            to_clickhouse_datetime("2026-07-22T00:00:00.123Z"),
            "2026-07-22 00:00:00.123"
        );
        assert_eq!(
            to_clickhouse_datetime("2026-07-22 00:00:00.123"),
            "2026-07-22 00:00:00.123"
        );
    }

    #[test]
    fn flattening_uses_javascript_integer_key_order() {
        let mut metadata = JsonObject::new();
        metadata.insert("resource".into(), json!({"nested": "resource"}));
        metadata.insert("0".into(), json!("zero"));
        metadata.insert(
            "outer".into(),
            json!({"2": "two", "1": "one", "name": "name"}),
        );

        let expected_names = ["0", "resource.nested", "outer.1", "outer.2", "outer.name"];
        let (owned_names, owned_values) = flatten_object_owned(metadata);

        assert_eq!(owned_names, expected_names);
        assert_eq!(owned_values, ["zero", "resource", "one", "two", "name"]);
    }

    #[test]
    fn flattening_keeps_the_first_colliding_path_and_its_order() {
        let mut literal_first = JsonObject::new();
        literal_first.insert("db.host".into(), json!("literal"));
        literal_first.insert("env".into(), json!("prod"));
        literal_first.insert("db".into(), json!({"host": "nested", "port": 5432}));
        let (names, values) = flatten_object_owned(literal_first);
        assert_eq!(names, ["db.host", "env", "db.port"]);
        assert_eq!(values, ["literal", "prod", "5432"]);

        let mut nested_first = JsonObject::new();
        nested_first.insert("db".into(), json!({"host": "nested", "port": 5432}));
        nested_first.insert("env".into(), json!("prod"));
        nested_first.insert("db.host".into(), json!("literal"));
        let (names, values) = flatten_object_owned(nested_first);
        assert_eq!(names, ["db.host", "db.port", "env"]);
        assert_eq!(values, ["nested", "5432", "prod"]);
    }
}
