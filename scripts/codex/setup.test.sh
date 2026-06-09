#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}

trap cleanup EXIT

repo_copy="$tmpdir/repo"
pnpm_log="$tmpdir/pnpm.log"

mkdir -p "$tmpdir/bin" "$repo_copy/scripts/codex"

cp "$repo_root/scripts/codex/setup.sh" "$repo_copy/scripts/codex/setup.sh"
cp "$repo_root/.env.dev.example" "$repo_copy/.env.dev.example"
cp "$repo_root/.env.test.example" "$repo_copy/.env.test.example"

chmod +x "$repo_copy/scripts/codex/setup.sh"

cat <<'EOF' > "$tmpdir/bin/corepack"
#!/usr/bin/env bash
exit 0
EOF

cat <<EOF > "$tmpdir/bin/pnpm"
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$pnpm_log"
exit 0
EOF

chmod +x "$tmpdir/bin/corepack" "$tmpdir/bin/pnpm"

assert_file_contains() {
  local file_path="$1"
  local expected="$2"
  local message="$3"

  if ! grep -Fqx -- "$expected" "$file_path"; then
    echo "$message"
    echo "missing line: $expected"
    exit 1
  fi
}

run_setup() {
  (
    cd "$repo_copy"
    PATH="$tmpdir/bin:$PATH" bash scripts/codex/setup.sh
  )
}

run_setup

if ! cmp -s "$repo_copy/.env.dev.example" "$repo_copy/.env"; then
  echo ".env should be created from .env.dev.example when missing"
  exit 1
fi

if ! cmp -s "$repo_copy/.env.test.example" "$repo_copy/.env.test"; then
  echo ".env.test should be created from .env.test.example when missing"
  exit 1
fi

cat <<'EOF' > "$repo_copy/.env"
WORKTREE_ONLY=keep-me
EOF

run_setup

assert_file_contains \
  "$repo_copy/.env" \
  "WORKTREE_ONLY=keep-me" \
  "setup.sh should not overwrite an existing .env"

assert_file_contains \
  "$repo_copy/.env.test" \
  'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/langfuse_test"' \
  "setup.sh should preserve the existing .env.test on rerun"

assert_file_contains \
  "$pnpm_log" \
  "install --frozen-lockfile" \
  "setup.sh should install workspace dependencies"

assert_file_contains \
  "$pnpm_log" \
  "run playwright:install" \
  "setup.sh should install Playwright browsers for frontend review"

assert_file_contains \
  "$pnpm_log" \
  "--filter=shared run db:generate" \
  "setup.sh should generate the shared Prisma client explicitly before the workspace-wide task"

assert_file_contains \
  "$pnpm_log" \
  "run db:generate" \
  "setup.sh should generate Prisma artifacts"

echo "setup.sh example bootstrap regression test passed"
