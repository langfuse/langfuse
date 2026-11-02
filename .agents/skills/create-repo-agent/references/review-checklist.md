# Repo Agent Review Checklist

Use this checklist before merging any repo-agent workflow, skill, or self-improvement change.

## Block Merge If

- The LLM step has a write-capable GitHub token, PAT, GitHub App token, SSH key, cloud credential, package token, or OIDC token.
- The LLM step has arbitrary shell, broad interpreter, package-manager, `curl`, `wget`, `gh`, `git push`, or broad network access.
- The workflow relies on prompt instructions as the only guardrail for file scope, command scope, or publishing.
- Diff validation ignores untracked files.
- The workflow stages a directory instead of a validated file list.
- The publish path can push files not covered by the allowlist.
- Self-improvement can edit security boundaries without path allowlists, invariant prompts, and human PR review.
- Manual inputs are interpolated before validation.
- `workflow_dispatch` choice values use YAML boolean-like tokens such as `off`, `on`, `yes`, `no`, `true`, or `false`.
- The agent can change generated files, dependency locks, package manager config, CI trust settings, or secrets without an explicit task and dedicated review.

## Scope And Objective

- The objective is narrow enough for a scheduled or manually dispatched maintenance agent.
- The no-change path is explicitly defined and treated as success.
- The allowed files are exact paths or narrow globs.
- The agent has a domain skill or reference docs for the business logic.
- The PR title, branch name, and reviewer behavior are deterministic.

## Credentials And Permissions

- Top-level or audit-job permissions are minimal, usually `contents: read`.
- Checkout uses `persist-credentials: false`.
- The LLM step receives only the model API key and, if needed by the action, read-only `${{ github.token }}`.
- Write credentials are present only in the publish job.
- Secrets are scoped to individual steps, not broad job env, unless there is a concrete reason.
- No secret values, env dumps, or full sensitive logs are uploaded.
- `id-token: write` is absent unless explicitly justified and reviewed.

## Tool Allowlist

- File tools are scoped to exact paths or narrow globs.
- Network tools are scoped to official domains.
- Shell tools are exact deterministic validator commands.
- There is no broad `Bash(node:*)`, `Bash(python:*)`, `Bash(curl:*)`, `Bash(gh:*)`, `Bash(git:*)`, or package-manager access.
- The agent cannot push, create PRs, install dependencies, publish packages, inspect all env vars, or modify git config.

## Prompt And Output

- The prompt names all required repo skills and references.
- The prompt states allowed edit surfaces and hard constraints.
- The prompt requires source evidence and concrete calculations where relevant.
- The prompt tells the agent to leave uncertain findings unchanged.
- The prompt requires deterministic validation before finishing.
- The structured output schema includes summary, changed objects, unresolved findings, validation, and self-improvement fields when applicable.
- The job summary renders structured output in a reviewable format.

## Diff And Validation

- Changed files are computed from tracked and untracked changes.
- Every changed file is checked against the same anchored allowlist before staging and after staging.
- Untracked files are intent-added before diff checks.
- `git diff --check` runs on changed files.
- A changed-line cap rejects non-surgical diffs.
- Domain-specific validators run before staging.
- Staged blobs are compared to worktree files after `git add`.
- Staged machine-readable files are validated from `git show ":path"`.
- `git diff --cached --check` runs before commit.
- Validators run again after the local commit and before patch artifact creation.

## Publish Path

- The publish job runs only after validated changes.
- The publish job does not invoke the LLM.
- Git hooks are disabled for bot commit paths.
- The publish job applies a validated patch artifact to the triggering base commit, not a mutable workspace with unvalidated files.
- The publish job re-checks the applied commit's changed files against the same path allowlist before pushing.
- The bot branch is force-pushed intentionally and only to the expected repo.
- Existing PRs are updated instead of creating duplicates.
- Reviewer requests are non-fatal.

## Self-Improvement

- Self-improvement is explicitly enabled by the workflow.
- The allowed self-edit files are named.
- The prompt lists security invariants that must remain unchanged.
- Diff validation includes self-edit files but no broader paths.
- Structured output lists each workflow or skill-reference improvement.
- The PR body makes self-improvement visible to reviewers.
- The change does not loosen tools, tokens, permissions, or publish boundaries without a direct, reviewed reason.

## Operational Fit

- The schedule is not too frequent for provider rate limits, model cost, or reviewer attention.
- `timeout-minutes`, max turns, and max budget bound runaway loops.
- Manual dispatch inputs are sufficient for safe debugging without making the agent arbitrary.
- Manual dry-run mode can skip the model step and exercise no-change plus allowlisted mock-diff patch paths without publishing.
- No-change runs are cheap and legible.
- Failure modes leave enough summary context for maintainers without exposing secrets.

## Verification Commands

For workflow-only changes, run at least:

- YAML parsing or a workflow linter when available.
- `bash -n` against embedded shell scripts if extracted or linted.
- `git diff --check`.

For `.agents/**` changes, also run:

- `pnpm run agents:sync`
- `pnpm run agents:check`
- The skill-creator quick validator for new or changed skills.

For domain files, run the domain-specific validators and targeted tests named by the domain skill.
