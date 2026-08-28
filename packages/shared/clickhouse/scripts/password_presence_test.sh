#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

cat >"$TEST_DIR/migrate" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat >"$TEST_DIR/clickhouse" <<'EOF'
#!/usr/bin/env bash
cat >/dev/null
EOF

chmod +x "$TEST_DIR/migrate" "$TEST_DIR/clickhouse"

run_up() {
  local password_state="$1"
  if [[ "$password_state" == unset ]]; then
    env -i PATH="$TEST_DIR:$PATH" \
      CLICKHOUSE_URL=clickhouse://localhost:8123 \
      CLICKHOUSE_MIGRATION_URL=clickhouse://localhost:9000 \
      CLICKHOUSE_USER=default \
      bash "$SCRIPT_DIR/up.sh"
  else
    env -i PATH="$TEST_DIR:$PATH" \
      CLICKHOUSE_URL=clickhouse://localhost:8123 \
      CLICKHOUSE_MIGRATION_URL=clickhouse://localhost:9000 \
      CLICKHOUSE_USER=default \
      CLICKHOUSE_PASSWORD="$password_state" \
      bash "$SCRIPT_DIR/up.sh"
  fi
}

run_dev_tables() {
  local password_state="$1"
  if [[ "$password_state" == unset ]]; then
    env -i PATH="$TEST_DIR:$PATH" \
      CLICKHOUSE_MIGRATION_URL=clickhouse://localhost:9000 \
      CLICKHOUSE_USER=default \
      bash "$SCRIPT_DIR/dev-tables.sh"
  else
    env -i PATH="$TEST_DIR:$PATH" \
      CLICKHOUSE_MIGRATION_URL=clickhouse://localhost:9000 \
      CLICKHOUSE_USER=default \
      CLICKHOUSE_PASSWORD="$password_state" \
      bash "$SCRIPT_DIR/dev-tables.sh"
  fi
}

if run_up unset; then
  echo "up.sh unexpectedly accepted an unset CLICKHOUSE_PASSWORD" >&2
  exit 1
fi

if ! run_up ""; then
  echo "up.sh rejected an explicitly empty CLICKHOUSE_PASSWORD" >&2
  exit 1
fi

if ! run_up non-empty; then
  echo "up.sh rejected a non-empty CLICKHOUSE_PASSWORD" >&2
  exit 1
fi

if run_dev_tables unset; then
  echo "dev-tables.sh unexpectedly accepted an unset CLICKHOUSE_PASSWORD" >&2
  exit 1
fi

if ! run_dev_tables ""; then
  echo "dev-tables.sh rejected an explicitly empty CLICKHOUSE_PASSWORD" >&2
  exit 1
fi

if ! run_dev_tables non-empty; then
  echo "dev-tables.sh rejected a non-empty CLICKHOUSE_PASSWORD" >&2
  exit 1
fi

echo "password presence checks passed"
