#!/usr/bin/env bash

set -euo pipefail

get_primary_worktree_root() {
  local common_dir

  common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"

  if [ "$(basename "$common_dir")" != ".git" ]; then
    return 1
  fi

  dirname "$common_dir"
}

bootstrap_env_file() {
  local target_path="$1"
  local fallback_path="$2"
  local current_root
  local primary_root
  local source_path

  if [ -f "$target_path" ]; then
    return 0
  fi

  current_root="$(pwd -P)"

  if primary_root="$(get_primary_worktree_root)"; then
    source_path="$primary_root/$target_path"

    if [ "$source_path" != "$current_root/$target_path" ] && [ -f "$source_path" ]; then
      cp "$source_path" "$target_path"
      return 0
    fi
  fi

  cp "$fallback_path" "$target_path"
}

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required. Use a Codex base environment with Node.js 24 support."
  exit 1
fi

corepack enable
corepack prepare pnpm@9.5.0 --activate

bootstrap_env_file .env .env.dev.example
bootstrap_env_file .env.test .env.test.example

pnpm install --frozen-lockfile

# Prisma client generation is needed for typecheck/build tasks in Codex.
pnpm run db:generate
