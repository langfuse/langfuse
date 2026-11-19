-- Q19 tracing table topics (100 traces)
-- Built on main by readCurrentTraceTopics (packages/shared/src/server/topics/clickhouse.ts:1210); use case: Tracing table topic column
-- Configuration: 4 proposal

SELECT trace_id, facet_id, topic_id, topic_version_id, clustering_run_id FROM (SELECT trace_id, facet_id, topic_id, topic_version_id, clustering_run_id
      FROM topic_assignments WHERE project_id = {projectId:String} AND unit_start_time >= {pfrom:DateTime64(3)} AND unit_start_time < {pto:DateTime64(3)} AND facet_id IN {allFacets:Array(String)} AND trace_id IN {pageTraces:Array(String)}
        AND clustering_run_id IN {allRuns:Array(String)} AND rule_id IN {allRules:Array(String)} ORDER BY assigned_at DESC, origin DESC LIMIT 1 BY facet_id, clustering_run_id, trace_id)
