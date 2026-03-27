---
name: code-review
description: |
  Shared code review workflow for Langfuse. Use when reviewing a PR, branch, diff,
  or local changes for correctness, regressions, risk, and missing tests.
  Start with references/review-checklist.md for repo-specific review rules and
  use package AGENTS.md files plus any matching shared skills when the change
  touches those areas.
---

# Code Review

Use this skill when the task is to review code changes rather than implement a
feature.

## Start Here

- Read [`references/review-checklist.md`](references/review-checklist.md) for
  the repo's canonical review rules.
- Read root [`AGENTS.md`](../../../AGENTS.md) and the nearest package
  `AGENTS.md` for the files under review.
- If the review touches ClickHouse, also use the shared
  `clickhouse-best-practices` skill.
- If the review touches backend code, also use the shared
  `backend-dev-guidelines` skill where relevant.

## Review Priorities

Focus on:

- correctness bugs
- behavioral regressions
- security and tenant-isolation risks
- performance issues with real impact
- missing or weak tests for risky changes

## Output Expectations

- Findings first, ordered by severity
- File and line references for each finding
- Short summary only after findings
- If no findings, say so explicitly and mention any residual risk or coverage gaps

## Scope Guidance

Use `references/review-checklist.md` for Langfuse-specific checks such as:

- ClickHouse and Postgres migration expectations
- project-scoped tenant isolation checks
- API/Fern consistency
- banner-offset UI positioning
- environment variable access patterns

Do not duplicate those rules in ad hoc prompts or tool-specific command files.
