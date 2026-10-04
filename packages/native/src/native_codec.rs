//! Rust-only encoding for prepared v4 `events_full` rows.
//!
//! Encoding receives typed, owned fields from the direct JS adapter in `native_js`.

use std::error::Error as StdError;
use std::sync::Arc;

use bytes::Bytes;
use chrono::{DateTime, NaiveDateTime, Utc};
use clickhouse::native::builder::BlockBuilder;
use clickhouse::native::encode::{Encode, ValueWriter};
use clickhouse::native::DataTypeNode;
use clickhouse_types::data_types::{DateTimePrecision, DecimalType};
use rust_decimal::{Decimal, RoundingStrategy};

use crate::native_schema::PreparedEventRow;

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
/// Encoding preserves the prepared row's `event_bytes`. The NAPI adapter receives that value
/// from TypeScript after overflow handling; it does not recompute accounting in Rust.
pub(crate) fn encode_v4_native_blocks(
    rows: &[Arc<PreparedEventRow>],
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

fn encode_block(rows: &[Arc<PreparedEventRow>]) -> Result<Bytes, String> {
    let mut builder = BlockBuilder::new();
    PreparedEventRow::encode_arcs(&mut builder, rows)?;

    builder
        .build()
        .map_err(|error| error.to_string())?
        .encode()
        .map_err(|error| error.to_string())
}

/// Parse the UTC-only datetime values produced by the ingestion pipeline. A ClickHouse datetime
/// string without an offset is a UTC calendar value; an RFC3339 offset is normalized to that same
/// UTC instant. The project never interprets these values in the host's local timezone.
pub(crate) fn parse_datetime_text(value: &str, key: &str) -> Result<i64, String> {
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
