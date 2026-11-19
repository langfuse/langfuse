-- Q21 scatter assignments
-- Built on main by readTopicMapAssignments (packages/shared/src/server/topics/clickhouse.ts:1123); use case: Scatter plot; worker resume of a completed run
-- Configuration: 1 main + main queries

SELECT project_id AS projectId, facet_id AS facetId, facet_version AS facetVersion, trace_id AS traceId, session_id AS sessionId, environment, trace_name AS traceName,
  toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs, coordinates, toUnixTimestamp64Milli(summary_processed_at) AS summaryProcessedAtMs,
  clustering_run_id AS runId, topic_id AS topicId, topic_version_id AS topicVersionId, distance, runner_up_distance AS runnerUpDistance, origin,
  toUnixTimestamp64Milli(assigned_at) AS assignedAtMs FROM topic_assignments WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
        AND clustering_run_id = {runId:String} AND origin = 'initial' AND trace_id != ''
      ORDER BY assigned_at DESC LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
