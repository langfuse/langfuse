# Langfuse Agent Guide

Langfuse is an open source LLM engineering platform for developing, monitoring,
evaluating, and debugging AI applications.

This file is the canonical, shared guide for coding and review agents in this
repository.

## Source of Truth & Scope
- `AGENTS.md` is a living document.
- Update this file in the same PR when monorepo-level architecture, workflows,
  dependency boundaries, mandatory verification commands, or release/security
  processes materially change.
- For package-local material changes, update the corresponding package guide in
  the same PR:
  - `web/AGENTS.md`
  - `worker/AGENTS.md`
  - `packages/shared/AGENTS.md`
  - `ee/AGENTS.md`
- Keep guidance DRY: this root file should stay monorepo-level; package-local
  implementation details belong in package guides.

## Production Scale Context (Use for Engineering Decisions)
Langfuse operates at large multi-tenant scale:
- **>80M traces/day**
- **>5B tracing events/month**
- **Thousands of customers** in one shared multi-tenant deployment

Design implications:
- Optimize for tenant isolation and predictable, index-friendly access paths.
- Avoid global scans on hot paths.
- Be careful with operations that work at small scale but degrade heavily at
  production volume.
- Assume noisy-neighbor effects and design queueing, retries, and caching
  accordingly.

## Monorepo Architecture
```text
langfuse/
├─ web/                     # Next.js app (UI + tRPC + public REST)
├─ worker/                  # Queue consumers and background processing
├─ packages/shared/         # Shared domain, DB, queue contracts, repositories
├─ ee/                      # Enterprise package consumed by web
├─ generated/               # Generated API clients (do not hand-edit)
├─ fern/                    # API definition sources
└─ scripts/                 # Repo scripts
```

Dependency direction:
- `web` -> `@langfuse/shared`, `@langfuse/ee`
- `worker` -> `@langfuse/shared`
- `@langfuse/ee` -> `@langfuse/shared`
- `@langfuse/shared` -> no imports from `web`, `worker`, or `ee`

Ownership note:
- Queue payload schemas and queue-name contracts are owned by
  `packages/shared/src/server/queues.ts`.

## Tech Stack & Key Patterns
- **Web (`web/`)**: Next.js 14 Pages Router, tRPC + public REST, Prisma +
  Postgres, ClickHouse, NextAuth/Auth.js, Tailwind, Zod v4 (`zod/v4`).
- **Worker (`worker/`)**: Express.js, BullMQ + Redis.
- **Infra**: Postgres, ClickHouse, Redis, MinIO/S3.

Implementation conventions:
- New frontend features belong in `web/src/features/[feature-name]/`.
- Public API routes belong in `web/src/pages/api/public`.
- For frontend cloud detection, use `useLangfuseCloudRegion` (never direct env
  checks for this decision).
- Window location usage must support custom `basePath`.

## Build, Dev, and Verification
Core commands:
- Install deps: `pnpm install`
- Dev all: `pnpm run dev`
- Dev web: `pnpm run dev:web`
- Dev worker: `pnpm run dev:worker`
- Codex bootstrap: `bash scripts/codex/setup.sh`
- Codex maintenance: `bash scripts/codex/maintenance.sh`
- Lint all: `pnpm run lint`
- Typecheck all: `pnpm run typecheck` / `pnpm tc`
- Build verification (required when trying builds): `pnpm run build:check`
- Full build: `pnpm run build`
- Full reset/bootstrap (destructive): `pnpm run dx`

Additional useful commands:
- DB generate: `pnpm run db:generate`
- DB migrate/reset/seed (run from `packages/shared/`):
  - `pnpm run db:migrate`
  - `pnpm run db:reset`
  - `pnpm run db:seed`
- Infra down: `pnpm run infra:dev:down`
- Format: `pnpm run format`
- Nuke (destructive): `pnpm run nuke`

Minimum verification matrix:

| Change scope | Minimum verification |
| --- | --- |
| `web/**` only | `pnpm --filter web run lint` + targeted web tests |
| `worker/**` only | `pnpm --filter worker run lint` + targeted worker tests |
| `packages/shared/**` (non-schema) | `pnpm --filter @langfuse/shared run lint` + one targeted web check + one targeted worker check |
| `packages/shared/prisma/**` or `packages/shared/clickhouse/**` | `pnpm --filter @langfuse/shared run lint` + `pnpm run db:generate` + targeted web/worker regressions |
| Public API contract (`web/src/pages/api/public/**`, `web/src/features/public-api/types/**`, `fern/apis/**`) | web lint + targeted server API tests + Fern update/regeneration; never hand-edit `generated/**` |
| Cross-package refactor (`web` + `worker` + `shared`) | `pnpm run lint` + `pnpm run typecheck` + targeted tests per impacted package |

## Coding & Testing Standards
General:
- Keep changes scoped; avoid unrelated refactors.
- Prefer package-local details in package `AGENTS.md` files.
- TypeScript: avoid `any` when possible.
- Prefer a single params object for functions with multiple args.
- Avoid moving functions around unless needed (reviewability).
- For large arrays, prefer `concat` over spread.

Generated/build artifacts (never hand-edit):
- `generated/*`
- `web/.next/*`
- `web/.next-check/*`
- `*/dist/*`
- `packages/shared/prisma/generated/*`

Testing:
- Keep tests independent and parallel-safe.
- In `web/src/__tests__/server`, avoid `pruneDatabase`.
- Client tests should use `....clienttest.ts` naming.
- For bug fixes: write a failing test first, verify failure, then implement fix.

## Review Checklist (Apply During Implementation and Review)
Database & queries:
- **ClickHouse clustered migrations** (`packages/shared/clickhouse/migrations/clustered`):
  - include `ON CLUSTER default`
  - use `Replicated*MergeTree`
- **ClickHouse unclustered migrations** (`.../unclustered`):
  - no `ON CLUSTER`
  - no `Replicated*`
- Keep clustered/unclustered migration counterparts aligned except for the
  required cluster/replication differences.
- New ClickHouse indexes should include corresponding `MATERIALIZE INDEX`
  statements in the same migration (consider `SETTINGS mutations_sync = 2` for
  smaller tables).
- On project-scoped ClickHouse tables, require
  `WHERE project_id = {projectId: String}`.
- Never use `FINAL` on the `events` table.
- Most `schema.prisma` changes should produce a migration in
  `packages/shared/prisma/migrations`.
- On project-scoped Prisma queries, include `projectId` in `where`.

Runtime/config:
- Import env vars via package `env.mjs/ts` modules, not `process.env.*`
  directly.
- Avoid generic `redis.call` when native redis client methods are available.

Frontend layout:
- Use `top-banner-offset` instead of `top-0` for global
  `sticky`/`fixed`/`absolute` top positioning.
- Banner offset uses CSS vars (`--banner-height`, `--banner-offset`) in
  `web/src/styles/globals.css`.
- Banner components should update `--banner-height` via `ResizeObserver` when
  needed.
- Available utilities:
  - `top-banner-offset` / `pt-banner-offset`
  - `h-screen-with-banner` / `min-h-screen-with-banner`

Public API docs:
- Changes in `web/src/features/public-api/types` usually require updates in
  `fern/apis` and regeneration outputs (never hand-edit `generated/**`).
- Fern type mapping:
  - `nullish` -> `optional<nullable<T>>`
  - `nullable` -> `nullable<T>`
  - `optional` -> `optional<T>`

Data model changes:
- Update seeders when new features change the data model.

## PR, Release, and Operations Notes
- Follow Conventional Commits.
- In PR descriptions, list impacted packages and executed verification commands.
- Use repo-relative paths in docs/runbooks.
- Docs repository is available at `../langfuse-docs/`.
- GitHub issue search: `gh search issues`.

Release:
- Release workflow is managed at root (`pnpm run release`).
- Cloud deployments trigger from pushes to `production`
  (`.github/workflows/deploy.yml`).
- Promote `main` to `production` via
  `.github/workflows/promote-main-to-production.yml` (`workflow_dispatch`).
- Use `pnpm run release:cloud` for CLI-triggered cloud promotions with
  preflight checks.
- Do not change release/versioning flow without updating this file and impacted
  package guides.

Security:
- Never commit secrets/credentials.
- Keep `.env*.example` synchronized with required env vars.
- Follow `SECURITY.md` for vulnerability handling.

Troubleshooting:
- Lint/typecheck failures: `pnpm run lint`, `pnpm run tc`.
- Schema/client drift: `pnpm run db:generate`.
- Local infra issues: `pnpm run infra:dev:up`; use `pnpm run dx` only when a
  destructive reset is intended.

Git hygiene:
- Do not use destructive git commands (for example `reset --hard`) unless
  explicitly requested.
- Do not revert unrelated working-tree changes.
- Keep commits focused and atomic.

## Related Guidance Files
- `CLAUDE.md` points to this file as canonical guidance.
- Additional folder-specific rules may exist under `.cursor/rules/`.
