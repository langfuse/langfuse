# Codex Guidelines for Langfuse

Langfuse is an open source LLM engineering platform for developing, monitoring,
evaluating, and debugging AI applications.
Langfuse monorepo guidance for fast, safe code changes.

## Maintenance Contract

- `AGENTS.md` is a living document.
- Update this file in the same PR when monorepo-level architecture, workflows,
  dependency boundaries, mandatory verification commands, or release/security
  processes materially change.
- Update this file when user feedback adds a durable repo-level instruction that
  future agents should follow. Update the relevant shared skill files under
  `.agents/skills/` as well when that feedback changes a reusable workflow,
  checklist, or decision rule that those skills should teach. Treat feedback as
  durable when it changes the default workflow, review expectations, naming
  rules, verification rules, or handoff conventions for future tasks. Do not
  edit `AGENTS.md` or shared skills for one-off task preferences.
- For package-local material changes, update the package-local `AGENTS.md` in
  the same PR.
- If no material guidance changed, do not edit AGENTS files or shared skills.

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
- Shared package import surfaces:
  - `@langfuse/shared`: client-safe/shared contracts, types, schemas, and
    reusable utilities
  - `@langfuse/shared/src/server`: server-only shared services, repositories,
    queue helpers, logging, ingestion, auth, and runtime helpers
  - `@langfuse/shared/src/db`: Prisma client singleton plus Prisma types
  - `@langfuse/shared/src/env`, `@langfuse/shared/encryption`: focused env and
    encryption helpers
  - See `packages/shared/AGENTS.md` for the full export map and when to use
    each entrypoint
- Architecture handbook:
  [langfuse.com/handbook/product-engineering/architecture](https://langfuse.com/handbook/product-engineering/architecture)
  with source markdown in
  `../langfuse-docs/content/handbook/product-engineering/architecture.mdx`
  (GitHub mirror:
  [architecture.mdx](https://github.com/langfuse/langfuse-docs/blob/4188c1ba453240c90a763a8067ef442d68839323/content/handbook/product-engineering/architecture.mdx#L4))

## Build, Test, and Development Commands

- Install deps: `pnpm install`
- Dev all packages: `pnpm run dev`
- Dev web only: `pnpm run dev:web`
- Dev worker only: `pnpm run dev:worker`
- Codex environment bootstrap: `bash scripts/codex/setup.sh` (installs deps, Playwright Chromium, runs `pnpm --filter=shared run db:generate`, and refreshes workspace Prisma artifacts)
- Codex environment maintenance: `bash scripts/codex/maintenance.sh`
- Install repo-local Playwright browsers for agents: `pnpm run playwright:install`
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
- Implement automated tests for every new feature and for material feature
  behavior changes. If a test is genuinely not feasible, document the reason in
  the PR description.
- Client tests contain `....clienttest.ts`
- When you write a test for a bug or similar, write the test that fails first. Check that it fails. Only then fix the bug. Otherwise, the test is not good!

## Commit & Pull Request Guidelines

- Commit messages and PR titles must follow Conventional Commits:
  `type(scope): description` or `type: description`.
- Use a lowercase conventional type such as `feat`, `fix`, `docs`, `refactor`,
  `chore`, or `test`; keep the description concise and imperative.
- PR titles are validated by `.github/workflows/validate-pr-title.yml`.
- Reference: https://www.conventionalcommits.org/en/v1.0.0/
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
- `CLAUDE.md` is the Claude Code entrypoint for this repo and should stay as a thin shim that points back to this file.
- Repo-owned Codex cloud bootstrap lives in `scripts/codex/setup.sh` and `scripts/codex/maintenance.sh`; contributors still configure the actual environment in the Codex UI.
- Codex may create or refine shared skills under `.agents/skills/` when a repeated repo-specific workflow would help future agents. Keep shared skills tool-neutral and scoped to durable guidance.
- Shared skill index: [`.agents/skills/README.md`](.agents/skills/README.md)
- Shared skills use a short `SKILL.md` entrypoint and should prefer focused `references/` docs and `scripts/` helpers over large compiled guides. Keep any local `AGENTS.md` concise and use it as a router, not a dump of all details.
- If a task matches one of the shared skill scopes below, read the linked `SKILL.md` before editing code, then follow its local references as needed:
  - Backend and API work in `web/src/server/**`, `web/src/pages/api/public/**`, `worker/src/**`, or `packages/shared/src/**`: [`.agents/skills/backend-dev-guidelines/SKILL.md`](.agents/skills/backend-dev-guidelines/SKILL.md)
  - Model pricing work in `worker/src/constants/default-model-prices.json`, `packages/shared/src/server/llm/types.ts`, or related pricing files: [`.agents/skills/add-model-price/SKILL.md`](.agents/skills/add-model-price/SKILL.md)
- If more than one skill matches, read the minimal set required.
- For completed feature branches that need a changelog entry, use [`.claude/agents/changelog-writer.md`](.claude/agents/changelog-writer.md).

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

## Agent Browser Automation
- Shared Playwright MCP configs live in `.mcp.json` and `.vscode/mcp.json`.
- Codex project-scoped MCP config lives in `.codex/config.toml` for trusted-project setups.
- Install Chromium into the default user-level Playwright cache with `pnpm run playwright:install`.
- `scripts/codex/setup.sh` runs the Playwright install step and an explicit `pnpm --filter=shared run db:generate` before workspace-wide `db:generate` for first-time Codex bootstrap.
- Playwright MCP traces and other browser session artifacts live under `.playwright-mcp/` and are gitignored.
- For user-visible frontend changes in `web/**`, review the affected flow in a real browser with the Playwright MCP server before signoff. Cover the primary changed path with a quick functional pass and a visual check for obvious regressions.
- For web flows, start `pnpm run dev:web` (or `pnpm run dev`) before asking an agent to drive the app in a browser.
- Optional: generate Playwright's planner/generator/healer agent files with `pnpm --filter web exec playwright init-agents --loop=<claude|vscode|copilot|opencode>`.

## Git Notes

- Do not use destructive git commands (for example `reset --hard`) unless explicitly requested.
- Do not revert unrelated working-tree changes.
- Keep commits focused and atomic.

## Cursor Rules

- Additional folder-specific rules live in `.cursor/rules/`.
