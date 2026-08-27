---
name: code-review
description: Review Langfuse code changes for correctness, regressions, and best practices.
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
- If the change accepts a user-supplied URL, adds outbound HTTP, introduces a
  new integration, or touches secrets, RBAC, or redirect handling, also use
  the shared [`security-review`](../security-review/SKILL.md) skill. Run its
  [`references/checklist.md`](../security-review/references/checklist.md)
  before signoff.

## Review Priorities

Focus on:

- correctness bugs
- behavioral regressions
- security and tenant-isolation risks
- performance issues with real impact
- missing or weak tests for risky changes
- Before calling coverage missing, identify the unique regression each proposed
  test catches. Prefer merging into the closest existing suite. Flag repeated
  tests of the same predicate across layers unless each proves a distinct
  transport, projection, or execution boundary.

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
