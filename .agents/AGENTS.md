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
- When creating or editing `.agents/skills/**`, use
  `.agents/skills/skill-creator/SKILL.md`; keep skills concise with
  progressive disclosure.
- After changing shared agent setup, run `pnpm run agents:sync` and
  `pnpm run agents:check`.
- Generated provider config and shim outputs under `.claude/`, `.cursor/`,
  `.codex/`, `.vscode/`, or `.mcp.json` are local artifacts, not source of
  truth files.

<!-- tma1:start -->
## TMA1 Context Layer

TMA1 thickens the Observe step in your reasoning loop. At the start of each
turn it injects a <tma1-context> block summarising the current session
(tool history, tokens, current focus, recent files, build state, anomalies).
Use that block when deciding what to do next.

Example shape (values illustrative):

```
<tma1-context>
project: tma1
session: a1b2c3d4
duration: 12 min
tool_calls: 47
tokens: in=84210 out=312045
current_focus: .../internal/perception/peer.go
tools: Bash×18, Edit×12, Read×9, TaskUpdate×4
recent_files: .../perception/peer.go, .../mcp/tools.go, .../hooks/install_cc.go
build: make (running)
build_last_error (6m ago, may have recovered): exit code 1 ...
external_human_changes: 3
external_files: .../path/to/file.go
anomalies:
  - [MEDIUM] human_modified_during_session — Re-read the listed files before assuming your in-memory copy is current.
</tma1-context>
```

Fields are best-effort — most lines only appear when relevant
(`anomalies` / `build_last_error` / `external_*` only render when there's
something worth flagging). `current_focus` reflects your most recent
Edit/Write target.

**You should:**
- Read the <tma1-context> block (when present) before reasoning about the next action
- Trust `external_files` over your in-memory snapshot — re-read those before editing
- Call the MCP tool `get_session_state` if you need a fuller view of your prior tool calls
- Call `get_context_bundle` after compaction or when context feels stale
- Wrap persistent processes (dev servers, watchers like `npm run dev`, `cargo watch`) with `tma1 build --watch -- <cmd>` so output persists past your session; the next agent (or you, after compaction) reads it via `get_build_status`. One-shot commands don't need wrapping — use Bash directly.
<!-- tma1:end -->
