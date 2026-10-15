#!/usr/bin/env bash
#
# Tests for scripts/ci/cargo-security.sh.
#
# The wrapper stands between the Dependabot security maintainer agent and
# Cargo, so the rejections matter as much as the happy path: no extra flags, no
# unknown crate directories, no Cargo config or credentials the agent could
# have written, and no inherited CARGO_* environment.

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}

trap cleanup EXIT

failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

pass() {
  echo "ok - $*"
}

install_dir="$tmpdir/install"
cargo_home="$tmpdir/cargo-home"
log="$tmpdir/cargo.log"
mkdir -p "$install_dir/cwd"
cp "$repo_root/scripts/ci/cargo-security.sh" "$install_dir/cargo-security"
chmod +x "$install_dir/cargo-security"
touch "$install_dir/native-cargo-config.toml"

for slug in ai-gateway native; do
  mkdir -p "$install_dir/toolchains/$slug"
  cat > "$install_dir/toolchains/$slug/cargo" <<EOF
#!/bin/sh
{
  echo "toolchain=$slug"
  echo "cwd=\$(pwd)"
  echo "args=\$*"
  env | grep -E '^CARGO' | sort
} > "$log"
EOF
  chmod +x "$install_dir/toolchains/$slug/cargo"
done

run() {
  rm -f "$log"
  GITHUB_WORKSPACE=/repo CARGO_SECURITY_CARGO_HOME="$cargo_home" \
    CARGO_REGISTRIES_EVIL_CREDENTIAL_PROVIDER=evil \
    "$install_dir/cargo-security" "$@" >/dev/null 2>&1
}

expect_rejected() {
  local name="$1"
  shift
  if run "$@"; then
    fail "$name: expected a rejection"
  elif [[ -e "$log" ]]; then
    fail "$name: cargo ran"
  else
    pass "$name"
  fi
}

expect_log() {
  local name="$1" expected="$2"
  if grep -qxF -- "$expected" "$log"; then
    pass "$name"
  else
    fail "$name: missing '$expected' in: $(tr '\n' '|' < "$log")"
  fi
}

if run update ai-gateway rustls 0.23.46; then
  expect_log "update uses the ai-gateway toolchain" "toolchain=ai-gateway"
  expect_log "update passes only the fixed flags" \
    "args=update --manifest-path /repo/ai-gateway/Cargo.toml --package rustls --precise 0.23.46"
  expect_log "cargo runs from the read-only working directory" "cwd=$install_dir/cwd"
  expect_log "CARGO_HOME is the wrapper's" "CARGO_HOME=$cargo_home"
  if grep -q CARGO_REGISTRIES "$log"; then
    fail "inherited CARGO_* variables are dropped"
  else
    pass "inherited CARGO_* variables are dropped"
  fi
else
  fail "update ai-gateway: wrapper failed"
fi

if run tree packages/native tokio@1.2.3; then
  expect_log "tree uses the native toolchain" "toolchain=native"
  expect_log "native loads the clickhouse overlay and tree is locked" \
    "args=--config $install_dir/native-cargo-config.toml tree --manifest-path /repo/packages/native/Cargo.toml --locked --target all --invert tokio@1.2.3"
else
  fail "tree packages/native: wrapper failed"
fi

expect_rejected "unknown subcommand" build ai-gateway rustls
expect_rejected "unknown crate directory" update web rustls 1.0.0
expect_rejected "traversing crate directory" update ai-gateway/../web rustls 1.0.0
expect_rejected "extra argument" update ai-gateway rustls 1.0.0 --config x
expect_rejected "flag as crate spec" tree ai-gateway --config=x
expect_rejected "flag as version" update ai-gateway rustls --config=x
expect_rejected "bare flag as tree crate spec" tree ai-gateway --offline
expect_rejected "bare flag as update crate spec" update ai-gateway --offline 1.0.0
expect_rejected "non-semver version" update ai-gateway rustls latest
expect_rejected "missing argument" tree ai-gateway

mkdir -p "$cargo_home/registry" "$cargo_home/git"
touch "$cargo_home/.global-cache" "$cargo_home/.package-cache" "$cargo_home/.package-cache-mutate"
if run update ai-gateway rustls 0.23.46; then
  pass "CARGO_HOME caches written by Cargo are allowed"
else
  fail "CARGO_HOME caches written by Cargo are allowed"
fi

for name in config config.toml credentials credentials.toml env.sh .hidden; do
  touch "$cargo_home/$name"
  expect_rejected "CARGO_HOME $name present" update ai-gateway rustls 0.23.46
  rm "$cargo_home/$name"
done

mkdir -p "$install_dir/.cargo"
touch "$install_dir/.cargo/config"
expect_rejected "ancestor .cargo/config present" update ai-gateway rustls 0.23.46
rm -r "$install_dir/.cargo"

if [[ "$failures" -gt 0 ]]; then
  echo "$failures test(s) failed" >&2
  exit 1
fi
echo "all cargo-security tests passed"
