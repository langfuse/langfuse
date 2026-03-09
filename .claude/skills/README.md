# Skills

Repo-local skills for agents working in this repository.

The current setup is intentionally simple:
- `AGENTS.md` is the canonical shared instruction file for the repo.
- `CLAUDE.md` is a thin Claude Code entrypoint that points back to `AGENTS.md`.
- Skills are linked explicitly from those files and opened on demand.
- There is no hook-based auto-activation in this repository.

## Available Skills

### backend-dev-guidelines

Purpose: backend development patterns for Langfuse's web, worker, and shared
packages.

Use when:
- creating or modifying tRPC routers or procedures
- creating or modifying public API endpoints
- creating or modifying BullMQ processors
- changing Prisma or ClickHouse-backed services
- adding backend validation, auth, or observability logic

Open: [backend-dev-guidelines/SKILL.md](backend-dev-guidelines/SKILL.md)

### add-model-price

Purpose: rules for updating Langfuse's default model pricing definitions.

Use when:
- adding or updating entries in `worker/src/constants/default-model-prices.json`
- changing model pricing-related types in `packages/shared/src/server/llm/types.ts`
- working on pricing tiers, tokenizer IDs, or model match patterns

Open: [add-model-price/SKILL.md](add-model-price/SKILL.md)

## Adding a New Skill

1. Create `.claude/skills/<skill-name>/SKILL.md`.
2. Keep the skill focused on one domain or workflow.
3. Link the skill from `AGENTS.md` if it is broadly relevant across the repo.
4. Link the skill from `CLAUDE.md` if Claude Code should discover it from the
   project entrypoint.
5. Add resource files only when the main `SKILL.md` would otherwise become too
   large or too noisy.

## Authoring Template

```markdown
---
name: my-skill
description: Brief description of what this skill covers and when to use it.
---

# My Skill

## Purpose

[Why this skill exists]

## When to Use This Skill

[Concrete triggers and file areas]

## Quick Reference

[Checklist, patterns, or examples]
```
