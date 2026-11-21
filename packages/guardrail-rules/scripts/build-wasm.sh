#!/usr/bin/env bash
# Builds the WebAssembly module and Node.js bindings into $OUT (default /tmp/guardrail-rules-pkg).
# Needs: rustup target wasm32-unknown-unknown, and a wasm-bindgen CLI matching Cargo.lock.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${OUT:-/tmp/guardrail-rules-pkg}"
TARGET_DIR="${CARGO_TARGET_DIR:-target}"
CARGO_TARGET_DIR="$TARGET_DIR" cargo build --release --target wasm32-unknown-unknown --features wasm
"${WASM_BINDGEN:-wasm-bindgen}" --target nodejs --out-dir "$OUT" "$TARGET_DIR/wasm32-unknown-unknown/release/guardrail_rules.wasm"
echo "built $OUT ($(wc -c < "$OUT/guardrail_rules_bg.wasm") bytes wasm, $(gzip -9 -c "$OUT/guardrail_rules_bg.wasm" | wc -c) gzipped)"
