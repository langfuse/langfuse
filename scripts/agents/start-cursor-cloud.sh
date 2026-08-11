#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="${CURSOR_COMPOSE_FILE:-$repo_root/docker-compose.build.yml}"
wait_timeout="${CURSOR_COMPOSE_WAIT_TIMEOUT_SECONDS:-600}"
web_host_port="${LANGFUSE_WEB_HOST_PORT:-3000}"
worker_host_port="${LANGFUSE_WORKER_HOST_PORT:-3030}"

export COMPOSE_PROJECT_NAME="${CURSOR_COMPOSE_PROJECT_NAME:-langfuse-cursor}"

compose() {
  docker compose -f "$compose_file" "$@"
}

dump_diagnostics() {
  local exit_code=$?
  trap - ERR
  set +e

  echo "Cursor Cloud stack startup failed; collecting Docker diagnostics."
  docker info
  compose ps -a
  compose logs --tail=200 langfuse-web langfuse-worker postgres clickhouse redis minio

  exit "$exit_code"
}

trap dump_diagnostics ERR

if ! docker info >/dev/null 2>&1; then
  sudo service docker start
fi

for _ in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker info >/dev/null

compose up -d --build --wait --wait-timeout "$wait_timeout"

cd "$repo_root"
pnpm --filter=shared run db:seed

curl --fail --silent --show-error "http://127.0.0.1:${web_host_port}/api/public/health" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${worker_host_port}/api/health" >/dev/null

compose ps
trap - ERR

echo "Cursor Cloud Langfuse stack is healthy: 6 services, web :${web_host_port}, worker :${worker_host_port}."
