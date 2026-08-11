#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmpdir="$(mktemp -d)"
command_log="$tmpdir/commands.log"
docker_ready="$tmpdir/docker-ready"

cleanup() {
  rm -rf "$tmpdir"
}

trap cleanup EXIT
mkdir -p "$tmpdir/bin"

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
EOF

cat <<EOF > "$tmpdir/bin/curl"
#!/usr/bin/env bash
printf 'curl %s\n' "\$*" >> "$command_log"
EOF

cat <<'EOF' > "$tmpdir/bin/sudo"
#!/usr/bin/env bash
exec "$@"
EOF

chmod +x "$tmpdir/bin/docker" "$tmpdir/bin/service" "$tmpdir/bin/pnpm" "$tmpdir/bin/curl" "$tmpdir/bin/sudo"

PATH="$tmpdir/bin:$PATH" \
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
CURSOR_COMPOSE_WAIT_TIMEOUT_SECONDS=321 \
LANGFUSE_WEB_HOST_PORT=3300 \
LANGFUSE_WORKER_HOST_PORT=3330 \
  bash "$repo_root/scripts/agents/start-cursor-cloud.sh"

assert_command() {
  local expected="$1"
  if ! grep -Fq -- "$expected" "$command_log"; then
    echo "Missing command: $expected"
    cat "$command_log"
    exit 1
  fi
}

assert_command "service docker start"
assert_command "docker compose --env-file /dev/null -f $repo_root/docker-compose.build.yml up -d --build --wait --wait-timeout 321"
assert_command "compose DATABASE_URL=<unset>"
assert_command "pnpm --filter=shared run db:seed"
assert_command "curl --fail --silent --show-error http://127.0.0.1:3300/api/public/health"
assert_command "curl --fail --silent --show-error http://127.0.0.1:3330/api/health"

echo "Cursor Cloud startup command regression test passed"
