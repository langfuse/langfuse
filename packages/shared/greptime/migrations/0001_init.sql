-- GreptimeDB schema for the Langfuse write path (design 01-schema-design.md / 02-write-path.md).
--
-- Three table families:
--   1. raw_events       append_mode, source of truth (replaces the S3 event store)
--   2. traces/observations/scores   merge_mode=last_non_null projections (read path)
--   3. *_metadata / *_tags          EAV filter subtables (independent indexed columns)
--
-- Conventions:
--   - Reserved identifiers (id, name, value, key, type, level, timestamp, source, comment)
--     are backtick-quoted.
--   - Projection time index = the entity's immutable logical time (trace.timestamp /
--     observation.start_time / score.timestamp). PRIMARY KEY = (project_id, id).
--   - cost columns are DECIMAL(38, 12) (invariant 5: no Float64 downgrade).
--   - TTL/retention is intentionally NOT set here; it is owned by the retention step
--     (02-write-path.md invariant 6: raw_events TTL must be >= projection TTL).
--
-- Apply: mysql -h127.0.0.1 -P4002 -uroot openfuse < 0001_init.sql

-- ============================================================================
-- 1. raw_events (append_mode, source of truth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS raw_events (
    `ingested_at`  TIMESTAMP(3) NOT NULL TIME INDEX,   -- append order = ingestion time
    `project_id`   STRING NOT NULL,
    `entity_type`  STRING NOT NULL,                    -- 'trace'|'observation'|'score'|'dataset_run_item'
    `entity_id`    STRING NOT NULL,                    -- business entity id
    `event_id`     STRING NOT NULL,                    -- idempotency / dedup key
    `event_type`   STRING NOT NULL,                    -- 'trace-create'|'generation-update'|...
    `event_ts`     TIMESTAMP(3),                       -- logical event time (body timestamp/startTime)
    `body`         STRING NOT NULL,                    -- raw JSON payload, stored verbatim
    PRIMARY KEY (project_id, entity_type, entity_id)
) WITH ('append_mode' = 'true');

-- ============================================================================
-- 2a. traces projection
-- ============================================================================
CREATE TABLE IF NOT EXISTS traces (
    `timestamp`  TIMESTAMP(3) NOT NULL TIME INDEX,   -- immutable logical time
    `project_id`   STRING NOT NULL,
    `id`         STRING NOT NULL,
    `name`       STRING,
    `environment`  STRING,
    `session_id`   STRING,
    `user_id`      STRING,
    `release`    STRING,
    `version`      STRING,
    `tags`         JSON,                               -- storage/display only; filter via traces_tags
    `metadata`     JSON,                               -- storage/display only; filter via traces_metadata
    `bookmarked`   BOOLEAN,
    `public`       BOOLEAN,
    `input`        STRING,
    `output`       STRING,
    `created_at`   TIMESTAMP(3),                       -- create-only write -> last_non_null == min
    `updated_at`   TIMESTAMP(3),                       -- every write -> last_non_null == max
    `is_deleted`   BOOLEAN DEFAULT false,
    PRIMARY KEY (project_id, `id`)
) WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');

-- ============================================================================
-- 2b. observations projection
-- ============================================================================
CREATE TABLE IF NOT EXISTS observations (
    `start_time`               TIMESTAMP(3) NOT NULL TIME INDEX,
    `project_id`               STRING NOT NULL,
    `id`                     STRING NOT NULL,
    `type`                   STRING,                 -- SPAN|GENERATION|AGENT|TOOL|...
    `trace_id`                 STRING,
    `parent_observation_id`    STRING,
    `environment`              STRING,
    `name`                   STRING,
    `level`                  STRING,                 -- DEBUG|DEFAULT|WARNING|ERROR
    `status_message`           STRING,
    `version`                  STRING,
    `end_time`                 TIMESTAMP(3),
    `completion_start_time`    TIMESTAMP(3),
    -- model
    `provided_model_name`      STRING,
    `internal_model_id`        STRING,
    `model_parameters`         JSON,
    -- io
    `input`                    STRING,
    `output`                   STRING,
    `metadata`                 JSON,                   -- storage/display only; filter via observations_metadata
    -- flattened cost/usage (domain already maintains these)
    `input_cost`               DECIMAL(38, 12),
    `output_cost`              DECIMAL(38, 12),
    `total_cost`               DECIMAL(38, 12),
    `input_usage`              BIGINT,
    `output_usage`             BIGINT,
    `total_usage`              BIGINT,
    -- long-tail maps preserved for exact restore
    `usage_details`            JSON,
    `cost_details`             JSON,
    `provided_usage_details`   JSON,
    `provided_cost_details`    JSON,
    -- pricing tier
    `usage_pricing_tier_id`    STRING,
    `usage_pricing_tier_name`  STRING,
    -- prompt
    `prompt_id`                STRING,
    `prompt_name`              STRING,
    `prompt_version`           INT,
    -- tools
    `tool_definitions`         JSON,
    `tool_calls`               JSON,
    `tool_call_names`          JSON,
    `created_at`               TIMESTAMP(3),
    `updated_at`               TIMESTAMP(3),
    `is_deleted`               BOOLEAN DEFAULT false,
    PRIMARY KEY (project_id, `id`)
) WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');

-- ============================================================================
-- 2c. scores projection
-- ============================================================================
CREATE TABLE IF NOT EXISTS scores (
    `timestamp`         TIMESTAMP(3) NOT NULL TIME INDEX,
    `project_id`          STRING NOT NULL,
    `id`                STRING NOT NULL,
    `name`              STRING,
    `environment`         STRING,
    `source`            STRING,                      -- API|EVAL|ANNOTATION
    `data_type`           STRING,                      -- NUMERIC|CATEGORICAL|BOOLEAN|...
    `value`             DOUBLE,
    `string_value`        STRING,
    `long_string_value`   STRING,
    `comment`           STRING,
    `metadata`            JSON,                        -- storage/display only; filter via scores_metadata
    -- references
    `trace_id`            STRING,
    `observation_id`      STRING,
    `session_id`          STRING,
    `dataset_run_id`      STRING,
    `execution_trace_id`  STRING,
    `author_user_id`      STRING,
    `config_id`           STRING,
    `queue_id`            STRING,
    `created_at`          TIMESTAMP(3),
    `updated_at`          TIMESTAMP(3),
    `is_deleted`          BOOLEAN DEFAULT false,
    PRIMARY KEY (project_id, `id`)
) WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');

-- ============================================================================
-- 3. EAV filter subtables (metadata: key/value; tags: tag)
--    semi-join filtering: ... WHERE id IN (SELECT entity_id FROM <t>_metadata WHERE `key`=? AND `value` LIKE ?)
-- ============================================================================
CREATE TABLE IF NOT EXISTS traces_metadata (
    `timestamp`  TIMESTAMP(3) NOT NULL TIME INDEX,
    `project_id`   STRING NOT NULL,
    `entity_id`    STRING NOT NULL,
    `key`        STRING NOT NULL INVERTED INDEX,
    `value`      STRING SKIPPING INDEX,
    `is_deleted`   BOOLEAN DEFAULT false,
    PRIMARY KEY (project_id, entity_id, `key`)
) WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');

CREATE TABLE IF NOT EXISTS observations_metadata (
    `timestamp`  TIMESTAMP(3) NOT NULL TIME INDEX,
    `project_id`   STRING NOT NULL,
    `entity_id`    STRING NOT NULL,
    `key`        STRING NOT NULL INVERTED INDEX,
    `value`      STRING SKIPPING INDEX,
    `is_deleted`   BOOLEAN DEFAULT false,
    PRIMARY KEY (project_id, entity_id, `key`)
) WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');

CREATE TABLE IF NOT EXISTS scores_metadata (
    `timestamp`  TIMESTAMP(3) NOT NULL TIME INDEX,
    `project_id`   STRING NOT NULL,
    `entity_id`    STRING NOT NULL,
    `key`        STRING NOT NULL INVERTED INDEX,
    `value`      STRING SKIPPING INDEX,
    `is_deleted`   BOOLEAN DEFAULT false,
    PRIMARY KEY (project_id, entity_id, `key`)
) WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');

CREATE TABLE IF NOT EXISTS traces_tags (
    `timestamp`  TIMESTAMP(3) NOT NULL TIME INDEX,
    `project_id`   STRING NOT NULL,
    `entity_id`    STRING NOT NULL,
    `tag`          STRING NOT NULL INVERTED INDEX,
    `is_deleted`   BOOLEAN DEFAULT false,
    PRIMARY KEY (project_id, entity_id, tag)
) WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');

CREATE TABLE IF NOT EXISTS observations_tags (
    `timestamp`  TIMESTAMP(3) NOT NULL TIME INDEX,
    `project_id`   STRING NOT NULL,
    `entity_id`    STRING NOT NULL,
    `tag`          STRING NOT NULL INVERTED INDEX,
    `is_deleted`   BOOLEAN DEFAULT false,
    PRIMARY KEY (project_id, entity_id, tag)
) WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');

CREATE TABLE IF NOT EXISTS scores_tags (
    `timestamp`  TIMESTAMP(3) NOT NULL TIME INDEX,
    `project_id`   STRING NOT NULL,
    `entity_id`    STRING NOT NULL,
    `tag`          STRING NOT NULL INVERTED INDEX,
    `is_deleted`   BOOLEAN DEFAULT false,
    PRIMARY KEY (project_id, entity_id, tag)
) WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');
