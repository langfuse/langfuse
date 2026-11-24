-- MV: topic_facet_summaries -> billable_events, one row per summary write.
-- A summary is one facet version over a trace or a session. Facet ids only
-- allow [a-zA-Z0-9_-] and trace ids are client-chosen, so event_id is
-- '<facet_id>:<facet_version>:<length(trace_id)>:<trace_id>:<session_id>',
-- with session_id only for session summaries, as in the table's sorting key.
-- Only complete and not_applicable summaries are usage, matching the
-- self-hosted telemetry count
-- (getTopicFacetSummaryCountsByProjectInCreationInterval). insufficient_input
-- and states added later are not billed until listed here. Rows created
-- more than 48 hours ago are re-inserts, not new usage. The ledger starts
-- filling when this migration runs, and earlier summaries are not backfilled.
CREATE MATERIALIZED VIEW IF NOT EXISTS billable_events_topic_facet_summaries_mv {CLICKHOUSE_CLUSTER_CLAUSE}
TO billable_events AS
SELECT
    now() AS ingested_at,
    project_id,
    'topic_facet_summary' AS event_type,
    concat(
        facet_id, ':', toString(facet_version), ':',
        toString(length(trace_id)), ':', trace_id, ':',
        if(trace_id = '', session_id, '')
    ) AS event_id,
    unit_start_time AS event_time,
    toUInt64(transcript_bytes) AS event_bytes,
    environment
FROM topic_facet_summaries
WHERE processing_state IN ('complete', 'not_applicable')
  AND created_at >= now() - INTERVAL 48 HOUR;

-- A view created earlier by dev-tables.sh or by hand keeps its old query under
-- IF NOT EXISTS, so set the query explicitly.
ALTER TABLE billable_events_topic_facet_summaries_mv {CLICKHOUSE_CLUSTER_CLAUSE} MODIFY QUERY
SELECT
    now() AS ingested_at,
    project_id,
    'topic_facet_summary' AS event_type,
    concat(
        facet_id, ':', toString(facet_version), ':',
        toString(length(trace_id)), ':', trace_id, ':',
        if(trace_id = '', session_id, '')
    ) AS event_id,
    unit_start_time AS event_time,
    toUInt64(transcript_bytes) AS event_bytes,
    environment
FROM topic_facet_summaries
WHERE processing_state IN ('complete', 'not_applicable')
  AND created_at >= now() - INTERVAL 48 HOUR;
