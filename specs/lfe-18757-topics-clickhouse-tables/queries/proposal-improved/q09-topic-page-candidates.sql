-- Q09 topic page candidates
-- Built on main by listCurrentRows candidates (topic-results.ts:314, 459) (); use case: Topics page trace list / topic page, public API/MCP summaries and assignments
-- Configuration: 4 proposal + improved

SELECT facet_id, trace_id, unit_start_time FROM topic_assignments WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
      AND facet_id IN {facetIds:Array(String)} AND clustering_run_id IN {publishedRunIds:Array(String)} AND rule_id IN {ruleIds:Array(String)} AND topic_id IN {topicIds:Array(String)} AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String}
      ORDER BY toStartOfMinute(unit_start_time) DESC, unit_start_time DESC, trace_id DESC, facet_id DESC LIMIT 200
