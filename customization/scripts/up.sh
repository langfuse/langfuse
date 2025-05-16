#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting Langfuse stack..."
docker compose up -d

echo "📋 Showing container logs..."
docker compose logs -f
