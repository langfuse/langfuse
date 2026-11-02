-- Audit log rows for change events (create, update, delete) and access events
-- (single reads, lists, exports, downloads). Rows are append-only.
-- ReplacingMergeTree collapses a row that is inserted twice, which is why `id`
-- ends the sorting key. `project_id = ''` marks organisation-level events.
-- `resource_refs` holds typed refs such as 'trace:<id>', so that
-- has(resource_refs, 'trace:<id>') finds every event that touched a resource.
CREATE TABLE IF NOT EXISTS audit_logs {CLICKHOUSE_CLUSTER_CLAUSE}
(
    id                String,
    timestamp         DateTime64(3),
    org_id            String,
    project_id        String DEFAULT '',
    event_kind        LowCardinality(String),
    outcome           LowCardinality(String) DEFAULT 'success',
    outcome_reason    String DEFAULT '',
    actor_type        LowCardinality(String),
    user_id           String DEFAULT '',
    api_key_id        String DEFAULT '',
    actor_name        String DEFAULT '',
    actor_email       String DEFAULT '',
    user_org_role     LowCardinality(String) DEFAULT '',
    user_project_role LowCardinality(String) DEFAULT '',
    resource_type     LowCardinality(String),
    resource_id       String DEFAULT '',
    resource_refs     Array(String) DEFAULT [],
    action            LowCardinality(String),
    surface           LowCardinality(String) DEFAULT '',
    route             String DEFAULT '',
    params            String DEFAULT '' CODEC(ZSTD(3)),
    result_count      UInt32 DEFAULT 0,
    before            String DEFAULT '' CODEC(ZSTD(3)),
    after             String DEFAULT '' CODEC(ZSTD(3)),
    ip                String DEFAULT '',
    user_agent        String DEFAULT '',
    request_id        String DEFAULT '',
    inserted_at       DateTime64(3) DEFAULT now64(3),

    INDEX idx_resource_id   resource_id   TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_resource_refs resource_refs TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_user_id       user_id       TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_api_key_id    api_key_id    TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
PRIMARY KEY (org_id, project_id, toStartOfMinute(timestamp))
ORDER BY (org_id, project_id, toStartOfMinute(timestamp), id);
