#!/usr/bin/env bash
# Probe identity signals for langfuse-onboarding. Never prints secret values.
set -euo pipefail

me="${HOME}/.config/langfuse/me.md"
if [[ -f "${me}" ]]; then
  echo "me.md: present (${me})"
else
  echo "me.md: absent"
fi

linear_token=""
if [[ -n "${LINEAR_API_KEY:-}" ]]; then
  linear_token="${LINEAR_API_KEY}"
  echo "linear_token: set (LINEAR_API_KEY)"
elif [[ -n "${LINEAR_TOKEN:-}" ]]; then
  linear_token="${LINEAR_TOKEN}"
  echo "linear_token: set (LINEAR_TOKEN)"
elif [[ -n "${LINEAR_API_TOKEN:-}" ]]; then
  linear_token="${LINEAR_API_TOKEN}"
  echo "linear_token: set (LINEAR_API_TOKEN)"
else
  echo "linear_token: unset"
fi

if [[ -n "${linear_token}" ]]; then
  viewer="$(
    curl -sS https://api.linear.app/graphql \
      -H "Content-Type: application/json" \
      -H "Authorization: ${linear_token}" \
      --data '{"query":"{ viewer { name email } }"}'
  )"
  python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    print("linear_viewer: error (non-json response)")
    sys.exit(0)
err = data.get("errors")
if err:
    print("linear_viewer: error")
    sys.exit(0)
viewer = (data.get("data") or {}).get("viewer") or {}
name = viewer.get("name") or ""
email = viewer.get("email") or ""
if name or email:
    print(f"linear_viewer: {name} <{email}>")
else:
    print("linear_viewer: error (no viewer)")
' <<<"${viewer}"
fi

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
