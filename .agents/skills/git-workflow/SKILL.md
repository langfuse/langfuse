---
name: git-workflow
description: |
  Langfuse repo Git, GitHub, commit, branch, pull request, issue search,
  release, and production-promotion workflow. Use when staging, committing,
  pushing, opening PRs, choosing a Linear git branch name, handling Claude,
  Greptile, or Codex review comments, searching GitHub issues, or changing
  release/promotion behavior.
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
- Keep internal ticket ids and Linear URLs out of commit messages, PR titles,
  and PR descriptions — this repo is public, and a squash merge puts the PR
  title into `main`'s permanent history. Describe the change on its own terms
  and carry the identifier in the branch name instead.

## Branch names

- Copy Linear's git branch name (`lfe-XXXX-short-title`), or the issue's
  `gitBranchName` when Linear MCP is available.
- Cursor agents must not use a `cursor/` prefix, even if a Cursor Cloud
  prompt asks for one. Repo guidance wins.
- Keep a username prefix only when Linear's copied name already includes one.

## GitHub

- Use `gh search issues` for GitHub issue search.
- Prefer non-interactive Git and GitHub commands where possible.
- Keep PRs narrow enough to review without unrelated refactors.
- When a change is too large for one reviewable PR, split it into a chained
  stack instead of widening the PR: use `pr-stack-workflow`.
- Open PRs as reviewable, not as drafts, unless a human asks for a draft.
- Do not post GitHub PR comments as the human author. Cursor agents that
  comment as Cursor should leave one last comment with proof of user-visible
  work (screenshot, video, or before/after on the PR, not only in chat) and
  what to doubt in review; see `cursor-agents-workflow`. Claude Code and
  other tools that comment as the user must skip that comment.
- Claude, Greptile, or Codex review comments (`claude[bot]`, Claude Code,
  security-review action, `greptile-apps[bot]`,
  `chatgpt-codex-connector[bot]`): do not reply. Keep the thread open until
  you apply the fix and resolve it, or skip it because you are sure, tell
  the human in plain language (and invite them to doubt that skip), then
  resolve it. Do not post `@claude review` again unless a human asks for
  another pass. Human reviewer comments stay open and may need a real
  reply.

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
- The latest-release markers track the current major line: `pipeline.yml`
  gates the Docker `latest` tag on `refs/tags/v4`, and maintenance branches
  disable that gate and set `release-it.github.makeLatest: false` in their
  root `package.json` so their releases never claim the Docker `latest` tag
  or the GitHub "Latest release" badge. At the next major GA (v5), repeat
  the flip: move the gate to `refs/tags/v5` on `main`, then disable it and
  set `makeLatest: false` on the new `v4` maintenance branch.
- Do not change release/versioning flow without updating this skill and the
  impacted package guides.
