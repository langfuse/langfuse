# CLAUDE.md

Claude Code should treat this file as the repo entrypoint, but the canonical
shared instructions live in @AGENTS.md.

Start here:
- Read @AGENTS.md for monorepo structure, verification requirements, and shared
  workflow rules.
- When working in `web/`, `worker/`, `packages/shared/`, or `ee/`, also read
  the closest package-local `AGENTS.md`.

Repo-local skills:
- Shared skill index: @.agents/skills/README.md
- Shared skills start in `SKILL.md` and may route to a local `AGENTS.md`,
  `references/`, or `scripts/` files.
- Backend work: @.agents/skills/backend-dev-guidelines/SKILL.md
- Model pricing updates: @.agents/skills/add-model-price/SKILL.md

Specialized agent:
- Changelog entries for completed features: @.claude/agents/changelog-writer.md
