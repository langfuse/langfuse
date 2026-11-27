-- empty_input and input_too_large mark summaries the Topics job wrote without a
-- model call: the transcript had nothing for the model, or its rendered text
-- exceeded LANGFUSE_TOPICS_MAX_INPUT_CHARACTERS. Adding Enum8 values is
-- metadata-only: existing parts are not rewritten. The view below filters on
-- these values, so they must exist first.
ALTER TABLE topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE} MODIFY COLUMN processing_state Enum8('not_applicable' = 1, 'insufficient_input' = 2, 'complete' = 3, 'empty_input' = 4, 'input_too_large' = 5){CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};

-- MV: topic_facet_summaries -> billable_events, one row per summary write.
-- A summary is one facet version over a trace or a session, so event_id is
-- '<facet_id>:<facet_version>:trace:<trace_id>' or
-- '<facet_id>:<facet_version>:session:<session_id>'. Facet ids only allow
-- [a-zA-Z0-9_-] and the source id comes last, so no two units share an id.
-- A re-summary of the same source and facet version (a later redispatch) keeps
-- its event_id, so billing counts it again only after 24 hours without one.
-- Every summary is usage except those written without a model call
-- (empty_input, input_too_large), matching the self-hosted telemetry count
-- (getTopicFacetSummaryCountsByProjectInCreationInterval). A new state
-- written without a model call must be added to this list, and to that
-- count. Rows created more than 48 hours ago are re-inserts, not new usage.
-- The ledger starts filling when this migration runs, and earlier summaries
-- are not backfilled.
CREATE MATERIALIZED VIEW IF NOT EXISTS billable_events_topic_facet_summaries_mv {CLICKHOUSE_CLUSTER_CLAUSE}
TO billable_events AS
SELECT
    now() AS ingested_at,
    project_id,
    'topic_facet_summary' AS event_type,
    concat(
        facet_id, ':', toString(facet_version), ':',
        if(trace_id = '', concat('session:', session_id), concat('trace:', trace_id))
    ) AS event_id,
    unit_start_time AS event_time,
    toUInt64(transcript_bytes) AS event_bytes,
    environment
FROM topic_facet_summaries
WHERE processing_state NOT IN ('empty_input', 'input_too_large')
  AND created_at >= now() - INTERVAL 48 HOUR;
