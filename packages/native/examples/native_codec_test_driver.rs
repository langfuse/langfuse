//! Test driver used by the worker's TypeScript parity suite; not an addon export.

#[allow(dead_code)]
#[path = "../src/native_codec.rs"]
mod native_codec;
#[allow(dead_code)]
#[path = "../src/native_schema.rs"]
mod native_schema;

use native_codec::encode_v4_native_blocks;
use native_schema::PreparedEvent;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{env, fs, path::Path};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeCodecTestInput {
    rows: Vec<Value>,
    max_rows_per_block: usize,
}

fn main() {
    let input_path = env::var("LANGFUSE_NATIVE_TEST_INPUT")
        .expect("LANGFUSE_NATIVE_TEST_INPUT must point to the JSON input");
    let output_dir = env::var("LANGFUSE_NATIVE_TEST_OUTPUT")
        .expect("LANGFUSE_NATIVE_TEST_OUTPUT must point to an existing directory");
    let input: NativeCodecTestInput =
        serde_json::from_slice(&fs::read(&input_path).expect("read LANGFUSE_NATIVE_TEST_INPUT"))
            .expect("parse native codec test input");
    let prepared = input
        .rows
        .iter()
        .map(PreparedEvent::from_json)
        .collect::<Result<Vec<_>, _>>()
        .expect("prepare native codec test rows");
    let event_bytes = prepared
        .iter()
        .map(|row| row.event_bytes)
        .collect::<Vec<_>>();
    let blocks = encode_v4_native_blocks(&prepared, input.max_rows_per_block)
        .expect("encode native codec test rows");
    let mut native_payload = Vec::new();
    for block in blocks {
        native_payload.extend_from_slice(&block.bytes);
    }

    let output_dir = Path::new(&output_dir);
    fs::write(output_dir.join("native.bin"), native_payload).expect("write native.bin");
    let manifest = json!({
        "eventBytes": event_bytes,
    });
    fs::write(
        output_dir.join("manifest.json"),
        serde_json::to_vec(&manifest).expect("serialize manifest"),
    )
    .expect("write manifest.json");
}
