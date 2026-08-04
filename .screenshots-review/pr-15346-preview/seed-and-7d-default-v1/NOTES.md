# PR 15346 preview — seed + 7-day default time range (v1)

Preview: https://pr-15346.preview.langfuse.com (demo@langfuse.com / password,
project llm-app `7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`).

## Change

- Default table time range was **Past 1 day**; changed the fallback in
  `web/src/hooks/useTableDateRange.tsx:24` from `"last1Day"` to `"last7Days"`
  (commit `527b94f2a` on `session-redesign`). Applies to traces, sessions,
  observations, scores, users, events tables (explicit picks still persist).
- Also merged `origin/main` into `session-redesign` (`fbdb4e7e9`) to clear the
  `has-conflicts` state — GitHub does not run pull_request workflows (and thus
  no preview rebuild) on conflicting PRs. Conflict was one file:
  `ChatMessage.tsx` — kept `bordered`, dropped removed prop
  `customCodeHeaderVariant`.

## Seeded (in-cluster, worker image's compiled seeder CLI)

- many-traces: 3000 traces / 15000 obs / 6000 scores over past 7 days (v3)
- trace-tree: 600-obs branching tree, depth 10, breadth 50, v4
- agent-timeline: 6-turn LangGraph refine loop, v4
- support-agent: handcrafted refund copilot trace `c4a1e2`, v4
- long-session: 200-trace session + 60-trace session (`longsess2`), v4
- session-shapes: chat / agent / mixed sessions, 10 turns, v4
- scored-traces: 24 traces, 312 scores, v4

## Screenshots

1. `traces-7d-populated.png` — Tracing page, "7d Past 7 days" default, populated
2. `sessions-7d-populated.png` — Sessions page, "7d Past 7 days" default, populated
