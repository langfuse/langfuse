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
- `skills/`: shared, tool-neutral implementation guidance for recurring
  workflows

## How Shims Are Generated

`scripts/agents/sync-agent-shims.mjs` keeps repo discovery symlinks and shared
skills aligned across tools.

Committed discovery files:

- `AGENTS.md` -> `.agents/AGENTS.md`
- `CLAUDE.md` -> `AGENTS.md`

Generated local artifacts:

- `.claude/skills/*`

This keeps provider discovery stable while `.agents/` remains the source of
truth.

If a local, untracked `.agents/config.json` is present, the sync script can also
use it to generate provider-specific MCP and runtime config files. Those outputs
under `.claude/`, `.cursor/`, `.codex/`, `.vscode/`, and `.mcp.json` are local
artifacts, not repo source of truth.

## Workflow

After editing shared agent setup:

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

Use `skills/skill-creator/SKILL.md` when creating or editing shared skills.
`pnpm run agents:sync` projects the shared skills into `.claude/skills/` so
Claude can discover the same repo-owned skills.
