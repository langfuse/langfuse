use crate::Row;
use crate::row::Primitive;
use serde::{Deserialize, Serialize};

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct Timestamp32(u32);

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct Timestamp64(u64);

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct Time32(i32);
impl Primitive for Time32 {}
impl Primitive for Option<Time32> {}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct Time64(i64);
impl Primitive for Time64 {}
impl Primitive for Option<Time64> {}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct FixedPoint64(i64);

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct FixedPoint128(i128);

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct Sample<'a> {
    int8: i8,
    int32: i32,
    int64: i64,
    uint8: u8,
    uint32: u32,
    uint64: u64,
    float32: f32,
    float64: f64,
    datetime: Timestamp32,
    datetime64: Timestamp64,
    time32: Time32,
    time64: Time64,
    decimal64: FixedPoint64,
    decimal128: FixedPoint128,
    string: &'a str,
    #[serde(with = "serde_bytes")]
    blob: &'a [u8],
    optional_decimal64: Option<FixedPoint64>,
    optional_datetime: Option<Timestamp32>,
    fixed_string: [u8; 4],
    array: Vec<i8>,
    boolean: bool,
}

// clickhouse_macros is not working here
impl Row for Sample<'_> {
    const NAME: &'static str = "Sample";
    const COLUMN_NAMES: &'static [&'static str] = &[
        "int8",
        "int32",
        "int64",
        "uint8",
        "uint32",
        "uint64",
        "float32",
        "float64",
        "datetime",
        "datetime64",
        "time32",
        "time64",
        "decimal64",
        "decimal128",
        "string",
        "blob",
        "optional_decimal64",
        "optional_datetime",
        "fixed_string",
        "array",
        "boolean",
    ];
    const COLUMN_COUNT: usize = 21;
    const KIND: crate::row::RowKind = crate::row::RowKind::Struct;

    type Value<'a> = Sample<'a>;
}

fn sample() -> Sample<'static> {
    Sample {
        int8: -42,
        int32: -3242,
        int64: -6442,
        uint8: 42,
        uint32: 3242,
        uint64: 6442,
        float32: 42.42,
        float64: 42.42,
        datetime: Timestamp32(2_301_990_162),
        datetime64: Timestamp64(2_301_990_162_123),
        time32: Time32(42_000), // 11:40:00 (42,000 seconds since midnight)
        time64: Time64(42_000_000_000), // 11:40:00.000000000 (42,000,000,000 nanoseconds since midnight)
        decimal64: FixedPoint64(4242 * 10_000_000),
        decimal128: FixedPoint128(4242 * 10_000_000),
        string: "01234",
        blob: &[0, 1, 2, 3, 4],
        optional_decimal64: None,
        optional_datetime: Some(Timestamp32(2_301_990_162)),
        fixed_string: [b'B', b'T', b'C', 0],
        array: vec![-42, 42, -42, 42],
        boolean: true,
    }
}

fn sample_serialized() -> Vec<u8> {
    vec![
        // [Int8] -42
        0xd6, //
        // [Int32] -3242
        0x56, 0xf3, 0xff, 0xff, //
        // [Int64] -6442
        0xd6, 0xe6, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, //
        // [UInt8] 42
        0x2a, //
        // [UInt32] 3242
        0xaa, 0x0c, 0x00, 0x00, //
        // [UInt64] 6442
        0x2a, 0x19, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
        // [Float32] 42.42
        0x14, 0xae, 0x29, 0x42, //
        // [Float64] 42.42
        0xf6, 0x28, 0x5c, 0x8f, 0xc2, 0x35, 0x45, 0x40, //
        // [DateTime] 2042-12-12 12:42:42
        //       (ts: 2301990162)
        0x12, 0x95, 0x35, 0x89, //
        // [DateTime64(3)] 2042-12-12 12:42:42'123
        //       (ts: 2301990162123)
        0xcb, 0x4e, 0x4e, 0xf9, 0x17, 0x02, 0x00, 0x00, //
        // [Time32] 11:40:00 (42,000 seconds since midnight)
        0x10, 0xa4, 0x00, 0x00, //
        // [Time64] 11:40:00.000000000 (42,000,000,000 nanoseconds since midnight)
        0x00, 0x24, 0x65, 0xc7, 0x09, 0x00, 0x00, 0x00, //
        // [Decimal64(9)] 42.420000000
        0x00, 0xd5, 0x6d, 0xe0, 0x09, 0x00, 0x00, 0x00, //
        // [Decimal128(9)] 42.420000000
        0x00, 0xd5, 0x6d, 0xe0, 0x09, 0x00, 0x00, 0x00, //
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
        // [String] 5 "01234"
        0x05, 0x30, 0x31, 0x32, 0x33, 0x34, //
        // [String] 5 [0, 1, 2, 3, 4]
        0x05, 0x00, 0x01, 0x02, 0x03, 0x04, //
        // [Nullable(Decimal64(9))] NULL
        0x01, //
        // [Nullable(DateTime)] 2042-12-12 12:42:42
        //       (ts: 2301990162)
        0x00, 0x12, 0x95, 0x35, 0x89, //
        // [FixedString(4)] [b'B', b'T', b'C', 0]
        0x42, 0x54, 0x43, 0x00, //
        // [Array(Int32)] [-42, 42, -42, 42]
        0x04, 0xd6, 0x2a, 0xd6, 0x2a, //
        // [Boolean] true
        0x01, //
    ]
}

#[test]
fn it_serializes() {
    let mut actual = Vec::new();
    super::serialize_row_binary(&mut actual, &sample()).unwrap();
    assert_eq!(actual, sample_serialized());
}

#[test]
fn it_deserializes() {
    let input = sample_serialized();

    for i in 0..input.len() {
        let (mut left, mut right) = input.split_at(i);

        // It shouldn't panic.
        let _: Result<Sample<'_>, _> = super::deserialize_row(&mut left, None);
        let _: Result<Sample<'_>, _> = super::deserialize_row(&mut right, None);

        let actual: Sample<'_> = super::deserialize_row(&mut input.as_slice(), None).unwrap();
        assert_eq!(actual, sample());
    }
}

#[test]
fn it_serializes_time64() {
    let value = 42_000_000_000;
    let time64 = Time64(value);
    println!("Time64 value: {}", time64.0);
    let mut actual = Vec::new();
    super::serialize_row_binary(&mut actual, &time64).unwrap();

    // Expected: 42000000000 in little-endian
    let expected = value.to_le_bytes();

    assert_eq!(actual, expected, "Time64 serialization mismatch");
}

#[test]
fn it_deserializes_time64() {
    let value_bytes = 42_000_000_000_i64.to_le_bytes();
    let time64 = { Time64(i64::from_le_bytes(value_bytes)) };
    assert_eq!(time64.0, 42_000_000_000, "Time deserialization mismatch");
}

#[test]
fn it_serializes_time32() {
    let value = 42_000;
    let time32 = Time32(value);
    let mut actual = Vec::new();
    super::serialize_row_binary(&mut actual, &time32).unwrap();
    let expected = value.to_le_bytes();
    assert_eq!(actual, expected, "Time32 serialization mismatch");
}

#[test]
fn it_deserializes_time32() {
    let value_bytes = 42_000_i32.to_le_bytes();
    let time64 = { Time32(i32::from_le_bytes(value_bytes)) };
    assert_eq!(time64.0, 42_000, "Time deserialization mismatch");
}

#[test]
fn it_serializes_option_time32_some() {
    let value = 42_000;
    let time: Option<Time32> = Some(Time32(value));
    let mut actual = Vec::new();
    super::serialize_row_binary(&mut actual, &time).unwrap();

    // Nullable encoding: 0x00 = not null, followed by value
    let mut expected = vec![0x00];
    // extend after not null
    expected.extend_from_slice(&value.to_le_bytes());

    assert_eq!(
        actual, expected,
        "Option<Time32> (Some) serialization mismatch"
    );
}

#[cfg(feature = "chrono")]
#[test]
fn it_serializes_time32_overflow_fails() {
    use crate::serde::chrono::time;
    use chrono::Duration;

    // Duration that exceeds i32::MAX
    let value = Duration::seconds(i64::from(i32::MAX) + 1);

    // Use a dummy serializer just to trigger the error
    let result = time::serialize(&value, serde_json::value::Serializer);

    assert!(result.is_err(), "Expected error due to overflow");

    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("cannot be represented as Time"),
        "Unexpected error message: {err}"
    );
}

#[cfg(feature = "time")]
#[test]
fn it_time_serializes_time64_millis_overflow_fails() {
    use crate::serde::time::time64::millis;
    use time::Duration;

    let value = Duration::milliseconds(i64::MAX) + Duration::milliseconds(1);

    let result = millis::serialize(&value, serde_json::value::Serializer);

    assert!(
        result.is_err(),
        "Expected error due to milliseconds overflow"
    );

    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("milliseconds too large for i64"),
        "Unexpected error message: {err}"
    );
}

#[cfg(feature = "time")]
#[test]
fn it_time_serializes_time64_micros_overflow_fails() {
    use crate::serde::time::time64::micros;
    use time::Duration;

    let value = Duration::microseconds(i64::MAX) + Duration::microseconds(1);
    let result = micros::serialize(&value, serde_json::value::Serializer);

    assert!(
        result.is_err(),
        "Expected error due to microseconds overflow"
    );

    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("microseconds too large for i64"),
        "Unexpected error message: {err}"
    );
}

#[cfg(feature = "time")]
#[test]
fn it_time_serializes_time64_nanos_overflow_fails() {
    use crate::serde::time::time64::nanos;
    use time::Duration;

    let value = Duration::nanoseconds(i64::MAX) + Duration::nanoseconds(1);
    let result = nanos::serialize(&value, serde_json::value::Serializer);

    assert!(
        result.is_err(),
        "Expected error due to nanoseconds overflow"
    );

    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("nanoseconds too large for i64"),
        "Unexpected error message: {err}"
    );
}
