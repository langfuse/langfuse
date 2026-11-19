-- Q18 trace header assignments
-- Built on main by readLatestTopicAssignments (packages/shared/src/server/topics/clickhouse.ts:1182); use case: Trace header topics
-- Configuration: 3 meeting + improved

SELECT project_id AS projectId, facet_id AS facetId, facet_version AS facetVersion, trace_id AS traceId, session_id AS sessionId, environment, trace_name AS traceName,
  toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs, coordinates, toUnixTimestamp64Milli(summary_processed_at) AS summaryProcessedAtMs,
  clustering_run_id AS runId, topic_id AS topicId, topic_version_id AS topicVersionId, distance, runner_up_distance AS runnerUpDistance, origin,
  toUnixTimestamp64Milli(assigned_at) AS assignedAtMs FROM topic_assignments WHERE project_id = {projectId:String} AND unit_start_time >= {tfrom:DateTime64(3)} AND unit_start_time < {tto:DateTime64(3)} AND facet_id = {facetId:String}
        AND clustering_run_id IN {facetRuns:Array(String)} AND rule_id IN {ruleIds:Array(String)} AND trace_id IN {oneTrace:Array(String)}
      ORDER BY facet_version DESC, assigned_at DESC, origin DESC LIMIT 1 BY project_id, facet_id, clustering_run_id, trace_id, if(trace_id = '', session_id, '')
