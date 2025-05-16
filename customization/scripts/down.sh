#!/usr/bin/env bash
set -euo pipefail

echo "🛑 Stopping Langfuse stack and removing containers..."
docker compose down
