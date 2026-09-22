use super::*;
use crate::native_schema::{
    find_column, ColumnKind, DefaultPolicy, PreparedEvent, EVENTS_FULL_INSERT_COLUMNS,
};
use proptest::prelude::*;
use proptest::test_runner::{Config as ProptestConfig, TestRunner};
use serde_json::json;
use std::collections::BTreeSet;
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

fn encode_json_rows(rows: &[Value], max_rows: usize) -> Result<Vec<EncodedBlock>, String> {
    let prepared = rows
        .iter()
        .map(PreparedEvent::from_json)
        .collect::<Result<Vec<_>, _>>()?;
    encode_v4_native_blocks(&prepared, max_rows)
}

fn row(input: &str, output: &str, event_bytes: Value) -> Value {
    json!({
        "project_id": "project",
        "trace_id": "trace",
        "span_id": "span",
        "start_time": "2026-07-22 00:00:00.000",
        "created_at": "2026-07-22 00:00:00.000",
        "updated_at": "2026-07-22 00:00:00.000",
        "event_ts": "2026-07-22 00:00:00.000",
        "input": input,
        "output": output,
        "metadata_names": ["source"],
        "metadata_values": ["API"],
        "provided_usage_details": {"input": 1},
        "usage_details": {"output": 2},
        "provided_cost_details": {"input": "0.000000000001"},
        "cost_details": {"output": 1.25},
        "event_bytes": event_bytes,
    })
}

#[test]
fn event_bytes_excludes_the_accounting_field_and_counts_utf8() {
    let value = json!({"input": "🔥", "event_bytes": 123});
    assert_eq!(
        event_bytes(&value).expect("event bytes"),
        "{\"input\":\"🔥\"}".len() as u64
    );
    for payload in [
        json!({}),
        json!({"event_bytes": 99}),
        json!({"nested": [null, true, {"event_bytes": 7, "text": "\"\n\\🔥"}], "cost": 1e-13}),
    ] {
        let mut expected = payload.clone();
        expected.as_object_mut().unwrap().remove("event_bytes");
        assert_eq!(
            event_bytes(&payload).unwrap(),
            serde_json::to_vec(&expected).unwrap().len() as u64
        );
    }
}

#[test]
fn zero_max_rows_per_block_is_rejected() {
    let error = match encode_json_rows(&[], 0) {
        Ok(_) => panic!("zero block size must fail"),
        Err(error) => error,
    };
    assert_eq!(error, "max_rows_per_block must be greater than zero");
}

#[test]
fn decimal_parser_matches_clickhouse_scale_and_overflow_policy() {
    assert_eq!(parse_decimal("1.25", "cost").unwrap(), 1_250_000_000_000);
    let precise_json_number: Value = serde_json::from_str("510407.65505697404").unwrap();
    assert_eq!(
        parse_decimal_value(&precise_json_number, "cost").unwrap(),
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
    assert_eq!(u16::from_json(&json!(42.0)), Ok(42));
    assert!(u16::from_json(&json!(-1.0)).is_err());
}

#[test]
fn datetime_strings_are_explicitly_utc() {
    let naive = parse_datetime_value(&json!("2026-07-22 00:00:00.000"), "timestamp").unwrap();
    let utc = parse_datetime_value(&json!("2026-07-22T00:00:00.000Z"), "timestamp").unwrap();
    let offset =
        parse_datetime_value(&json!("2026-07-22T02:00:00.000+02:00"), "timestamp").unwrap();

    assert_eq!(naive, utc);
    assert_eq!(offset, utc);
}

#[test]
fn invalid_decimal_prevents_a_prepared_event_from_being_returned() {
    let mut value = row("input", "output", Value::Null);
    value["cost_details"] = json!({"output": "definitely-not-a-number"});

    let error = PreparedEvent::from_json(&value).expect_err("invalid decimal");
    assert!(error.contains("cost_details"));
    assert!(error.contains("invalid decimal"));
}

#[derive(Debug)]
struct LiveColumn {
    name: String,
    column_type: String,
    default_kind: String,
}

fn live_events_full_schema() -> Option<Vec<LiveColumn>> {
    let output = match run_clickhouse_client(
        "SELECT name, type, default_kind FROM system.columns WHERE database = currentDatabase() AND table = 'events_full' ORDER BY position FORMAT JSONEachRow",
        &[],
    ) {
        Ok(output) => output,
        Err(error) => {
            if clickhouse_is_required() {
                panic!("ClickHouse schema introspection failed: {error}");
            }
            eprintln!("ClickHouse schema unavailable; skipping generated-row test: {error}");
            return None;
        }
    };

    output
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| {
            serde_json::from_slice::<Value>(line)
                .map_err(|error| format!("parse ClickHouse schema row: {error}"))
                .and_then(|value| {
                    Ok(LiveColumn {
                        name: value["name"]
                            .as_str()
                            .ok_or_else(|| "schema row has no column name".to_owned())?
                            .to_owned(),
                        column_type: value["type"]
                            .as_str()
                            .ok_or_else(|| "schema row has no column type".to_owned())?
                            .to_owned(),
                        default_kind: value["default_kind"]
                            .as_str()
                            .unwrap_or_default()
                            .to_owned(),
                    })
                })
        })
        .collect::<Result<Vec<_>, _>>()
        .map(Some)
        .unwrap_or_else(|error| panic!("invalid ClickHouse schema response: {error}"))
}

fn assert_live_schema_matches_codec(schema: &[LiveColumn]) {
    let actual_names = schema
        .iter()
        .filter(|column| !is_server_owned(column))
        .map(|column| column.name.clone())
        .collect::<BTreeSet<_>>();
    let expected_names = EVENTS_FULL_INSERT_COLUMNS
        .iter()
        .map(|column| column.name.to_owned())
        .collect::<BTreeSet<_>>();
    assert_eq!(
        actual_names, expected_names,
        "events_full insertable columns differ from the Native codec contract"
    );

    for column in schema.iter().filter(|column| !is_server_owned(column)) {
        let kind = ColumnKind::from_clickhouse_type(&column.column_type)
            .unwrap_or_else(|error| panic!("{}: {error}", column.name));
        let spec = find_column(&column.name).expect("column set checked above");
        assert_eq!(
            spec.kind, kind,
            "{} changed from {:?} to {}",
            column.name, spec.kind, column.column_type
        );
        if spec.default_policy != DefaultPolicy::None {
            assert_eq!(
                column.default_kind, "DEFAULT",
                "{} no longer has the DEFAULT expression required by the Native adapter",
                column.name
            );
        }
    }
}

fn is_server_owned(column: &LiveColumn) -> bool {
    matches!(column.default_kind.as_str(), "MATERIALIZED" | "ALIAS")
}

fn clickhouse_is_required() -> bool {
    std::env::var("LANGFUSE_NATIVE_FAIL_IF_CLICKHOUSE_UNAVAILABLE")
        .ok()
        .as_deref()
        == Some("1")
}

#[derive(Debug)]
struct ClickhouseComparison {
    json_count: u64,
    native_count: u64,
    json_only: u64,
    native_only: u64,
    json_event_bytes: u64,
    native_event_bytes: u64,
}

fn clickhouse_server_round_trip(
    json_payload: &[u8],
    native_payload: &[u8],
) -> Option<ClickhouseComparison> {
    let required = clickhouse_is_required();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock")
        .as_nanos();
    let json_table = format!("native_codec_json_{}_{}", std::process::id(), suffix);
    let native_table = format!("native_codec_native_{}_{}", std::process::id(), suffix);

    let create_result = run_clickhouse_client(
        &format!(
            "CREATE TABLE {json_table} AS events_full ENGINE = Memory; CREATE TABLE {native_table} AS events_full ENGINE = Memory;"
        ),
        &[],
    );
    if let Err(error) = create_result {
        let _ = run_clickhouse_client(
            &format!("DROP TABLE IF EXISTS {json_table}; DROP TABLE IF EXISTS {native_table};"),
            &[],
        );
        if required {
            panic!("ClickHouse server parity test failed to create tables: {error}");
        }
        eprintln!("ClickHouse server unavailable; skipping parity test: {error}");
        return None;
    }

    let result: Result<ClickhouseComparison, String> = (|| {
        run_clickhouse_client(
            &format!("INSERT INTO {json_table} FORMAT JSONEachRow"),
            json_payload,
        )?;
        run_clickhouse_client(
            &format!("INSERT INTO {native_table} FORMAT Native"),
            native_payload,
        )?;

        let output = run_clickhouse_client(
            &format!(
                "SELECT (SELECT count() FROM {json_table}) AS json_count, (SELECT count() FROM {native_table}) AS native_count, (SELECT count() FROM (SELECT * EXCEPT (event_bytes, provided_usage_details, usage_details, provided_cost_details, cost_details), mapSort((k, v) -> k, provided_usage_details) AS provided_usage_details, mapSort((k, v) -> k, usage_details) AS usage_details, mapSort((k, v) -> k, provided_cost_details) AS provided_cost_details, mapSort((k, v) -> k, cost_details) AS cost_details FROM {json_table} EXCEPT ALL SELECT * EXCEPT (event_bytes, provided_usage_details, usage_details, provided_cost_details, cost_details), mapSort((k, v) -> k, provided_usage_details) AS provided_usage_details, mapSort((k, v) -> k, usage_details) AS usage_details, mapSort((k, v) -> k, provided_cost_details) AS provided_cost_details, mapSort((k, v) -> k, cost_details) AS cost_details FROM {native_table})) AS json_only, (SELECT count() FROM (SELECT * EXCEPT (event_bytes, provided_usage_details, usage_details, provided_cost_details, cost_details), mapSort((k, v) -> k, provided_usage_details) AS provided_usage_details, mapSort((k, v) -> k, usage_details) AS usage_details, mapSort((k, v) -> k, provided_cost_details) AS provided_cost_details, mapSort((k, v) -> k, cost_details) AS cost_details FROM {native_table} EXCEPT ALL SELECT * EXCEPT (event_bytes, provided_usage_details, usage_details, provided_cost_details, cost_details), mapSort((k, v) -> k, provided_usage_details) AS provided_usage_details, mapSort((k, v) -> k, usage_details) AS usage_details, mapSort((k, v) -> k, provided_cost_details) AS provided_cost_details, mapSort((k, v) -> k, cost_details) AS cost_details FROM {json_table})) AS native_only, (SELECT sum(event_bytes) FROM {json_table}) AS json_event_bytes, (SELECT sum(event_bytes) FROM {native_table}) AS native_event_bytes SETTINGS asterisk_include_materialized_columns=1, asterisk_include_alias_columns=1 FORMAT JSONEachRow"
            ),
            &[],
        )?;
        let line = output
            .split(|byte| *byte == b'\n')
            .find(|line| !line.is_empty())
            .ok_or_else(|| "ClickHouse comparison returned no rows".to_owned())?;
        let value: Value = serde_json::from_slice(line)
            .map_err(|error| format!("parse ClickHouse comparison: {error}"))?;
        let comparison = ClickhouseComparison {
            json_count: output_u64(&value["json_count"]),
            native_count: output_u64(&value["native_count"]),
            json_only: output_u64(&value["json_only"]),
            native_only: output_u64(&value["native_only"]),
            json_event_bytes: output_u64(&value["json_event_bytes"]),
            native_event_bytes: output_u64(&value["native_event_bytes"]),
        };
        Ok(comparison)
    })();

    let _ = run_clickhouse_client(
        &format!("DROP TABLE IF EXISTS {json_table}; DROP TABLE IF EXISTS {native_table};"),
        &[],
    );

    match result {
        Ok(comparison) => Some(comparison),
        Err(error) => panic!("ClickHouse server parity test failed: {error}"),
    }
}

fn run_clickhouse_client(query: &str, input: &[u8]) -> Result<Vec<u8>, String> {
    let binary =
        std::env::var("LANGFUSE_NATIVE_CLICKHOUSE_BIN").unwrap_or_else(|_| "clickhouse".to_owned());
    let host = std::env::var("LANGFUSE_NATIVE_CLICKHOUSE_HOST")
        .or_else(|_| std::env::var("CLICKHOUSE_HOST"))
        .unwrap_or_else(|_| "127.0.0.1".to_owned());
    let port = std::env::var("LANGFUSE_NATIVE_CLICKHOUSE_PORT")
        .or_else(|_| std::env::var("CLICKHOUSE_PORT"))
        .unwrap_or_else(|_| "9000".to_owned());
    let user = std::env::var("CLICKHOUSE_USER").unwrap_or_else(|_| "clickhouse".to_owned());
    let password = std::env::var("CLICKHOUSE_PASSWORD").unwrap_or_else(|_| "clickhouse".to_owned());
    let database = std::env::var("CLICKHOUSE_DB").unwrap_or_else(|_| "default".to_owned());

    let mut child = Command::new(&binary)
        .args([
            "client",
            "--host",
            &host,
            "--port",
            &port,
            "--user",
            &user,
            "--password",
            &password,
            "--database",
            &database,
            "--multiquery",
            "--query",
            query,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("start {binary} client: {error}"))?;
    child
        .stdin
        .take()
        .expect("ClickHouse client stdin")
        .write_all(input)
        .map_err(|error| format!("write ClickHouse client input: {error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("wait for ClickHouse client: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(output.stdout)
}

fn output_u64(value: &Value) -> u64 {
    value
        .as_u64()
        .or_else(|| value.as_str().and_then(|value| value.parse().ok()))
        .expect("ClickHouse UInt64 output")
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

// Derive wire-format properties from the live table, independently of the native field list.
// The captured-traffic test in TypeScript separately exercises the production preparation path.
fn generated_row_strategy(schema: &[LiveColumn]) -> BoxedStrategy<Value> {
    let fields = schema
        .iter()
        .filter(|column| !is_server_owned(column))
        .map(|column| {
            let name = column.name.clone();
            let kind = ColumnKind::from_clickhouse_type(&column.column_type).unwrap();
            let value = match name.as_str() {
                "type" => {
                    prop::sample::select(vec![json!("SPAN"), json!("GENERATION"), json!("EVENT")])
                        .boxed()
                }
                "level" => {
                    prop::sample::select(vec![json!("DEFAULT"), json!("ERROR"), json!("WARNING")])
                        .boxed()
                }
                "source" => Just(json!("API")).boxed(),
                _ => generated_value_strategy(kind),
            };
            (value, any::<bool>()).prop_map(move |(value, omit)| {
                let defaulted = find_column(&name).unwrap().default_policy != DefaultPolicy::None;
                (
                    name.clone(),
                    if omit && defaulted { None } else { Some(value) },
                )
            })
        })
        .collect::<Vec<_>>();
    fields
        .prop_map(|fields| {
            let mut object = fields
                .into_iter()
                .filter_map(|(name, value)| value.map(|v| (name, v)))
                .collect::<serde_json::Map<_, _>>();
            for prefix in [
                "metadata",
                "experiment_metadata",
                "experiment_item_metadata",
            ] {
                let values = object[&format!("{prefix}_values")].as_array().unwrap();
                let names = [
                    "evaluator_id",
                    "evaluation_rule_id",
                    "job_configuration_id",
                    "evaluator_test",
                ];
                object.insert(format!("{prefix}_names"), json!(&names[..values.len()]));
            }
            Value::Object(object)
        })
        .boxed()
}

fn generated_value_strategy(kind: ColumnKind) -> BoxedStrategy<Value> {
    let text = prop_oneof![
        prop::collection::vec(any::<char>(), 0..24)
            .prop_map(|chars| chars.into_iter().collect::<String>()),
        Just("true".to_owned()),
        Just(String::new()),
    ]
    .boxed();
    let datetime = (0i64..2_000_000_000, 0u32..1_000_000)
        .prop_map(|(seconds, micros)| {
            json!(DateTime::<Utc>::from_timestamp(seconds, micros * 1000)
                .unwrap()
                .format("%Y-%m-%d %H:%M:%S%.6f")
                .to_string())
        })
        .boxed();
    match kind {
        ColumnKind::String => text.prop_map(Value::String).boxed(),
        ColumnKind::NullableString => prop::option::of(text).prop_map(|v| json!(v)).boxed(),
        ColumnKind::DateTime64 => datetime,
        ColumnKind::NullableDateTime64 => prop_oneof![Just(Value::Null), datetime].boxed(),
        ColumnKind::NullableUInt16 => prop::option::of(any::<u16>())
            .prop_map(|v| json!(v))
            .boxed(),
        ColumnKind::Bool => any::<bool>().prop_map(|v| json!(v)).boxed(),
        ColumnKind::UInt8 => (0u8..=1).prop_map(|v| json!(v)).boxed(),
        ColumnKind::UInt16 => any::<u16>().prop_map(|v| json!(v)).boxed(),
        ColumnKind::UInt64 => (0u64..=9_007_199_254_740_991)
            .prop_map(|v| json!(v))
            .boxed(),
        ColumnKind::Decimal => (-999_999.0f64..999_999.0).prop_map(|v| json!(v)).boxed(),
        ColumnKind::ArrayString => prop::collection::vec(text, 0..=4)
            .prop_map(|v| json!(v))
            .boxed(),
        ColumnKind::MapStringString => prop::collection::btree_map(text.clone(), text, 0..=4)
            .prop_map(|v| json!(v))
            .boxed(),
        ColumnKind::MapStringUInt64 => {
            prop::collection::btree_map(text, 0u64..=9_007_199_254_740_991, 0..=4)
                .prop_map(|v| json!(v))
                .boxed()
        }
        ColumnKind::MapStringDecimal => {
            prop::collection::btree_map(text, -999_999.0f64..999_999.0, 0..=4)
                .prop_map(|v| json!(v))
                .boxed()
        }
    }
}

#[test]
fn generated_prepared_rows_match_json_each_row_and_native() {
    let Some(schema) = live_events_full_schema() else {
        return;
    };
    assert_live_schema_matches_codec(&schema);
    let mut runner = TestRunner::new(ProptestConfig {
        cases: 32,
        ..ProptestConfig::default()
    });
    runner
        .run(
            &(
                prop::collection::vec(generated_row_strategy(&schema), 1..=8),
                1usize..=8,
            ),
            |(rows, max_rows)| {
                let blocks = encode_json_rows(&rows, max_rows).map_err(TestCaseError::fail)?;
                prop_assert_eq!(blocks.len(), rows.len().div_ceil(max_rows));
                for (block, expected_rows) in blocks.iter().zip(rows.chunks(max_rows)) {
                    prop_assert_eq!(block.row_count, expected_rows.len());
                }
                let native_payload = blocks
                    .into_iter()
                    .flat_map(|block| block.bytes)
                    .collect::<Vec<_>>();
                let json_payload = rows
                    .iter()
                    .flat_map(|row| {
                        let mut bytes = serde_json::to_vec(row).unwrap();
                        bytes.push(b'\n');
                        bytes
                    })
                    .collect::<Vec<_>>();
                let comparison = clickhouse_server_round_trip(&json_payload, &native_payload)
                    .expect("schema introspection succeeded, so parity server is available");
                prop_assert_eq!(comparison.json_count, rows.len() as u64);
                prop_assert_eq!(comparison.native_count, rows.len() as u64);
                prop_assert_eq!(comparison.json_only, 0);
                prop_assert_eq!(comparison.native_only, 0);
                prop_assert_eq!(
                    comparison.json_event_bytes,
                    rows.iter()
                        .map(|r| output_u64(&r["event_bytes"]))
                        .sum::<u64>()
                );
                prop_assert_eq!(
                    comparison.native_event_bytes,
                    rows.iter().map(|r| event_bytes(r).unwrap()).sum::<u64>()
                );
                Ok(())
            },
        )
        .expect("generated prepared rows match JSONEachRow and Native");
}
