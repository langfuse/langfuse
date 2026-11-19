-- Q13 nightly: new summaries? (1d)
-- Built on main by getTopicSummaryCounts (packages/shared/src/server/topics/clickhouse.ts:765); use case: Snapshot preview, snapshot fit precheck, nightly refit check
-- Configuration: 1 main + main queries

SELECT facet_id, facet_version, count() FROM (SELECT facet_id, facet_version, trace_id FROM (
            SELECT facet_id, facet_version, trace_id, processing_state, embedding_model, length(embedding) AS dimensions, environment FROM topic_facet_summaries
            WHERE project_id = {projectId:String} AND unit_start_time >= {d1:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != ''
              AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {versions:Array(UInt32)})
              AND (facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at) IN (
      SELECT facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at FROM topic_facet_summaries
      WHERE project_id = {projectId:String}
        AND (facet_id, trace_id, if(trace_id = '', session_id, '')) IN (
          SELECT facet_id, trace_id, if(trace_id = '', session_id, '') FROM topic_facet_summaries
          WHERE project_id = {projectId:String} AND unit_start_time >= {d1:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != '' AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {versions:Array(UInt32)})
          GROUP BY facet_id, trace_id, if(trace_id = '', session_id, ''))
      ORDER BY facet_version DESC, processed_at DESC
      LIMIT 1 BY facet_id, trace_id, if(trace_id = '', session_id, ''))
            ORDER BY processed_at DESC LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
          ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String} AND dimensions = {embeddingDimensions:UInt32} AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String}) GROUP BY facet_id, facet_version
