# In-App Agent Sandbox Server

Minimal HTTP control server for the in-app agent sandbox runtime.

See `web/src/ee/features/in-app-agent/README.md` for how this package fits into the in-app agent sandbox architecture.

## Privileges

The runtime uses two Unix privilege levels inside the container:

- The HTTP sandbox server runs as the dedicated `sandbox-server` user. It owns and refreshes `/workspace/tool_calls`.
- All tool operations (`read`, `write`, `edit`, `bash`) run as the less-privileged `sandbox-tool` user via a tightly scoped `sudo` rule and only have read access to `/workspace/tool_calls`.

## Endpoints:

- `GET /health`
- `POST /sandbox`

# Development

To rebuild it manually:

`pnpm turbo run build:docker-image --filter @repo/in-app-agent-sandbox-server --force`
