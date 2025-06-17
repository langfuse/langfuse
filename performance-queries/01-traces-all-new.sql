-- New: Query exp_traces_amt directly with pre-aggregated metrics
with score_stats as (
    SELECT
        project_id,
      trace_id,
      count(*) as score_count
    FROM scores
    WHERE project_id = {projectId: String}
      AND timestamp >= {fromTimestamp: DateTime64(3)}
      AND timestamp <= {toTimestamp: DateTime64(3)}
    GROUP BY project_id, trace_id
    )

SELECT
  t.id,
  t.name,
  t.start_time as timestamp,
  t.user_id,
  t.session_id,
  t.environment,
  t.tags,
  t.bookmarked,
  t.latency_seconds as latency,
  t.total_cost as totalCost,
  t.observation_count as observationCount,
  COALESCE(s.score_count, 0) as scoreCount
FROM exp_traces_amt t FINAL
LEFT JOIN score_stats s ON t.id = s.trace_id AND t.project_id = s.project_id
WHERE t.project_id = {projectId: String}
  AND t.start_time >= {fromTimestamp: DateTime64(3)}
  AND t.start_time <= {toTimestamp: DateTime64(3)}
  -- Search filter placeholder
  AND ({searchQuery: String} = '' OR (
    t.name ILIKE '%' || {searchQuery: String} || '%'
    OR t.id ILIKE '%' || {searchQuery: String} || '%'
  ))
  -- User filter placeholder (using normalized properties)
  AND ({userIdFilter: String} = '' OR t.user_id = {userIdFilter: String})
ORDER BY t.start_time DESC
LIMIT 50 OFFSET 0
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.traces.all", "schema": "new", "pattern": "traces_table_listing"}'
