-- Restores the 0055 Topics tables and topics, kept as *_old. Rows written since 0059 are dropped.
DROP VIEW IF EXISTS topic_assignments_by_trace_mv {CLICKHOUSE_CLUSTER_CLAUSE};
DROP TABLE IF EXISTS topic_assignments_by_trace {CLICKHOUSE_CLUSTER_CLAUSE} SYNC;
DROP TABLE IF EXISTS topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE} SYNC;
DROP TABLE IF EXISTS topic_assignments {CLICKHOUSE_CLUSTER_CLAUSE} SYNC;
DROP TABLE IF EXISTS topics {CLICKHOUSE_CLUSTER_CLAUSE} SYNC;
RENAME TABLE topic_facet_summaries_old TO topic_facet_summaries, topic_assignments_old TO topic_assignments, topics_old TO topics {CLICKHOUSE_CLUSTER_CLAUSE};
