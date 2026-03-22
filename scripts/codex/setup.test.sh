#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}

trap cleanup EXIT

repo_copy="$tmpdir/repo"

mkdir -p "$tmpdir/bin" "$repo_copy/scripts/codex"

cp "$repo_root/scripts/codex/setup.sh" "$repo_copy/scripts/codex/setup.sh"
cp "$repo_root/.env.dev.example" "$repo_copy/.env.dev.example"
cp "$repo_root/.env.test.example" "$repo_copy/.env.test.example"

chmod +x "$repo_copy/scripts/codex/setup.sh"

cat <<'EOF' > "$tmpdir/bin/corepack"
#!/usr/bin/env bash
exit 0
EOF

cat <<'EOF' > "$tmpdir/bin/pnpm"
#!/usr/bin/env bash
exit 0
EOF

chmod +x "$tmpdir/bin/corepack" "$tmpdir/bin/pnpm"

assert_file_contains() {
  local file_path="$1"
  local expected="$2"
  local message="$3"

  if ! grep -Fqx "$expected" "$file_path"; then
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

echo "setup.sh example bootstrap regression test passed"
