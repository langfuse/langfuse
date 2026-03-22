#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}

trap cleanup EXIT

primary_root="$tmpdir/primary/langfuse"
worktree_root="$tmpdir/worktrees/feature/langfuse"

mkdir -p "$tmpdir/bin" "$primary_root/.git" "$worktree_root/scripts/codex"

cp "$repo_root/scripts/codex/setup.sh" "$worktree_root/scripts/codex/setup.sh"
cp "$repo_root/.env.dev.example" "$worktree_root/.env.dev.example"
cp "$repo_root/.env.test.example" "$worktree_root/.env.test.example"

chmod +x "$worktree_root/scripts/codex/setup.sh"

cat <<'EOF' > "$tmpdir/bin/corepack"
#!/usr/bin/env bash
exit 0
EOF

cat <<'EOF' > "$tmpdir/bin/pnpm"
#!/usr/bin/env bash
exit 0
EOF

cat <<EOF > "$tmpdir/bin/git"
#!/usr/bin/env bash
if [ "\$1" = "rev-parse" ] && [ "\$2" = "--path-format=absolute" ] && [ "\$3" = "--git-common-dir" ]; then
  printf '%s\n' "$primary_root/.git"
  exit 0
fi

echo "unexpected git invocation: \$*" >&2
exit 1
EOF

chmod +x "$tmpdir/bin/corepack" "$tmpdir/bin/pnpm" "$tmpdir/bin/git"

cat <<'EOF' > "$primary_root/.env"
PRIMARY_ONLY=1
NEXTAUTH_URL=http://primary.example
EOF

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
    cd "$worktree_root"
    PATH="$tmpdir/bin:$PATH" bash scripts/codex/setup.sh
  )
}

run_setup

if ! cmp -s "$primary_root/.env" "$worktree_root/.env"; then
  echo ".env should be copied from the primary worktree when missing"
  exit 1
fi

if ! cmp -s "$worktree_root/.env.test.example" "$worktree_root/.env.test"; then
  echo ".env.test should fall back to the checked-in example when the primary worktree has no .env.test"
  exit 1
fi

cat <<'EOF' > "$primary_root/.env"
PRIMARY_ONLY=2
NEXTAUTH_URL=http://changed.example
EOF

printf 'WORKTREE_ONLY=keep-me\n' >> "$worktree_root/.env"

run_setup

assert_file_contains \
  "$worktree_root/.env" \
  "PRIMARY_ONLY=1" \
  "setup.sh should not overwrite an existing worktree .env"

assert_file_contains \
  "$worktree_root/.env" \
  "WORKTREE_ONLY=keep-me" \
  "setup.sh should preserve worktree-local env changes on rerun"

echo "setup.sh worktree bootstrap regression test passed"
