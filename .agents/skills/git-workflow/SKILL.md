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

- Releases are cut with `pnpm run release`, run on the branch being released.
  Allowed release branches are `main` and `v3`
  (`scripts/release-preflight.sh` owns the allowlist).
- `main` is the current line and the only branch that ships to Langfuse
  Cloud. `v3` is the OSS maintenance line: a release from it produces a tag,
  GitHub release, and Docker images, but never a Cloud deploy.
- On any `vX.Y.Z` tag push, `.github/workflows/release.yml` promotes `main`
  to `production` only if the tagged commit is an ancestor of `main`;
  maintenance-branch tags skip promotion. The production migration
  confirmation in the release preflight likewise only runs for `main`.
- Promote `main` to `production` without a release via
  `.github/workflows/promote-main-to-production.yml` or
  `pnpm run release:cloud` (both main-only).
- At v4 GA, flip the latest-release markers: in `pipeline.yml`, move the
  Docker `latest` tag gate from `refs/tags/v3` to `refs/tags/v4` on `main`
  and disable it on the `v3` branch; set `release-it.github.makeLatest:
  false` in the `v3` branch's root `package.json` so maintenance releases
  stop claiming the GitHub "Latest release" badge.
- Do not change release/versioning flow without updating this skill and the
  impacted package guides.
