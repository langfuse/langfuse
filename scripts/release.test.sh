#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

setup_repo() {
  local bare="${TMP_DIR}/origin.git"
  local work="${TMP_DIR}/work"
  git init --bare -b main "$bare" >/dev/null 2>&1
  git clone "$bare" "$work" >/dev/null 2>&1

  (
    cd "$work"
    git config user.name "Test User"
    git config user.email "test@example.com"

    mkdir -p scripts
    mkdir -p packages/shared/prisma/migrations/20260101_init
    mkdir -p packages/shared/clickhouse/migrations/unclustered

    cp "${REPO_ROOT}/scripts/release-preflight.sh" scripts/release-preflight.sh
    cp "${REPO_ROOT}/scripts/release.sh" scripts/release.sh
    chmod +x scripts/release-preflight.sh scripts/release.sh

    printf '{\n  "name": "langfuse",\n  "version": "4.88.0"\n}\n' > package.json
    printf '%s\n' '-- init' > packages/shared/prisma/migrations/20260101_init/migration.sql
    printf '%s\n' '-- init' > packages/shared/clickhouse/migrations/unclustered/0001_init.up.sql

    git add -A
    git commit -m "chore: initial" >/dev/null
    git push -u origin main >/dev/null 2>&1
    git push origin main:refs/heads/production >/dev/null 2>&1
  )

  echo "$work"
}

WORK_DIR="$(setup_repo)"
GH_LOG="${TMP_DIR}/gh.log"
STUB_BIN="${TMP_DIR}/bin"
mkdir -p "$STUB_BIN"

cat > "${STUB_BIN}/gh" <<EOF
#!/usr/bin/env bash
if [[ "\$1" == "auth" && "\$2" == "status" ]]; then
  exit 0
fi
printf '%s\n' "\$*" >> "${GH_LOG}"
EOF
chmod +x "${STUB_BIN}/gh"

# 1. Clean repo (no unpromoted migrations): dispatches cut-release.yml with expected_sha and confirm_migrations=none
(
  cd "$WORK_DIR"
  head_sha="$(git rev-parse HEAD)"
  PATH="${STUB_BIN}:${PATH}" bash ./scripts/release.sh minor --dry-run >/dev/null
  recorded="$(cat "$GH_LOG")"
  expected="workflow run cut-release.yml --ref main -f version=minor -f expected_sha=${head_sha} -f confirm_migrations=none -f dry_run=true"
  if [[ "$recorded" != "$expected" ]]; then
    echo "FAIL: unexpected gh args:"
    echo "  got:      $recorded"
    echo "  expected: $expected"
    exit 1
  fi
)

# 2. Unpromoted Prisma migration: non-interactive CI check requires 'applied' and interactive release.sh passes it
(
  cd "$WORK_DIR"
  mkdir -p packages/shared/prisma/migrations/20261127_new_table
  printf '%s\n' '-- new' > packages/shared/prisma/migrations/20261127_new_table/migration.sql
  git add -A
  git commit -m "feat: add migration" >/dev/null
  git push origin main >/dev/null 2>&1

  if bash -c 'source ./scripts/release-preflight.sh && fetch_production_branch && verify_migrations_confirmed_non_interactive ""' >/dev/null 2>&1; then
    echo "FAIL: expected verify_migrations_confirmed_non_interactive to reject empty confirmation"
    exit 1
  fi

  bash -c 'source ./scripts/release-preflight.sh && fetch_production_branch && verify_migrations_confirmed_non_interactive "applied"' >/dev/null

  : > "$GH_LOG"
  head_sha="$(git rev-parse HEAD)"
  printf 'applied\n' | PATH="${STUB_BIN}:${PATH}" bash ./scripts/release.sh patch >/dev/null
  recorded="$(cat "$GH_LOG")"
  expected="workflow run cut-release.yml --ref main -f version=patch -f expected_sha=${head_sha} -f confirm_migrations=applied -f dry_run=false"
  if [[ "$recorded" != "$expected" ]]; then
    echo "FAIL: unexpected gh args with confirmed migration:"
    echo "  got:      $recorded"
    echo "  expected: $expected"
    exit 1
  fi
)

# 3. Uncommitted tracked changes must be rejected
(
  cd "$WORK_DIR"
  printf '{\n  "name": "langfuse",\n  "version": "4.99.0"\n}\n' > package.json
  if PATH="${STUB_BIN}:${PATH}" bash ./scripts/release.sh patch --dry-run >/dev/null 2>&1; then
    echo "FAIL: expected release.sh to reject uncommitted changes"
    exit 1
  fi
  git checkout -- package.json
)

# 4. Non-increasing or malformed custom versions must be rejected
(
  cd "$WORK_DIR"
  for bad in "4.88.0" "4.87.9" "4.88.0-rc.1" "4.089.0"; do
    if PATH="${STUB_BIN}:${PATH}" bash ./scripts/release.sh --version "$bad" --dry-run >/dev/null 2>&1; then
      echo "FAIL: expected release.sh to reject custom version '$bad'"
      exit 1
    fi
  done
)

echo "PASS: release-preflight.sh and release.sh checks passed"
