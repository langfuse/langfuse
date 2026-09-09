# Seeder — Agent Guide

If you need local test data (traces, observation trees, sessions, bulk rows,
v4 events), use the seed CLI. Do not write ad-hoc ts-node scripts or raw
ClickHouse inserts — the CLI handles env loading, preflight, batching,
verification, and deep links.

```bash
pnpm run seed -- doctor        # check the stack; prints the fix per failure
pnpm run seed -- list          # scenarios and flags (--json for machines)
pnpm run seed -- trace-tree --observations 5000 --breadth 500 --v4
pnpm run seed -- trace-tree --observations 12 --plain --v4  # SPAN/GENERATION/EVENT only (collapsed-by-default graph panel)
pnpm run seed -- trace-tree --observations 12 --v4 --tags "Zebra,apple,Ärger"  # extra trace tags (alphabetical tag filter ordering)
pnpm run seed -- trace-tree --observations 12000 --stride-ms 10 --v4  # more observations than the detail view loads; --stride-ms makes the startTime-ordered cap boundary exact (index < 10000 loads)
pnpm run seed -- deep-chain --v4  # 1401 sequential generations in ONE parent chain (depth = count; LFE-10959 layout stress)
pnpm run seed -- agent-timeline --turns 6 --v4  # realistic agent flow-with-loop over a timeline (graph view)
pnpm run seed -- agent-graph --v4  # graph-DENSE trace: ~1,350 distinct node-pair connections from 350 observations (trace-graph layout stress)
pnpm run seed -- agent-timeline --turns 120 --turn-gap-ms 60000 --v4  # ~2.5h wall clock: idle between turns, so the work is a few percent of the trace
pnpm run seed -- timeline-shapes --v4  # a dozen SMALL traces, one per timeline morphology (retry backoff, human wait, fan-out, slow tool, in-flight, instants, ...)
pnpm run seed -- timeline-shapes --shape retry-backoff --v4  # just one of them
pnpm run seed -- timeline-annotated --v4  # ONE trace with every row annotation at once (scores incl. +N overflow, 1 and 12 comments, costs, heat map, first-token mark) — for judging visual load
pnpm run seed -- support-agent --v4 --id-prefix <hex>  # demo-grade handcrafted support-copilot run (videos/screenshots)
pnpm run seed -- long-session --traces 300 --observations-per-trace 8
pnpm run seed -- session-shapes --shape all        # chat / coding-agent / mixed / media v4 sessions
pnpm run seed -- session-shapes --shape media      # messages carrying @@@langfuseMedia:...@@@ refs (needs MinIO)
pnpm run seed -- session-variety --sessions 120 --days 14  # many sessions for the sessions TABLE + its filters/search bar (topic ids, multi user/tag, 4 envs, session metadata, numeric+categorical+boolean scores, comments)
pnpm run seed -- many-traces --count 100000 --days 14
pnpm run seed -- outlier-traffic --days 90   # diurnal v4 traffic w/ cost/latency/token outliers (outlier chart strip)
pnpm run seed -- scored-traces --traces 24 --v4   # scores w/ spaces in the name
pnpm run seed -- custom-models --v4  # project-level model definitions (tiered + single-tier, one price at 0) + a trace whose generations link to them, plus one unpriced model
NEXTAUTH_URL=https://pr-<N>.preview.langfuse.com pnpm run seed -- evaluator-gallery --count 200  # project-owned evaluators via the seeded public API key
```

The last stdout line of a run is a JSON summary with `traceIds`,
`sessionIds`, `counts`, `verified` (ClickHouse readback), and `links` (UI
deep links). `--dry-run` predicts counts without writing; `--json` suppresses
progress output. Full usage and the need→command table live in the
`seed-test-data` skill (`.agents/skills/seed-test-data/SKILL.md`).

## Layout

- `cli.ts` — entry point (`pnpm run seed`, i.e. shared `seed:scenario`)
- `doctor.ts` — stack checks with remediation commands; scenarios run a fast
  preflight subset before writing
- `scenarios/` — one file per scenario plus shared `rng.ts`, `payload.ts`,
  `event-mirror.ts` (v3 observation → v4 `events_full` row), `verify.ts`
- `seed-postgres.ts`, `seed-clickhouse.ts`, `utils/` — the pre-existing
  `pnpm run dx` seed path (unchanged by the CLI)
- `README.md` — design rationale, contract, and roadmap

## Rules for changes

- Scenario names, flag names, and JSON summary keys are a public contract for
  agents and scripts: evolve additively, never rename or remove.
- Scenarios must be deterministic: take randomness from `Rng` (seeded via
  `--seed`), derive ids from `--id-prefix`, and never call `Math.random`.
- Any value that lands in a ClickHouse ORDER BY key (timestamps; observation
  `type` on v3; `start_time` on events) must NOT come from the sequential
  rng stream or wall clock: use `utcDayStartMs()` for time anchors and the
  stateless `jitter(seed, index, max)` for per-row variation. Stream-position
  randomness re-keys rows whenever an unrelated flag (e.g. payload size)
  changes how much rng earlier code consumed, silently duplicating rows on
  re-run; `uniqExact` readbacks cannot see it.
- Every scenario verifies its writes with a ClickHouse readback and fails
  loudly on mismatch.
- New scenarios: add `scenarios/<name>.ts`, register in `scenarios/index.ts`,
  update the skill and this file, and run
  `pnpm exec eslint scripts/seeder --fix` plus `pnpm run typecheck` in
  `packages/shared`.
- No customer data, no secrets, no fixtures that require model provider keys.
