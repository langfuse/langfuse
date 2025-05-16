#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Docker Compose service status:"
docker compose ps

echo -e "\n🔎 Checking health endpoints:\n"

echo "# langfuse-web: /api/public/health"
curl -s -w " -> %{http_code}\\n" http://localhost:3000/api/public/health || echo "Failed to connect"

echo "# langfuse-web: /api/public/ready"
curl -s -w " -> %{http_code}\\n" http://localhost:3000/api/public/ready || echo "Failed to connect"

echo "# langfuse-worker: /api/health"
curl -s -w " -> %{http_code}\\n" http://localhost:3030/api/health || echo "Failed to connect"
