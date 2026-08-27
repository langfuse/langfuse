# Trace Metrics C Benchmark

This experiment evaluates a narrow five-minute `AggregatingMergeTree` for
trace-level cost, token, latency, and span-count queries. It does not create a
production migration or materialized view.

Architecture conclusions: [FINDINGS.md](./FINDINGS.md).

## Run

```bash
pnpm run seed -- trace-metrics-shapes --v4 --id-prefix trace-metrics-shapes
pnpm --filter @langfuse/shared run trace-metrics:benchmark -- \
  --trace-prefix trace-metrics-shapes \
  --days 7 \
  --output /opt/cursor/artifacts
```

For a scale-shaped local cohort:

```bash
pnpm run seed -- outlier-traffic --days 90 --traces-per-day 120 --v4 \
  --id-prefix trace-metrics-scale
pnpm --filter @langfuse/shared run trace-metrics:benchmark -- \
  --trace-prefix trace-metrics-scale \
  --days 90 \
  --output /opt/cursor/artifacts
```

To see how the row fold responds to trace depth (deep agent traces rather than
three-span traces):

```bash
pnpm run seed -- long-session --traces 400 --observations-per-trace 40 \
  --minutes 4320 --v4 --id-prefix trace-metrics-deep
pnpm --filter @langfuse/shared run trace-metrics:benchmark -- \
  --trace-prefix trace-metrics-deep \
  --days 7 \
  --output /tmp/tm-deep
```

Add `--skip-global-sort` when the bounded Top-K event query is the only event
sorting strategy under test.

The runner:

1. Recreates `trace_metrics_5m_benchmark` (job C) and
   `obs_daily_agg_benchmark` (job B).
2. Aligns the requested range to complete five-minute buckets and backfills it
   from deduplicated `events_core` rows.
3. Compares per-trace values with the raw-table gold query.
4. Runs Top-N, chart, bucket-count, bounded event Top-K, global event-sort,
   events⊕C join-pattern checks (collapsed join vs gold, raw C join,
   bucket join, same-window undercount, filter-expensive-then-events),
   and dashboard roll-up vs push-down queries over 1-day, 7-day, and full
   windows. Dashboard queries use complete calendar days only.
5. Writes `trace-metrics-c-results.json` and
   `trace-metrics-c-report.html`.

## Interpretation

- Any correctness mismatch fails the runner.
- The benchmark deliberately excludes the current partial five-minute bucket so
  raw and rollup queries measure the same cohort. Production routing must UNION
  raw left/right edges around the complete-bucket rollup middle.
- **Read `rowFold` before `p95 buckets / trace`.** The fold is how many raw
  `events_core` versions collapse into one rollup row, and it is the actual
  scan saving. It scales with `spansPerTrace × versionsPerSpan`. Trace duration
  only decides how many five-minute keys a trace occupies.
- `p95 buckets / trace = 1` is the grain succeeding: one row answers one trace.
  It argues only against stacking a coarser *trace-keyed* rollup (1h, 1d) on
  top, because that would copy roughly the same row count. It is not evidence
  that the five-minute grain is unnecessary.
- Measured fold on two local cohorts, same query set:

  | Cohort | Spans / trace | Row fold | Traces in one bucket |
  | --- | --- | --- | --- |
  | `outlier-traffic` (90d, 10.7k traces) | 4.00 | 4.0x | 98.8% |
  | `long-session` (400 traces × 40 obs) | 41.00 | 39.4x | 96.0% |

  Fold tracked span depth ~10x while the single-bucket share barely moved,
  which is the evidence that depth and not duration drives the saving.
- Every local cohort so far has `versionsPerSpan ≈ 1`, so the gold query's
  `LIMIT 1 BY` dedup is nearly free in these runs. Production ingest with
  repeated span updates is the case this benchmark still understates.
- Compare `events-top-k` with `events-global-sort`; a large gap supports a
  nested/Top-K UX instead of globally sorting all event rows by trace cost.
- The raw gold queries deliberately use `ORDER BY event_ts DESC LIMIT 1 BY
  project_id, trace_id, span_id`. An insert-triggered MV that sums every
  ReplacingMergeTree version is not equivalent and is outside this benchmark.
- Dashboard **cost incurred by day / user** must match B. Dashboard **average
  trace total by day** must match C after collapsing traces. B vs C day totals
  and avg-trace vs avg-span are expected to differ; they are findings, not
  runner failures.
