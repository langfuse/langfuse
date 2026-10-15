#!/usr/bin/env bash
#
# The only Cargo entry point of the Dependabot security maintainer agent.
#
# The agent never runs raw `cargo`: it accepts `--config` overrides, and Cargo
# config can launch subprocesses (for example a `cargo:token-from-stdout`
# credential provider). This wrapper accepts one fixed argument shape per
# subcommand, runs the toolchain pinned for the crate, and refuses to run when
# a Cargo config file the agent could have written would be loaded.
#
# The workflow installs this script before the agent starts, in a directory the
# sandbox mounts read-only. That directory contains:
#   toolchains/<crate-slug>   bin directory of the crate's pinned toolchain
#   native-cargo-config.toml  clickhouse patch overlay for packages/native
#   cwd/                      empty working directory for cargo
#
# Usage:
#   cargo-security update <crate-dir> <crate>[@<version>] <target-version>
#   cargo-security tree <crate-dir> <crate>[@<version>]
# where <crate-dir> is `ai-gateway` or `packages/native`.

set -euo pipefail

usage() {
  echo "usage: cargo-security update <crate-dir> <crate>[@<version>] <target-version>" >&2
  echo "       cargo-security tree <crate-dir> <crate>[@<version>]" >&2
  echo "<crate-dir> is ai-gateway or packages/native" >&2
  exit 2
}

version_re='[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?'
spec_re="^[A-Za-z0-9_-]+(@${version_re})?\$"

install_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE must be set}"
cargo_home="${CARGO_SECURITY_CARGO_HOME:-/tmp/gh-aw/rust/cargo}"

[[ $# -ge 1 ]] || usage
subcommand="$1"
shift

case "$subcommand" in
  update) [[ $# -eq 3 ]] || usage ;;
  tree) [[ $# -eq 2 ]] || usage ;;
  *) usage ;;
esac

crate_dir="$1"
spec="$2"

case "$crate_dir" in
  ai-gateway) slug=ai-gateway ;;
  packages/native) slug=native ;;
  *) usage ;;
esac

if [[ ! "$spec" =~ $spec_re ]]; then
  echo "invalid crate spec: $spec" >&2
  exit 2
fi

cargo_args=()
if [[ "$slug" == native ]]; then
  cargo_args+=(--config "$install_dir/native-cargo-config.toml")
fi

manifest="$workspace/$crate_dir/Cargo.toml"
if [[ "$subcommand" == update ]]; then
  target="$3"
  if [[ ! "$target" =~ ^${version_re}$ ]]; then
    echo "invalid target version: $target" >&2
    exit 2
  fi
  cargo_args+=(update --manifest-path "$manifest" --package "$spec" --precise "$target")
else
  cargo_args+=(tree --manifest-path "$manifest" --locked --invert "$spec")
fi

toolchain_bin="$install_dir/toolchains/$slug"
work_dir="$install_dir/cwd"

# Cargo loads config from $CARGO_HOME and from `.cargo/` in every ancestor of
# its working directory; none of those may exist.
config_dirs=("$cargo_home")
dir="$work_dir"
while :; do
  config_dirs+=("$dir/.cargo")
  [[ "$dir" == / ]] && break
  dir="$(dirname "$dir")"
done
for config_dir in "${config_dirs[@]}"; do
  for name in config config.toml; do
    if [[ -e "$config_dir/$name" ]]; then
      echo "refusing to run: unexpected Cargo config $config_dir/$name" >&2
      exit 1
    fi
  done
done

mkdir -p "$cargo_home"

env_args=(
  "PATH=$toolchain_bin:/usr/bin:/bin"
  "HOME=${HOME:-/tmp}"
  "CARGO_HOME=$cargo_home"
)
for name in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy SSL_CERT_FILE SSL_CERT_DIR; do
  if [[ -n "${!name:-}" ]]; then
    env_args+=("$name=${!name}")
  fi
done

cd "$work_dir"
exec env -i "${env_args[@]}" "$toolchain_bin/cargo" "${cargo_args[@]}"
