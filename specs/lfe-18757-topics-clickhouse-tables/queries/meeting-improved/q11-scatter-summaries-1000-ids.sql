-- Q11 scatter summaries (1000 ids)
-- Built on main by getLatestFacetSummaries (packages/shared/src/server/topics/clickhouse.ts:371); use case: Scatter plot, trace header
-- Configuration: 3 meeting + improved

SELECT project_id, facet_id, facet_version, trace_id, session_id, processing_state, summary, environment, unit_start_time, processed_at FROM topic_facet_summaries
              WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32} AND trace_id IN {traceIds:Array(String)}
              ORDER BY processed_at DESC LIMIT 1 BY facet_id, trace_id, if(trace_id = '', session_id, '')
