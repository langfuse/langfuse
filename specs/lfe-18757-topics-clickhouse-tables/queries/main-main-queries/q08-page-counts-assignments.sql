-- Q08 page counts: assignments
-- Built on main by getTopicResultCounts assignments (packages/shared/src/server/repositories/topic-results.ts:730); use case: Same as Q07, in parallel
-- Configuration: 1 main + main queries

SELECT facet_id, topic_id, grouping(topic_id) AS is_facet_total, uniqCombined(trace_id) AS count, uniqCombinedIf(trace_id, topic_id != '') AS assigned
      FROM topic_assignments WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != '' AND facet_id IN {facetIds:Array(String)} AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String} AND clustering_run_id != ''
      AND clustering_run_id = {runIds:Array(String)}[indexOf({facetIds:Array(String)}, facet_id)]
      GROUP BY GROUPING SETS ((facet_id, topic_id), (facet_id))
