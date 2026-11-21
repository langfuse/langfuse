#!/bin/sh
# Delete files that production node_modules trees ship but never load: source
# maps, type declarations, and Prisma's engines for databases other than
# PostgreSQL. Used by web/Dockerfile and worker/Dockerfile before copying a
# tree into the runtime image.
#
# Usage: prune-node-modules.sh DIR...
set -eu

if [ "$#" -eq 0 ]; then
  echo "usage: $0 DIR..." >&2
  exit 1
fi
for dir in "$@"; do
  if [ ! -d "$dir" ]; then
    echo "$0: not a directory: $dir" >&2
    exit 1
  fi
done

find "$@" -type f \( \
  -name '*.js.map' -o -name '*.mjs.map' -o -name '*.cjs.map' \
  -o -name '*.d.ts.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \
  -o -name 'query_*_bg.mysql.*' -o -name 'query_*_bg.sqlite.*' \
  -o -name 'query_*_bg.sqlserver.*' -o -name 'query_*_bg.cockroachdb.*' \
  \) -delete
