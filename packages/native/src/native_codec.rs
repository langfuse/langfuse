//! Rust-only encoding for prepared v4 `events_full` rows.
//!
//! Rows stay as JSON at this boundary so the existing ingestion samples can exercise the codec.
//! The Native builder still receives typed values; the small adapters below only bridge JSON's
//! nullable and number-like representations to ClickHouse's types.

use std::borrow::Cow;
use std::collections::BTreeMap;
use std::error::Error as StdError;

use chrono::{DateTime, NaiveDateTime, Utc};
use clickhouse::native::builder::BlockBuilder;
use clickhouse::native::encode::{Encode, ValueWriter};
use clickhouse::native::DataTypeNode;
use clickhouse_types::data_types::{DateTimePrecision, DecimalType};
use rust_decimal::{Decimal, RoundingStrategy};
use serde_json::Value;

const DECIMAL_SCALE: u32 = 12;
const DECIMAL_LIMIT: i128 = 1_000_000_000_000_000_000;
const DECIMAL_CLAMPED_MAX: i64 = 999_999_999_999_000_000;
const DECIMAL_CLAMPED_MIN: i64 = -DECIMAL_CLAMPED_MAX;
const DECIMAL_OVERFLOW_LIMIT: f64 = 1_000_000.0;
type EncodeError = Box<dyn StdError + Send + Sync>;

#[derive(Clone, Copy, Debug)]
struct DateTime64Micros(i64);

impl Encode for DateTime64Micros {
    fn produces() -> DataTypeNode {
        DataTypeNode::DateTime64(DateTimePrecision::Precision6, None)
    }

    fn encode(&self, writer: &mut ValueWriter<'_>) -> Result<(), EncodeError> {
        writer.write_fixed(&self.0.to_le_bytes())?;
        Ok(())
    }
}

#[derive(Clone, Copy, Debug)]
struct Decimal64(i64);

impl Encode for Decimal64 {
    fn produces() -> DataTypeNode {
        DataTypeNode::Decimal(18, 12, DecimalType::Decimal64)
    }

    fn encode(&self, writer: &mut ValueWriter<'_>) -> Result<(), EncodeError> {
        writer.write_fixed(&self.0.to_le_bytes())?;
        Ok(())
    }
}

/// An owned ClickHouse Native-format block and its row count.
#[derive(Debug)]
pub struct EncodedBlock {
    pub bytes: Vec<u8>,
    pub row_count: usize,
}

/// Encode prepared v4 event rows into caller-sized Native blocks.
///
/// Rows are JSON values here only to make the codec testable against the repository's captured
/// ingestion samples. The encoder fills the defaults that production-prepared rows rely on when
/// every insertable column is listed in a Native block. Decimal values use the existing
/// Decimal(18,12) overflow policy and truncate toward zero at twelve fractional digits.
/// `event_bytes` is the UTF-8 size of the compact Rust JSON serialization of the prepared row
/// without the accounting field; it is intentionally a logical size metric and need not be
/// byte-identical to JavaScript's JSON.stringify output.
pub fn encode_v4_native_blocks(
    rows: &[Value],
    block_size: usize,
) -> Result<Vec<EncodedBlock>, String> {
    if block_size == 0 {
        return Err("block_size must be greater than zero".to_owned());
    }

    rows.chunks(block_size)
        .map(|chunk| {
            let bytes = encode_block(chunk)?;
            Ok(EncodedBlock {
                bytes,
                row_count: chunk.len(),
            })
        })
        .collect()
}

/// Compute the UTF-8 size of a prepared event's JSONEachRow representation without `event_bytes`.
pub fn event_bytes(value: &Value) -> Result<u64, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "event row must be a JSON object".to_owned())?;
    let mut without_event_bytes = object.clone();
    without_event_bytes.remove("event_bytes");
    let serialized = serde_json::to_vec(&Value::Object(without_event_bytes))
        .map_err(|error| format!("failed to serialize event row: {error}"))?;
    u64::try_from(serialized.len()).map_err(|_| "serialized event is too large".to_owned())
}

fn encode_block(rows: &[Value]) -> Result<Vec<u8>, String> {
    let mut builder = BlockBuilder::new();
    let computed_event_bytes = rows
        .iter()
        .map(event_bytes)
        .collect::<Result<Vec<_>, _>>()?;

    macro_rules! column {
        ($name:expr, $type:ty, $key:expr) => {
            add_column::<$type>(
                &mut builder,
                $name,
                rows.iter().map(|row| value_for(row, $key)),
            )?;
        };
    }
    macro_rules! columns {
        ($type:ty; $($field:ident),+ $(,)?) => {
            $(column!(stringify!($field), $type, stringify!($field));)+
        };
    }

    // These are the 72 insertable events_full columns. Materialized and alias columns stay
    // server-owned; the block can list columns in any order because ClickHouse matches by name.
    columns!(String;
        project_id, trace_id, span_id, parent_span_id, name, environment, version, release,
        trace_name, user_id, session_id, level, status_message, prompt_id, prompt_name, model_id,
        provided_model_name, model_parameters, input, output, evaluator_id, evaluation_rule_id,
        experiment_id, experiment_name, experiment_description, experiment_dataset_id,
        experiment_item_id, experiment_item_expected_output, experiment_item_root_span_id, source,
        service_name, service_version, scope_name, scope_version, telemetry_sdk_language,
        telemetry_sdk_name, telemetry_sdk_version, blob_storage_file_path, ingestion_api_key,
        ingestion_sdk_name, ingestion_sdk_version,
    );
    column!("type", String, "type");

    columns!(DateTime64Micros; start_time, created_at, updated_at, event_ts);
    columns!(Option<DateTime64Micros>; end_time, completion_start_time, experiment_item_version);
    column!("prompt_version", Option<u16>, "prompt_version");
    columns!(bool; is_app_root, bookmarked, public, evaluator_execution_is_test);
    column!("is_deleted", u8, "is_deleted");
    add_column::<u64>(
        &mut builder,
        "event_bytes",
        computed_event_bytes
            .iter()
            .map(|value| Cow::Owned(Value::from(*value))),
    )?;
    columns!(Vec<String>;
        tags, tool_calls, tool_call_names, metadata_names, metadata_values,
        experiment_metadata_names, experiment_metadata_values, experiment_item_metadata_names,
        experiment_item_metadata_values,
    );
    columns!(BTreeMap<String, u64>; provided_usage_details, usage_details);
    columns!(BTreeMap<String, Decimal64>; provided_cost_details, cost_details);
    columns!(Option<String>; usage_pricing_tier_id, usage_pricing_tier_name);
    column!("tool_definitions", BTreeMap<String, String>, "tool_definitions");

    builder
        .build()
        .map_err(|error| error.to_string())?
        .encode()
        .map(|bytes| bytes.to_vec())
        .map_err(|error| error.to_string())
}

fn add_column<'a, T: FromJson>(
    builder: &mut BlockBuilder,
    name: &str,
    values: impl IntoIterator<Item = Cow<'a, Value>>,
) -> Result<(), String> {
    let mut column = builder
        .upsert_column::<T>(name)
        .map_err(|error| format!("cannot add column {name}: {error}"))?;
    for value in values {
        column
            .add(T::from_json(value.as_ref()).map_err(|error| format!("{name}: {error}"))?)
            .map_err(|error| format!("cannot encode column {name}: {error}"))?;
    }
    Ok(())
}

/// Resolve values whose ClickHouse defaults would otherwise be bypassed by listing the column in
/// the Native block. Ordinary columns stay borrowed from the input row; only synthesized defaults
/// allocate a JSON value.
fn value_for<'a>(row: &'a Value, key: &str) -> Cow<'a, Value> {
    match key {
        "environment" => value_or_default(row, key, Value::String("default".to_owned())),
        "evaluator_id" => value_or_default(
            row,
            key,
            Value::String(metadata_value(row, "evaluator_id").unwrap_or_default()),
        ),
        "evaluation_rule_id" => {
            let explicit = row.get(key).filter(|value| !value.is_null());
            explicit.map_or_else(
                || {
                    Cow::Owned(Value::String(
                        metadata_value(row, "evaluation_rule_id")
                            .filter(|value| !value.is_empty())
                            .or_else(|| metadata_value(row, "job_configuration_id"))
                            .unwrap_or_default(),
                    ))
                },
                Cow::Borrowed,
            )
        }
        "evaluator_execution_is_test" => row.get(key).filter(|value| !value.is_null()).map_or_else(
            || {
                Cow::Owned(Value::Bool(
                    metadata_value(row, "evaluator_test").as_deref() == Some("true"),
                ))
            },
            Cow::Borrowed,
        ),
        _ => row
            .get(key)
            .map(Cow::Borrowed)
            .unwrap_or_else(|| Cow::Owned(Value::Null)),
    }
}

fn value_or_default<'a>(row: &'a Value, key: &str, default: Value) -> Cow<'a, Value> {
    row.get(key)
        .filter(|value| !value.is_null())
        .map(Cow::Borrowed)
        .unwrap_or(Cow::Owned(default))
}

fn metadata_value(row: &Value, name: &str) -> Option<String> {
    let names = row.get("metadata_names")?.as_array()?;
    let values = row.get("metadata_values")?.as_array()?;
    names.iter().zip(values).find_map(|(metadata_name, value)| {
        (metadata_name.as_str() == Some(name)).then(|| string_value(value))
    })
}

// Conversion is separate from wire encoding: upstream Encode implementations own nullable,
// array, map and primitive layouts.
trait FromJson: Encode + Sized {
    fn from_json(value: &Value) -> Result<Self, String>;
}

impl FromJson for String {
    fn from_json(value: &Value) -> Result<Self, String> {
        Ok(string_value(value))
    }
}

impl FromJson for bool {
    fn from_json(value: &Value) -> Result<Self, String> {
        match value {
            Value::Null => Ok(false),
            Value::Bool(value) => Ok(*value),
            Value::Number(value) => value
                .as_f64()
                .filter(|value| value.is_finite())
                .map(|value| value != 0.0)
                .ok_or_else(|| "expected a finite boolean number".to_owned()),
            _ => Err(format!("expected boolean, got {value}")),
        }
    }
}

macro_rules! unsigned {
    ($($type:ty),+) => {$(
        impl FromJson for $type {
            fn from_json(value: &Value) -> Result<Self, String> {
                <$type>::try_from(json_u64(Some(value), stringify!($type))?)
                    .map_err(|_| format!("expected a {}", stringify!($type)))
            }
        }
    )+};
}
unsigned!(u8, u16, u64);

impl FromJson for DateTime64Micros {
    fn from_json(value: &Value) -> Result<Self, String> {
        parse_datetime_value(value, "datetime").map(Self)
    }
}

impl FromJson for Decimal64 {
    fn from_json(value: &Value) -> Result<Self, String> {
        parse_decimal_value(value, "decimal").map(Self)
    }
}

impl<T: FromJson> FromJson for Option<T> {
    fn from_json(value: &Value) -> Result<Self, String> {
        if value.is_null() {
            Ok(None)
        } else {
            T::from_json(value).map(Some)
        }
    }
}

impl<T: FromJson> FromJson for Vec<T> {
    fn from_json(value: &Value) -> Result<Self, String> {
        match value {
            Value::Null => Ok(Vec::new()),
            Value::Array(values) => values.iter().map(T::from_json).collect(),
            _ => Err(format!("expected an array, got {value}")),
        }
    }
}

impl<T: FromJson> FromJson for BTreeMap<String, T> {
    fn from_json(value: &Value) -> Result<Self, String> {
        match value {
            Value::Null => Ok(BTreeMap::new()),
            Value::Object(values) => values
                .iter()
                .map(|(key, value)| Ok((key.clone(), T::from_json(value)?)))
                .collect(),
            _ => Err(format!("expected a map, got {value}")),
        }
    }
}

fn json_u64(value: Option<&Value>, type_name: &str) -> Result<u64, String> {
    match value {
        None | Some(Value::Null) => Ok(0),
        Some(Value::Number(value)) => value
            .as_u64()
            .or_else(|| {
                value
                    .as_f64()
                    .filter(|number| number.is_finite() && *number >= 0.0 && number.fract() == 0.0)
                    .and_then(|number| u64::try_from(number as u128).ok())
            })
            .ok_or_else(|| format!("expected a {type_name}")),
        Some(value) => Err(format!("expected a {type_name}, got {value}")),
    }
}

/// Parse the UTC-only datetime values produced by the ingestion pipeline. A ClickHouse datetime
/// string without an offset is a UTC calendar value; an RFC3339 offset is normalized to that same
/// UTC instant. The project never interprets these values in the host's local timezone.
fn parse_datetime_value(value: &Value, key: &str) -> Result<i64, String> {
    match value {
        Value::String(value) => {
            let normalized = if value.contains(' ') && !value.contains('T') {
                value.replacen(' ', "T", 1)
            } else {
                value.clone()
            };
            if let Ok(parsed) = DateTime::parse_from_rfc3339(&normalized) {
                return Ok(parsed.timestamp_micros());
            }
            let naive = NaiveDateTime::parse_from_str(&normalized, "%Y-%m-%dT%H:%M:%S%.f")
                .map_err(|error| {
                    format!("{key} has invalid DateTime64 value {value:?}: {error}")
                })?;
            Ok(DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc).timestamp_micros())
        }
        _ => Err(format!("{key} must be a UTC timestamp string")),
    }
}

fn parse_decimal_value(value: &Value, key: &str) -> Result<i64, String> {
    let text = match value {
        Value::String(value) => value.as_str(),
        Value::Number(value) => return parse_decimal(&value.to_string(), key),
        _ => return Err(format!("{key} must be a decimal number or string")),
    };
    parse_decimal(text, key)
}

fn parse_decimal(value: &str, key: &str) -> Result<i64, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(0);
    }
    let number = value
        .parse::<f64>()
        .map_err(|_| format!("{key} has an invalid decimal"))?;

    // `UsageCostSchema` converts costs to JavaScript numbers and the writer's existing policy
    // turns non-finite values into zero and clamps values at the exclusive 1e6 boundary.
    if !number.is_finite() {
        return Ok(0);
    }
    if number.abs() >= DECIMAL_OVERFLOW_LIMIT {
        return Ok(if number.is_sign_negative() {
            DECIMAL_CLAMPED_MIN
        } else {
            DECIMAL_CLAMPED_MAX
        });
    }

    // Values below the target quantum are zero after ClickHouse's scale conversion. Returning
    // early also covers f64 underflow values whose scientific exponent exceeds Decimal's scale
    // range without turning a valid, zero-result input into a parse error.
    if number == 0.0 || number.abs() < 10_f64.powi(-(DECIMAL_SCALE as i32)) {
        return Ok(0);
    }

    // The ingestion schema has already reduced costs to JavaScript numbers. Parse that shortest
    // round-tripping representation as a fixed-precision decimal so scaling never multiplies a
    // binary float. Decimal(18,12) fits comfortably within rust_decimal's coefficient range.
    let normalized = number.to_string();
    let mut decimal = if normalized.contains(['e', 'E']) {
        Decimal::from_scientific(&normalized)
    } else {
        normalized.parse::<Decimal>()
    }
    .map_err(|_| format!("{key} has an invalid decimal"))?;

    decimal = decimal.round_dp_with_strategy(DECIMAL_SCALE, RoundingStrategy::ToZero);
    decimal.rescale(DECIMAL_SCALE);
    let coefficient = decimal.mantissa();
    if coefficient >= DECIMAL_LIMIT || coefficient <= -DECIMAL_LIMIT {
        return Ok(if coefficient.is_negative() {
            DECIMAL_CLAMPED_MIN
        } else {
            DECIMAL_CLAMPED_MAX
        });
    }
    i64::try_from(coefficient).map_err(|_| format!("{key} decimal is out of range"))
}

fn string_value(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Null => String::new(),
        value => serde_json::to_string(value).unwrap_or_default(),
    }
}

#[cfg(test)]
#[path = "native_codec_tests.rs"]
mod tests;
