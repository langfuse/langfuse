# GitHub Actions Repo Agent Blueprint

Use this blueprint when implementing or changing a scheduled/manual repo agent in `.github/workflows/**`.

## Top-Level Shape

- `name`: explicit maintenance task name.
- `on.schedule`: use a predictable low-noise cadence.
- `on.workflow_dispatch.inputs`: keep inputs small and validate every input before interpolation into agent args.
- `permissions`: default to `contents: read`.
- `concurrency`: one stable group per agent, usually `cancel-in-progress: true`.
- `env`: branch names and PR titles only; do not put secrets in top-level env.

## Audit Job

The audit job is the only job that invokes the LLM agent.

- Guard the job with `if: github.repository == 'langfuse/langfuse'` for repo-owned automations.
- Use a bounded `timeout-minutes`.
- Use `actions/checkout` with `persist-credentials: false` and the minimum required `fetch-depth`.
- Set up only the runtimes needed by deterministic validators.
- Validate `workflow_dispatch` inputs before they are used in prompts or CLI args.
- Run cheap deterministic pre-checks before invoking the model.
- Pass only the model API key and read-only `${{ github.token }}` to the LLM action.
- Set agent timeout and budget controls where supported, such as max turns, max budget, API timeout, and shell timeout.
- Use `--no-session-persistence` unless session reuse is required and reviewed.
- Use a strict `--allowedTools` list.
- Use structured JSON output and render it into the job summary.

## Workflow Dispatch Input Validation

- Prefer `type: choice` for model names, modes, environments, or other enumerations.
- For freeform numeric inputs, validate with a regex and numeric range before using the value.
- For string inputs that become CLI args, validate against an allowlist regex or choice set.
- Do not interpolate unchecked manual inputs into shell commands, JSON, branch names, file paths, or LLM CLI arguments.

## Agent Prompt Template

Include these sections in the prompt:

```text
You are running Langfuse's scheduled <task> audit.

Read and follow:
- <domain skill>
- <domain references>

Allowed edit surface:
- <exact file>
- <restricted glob>

Task:
1. <business audit goal>
2. Make only surgical edits with official evidence.
3. Report uncertainty without changing code.
4. Update approved skill references when durable learnings are discovered.
5. Optionally update this workflow only for future prompt/tool/domain/validation improvements.
6. Run deterministic validation before finishing.

Hard constraints:
- Do not change generated files.
- Do not change package manager files.
- Do not run git push or create a PR.
- Do not add broad wildcard behavior.
- Preserve security invariants for workflow self-improvement.

Final response:
- No diff: report no changes and unresolved findings.
- Diff: list changed business objects, source URLs, calculations, self-improvements, and validation commands.
```

Tailor the business rules to the domain skill. Do not leave vague permissions such as "update relevant files".

## Allowed Tools

Start with no shell or network tools, then add only what the task requires:

- Exact `Read` paths for source files, skill docs, and the workflow if self-improvement is enabled.
- Exact `Edit` paths for mutable files.
- `Write` only for approved new files under a narrow path, such as skill reference markdown files.
- Domain-scoped `WebFetch` for official provider documentation and pricing pages.
- Exact deterministic validator commands.

Do not add broad shell, package-manager, GitHub CLI, git write, curl/wget, or interpreter access to the LLM step.

## Diff Validation Job Steps

After the LLM step:

```bash
mapfile -t changed_files < <(
  {
    git diff --name-only
    git ls-files --others --exclude-standard
  } | sort -u
)
```

Then:

- Exit cleanly if there are no changes.
- Check every path against an anchored allowlist regex.
- Intent-to-add untracked files before diff checks.
- Run domain validators.
- Run `git diff --check -- "${changed_files[@]}"`.
- Compute a changed-line count and reject oversized diffs.
- Write a diff stat to the job summary.

## Commit And Bundle Preparation

Prepare the PR artifact inside the audit job only after diff validation:

- Recompute `changed_files`.
- Re-run the same allowlist.
- Intent-to-add untracked files.
- Re-run domain validators and `git diff --check`.
- Configure bot author.
- Create the bot branch with hooks disabled.
- Stage only `changed_files`.
- Verify `git diff --cached --name-only` against the allowlist.
- Compare each staged blob to the worktree file.
- Validate staged machine-readable files from `git show ":path"`.
- Run `git diff --cached --check`.
- Commit with `git -c core.hooksPath=/dev/null commit --no-verify`.
- Re-run validators.
- Create a git bundle for the bot branch.
- Create a PR body artifact with scope, validation, diff stat, and agent summary.

## Publish Job

The publish job owns GitHub writes:

- It runs only when the audit job reports changes.
- It downloads the bundle and PR body artifact.
- It imports the bundle into a clean temporary repository.
- It pushes the bot branch with `GH_ACCESS_TOKEN` or another reviewed bot secret.
- It creates or updates a PR against `main`.
- It requests reviewers non-fatally with `|| true`.
- It prints the PR URL to the job summary.

The publish job must not run the LLM or process new untrusted web content.

## Self-Improvement Pattern

If self-improvement is enabled:

- Add the workflow file to the prompt's allowed edit surface.
- Add exact `Read` and `Edit` tools for that workflow file.
- Add the workflow file to all diff and staging allowlists.
- Add a structured output field such as `workflowUpdates`.
- Add prompt constraints listing invariants that must be preserved.
- Keep self-improvement changes in the same PR as the business changes, or in a no-business-change PR if the only useful outcome is agent improvement.

Reasonable self-improvements:

- Adding a newly discovered official provider documentation domain.
- Tightening prompt wording after an ambiguous run.
- Adding an exact validator command already present in the repo.
- Adjusting max-turn defaults or timeouts based on observed legitimate needs.
- Adding a structured output field that improves reviewability.

Do not use self-improvement for:

- Broadening shell access.
- Granting write permissions to the audit job.
- Adding OIDC or package-manager access.
- Removing validators or allowlists.
- Editing unrelated workflows or generated files.
