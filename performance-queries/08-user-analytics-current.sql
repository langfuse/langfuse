-- Current: getUserMetrics() - Complex CTE with window functions and JOINs
WITH stats as (
  SELECT
    t.user_id as user_id,
    anyLast(t.environment) as environment,
    count(distinct o.id) as obs_count,
    sumMap(usage_details) as sum_usage_details,
    sum(total_cost) as sum_total_cost,
    max(t.timestamp) as max_timestamp,
    min(t.timestamp) as min_timestamp,
    count(distinct t.id) as trace_count
  FROM
    (
      SELECT
        o.project_id,
        o.trace_id,
        o.usage_details,
        o.total_cost,
        id,
        ROW_NUMBER() OVER (
          PARTITION BY id
          ORDER BY
            event_ts DESC
        ) AS rn
      FROM
        observations o
      WHERE
        o.project_id = {projectId: String}
        AND o.start_time >= {traceTimestamp: DateTime64(3)} - INTERVAL 2 DAY
        AND o.trace_id in (
          SELECT
            distinct id
          from
            traces
          where
            user_id IN ({userIds: Array(String)})
            AND project_id = {projectId: String}
            AND timestamp >= {fromTimestamp: DateTime64(3)}
            AND timestamp <= {toTimestamp: DateTime64(3)}
        )
        AND o.type = 'GENERATION'
    ) as o
    JOIN (
      SELECT
        t.id,
        t.user_id,
        t.project_id,
        t.timestamp,
        t.environment,
        ROW_NUMBER() OVER (
          PARTITION BY id
          ORDER BY
            event_ts DESC
        ) AS rn
      FROM
        traces t
      WHERE
        t.user_id IN ({userIds: Array(String)})
        AND t.project_id = {projectId: String}
        AND t.timestamp >= {fromTimestamp: DateTime64(3)}
        AND t.timestamp <= {toTimestamp: DateTime64(3)}
    ) as t on t.id = o.trace_id
    and t.project_id = o.project_id
  WHERE
    o.rn = 1
    and t.rn = 1
  group by
    t.user_id
)
SELECT
  arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, sum_usage_details))) as input_usage,
  arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, sum_usage_details))) as output_usage,
  sum_usage_details['total'] as total_usage,
  obs_count,
  trace_count,
  user_id,
  environment,
  sum_total_cost,
  max_timestamp,
  min_timestamp
FROM
  stats
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "getUserMetrics", "schema": "current", "pattern": "user_analytics_complex"}'
