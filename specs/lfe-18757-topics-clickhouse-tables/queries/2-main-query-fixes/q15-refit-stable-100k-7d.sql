-- Q15' refit stable 100k / 7d
-- Built on main by getNewestTopicClusteringSummaries (packages/shared/src/server/topics/clickhouse.ts:580); use case: Nightly refit
-- Configuration: 2 main + query fixes
-- New query: stable 100k hash sample for the nightly refit (not on main).

SELECT project_id AS projectId, facet_id AS facetId, facet_version AS facetVersion, trace_id AS traceId, session_id AS sessionId, trigger_type AS triggerType,
  environment, trace_name AS traceName, toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs, processing_state AS state, summary, embedding,
  transcript_id AS transcriptId, transcript_version AS transcriptVersion, summary_model AS summaryModel, embedding_model AS embeddingModel,
  provided_usage_details AS providedUsageDetails, usage_details AS usageDetails, provided_cost_details AS providedCostDetails, cost_details AS costDetails,
  toUnixTimestamp64Milli(processed_at) AS processedAtMs, metadata AS metadataJson FROM topic_facet_summaries WHERE project_id = {projectId:String} AND unit_start_time >= {f7:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
            AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32} AND processing_state = 'complete' AND embedding_model = {embeddingModel:String} AND length(embedding) = {embeddingDimensions:UInt32} AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String}
            AND cityHash64(if(trace_id = '', session_id, trace_id)) < {k7:UInt64}
          ORDER BY processed_at DESC LIMIT 1 BY trace_id, if(trace_id = '', session_id, '')
