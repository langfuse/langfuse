#!/usr/bin/env bash

set -euo pipefail

target_dir="${CARGO_TARGET_DIR:-target}"
if [[ -n "${CARGO_BUILD_TARGET:-}" ]]; then
  target_dir="${target_dir}/${CARGO_BUILD_TARGET}"
fi

binary="${target_dir}/debug/ai-gateway"

if [[ -z "${TURBO_HASH:-}" || ( ! -f "${binary}" && ! -f "${binary}.exe" ) ]]; then
  cargo build --locked
fi

if [[ -f "${binary}.exe" ]]; then
  binary="${binary}.exe"
fi

exec "${binary}"
