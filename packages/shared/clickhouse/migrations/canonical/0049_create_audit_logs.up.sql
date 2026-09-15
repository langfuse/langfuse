-- Audit log storage for change events (create/update/delete of settings and
-- data) and access events (reads, lists, exports, downloads). Rows are
-- append-only. ReplacingMergeTree collapses exact duplicates from queue
-- retries and backfill re-runs, which is why `id` ends the sorting key.
-- `project_id = ''` marks organisation-level events.
-- Note for authors: golang-migrate splits this file on semicolons, so comments
-- must not contain one.
CREATE TABLE IF NOT EXISTS audit_logs {CLICKHOUSE_CLUSTER_CLAUSE}
(
    id                String,
    timestamp         DateTime64(3),
    org_id            String,
    project_id        String DEFAULT '',
    event_kind        LowCardinality(String),
    actor_type        LowCardinality(String),
    user_id           String DEFAULT '',
    api_key_id        String DEFAULT '',
    user_org_role     LowCardinality(String) DEFAULT '',
    user_project_role LowCardinality(String) DEFAULT '',
    resource_type     LowCardinality(String),
    resource_id       String DEFAULT '',
    action            LowCardinality(String),
    surface           LowCardinality(String) DEFAULT '',
    route             String DEFAULT '',
    params            String DEFAULT '' CODEC(ZSTD(3)),
    result_count      UInt32 DEFAULT 0,
    before            String DEFAULT '' CODEC(ZSTD(3)),
    after             String DEFAULT '' CODEC(ZSTD(3)),
    created_at        DateTime64(3) DEFAULT now(),

    INDEX idx_resource_id resource_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_user_id     user_id     TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_api_key_id  api_key_id  TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
PRIMARY KEY (org_id, project_id, toStartOfMinute(timestamp))
ORDER BY (org_id, project_id, toStartOfMinute(timestamp), id);
