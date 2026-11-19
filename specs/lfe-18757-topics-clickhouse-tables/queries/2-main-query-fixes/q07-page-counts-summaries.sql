-- Q07 page counts: summaries
-- Built on main by getTopicResultCounts (summaries) (packages/shared/src/server/repositories/topic-results.ts:711); use case: Topics page counts
-- Configuration: 2 main + query fixes

SELECT facet_id, uniqCombined(trace_id) AS total, uniqCombinedIf(trace_id, processing_state = 'complete') AS complete,
      uniqCombinedIf(trace_id, processing_state = 'complete' AND facet_version = {versions:Array(UInt32)}[indexOf({facetIds:Array(String)}, facet_id)]) AS usable,
      uniqCombinedIf(trace_id, processing_state = 'not_applicable') AS not_applicable, uniqCombinedIf(trace_id, processing_state = 'insufficient_input') AS insufficient_input
      FROM topic_facet_summaries WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != '' AND facet_id IN {facetIds:Array(String)} AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String} GROUP BY facet_id
