use super::*;
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use proptest::prelude::*;
use serde_json::json;

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
    let value = row("🔥", "café", json!(123));
    let mut expected = value.clone();
    expected
        .as_object_mut()
        .expect("object")
        .remove("event_bytes");
    assert_eq!(
        event_bytes(&value).expect("event bytes"),
        serde_json::to_vec(&expected).unwrap().len() as u64
    );
    let mut with_a_different_size = value.clone();
    with_a_different_size["event_bytes"] = json!(u64::MAX);
    assert_eq!(
        event_bytes(&value).unwrap(),
        event_bytes(&with_a_different_size).unwrap()
    );
}

#[test]
fn zero_block_size_is_rejected() {
    let error = match encode_v4_native_blocks(&[], 0) {
        Ok(_) => panic!("zero block size must fail"),
        Err(error) => error,
    };
    assert_eq!(error, "block_size must be greater than zero");
}

#[test]
fn blocks_are_split_at_the_requested_boundary_and_are_owned() {
    let rows = vec![
        row("one", "two", Value::Null),
        row("three", "four", json!(1)),
        row("five", "six", json!(2)),
    ];
    let original_rows = rows.clone();
    let blocks = encode_v4_native_blocks(&rows, 2).expect("encode");
    assert_eq!(rows, original_rows);
    assert_eq!(
        blocks
            .iter()
            .map(|block| block.row_count)
            .collect::<Vec<_>>(),
        [2, 1]
    );
    assert!(blocks.iter().all(|block| !block.bytes.is_empty()));
}

#[test]
fn encoded_event_bytes_ignore_the_supplied_accounting_value() {
    let mut without = row("input", "output", Value::Null);
    without
        .as_object_mut()
        .expect("row object")
        .remove("event_bytes");
    let with_one = row("input", "output", json!(1));
    let with_max = row("input", "output", json!(u64::MAX));

    let without_bytes = encode_v4_native_blocks(&[without], 1).unwrap()[0]
        .bytes
        .clone();
    let with_one_bytes = encode_v4_native_blocks(&[with_one], 1).unwrap()[0]
        .bytes
        .clone();
    let with_max_bytes = encode_v4_native_blocks(&[with_max], 1).unwrap()[0]
        .bytes
        .clone();

    assert_eq!(without_bytes, with_one_bytes);
    assert_eq!(with_one_bytes, with_max_bytes);
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
    assert!(parse_decimal("not-a-number", "cost").is_err());
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
fn omitted_defaulted_columns_follow_events_full_defaults() {
    let mut value = row("input", "output", Value::Null);
    let object = value.as_object_mut().expect("row object");
    object.remove("environment");
    object.remove("evaluator_id");
    object.remove("evaluation_rule_id");
    object.remove("evaluator_execution_is_test");
    object["metadata_names"] = json!(["evaluator_id", "job_configuration_id", "evaluator_test"]);
    object["metadata_values"] = json!(["evaluator", "job", "true"]);

    assert_eq!(value_for(&value, "environment").as_ref(), &json!("default"));
    assert_eq!(
        value_for(&value, "evaluator_id").as_ref(),
        &json!("evaluator")
    );
    assert_eq!(
        value_for(&value, "evaluation_rule_id").as_ref(),
        &json!("job")
    );
    assert_eq!(
        value_for(&value, "evaluator_execution_is_test").as_ref(),
        &json!(true)
    );

    let mut explicit_empty = value.clone();
    explicit_empty["evaluation_rule_id"] = json!("");
    assert_eq!(
        value_for(&explicit_empty, "evaluation_rule_id").as_ref(),
        &json!("")
    );

    encode_v4_native_blocks(&[value], 1).expect("encode defaulted row");
}

#[test]
fn invalid_decimal_prevents_a_block_from_being_returned() {
    let mut value = row("input", "output", Value::Null);
    value["cost_details"] = json!({"output": "definitely-not-a-number"});

    let error = encode_v4_native_blocks(&[value], 1).expect_err("invalid decimal");
    assert!(error.contains("cost_details"));
    assert!(error.contains("invalid decimal"));
}

#[test]
fn normalized_ingestion_rows_match_json_each_row_and_native() {
    let Some((fixture_count, mut rows, mut json_payload)) = normalized_fixture_rows() else {
        return;
    };
    assert!(fixture_count >= 33);
    assert!(rows.len() >= 229);

    for (probe_row, probe_json) in compatibility_probe_rows() {
        rows.push(probe_row);
        json_payload.extend_from_slice(&probe_json);
    }
    assert_eq!(
        json_payload
            .split(|byte| *byte == b'\n')
            .filter(|line| !line.is_empty())
            .count(),
        rows.len()
    );

    let blocks = encode_v4_native_blocks(&rows, 16).expect("encode normalized rows");
    assert_eq!(
        blocks.iter().map(|block| block.row_count).sum::<usize>(),
        rows.len()
    );
    let payload = blocks
        .into_iter()
        .flat_map(|block| block.bytes)
        .collect::<Vec<_>>();
    let Some(comparison) = clickhouse_server_round_trip(&json_payload, &payload) else {
        return;
    };

    // All stored fields except event_bytes must match. Each serializer owns its accounting
    // definition, so compare both event_bytes totals with the expected value for that side.
    assert_eq!(comparison.json_count, rows.len() as u64);
    assert_eq!(comparison.native_count, rows.len() as u64);
    assert_eq!(comparison.json_only, 0);
    assert_eq!(comparison.native_only, 0);
    assert_eq!(
        comparison.json_event_bytes,
        rows.iter()
            .map(|row| output_u64(&row["event_bytes"]))
            .sum::<u64>()
    );
    assert_eq!(
        comparison.native_event_bytes,
        rows.iter()
            .map(|row| event_bytes(row).expect("computed event bytes"))
            .sum::<u64>()
    );
}

fn compatibility_probe_rows() -> Vec<(Value, Vec<u8>)> {
    // These are prepared events_full rows, used only to cover nullable, map, decimal, and
    // metadata-derived default paths that do not occur in the captured corpus. Keep the precise
    // decimal as a JSON number so both ClickHouse and Rust consume the same token.
    let precise: Value = serde_json::from_str("510407.65505697404").unwrap();
    let tiny: Value = serde_json::from_str("1e-13").unwrap();
    let negative: Value = serde_json::from_str("-1.9999999999999").unwrap();

    let mut populated = row("🔥", "café", json!(0));
    populated["name"] = json!("probe");
    populated["type"] = json!("GENERATION");
    populated["parent_span_id"] = json!("probe-parent");
    populated["end_time"] = json!("2026-07-22 00:00:01.000");
    populated["environment"] = json!("production");
    populated["version"] = json!("v1");
    populated["release"] = json!("release");
    populated["trace_name"] = json!("probe trace");
    populated["user_id"] = json!("user");
    populated["session_id"] = json!("session");
    populated["tags"] = json!(["probe", "🔥"]);
    populated["level"] = json!("DEFAULT");
    populated["status_message"] = json!("ok");
    populated["completion_start_time"] = json!("2026-07-22 00:00:00.123");
    populated["is_app_root"] = json!(true);
    populated["bookmarked"] = json!(true);
    populated["public"] = json!(true);
    populated["prompt_id"] = json!("prompt");
    populated["prompt_name"] = json!("prompt-name");
    populated["prompt_version"] = json!(7);
    populated["model_id"] = json!("model");
    populated["provided_model_name"] = json!("provided-model");
    populated["model_parameters"] = json!("{\"temperature\":0.2}");
    populated["provided_usage_details"] = json!({"input": 4, "output": 7});
    populated["usage_details"] = json!({"input": 4, "output": 7});
    populated["provided_cost_details"] = json!({
        "precise": precise.clone(),
        "tiny": tiny.clone(),
        "negative": negative.clone(),
    });
    populated["cost_details"] = json!({
        "precise": precise,
        "tiny": tiny,
        "negative": negative,
    });
    populated["usage_pricing_tier_id"] = json!("tier-id");
    populated["usage_pricing_tier_name"] = json!("Standard");
    populated["tool_definitions"] = json!({"weather": "{\"type\":\"function\"}"});
    populated["tool_calls"] = json!(["{\"name\":\"weather\"}"]);
    populated["tool_call_names"] = json!(["weather"]);
    populated["input"] = json!("{\"emoji\":\"🔥\"}");
    populated["output"] = json!("café");
    populated["metadata_names"] = json!(["source", "nested.value"]);
    populated["metadata_values"] = json!(["API", "42"]);
    populated["evaluator_id"] = json!("evaluator");
    populated["evaluation_rule_id"] = json!("rule");
    populated["evaluator_execution_is_test"] = json!(true);
    populated["experiment_id"] = json!("experiment");
    populated["experiment_name"] = json!("experiment-name");
    populated["experiment_metadata_names"] = json!(["dataset"]);
    populated["experiment_metadata_values"] = json!(["test"]);
    populated["experiment_description"] = json!("description");
    populated["experiment_dataset_id"] = json!("dataset");
    populated["experiment_item_id"] = json!("item");
    populated["experiment_item_version"] = json!("2026-07-22 00:00:00.456");
    populated["experiment_item_expected_output"] = json!("expected");
    populated["experiment_item_metadata_names"] = json!(["item.key"]);
    populated["experiment_item_metadata_values"] = json!(["item-value"]);
    populated["experiment_item_root_span_id"] = json!("root-span");
    populated["source"] = json!("API");
    populated["service_name"] = json!("service");
    populated["service_version"] = json!("1.2.3");
    populated["scope_name"] = json!("scope");
    populated["scope_version"] = json!("1.0");
    populated["telemetry_sdk_language"] = json!("rust");
    populated["telemetry_sdk_name"] = json!("opentelemetry");
    populated["telemetry_sdk_version"] = json!("1.30");
    populated["blob_storage_file_path"] = json!("fixtures/probe");
    populated["ingestion_api_key"] = json!("api-key");
    populated["ingestion_sdk_name"] = json!("sdk");
    populated["ingestion_sdk_version"] = json!("1.0");

    let mut defaults = row("input", "output", json!(0));
    defaults["metadata_names"] = json!(["evaluator_id", "job_configuration_id", "evaluator_test"]);
    defaults["metadata_values"] = json!(["evaluator", "job", "true"]);
    defaults["source"] = json!("API");
    defaults["ingestion_api_key"] = json!("");
    defaults["ingestion_sdk_name"] = json!("");
    defaults["ingestion_sdk_version"] = json!("");
    defaults["blob_storage_file_path"] = json!("fixtures/defaults");

    [populated, defaults]
        .into_iter()
        .map(|value| {
            let mut payload = serde_json::to_vec(&value).expect("serialize compatibility probe");
            payload.push(b'\n');
            (value, payload)
        })
        .collect()
}

fn normalized_fixture_rows() -> Option<(u64, Vec<Value>, Vec<u8>)> {
    let Some(path) = std::env::var_os("LANGFUSE_NATIVE_NORMALIZED_FIXTURES") else {
        if std::env::var_os("LANGFUSE_NATIVE_NORMALIZED_FIXTURES_REQUIRED").is_some() {
            panic!("LANGFUSE_NATIVE_NORMALIZED_FIXTURES is required");
        }
        eprintln!("normalized TypeScript fixtures not provided; skipping boundary test");
        return None;
    };
    let fixture: Value = serde_json::from_str(
        &std::fs::read_to_string(path).expect("read normalized TypeScript fixtures"),
    )
    .expect("valid normalized TypeScript fixtures");
    let fixture_count = fixture["fixtureCount"]
        .as_u64()
        .expect("normalized fixture count");
    let rows = fixture["rows"].as_array().expect("normalized rows").clone();
    let json_payload = fixture["jsonEachRow"]
        .as_str()
        .expect("JavaScript JSONEachRow payload")
        .as_bytes()
        .to_vec();
    Some((fixture_count, rows, json_payload))
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
    let required = std::env::var_os("LANGFUSE_NATIVE_CLICKHOUSE_SERVER_REQUIRED").is_some();
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
    fn blocks_preserve_row_count(
        inputs in prop::collection::vec("[a-zA-Z0-9]{0,32}", 0..12),
        block_size in 1usize..8,
    ) {
        let rows = inputs
            .iter()
            .map(|input| row(input, "output", Value::Null))
            .collect::<Vec<_>>();
        let blocks = encode_v4_native_blocks(&rows, block_size).unwrap();
        prop_assert_eq!(
            blocks.iter().map(|block| block.row_count).sum::<usize>(),
            rows.len()
        );
        prop_assert_eq!(blocks.len(), rows.len().div_ceil(block_size));
    }

    #[test]
    fn decimal_inputs_never_panic(
        integer in -999_999i64..=999_999,
        fraction in "[0-9]{1,24}",
        exponent in -1_000i32..=1_000,
    ) {
        let value = format!("{integer}.{fraction}e{exponent}");
        prop_assert!(parse_decimal(&value, "cost").is_ok());
    }

    #[test]
    fn decimal_scale_truncates_toward_zero(
        whole in -9i64..=9,
        fraction in 0u64..=9_999_999_999_999,
    ) {
        let value = format!("{whole}.{fraction:013}");
        let sign = if whole.is_negative() { -1 } else { 1 };
        let expected = whole * 1_000_000_000_000 + sign * (fraction / 10) as i64;
        prop_assert_eq!(parse_decimal(&value, "cost").unwrap(), expected);
    }
}
