---
name: agent-setup-maintenance
description: |
  Shared workflow for editing Langfuse's repo-owned agent setup under `.agents/`.
  Use when changing AGENTS files, shared skills, `.agents/config.json`,
  generated shim behavior, provider discovery paths, or install-time agent sync.
---

# Agent Setup Maintenance

Use this skill when changing the shared agent setup for the repository.

## Start Here

- Read [`../../README.md`](../../README.md) for the shared config and shim model.
- Read root [`../../AGENTS.md`](../../AGENTS.md) for repo-level expectations.
- Inspect [`../../../scripts/agents/sync-agent-shims.mjs`](../../../scripts/agents/sync-agent-shims.mjs)
  before changing generated outputs or provider discovery behavior.
- Inspect [`../../../scripts/postinstall.sh`](../../../scripts/postinstall.sh)
  and [`../../../package.json`](../../../package.json) when changing install-time
  sync behavior.

## Workflow

1. Edit the canonical files under `.agents/`, not generated provider outputs.
2. Keep root `AGENTS.md` and `CLAUDE.md` as discovery symlinks; do not turn
   them back into manually maintained copies.
3. Treat tool-specific directories such as `.claude/`, `.cursor/`, `.codex/`,
   `.vscode/`, and `.mcp.json` as generated discovery surfaces unless the tool
   requires a truly tool-specific feature.
4. Keep root `AGENTS.md` concise and router-like. Move detailed or conditional
   workflows into shared skills or package `AGENTS.md` files.
5. When adding or changing a shared skill, update `skills/README.md` and link
   it from root `AGENTS.md` if it changes the default reusable workflow.
6. When shared setup behavior changes materially, update `README.md` and
   contributor-facing docs in the same PR.

## Docker / Install-Time Constraint

- `pnpm install` runs in environments that may not contain the full repo source
  tree.
- In Docker builds, Turbo's pruned install stage can run root `postinstall`
  before `scripts/` and `.agents/` are available in the image.
- Keep install-time agent setup logic robust in those pruned contexts: skip
  cleanly when the required repo-owned files are not present.

## Required Verification

Run after changing shared agent setup:

- `pnpm run agents:sync`
- `pnpm run agents:check`

Run additional verification when relevant:

- `pnpm run postinstall` when install-time behavior changes
- targeted tests for any scripts you changed

## Design Rules

- Prefer one repo-owned source of truth over duplicated provider-specific files.
- Keep shared setup tool-neutral where possible.
- Only keep provider-specific files in source control when the provider requires
  a fixed discovery path or feature that cannot be expressed through the shared
  setup model.
