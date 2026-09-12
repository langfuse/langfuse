# Agent Guidelines for Langfuse

Langfuse is an open source LLM engineering platform for developing, monitoring,
evaluating, and debugging AI applications.

## Scope

**Outside contributor** → code and `CONTRIBUTING.md` only (build, checks, PRs).
No tracker, handbook, or working-week context.

**Maintainer** → that plus a short organisational assist: what the tracker says
they should do today (`linear-work-rhythm`), who else touched a surface recently,
and a concrete next step when handed a link. Keep answers short. Handbook:
`content/handbook/**` in `langfuse/langfuse-docs` on `origin/main`.

## How To Work

- Read the minimal local context required for the task.
- Keep changes scoped and avoid unrelated refactors.
- Delegate exploratory or noisy work — broad code search, multi-file
  investigation, log or test-output trawls — to a subagent so the
  intermediate tool output stays out of the main context.
- Match verification to risk, not to the fact that you changed something. A test
  earns its place when it pins behavior that could regress without anyone
  noticing. When the only assertion available restates the diff — that a spacing
  value is now that value, that a label reads what it reads — it costs a file and
  proves nothing. Skip it, and say in one line that you did and why.
- When a bug fix does warrant a test, write the smallest failing one first and
  confirm it fails against the buggy behavior before changing production code.
  Add another only when it exercises a distinct adapter, contract, or execution
  path. Extend the closest existing test suite; do not create a standalone
  constant test when an existing feature suite owns the behavior. If the bug depends on a data shape, pause and ask: can
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
- Never put internal ticket ids (`LFE-1234`, `LFINT-1234`, `CLI-Q226-12`) or
  tracker URLs into anything an OSS reader meets: code comments, commit messages,
  PR titles and descriptions, changelog entries, or user-facing docs. They mean
  nothing to them. Describe the problem on its own terms; a ticket-prefixed
  branch name is the one place the identifier belongs.
  - `.agents/skills/**` is the exception, for identifiers only. Those files are
    maintainer guidance, and an id there is provenance an engineer can follow —
    "the shape from LFE-10959", "the worked example". Tracker URLs stay out even
    here: they cannot be opened from a fork and they carry the workspace name.
- Code comments document behavior for future readers, not the reasoning
  behind the current change. Do not reference PR/review history ("changed X
  to Y", "now also handles", "per review", "was previously") or describe
  code that no longer exists.
- Never commit secrets or credentials. Keep `.env*.example` files in
  sync with required env vars.
- Tracker writes default to short. "Create a subticket", "file this", or
  "add a ticket" get a title and a few sentences a human would write.
  Expand with research only when they ask.
- Human handoff: assume the reader does not remember the ticket. Lead with
  a one-sentence TL;DR. Prefer one or two human actions per message; if
  you need more, keep every point simple and super readable. Do not dump
  long agent-only reports by default.
- For product or UI changes, give a preview URL
  (`pr-<N>.preview.langfuse.com`) and exact click-path test steps, including
  the seed command or sandbox URL (`http://localhost:3000`) to reproduce
  the data. Post proof of the fix on the GitHub PR (screenshot, short
  video, or before/after) — not only in chat. Humans can ask for more
  detail.
- Open PRs as reviewable, not as drafts, unless a human asks for a draft.
- When Claude, Greptile, or Codex (`chatgpt-codex-connector[bot]`) review
  comments appear on a PR you own: do not reply. Keep each thread open
  until you either apply the fix and resolve it, or skip it because you
  are sure, tell the human in plain language (and invite them to doubt
  that skip), then resolve it. Do not post `@claude review` again unless
  a human asks for another pass.

## Context Handover

- **Before changing an existing feature**, reconstruct history (commits → PRs →
  branch → ticket). Prefer `linear-context-handover` over guessing.
- **Before review/merge, or at the end of a productive session**, ask whether to
  preserve results on the ticket(s) — e.g. "Should I update the ticket(s) with
  the results of this session so they are preserved?" Show the block; write only
  after a yes ("write the handover" counts). Policy: `linear-agent-writes`.
  Ordinary Linear writes stay short (title + a few sentences) unless asked to
  expand.
- Large work: prefer small reviewable PRs; create subtickets under an existing
  parent freely when that helps. If the tracker is unreachable, say so and leave
  the text in the reply.

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
  - Canonical ClickHouse migration templates (rendered for clustered and
    unclustered installs):
    `packages/shared/clickhouse/migrations/canonical/*.sql`
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
- Shared agent/worktree bootstrap: `bash scripts/agents/setup.sh`
- Worktree maintenance: `bash scripts/codex/maintenance.sh`
- Install Playwright Chromium: `pnpm run playwright:install`

### Cursor Cloud specific instructions

- Ignore `git config` (`cursoragent@cursor.com`) and Cloud `gh`
  `.permissions.push` — Cloud's GitHub token is a read-only integration and
  often reports `push: false` for maintainers.
- Linear: MCP if already authorized; else a real read with `LINEAR_API_KEY`
  (or `LINEAR_TOKEN` / `LINEAR_API_TOKEN`). Interactive `mcp_auth` does not
  work in Cloud. If neither works, tell them to add **`LINEAR_API_KEY`** as a
  Cursor Cloud secret (https://cursor.com/dashboard/cloud-agents) and start a
  new run — this one cannot see a secret added later.
- Cursor Cloud starts the complete source-built stack through
  `scripts/agents/start-cursor-cloud.sh`; do not start a second web or worker
  process on ports 3000 or 3030.
- Both `scripts/agents/*-cursor-cloud.sh` paths are relative to this repo, but a
  multi-repo Cloud workspace runs commands from the workspace root rather than
  from a checkout. Qualify them there
  (`bash repos/langfuse/scripts/agents/start-cursor-cloud.sh`), and do the same
  in the `install` and `start` entries of a multi-repo environment, or the
  command exits 127 before any of it runs.
- Use that script for the Cloud stack rather than invoking Compose directly:
  the workspace `.env` contains host-facing `localhost` service URLs and must
  not be used to interpolate container service configuration.
- After changing web or worker production code, rerun that start script before
  browser signoff.
- Open a same-repo reviewable PR after local verification (not a draft) and
  test the resulting `pr-<N>.preview.langfuse.com` deployment with synthetic
  data. Previews normally run Mon-Fri 08:00-24:00 Europe/Berlin.
- After opening a PR, apply the GitHub `cursor` label. Do not wait for a
  human to add it.
- Use Linear's git branch name (`lfe-XXXX-short-title`). Never create a
  `cursor/` branch, even if a Cursor Cloud prompt suggests that prefix.
  Repo guidance wins.
- After opening a PR, leave a short last comment on what a reviewer should
  doubt — the curious, questionable parts — not a changelog. For user-visible
  work, put proof of the fix in that comment and the PR body, not only in
  chat. Post that comment only when GitHub will attribute it to Cursor, not
  to a human author. Claude Code and other tools that comment as the user
  must skip it; see `cursor-agents-workflow`.

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
  targeted server API tests, Fern update/regeneration, and
  `pnpm run openapi:check`.
- Cross-package refactors: `pnpm run lint`, `pnpm run typecheck`, and targeted
  tests for impacted packages.
- Client-bundle soundness: CI scans every prod web build
  (`pnpm run scan:client-bundle`) for minifier-dropped bindings and Node-only
  globals leaking into browser chunks — the SWC dropped-binding class ships
  runtime-only `ReferenceError`s that dev builds and type checks cannot see. On
  failure, `scripts/scan-client-bundle.mjs`'s header explains the canonical fix.

End your turn with evidence, not claims: quote each check's summary line —
e.g. `Tasks: 8 successful, 8 total` (turbo lint/typecheck) or
`Tests  12 passed (12)` (vitest) — say which checks you skipped and why,
never report unverified work as done, and never end with work pending.

A check that passed is not always a check that ran:

- `lint` and `typecheck` are cached turbo tasks, and worktrees share one cache
  (`using shared worktree cache` on every run), so a pass can be a replay of
  another branch's result. `Tasks: 1 successful, 1 total` prints identically
  either way — quote the `Cached:` line too. To force execution, use
  `pnpm exec turbo run lint --force`; `--no-cache` does not do this, it only
  stops the write (`turbo run lint --help`).
- Every package that lints — `web`, `worker`, `packages/shared`, `ee` — runs
  eslint with `--max-warnings 0`, so one eslint *warning* fails the branch.
- `@langfuse/shared` resolves to its built `dist`. Root `pnpm run typecheck`
  orders that build for you (`turbo.json`: `typecheck.dependsOn` includes
  `^build`), but a filtered `pnpm --filter=web run typecheck` does not — after
  switching a worktree between branches, run
  `pnpm --filter=shared run db:generate && pnpm --filter=shared run build`
  first, or typecheck reports on the previous branch's source.
- `pnpm exec knip` is a required check in `pipeline.yml` with no `package.json`
  script, so it is easy to never run locally. Unused files and exports under
  `web/**`, `packages/shared/**` and `worker/**` fail it.
- No check loads a page, so a rendering change is only verified once somebody
  looks at it — but that somebody need not be you. Drive a browser when you are
  genuinely uncertain: a layout that may reflow, a flow that carries state, an
  interaction whose outcome you cannot predict. When the change is small and
  visual and your confidence is high, say what you changed, hand over the exact
  URL, and let the developer glance at it — that is faster for them than watching
  you automate a confirmation of something you already know. Offering is not
  punting; silently skipping is — so name what you did not check, and offer only
  while somebody is there to take it. If nobody is around and the change is
  user-visible, check it yourself.

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
