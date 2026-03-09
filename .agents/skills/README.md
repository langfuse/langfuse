# Shared Skills

Shared repo skills for any coding agent working in Langfuse.

Use these from `AGENTS.md` and `CLAUDE.md`. They are not tool-specific and
should stay focused on reusable implementation guidance rather than runtime
automation.

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

## Adding a New Shared Skill

1. Create `.agents/skills/<skill-name>/SKILL.md`.
2. Keep the skill tightly scoped to one domain or workflow.
3. Link the skill from `AGENTS.md` if it is relevant across the repo.
4. Link the skill from `CLAUDE.md` if Claude Code should load it from the
   project entrypoint.
5. Add extra resource files only when they materially improve signal-to-noise.
