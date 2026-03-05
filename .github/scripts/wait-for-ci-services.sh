#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${1:-docker-compose.dev.yml}"
WAIT_TIMEOUT_SECONDS="${CI_SERVICES_WAIT_TIMEOUT_SECONDS:-120}"
WAIT_INTERVAL_SECONDS="${CI_SERVICES_WAIT_INTERVAL_SECONDS:-2}"

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

has_service() {
  compose ps --services | grep -Fxq "$1"
}

wait_until() {
  local description="$1"
  shift

  local start_ts="$SECONDS"
  until "$@"; do
    if (( SECONDS - start_ts >= WAIT_TIMEOUT_SECONDS )); then
      echo "Timed out waiting for ${description} after ${WAIT_TIMEOUT_SECONDS}s"
      compose ps || true
      exit 1
    fi
    sleep "${WAIT_INTERVAL_SECONDS}"
  done
  echo "Ready: ${description}"
}

if has_service "postgres"; then
  postgres_id="$(compose ps -q postgres)"
  wait_until "postgres" bash -lc "docker exec ${postgres_id} pg_isready -U postgres >/dev/null 2>&1"
fi

if has_service "clickhouse"; then
  wait_until "clickhouse" bash -lc "curl -fsS http://127.0.0.1:8123/ping | grep -q '^Ok\\.$'"
fi

if has_service "redis-node-5"; then
  redis_cluster_id="$(compose ps -q redis-node-5)"
  wait_until "redis-cluster" bash -lc "docker exec ${redis_cluster_id} sh -lc 'redis-cli -a bitnami -p 6375 cluster info 2>/dev/null | grep -q cluster_state:ok'"
elif has_service "redis"; then
  redis_id="$(compose ps -q redis)"
  wait_until "redis" bash -lc "docker exec ${redis_id} sh -lc 'redis-cli -a myredissecret ping 2>/dev/null | grep -q PONG || redis-cli -a bitnami ping 2>/dev/null | grep -q PONG'"
fi

if has_service "azurite"; then
  wait_until "azurite" bash -lc "curl -sS -o /dev/null http://127.0.0.1:10000/"
fi
