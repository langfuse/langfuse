#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmpdir="$(mktemp -d)"
command_log="$tmpdir/commands.log"
docker_ready="$tmpdir/docker-ready"
test_docker_socket="$tmpdir/locked/docker.sock"

cleanup() {
  rm -rf "$tmpdir"
}

trap cleanup EXIT
mkdir -p "$tmpdir/bin" "$tmpdir/locked"

cat <<EOF > "$tmpdir/bin/docker"
#!/usr/bin/env bash
printf 'docker %s\n' "\$*" >> "$command_log"
if [ "\${1:-}" = "compose" ]; then
  printf 'compose DATABASE_URL=%s\n' "\${DATABASE_URL-<unset>}" >> "$command_log"
fi
if [ "\${1:-}" = "info" ] && [ ! -f "$docker_ready" ]; then
  exit 1
fi
exit 0
EOF

cat <<EOF > "$tmpdir/bin/service"
#!/usr/bin/env bash
printf 'service %s\n' "\$*" >> "$command_log"
touch "$docker_ready"
EOF

cat <<EOF > "$tmpdir/bin/pnpm"
#!/usr/bin/env bash
printf 'pnpm %s\n' "\$*" >> "$command_log"
printf 'pnpm DATABASE_URL=%s CLICKHOUSE_URL=%s\n' "\${DATABASE_URL-<unset>}" "\${CLICKHOUSE_URL-<unset>}" >> "$command_log"
EOF

cat <<EOF > "$tmpdir/bin/curl"
#!/usr/bin/env bash
printf 'curl %s\n' "\$*" >> "$command_log"
EOF

cat <<EOF > "$tmpdir/bin/sudo"
#!/usr/bin/env bash
printf 'sudo %s\n' "\$*" >> "$command_log"
exec "\$@"
EOF

cat <<EOF > "$tmpdir/bin/chmod"
#!/usr/bin/env bash
printf 'chmod %s\n' "\$*" >> "$command_log"
exit 0
EOF

chmod +x \
  "$tmpdir/bin/docker" \
  "$tmpdir/bin/service" \
  "$tmpdir/bin/pnpm" \
  "$tmpdir/bin/curl" \
  "$tmpdir/bin/sudo" \
  "$tmpdir/bin/chmod"

# Leave $test_docker_socket missing so ensure_docker_socket_reachable must
# repair the parent directory before the daemon probe loop.
PATH="$tmpdir/bin:$PATH" \
DATABASE_URL="postgresql://external.example:5432/production" \
CLICKHOUSE_URL="https://external.example:8443" \
CURSOR_COMPOSE_WAIT_TIMEOUT_SECONDS=321 \
CURSOR_DOCKER_SOCKET="$test_docker_socket" \
  bash "$repo_root/scripts/agents/start-cursor-cloud.sh"

assert_command() {
  local expected="$1"
  if ! grep -Fq -- "$expected" "$command_log"; then
    echo "Missing command: $expected"
    cat "$command_log"
    exit 1
  fi
}

assert_command "chmod a+rx $tmpdir/locked"
assert_command "service docker start"
assert_command "docker compose --env-file /dev/null -f $repo_root/docker-compose.build.yml up -d --build --wait --wait-timeout 321"
assert_command "compose DATABASE_URL=<unset>"
assert_command "pnpm --filter=shared run db:seed"
assert_command "pnpm DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres CLICKHOUSE_URL=http://127.0.0.1:8123"
assert_command "curl --fail --silent --show-error http://127.0.0.1:3000/api/public/health"
assert_command "curl --fail --silent --show-error http://127.0.0.1:3030/api/health"

assert_file_contains() {
  local expected="$1"
  if ! grep -Fq -- "$expected" "$repo_root/docker-compose.build.yml"; then
    echo "Customer Compose default changed: missing $expected"
    exit 1
  fi
}

assert_file_contains '"3000:3000"'
assert_file_contains '"3030:3030"'
assert_file_contains '"8123:8123"'
assert_file_contains '"9000:9000"'
assert_file_contains '"9090:9000"'
assert_file_contains '"9091:9001"'
assert_file_contains '6379:6379'
assert_file_contains '5432:5432'

echo "Cursor Cloud startup command regression test passed"
