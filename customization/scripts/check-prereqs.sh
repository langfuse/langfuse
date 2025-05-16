#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Checking prerequisites..."

REQUIRED=("git" "make" "docker")
MISSING=0

for cmd in "${REQUIRED[@]}"; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "❌ $cmd is not installed"
    MISSING=1
  else
    echo "✅ $cmd is installed"
  fi
done

# Check Docker Compose v2 (plugin)
if docker compose version &>/dev/null; then
  echo "✅ docker compose (v2 plugin) is available"
else
  echo "❌ docker compose (v2) is missing or not configured correctly"
  MISSING=1
fi

if [[ "$MISSING" -eq 1 ]]; then
  echo -e "\n⚠️  One or more required tools are missing."
  echo "Please install them before continuing: https://docs.docker.com/get-docker/"
  exit 1
else
  echo -e "\n🎉 All prerequisites are satisfied."
fi
