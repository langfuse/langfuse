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
- Codex environment bootstrap: `bash scripts/codex/setup.sh`
- Codex environment maintenance: `bash scripts/codex/maintenance.sh`
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
- When you write a test for a bug or similar, write the test that fails first. Check that it fails. Only then fix the bug. Otherwise, the test is not good!

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
- Repo-owned Codex cloud bootstrap lives in `scripts/codex/setup.sh` and `scripts/codex/maintenance.sh`; contributors still configure the actual environment in the Codex UI.

## Release Channel
- Release workflow is managed at root (`pnpm run release`).
- Langfuse Cloud deployments are triggered by pushes to `production` (`.github/workflows/deploy.yml`).
- Promote `main` to `production` via `.github/workflows/promote-main-to-production.yml` (manual `workflow_dispatch`).
- Use `pnpm run release:cloud` for CLI-triggered Cloud promotions with preflight branch/migration checks.
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

## Cursor Cloud specific instructions

### Prerequisites
The VM snapshot includes Node.js v24.6.0 (via nvm), pnpm 9.5.0, Docker, the `migrate` CLI (golang-migrate), and the `clickhouse` client. The update script runs `pnpm install` and `pnpm run db:generate` automatically on startup.

### Starting the development environment
1. **Start infrastructure** (Postgres, ClickHouse, Redis, MinIO): `pnpm run infra:dev:up`
2. **Reset databases** (only if needed on first run or after schema changes):
   - Set `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` env var to the user's request text to bypass the Prisma AI-agent safety check.
   - `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<user request>" pnpm --filter=shared run db:reset -f`
   - `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<user request>" pnpm --filter=shared run db:reset:test`
   - `SKIP_CONFIRM=1 pnpm --filter=shared run ch:reset`
   - `pnpm --filter=shared run db:seed:examples`
3. **Build shared package** before running worker tests: `pnpm --filter @langfuse/shared run build`
4. **Start dev servers**: `pnpm run dev` (web on :3000, worker on :3030)

### Gotchas
- **Prisma AI-agent guard**: Prisma `migrate reset` detects Cursor and blocks unless `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` env var is set with the user's consent text.
- **ClickHouse dev tables**: The `ch:dev-tables` step in `ch:reset` requires the `clickhouse` client binary (installed in the snapshot). If it fails with "clickhouse binary could not be found", install via `sudo apt-get install -y clickhouse-client`.
- **Worker tests require shared build**: Run `pnpm --filter @langfuse/shared run build` before running worker tests; otherwise imports from `@langfuse/shared/src/*` will fail to resolve.
- **Lint requires the dev server**: Per `.cursor/rules/general-info.mdc`, ESLint only works correctly when the development server is running.
- **Docker in Cloud VM**: Docker runs inside a Firecracker VM container. The daemon is configured with `fuse-overlayfs` storage driver and `iptables-legacy`. If `dockerd` is not running, start it with `sudo dockerd &`.
- **Login credentials** (after seeding): `demo@langfuse.com` / `password`. The seeded demo project URL: `http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`
- **Format before committing**: Always run `pnpm format` before finishing a task to pass CI formatting checks.
