---
name: recent-commit-bug-sweep
description: Review recent Langfuse main-branch commits for likely bugs using concrete repository evidence, propose the smallest safe fixes, and send a tabular Slack report to #max-and-agents when a real bug is found. Use when asked to scan commits since the last run, review the last 24 hours of main, monitor recent merged PRs for regressions, or prepare evidence-backed bug reports from commit diffs and CI/test signals.
---

# Recent Commit Bug Sweep

## Overview

Use this skill to run a conservative regression sweep over recent commits on
`main`. Report only bugs supported by concrete repo evidence such as commit
SHAs, PR metadata, file paths, diffs, failing tests, or CI signals.

## Workflow

1. Update the latest main reference before reviewing:
   - Prefer `git fetch origin main --prune`.
   - If the current worktree is clean and the task needs local edits, create a
     `codex/` branch from `origin/main`.
   - If the local `main` branch is checked out in another worktree, treat
     `origin/main` as the latest main instead of forcing that branch.

2. Choose the commit window:
   - Use an explicit baseline if the user provides one.
   - If a reliable last-run marker exists in the current task context or
     automation state, use that marker.
   - Otherwise scan `origin/main` for the last 24 hours and state that fallback.
   - Use first-parent history for merged PR coverage, then inspect individual
     commits inside a merge only when the diff requires it.

3. Collect metadata and evidence:
   - Use `git log --since='24 hours ago' --first-parent --format=... origin/main`
     or the chosen baseline range.
   - Use commit subjects, PR numbers, `gh pr view`, and GitHub CI/check output
     where available to identify PR title, author/engineer, and status.
   - Use `git show --stat`, `git show --name-only`, and focused diffs to review
     changed code. Read package `AGENTS.md` files and relevant shared skills
     before judging changes in specialized areas.

4. Review conservatively:
   - Prioritize correctness, behavioral regressions, tenant isolation, security,
     performance with real impact, data migrations, public API contracts, and
     missing tests around risky behavior.
   - Do not invent bugs. If evidence is weak or the concern depends on an
     unverified assumption, record it as skipped or residual risk, not a bug.
   - Run targeted tests only when they can confirm a concrete hypothesis or a
     minimal fix. Capture exact commands and outcomes.

5. Propose or apply the smallest safe fix:
   - Keep patches scoped to the bug and nearby tests.
   - Avoid refactors, formatting churn, or unrelated cleanup.
   - For bug fixes, prefer a failing test first when practical.
   - If no concrete bug is found, do not create a patch just to make progress.

## Slack Report

Send a Slack message to `#max-and-agents` only when the sweep finds at least one
concrete bug, unless the user explicitly asks for a no-findings update. Use the
Slack outgoing-message workflow before writing to Slack.

The Slack message must include an explicit table with these columns, in this
order:

| PR | Engineer who pushed it | PR title | Error case | Impact on customers |
| --- | --- | --- | --- | --- |
| `#12345` | Name from PR/commit metadata | Exact PR title | Reproducible failure or diff-backed bug | Customer-facing blast radius supported by evidence |

Keep each row evidence-backed. Include a short paragraph below the table with
the concrete evidence and minimal proposed fix, using commit SHAs and file
paths. If a fix was applied, include the verification commands and results.

## Final Response

End with:
- Reviewed range and number of commits.
- Findings table or explicit "No concrete bugs found."
- Whether Slack was sent, including the channel, or why it was not sent.
- Minimal fixes proposed or applied, with verification commands and outcomes.
