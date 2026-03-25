# CLAUDE.md

This is the canonical Claude-specific entrypoint for the repo. The root
`CLAUDE.md` should remain only as a discovery symlink for tools that still look
for that filename.

Claude Code should treat this file as the repo entrypoint, but the canonical
shared instructions live in `AGENTS.md`.

Start here:
- Read `AGENTS.md` for monorepo structure, verification requirements, and shared
  workflow rules.
- When working in `web/`, `worker/`, `packages/shared/`, or `ee/`, also read
  the closest package-local `AGENTS.md`.

Repo-local skills:
- Shared skill index: `skills/README.md`
- Shared skills start in `SKILL.md` and may route to a local `AGENTS.md`,
  `references/`, or `scripts/` files.
- Backend work: `skills/backend-dev-guidelines/SKILL.md`
- Model pricing updates: `skills/add-model-price/SKILL.md`
- Code review: `skills/code-review/SKILL.md` and `REVIEW.md`
- Changelog writing: `skills/changelog-writing/SKILL.md`

Claude should discover the shared skills through `.claude/skills/`, which is a
symlinked projection of `.agents/skills/`.

Claude's changelog subagent remains available through
`.claude/agents/changelog-writer.md`, which is projected from
`.agents/shims/claude/agents/changelog-writer.md`.
