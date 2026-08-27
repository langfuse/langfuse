-- Roll-up B: cost by user. user_id is an ORDER BY dimension, not any().
SELECT
    user_id,
    sum(sum_cost) AS sum_cost,
    uniqExactMerge(traces) AS traces
FROM obs_daily_agg_benchmark
WHERE project_id = {projectId: String}
  AND day >= toDate(toStartOfDay({from: DateTime64(6)}) + INTERVAL 1 DAY)
  AND day < toDate(toStartOfDay({to: DateTime64(6)}))
GROUP BY user_id
ORDER BY sum_cost DESC, user_id
