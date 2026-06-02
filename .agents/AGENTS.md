# Agent Guidelines for Langfuse

This is the canonical root agent guide for the repo. The root `AGENTS.md`
should remain only as a discovery symlink so tools that require that filename
continue to work while `.agents/` stays the source of truth.

Langfuse is an open source LLM engineering platform for developing, monitoring,
evaluating, and debugging AI applications.

## Maintenance Contract

- `AGENTS.md` is a living document.
- Keep this file concise and router-like. Push narrow or conditional workflows
  into package-local `AGENTS.md` files or shared skills under `.agents/skills/`.
- Update this file in the same PR when monorepo-level architecture, workflows,
  dependency boundaries, mandatory verification commands, or release/security
  processes materially change.

## How To Work

- Read the minimal local context required for the task.
- Keep changes scoped and avoid unrelated refactors.
- Do not revert unrelated working-tree changes.
- For bug fixes, write the failing test first, confirm it fails, then fix the
  bug.
- For user-visible frontend changes in `web/**`, review the affected flow in a
  real browser before signoff.
- Never add secrets or credentials to the repo. Keep `.env*.example` files in
  sync with required env vars.

## Project Structure

```text
langfuse/
|- web/                     # Next.js app (UI + tRPC + public REST)
|- worker/                  # Queue consumers and background processing
|- packages/shared/         # Shared domain, DB, queue contracts, repositories
|- ee/                      # Enterprise package consumed by web
|- generated/               # Generated API clients (do not hand-edit)
|- fern/                    # API definition sources
`- scripts/                 # Repo scripts
```

- Dependency direction:
  - `web` -> `@langfuse/shared`, `@langfuse/ee`
  - `worker` -> `@langfuse/shared`
  - `@langfuse/ee` -> `@langfuse/shared`
  - `@langfuse/shared` -> no imports from `web`, `worker`, or `ee`
- Queue payload schemas and queue-name contracts are owned by
  `packages/shared/src/server/queues.ts`.
- High-signal shared entry points:
  - Domain models: `packages/shared/src/domain/{observations,traces,scores}.ts`
  - Postgres schema: `packages/shared/prisma/schema.prisma`
  - ClickHouse migrations:
    `packages/shared/clickhouse/migrations/{clustered,unclustered}/*.sql`
- Architecture principles live in `.agents/ARCHITECTURE_PRINCIPLES.md`.

## Core Commands

- Install deps: `pnpm install`
- Dev all packages: `pnpm run dev`
- Dev web only: `pnpm run dev:web`
- Dev worker only: `pnpm run dev:worker`
- Lint all: `pnpm run lint`
- Typecheck all: `pnpm run typecheck` / `pnpm tc`
- Build check: `pnpm run build:check`
- Full build: `pnpm run build`
- Worktree bootstrap: `bash scripts/codex/setup.sh`
- Worktree maintenance: `bash scripts/codex/maintenance.sh`
- Install Playwright Chromium: `pnpm run playwright:install`

## Verification

- `web/**`: `pnpm run lint` plus targeted web tests.
- `worker/**`: `pnpm run lint` plus targeted worker tests.
- `packages/shared/**` non-schema changes:
  `pnpm run lint` plus one targeted web check and one targeted worker check.
- `packages/shared/prisma/**` or `packages/shared/clickhouse/**`:
  `pnpm run lint`, `pnpm run db:generate`, and targeted web/worker
  regressions.
- Public API contracts in `web/src/pages/api/public/**`,
  `web/src/features/public-api/types/**`, or `fern/apis/**`: `pnpm run lint`,
  targeted server API tests, and Fern update/regeneration.
- Cross-package refactors: `pnpm run lint`, `pnpm run typecheck`, and targeted
  tests for impacted packages.

## Generated Files

Do not hand-edit generated or build artifacts:

- `generated/*`
- `web/.next/*`
- `web/.next-check/*`
- `*/dist/*`
- `packages/shared/prisma/generated/*`

Public API contract changes must update Fern sources in `fern/apis/**` and
regenerated outputs. Never hand-edit `generated/**`.

## Shared Agent Setup

- `.agents/AGENTS.md` is the canonical root guide.
- Root `AGENTS.md` is a symlink to `.agents/AGENTS.md`.
- Root `CLAUDE.md` is a compatibility symlink to `AGENTS.md`.
- Shared agent/tool config lives in `.agents/config.json` and shared skills
  live in `.agents/skills/`.
- When creating or editing `.agents/skills/**`, use
  `.agents/skills/skill-creator/SKILL.md`, keep `SKILL.md` concise with
  progressive disclosure, and run the shared agent verification below.
- After changing shared agent setup, run `pnpm run agents:sync` and
  `pnpm run agents:check`.
- Generated provider config and shim outputs under `.claude/`, `.cursor/`,
  `.codex/`, `.vscode/`, or `.mcp.json` are local artifacts, not source of
  truth files.
