# Agent Guidelines for Langfuse

Langfuse is an open source LLM engineering platform for developing, monitoring,
evaluating, and debugging AI applications.

## How To Work

- Read the minimal local context required for the task.
- Keep changes scoped and avoid unrelated refactors.
- For bug fixes, write the failing test first, confirm it fails, then fix the
  bug. If the bug depends on a data shape, pause and ask: can
  `pnpm run seed` prefill that shape locally? If not, consider extending a
  seeder scenario so the bug stays cheaply reproducible
  (`packages/shared/scripts/seeder/AGENTS.md`), or note why a seed cannot
  express it.
- For user-visible frontend changes in `web/**`, review the affected flow in a
  real browser before signoff. Prefill the data the flow needs with the seed
  CLI (`pnpm run seed -- list` shows scenarios; runs print UI deep links) —
  never with ad-hoc scripts or raw ClickHouse inserts.
- For documentation screenshots in Markdown, avoid fixed `height` on `<img>`
  tags; prefer Markdown images or width-only HTML so previews preserve aspect
  ratio.
- When working on the search bar or any filtering UI/grammar, read
  `web/src/features/search-bar/README.md` first. It owns the grammar ↔
  `FilterState` contract, the validate/lower parity invariants, and the
  cross-view extension playbook — the bar is intended to become the primary
  filter interface for every filterable view, so new filtering work extends it
  through that contract rather than forking it.
- When adding or modifying any chart, dashboard, or chart formatter, read
  `web/src/features/widgets/chart-library/ARCHITECTURE.md` first — the charts
  manifesto. It owns the data → preparer → visualiser contract: presentation
  decisions live in the preparer, not the chart components.
- Do not add or widen ESLint disable comments or config overrides
  without explicit user approval for the exact rule and scope.
- Always quote file paths in shell commands, or use `noglob` for path-heavy
  commands, to avoid zsh glob expansion issues with dynamic Next.js routes.
- Never commit secrets or credentials. Keep `.env*.example` files in
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
- Run a single test file (vitest filters on the filename argument):
  - web server tests: `pnpm --filter web run test <file>`
    (client tests: `pnpm --filter web run test-client <file>`)
  - worker: `pnpm --filter worker run test <file>`
  - shared: `pnpm --filter @langfuse/shared run test <file>`
- Build check: `pnpm run build:check`
- Full build: `pnpm run build`
- Worktree bootstrap: `bash scripts/codex/setup.sh`
- Worktree maintenance: `bash scripts/codex/maintenance.sh`
- Install Playwright Chromium: `pnpm run playwright:install`

## Local Data Inspection

- For feature testing and debugging, inspect the local databases directly when
  it helps you understand the existing test data. Prefer read-only queries, and
  continue to use the seed CLI to create frontend test state rather than
  ad-hoc inserts.
- Dev Docker Compose exposes these clients on `${HOST_IP:-127.0.0.1}`:
  - Postgres: `PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h "${HOST_IP:-127.0.0.1}" -p "${POSTGRES_HOST_PORT:-5432}" -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}"`
  - ClickHouse: `clickhouse client --host "${HOST_IP:-127.0.0.1}" --port "${CLICKHOUSE_NATIVE_PORT:-9000}" --user "${CLICKHOUSE_USER:-clickhouse}" --password "${CLICKHOUSE_PASSWORD:-clickhouse}" --database default`
  - Redis: `REDISCLI_AUTH="${REDIS_AUTH:-myredissecret}" redis-cli -h "${HOST_IP:-127.0.0.1}" -p "${REDIS_HOST_PORT:-6379}"`
- If any connection fails, check `docker-compose.dev.yml` for local override
  variables and confirm the services are running.

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
- Client-bundle soundness: CI scans every prod web build
  (`pnpm run scan:client-bundle`) for minifier-dropped bindings and Node-only
  globals leaking into browser chunks — the SWC dropped-binding class ships
  runtime-only `ReferenceError`s that dev builds and type checks cannot see
  (LFE-10645). On failure, `scripts/scan-client-bundle.mjs`'s header explains
  the canonical fix.

End your turn with evidence, not claims: quote each check's summary line —
e.g. `Tasks: 8 successful, 8 total` (turbo lint/typecheck) or
`Tests  12 passed (12)` (vitest) — say which checks you skipped and why,
never report unverified work as done, and never end with work pending.

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
- When creating or editing `.agents/skills/**`, use
  `.agents/skills/skill-creator/SKILL.md`; keep skills concise with
  progressive disclosure.
- After changing shared agent setup, run `pnpm run agents:sync` and
  `pnpm run agents:check`.
- Generated provider config and shim outputs under `.claude/`, `.cursor/`,
  `.codex/`, `.vscode/`, or `.mcp.json` are local artifacts, not source of
  truth files.
