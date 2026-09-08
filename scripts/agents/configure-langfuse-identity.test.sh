#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

mkdir -p "$tmpdir/bin"
cat >"$tmpdir/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s' "$LINEAR_FIXTURE"
EOF
chmod +x "$tmpdir/bin/curl"

run_without_token() {
  env \
    -u LINEAR_API_KEY \
    -u LINEAR_TOKEN \
    -u LINEAR_API_TOKEN \
    PATH="$tmpdir/bin:$PATH" \
    LANGFUSE_CONFIG_DIR="$tmpdir/no-token" \
    bash "$repo_root/scripts/agents/configure-langfuse-identity.sh"
}

no_token_output="$(run_without_token)"
grep -Fq "add secret LINEAR_API_KEY" <<<"$no_token_output"
test ! -e "$tmpdir/no-token/me.md"

fixture='{"data":{"viewer":{"name":"Nikita Kabardin","email":"nikita.kabardin@clickhouse.com"},"teams":{"nodes":[{"name":"Langfuse","key":"LF"}]}}}'
identity_dir="$tmpdir/identity"
PATH="$tmpdir/bin:$PATH" \
LINEAR_API_KEY="test-secret-that-must-not-be-written" \
LINEAR_FIXTURE="$fixture" \
LANGFUSE_CONFIG_DIR="$identity_dir" \
  bash "$repo_root/scripts/agents/configure-langfuse-identity.sh"

grep -Fq -- "- **Name:** Nikita Kabardin" "$identity_dir/me.md"
grep -Fq -- "- **Role:** maintainer" "$identity_dir/me.md"
grep -Fq -- "- **Tracker identity:** Nikita Kabardin <nikita.kabardin@clickhouse.com>" "$identity_dir/me.md"
if grep -Fq "test-secret-that-must-not-be-written" "$identity_dir/me.md"; then
  echo "Identity file leaked the Linear token"
  exit 1
fi

printf '\nuser edit\n' >>"$identity_dir/me.md"
PATH="$tmpdir/bin:$PATH" \
LINEAR_API_KEY="test-secret-that-must-not-be-written" \
LINEAR_FIXTURE="$fixture" \
LANGFUSE_CONFIG_DIR="$identity_dir" \
  bash "$repo_root/scripts/agents/configure-langfuse-identity.sh"
grep -Fq "user edit" "$identity_dir/me.md"

outsider_fixture='{"data":{"viewer":{"name":"Outside User","email":"outside@example.com"},"teams":{"nodes":[{"name":"Another Team","key":"OTHER"}]}}}'
PATH="$tmpdir/bin:$PATH" \
LINEAR_API_KEY="another-test-secret" \
LINEAR_FIXTURE="$outsider_fixture" \
LANGFUSE_CONFIG_DIR="$tmpdir/outsider" \
  bash "$repo_root/scripts/agents/configure-langfuse-identity.sh"
test ! -e "$tmpdir/outsider/me.md"

echo "Langfuse identity recovery tests passed"
