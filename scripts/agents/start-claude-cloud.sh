#!/usr/bin/env bash
# Starts dockerd and the dev Docker Compose stack (Postgres, ClickHouse, Redis,
# MinIO) for Claude Code on the web. setup-claude-cloud.sh installs this as a
# SessionStart hook; its stdout is added to the session's context. As a hook it
# never fails the session, it only reports. With LANGFUSE_DEV_SERVICES_STRICT=1
# it exits non-zero unless every service is up and healthy.
#
#   start-claude-cloud.sh [repo_root]

set -uo pipefail

repo_root="${1:-${CLAUDE_PROJECT_DIR:-}}"
log_file=/tmp/langfuse-dev-services.log
failure_status=0
[ "${LANGFUSE_DEV_SERVICES_STRICT:-}" = "1" ] && failure_status=1

if [ -z "$repo_root" ] || [ ! -f "$repo_root/docker-compose.dev.yml" ]; then
  echo "No docker-compose.dev.yml under '$repo_root'; dev services not started." >&2
  exit "$failure_status"
fi

if ! docker info >/dev/null 2>&1; then
  # The environment snapshot keeps pid files from the setup run, and a reused
  # PID makes dockerd refuse to start.
  if ! pgrep -x dockerd >/dev/null; then
    rm -f /var/run/docker.pid /var/run/docker/containerd/containerd.pid
  fi
  # Anonymous Docker Hub pulls are rate limited from cloud egress IPs.
  nohup dockerd --registry-mirror=https://mirror.gcr.io >/var/log/dockerd.log 2>&1 &
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi

if (cd "$repo_root" && docker compose -f docker-compose.dev.yml up -d --wait) >"$log_file" 2>&1; then
  echo "Langfuse dev services (Postgres, ClickHouse, Redis, MinIO) are running."
else
  echo "Langfuse dev services failed to start; see $log_file."
  exit "$failure_status"
fi
