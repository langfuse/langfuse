#!/usr/bin/env bash
# `clickhouse` at the exact version CI formats golden SQL with, via Docker.
# Use as CLICKHOUSE_BIN so local snapshots match CI byte for byte:
#   CLICKHOUSE_BIN="$PWD/.agents/skills/query-ast-equivalence/scripts/clickhouse-ci.sh" \
#     pnpm --filter @langfuse/shared run test .golden.test
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pipeline="$script_dir/../../../../.github/workflows/pipeline.yml"

version="${CLICKHOUSE_CI_VERSION:-}"
if [ -z "$version" ]; then
  version="$(sed -nE 's/^[[:space:]]*CLICKHOUSE_VERSION:[[:space:]]*"?([0-9.]+)"?.*/\1/p' "$pipeline" | head -n 1)"
fi
if [ -z "$version" ]; then
  echo "clickhouse-ci.sh: no CLICKHOUSE_VERSION pin found in $pipeline" >&2
  exit 2
fi

exec docker run --rm -i --entrypoint clickhouse \
  "clickhouse/clickhouse-server:${version}" "$@"
