#!/usr/bin/env bash
# Host prerequisite check for local Langfuse development.
#
# Complements `pnpm run seed -- doctor`, which can only run *after* `pnpm install`
# and `.env` exist. This script checks the layer underneath: the host tools needed
# to get that far.
#
# Exit 0 = every required check passed. Exit 1 = at least one FAIL.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT" || exit 1

fail_count=0
warn_count=0

pass() { printf 'PASS  %-22s %s\n' "$1" "$2"; }
warn() {
  printf 'WARN  %-22s %s\n' "$1" "$2"
  printf '      %-22s fix: %s\n' "" "$3"
  warn_count=$((warn_count + 1))
}
fail() {
  printf 'FAIL  %-22s %s\n' "$1" "$2"
  printf '      %-22s fix: %s\n' "" "$3"
  fail_count=$((fail_count + 1))
}

echo "Langfuse host preflight — $REPO_ROOT"
echo

# --- repo root ---------------------------------------------------------------
if [ -f package.json ] && grep -q '"name": *"langfuse"' package.json; then
  pass "repo-root" "$REPO_ROOT"
else
  fail "repo-root" "not a Langfuse checkout" \
    "run this script from inside a Langfuse checkout"
  echo
  echo "Aborting: cannot check anything else without the repo."
  exit 1
fi

# Expected versions are read from package.json so this script cannot go stale.
expected_node="$(sed -n 's/.*"node": *"\([^"]*\)".*/\1/p' package.json | head -1)"
expected_pnpm="$(sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' package.json | head -1)"
expected_node="${expected_node:-24}"
expected_pnpm="${expected_pnpm:-latest}"

# --- node --------------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  node_version="$(node --version 2>/dev/null)"
  node_major="$(printf '%s' "$node_version" | sed 's/^v//' | cut -d. -f1)"
  if [ "$node_major" = "$expected_node" ]; then
    pass "node" "$node_version (engines wants $expected_node)"
  else
    fail "node" "$node_version, but package.json engines wants $expected_node" \
      "nvm install $expected_node && nvm use $expected_node"
  fi
else
  fail "node" "not found" \
    "install Node $expected_node (nvm install $expected_node)"
fi

# --- pnpm --------------------------------------------------------------------
# corepack ships with Node and is the supported way to get the pinned pnpm.
if command -v pnpm >/dev/null 2>&1; then
  pass "pnpm" "$(pnpm --version 2>/dev/null) (pinned $expected_pnpm)"
else
  fail "pnpm" "not found" \
    "corepack enable && corepack prepare pnpm@$expected_pnpm --activate"
fi

# --- docker daemon -----------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  fail "docker" "docker CLI not found" \
    "install Docker Desktop: https://docs.docker.com/desktop/"
elif docker info >/dev/null 2>&1; then
  pass "docker" "daemon responding"
else
  fail "docker" "CLI present but daemon not responding" \
    "open -a Docker   # then wait until 'docker info' succeeds"
fi

# --- golang-migrate ----------------------------------------------------------
# Runs on the HOST against the ClickHouse container; not bundled in the image.
if command -v migrate >/dev/null 2>&1; then
  pass "golang-migrate" "$(command -v migrate)"
else
  fail "golang-migrate" "not found (needed by ch:up)" \
    "brew install golang-migrate"
fi

# --- clickhouse client -------------------------------------------------------
# ch:dev-tables shells out to `clickhouse client`. A Docker shim avoids the
# ~300MB standalone binary; this is the trick .github/workflows/pipeline.yml uses.
if command -v clickhouse >/dev/null 2>&1; then
  pass "clickhouse" "$(command -v clickhouse)"
else
  fail "clickhouse" "not found (needed by ch:dev-tables)" \
    "install the Docker shim — see the 'ClickHouse client' step in SKILL.md"
fi

# --- ports -------------------------------------------------------------------
# WARN, not FAIL: on a re-run the Langfuse containers legitimately hold these.
if command -v lsof >/dev/null 2>&1; then
  busy=""
  for port in 3000 3030 5432 6379 8123 9000 9090 9091; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      busy="$busy $port"
    fi
  done
  if [ -z "$busy" ]; then
    pass "ports" "3000 3030 5432 6379 8123 9000 9090 9091 free"
  else
    warn "ports" "in use:$busy" \
      "fine if these are your own Langfuse containers; otherwise free them or set *_HOST_PORT overrides in .env"
  fi
else
  warn "ports" "lsof unavailable, not checked" \
    "check manually if 'infra:dev:up' reports a port conflict"
fi

# --- summary -----------------------------------------------------------------
echo
if [ "$fail_count" -gt 0 ]; then
  echo "preflight: $fail_count FAIL, $warn_count WARN — fix the FAILs above, then re-run."
  exit 1
fi
echo "preflight: all required checks passed ($warn_count WARN)."
exit 0
