-- Q11 trace header summary (1 trace)
-- Built on main by getLatestFacetSummaries (packages/shared/src/server/topics/clickhouse.ts:371); use case: Scatter plot, trace header
-- Configuration: 3 review-call version

SELECT project_id, facet_id, facet_version, trace_id, session_id, processing_state, summary, environment FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND unit_start_time >= {tfrom:DateTime64(3)} AND unit_start_time < {tto:DateTime64(3)} AND facet_id = {facetId:String} AND trace_id IN {oneTrace:Array(String)}
      ORDER BY facet_version DESC, processed_at DESC LIMIT 1 BY project_id, trace_id, if(trace_id = '', session_id, '')
