# Agent Guidelines for Langfuse

Langfuse is an open source LLM engineering platform for developing, monitoring,
evaluating, and debugging AI applications.

## How To Work

- Read the minimal local context required for the task.
- Keep changes scoped and avoid unrelated refactors.
- For bug fixes, first write the smallest failing test that proves the reported
  behavior and confirm it fails against the buggy behavior before changing
  production code. Add another test only when it exercises a distinct adapter,
  contract, or execution path. Extend the closest existing test suite; do not
  create a standalone constant test when an existing feature suite owns the
  behavior. If the bug depends on a data shape, pause and ask: can
  `pnpm run seed` prefill that shape locally? If not, consider extending a
  seeder scenario so the bug stays cheaply reproducible
  (`packages/shared/scripts/seeder/AGENTS.md`), or note why a seed cannot
  express it.
- Prefill local test data with the seed CLI (`pnpm run seed -- list` shows
  scenarios; runs print UI deep links) — never with ad-hoc scripts or raw
  ClickHouse inserts.
- Every PR auto-builds (via GitHub Actions) a disposable, full-stack preview at
  `pr-<N>.preview.langfuse.com` — nothing to spin up. Use the `langfuse-previews`
  skill to use or debug one, e.g. read a preview's web/worker error logs with
  `kubectl`.
- For documentation screenshots in Markdown, avoid fixed `height` on `<img>`
  tags; prefer Markdown images or width-only HTML so previews preserve aspect
  ratio.
- Do not add or widen ESLint disable comments or config overrides
  without explicit user approval for the exact rule and scope.
- Always quote file paths in shell commands, or use `noglob` for path-heavy
  commands, to avoid zsh glob expansion issues with dynamic Next.js routes.
- Never invoke Node-installed binaries through `./node_modules/.bin/*`. Always run them through `pnpm`.
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
- After changing skills / AGENTS.md, run `pnpm run agents:sync` and
  `pnpm run agents:check`.
- **Write agent guidance only in `AGENTS.md`, never in a `CLAUDE.md`.** Every
  `AGENTS.md` in the tree gets a generated sibling `CLAUDE.md` symlink when running
  `pnpm run agents:sync`.
- Put package-local guidance in the narrowest `AGENTS.md` that owns it so that it's only
  loaded into context when needed.
- When creating or editing `.agents/skills/**`, use
  `.agents/skills/skill-creator/SKILL.md`; keep skills concise with
  progressive disclosure.
- Generated provider config and shim outputs under `.claude/`, `.cursor/`,
  `.codex/`, `.vscode/`, or `.mcp.json` are local artifacts, not source of
  truth files.

## Cursor Cloud specific instructions

This section is for Cursor Cloud agents. The VM has no Docker, so the standard
`pnpm run infra:dev:up` / `pnpm run dx*` scripts (which use `docker compose`)
do NOT work here. Local infra runs as native processes instead. The startup
update script only refreshes JS deps (`pnpm install` + `pnpm run db:generate`);
it does not start services. Datastore data, native binaries, and built
`dist/` folders persist in the VM snapshot, so migrations/seed usually do not
need re-running — but the datastores and dev servers are NOT auto-started and
must be started each session as below.

- Toolchain: Node 24 (via `nvm`, set as the default alias) and pnpm (via
  corepack) resolve automatically in login/interactive shells. `/exec-daemon`
  ships an older Node on `PATH`; if a bare non-login shell picks Node 22 or
  cannot find `pnpm`, run commands through a login shell (`bash -lc '…'`).
- Start datastores (run once per session, from the repo root):
  - Postgres, Redis, MinIO (run as the current user, data under
    `.codex/services/`):
    `source scripts/codex/cloud_services.sh && ensure_postgres_running && ensure_redis_running && ensure_minio_running`
  - ClickHouse: the helper's `ensure_clickhouse_running` only works as root, so
    start it as the `clickhouse` system user with default paths instead:
    `sudo -u clickhouse clickhouse-server --daemon --config-file=/etc/clickhouse-server/config.xml --pid-file=/run/clickhouse-server/clickhouse-server.pid`
    (data lives in `/var/lib/clickhouse`; the app user `clickhouse`/`clickhouse`
    already exists in the persisted CH data). Verify with
    `curl -s localhost:8123/ping`.
- Start the app: `pnpm run dev` (web on `:3000`, worker on `:3030`). The worker
  imports `@langfuse/shared` from its built `dist/`, so on a truly fresh tree
  (no `dist/`) it crashes with `MODULE_NOT_FOUND` until you build the libs once:
  `pnpm --filter=@langfuse/shared run build && pnpm --filter=@langfuse/ee run build`,
  then `pnpm run dev`. `dist/` persists in the snapshot, so this is usually a
  one-time step.
- First-time DB init (only if the databases are empty): use
  `pnpm --filter=shared run db:deploy` for Postgres — do NOT use
  `prisma migrate reset` / `pnpm --filter=shared run db:reset`, because Prisma
  blocks destructive resets when invoked by an AI agent. Then
  `pnpm --filter=shared run db:seed`, and for ClickHouse
  `pnpm --filter=shared run ch:up && pnpm --filter=shared run ch:seed && pnpm --filter=shared run ch:dev-tables`.
- Local login (from the default seed): `demo@langfuse.com` / `password`.
- Seeded ingestion API keys (project `llm-app`): public `pk-lf-1234567890`,
  secret `sk-lf-1234567890` — usable to POST traces to
  `http://localhost:3000/api/public/ingestion` (Basic auth) for full-pipeline
  (web → Redis → worker → ClickHouse) testing.
- Service ports: web `3000`, worker `3030`, Postgres `5432`, ClickHouse
  `8123`/`9000`, Redis `6379`, MinIO API `9090` / console `9091`.
