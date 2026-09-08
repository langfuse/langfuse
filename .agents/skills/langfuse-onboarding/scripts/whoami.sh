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
bash "$repo_root/scripts/agents/configure-langfuse-identity.sh" --probe

set +e
gh_login="$(gh api user --jq .login 2>/dev/null)"
gh_user_status=$?
set -e
if [[ "${gh_user_status}" -eq 0 && -n "${gh_login}" ]]; then
  gh_name="$(gh api user --jq '.name // ""')"
  gh_email="$(gh api user --jq '.email // ""')"
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
' "${gh_perm_json}"
  else
    echo "gh_permissions: unavailable"
  fi
else
  echo "gh_user: unavailable (Cloud integration tokens 403 here; do not treat as contributor)"
fi
