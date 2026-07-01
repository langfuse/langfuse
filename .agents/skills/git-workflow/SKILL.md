---
name: git-workflow
description: |
  Langfuse repo Git, GitHub, commit, branch, pull request, issue search,
  release, and production-promotion workflow. Use when staging, committing,
  pushing, opening PRs, searching GitHub issues, or changing release/promotion
  behavior.
---

# Git Workflow

Use this skill for repo-specific Git, GitHub, pull request, and release
operations.

## Safety

- Inspect `git status` before staging or committing.
- Do not stage unrelated working-tree changes.
- Do not revert unrelated working-tree changes.
- Do not use destructive commands such as `git reset --hard` or
  `git checkout --` unless explicitly requested.
- Keep commits focused and atomic.
- Never add secrets or credentials to the repo.

## Commits and Pull Requests

- Commit messages and PR titles must follow Conventional Commits:
  `type(scope): description` or `type: description`.
- Use `feat` for new features and `fix` for bug fixes.
- Use a scope when it clarifies the affected area, for example
  `fix(api): handle missing trace id`.
- Mark breaking changes with `!` in the type/scope or a `BREAKING CHANGE:`
  footer.
- PR titles are validated by `.github/workflows/validate-pr-title.yml`.
- In PR descriptions, list impacted packages and executed verification
  commands.

## GitHub

- Use `gh search issues` for GitHub issue search.
- Prefer non-interactive Git and GitHub commands where possible.
- Keep PRs narrow enough to review without unrelated refactors.

## Release

- Release workflow is managed at root with `pnpm run release`.
- Promote `main` to `production` via
  `.github/workflows/promote-main-to-production.yml` or
  `pnpm run release:cloud`.
- Do not change release/versioning flow without updating this skill and the
  impacted package guides.
