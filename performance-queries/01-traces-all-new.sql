with score_stats as (
    SELECT
        project_id,
      trace_id,
      count(*) as score_count
    FROM scores
    WHERE project_id = {projectId: String}
      AND timestamp >= '2025-06-01'
      AND timestamp <= now()
    GROUP BY project_id, trace_id
    )

SELECT
  t.id,
  t.name,
  t.start_time as timestamp,
  t.user_id,
  t.session_id,
  t.environment,
--   t.tags,
--   t.bookmarked,
  dateDiff('seconds', t.start_time, t.end_time) as latency,
  t.cost_details as totalCost,
  t.count_observations as observationCount,
  COALESCE(s.score_count, 0) as scoreCount
FROM exp_traces_amt t FINAL
LEFT JOIN score_stats s ON t.id = s.trace_id AND t.project_id = s.project_id
WHERE t.project_id = {projectId: String}
  AND t.start_time >= '2025-06-01'
  AND t.start_time <= now()
  -- Search filter placeholder
--   AND ({searchQuery: String} = '' OR (
--     t.name ILIKE '%' || {searchQuery: String} || '%'
--     OR t.id ILIKE '%' || {searchQuery: String} || '%'
--   ))
  -- User filter placeholder (using normalized properties)
--   AND ({userIdFilter: String} = '' OR t.user_id = {userIdFilter: String})
ORDER BY t.start_time DESC
LIMIT 50 OFFSET 0
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.traces.all", "schema": "new", "pattern": "traces_table_listing"}'
