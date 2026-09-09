#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode="${1:-write}"

if [[ "$mode" != "write" && "$mode" != "--probe" ]]; then
  echo "Usage: $0 [--probe]" >&2
  exit 2
fi

# Home identity is machine-level. Workspace-scoped harnesses (OpenCode) prompt
# on any $HOME path, so only touch it when the caller redirected the directory,
# opted in, or this is a normal non-OpenCode install.
opencode_env="${OPENCODE:-}${OPENCODE_DIR:-}${OPENCODE_BIN:-}${OPENCODE_CONFIG:-}"
allow_home=0
if [[ -n "${LANGFUSE_CONFIG_DIR:-}" || "${LANGFUSE_ALLOW_HOME_IDENTITY:-}" == "1" ]]; then
  allow_home=1
elif [[ -z "$opencode_env" ]]; then
  allow_home=1
fi

if [[ -n "${LANGFUSE_CONFIG_DIR:-}" ]]; then
  identity_dir="$LANGFUSE_CONFIG_DIR"
elif [[ "$allow_home" -eq 1 ]]; then
  identity_dir="$HOME/.config/langfuse"
else
  identity_dir=""
fi
identity_file="${identity_dir:+$identity_dir/me.md}"

# Mirror into the checkout so agents can read identity without leaving the
# project. Tests that redirect LANGFUSE_CONFIG_DIR must set
# LANGFUSE_WORKSPACE_IDENTITY_DIR if they want this path exercised.
workspace_identity_dir=""
if [[ -n "${LANGFUSE_WORKSPACE_IDENTITY_DIR:-}" ]]; then
  workspace_identity_dir="$LANGFUSE_WORKSPACE_IDENTITY_DIR"
elif [[ -z "${LANGFUSE_CONFIG_DIR:-}" ]]; then
  workspace_identity_dir="$repo_root/.langfuse"
fi
workspace_identity_file="${workspace_identity_dir:+$workspace_identity_dir/me.md}"

install_identity_file() {
  local dest_dir="$1"
  local source="$2"
  local dest_file="$dest_dir/me.md"

  if [[ -z "$dest_dir" || ! -f "$source" ]]; then
    return 0
  fi
  if [[ -f "$dest_file" ]]; then
    return 0
  fi
  umask 077
  if ! mkdir -p "$dest_dir"; then
    echo "Langfuse identity: could not create $dest_dir; onboarding can retry during the agent session."
    return 0
  fi
  chmod 700 "$dest_dir" || true
  if cp "$source" "$dest_file"; then
    echo "Langfuse identity: wrote $dest_file"
  fi
}

if [[ "$mode" = "write" && -n "$identity_file" && -f "$identity_file" ]]; then
  echo "Langfuse identity: already configured at $identity_file"
  install_identity_file "$workspace_identity_dir" "$identity_file"
  exit 0
fi

if [[ "$mode" = "write" && -n "$workspace_identity_file" && -f "$workspace_identity_file" ]]; then
  echo "Langfuse identity: already configured at $workspace_identity_file"
  # An OpenCode-first run may have only the workspace file. A later Cloud
  # start or desktop postinstall should still seed the machine-level copy.
  install_identity_file "$identity_dir" "$workspace_identity_file"
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

tmp_dir="$(mktemp -d)"
tmp_file="$tmp_dir/me.md"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

set +e
LINEAR_RESPONSE="$response" python3 - "$tmp_file" "$repo_root" <<'PY'
import datetime
import json
import os
import sys

tmp_file, repo_root = sys.argv[1:]
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
print(f"Langfuse identity: recovered {name} <{email}>")
PY
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  echo "Langfuse identity: recovery skipped; onboarding can retry during the agent session."
  exit 0
fi

install_identity_file "$identity_dir" "$tmp_file"
install_identity_file "$workspace_identity_dir" "$tmp_file"
