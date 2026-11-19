-- Q09 list candidates (newest)
-- Built on main by listCurrentRows candidates (packages/shared/src/server/repositories/topic-results.ts:314); use case: Trace list and topic page
-- Configuration: 1 main + main queries

SELECT facet_id, trace_id, unit_start_time FROM topic_facet_summaries WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
      AND facet_id IN {facetIds:Array(String)} AND trace_id != '' AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String}
      ORDER BY toStartOfMinute(unit_start_time) DESC, unit_start_time DESC, trace_id DESC, facet_id DESC LIMIT 200
