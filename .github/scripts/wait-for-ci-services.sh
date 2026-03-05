#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${1:-docker-compose.dev.yml}"
WAIT_TIMEOUT_SECONDS="${CI_SERVICES_WAIT_TIMEOUT_SECONDS:-120}"
REDIS_CLUSTER_WAIT_TIMEOUT_SECONDS="${CI_REDIS_CLUSTER_WAIT_TIMEOUT_SECONDS:-300}"
WAIT_INTERVAL_SECONDS="${CI_SERVICES_WAIT_INTERVAL_SECONDS:-2}"

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

has_service() {
  compose ps --services | grep -Fxq "$1"
}

wait_until() {
  local description="$1"
  local timeout_seconds="$2"
  shift 2

  local start_ts="$SECONDS"
  until "$@"; do
    if (( SECONDS - start_ts >= timeout_seconds )); then
      echo "Timed out waiting for ${description} after ${timeout_seconds}s"
      compose ps || true
      exit 1
    fi
    sleep "${WAIT_INTERVAL_SECONDS}"
  done
  echo "Ready: ${description}"
}

if has_service "postgres"; then
  postgres_id="$(compose ps -q postgres)"
  wait_until "postgres" "${WAIT_TIMEOUT_SECONDS}" bash -lc "docker exec ${postgres_id} pg_isready -U postgres >/dev/null 2>&1"
fi

if has_service "clickhouse"; then
  wait_until "clickhouse" "${WAIT_TIMEOUT_SECONDS}" bash -lc "curl -fsS http://127.0.0.1:8123/ping | grep -q '^Ok\\.$'"
fi

if has_service "redis-node-5"; then
  redis_cluster_id="$(compose ps -q redis-node-5)"
  wait_until "redis-cluster node readiness" "${REDIS_CLUSTER_WAIT_TIMEOUT_SECONDS}" bash -lc "docker exec ${redis_cluster_id} sh -lc '
    for port in 6370 6371 6372 6373 6374 6375; do
      redis-cli -a bitnami -p \"\${port}\" ping >/dev/null 2>&1 || exit 1
    done
  '"

  redis_cluster_start_ts="$SECONDS"
  until bash -lc "docker exec ${redis_cluster_id} sh -lc '
      for port in 6370 6371 6372 6373 6374 6375; do
        if redis-cli -a bitnami -p \"\${port}\" cluster info 2>/dev/null | grep -q \"cluster_state:ok\"; then
          exit 0
        fi
      done
      exit 1
    '"; do
    if (( SECONDS - redis_cluster_start_ts >= REDIS_CLUSTER_WAIT_TIMEOUT_SECONDS )); then
      echo "Timed out waiting for redis-cluster state after ${REDIS_CLUSTER_WAIT_TIMEOUT_SECONDS}s"
      compose ps || true
      docker exec "${redis_cluster_id}" sh -lc '
        echo "redis-cluster info (6375):"
        redis-cli -a bitnami -p 6375 cluster info || true
        echo "redis-cluster nodes (6375):"
        redis-cli -a bitnami -p 6375 cluster nodes || true
      ' || true
      exit 1
    fi
    sleep "${WAIT_INTERVAL_SECONDS}"
  done
  echo "Ready: redis-cluster state"
elif has_service "redis"; then
  redis_id="$(compose ps -q redis)"
  wait_until "redis" "${WAIT_TIMEOUT_SECONDS}" bash -lc "docker exec ${redis_id} sh -lc 'redis-cli -a myredissecret ping 2>/dev/null | grep -q PONG || redis-cli -a bitnami ping 2>/dev/null | grep -q PONG'"
fi

if has_service "azurite"; then
  wait_until "azurite" "${WAIT_TIMEOUT_SECONDS}" bash -lc "curl -sS -o /dev/null http://127.0.0.1:10000/"
fi
