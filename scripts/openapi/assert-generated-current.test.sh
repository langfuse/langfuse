#!/usr/bin/env bash
# Proves the served-spec drift assertion fails on a dirty generated OpenAPI
# file and passes when the three tracked artifacts match HEAD.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo_root/scripts/openapi/assert-generated-current.sh"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

cd "$tmpdir"
git init -q
git config user.name "openapi-check-test"
git config user.email "openapi-check-test@langfuse.local"

mkdir -p \
  web/public/generated/api \
  web/public/generated/api-client \
  web/public/generated/organizations-api

printf 'server: spec\n' > web/public/generated/api/openapi.yml
printf 'client: spec\n' > web/public/generated/api-client/openapi.yml
printf 'orgs: spec\n' > web/public/generated/organizations-api/openapi.yml

git add web/public/generated
git commit -q -m "seed specs"

"$script"

printf 'stale\n' >> web/public/generated/api/openapi.yml
if "$script"; then
  echo "expected assert-generated-current.sh to fail on a dirty spec" >&2
  exit 1
fi

rm web/public/generated/api-client/openapi.yml
if "$script"; then
  echo "expected assert-generated-current.sh to fail when a spec is missing" >&2
  exit 1
fi

echo "assert-generated-current.sh: ok"
