# Shared Skills

Shared repo skills for any coding agent working in Langfuse.

Use these from `AGENTS.md` and `CLAUDE.md`. They are not tool-specific and
should stay focused on reusable implementation guidance rather than runtime
automation.

For the shared agent config and generated shim model, start with
[`../README.md`](../README.md).

Claude discovers these shared skills through symlinks under `.claude/skills/`.
Those discovery shims are created and verified by `pnpm run agents:sync` and
`pnpm run agents:check`.

Shared skills should use progressive disclosure:

- `SKILL.md` is the short entrypoint with trigger guidance and navigation.
- `AGENTS.md` is optional and should stay concise when it exists.
- `references/` holds focused prose references that agents should open only
  when the task needs them.
- `scripts/` holds deterministic helpers for repetitive or fragile steps.

## Available Skills

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
- applying the repo-specific review policy in `REVIEW.md`

Open: [code-review/SKILL.md](code-review/SKILL.md)

### changelog-writing

Use for:
- changelog entries for completed features
- drafting user-facing release notes
- checking related docs links for changelog posts

Open: [changelog-writing/SKILL.md](changelog-writing/SKILL.md)

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
7. Link the skill from `CLAUDE.md` if Claude Code should load it from the
   project entrypoint.
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
