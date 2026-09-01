-- Roll-up B: same complete-day grain as dash-pushdown-cost-by-day.
SELECT
    day,
    sum(sum_cost) AS sum_cost,
    sum(span_count) AS span_count,
    uniqExactMerge(traces) AS traces
FROM obs_daily_agg_benchmark
WHERE project_id = {projectId: String}
  AND day >= toDate(toStartOfDay({from: DateTime64(6)}) + INTERVAL 1 DAY)
  AND day < toDate(toStartOfDay({to: DateTime64(6)}))
GROUP BY day
ORDER BY day
