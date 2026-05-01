# Codex Guidelines for `ee`

This file covers package-local guidance for this package.
Use root [AGENTS.md](../AGENTS.md) for monorepo-level rules.

## Purpose
- Enterprise Edition package consumed by `web` and `worker`.
- Contains EE-specific logic and licensing-related integrations.

## Maintenance Contract
- `AGENTS.md` is a living document.
- Update this file in the same PR when material EE package changes happen:
  - new/renamed EE entry points
  - changed EE build/typecheck/lint commands
  - changed integration contracts consumed by `web` or `worker`
- If the change impacts monorepo workflows, update root `AGENTS.md` too.

## High-Signal Entry Points
- Package root exports: `src/index.ts`
- License check module: `src/ee-license-check/index.ts`
- Environment parsing: `src/env.ts`

## Quick Commands
- Dev watch build: `pnpm --filter @langfuse/ee run dev`
- Lint: `pnpm --filter @langfuse/ee run lint`
- Lint fix: `pnpm --filter @langfuse/ee run lint:fix`
- Typecheck: `pnpm --filter @langfuse/ee run typecheck`
- Build: `pnpm --filter @langfuse/ee run build`

## Integration Notes
- `ee` depends on `@langfuse/shared`; coordinate shared type changes carefully.
- Validate downstream usage in `../web/src/ee/*` and `../worker/src/ee/*` when EE
  exports change.

## Package-Specific Rules
- Do not hand-edit `dist/*`.
- Keep EE-only concerns isolated from OSS package code paths.
