# Shared Agent Setup

This directory is the neutral, repo-owned source of truth for agent behavior in
Langfuse.

Use `.agents/` for configuration and guidance that should apply across tools.
Do not put durable shared guidance only in `.claude/`, `.codex/`, `.cursor/`,
or `.vscode/`.

## Layout

- `AGENTS.md`: canonical shared root instructions
- `config.json`: shared bootstrap and MCP configuration used to generate
  tool-specific shims
- `skills/`: shared, tool-neutral implementation guidance for recurring
  workflows

## `config.json`

`.agents/config.json` contains four kinds of data:

- `shared`: defaults used across tools
- `mcpServers`: project MCP servers and how to connect to them
- `claude`: Claude-specific generated settings inputs
- `codex`: Codex-specific generated settings inputs
- `cursor`: Cursor-specific generated settings inputs

Current shape:

```json
{
  "shared": {
    "setupScript": "bash scripts/codex/setup.sh",
    "devCommand": "pnpm run dev",
    "devTerminalDescription": "Main development terminal running the development server"
  },
  "mcpServers": {
    "playwright": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "datadog": {
      "transport": "http",
      "url": "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp"
    }
  },
  "claude": {
    "settings": {}
  },
  "codex": {
    "environment": {
      "version": 1,
      "name": "langfuse"
    }
  },
  "cursor": {
    "environment": {
      "agentCanUpdateSnapshot": false
    }
  }
}
```

## How Shims Are Generated

`scripts/agents/sync-agent-shims.mjs` reads `.agents/config.json` and writes the
tool discovery files that those products require.

Generated local artifacts:

- `.claude/settings.json`
- `.claude/skills/*`
- `.cursor/environment.json`
- `.cursor/mcp.json`
- `.vscode/mcp.json`
- `.mcp.json`
- `.codex/config.toml`
- `.codex/environments/environment.toml`

The repo root discovery files remain committed as symlinks:

- `AGENTS.md` -> `.agents/AGENTS.md`
- `CLAUDE.md` -> `AGENTS.md`

This keeps provider discovery stable while `.agents/` remains the source of
truth.

## When To Edit `config.json`

Edit `.agents/config.json` when you need to:

- add, remove, or update a shared MCP server
- change the shared setup/bootstrap command
- change the default dev command or terminal label used by generated shims
- adjust generated Claude, Cursor, or Codex settings that are intentionally
  modeled in the shared config

Do not edit generated shim files by hand. Edit the canonical files in
`.agents/` instead.

## How To Extend `config.json`

### Add an MCP server

Add a new entry under `mcpServers`.

For `stdio` servers:

```json
{
  "mcpServers": {
    "example": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "some-package"]
    }
  }
}
```

For HTTP servers:

```json
{
  "mcpServers": {
    "example": {
      "transport": "http",
      "url": "https://example.com/mcp"
    }
  }
}
```

Optional fields:

- `env` for `stdio` servers
- `headers` for HTTP servers

### Change bootstrap or default dev command

Update values in `shared`:

- `setupScript`
- `devCommand`
- `devTerminalDescription`

### Add tool-specific generated inputs

Only add tool-specific fields when they are required to generate a discovery
file for a supported tool. Keep the shared config minimal and neutral.

## Workflow

After editing `.agents/config.json`:

1. Run `pnpm run agents:sync`
2. Run `pnpm run agents:check`
3. Verify you did not stage any generated files under `.claude/skills/` or the
   generated MCP/runtime config paths
4. Update `AGENTS.md` or `CONTRIBUTING.md` if the shared workflow materially
   changed

`pnpm install` also runs the sync/check flow via `postinstall`.

## Adding Shared Skills

Shared skills live under `.agents/skills/`.

Use them for durable, reusable guidance such as:

- backend implementation patterns
- provider-specific maintenance workflows
- repeated repo-specific review checklists

Do not use skills for one-off task notes or tool runtime configuration.

`pnpm run agents:sync` projects the shared skills into `.claude/skills/` so
Claude can discover the same repo-owned skills.

For the skill authoring workflow, see [skills/README.md](skills/README.md).
