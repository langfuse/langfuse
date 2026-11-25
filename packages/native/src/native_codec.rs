//! Rust-only encoding for prepared v4 `events_full` rows.
//!
//! Encoding receives typed, owned fields finalized by the Rust ingestion pipeline.

use std::sync::Arc;

use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use rust_decimal::{Decimal, RoundingStrategy};

use crate::native_columns::NativeColumnError;
use crate::native_schema::PreparedEventRow;

const DECIMAL_SCALE: u32 = 12;
const DECIMAL_LIMIT: i128 = 1_000_000_000_000_000_000;
const DECIMAL_CLAMPED_MAX: i64 = 999_999_999_999_000_000;
const DECIMAL_CLAMPED_MIN: i64 = -DECIMAL_CLAMPED_MAX;
const DECIMAL_OVERFLOW_LIMIT: f64 = 1_000_000.0;

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct DateTime64Micros(pub(crate) i64);

#[derive(Clone, Copy, Debug)]
pub(crate) struct Decimal64(pub(crate) i64);

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillReference {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub langfuse_skill_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skill_version: Option<u32>,
    pub skill_name: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillResourceLoaded {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub langfuse_skill_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skill_version: Option<u32>,
    pub skill_name: String,
    pub file_path: String,
}

/// An owned ClickHouse Native-format block and its row count.
///
/// Ownership is part of the transport contract: the later JS transport can retry this complete
/// block after the encoder and source rows have gone out of scope.
#[derive(Debug)]
pub struct EncodedBlock {
    pub bytes: Vec<u8>,
    pub row_count: usize,
}

/// Encode prepared v4 event rows into Native blocks containing at most `max_rows_per_block` rows.
/// The boundary is a row count, not a byte-size or memory limit; the transport can use the returned
/// owned buffers and counts when it chooses its request boundaries.
///
/// Prepared rows already contain the defaults that production-prepared rows rely on when every
/// insertable column is listed in a Native block. Decimal values use the existing
/// Decimal(18,12) overflow policy and truncate toward zero at twelve fractional digits.
/// The block omits `event_bytes` so ClickHouse computes its DEFAULT from the final typed row.
/// A block can still split when ch-core's signed String offsets would overflow; a single row that
/// exceeds that limit remains an error.
pub(crate) fn encode_v4_native_blocks(
    rows: &[Arc<PreparedEventRow>],
    max_rows_per_block: usize,
) -> Result<Vec<EncodedBlock>, String> {
    if max_rows_per_block == 0 {
        return Err("max_rows_per_block must be greater than zero".to_owned());
    }

    let mut blocks = Vec::new();
    let mut encode = encode_block;
    for chunk in rows.chunks(max_rows_per_block) {
        encode_with_bisection(chunk, &mut encode, &mut blocks)
            .map_err(|error| error.to_string())?;
    }
    Ok(blocks)
}

fn encode_block(rows: &[Arc<PreparedEventRow>]) -> Result<Vec<u8>, NativeColumnError> {
    let schema = PreparedEventRow::schema();
    let columns = PreparedEventRow::build_columns(rows)?;
    let batch = ch_core_rs::batch::ColBatch::new(schema, columns, rows.len());
    ch_core_rs::native::encode::encode_block(
        &batch,
        &ch_core_rs::native::encode::EncodeOptions::default(),
    )
    .map_err(|error| NativeColumnError::Message(error.to_string()))
}

fn encode_with_bisection<T>(
    rows: &[T],
    encode: &mut impl FnMut(&[T]) -> Result<Vec<u8>, NativeColumnError>,
    blocks: &mut Vec<EncodedBlock>,
) -> Result<(), NativeColumnError> {
    match encode(rows) {
        Ok(bytes) => blocks.push(EncodedBlock {
            bytes,
            row_count: rows.len(),
        }),
        Err(NativeColumnError::StringColumnTooLarge) if rows.len() > 1 => {
            let midpoint = rows.len() / 2;
            let (left, right) = rows.split_at(midpoint);
            encode_with_bisection(left, encode, blocks)?;
            encode_with_bisection(right, encode, blocks)?;
        }
        Err(error) => return Err(error),
    }
    Ok(())
}

/// Parse the UTC-only datetime values produced by the ingestion pipeline. A ClickHouse datetime
/// string without an offset is a UTC calendar value; an RFC3339 offset is normalized to that same
/// UTC instant. The project never interprets these values in the host's local timezone.
pub(crate) fn parse_datetime_text(value: &str, key: &str) -> Result<i64, String> {
    match clickhouse_datetime_micros(value) {
        Some(micros) => Ok(micros),
        None => parse_any_datetime_text(value, key),
    }
}

fn parse_any_datetime_text(value: &str, key: &str) -> Result<i64, String> {
    let normalized = if value.contains(' ') && !value.contains('T') {
        value.replacen(' ', "T", 1)
    } else {
        value.to_owned()
    };
    if let Ok(parsed) = DateTime::parse_from_rfc3339(&normalized) {
        return Ok(parsed.timestamp_micros());
    }
    let naive = NaiveDateTime::parse_from_str(&normalized, "%Y-%m-%dT%H:%M:%S%.f")
        .map_err(|error| format!("{key} has invalid DateTime64 value {value:?}: {error}"))?;
    Ok(DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc).timestamp_micros())
}

/// Calendar fields of `YYYY-MM-DD?HH:MM:SS` at the start of `bytes`, where `?` is `separator`.
/// Returns `None` unless every field is zero-padded digits naming a real date and time, so the
/// caller can fall back to the general parser for anything else, including a leap second.
pub(crate) fn fixed_width_datetime(bytes: &[u8], separator: u8) -> Option<NaiveDateTime> {
    if bytes.len() < 19
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != separator
        || bytes[13] != b':'
        || bytes[16] != b':'
    {
        return None;
    }
    let number = |start: usize, end: usize| {
        bytes[start..end].iter().try_fold(0_u32, |value, byte| {
            byte.is_ascii_digit()
                .then(|| value * 10 + u32::from(byte - b'0'))
        })
    };
    NaiveDate::from_ymd_opt(number(0, 4)? as i32, number(5, 7)?, number(8, 10)?)?.and_hms_opt(
        number(11, 13)?,
        number(14, 16)?,
        number(17, 19)?,
    )
}

/// Microseconds of `YYYY-MM-DD HH:MM:SS[.fraction]`, the shape the pipeline writes for every
/// timestamp, read without building an intermediate string. Other shapes return `None`.
fn clickhouse_datetime_micros(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    let seconds = fixed_width_datetime(bytes, b' ')?;
    let nanoseconds = match &bytes[19..] {
        [] => 0,
        [b'.', digits @ ..]
            if (1..=9).contains(&digits.len()) && digits.iter().all(u8::is_ascii_digit) =>
        {
            digits
                .iter()
                .fold(0_u32, |value, digit| value * 10 + u32::from(digit - b'0'))
                * 10_u32.pow(9 - digits.len() as u32)
        }
        _ => return None,
    };
    Some(seconds.and_utc().timestamp_micros() + i64::from(nanoseconds / 1_000))
}

pub(crate) fn parse_decimal(value: &str, key: &str) -> Result<i64, String> {
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

#[cfg(test)]
#[path = "native_codec_tests.rs"]
mod tests;
