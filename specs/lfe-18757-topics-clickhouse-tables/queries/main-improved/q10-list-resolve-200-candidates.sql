-- Q10 list resolve (200 candidates)
-- Built on main by listCurrentRows resolve (packages/shared/src/server/repositories/topic-results.ts:512); use case: Trace list and topic page
-- Configuration: 2 main + improved

WITH summaries AS (
        SELECT trace_id, facet_id, facet_version, unit_start_time, processed_at, processing_state, summary, trace_name, environment FROM topic_facet_summaries
        WHERE project_id = {projectId:String} AND unit_start_time >= {cfrom:DateTime64(3)} AND unit_start_time < {cto:DateTime64(3)} AND trace_id != '' AND facet_id IN {facetIds:Array(String)} AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String}
          AND (facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at) IN (
      SELECT facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND unit_start_time >= {cfrom:DateTime64(3)} - INTERVAL 2 DAY AND unit_start_time < {cto:DateTime64(3)} + INTERVAL 2 DAY
        AND (facet_id, trace_id, if(trace_id = '', session_id, '')) IN (
          SELECT facet_id, trace_id, if(trace_id = '', session_id, '') FROM topic_facet_summaries
          WHERE project_id = {projectId:String} AND unit_start_time >= {cfrom:DateTime64(3)} AND unit_start_time < {cto:DateTime64(3)} AND trace_id != '' AND facet_id IN {facetIds:Array(String)} AND trace_id IN {p0:Array(String)}
          GROUP BY facet_id, trace_id, if(trace_id = '', session_id, ''))
      ORDER BY facet_version DESC, processed_at DESC
      LIMIT 1 BY facet_id, trace_id, if(trace_id = '', session_id, ''))
        LIMIT 1 BY facet_id, trace_id),
      assignments AS (
        SELECT trace_id AS a_trace_id, facet_id AS a_facet_id, facet_version AS a_facet_version, unit_start_time AS a_unit_start_time,
          summary_processed_at AS a_summary_processed_at, topic_id AS a_topic_id, topic_version_id AS a_topic_version_id, clustering_run_id AS a_run_id, assigned_at AS a_assigned_at
        FROM topic_assignments WHERE project_id = {projectId:String} AND unit_start_time >= {cfrom:DateTime64(3)} AND unit_start_time < {cto:DateTime64(3)} AND trace_id != '' AND facet_id IN {facetIds:Array(String)}
          AND clustering_run_id IN {publishedRunIds:Array(String)} AND trace_id IN {p0:Array(String)}
        ORDER BY facet_version DESC, assigned_at DESC, origin DESC LIMIT 1 BY a_facet_id, a_run_id, a_trace_id),
      current AS (
        SELECT trace_id, facet_id, facet_version, unit_start_time, processed_at, processing_state, summary, trace_name, environment,
          processing_state = 'complete' AND a_trace_id != '' AND a_facet_version = facet_version AND a_unit_start_time = unit_start_time AND a_summary_processed_at = processed_at AS matched,
          if(matched, a_topic_id, '') AS topic_id, if(matched, a_topic_version_id, '') AS topic_version_id, if(matched, a_run_id, '') AS clustering_run_id, a_assigned_at AS assigned_at,
          multiIf(processing_state != 'complete', toString(processing_state), NOT matched, 'awaiting_map', topic_id != '', 'assigned', 'outlier') AS topic_status
        FROM summaries LEFT JOIN assignments ON a_trace_id = trace_id AND a_facet_id = facet_id),
      ranked AS (
        SELECT *, groupArrayIf(topic_id, topic_status = 'assigned') OVER (PARTITION BY facet_id, trace_id) AS key_topic_ids,
          row_number() OVER (PARTITION BY facet_id, trace_id ORDER BY matched DESC, topic_status = 'assigned' DESC, assigned_at DESC) AS key_rank
        FROM current WHERE has(arrayZip({p1:Array(String)}, {p2:Array(String)}, {p3:Array(DateTime64(3))}), (facet_id, trace_id, unit_start_time)))
      SELECT trace_id, facet_id, facet_version, unit_start_time, trace_name, environment, toString(processing_state) AS state, summary AS summary_text, processed_at,
        topic_status, topic_id, topic_version_id, clustering_run_id FROM ranked WHERE key_rank = 1 ORDER BY unit_start_time DESC, trace_id DESC, facet_id DESC
