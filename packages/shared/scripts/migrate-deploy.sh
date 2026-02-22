#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${DIRECT_URL:-}" ]]; then
  if [[ -n "${DATABASE_URL:-}" ]]; then
    export DIRECT_URL="${DATABASE_URL}"
  else
    echo "Error: DIRECT_URL or DATABASE_URL must be set."
    exit 1
  fi
fi

run_cleanup() {
  npx -- prisma db execute --url "${DIRECT_URL}" --file "./scripts/cleanup.sql"
}

run_migrate() {
  npx -- prisma migrate deploy --schema=./prisma/schema.prisma
}

run_cleanup

if ! run_migrate; then
  echo "Initial prisma migrate deploy failed. Re-running cleanup patches and retrying once..."
  run_cleanup
  run_migrate
fi
