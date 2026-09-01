# Trace-level metrics: architecture findings

Queryable trace totals (cost, latency, tokens, span count) after v4. Live
`GROUP BY trace_id` on `events_core` does not scale. Do **not** recreate
`traces_all_amt` (`ORDER BY (project_id, id)` only): time filters cannot prune,
and `anyLast` mixed attributes with additive cost.

Keep **two tables**. They answer different questions.

## Job B — daily observation AMT (no `trace_id` in the key)

`ORDER BY (project_id, day, user_id, …)`. `sum()` cost/tokens, `uniqExact(trace_id)`.
Never pick latest. Partial days `UNION` raw `events_core`.

Use for: spend over time, cost by user/session.

## Job C — 5-minute AMT keyed `(project_id, bucket, trace_id)`

No I/O or metadata maps. Multiple rows per trace are expected: always
`GROUP BY trace_id` then `sum()` / `min()` / `max()`. Cost is additive; do not
pick latest.

Use for: trace list sort/filter/Top-N, **true** avg/p95 per trace (collapse
then aggregate).

One grain (5m). Skip a 1h/1d *trace-keyed* ladder unless p95 buckets/trace ≫ 1.

## Two product metrics

| Chart | Meaning | Table |
| --- | --- | --- |
| Cost incurred | Sum of span cost on the span's `start_time` day | B |
| Trace total | Collapse the trace, attribute to `min(start_time)` | C |

These disagree when a trace crosses midnight. `avg(span cost)` is not average
trace cost.

## Write path

Gold collapse is `ORDER BY event_ts DESC LIMIT 1 BY (project_id, trace_id, span_id)`.
An ingest MV that `sum()`s every ReplacingMergeTree version is wrong. Prefer a
delayed worker fold into C. `versions_per_span ≈ 1` in local seeds **and** in a
production 7-day 10% sample — C earns **span** collapse, not version collapse.

## Events table + trace cost

Only hash-join **collapsed** C. Do not join raw C rows (duplicates) or join on
the 5-minute bucket (fragment ≠ total). Filtering C to the events time window
undercounts traces that started earlier.

Prefer nested UX (order traces, then events `IN (trace_id)`) or Top-K. Do not
store `trace_total_cost` on `events_core` (stale on the next span). Do not offer
global events sort by parent-trace cost as the default.

## What we measured

**Production** (`events_core`, `SAMPLE 0.1`, 7 days, no `project_id` in WHERE;
still `GROUP BY (project_id, trace_id)`):

- ~129M traces/week (scaled); 97.66% in one 5m bucket
- Avg C rows/trace: 1.047 (5m) / 1.013 (1h) / 1.002 (1d) → no trace-keyed ladder
- `versions_per_span ≈ 1`; ~6× span collapse
- p95 duration 47s

**Local 250k traces / 1M events** (complete 5m buckets; 0 per-trace mismatches;
row fold 3.95×; 98.9% one bucket):

| Query | Push-down | Roll-up |
| --- | --- | --- |
| Cost by day (B) | 446 ms, 196 MiB | 14 ms, 502 KiB |
| Cost by user (B) | 481 ms, 222 MiB | 22 ms, 553 KiB |
| Avg trace total by day (C) | 517 ms, 196 MiB | 41 ms, 23 MiB |
| Top-N traces (C) | 491 ms, 206 MiB | 45 ms, 27 MiB |

B vs C day totals **matched** on this seed because traces do not cross midnight.
Avg span cost was ~3× lower than avg trace total on every day (3 child spans).

Local 400 × 40-obs traces folded **39×** with 96% still in one bucket: fold
tracks **spans × versions**, not duration. `p95 buckets/trace = 1` means C
worked, not that 5m is useless.

## Production caveats

- Complete buckets/days only in the benchmark. Route with a raw-edge UNION.
- 250k still fits in memory; treat elapsed as query shape, not capacity.
- `user_id` / `session_id` belong on B as dimensions, not `any()` on C.
- Pick-one trace attrs, if needed later: `argMax(..., event_ts)`, not `anyLast`.
