---
name: research
description: |
  Pre-implementation codebase research and planning for Langfuse work. Use after issue
  investigation and before editing production code to trace code paths, read related
  modules and tests, assess impact, and produce a structured implementation plan.
---

# Research

Use this skill in the **plan stage** — after investigation establishes what is broken,
before writing production code. Investigation finds the signal; research maps how the
codebase should change.

## When to use

- Cloud Agent Phase 2 (`cursor-cloud-issue-delivery`)
- Any task where jumping straight to a patch would miss touch points, tests, or
  package boundaries
- Ambiguous fixes spanning web, worker, or `packages/shared`

Do **not** use for open-ended production telemetry sweeps — that is
`debug-issue-with-datadog`. Do **not** use after implementation starts.

## Workflow

1. **Load investigation context** — symptom, root-cause hypothesis, repro shape, and
   signal sources from Phase 1. If investigation is incomplete, go back; do not plan
   on guesses.

2. **Orient in the repo** — read `langfuse-codebase-navigator` and the narrowest
   package `AGENTS.md` for the affected area (`web/`, `worker/`, `packages/shared/`).

3. **Trace the code path** — from the symptom to handlers, services, repositories,
   queue consumers, and UI components. Read enough to confirm or revise the root-cause
   hypothesis. Cite file paths and line ranges.

4. **Find existing patterns and tests** — locate the closest test suite, similar fixes,
   and conventions to follow. Note migrations, Fern/API contracts, or feature flags
   if touched.

5. **Assess impact and scope** — list every file/package likely to change, what stays
   out of scope, and risks (schema migrations, cross-package refactors, security).

6. **Choose test data** — map the repro shape to a `seed-test-data` scenario, or note
   that the default demo project is enough. Flag if a new seeder scenario is needed.

7. **Write the plan** — output the structured plan below in the agent thread. For
   ambiguous scope, security-sensitive changes, or schema migrations, ask the human
   to confirm before implementation.

## Plan output format

```markdown
## Plan

### Problem
(one sentence)

### Root cause
(file paths + mechanism — updated after codebase research)

### Approach
(numbered steps; call out migrations, API contracts, UI flows)

### Files / packages
(bullet list of expected touch points)

### Tests
- failing test to add first (file + assertion)
- other verification (lint, targeted vitest, browser flow)

### Test data
- seed scenario + flags, or "default demo project is enough"

### Risks / out of scope
(bullet list)
```

Keep the plan proportional: a one-line fix still gets a short plan with approach,
tests, and risks.

## Delegation during research

| Need | Skill |
| --- | --- |
| Repo / skill routing | `langfuse-codebase-navigator` |
| ClickHouse query or schema review | `clickhouse-best-practices` |
| Security-sensitive surface | `security-review` |
| Frontend state / effects | `refactor-react-effects`, `frontend-large-feature-architecture` |
| Backend patterns | `backend-dev-guidelines` |
| Seed scenario selection | `seed-test-data` |

## Rules

- Research is read-only — no production edits, no commits, no PRs.
- Prefer reading source and tests over speculative rewrites.
- Revise the root-cause hypothesis when the code contradicts Phase 1.
- Do not treat completing research as permission to skip local verification later.
