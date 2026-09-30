#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
UP_SCRIPT="$SCRIPT_DIR/up.sh"

if [ ! -f "$UP_SCRIPT" ]; then
  echo "ERROR: up.sh not found: $UP_SCRIPT" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required to run this test" >&2
  exit 1
fi

PASSWORD='p@ss&word#with?reserved%chars+here='

EXPECTED='p%40ss%26word%23with%3Freserved%25chars%2Bhere%3D'

ACTUAL=$(node -e \
  'process.stdout.write(encodeURIComponent(process.argv[1]))' \
  "$PASSWORD")

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "ERROR: ClickHouse password was not encoded as expected" >&2
  echo "Expected: $EXPECTED" >&2
  echo "Actual:   $ACTUAL" >&2
  exit 1
fi

if ! grep -Fq \
  'encodeURIComponent(process.argv[1])' \
  "$UP_SCRIPT"; then
  echo "ERROR: up.sh does not URL-encode CLICKHOUSE_PASSWORD" >&2
  exit 1
fi

echo "PASS: ClickHouse migration password URL encoding regression test"
