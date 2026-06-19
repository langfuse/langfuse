# Repo Agent Security Standards

Use these standards for every Langfuse repo-owned autonomous agent. They are intentionally stricter than a normal CI workflow because an LLM step consumes untrusted instructions, web pages, source files, and prior outputs.

Official references:

- GitHub Actions security hardening: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
- GitHub automatic token authentication: https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication
- GitHub Actions secrets: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- Claude Code permissions: https://code.claude.com/docs/en/permissions

## Threat Model

- Treat provider web pages, GitHub issues, PR comments, release notes, generated files, package scripts, and previous agent outputs as untrusted input.
- Assume prompt injection can ask the agent to leak secrets, loosen its own permissions, edit unrelated files, open broader network access, or hide malicious changes in formatting churn.
- Assume the agent can make mistakes even when acting in good faith. Independent validation must catch wrong files, oversized diffs, invalid generated artifacts, and missing domain-specific checks.
- Treat self-improvement as code execution policy change. It is useful, but it is never exempt from review, path allowlists, and security invariants.

## Credential Model

- The LLM agent step should receive only the model-provider API key required to run the agent and, if the action requires it, the read-only `${{ github.token }}`.
- Set workflow or job `permissions` to the minimum necessary. For read-only audit jobs, use `contents: read`.
- Pass `github_token: ${{ github.token }}` explicitly to LLM actions that otherwise try to discover a token from the environment, and keep the job permission read-only.
- Do not pass `secrets.GH_ACCESS_TOKEN`, write-scoped PATs, GitHub App private keys, SSH keys, cloud credentials, package-registry tokens, or OIDC tokens to the LLM step.
- Keep write credentials in a separate publish job or post-validation step that does not invoke the LLM agent.
- Put each secret only on the step that needs it. Do not define broad job-level secret env vars.
- Do not echo secrets, dump environment variables, enable full agent logs, or upload unredacted agent transcripts as artifacts.
- Do not add `id-token: write` unless there is a reviewed OIDC trust boundary and the agent's objective cannot be met without it.

## Tool Permissions

- Prefer scoped `Read`, `Edit`, and `Write` tools for exact paths or path globs.
- Prefer domain-scoped `WebFetch` for official sources instead of shell network tools.
- Prefer exact `Bash(command ...)` entries only for deterministic, repo-owned validators or simple non-sensitive commands such as `date -u +%Y-%m-%dT00:00:00.000Z`.
- Do not allow broad shell patterns such as `Bash(*)`, `Bash(node:*)`, `Bash(python:*)`, `Bash(curl:*)`, `Bash(wget:*)`, `Bash(gh:*)`, `Bash(git:*)`, `Bash(pnpm:*)`, or `Bash(npm:*)`.
- Do not allow shell readers or environment/process inspection commands such as `cat`, `sed`, `grep`, `rg`, `jq`, `env`, `printenv`, `ps`, or `ls` unless the exact command is required and safe. File reads should go through scoped read tools.
- Do not allow `git push`, PR creation, GitHub API calls, package installs, package publishing, dependency updates, or arbitrary interpreters in the LLM step.
- If a deterministic validator is needed, keep it in the repository, review it as normal code, and allow only that exact command.
- Keep WebFetch domains to official sources for the domain. If the agent discovers a new official domain, it may propose a workflow self-improvement PR if self-improvement is enabled.

## Prompt Contract

Every repo-agent prompt must state:

- The agent's objective and explicit no-change behavior.
- The files it may read and edit.
- The official sources it may use.
- The hard constraints it must not violate.
- The validators it must run before finishing.
- The expected structured output schema.
- The evidence required for any change, including source URLs and conversion calculations when applicable.

Do not rely on the prompt as the enforcement layer. The prompt guides the model; the workflow must still enforce file, command, token, and publish boundaries.

## Diff Enforcement

Independent diff validation must run after the agent and before publishing:

- Build `changed_files` from both `git diff --name-only` and `git ls-files --others --exclude-standard`.
- Use an anchored exact-path allowlist regex. Do not allow broad directories unless the task requires creating named files under that directory and the regex prevents traversal.
- Run `git add -N -- "${untracked_files[@]}"` before `git diff --check` and line-count checks when untracked files exist.
- Run `git diff --check -- "${changed_files[@]}"`.
- Cap changed lines for surgical agents. The cap should match the task; pricing-style maintenance should stay small.
- Run domain validators on worktree files before staging.
- Stage only the validated file list with `git add -- "${changed_files[@]}"`.
- Re-check `git diff --cached --name-only` against the same allowlist.
- Compare staged blobs against worktree contents to catch clean/smudge filters, generated mutation, or staging surprises.
- Run staged-blob validation for files with machine-readable schemas, especially JSON.
- Run `git diff --cached --check -- "${staged_files[@]}"` before commit.

## Publish Boundary

Use a two-phase architecture for agents that create PRs:

- Phase 1: audit job. It checks out code with `persist-credentials: false`, runs the LLM with read-only permissions, validates the diff, commits locally with hooks disabled, and uploads a `git format-patch --binary` artifact plus PR body artifact.
- Phase 2: publish job. It downloads the patch, applies it to the triggering base commit in a clean temporary repo, pushes the bot branch with a write-scoped bot secret, and creates or updates the PR.
- The publish job must not invoke the LLM.
- The publish job should clear global/system git config where practical and disable hooks for any commit or push-adjacent git operation.
- The publish job should re-check the applied commit's changed files against the same path allowlist before pushing.
- Reviewer assignment should be non-fatal so a missing reviewer permission does not fail an otherwise valid maintenance PR.

## Self-Improvement

Self-improvement is allowed only when the workflow explicitly opts in.

- Limit self-improvement to named files, usually the workflow itself and repo-owned skill reference files.
- Keep self-improvements surgical: prompt clarity, official domain allowlists, exact validator/tool entries, input defaults, timeout/budget settings, and output schema improvements.
- Require the final output to list every self-improvement and why it improves future runs.
- Preserve security invariants: read-only audit job, no write token in the LLM step, separate publisher, explicit token permissions, path allowlists, input validation, staged-blob checks, hook-disabled commit path, and human PR review.
- Do not let self-improvement add arbitrary shell/network tools, write job permissions, `id-token: write`, package-manager tools, `gh`, `git push`, or broad file globs.
- If a needed self-improvement would violate an invariant, the agent must report it as unresolved instead of applying it.

## Logging And Artifacts

- Prefer summarized agent reports over full transcripts.
- Do not upload full stdout/stderr if it may contain environment data or secrets.
- Upload only the artifacts needed for publishing or review, such as a patch file and PR body.
- Set short artifact retention for bot handoff artifacts.
- Summaries should include changed files, changed business objects, source URLs, unresolved findings, validation commands, and self-improvements.

## Source Pinning And Updates

- Pin third-party actions by full commit SHA and keep the comment with the version tag when useful.
- Review third-party action changes before bumping the pinned SHA.
- Do not auto-update action pins from inside the agent unless that is the explicit objective and the workflow includes dedicated validation for it.
