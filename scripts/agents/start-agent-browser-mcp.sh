#!/usr/bin/env bash

set -euo pipefail

# Keep every MCP client isolated from other agents and from the developer's
# browser profile. The process-scoped session is intentionally not restored.
agent_browser_session="langfuse-mcp-$$"

cleanup() {
  AGENT_BROWSER_SESSION="$agent_browser_session" pnpm exec agent-browser close >/dev/null 2>&1 || true
}

trap cleanup EXIT

AGENT_BROWSER_SESSION="$agent_browser_session" \
AGENT_BROWSER_ENABLE="react-devtools" \
AGENT_BROWSER_CONTENT_BOUNDARIES="1" \
AGENT_BROWSER_MAX_OUTPUT="50000" \
  pnpm exec agent-browser mcp --tools core,network,react,debug,tabs,mobile
