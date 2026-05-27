# Shared Skills

Shared repo skills for any coding agent working in Langfuse.

Use these from `AGENTS.md`. Claude Code reaches the same shared instructions via
the root `CLAUDE.md` compatibility symlink. Shared skills should stay focused on
reusable implementation guidance rather than runtime automation.

For the shared agent config and generated shim model, start with
[`../README.md`](../README.md).

When Codex creates or edits a shared skill, first use
`skill-creator/SKILL.md`, then apply the repo-specific rules in this file and
`agent-setup-maintenance/SKILL.md`.

Claude discovers these shared skills through symlinks under `.claude/skills/`.
Those discovery links are created and verified by `pnpm run agents:sync` and
`pnpm run agents:check`.

Shared skills should use progressive disclosure:

- `SKILL.md` is the short entrypoint with trigger guidance and navigation.
- `AGENTS.md` is optional and should stay concise when it exists.
- `references/` holds focused prose references that agents should open only
  when the task needs them.
- `scripts/` holds deterministic helpers for repetitive or fragile steps.

## Learning Loop

- Treat feature work and developer feedback as a source of durable agent
  guidance.
- When a task reveals a reusable repo workflow, recurring pitfall, missing
  verification step, or package convention, update the smallest relevant context
  surface in the same PR when practical.
- Use root `.agents/AGENTS.md` for repo-wide defaults, package `AGENTS.md` files
  for package-local guidance, and shared skills for reusable workflows that need
  more than a short rule.
- Do not codify one-off preferences, task-local decisions, or temporary
  debugging notes.

## Available Skills

### agent-setup-maintenance

Use for:
- `.agents/config.json`, `.agents/AGENTS.md`, or `.agents/README.md`
- shared skill additions or shared skill routing changes
- generated shim behavior in `scripts/agents/sync-agent-shims.mjs`
- install-time agent sync behavior and provider discovery paths

Open: [agent-setup-maintenance/SKILL.md](agent-setup-maintenance/SKILL.md)

### skill-creator

Use for:
- creating new shared skills under `.agents/skills/`
- editing or refining existing shared skills
- choosing when to use `SKILL.md`, `references/`, `scripts/`, `assets/`, and
  `agents/openai.yaml`
- validating skills with `scripts/quick_validate.py`

Open: [skill-creator/SKILL.md](skill-creator/SKILL.md)

### analyze-cloud-costs

Use for:
- Langfuse Cloud infrastructure cost structure
- AWS versus ClickHouse cost splits and cost drivers
- Metabase infra cost dashboard and cost marts
- daily cost per tracing event and cost regression analysis

Open: [analyze-cloud-costs/SKILL.md](analyze-cloud-costs/SKILL.md)

### datadog-query-recipes

Use for:
- production telemetry research across `prod-us`, `prod-eu`, `prod-hipaa`,
  and `prod-jp`
- Datadog query recipes for spans, logs, metrics, tenants, public API usage,
  and queue consumers
- ad hoc measured questions where the task is not yet an incident root-cause
  analysis

Open: [datadog-query-recipes/SKILL.md](datadog-query-recipes/SKILL.md)

### frontend-browser-review

Use for:
- user-visible changes in `web/**`
- Playwright MCP browser review before signoff
- checking visible regressions in layout, styling, navigation, or responsive behavior

Open: [frontend-browser-review/SKILL.md](frontend-browser-review/SKILL.md)

### backend-dev-guidelines

Use for:
- tRPC routers and procedures
- public API endpoints
- worker queue processors
- Prisma and ClickHouse backed services
- backend auth, validation, observability, and tests

Open: [backend-dev-guidelines/SKILL.md](backend-dev-guidelines/SKILL.md)

### add-model-price

Use for:
- `worker/src/constants/default-model-prices.json`
- `packages/shared/src/server/llm/types.ts`
- pricing tiers, tokenizer IDs, and model `matchPattern` changes

Open: [add-model-price/SKILL.md](add-model-price/SKILL.md)

### code-review

Use for:
- PR or branch review
- correctness, regression, and risk-focused review tasks
- applying the repo-specific review policy in
  `code-review/references/review-checklist.md`

Open: [code-review/SKILL.md](code-review/SKILL.md)

### weekly-production-review

Use for:
- weekly engineering reviews of what broke in production
- combining Linear `bug`-labeled tickets, Datadog alert/page signals, and
  status-page or incident.io incidents
- fixed/open production bug summaries with title, summary, owner, evidence, and
  classification
- event-centric reporting that separates source evidence from the engineering
  narrative

Open: [weekly-production-review/SKILL.md](weekly-production-review/SKILL.md)

### linear-bug-triage

Use for:
- deduplicating measured bug or regression evidence against Linear
- creating new Linear bug issues in `Triage` with `bug` and related labels
- adding concise evidence comments to related existing Linear issues

Open: [linear-bug-triage/SKILL.md](linear-bug-triage/SKILL.md)

### changelog-writing

Use for:
- changelog entries for completed features
- drafting user-facing release notes
- checking related docs links for changelog posts

Open: [changelog-writing/SKILL.md](changelog-writing/SKILL.md)

### clickhouse-best-practices

Use for:
- ClickHouse schema, query, or configuration review
- ClickHouse migrations under `packages/shared/clickhouse/**`
- applying the repo-specific ClickHouse rules layered on top of upstream best practices

Open: [clickhouse-best-practices/SKILL.md](clickhouse-best-practices/SKILL.md)

### debug-issue-with-datadog

Use for:
- root-causing Linear, GitHub, or incident reports with Datadog evidence
- production debugging across APM spans, logs, metrics, and monitors
- mapping observed error clusters back to Langfuse code paths

Open: [debug-issue-with-datadog/SKILL.md](debug-issue-with-datadog/SKILL.md)

### pnpm-upgrade-package

Use for:
- pnpm dependency bumps that need a specific target version
- interactive upgrades where the package name or version may be missing
- transitive lockfile bumps that may need temporary overrides and dedupe
  verification before deciding whether the override should stay
- checking whether `pnpm-workspace.yaml` `minimumReleaseAgeExclude` must change
- comparing registry latest with the latest version installable under the
  current release-age gate

Open: [pnpm-upgrade-package/SKILL.md](pnpm-upgrade-package/SKILL.md)

### turborepo

Use for:
- `turbo.json` task graph, caching, filtering, or affected-run changes
- root/package script organization for Turborepo workflows
- monorepo package boundaries and shared-code layout decisions

Open: [turborepo/SKILL.md](turborepo/SKILL.md)

## Adding a New Shared Skill

1. Codex may create or refine shared skills under `.agents/skills/` when a
   repo-specific workflow becomes repeated enough to justify durable guidance.
2. Start with [skill-creator/SKILL.md](skill-creator/SKILL.md); if it is not
   available, follow these rules and the shape of nearby skills.
3. Create a concise `.agents/skills/<skill-name>/SKILL.md`.
4. Add `.agents/skills/<skill-name>/AGENTS.md` only when the skill benefits
   from a short router or checklist on top of `SKILL.md`.
5. Prefer `references/` for detailed prose and `scripts/` for deterministic
   execution helpers.
6. Keep the skill tightly scoped to one domain or workflow.
7. Link the skill from `AGENTS.md` if it is relevant across the repo.
8. Run `pnpm run agents:sync` and `pnpm run agents:check` so Claude's projected
   `.claude/skills/` view stays in sync.
9. Update `AGENTS.md` or package-local `AGENTS.md` if the new skill changes the
   default reusable workflow for future agents.
10. Run the relevant verification for the package or workflow the skill affects.

## Skill Design Rules

- Keep the skill tool-neutral.
- Use `SKILL.md` as the short entrypoint, not the full knowledge dump.
- Prefer `references/` for deeper docs and `scripts/` for deterministic helpers.
- Avoid copying large sections of repo docs into the skill when a stable link is
  enough.
- If the skill is web- or package-specific, link the nearest package
  `AGENTS.md` or package docs instead of restating them.
