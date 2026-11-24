-- empty_input and input_too_large mark summaries the Topics job wrote without a
-- model call: the transcript had nothing for the model, or its rendered text
-- exceeded LANGFUSE_TOPICS_MAX_INPUT_CHARACTERS. Adding Enum8 values is
-- metadata-only: existing parts are not rewritten.
ALTER TABLE topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE} MODIFY COLUMN processing_state Enum8('not_applicable' = 1, 'insufficient_input' = 2, 'complete' = 3, 'empty_input' = 4, 'input_too_large' = 5){CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};
