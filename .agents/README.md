# Shared Agent Setup

This directory is the neutral, repo-owned source of truth for agent behavior in
Langfuse.

Use `.agents/` for configuration and guidance that should apply across tools.
Do not put durable shared guidance only in `.claude/`, `.codex/`, `.cursor/`,
or `.vscode/`.

## Layout

- `AGENTS.md`: canonical shared root instructions
- `ARCHITECTURE_PRINCIPLES.md`: architecture principles for high-scale
  observability
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
    "setupScript": "bash scripts/agents/setup.sh",
    "devCommand": "pnpm run dev",
    "devTerminalDescription": "Main development terminal running the development server"
  },
  "mcpServers": {
    "playwright": {
      "transport": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@latest",
        "--isolated",
        "--save-session",
        "--output-dir",
        "/tmp/playwright-mcp",
        "--test-id-attribute",
        "data-testid"
      ]
    },
    "langfuse-docs": {
      "transport": "http",
      "url": "https://langfuse.com/api/mcp"
    },
    "linear": {
      "transport": "http",
      "url": "https://mcp.linear.app/mcp"
    }
  },
  "claude": {
    "settings": {
      "permissions": {
        "allow": [
          "Bash(find:*)",
          "Bash(rg:*)",
          "Bash(grep:*)",
          "Bash(ls:*)",
          "Bash(cat:*)",
          "Bash(head:*)",
          "Bash(tail:*)"
        ],
        "deny": []
      },
      "enableAllProjectMcpServers": true
    }
  },
  "codex": {
    "environment": {
      "version": 1,
      "name": "langfuse"
    }
  },
  "cursor": {
    "environment": {
      "name": "langfuse",
      "user": "ubuntu",
      "build": {
        "dockerfile": "Dockerfile",
        "context": ".."
      },
      "install": "bash scripts/agents/setup-cursor-cloud.sh",
      "start": "bash scripts/agents/start-cursor-cloud.sh",
      "ports": [
        { "name": "Langfuse web", "port": 3000 },
        { "name": "Langfuse worker health", "port": 3030 }
      ],
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
- `.cursor/mcp.json`
- `.vscode/mcp.json`
- `.mcp.json`
- `.codex/config.toml`
- `.codex/environments/environment.toml`

Cursor must read its environment contract before it can run the install script,
so `.cursor/environment.json` is the one generated configuration file committed
to the repository. Generate it from `.agents/config.json`; never edit it by
hand. `.cursor/Dockerfile` is also committed because it is an intentionally
Cursor-specific runtime definition.

Discovery files are committed as symlinks, not generated locally, so a fresh
clone has guidance before `pnpm install` runs:

- `AGENTS.md` -> `.agents/AGENTS.md`
- `CLAUDE.md` -> `AGENTS.md`
- a sibling `CLAUDE.md` -> `AGENTS.md` next to **every** `AGENTS.md` in the
  tree, discovered by walking it (currently `web/`, `worker/`, `ee/`,
  `packages/shared/`, `packages/shared/scripts/seeder/`)

Claude reads a nested `CLAUDE.md` when it opens a file in that directory, so
package-local guidance loads only when it is relevant. Dot-directories are
skipped during discovery, which keeps vendored skill bundles such as
`web/.agents/skills/vercel-*/AGENTS.md` from becoming directory-scoped
instructions. A shim whose `AGENTS.md` is deleted or moved is swept on the next
sync. Add an `AGENTS.md` anywhere and you must commit its generated shim —
CI fails otherwise.

This keeps provider discovery stable while `.agents/` remains the source of
truth.

## Validation

Two levels, deliberately separated:

- `node scripts/agents/sync-agent-shims.mjs --check` verifies the generated
  config files and shims. This is what `postinstall` runs.
- `pnpm run agents:check` adds `--check-paths`, which resolves every path an
  `AGENTS.md` cites and fails on a broken one. The lint job runs this.

Path validation is kept out of `postinstall` on purpose: failing it there would
break `pnpm i`, and with it every CI job that installs, over a documentation
typo. References that escape upward (`../langfuse-docs/**`) are reported only
when they resolve, since a standalone clone legitimately lacks sibling
checkouts.

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

## Cursor Cloud

Cursor Cloud uses the committed environment file to build an Ubuntu 24.04
machine with Node.js 24 and nested Docker support. Builds run
`scripts/agents/setup-cursor-cloud.sh`, which delegates to the shared,
idempotent setup and then installs Cursor's Playwright system dependencies.
Each agent run starts the six-service source stack with
`scripts/agents/start-cursor-cloud.sh`.

The start script builds and waits for web, worker, PostgreSQL, ClickHouse,
Redis, and MinIO, seeds the synthetic demo project, and verifies the web and
worker health endpoints. The default Cursor VM is accepted only after three
successful starts without OOMs or restart loops; otherwise use a larger
Enterprise resource profile.

The script deliberately prevents the workspace `.env` and exported application
variables from participating in Compose interpolation. That file configures
host processes with `localhost` service URLs, while containers must use Compose
service names such as `postgres`, `clickhouse`, and `redis`. Only Docker client
and public build controls are passed into Compose. The seed command also receives
explicit local connection URLs so an exported secret cannot redirect it to an
external database.

Nested Cursor VMs sometimes leave `/var/run` mode `0700`, which hides
`docker.sock` from the `ubuntu` agent user even when that user is in the
`docker` group. `start-cursor-cloud.sh` opens search/execute on the socket
parent directories (and loosens the socket if needed) before probing the
daemon, including again after `service docker start`.

### Cursor team tools

Repository files cannot publish or authenticate Cursor Team Marketplace MCPs.
A team admin must configure these under **Dashboard > Integrations & MCP**.
Use HTTP/OAuth where available so credentials remain outside the agent VM.

| Tool group | Cursor distribution | Default policy |
| --- | --- | --- |
| GitHub | Cursor GitHub App | Enabled for same-repo branches, draft PRs, CI, and preview status |
| Langfuse Docs | Shared HTTP MCP | Enabled, read-only |
| Linear | Shared OAuth MCP | Enabled; allow read/search tools only |
| Datadog EU and US | Team Marketplace MCPs | Enabled; allow logs, metrics, traces, dashboards, and monitor reads only |
| Metabase | Team Marketplace MCP | Enabled; allow metadata and query reads only |
| Pylon | Team Marketplace MCP | Enabled; allow issue/thread/customer reads only |
| incident.io | Team Marketplace MCP | Enabled; allow incident, alert, and follow-up reads only |
| ClickHouse Cloud | Team Marketplace MCP | Enabled; allow organization, service, query, and status reads only |
| Circleback | Team Marketplace MCP | Enabled; allow meeting, transcript, calendar, email, and action-item reads only |
| Slack | Cursor Marketplace integration | Enabled; allow search/history/channel reads only |
| Google Drive | Cursor Marketplace integration | Enabled; allow file search, metadata, export, and content reads only |
| PostHog | Cursor Marketplace integration | Enabled; allow analytics, schema, query, and insight reads only |
| Browser automation | Cursor computer use in Cloud; Playwright MCP locally | Enabled; never reuse a developer's local authenticated browser session |

Do not approve create, save, update, delete, comment, reply, send, resolve,
archive, acknowledge, execute-DDL, or settings-management tools. Review the
server's discovered tool list whenever an MCP version changes; naming heuristics
do not replace an explicit allowlist. Production/support data must not be copied
into public preview accounts or Cursor PR artifacts.

Use `Default + allowlist` network mode. Include the package and container
registries used by the Dockerfile and Compose stack, GitHub, Langfuse preview
hosts, and `cloud-agent-artifacts.s3.us-east-1.amazonaws.com` when PR artifacts
are enabled. Do not grant Cursor AWS/EKS credentials for preview wakeups;
preview QA runs during Mon-Fri 08:00-24:00 Europe/Berlin.

## Workflow

After editing `.agents/config.json`:

1. Run `pnpm run agents:sync`
2. Run `pnpm run agents:check`
3. Commit `.cursor/environment.json` when its canonical input changes, but do
   not stage other generated MCP/runtime config or `.claude/skills/` outputs
4. Update `AGENTS.md` or `CONTRIBUTING.md` if the shared workflow materially
   changed

`pnpm install` also runs the sync and the shim check via `postinstall`. It does
not run path validation — see [Validation](#validation).

## Adding Shared Skills

Shared skills live under `.agents/skills/`.

Use them for durable, reusable guidance such as:

- backend implementation patterns
- provider-specific maintenance workflows
- repeated repo-specific review checklists

Do not use skills for one-off task notes or tool runtime configuration.

Use `skills/skill-creator/SKILL.md` when creating or editing shared skills.
`pnpm run agents:sync` projects the shared skills into `.claude/skills/` so
Claude can discover the same repo-owned skills.
