#!/usr/bin/env bash

set -euo pipefail

# Keep user-level tooling installs discoverable in non-interactive shells.
# setup/maintenance rely on this for golang-migrate when Docker infra is enabled.
export PATH="${HOME}/.local/bin:${PATH}"

install_golang_migrate() {
  local version="v4.19.1"
  local arch
  local os

  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$os" in
    linux|darwin) ;;
    *)
      echo "Unsupported operating system for golang-migrate auto-install: $os"
      exit 1
      ;;
  esac

  case "$arch" in
    x86_64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)
      echo "Unsupported architecture for golang-migrate auto-install: $arch"
      exit 1
      ;;
  esac

  local tarball="migrate.${os}-${arch}.tar.gz"
  local url="https://github.com/golang-migrate/migrate/releases/download/${version}/${tarball}"
  local install_dir="${HOME}/.local/bin"
  local tmpdir
  local archive_path
  local checksum_path
  local expected_sha
  local actual_sha

  tmpdir="$(mktemp -d)"
  archive_path="${tmpdir}/${tarball}"
  checksum_path="${tmpdir}/${tarball}.sha256"

  curl -fsSL -o "$archive_path" "$url"
  curl -fsSL -o "$checksum_path" "${url}.sha256"

  expected_sha="$(awk '{print $1}' "$checksum_path")"
  if command -v sha256sum >/dev/null 2>&1; then
    actual_sha="$(sha256sum "$archive_path" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual_sha="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  else
    echo "Neither sha256sum nor shasum is available to verify golang-migrate checksum."
    rm -rf "$tmpdir"
    exit 1
  fi

  if [ "$expected_sha" != "$actual_sha" ]; then
    echo "golang-migrate checksum verification failed."
    rm -rf "$tmpdir"
    exit 1
  fi

  mkdir -p "$install_dir"
  tar xzf "$archive_path" -C "$tmpdir" migrate
  mv "${tmpdir}/migrate" "${install_dir}/migrate"
  chmod +x "${install_dir}/migrate"
  export PATH="${install_dir}:${PATH}"
  rm -rf "$tmpdir"
}

ensure_env_file() {
  local target_path="$1"
  local fallback_path="$2"

  if [ -f "$target_path" ]; then
    return 0
  fi

  cp "$fallback_path" "$target_path"
}

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required. Use a Codex base environment with Node.js 24 support."
  exit 1
fi

corepack enable
corepack prepare pnpm@10.33.0 --activate

ensure_env_file .env .env.dev.example
ensure_env_file .env.test .env.test.example

pnpm install --frozen-lockfile

# Install Chromium into the default user-level Playwright cache so frontend
# browser review works on first bootstrap.
pnpm run playwright:install

# Generate the shared Prisma client explicitly in the current worktree before
# the workspace-wide db:generate task, which may be satisfied by Turbo cache.
pnpm --filter=shared run db:generate

# Prisma client generation is needed for typecheck/build tasks in Codex.
pnpm run db:generate

if [ "${CODEX_ENABLE_DOCKER_DEV_INFRA:-0}" = "1" ]; then
  # Opt-in path for Codex cloud environments that include Docker support.
  # This mirrors local docker-compose.dev.yml infrastructure usage.
  if ! command -v docker >/dev/null 2>&1; then
    echo "CODEX_ENABLE_DOCKER_DEV_INFRA=1 is set, but Docker is unavailable in this environment."
    exit 1
  fi

  # Start local infra containers used by the default .env configuration
  # (Postgres, ClickHouse, Redis, etc).
  pnpm run infra:dev:up

  # Apply committed Prisma migrations to ensure schema compatibility before
  # running app tasks in this environment.
  pnpm --filter=shared run db:deploy

  # CI installs golang-migrate before applying ClickHouse migrations. Mirror
  # that behavior in Codex setup for Docker-enabled environments.
  if ! command -v migrate >/dev/null 2>&1; then
    install_golang_migrate
  fi

  if ! command -v migrate >/dev/null 2>&1; then
    echo "golang-migrate installation failed; cannot run ClickHouse migrations."
    exit 1
  fi

  pnpm --filter=shared run ch:up
fi
