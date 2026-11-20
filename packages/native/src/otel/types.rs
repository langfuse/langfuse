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

use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, SecondsFormat, TimeDelta, Utc};
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
    /// Preserve pre-storage types so the worker can reject invalid evaluation fields.
    pub evaluation_fields: Option<Box<JsonObject>>,
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
            evaluation_fields: None,
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
        // An empty string stands for a provided value that could not be read; it becomes the
        // row's creation time.
        row.completion_start_time = row.completion_start_time.take().map(|time| {
            to_clickhouse_datetime(if time.is_empty() {
                &context.created_at
            } else {
                &time
            })
        });
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
    // Accepted date-only timestamps denote UTC midnight; DateTime64 needs the time component.
    if let Ok(parsed) = NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        return parsed.format("%Y-%m-%d 00:00:00.000").to_string();
    }
    value.to_owned()
}

/// Reads an ISO 8601 datetime, with `T` or a space, as a UTC instant and returns it as a
/// ClickHouse datetime, or `None` when it cannot be read. This mirrors what
/// `toClickhouseDateTime` in `packages/shared/src/server/clickhouse/client.ts` does with ISO
/// strings; change both together.
///
/// The shape is `YYYY-MM-DD`, optionally `T` or a space and `HH:MM[:SS[.fraction]]`, optionally
/// `Z` or `±HH[:MM]`. Without an offset the fields are UTC. A day past the end of its month and
/// `24:00:00` roll forward; any other field out of range is unreadable. A string that already is
/// a ClickHouse datetime naming a real time is returned as written; everything else is returned
/// with milliseconds. The result is within years 0001 to 9999.
pub(crate) fn read_datetime_string(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let is = |index: usize, byte: u8| bytes.get(index) == Some(&byte);
    let two_digits = |index: usize| two_ascii_digits(bytes.get(index..index + 2)?);

    let year = two_digits(0)? * 100 + two_digits(2)?;
    let (month, day) = (two_digits(5)?, two_digits(8)?);
    if !is(4, b'-') || !is(7, b'-') {
        return None;
    }
    // Everything up to `end` has been checked to be ASCII, so it is a valid place to slice.
    let (mut hour, mut minute, mut second, mut fraction, mut end) = (0, 0, 0, "", 10);
    let has_separator = matches!(bytes.get(10), Some(b'T' | b't' | b' '));
    if let (true, Some(hours), true, Some(minutes)) =
        (has_separator, two_digits(11), is(13, b':'), two_digits(14))
    {
        (hour, minute, end) = (hours, minutes, 16);
        if let (true, Some(seconds)) = (is(16, b':'), two_digits(17)) {
            (second, end) = (seconds, 19);
            let digits = bytes.get(20..).map_or(0, |rest| {
                rest.iter().take_while(|byte| byte.is_ascii_digit()).count()
            });
            if is(19, b'.') && digits > 0 {
                (fraction, end) = (&value[20..20 + digits], 20 + digits);
            }
        }
    }
    let zone = &value[end..];
    let offset_minutes = match zone.strip_prefix(' ').unwrap_or(zone).as_bytes() {
        [] | [b'Z' | b'z'] => 0,
        [sign @ (b'+' | b'-'), offset @ ..] => {
            let minutes = offset.get(2..)?;
            let minutes = minutes.strip_prefix(b":").unwrap_or(minutes);
            let hours = two_ascii_digits(&offset[..2])?;
            let minutes = if minutes.is_empty() {
                0
            } else {
                two_ascii_digits(minutes)?
            };
            if hours > 23 || minutes > 59 {
                return None;
            }
            (if *sign == b'-' { -1 } else { 1 }) * (hours * 60 + minutes)
        }
        _ => return None,
    };

    let is_end_of_day =
        hour == 24 && minute == 0 && second == 0 && fraction.bytes().all(|digit| digit == b'0');
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || (hour > 23 && !is_end_of_day)
        || minute > 59
        || second > 59
    {
        return None;
    }
    let first_of_month = NaiveDate::from_ymd_opt(year as i32, month as u32, 1)?;
    let is_clickhouse_datetime = value.len() == end
        && end >= 19
        && year > 0
        && is(10, b' ')
        && fraction.len() <= 9
        && hour < 24
        && first_of_month.with_day(day as u32).is_some();
    if is_clickhouse_datetime {
        return Some(value.to_owned());
    }
    // Counting from the first of the month rolls a day such as February 30 forward.
    let seconds = (day - 1) * 86_400 + hour * 3_600 + (minute - offset_minutes) * 60 + second;
    let instant = first_of_month
        .and_hms_opt(0, 0, 0)?
        .checked_add_signed(TimeDelta::try_seconds(seconds)?)?;
    if !(1..=9999).contains(&instant.year()) {
        return None;
    }
    let milliseconds: String = fraction.chars().chain("000".chars()).take(3).collect();
    Some(format!(
        "{}.{milliseconds}",
        instant.format("%Y-%m-%d %H:%M:%S")
    ))
}

fn two_ascii_digits(digits: &[u8]) -> Option<i64> {
    match digits {
        [tens, ones] if tens.is_ascii_digit() && ones.is_ascii_digit() => {
            Some(i64::from(tens - b'0') * 10 + i64::from(ones - b'0'))
        }
        _ => None,
    }
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

    use super::{flatten_object_owned, json_storage_string, JsonObject};
    use super::{read_datetime_string, to_clickhouse_datetime};

    #[test]
    fn storage_strings_omit_null_but_preserve_literal_null() {
        assert_eq!(json_storage_string(Some(Value::Null)), None);
        assert_eq!(
            json_storage_string(Some(json!("null"))),
            Some("null".to_owned())
        );
    }

    /// The ISO examples of `client.datetime.test.ts` in `packages/shared`.
    #[test]
    fn iso_datetime_strings_are_read_like_the_typescript_helper() {
        for (value, expected) in [
            (
                "2024-11-06 20:37:00.123456",
                Some("2024-11-06 20:37:00.123456"),
            ),
            (
                "2024-02-29 23:59:59.123456",
                Some("2024-02-29 23:59:59.123456"),
            ),
            ("2024-11-06T20:37:00.123Z", Some("2024-11-06 20:37:00.123")),
            (
                "2024-11-06T22:37:00.123456+02:00",
                Some("2024-11-06 20:37:00.123"),
            ),
            (
                "2024-11-06 22:37:00.123456+02:00",
                Some("2024-11-06 20:37:00.123"),
            ),
            ("2024-11-06 15:07:00-0530", Some("2024-11-06 20:37:00.000")),
            ("2024-11-06 20:37", Some("2024-11-06 20:37:00.000")),
            ("2024-11-06", Some("2024-11-06 00:00:00.000")),
            ("2024-02-30 12:00:00", Some("2024-03-01 12:00:00.000")),
            ("2023-02-29T12:00:00Z", Some("2023-03-01 12:00:00.000")),
            ("2024-11-06 24:00:00", Some("2024-11-07 00:00:00.000")),
            ("soon", None),
            ("2024-13-01 12:00:00", None),
            ("2024-11-06 20:37:60", None),
            ("2024-11-06 24:00:00.5", None),
            ("9999-12-31 24:00:00", None),
            ("0000-02-29 12:00:00", None),
            // Read by JavaScript only, on the TypeScript path.
            ("Wed, 06 Nov 2024 21:37:00 +0100", None),
            ("11/6/2024 8:37:00 PM UTC", None),
        ] {
            assert_eq!(
                read_datetime_string(value).as_deref(),
                expected,
                "{value:?}"
            );
        }
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
