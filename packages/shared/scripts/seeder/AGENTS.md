# Seeder — Agent Guide

If you need local test data (traces, observation trees, sessions, bulk rows,
v4 events), use the seed CLI. Do not write ad-hoc ts-node scripts or raw
ClickHouse inserts — the CLI handles env loading, preflight, batching,
verification, and deep links.

```bash
pnpm run seed -- doctor        # check the stack; prints the fix per failure
pnpm run seed -- list          # scenarios and flags (--json for machines)
pnpm run seed -- trace-tree --observations 5000 --breadth 500 --v4
pnpm run seed -- long-session --traces 300 --observations-per-trace 8
pnpm run seed -- many-traces --count 100000 --days 14
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
