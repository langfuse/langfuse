#!/usr/bin/env bash
# Builds the WebAssembly module and its Node.js bindings into $OUT (default pkg/,
# which is committed so web builds need no Rust toolchain). CI rebuilds it and
# fails when the result differs from the committed files, so the build must be
# reproducible: the toolchain comes from rust-toolchain.toml, wasm-bindgen is
# pinned here and in Cargo.toml, and build paths are remapped.
set -euo pipefail
cd "$(dirname "$0")/.."
WASM_BINDGEN_VERSION="0.2.130"
OUT="${OUT:-pkg}"
TARGET_DIR="${CARGO_TARGET_DIR:-target}"
WASM_BINDGEN="${WASM_BINDGEN:-wasm-bindgen}"

if [[ "$("$WASM_BINDGEN" --version)" != "wasm-bindgen $WASM_BINDGEN_VERSION" ]]; then
  echo "need wasm-bindgen $WASM_BINDGEN_VERSION: cargo install wasm-bindgen-cli --version $WASM_BINDGEN_VERSION --locked" >&2
  exit 1
fi

# Panic messages embed source paths; remap them so the binary does not depend
# on the checkout or cargo home location.
export RUSTFLAGS="--remap-path-prefix=$PWD=/guardrail-rules --remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=/cargo"
CARGO_TARGET_DIR="$TARGET_DIR" cargo build --locked --release --target wasm32-unknown-unknown --features wasm

rm -rf "$OUT"
"$WASM_BINDGEN" --target nodejs --out-dir "$OUT" "$TARGET_DIR/wasm32-unknown-unknown/release/guardrail_rules.wasm"
echo "built $OUT ($(wc -c < "$OUT/guardrail_rules_bg.wasm") bytes wasm, $(gzip -9 -c "$OUT/guardrail_rules_bg.wasm" | wc -c) gzipped)"
