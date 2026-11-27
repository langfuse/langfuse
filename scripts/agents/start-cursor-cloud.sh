#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="${CURSOR_COMPOSE_FILE:-$repo_root/docker-compose.build.yml}"
wait_timeout="${CURSOR_COMPOSE_WAIT_TIMEOUT_SECONDS:-600}"
compose_project_name="${CURSOR_COMPOSE_PROJECT_NAME:-langfuse-cursor}"

# The workspace .env is for processes running on the host and therefore uses
# localhost service URLs. Compose services need container-network hostnames.
# Start from a clean environment and explicitly preserve only Docker and
# public build controls that are safe inputs to this self-contained stack.
compose_env=(
  "HOME=$HOME"
  "PATH=$PATH"
  "COMPOSE_PROJECT_NAME=$compose_project_name"
)

for variable_name in \
  BUILDKIT_PROGRESS \
  DOCKER_CERT_PATH \
  DOCKER_CONFIG \
  DOCKER_CONTEXT \
  DOCKER_HOST \
  DOCKER_TLS_VERIFY \
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION \
  XDG_CONFIG_HOME; do
  if declare -p "$variable_name" >/dev/null 2>&1; then
    compose_env+=("$variable_name=${!variable_name}")
  fi
done

compose() {
  env -i "${compose_env[@]}" \
    docker compose --env-file /dev/null -f "$compose_file" "$@"
}

# Nested Cursor VMs have been observed with /var/run (or /run) mode 0700.
# The ubuntu agent user is in the docker group and docker.sock may already be
# group/world accessible, but a non-executable parent directory still makes
# `docker info` fail with "permission denied" even when dockerd is healthy.
# Open search/execute on the socket parent dirs (and loosen the socket itself
# if needed) before probing the daemon.
ensure_docker_socket_reachable() {
  local sock="${CURSOR_DOCKER_SOCKET:-/var/run/docker.sock}"
  local sock_dir
  sock_dir="$(dirname "$sock")"

  if [ -S "$sock" ] && [ -r "$sock" ] && [ -w "$sock" ]; then
    return 0
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    return 0
  fi

  # Prefer the real runtime dirs; CURSOR_DOCKER_SOCKET is for tests.
  sudo chmod a+rx "$sock_dir" 2>/dev/null || true
  if [ "$sock_dir" = "/var/run" ] || [ "$sock_dir" = "/run" ]; then
    sudo chmod a+rx /var/run /run 2>/dev/null || true
  fi

  if sudo test -S "$sock" 2>/dev/null; then
    if ! { [ -r "$sock" ] && [ -w "$sock" ]; } 2>/dev/null; then
      sudo chgrp docker "$sock" 2>/dev/null || true
      sudo chmod 666 "$sock" 2>/dev/null || true
    fi
  fi
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

ensure_docker_socket_reachable

if ! docker info >/dev/null 2>&1; then
  sudo service docker start
  # service start can recreate /var/run with mode 0700 again.
  ensure_docker_socket_reachable
fi

for _ in $(seq 1 60); do
  ensure_docker_socket_reachable
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker info >/dev/null

compose up -d --build --wait --wait-timeout "$wait_timeout"

cd "$repo_root"
env -i \
  "HOME=$HOME" \
  "PATH=$PATH" \
  "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres" \
  "DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres" \
  "CLICKHOUSE_MIGRATION_URL=clickhouse://127.0.0.1:9000" \
  "CLICKHOUSE_URL=http://127.0.0.1:8123" \
  "CLICKHOUSE_USER=clickhouse" \
  "CLICKHOUSE_PASSWORD=clickhouse" \
  "REDIS_HOST=127.0.0.1" \
  "REDIS_PORT=6379" \
  "REDIS_AUTH=myredissecret" \
  pnpm --filter=shared run db:seed

curl --fail --silent --show-error "http://127.0.0.1:3000/api/public/health" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:3030/api/health" >/dev/null

compose ps
trap - ERR

echo "Cursor Cloud Langfuse stack is healthy: 6 services, web :3000, worker :3030."
