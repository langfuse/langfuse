#!/usr/bin/env bash
set -e

missing=0

check() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "❌ Missing required dependency: $1"
    missing=1
  else
    echo "✅ Found $1"
  fi
}

check docker
check docker-compose || check docker
check clickhouse-client
check migrate

if [ "$missing" -eq 1 ]; then
  echo ""
  echo "👉 Please install the missing tools before running Langfuse locally."
  echo "📖 Docs: https://github.com/langfuse/langfuse#development-setup"
  exit 1
fi
