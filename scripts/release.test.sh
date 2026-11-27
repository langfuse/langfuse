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

    mkdir -p scripts web/src/constants worker/src/constants packages/shared/src/constants
    mkdir -p packages/shared/prisma/migrations/20260101_init
    mkdir -p packages/shared/clickhouse/migrations/unclustered

    cp "${REPO_ROOT}/scripts/release-preflight.sh" scripts/release-preflight.sh
    cp "${REPO_ROOT}/scripts/release.sh" scripts/release.sh
    cp "${REPO_ROOT}/scripts/bump-release-version.mjs" scripts/bump-release-version.mjs
    chmod +x scripts/release-preflight.sh scripts/release.sh

    for pkg in package.json web/package.json worker/package.json; do
      printf '{\n  "name": "%s",\n  "version": "4.88.0"\n}\n' "$pkg" > "$pkg"
    done
    for ts in packages/shared/src/constants/VERSION.ts web/src/constants/VERSION.ts worker/src/constants/VERSION.ts; do
      printf 'export const VERSION = "v4.88.0";\n' > "$ts"
    done
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

# 1. Clean repo (no unpromoted migrations): release.sh dispatches cut-release.yml with expected_sha and confirm_migrations=none
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

# 2. Add an unpromoted Prisma migration on main: non-interactive CI helper must reject empty confirmation and pass 'applied'
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

echo "PASS: release-preflight.sh and release.sh checks passed"
