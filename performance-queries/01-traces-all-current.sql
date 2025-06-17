-- Current: getTracesTable() with observation_stats and score_stats CTEs
WITH observation_stats AS (
  SELECT
    trace_id,
    project_id,
    sum(total_cost) as total_cost,
    date_diff('millisecond', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latency_milliseconds,
    count(*) as observation_count
  FROM observations FINAL
  WHERE project_id = {projectId: String}
    AND start_time >= {fromTimestamp: DateTime64(3)}
    AND start_time <= {toTimestamp: DateTime64(3)}
    -- Additional filter placeholders
    AND ({userIdFilter: String} = '' OR trace_id IN (
      SELECT id FROM traces WHERE user_id = {userIdFilter: String}
    ))
  GROUP BY project_id, trace_id
), score_stats AS (
  SELECT
    trace_id,
    project_id,
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
  t.timestamp,
  t.user_id,
  t.session_id,
  t.environment,
  t.tags,
  t.bookmarked,
  COALESCE(o.latency_milliseconds / 1000, 0) as latency,
  COALESCE(o.total_cost, 0) as totalCost,
  COALESCE(o.observation_count, 0) as observationCount,
  COALESCE(s.score_count, 0) as scoreCount
FROM traces t FINAL
LEFT JOIN observation_stats o ON t.id = o.trace_id AND t.project_id = o.project_id
LEFT JOIN score_stats s ON t.id = s.trace_id AND t.project_id = s.project_id
WHERE t.project_id = {projectId: String}
  AND t.timestamp >= {fromTimestamp: DateTime64(3)}
  AND t.timestamp <= {toTimestamp: DateTime64(3)}
  -- Search filter placeholder
  AND ({searchQuery: String} = '' OR (
    t.name ILIKE '%' || {searchQuery: String} || '%'
    OR t.id ILIKE '%' || {searchQuery: String} || '%'
  ))
  -- User filter placeholder
  AND ({userIdFilter: String} = '' OR t.user_id = {userIdFilter: String})
ORDER BY toDate(t.timestamp) DESC, t.timestamp DESC, t.event_ts DESC
LIMIT 50 OFFSET 0
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.traces.all", "schema": "current", "pattern": "traces_table_listing"}'
