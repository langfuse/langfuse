# Trace Metrics C Benchmark

This experiment evaluates a narrow five-minute `AggregatingMergeTree` for
trace-level cost, token, latency, and span-count queries. It does not create a
production migration or materialized view.

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

Add `--skip-global-sort` when the bounded Top-K event query is the only event
sorting strategy under test.

The runner:

1. Recreates `trace_metrics_5m_benchmark`.
2. Aligns the requested range to complete five-minute buckets and backfills it
   from deduplicated `events_core` rows.
3. Compares per-trace values with the raw-table gold query.
4. Runs Top-N, chart, bucket-count, bounded event Top-K, and global event-sort
   queries over 1-day, 7-day, and full windows.
5. Writes `trace-metrics-c-results.json` and
   `trace-metrics-c-report.html`.

## Interpretation

- Any correctness mismatch fails the runner.
- The benchmark deliberately excludes the current partial five-minute bucket so
  raw and rollup queries measure the same cohort. Production routing must UNION
  raw left/right edges around the complete-bucket rollup middle.
- `p95 buckets / trace = 1` means another hourly or daily trace rollup is
  unlikely to reduce cardinality.
- Compare `events-top-k` with `events-global-sort`; a large gap supports a
  nested/Top-K UX instead of globally sorting all event rows by trace cost.
- The raw gold queries deliberately use `ORDER BY event_ts DESC LIMIT 1 BY
  project_id, trace_id, span_id`. An insert-triggered MV that sums every
  ReplacingMergeTree version is not equivalent and is outside this benchmark.
