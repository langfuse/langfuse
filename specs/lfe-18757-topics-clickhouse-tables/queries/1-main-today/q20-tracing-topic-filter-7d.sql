-- Q20 tracing topic filter (7d)
-- Built on main by currentTopicTraceIdsCondition (packages/shared/src/server/topics/clickhouse.ts:1256); use case: Tracing table topic filter
-- Configuration: 1 main today

SELECT count() FROM (SELECT trace_id FROM (SELECT trace_id, facet_id, topic_id, topic_version_id, clustering_run_id FROM topic_assignments
      WHERE project_id = {projectId:String} AND unit_start_time >= {f7:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND facet_id = {facetId:String} AND trace_id != '' AND trace_id IN (
        SELECT trace_id FROM topic_assignments WHERE project_id = {projectId:String} AND unit_start_time >= {f7:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
          AND facet_id = {facetId:String} AND clustering_run_id IN {facetRuns:Array(String)} AND topic_id IN {topicIds:Array(String)})
        AND clustering_run_id IN {facetRuns:Array(String)}
      ORDER BY assigned_at DESC, origin DESC LIMIT 1 BY facet_id, clustering_run_id, trace_id) WHERE topic_id IN {topicIds:Array(String)})
