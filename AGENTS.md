# Codex Guidelines for Langfuse

Langfuse is an open source LLM engineering platform for developing, monitoring,
evaluating, and debugging AI applications.
Langfuse monorepo guidance for fast, safe code changes.

## Maintenance Contract
- `AGENTS.md` is a living document.
- Update this file in the same PR when monorepo-level architecture, workflows,
  dependency boundaries, mandatory verification commands, or release/security
  processes materially change.
- For package-local material changes, update the package-local `AGENTS.md` in
  the same PR.
- If no material guidance changed, do not edit AGENTS files.

## Project Structure & Module Organization
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

- Package guides:
  - `web/AGENTS.md`
  - `worker/AGENTS.md`
  - `packages/shared/AGENTS.md`
  - `ee/AGENTS.md`
- Dependency direction:
  - `web` -> `@langfuse/shared`, `@langfuse/ee`
  - `worker` -> `@langfuse/shared`
  - `@langfuse/ee` -> `@langfuse/shared`
  - `@langfuse/shared` -> no imports from `web`, `worker`, or `ee`
- Queue payload schemas and queue-name contracts are owned by
  `packages/shared/src/server/queues.ts`.

## Build, Test, and Development Commands
- Install deps: `pnpm install`
- Dev all packages: `pnpm run dev`
- Dev web only: `pnpm run dev:web`
- Dev worker only: `pnpm run dev:worker`
- Lint all: `pnpm run lint`
- Typecheck all: `pnpm run typecheck` / `pnpm tc`
- To try running build, always run `pnpm run build:check` and verify that it succeeds. This does not impact running web servers
- If you have to rebuild all for testing, run: `pnpm run build`
- Full reset/bootstrap (destructive): `pnpm run dx`

Minimum verification matrix:
| Change scope | Minimum verification |
| --- | --- |
| `web/**` only | `pnpm --filter web run lint` + targeted web tests |
| `worker/**` only | `pnpm --filter worker run lint` + targeted worker tests |
| `packages/shared/**` (non-schema) | `pnpm --filter @langfuse/shared run lint` + one targeted web check + one targeted worker check |
| `packages/shared/prisma/**` or `packages/shared/clickhouse/**` | `pnpm --filter @langfuse/shared run lint` + `pnpm run db:generate` + targeted web/worker regressions |
| Public API contract (`web/src/pages/api/public/**`, `web/src/features/public-api/types/**`, `fern/apis/**`) | web lint + targeted server API tests + Fern update/regeneration; never hand-edit `generated/**` |
| Cross-package refactor (`web` + `worker` + `shared`) | `pnpm run lint` + `pnpm run typecheck` + targeted tests per impacted package |

## Coding Style & Naming Conventions
- Keep changes scoped; avoid unrelated refactors.
- Prefer package-local implementation details in package AGENTS files.
- Do not hand-edit generated/build artifacts:
  - `generated/*`
  - `web/.next/*`
  - `web/.next-check/*`
  - `*/dist/*`
  - `packages/shared/prisma/generated/*`

## Testing Guidelines
- Keep each test independent and parallel-safe.
- `web/src/__tests__/server`: avoid `pruneDatabase` calls.
- Client tests contain `....clienttest.ts`

## Commit & Pull Request Guidelines
- Follow Conventional Commits.
- Include AGENTS.md updates in the same PR when guidance materially changes.
- In PR descriptions, list impacted packages and executed verification commands.

## Docs Linking
- Public API contract changes must update Fern sources in `fern/apis/**` and regenerated outputs; do not hand-edit `generated/**`.
- Use repo-relative file paths in docs and runbooks.
- Our docs live in `../langfuse-docs/` which is a different repo. You may always access this.

## Agent-specific Notes
- Root `AGENTS.md` is monorepo-level only.
- Package-local runbooks, commands, and entry points belong in package `AGENTS.md` files.
- Keep guidance DRY: canonicalize to the most specific file.

## Release Channel
- Release workflow is managed at root (`pnpm run release`).
- Do not change release/versioning flow without updating this file and impacted package guides.

## GitHub Search
- use the github cli `gh search issues` to search github.

## GitHub Issues and Pull Requests
- Placeholder: add issue triage and PR hygiene conventions used by maintainers.

## Security and Configuration Tips
- Never commit secrets or credentials.
- Keep examples in `.env*.example` files in sync with required env vars.
- Follow `SECURITY.md` for vulnerability reporting/handling.

## Troubleshooting
- Lint/typecheck failures: run `pnpm run lint` and `pnpm run tc`.
- Schema/client drift: run `pnpm run db:generate`.
- Local infra issues: run `pnpm run infra:dev:up`; use `pnpm run dx` only when destructive reset is intended.

## Git Notes
- Do not use destructive git commands (for example `reset --hard`) unless explicitly requested.
- Do not revert unrelated working-tree changes.
- Keep commits focused and atomic.

## Cursor Rules
- Additional folder-specific rules live in `.cursor/rules/`.
