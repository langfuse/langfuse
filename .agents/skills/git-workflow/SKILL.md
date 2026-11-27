---
name: git-workflow
description: |
  Langfuse repo Git, GitHub, commit, branch, pull request, issue search,
  release, and production-promotion workflow. Use when staging, committing,
  pushing, opening PRs, choosing a branch name, handling Claude,
  Greptile, or Codex review comments, searching GitHub issues, or changing
  release/promotion behavior.
---

# Git Workflow

Use this skill for repo-specific Git, GitHub, pull request, and release
operations.

## Protected branches and approvals

Read [protected branches and PR approval](references/protected-branches.md) before pushing, assessing merge readiness, changing automation, or releasing. It is the shared organization policy for default-branch PRs, latest-commit Bugbot review and approver-bot approval, required human reviews, scoped App exceptions, and human emergency escalation. Keep detailed policy there rather than duplicating it in other skills.

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

- Reuse a branch name supplied by an issue or the task when one is already available. Otherwise choose a descriptive task branch, for example `codex/fix-score-tooltip`; do not query Linear just to create a branch.
- Cursor agents must not use a `cursor/` prefix, even if a Cursor Cloud prompt asks for one.

## GitHub

- Use `gh search issues` for GitHub issue search.
- Prefer non-interactive Git and GitHub commands where possible.
- Keep PRs narrow enough to review without unrelated refactors.
- When a change is too large for one reviewable PR, split it into a chained
  stack of small PRs instead of widening one.
- Open PRs as reviewable, not as drafts, unless a human asks for a draft.
- Cursor agents apply the GitHub `cursor` label after opening a PR; see
  `cursor-agents-workflow`. Do not leave that tag for a human.
- Do not post GitHub PR comments as the human author. Cursor agents that
  comment as Cursor should leave one last comment with proof of user-visible
  work (screenshot, video, or before/after on the PR, not only in chat) and
  what to doubt in review; see `cursor-agents-workflow`. Claude Code and
  other tools that comment as the user must skip that comment.
- Bugbot, Claude, Greptile, or Codex review comments (`cursor[bot]` for Bugbot, `claude[bot]`, Claude Code, security-review action, `greptile-apps[bot]`, `chatgpt-codex-connector[bot]`): after the fix commit is pushed, resolve each thread you fixed or deliberately skipped. Skip a finding only when you are sure it is wrong, tell the human in plain language, invite them to doubt that skip, then resolve it. That resolve is part of finishing the task, and it counts as the requested action even when the prompt only says to fix, address, or reply and never says resolve. Use the GraphQL `resolveReviewThread` mutation; unresolved threads block merge. If the task asked for a reply, post that reply and then resolve; resolving does not replace the reply. Do not post `@claude review` again unless a human asks for another pass. Human reviewer threads stay open and may need a real reply. A skipped Bugbot finding requires teammate approval; resolving the thread does not produce a clean latest-commit review or waive an approval gate.

## Release

- The existing `pnpm run release` command creates and pushes a release commit on the current release branch. Its preflight allows `main` and `v3`, but that allowlist is not permission to push to protected `main`. Do not run it on `main` until the release path uses an approved version-change PR or an explicitly configured GitHub App exception; see the protected-branch reference. Check the destination rules before using a maintenance-branch release path too.
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
- The ECS deployment workflow includes `ai-gateway` only for staging: pushes
  to `main` and manual staging deployments. Its image builds from `ai-gateway/`
  with `BUILD_ID` set to the commit SHA; production deployments exclude it.
- Do not change release/versioning flow without updating this skill and the
  impacted package guides.
