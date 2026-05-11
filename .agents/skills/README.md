# Shared Skills

Shared repo skills for any coding agent working in Langfuse.

Use these from `AGENTS.md`. Claude Code reaches the same shared instructions via
the root `CLAUDE.md` compatibility symlink. Shared skills should stay focused on
reusable implementation guidance rather than runtime automation.

For the shared agent config and generated shim model, start with
[`../README.md`](../README.md).

Claude discovers these shared skills through symlinks under `.claude/skills/`.
Those discovery links are created and verified by `pnpm run agents:sync` and
`pnpm run agents:check`.

Shared skills should use progressive disclosure:

- `SKILL.md` is the short entrypoint with trigger guidance and navigation.
- `AGENTS.md` is optional and should stay concise when it exists.
- `references/` holds focused prose references that agents should open only
  when the task needs them.
- `scripts/` holds deterministic helpers for repetitive or fragile steps.

## Available Skills

### agent-setup-maintenance

Use for:
- `.agents/config.json`, `.agents/AGENTS.md`, or `.agents/README.md`
- shared skill additions or shared skill routing changes
- generated shim behavior in `scripts/agents/sync-agent-shims.mjs`
- install-time agent sync behavior and provider discovery paths

Open: [agent-setup-maintenance/SKILL.md](agent-setup-maintenance/SKILL.md)

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

### detect-prod-regressions

Use for:
- proactive Datadog sweeps across `prod-us`, `prod-eu`, `prod-hipaa`, and `prod-jp`
- comparing recent production errors, logs, spans, and API latency to baselines
- handing measured regressions to `linear-bug-triage` for Linear issues or comments

Open: [detect-prod-regressions/SKILL.md](detect-prod-regressions/SKILL.md)

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
2. Create a concise `.agents/skills/<skill-name>/SKILL.md`.
3. Add `.agents/skills/<skill-name>/AGENTS.md` only when the skill benefits
   from a short router or checklist on top of `SKILL.md`.
4. Prefer `references/` for detailed prose and `scripts/` for deterministic
   execution helpers.
5. Keep the skill tightly scoped to one domain or workflow.
6. Link the skill from `AGENTS.md` if it is relevant across the repo.
7. Run `pnpm run agents:sync` and `pnpm run agents:check` so Claude's projected
   `.claude/skills/` view stays in sync.
8. Update `AGENTS.md` or package-local `AGENTS.md` if the new skill changes the
   default reusable workflow for future agents.
9. Run the relevant verification for the package or workflow the skill affects.

## Skill Design Rules

- Keep the skill tool-neutral.
- Use `SKILL.md` as the short entrypoint, not the full knowledge dump.
- Prefer `references/` for deeper docs and `scripts/` for deterministic helpers.
- Avoid copying large sections of repo docs into the skill when a stable link is
  enough.
- If the skill is web- or package-specific, link the nearest package
  `AGENTS.md` or package docs instead of restating them.
