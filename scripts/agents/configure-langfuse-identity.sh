#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
identity_dir="${LANGFUSE_CONFIG_DIR:-$HOME/.config/langfuse}"
identity_file="$identity_dir/me.md"
mode="${1:-write}"

if [[ "$mode" != "write" && "$mode" != "--probe" ]]; then
  echo "Usage: $0 [--probe]" >&2
  exit 2
fi

if [[ -f "$identity_file" && "$mode" = "write" ]]; then
  echo "Langfuse identity: already configured at $identity_file"
  exit 0
fi

linear_token=""
linear_token_name=""
for candidate in LINEAR_API_KEY LINEAR_TOKEN LINEAR_API_TOKEN; do
  if [[ -n "${!candidate:-}" ]]; then
    linear_token="${!candidate}"
    linear_token_name="$candidate"
    break
  fi
done

if [[ -z "$linear_token" ]]; then
  echo "Langfuse identity: no Linear token available."
  echo "Cursor Cloud: add secret LINEAR_API_KEY at https://cursor.com/dashboard/cloud-agents and start a new run."
  exit 0
fi

response="$(
  printf 'header = "Authorization: %s"\n' "$linear_token" |
    curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
      --config - \
      https://api.linear.app/graphql \
      -H "Content-Type: application/json" \
      --data '{"query":"{ viewer { name email } teams { nodes { name key } } }"}' \
      2>/dev/null
)" || {
  if [[ "$mode" = "--probe" ]]; then
    echo "linear_token: set ($linear_token_name)"
    echo "linear_viewer: unavailable (Linear unreachable or token rejected)"
  else
    echo "Langfuse identity: $linear_token_name is set but Linear rejected the viewer query."
  fi
  exit 0
}

if [[ "$mode" = "--probe" ]]; then
  LINEAR_RESPONSE="$response" python3 - "$linear_token_name" <<'PY'
import json
import os
import sys

token_name = sys.argv[1]
try:
    payload = json.loads(os.environ["LINEAR_RESPONSE"])
except json.JSONDecodeError:
    print(f"linear_token: set ({token_name})")
    print("linear_viewer: unavailable (invalid response)")
    sys.exit(0)
viewer = (payload.get("data") or {}).get("viewer") or {}
teams = (payload.get("data") or {}).get("teams", {}).get("nodes", [])
name = viewer.get("name") or ""
email = viewer.get("email") or ""
langfuse_member = any(
    team.get("key") == "LF" or team.get("name") == "Langfuse" for team in teams
)

print(f"linear_token: set ({token_name})")
if name or email:
    print(f"linear_viewer: {name} <{email}>")
else:
    print("linear_viewer: unavailable")
print(f"langfuse_team: {'member' if langfuse_member else 'not found'}")
PY
  exit 0
fi

mkdir -p "$identity_dir"
umask 077

tmp_file="$(mktemp "$identity_dir/.me.md.XXXXXX")"
cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

set +e
LINEAR_RESPONSE="$response" python3 - "$identity_file" "$tmp_file" "$repo_root" <<'PY'
import datetime
import json
import os
import sys

identity_file, tmp_file, repo_root = sys.argv[1:]
try:
    payload = json.loads(os.environ["LINEAR_RESPONSE"])
except json.JSONDecodeError:
    print("Langfuse identity: Linear returned an invalid response.", file=sys.stderr)
    sys.exit(3)
if payload.get("errors"):
    print("Langfuse identity: Linear returned GraphQL errors.", file=sys.stderr)
    sys.exit(3)

data = payload.get("data") or {}
viewer = data.get("viewer") or {}
teams = (data.get("teams") or {}).get("nodes") or []
langfuse_member = any(
    team.get("key") == "LF" or team.get("name") == "Langfuse" for team in teams
)
if not langfuse_member:
    print(
        "Langfuse identity: Linear viewer is not a member of the Langfuse team; "
        "leaving me.md unchanged.",
        file=sys.stderr,
    )
    sys.exit(4)

name = viewer.get("name") or "unknown"
email = viewer.get("email") or "unknown"
today = datetime.date.today().isoformat()
content = f"""# Me, at Langfuse

- **Name:** {name}
- **Role:** maintainer
- **GitHub:** unknown (derive from the team roster when needed)
- **Tracker identity:** {name} <{email}>
- **Focus:** not recorded yet — ask once when relevant
- **Checkouts:** {repo_root} (langfuse)
- **Connectors verified:** Linear API
- *Recovered {today} from `LINEAR_API_KEY` by the repo agent bootstrap. Edit freely; delete to recover again.*
"""

with open(tmp_file, "w", encoding="utf-8") as file:
    file.write(content)
os.replace(tmp_file, identity_file)
print(f"Langfuse identity: recovered {name} <{email}> at {identity_file}")
PY
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  echo "Langfuse identity: recovery skipped; onboarding can retry during the agent session."
  exit 0
fi
