use super::*;
use proptest::prelude::*;

#[test]
fn decimal_parser_matches_clickhouse_scale_and_overflow_policy() {
    assert_eq!(parse_decimal("1.25", "cost").unwrap(), 1_250_000_000_000);
    assert_eq!(
        parse_decimal("510407.65505697404", "cost").unwrap(),
        510_407_655_056_974_040
    );
    assert_eq!(parse_decimal("0.0000000000001", "cost").unwrap(), 0);
    assert_eq!(
        parse_decimal("0.00004381800000000001", "cost").unwrap(),
        43_818_000
    );
    assert_eq!(
        parse_decimal("-1.9999999999999", "cost").unwrap(),
        -1_999_999_999_999
    );
    assert_eq!(parse_decimal("1e6", "cost").unwrap(), DECIMAL_CLAMPED_MAX);
    assert_eq!(parse_decimal("-1e6", "cost").unwrap(), DECIMAL_CLAMPED_MIN);
    assert_eq!(parse_decimal("Infinity", "cost").unwrap(), 0);
    assert_eq!(parse_decimal("-Infinity", "cost").unwrap(), 0);
    assert_eq!(parse_decimal("1e2147483647", "cost").unwrap(), 0);
    assert_eq!(parse_decimal("1e-2147483648", "cost").unwrap(), 0);
    assert_eq!(parse_decimal("", "cost").unwrap(), 0);
    assert!(parse_decimal("not-a-number", "cost").is_err());
}

#[test]
fn datetime_strings_are_explicitly_utc() {
    let naive = parse_datetime_text("2026-07-22 00:00:00.000", "timestamp").unwrap();
    let utc = parse_datetime_text("2026-07-22T00:00:00.000Z", "timestamp").unwrap();
    let offset = parse_datetime_text("2026-07-22T02:00:00.000+02:00", "timestamp").unwrap();

    assert_eq!(naive, utc);
    assert_eq!(offset, utc);
}

#[test]
fn string_column_overflow_bisects_rows_in_order() {
    let rows = [0u8, 1, 2, 3, 4];
    let mut attempts = 0;
    let mut encode = |chunk: &[u8]| {
        attempts += 1;
        if chunk.len() > 1 {
            Err(NativeColumnError::StringColumnTooLarge)
        } else {
            Ok(vec![chunk[0]])
        }
    };
    let mut blocks = Vec::new();
    encode_with_bisection(&rows, &mut encode, &mut blocks).unwrap();

    assert_eq!(
        blocks
            .iter()
            .map(|block| (block.row_count, block.bytes[0]))
            .collect::<Vec<_>>(),
        vec![(1, 0), (1, 1), (1, 2), (1, 3), (1, 4)]
    );
    assert_eq!(attempts, 9);

    let mut encode = |_: &[u8]| -> Result<Vec<u8>, NativeColumnError> {
        Err(NativeColumnError::StringColumnTooLarge)
    };
    let mut blocks = Vec::new();
    let error = encode_with_bisection(&[0u8], &mut encode, &mut blocks).unwrap_err();
    assert_eq!(error, NativeColumnError::StringColumnTooLarge);
}

proptest! {
    #[test]
    fn decimal_inputs_with_extreme_exponents_are_handled(
        integer in -999_999i64..=999_999,
        fraction in "[0-9]{1,24}",
        exponent in -1_000i32..=1_000,
    ) {
        let value = format!("{integer}.{fraction}e{exponent}");
        prop_assert!(parse_decimal(&value, "cost").is_ok());
    }

    #[test]
    fn decimal_scale_truncates_toward_zero_for_valid_prepared_costs(
        whole in -9i64..=9,
        fraction in 0u64..=9_999_999_999_999,
    ) {
        let value = format!("{whole}.{fraction:013}");
        let sign = if whole.is_negative() { -1 } else { 1 };
        let expected = whole * 1_000_000_000_000 + sign * (fraction / 10) as i64;
        prop_assert_eq!(parse_decimal(&value, "cost").unwrap(), expected);
    }
}
