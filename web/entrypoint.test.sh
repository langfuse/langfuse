#!/usr/bin/env bash
# Regression test for the "Common cause 2" ClickHouse migration failure
# message: it must not be printed unconditionally, only when
# CLICKHOUSE_PASSWORD actually contains characters that need URL-encoding.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}

trap cleanup EXIT

app_root="$tmpdir/app"
mkdir -p "$app_root/web" "$app_root/packages/shared/clickhouse/scripts" "$tmpdir/bin"

cp "$repo_root/web/entrypoint.sh" "$app_root/web/entrypoint.sh"
chmod +x "$app_root/web/entrypoint.sh"

# Stub prisma so the postgres migration step always succeeds, leaving only
# the ClickHouse migration to fail.
cat <<'EOF' > "$tmpdir/bin/prisma"
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$tmpdir/bin/prisma"

# Simulate a ClickHouse migration failure unrelated to the password, e.g. a
# dirty schema_migrations state.
cat <<'EOF' > "$app_root/packages/shared/clickhouse/scripts/up.sh"
#!/bin/sh
echo "error: Dirty database version 1. Fix and force version."
exit 1
EOF
chmod +x "$app_root/packages/shared/clickhouse/scripts/up.sh"

run_entrypoint() {
  (
    cd "$app_root"
    PATH="$tmpdir/bin:$PATH" \
      DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
      CLICKHOUSE_URL="http://localhost:8123" \
      CLICKHOUSE_PASSWORD="plainpassword" \
      sh web/entrypoint.sh true
  )
}

output="$(run_entrypoint || true)"

if ! printf '%s\n' "$output" | grep -Fq "Applying clickhouse migrations failed. Common causes:"; then
  echo "expected the clickhouse failure banner to still print"
  printf '%s\n' "$output"
  exit 1
fi

if printf '%s\n' "$output" | grep -Fq "CLICKHOUSE_PASSWORD contains special characters that are not URL-encoded."; then
  echo "the unconditional CLICKHOUSE_PASSWORD hint must not print for a plain alphanumeric password"
  printf '%s\n' "$output"
  exit 1
fi

echo "entrypoint.sh clickhouse failure message test passed"
