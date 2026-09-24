//! Rust-only encoding for prepared v4 `events_full` rows.
//!
//! `PreparedEvent::from_json` accepts the prepared `EventRecordInsertType` shape after
//! observation-field overflow handling and before the writer's numeric Decimal clamp. Nested
//! input/output payloads have already been serialized as strings. Native encoding then receives
//! only typed, owned fields; the adapters below define the JSON conversion policy.

use std::borrow::Cow;
use std::collections::BTreeMap;
use std::error::Error as StdError;

use bytes::Bytes;
use chrono::{DateTime, NaiveDateTime, Utc};
use clickhouse::native::builder::BlockBuilder;
use clickhouse::native::encode::{Encode, ValueWriter};
use clickhouse::native::DataTypeNode;
use clickhouse_types::data_types::{DateTimePrecision, DecimalType};
use rust_decimal::{Decimal, RoundingStrategy};
use serde::ser::{SerializeMap, Serializer}; // codespell:ignore ser
use serde_json::Value;

use crate::native_schema::{ColumnKind, DefaultPolicy, PreparedEvent};

const DECIMAL_SCALE: u32 = 12;
const DECIMAL_LIMIT: i128 = 1_000_000_000_000_000_000;
const DECIMAL_CLAMPED_MAX: i64 = 999_999_999_999_000_000;
const DECIMAL_CLAMPED_MIN: i64 = -DECIMAL_CLAMPED_MAX;
const DECIMAL_OVERFLOW_LIMIT: f64 = 1_000_000.0;
type EncodeError = Box<dyn StdError + Send + Sync>;

#[derive(Clone, Copy, Debug)]
pub(crate) struct DateTime64Micros(pub(crate) i64);

impl Encode for DateTime64Micros {
    fn produces() -> DataTypeNode {
        DataTypeNode::DateTime64(DateTimePrecision::Precision6, None)
    }

    fn encode(&self, writer: &mut ValueWriter<'_>) -> Result<(), EncodeError> {
        // clickhouse-rs has no DateTime64 Encode implementation. Keep the DateTime64(6) type tag
        // while writing ClickHouse's signed microsecond representation as a fixed-width value.
        writer.write_fixed(&self.0.to_le_bytes())?;
        Ok(())
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Decimal64(pub(crate) i64);

impl Encode for Decimal64 {
    fn produces() -> DataTypeNode {
        DataTypeNode::Decimal(18, 12, DecimalType::Decimal64)
    }

    fn encode(&self, writer: &mut ValueWriter<'_>) -> Result<(), EncodeError> {
        // rust_decimal supplies the policy and coefficient; clickhouse-rs has no Decimal Encode
        // implementation, so retain the Decimal(18,12) type tag and write its Int64 coefficient.
        writer.write_fixed(&self.0.to_le_bytes())?;
        Ok(())
    }
}

/// An owned ClickHouse Native-format block and its row count.
///
/// Ownership is part of the transport contract: the later JS transport can retry this complete
/// block after the encoder and source rows have gone out of scope.
#[derive(Debug)]
pub struct EncodedBlock {
    pub bytes: Bytes,
    pub row_count: usize,
}

/// Encode prepared v4 event rows into Native blocks containing at most `max_rows_per_block` rows.
/// The boundary is a row count, not a byte-size or memory limit; the transport can use the returned
/// owned buffers and counts when it chooses its request boundaries.
///
/// Prepared rows already contain the defaults that production-prepared rows rely on when every
/// insertable column is listed in a Native block. Decimal values use the existing
/// Decimal(18,12) overflow policy and truncate toward zero at twelve fractional digits.
/// `event_bytes` is the UTF-8 size of the compact Rust JSON serialization of the prepared row
/// without the accounting field; it is intentionally a logical size metric and need not be
/// byte-identical to JavaScript's JSON.stringify output. Preparation stores this value before
/// applying typed decimal conversion or DEFAULT-backed field filling.
pub(crate) fn encode_v4_native_blocks(
    rows: &[PreparedEvent],
    max_rows_per_block: usize,
) -> Result<Vec<EncodedBlock>, String> {
    if max_rows_per_block == 0 {
        return Err("max_rows_per_block must be greater than zero".to_owned());
    }

    rows.chunks(max_rows_per_block)
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
    // Borrow the fields and discard serialized bytes immediately: accounting needs the length,
    // not a cloned row or a second payload buffer.
    let mut counter = ByteCounter(0);
    let mut serializer = serde_json::Serializer::new(&mut counter);
    let result = (|| -> Result<(), serde_json::Error> {
        let mut map = serializer.serialize_map(None)?;
        for (key, value) in object {
            if key != "event_bytes" {
                map.serialize_entry(key, value)?;
            }
        }
        map.end()
    })();
    result.map_err(|error| format!("failed to serialize event row: {error}"))?;
    Ok(counter.0)
}

struct ByteCounter(u64);

impl std::io::Write for ByteCounter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0 = self
            .0
            .checked_add(bytes.len() as u64)
            .ok_or_else(|| std::io::Error::other("serialized event is too large"))?;
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn encode_block(rows: &[PreparedEvent]) -> Result<Bytes, String> {
    let mut builder = BlockBuilder::new();
    PreparedEvent::encode_into(&mut builder, rows)?;

    builder
        .build()
        .map_err(|error| error.to_string())?
        .encode()
        .map_err(|error| error.to_string())
}

/// Resolve values whose ClickHouse defaults would otherwise be bypassed by listing the column in
/// the Native block. Ordinary columns stay borrowed from the input row; only synthesized defaults
/// allocate a JSON value. This runs once at the JSON-to-typed preparation boundary.
fn value_for<'a>(row: &'a Value, key: &str, default_policy: DefaultPolicy) -> Cow<'a, Value> {
    let explicit = row.get(key);
    if default_policy == DefaultPolicy::None {
        return explicit
            .map(Cow::Borrowed)
            .unwrap_or(Cow::Owned(Value::Null));
    }
    if let Some(value) = explicit.filter(|value| !value.is_null()) {
        return Cow::Borrowed(value);
    }
    // For example, omitted environment gets DEFAULT 'default' in JSONEachRow. Sending an empty
    // string in a Native column would instead persist that empty string and bypass the default.
    Cow::Owned(match default_policy {
        DefaultPolicy::Literal(value) => Value::String(value.to_owned()),
        DefaultPolicy::Metadata(key) => Value::String(metadata_value(row, key).unwrap_or_default()),
        DefaultPolicy::MetadataFallback(key, fallback) => Value::String(
            metadata_value(row, key)
                .filter(|value| !value.is_empty())
                .or_else(|| metadata_value(row, fallback))
                .unwrap_or_default(),
        ),
        DefaultPolicy::MetadataEquals(key, expected) => {
            Value::Bool(metadata_value(row, key).as_deref() == Some(expected))
        }
        DefaultPolicy::None => Value::Null,
    })
}

pub(crate) fn from_json_field<T: FromJson>(
    row: &Value,
    key: &str,
    default_policy: DefaultPolicy,
) -> Result<T, String> {
    T::from_json(value_for(row, key, default_policy).as_ref())
        .map_err(|error| format!("{key}: {error}"))
}

fn metadata_value(row: &Value, name: &str) -> Option<String> {
    // Ingestion stores metadata as parallel arrays; default expressions look up the same pair.
    let names = row.get("metadata_names")?.as_array()?;
    let values = row.get("metadata_values")?.as_array()?;
    names.iter().zip(values).find_map(|(metadata_name, value)| {
        (metadata_name.as_str() == Some(name)).then(|| string_value(value))
    })
}

// Conversion is separate from wire encoding: upstream Encode implementations own nullable, array,
// map, and primitive layouts, while these implementations define the prepared-row input policy.
pub(crate) trait FromJson: Encode + Sized {
    const COLUMN_KIND: ColumnKind;

    fn from_json(value: &Value) -> Result<Self, String>;
}

impl FromJson for String {
    const COLUMN_KIND: ColumnKind = ColumnKind::String;

    fn from_json(value: &Value) -> Result<Self, String> {
        Ok(string_value(value))
    }
}

impl FromJson for bool {
    const COLUMN_KIND: ColumnKind = ColumnKind::Bool;

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
    ($(($type:ty, $kind:expr)),+ $(,)?) => {$(
        impl FromJson for $type {
            const COLUMN_KIND: ColumnKind = $kind;

            fn from_json(value: &Value) -> Result<Self, String> {
                <$type>::try_from(json_u64(Some(value), stringify!($type))?)
                    .map_err(|_| format!("expected a {}", stringify!($type)))
            }
        }
    )+};
}
unsigned!(
    (u8, ColumnKind::UInt8),
    (u16, ColumnKind::UInt16),
    (u64, ColumnKind::UInt64),
);

impl FromJson for DateTime64Micros {
    const COLUMN_KIND: ColumnKind = ColumnKind::DateTime64;

    fn from_json(value: &Value) -> Result<Self, String> {
        parse_datetime_value(value, "datetime").map(Self)
    }
}

impl FromJson for Decimal64 {
    const COLUMN_KIND: ColumnKind = ColumnKind::Decimal;

    fn from_json(value: &Value) -> Result<Self, String> {
        parse_decimal_value(value, "decimal").map(Self)
    }
}

impl<T: FromJson> FromJson for Option<T> {
    const COLUMN_KIND: ColumnKind = match T::COLUMN_KIND {
        ColumnKind::String => ColumnKind::NullableString,
        ColumnKind::DateTime64 => ColumnKind::NullableDateTime64,
        ColumnKind::UInt16 => ColumnKind::NullableUInt16,
        _ => panic!("unsupported nullable events_full column type"),
    };

    fn from_json(value: &Value) -> Result<Self, String> {
        if value.is_null() {
            Ok(None)
        } else {
            T::from_json(value).map(Some)
        }
    }
}

impl<T: FromJson> FromJson for Vec<T> {
    const COLUMN_KIND: ColumnKind = match T::COLUMN_KIND {
        ColumnKind::String => ColumnKind::ArrayString,
        _ => panic!("unsupported array events_full column type"),
    };

    fn from_json(value: &Value) -> Result<Self, String> {
        match value {
            Value::Null => Ok(Vec::new()),
            Value::Array(values) => values.iter().map(T::from_json).collect(),
            _ => Err(format!("expected an array, got {value}")),
        }
    }
}

impl<T: FromJson> FromJson for BTreeMap<String, T> {
    const COLUMN_KIND: ColumnKind = match T::COLUMN_KIND {
        ColumnKind::String => ColumnKind::MapStringString,
        ColumnKind::UInt64 => ColumnKind::MapStringUInt64,
        ColumnKind::Decimal => ColumnKind::MapStringDecimal,
        _ => panic!("unsupported map events_full column type"),
    };

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
    // JSONEachRow inputs can represent whole numbers as either JSON integers or integral floats;
    // accept both forms while rejecting signs, fractions, and non-finite values for UInt columns.
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
