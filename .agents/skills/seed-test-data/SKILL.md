---
name: seed-test-data
description: |
  Seed local Langfuse test data with one command: large/branching observation
  trees (v3 and v4 events), long sessions, bulk traces for list performance.
  Use whenever a task needs ClickHouse/Postgres test data — e.g. "seed a
  complex trace", "make a tough session", "fill the trace list", "test v4
  events UI", or when debugging trace/session/list rendering or performance.
  Never write ad-hoc seed scripts or raw ClickHouse inserts.
---

# Seed Test Data

One-shot deterministic test data for local Langfuse. The CLI handles env
loading, preflight checks, ClickHouse/Postgres writes, readback verification,
and prints UI deep links plus a machine-readable JSON summary (last stdout
line).

## If anything fails, run doctor first

```bash
pnpm run seed -- doctor
```

Prints PASS/WARN/FAIL per dependency (Postgres, migrations, project,
ClickHouse, v4 dev tables, Redis, MinIO, web app) with the exact fix command
for every failure. Do not debug Docker/ClickHouse manually before running
this.

## Need → command

| I need...                                                                               | Command                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A very complex observation tree (v3)                                                    | `pnpm run seed -- trace-tree --observations 5000 --depth 12 --breadth 500`                                                                                                                                                           |
| The same tree readable in the v4 events UI                                              | add `--v4` (writes `events_full`; `events_core` fills via MV)                                                                                                                                                                        |
| Async parents whose subtree outlives their own span (subtree wall-clock duration badge) | add `--async-parents` to `trace-tree` (root + hub end immediately while children keep running)                                                                                                                                       |
| A realistic agent flow over a timeline (graph view + scrubbable timeline)               | `pnpm run seed -- agent-timeline --turns 6 --v4` (LangGraph refine loop planner→retriever→generator→critic→loop, staggered in time; add `--timing-only` for the pure timing fallback)                                                |
| A demo-grade, real-looking agent trace (videos, screenshots, docs)                      | `pnpm run seed -- support-agent --v4 --id-prefix <hex>` (one fixed, fully handcrafted support-copilot refund run: guardrails, parallel context fan-out, 3-turn ReAct loop with real payloads/costs; deterministic — reseed with a FRESH prefix for a clean take; the prefix is the trace id, so a hex prefix reads like production) |
| A plain trace with no agentic types (collapsed-by-default graph panel)                  | add `--plain` to `trace-tree` (SPAN/GENERATION/EVENT only)                                                                                                                                                                           |
| An extremely DEEP single-chain trace (tree depth = observation count; layout stress)    | `pnpm run seed -- deep-chain --v4` (1401 sequential generations, each the sole child of the previous — the mis-parented-instrumentation shape from LFE-10959 that collapses tree/timeline layouts; `--observations N` to change depth)                                                                                              |
| A super tough session (v3 legacy session view)                                          | `pnpm run seed -- long-session --traces 300 --observations-per-trace 8`                                                                                                                                                              |
| Diverse v4 session shapes (chat / coding-agent / mixed) for the session-detail view     | `pnpm run seed -- session-shapes --shape all` (the `agent` shape has I/O on AGENT/TOOL with no GENERATION — pre-LFE-10520 the "first generation" default rendered empty cards for it; the current "All observations with I/O" default renders it correctly; v4 on by default) |
| Many traces for list/filter performance                                                 | `pnpm run seed -- many-traces --count 100000 --days 14`                                                                                                                                                                              |
| Scores with spaces in the name (filter/grammar testing)                                 | `pnpm run seed -- scored-traces --traces 24 --v4`                                                                                                                                                                                    |
| Lots of scores on every node (dense score badges, tree-row overflow testing)            | add `--scores-per-node 12` to `trace-tree` (N distinct scores per observation; try `--depth 2 --breadth 44` for many tall sibling rows)                                                                                              |
| Varied human-annotation queues (annotate UI / keyboard testing)                         | `pnpm run seed -- annotation-queue --core-items 12` (creates a "core types" queue covering every score-field render path + an "edge cases" queue with archived/stale/partial scores and observation/session/deleted/completed items) |
| Huge/malformed/unicode payloads                                                         | `pnpm run seed -- trace-tree --payload-bytes 1000000 --payload-style malformed` (styles: json, text, malformed, unicode, bignum, base64)                                                                                             |
| Big integers beyond 2^53-1 (number-precision testing)                                   | `pnpm run seed -- trace-tree --observations 1 --payload-style bignum`                                                                                                                                                                |
| Huge base64 data-URI in ChatML IO (multimodal crash shape, LFE-10152)                   | `pnpm run seed -- trace-tree --observations 30 --payload-bytes 20000000 --payload-style base64 --v4` (one unbroken multi-MB base64 token in trace + root-observation IO; max 50 MB)                                                  |
| See all scenarios and flags                                                             | `pnpm run seed -- list --json`                                                                                                                                                                                                       |
| Predict without writing                                                                 | add `--dry-run`                                                                                                                                                                                                                      |

## Contract

- Last stdout line is a JSON summary: `traceIds`, `sessionIds`, `counts`,
  `verified` (ClickHouse readback), `links` (UI deep links). Use `--json` to
  suppress progress logs. Non-zero exit = data did not land; the error
  includes a `fix:` line.
- Deterministic: same `--seed` (default 42) and flags → same ids (ids never
  contain dates), with timestamps anchored to the current UTC day. Re-running
  within the same day overwrites in place; a later-day re-run updates the
  same ids with re-anchored timestamps (the previous day's rows persist
  under their old dates until then). Independent copies come only from
  `--id-prefix`.
- Default project is the seeded `7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`
  (login `demo@langfuse.com` / `password`); override with `--project`.
- Open the printed `links` in the browser to verify visually. The v4
  events-backed UI is the per-user "Fast (Preview)" sidebar toggle, or
  `LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only` server-side.

## Extending

Add a scenario in `packages/shared/scripts/seeder/scenarios/`: a plain
function using the deterministic `Rng` (never `Math.random`), register it in
`scenarios/index.ts`, and update the table in
`packages/shared/scripts/seeder/AGENTS.md` and this skill. Scenario names,
flags, and JSON keys are additive-only contracts. Design rationale:
`packages/shared/scripts/seeder/README.md`.
