#!/bin/sh
# Strip files from a production node_modules tree that are never loaded at
# runtime. Safe to re-run. Missing paths are skipped.
#
# Usage:
#   prune-runtime-node-modules.sh --dir DIR [--drop-next-toolchain] [--drop-prisma-cli]
set -eu

DIR=""
DROP_NEXT_TOOLCHAIN=0
DROP_PRISMA_CLI=0

usage() {
  echo "usage: $0 --dir DIR [--drop-next-toolchain] [--drop-prisma-cli]" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir)
      DIR="${2:-}"
      shift 2
      ;;
    --drop-next-toolchain)
      DROP_NEXT_TOOLCHAIN=1
      shift
      ;;
    --drop-prisma-cli)
      DROP_PRISMA_CLI=1
      shift
      ;;
    *)
      usage
      ;;
  esac
done

if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
  usage
fi

drop_pnpm_name() {
  name="$1"
  if [ -d "$DIR/.pnpm" ]; then
    find "$DIR/.pnpm" -maxdepth 1 -type d -name "$name" -exec rm -rf {} +
  fi
}

if [ "$DROP_NEXT_TOOLCHAIN" -eq 1 ]; then
  # Next.js compiler / bundler artifacts pulled in via next-auth. The worker
  # never compiles or serves Next pages. typescript / playwright are build or
  # test tooling that pnpm deploy still copies. Keep prettier: @react-email/render
  # requires prettier/standalone at runtime for worker email jobs.
  drop_pnpm_name 'next@*'
  drop_pnpm_name '@next+swc-*'
  drop_pnpm_name 'typescript@*'
  drop_pnpm_name 'playwright@*'
  drop_pnpm_name 'playwright-core@*'
  rm -rf "$DIR/next" "$DIR/@next" "$DIR/typescript" \
    "$DIR/playwright" "$DIR/playwright-core"
  rm -f "$DIR/.bin/next" "$DIR/.bin/tsc" "$DIR/.bin/tsserver" \
    "$DIR/.bin/playwright"
fi

if [ "$DROP_PRISMA_CLI" -eq 1 ]; then
  # migrate deploy runs in the web image, not the worker. The generated
  # Prisma client already ships libquery_engine next to itself.
  drop_pnpm_name 'prisma@*'
  rm -rf "$DIR/.bin/prisma" "$DIR/prisma"
  find "$DIR" -type f -name 'schema-engine-*' -delete
  find "$DIR" -type f -path '*/node_modules/@prisma/engines/libquery_engine-*' -delete
fi

# Prisma CLI layout: generate templates and Studio UI are not used by
# `prisma migrate deploy` / `prisma db execute`.
if [ -f "$DIR/build/index.js" ] && [ -d "$DIR/prisma-client" ]; then
  rm -rf "$DIR/prisma-client" "$DIR/build/public"
fi

# @prisma/client generator output is build-time only.
find "$DIR" -type d -path '*/node_modules/@prisma/client/generator-build' \
  -prune -exec rm -rf {} +

# Postgres-only: drop query-engine / query-compiler blobs for databases
# Prisma supports but Langfuse does not use.
find "$DIR" -type f \( \
  -name 'query_engine_bg.mysql*' \
  -o -name 'query_engine_bg.sqlite*' \
  -o -name 'query_engine_bg.sqlserver*' \
  -o -name 'query_engine_bg.cockroachdb*' \
  -o -name 'query_compiler_bg.mysql*' \
  -o -name 'query_compiler_bg.sqlite*' \
  -o -name 'query_compiler_bg.sqlserver*' \
  -o -name 'query_compiler_bg.cockroachdb*' \
  \) -delete

# Package source maps and generated .d.ts are not loaded at runtime.
find "$DIR" -type f \( -name '*.map' -o -name '*.d.ts' \) -delete
