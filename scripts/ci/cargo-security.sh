#!/usr/bin/env bash
#
# The only Cargo entry point of the Dependabot security maintainer agent.
#
# The agent never runs raw `cargo`: it accepts `--config` overrides, and Cargo
# config can launch subprocesses (for example a `cargo:token-from-stdout`
# credential provider). This wrapper accepts one fixed argument shape per
# subcommand, runs the toolchain pinned for the crate, and refuses to run when
# a Cargo config or credentials file the agent could have written would be
# loaded. It is not the sandbox boundary: the agent's npm lane can run code
# through pnpm lifecycle scripts, so the gh-aw sandbox (network allowlist, no
# secrets, safe outputs) is what contains a prompt-injected run.
#
# The workflow installs this script before the agent starts, in a directory the
# sandbox mounts read-only. That directory contains:
#   toolchains/<crate-slug>   bin directory of the crate's pinned toolchain
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
# A leading `-` would turn the spec into a Cargo flag.
spec_re="^[A-Za-z0-9_][A-Za-z0-9_-]*(@${version_re})?\$"

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

manifest="$workspace/$crate_dir/Cargo.toml"
if [[ "$subcommand" == update ]]; then
  target="$3"
  if [[ ! "$target" =~ ^${version_re}$ ]]; then
    echo "invalid target version: $target" >&2
    exit 2
  fi
  cargo_args+=(update --manifest-path "$manifest" --package "$spec" --precise "$target")
else
  cargo_args+=(tree --manifest-path "$manifest" --locked --target all --invert "$spec")
fi

toolchain_bin="$install_dir/toolchains/$slug"
work_dir="$install_dir/cwd"

# Cargo merges config and credentials files from $CARGO_HOME, so only the
# caches Cargo itself creates there may exist.
if [[ -d "$cargo_home" ]]; then
  for entry in "$cargo_home"/* "$cargo_home"/.[!.]* "$cargo_home"/..?*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    case "$(basename "$entry")" in
      registry | git | .global-cache | .package-cache | .package-cache-mutate) ;;
      *)
        echo "refusing to run: unexpected entry in CARGO_HOME: $entry" >&2
        exit 1
        ;;
    esac
  done
fi

# Cargo also loads config from `.cargo/` in every ancestor of its working
# directory; none of those may exist.
dir="$work_dir"
while :; do
  for name in config config.toml; do
    if [[ -e "$dir/.cargo/$name" ]]; then
      echo "refusing to run: unexpected Cargo config $dir/.cargo/$name" >&2
      exit 1
    fi
  done
  [[ "$dir" == / ]] && break
  dir="$(dirname "$dir")"
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
