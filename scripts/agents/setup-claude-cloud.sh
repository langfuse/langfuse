#!/usr/bin/env bash
# Environment setup for Claude Code on the web. Call it from the environment's
# setup script, which starts one directory above the checkout:
#
#   [ -f langfuse/scripts/agents/setup-claude-cloud.sh ] \
#     && bash langfuse/scripts/agents/setup-claude-cloud.sh
#
# The resulting filesystem (toolchain, node_modules, Docker images and migrated
# volumes) is snapshotted and reused by later sessions. Running processes are
# not, so this registers a SessionStart hook that restarts the dev stack in
# every session. The snapshot is only rebuilt when the environment's setup
# script text changes, so edits here take effect after that or the periodic
# rebuild. Safe to re-run.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
node_bin="${CLAUDE_CLOUD_NODE_BIN:-/opt/node24/bin}"
services_cmd="${CLAUDE_CLOUD_SERVICES_CMD:-/usr/local/bin/langfuse-dev-services}"
settings_file="$HOME/.claude/settings.json"

if [ ! -x "$node_bin/node" ]; then
  echo "Node.js 24 not found at $node_bin; set CLAUDE_CLOUD_NODE_BIN." >&2
  exit 1
fi

# Put Node 24 first on PATH for every shell the session starts, including the
# husky git hooks, which refuse to run under the image's default Node.
path_line="export PATH=\"$node_bin:\$PATH\""
for rc in "$HOME/.bashrc" "$HOME/.profile"; do
  touch "$rc"
  grep -qxF "$path_line" "$rc" || echo "$path_line" >>"$rc"
done
export PATH="$node_bin:$PATH"

pnpm_version="$(jq -r '.engines.pnpm' "$repo_root/package.json")"
corepack enable --install-directory "$node_bin"
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare "pnpm@$pnpm_version" --activate

# golang-migrate for `ch:up`, pinned and checksummed by the Codex cloud setup.
# shellcheck source=../codex/cloud_services.sh
source "$repo_root/scripts/codex/cloud_services.sh"
ensure_migrate_binary

# `ch:dev-tables` needs a `clickhouse` client; use the one in the container.
ln -sf "$repo_root/scripts/agents/clickhouse-client.sh" /usr/local/bin/clickhouse

install -m 0755 "$repo_root/scripts/agents/start-claude-cloud.sh" "$services_cmd"

# Register the starter as a user-level SessionStart hook, replacing an earlier
# registration and keeping every other setting.
hook_command="$services_cmd $(printf '%q' "$repo_root")"
mkdir -p "$(dirname "$settings_file")"
[ -f "$settings_file" ] || echo '{}' >"$settings_file"
jq --arg prefix "$services_cmd" --arg cmd "$hook_command" '
  .hooks.SessionStart = [
    ((.hooks.SessionStart // [])[]
      | select(any(.hooks[]?; (.command // "") | startswith($prefix)) | not)),
    {hooks: [{type: "command", command: $cmd, timeout: 120}]}
  ]
' "$settings_file" >"$settings_file.tmp"
mv "$settings_file.tmp" "$settings_file"

cd "$repo_root"
cp --update=none .env.dev.example .env
cp --update=none .env.test.example .env.test
pnpm install --frozen-lockfile
pnpm --filter=shared run db:generate
# web and worker resolve @langfuse/shared to its built dist.
pnpm --filter=shared run build

# Pull images, migrate the dev and test databases and seed example data into
# the Docker volumes, then stop the containers so the snapshot holds a clean
# state. Mirrors `pnpm dx` without its volume prune, resets, prompts or dev
# server.
LANGFUSE_DEV_SERVICES_STRICT=1 "$services_cmd" "$repo_root"
pnpm --filter=shared run db:deploy
# Test database for server tests; `migrate deploy` rather than `db:reset:test`
# so re-runs keep data and Prisma's destructive-action guard never applies.
(cd packages/shared && pnpm exec dotenv -e ../../.env.test -e ../../.env -- prisma migrate deploy)
pnpm --filter=shared run ch:up
# Seed each store only while it is empty, so an interrupted run can be retried:
# the seeders are not idempotent, and `ch:dev-tables` truncates the events
# tables before rebuilding them from the legacy tables.
project_count="$(docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U postgres -d postgres -tAc 'SELECT count(*) FROM projects')"
if [ "$project_count" = "0" ]; then
  pnpm --filter=shared run db:seed:examples
else
  echo "Skipping Postgres example seed: the dev database already has projects."
fi
clickhouse_rows="$(clickhouse client --user clickhouse --password clickhouse \
  --query 'SELECT (SELECT count() FROM traces) + (SELECT count() FROM events_full)')"
if [ "$clickhouse_rows" = "0" ]; then
  pnpm --filter=shared run ch:seed
  pnpm --filter=shared run ch:dev-tables
else
  echo "Skipping ClickHouse example seed and dev tables: ClickHouse already has data."
fi
docker compose -f docker-compose.dev.yml stop
