#!/usr/bin/env bash

set -euo pipefail

container_id="$(docker ps --filter label=com.docker.compose.service=clickhouse --format '{{.ID}}' | head -n 1)"

if [ -z "$container_id" ]; then
  echo "No running Docker Compose ClickHouse service found." >&2
  exit 1
fi

exec docker exec -i "$container_id" clickhouse "$@"
