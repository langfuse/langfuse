#!/usr/bin/env bash
# Probe identity signals for langfuse-onboarding. Never prints secret values.
set -euo pipefail

me="${HOME}/.config/langfuse/me.md"
if [[ -f "${me}" ]]; then
  echo "me.md: present (${me})"
else
  echo "me.md: absent"
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

# Every signal below is independent, so no probe may abort the others: a
# blocked Linear route must not hide the GitHub lines, and vice versa.
set +e
bash "$repo_root/scripts/agents/configure-langfuse-identity.sh" --probe
linear_probe_status=$?
set -e
if [[ "${linear_probe_status}" -ne 0 ]]; then
  echo "linear_viewer: unavailable (probe exited ${linear_probe_status})"
fi

set +e
gh_login="$(gh api user --jq .login 2>/dev/null)"
gh_user_status=$?
gh_name=""
gh_email=""
if [[ "${gh_user_status}" -eq 0 && -n "${gh_login}" ]]; then
  gh_name="$(gh api user --jq '.name // ""' 2>/dev/null)"
  gh_email="$(gh api user --jq '.email // ""' 2>/dev/null)"
fi
set -e
if [[ "${gh_user_status}" -eq 0 && -n "${gh_login}" ]]; then
  echo "gh_user: ${gh_login} ${gh_name} ${gh_email}"
  set +e
  gh_perm_json="$(gh api repos/langfuse/langfuse --jq .permissions 2>/dev/null)"
  gh_perm_status=$?
  set -e
  if [[ "${gh_perm_status}" -eq 0 && -n "${gh_perm_json}" ]]; then
    python3 -c '
import json, sys
p = json.loads(sys.argv[1])
print("gh_permissions: push=%s maintain=%s admin=%s" % (p.get("push"), p.get("maintain"), p.get("admin")))
' "${gh_perm_json}" || echo "gh_permissions: unavailable"
  else
    echo "gh_permissions: unavailable"
  fi
else
  echo "gh_user: unavailable (Cloud integration tokens 403 here; do not treat as contributor)"
fi
