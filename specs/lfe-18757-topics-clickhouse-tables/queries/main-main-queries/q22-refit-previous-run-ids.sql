-- Q22 refit: previous run ids
-- Built on main by readTopicRunTraceIds (packages/shared/src/server/topics/clickhouse.ts:1085); use case: Fit continuity with previous map
-- Configuration: 1 main + main queries

SELECT DISTINCT trace_id AS traceId FROM topic_assignments WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND clustering_run_id = {prevRun:String}
        AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32} AND origin = 'initial' AND trace_id != '' ORDER BY traceId LIMIT 20001
