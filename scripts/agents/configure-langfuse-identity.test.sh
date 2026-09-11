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

# Recovery must lock the identity directory to the owner even when the
# caller inherited a permissive umask.
(
  umask 000
  PATH="$tmpdir/bin:$PATH" \
  LINEAR_API_KEY="test-secret-that-must-not-be-written" \
  LINEAR_FIXTURE="$fixture" \
  LANGFUSE_CONFIG_DIR="$tmpdir/loose-umask" \
    bash "$repo_root/scripts/agents/configure-langfuse-identity.sh"
)
dir_mode="$(stat -c %a "$tmpdir/loose-umask")"
if [[ "$dir_mode" != "700" ]]; then
  echo "Identity directory mode is $dir_mode, expected 700"
  exit 1
fi

# A write that cannot create the identity directory must still exit 0 so
# postinstall and Cloud boot cannot fail the install for a missing HOME.
touch "$tmpdir/not-a-directory"
set +e
mkdir_fail_status=0
PATH="$tmpdir/bin:$PATH" \
LINEAR_API_KEY="test-secret-that-must-not-be-written" \
LINEAR_FIXTURE="$fixture" \
LANGFUSE_CONFIG_DIR="$tmpdir/not-a-directory" \
  bash "$repo_root/scripts/agents/configure-langfuse-identity.sh"
mkdir_fail_status=$?
set -e
if [[ "$mkdir_fail_status" -ne 0 ]]; then
  echo "Identity recovery exited $mkdir_fail_status when mkdir failed"
  exit 1
fi

# A rejected or unreachable Linear endpoint reports in the probe's own label
# format rather than aborting the probe.
cat >"$tmpdir/bin/curl" <<'EOF'
#!/usr/bin/env bash
exit 7
EOF
chmod +x "$tmpdir/bin/curl"

unreachable_output="$(
  PATH="$tmpdir/bin:$PATH" \
  LINEAR_API_KEY="unused-test-secret" \
  LANGFUSE_CONFIG_DIR="$tmpdir/unreachable" \
    bash "$repo_root/scripts/agents/configure-langfuse-identity.sh" --probe
)"
grep -Fq "linear_token: set (LINEAR_API_KEY)" <<<"$unreachable_output"
grep -Fq "linear_viewer: unavailable" <<<"$unreachable_output"
test ! -e "$tmpdir/unreachable/me.md"

cat >"$tmpdir/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s' "$LINEAR_FIXTURE"
EOF
chmod +x "$tmpdir/bin/curl"

# Recovery under OpenCode must write the workspace copy and leave HOME alone.
opencode_home="$tmpdir/opencode-home"
opencode_workspace="$tmpdir/opencode-workspace"
PATH="$tmpdir/bin:$PATH" \
LINEAR_API_KEY="test-secret-that-must-not-be-written" \
LINEAR_FIXTURE="$fixture" \
OPENCODE=1 \
HOME="$opencode_home" \
LANGFUSE_WORKSPACE_IDENTITY_DIR="$opencode_workspace" \
  bash "$repo_root/scripts/agents/configure-langfuse-identity.sh"
test ! -e "$opencode_home/.config/langfuse/me.md"
grep -Fq -- "- **Name:** Nikita Kabardin" "$opencode_workspace/me.md"

# OpenCode-first recovery leaves only the workspace file; a later normal
# install with home access must seed the machine-level copy from it.
opencode_then_home="$tmpdir/opencode-then-home"
PATH="$tmpdir/bin:$PATH" \
LINEAR_API_KEY="test-secret-that-must-not-be-written" \
LINEAR_FIXTURE="$fixture" \
LANGFUSE_CONFIG_DIR="$opencode_then_home" \
LANGFUSE_WORKSPACE_IDENTITY_DIR="$opencode_workspace" \
  bash "$repo_root/scripts/agents/configure-langfuse-identity.sh"
grep -Fq -- "- **Name:** Nikita Kabardin" "$opencode_then_home/me.md"

# Deleting the workspace file must re-query Linear, not copy a stale home
# file back. The home copy is left as the human last edited it.
printf '\nstale home focus\n' >>"$opencode_then_home/me.md"
rm -f "$opencode_workspace/me.md"
PATH="$tmpdir/bin:$PATH" \
LINEAR_API_KEY="test-secret-that-must-not-be-written" \
LINEAR_FIXTURE="$fixture" \
LANGFUSE_CONFIG_DIR="$opencode_then_home" \
LANGFUSE_WORKSPACE_IDENTITY_DIR="$opencode_workspace" \
  bash "$repo_root/scripts/agents/configure-langfuse-identity.sh"
grep -Fq -- "- **Name:** Nikita Kabardin" "$opencode_workspace/me.md"
if grep -Fq "stale home focus" "$opencode_workspace/me.md"; then
  echo "Workspace identity was refilled from the home copy"
  exit 1
fi
grep -Fq "stale home focus" "$opencode_then_home/me.md"

# Redirected LANGFUSE_CONFIG_DIR still seeds an explicit workspace copy.
PATH="$tmpdir/bin:$PATH" \
LINEAR_API_KEY="test-secret-that-must-not-be-written" \
LINEAR_FIXTURE="$fixture" \
LANGFUSE_CONFIG_DIR="$tmpdir/redirected-home" \
LANGFUSE_WORKSPACE_IDENTITY_DIR="$tmpdir/redirected-workspace" \
  bash "$repo_root/scripts/agents/configure-langfuse-identity.sh"
grep -Fq -- "- **Name:** Nikita Kabardin" "$tmpdir/redirected-home/me.md"
grep -Fq -- "- **Name:** Nikita Kabardin" "$tmpdir/redirected-workspace/me.md"

echo "Langfuse identity recovery tests passed"
