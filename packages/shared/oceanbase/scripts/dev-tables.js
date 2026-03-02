#!/usr/bin/env node

/**
 * OceanBase dev-tables script
 * Equivalent of clickhouse/scripts/dev-tables.sh
 *
 * Creates development-only tables (events, observations_batch_staging)
 * and backfills events from observations + traces.
 *
 * Usage:
 *   pnpm run ob:dev-tables  (from packages/shared/)
 */

const mysql = require("mysql2/promise");

// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_ADMIN_USER = process.env.OB_ADMIN_USER || "root@oceanbase";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_ADMIN_PASSWORD = process.env.OB_ADMIN_PASSWORD || "";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_HOST = process.env.OB_HOST || "127.0.0.1";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_PORT = process.env.OB_PORT || "2881";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_DATABASE = process.env.OB_DATABASE || "langfuse";

const MAX_RETRIES = 5;
const RETRY_DELAY = 3000;

function createConnection() {
  return mysql.createConnection({
    host: OB_HOST,
    port: OB_PORT,
    user: OB_ADMIN_USER,
    password: OB_ADMIN_PASSWORD,
    database: OB_DATABASE,
    multipleStatements: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
}

async function executeSqlWithRetry(connection, sql, description, params = []) {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      const [result] = await connection.query(sql, params);
      return result;
    } catch (error) {
      const errorMessage = error.message || String(error);
      const isTransient =
        errorMessage.toLowerCase().includes("server is initializing") ||
        errorMessage.toLowerCase().includes("connection refused") ||
        errorMessage.toLowerCase().includes("timeout") ||
        errorMessage.toLowerCase().includes("temporarily unavailable") ||
        errorMessage.toLowerCase().includes("can't connect");

      if (isTransient && retryCount < MAX_RETRIES - 1) {
        retryCount++;
        console.log(
          `Warning: ${description} failed (attempt ${retryCount}/${MAX_RETRIES}), retrying in ${RETRY_DELAY / 1000}s...`,
        );
        console.log(`Error: ${errorMessage}`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        continue;
      } else {
        console.error(`Error: ${description} failed`);
        console.error(errorMessage);
        throw error;
      }
    }
  }
}

const CREATE_OBSERVATIONS_BATCH_STAGING = `
CREATE TABLE IF NOT EXISTS observations_batch_staging (
    id VARCHAR(255) NOT NULL,
    trace_id VARCHAR(255) NOT NULL,
    project_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    parent_observation_id VARCHAR(255) NULL,
    start_time DATETIME(3) NOT NULL,
    end_time DATETIME(3) NULL,
    name VARCHAR(255) NOT NULL DEFAULT '',
    metadata JSON NULL,
    level VARCHAR(50) NULL,
    status_message TEXT NULL,
    version VARCHAR(255) NULL,
    input LONGTEXT NULL,
    output LONGTEXT NULL,
    provided_model_name VARCHAR(255) NULL,
    internal_model_id VARCHAR(255) NULL,
    model_parameters TEXT NULL,
    provided_usage_details JSON NULL,
    usage_details JSON NULL,
    provided_cost_details JSON NULL,
    cost_details JSON NULL,
    total_cost DECIMAL(18,12) NULL,
    usage_pricing_tier_id VARCHAR(255) NULL,
    usage_pricing_tier_name VARCHAR(255) NULL,
    tool_definitions JSON NULL,
    tool_calls JSON NULL,
    tool_call_names JSON NULL,
    completion_start_time DATETIME(3) NULL,
    prompt_id VARCHAR(255) NULL,
    prompt_name VARCHAR(255) NULL,
    prompt_version SMALLINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    event_ts DATETIME(3) NOT NULL,
    is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0,
    s3_first_seen_timestamp DATETIME(3) NOT NULL,
    environment VARCHAR(50) NOT NULL DEFAULT 'default',

    PRIMARY KEY (project_id, s3_first_seen_timestamp, trace_id, id),

    INDEX idx_obs_staging_id (id),
    INDEX idx_obs_staging_trace_id (trace_id),
    INDEX idx_obs_staging_s3_first_seen (s3_first_seen_timestamp),
    INDEX idx_obs_staging_event_ts (event_ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_EVENTS = `
CREATE TABLE IF NOT EXISTS events (
    project_id VARCHAR(255) NOT NULL,
    trace_id VARCHAR(255) NOT NULL,
    span_id VARCHAR(255) NOT NULL,
    parent_span_id VARCHAR(255) NOT NULL DEFAULT '',

    start_time DATETIME(6) NOT NULL,
    end_time DATETIME(6) NULL,

    name VARCHAR(255) NOT NULL DEFAULT '',
    type VARCHAR(50) NOT NULL,
    environment VARCHAR(50) NOT NULL DEFAULT 'default',
    version VARCHAR(255) NOT NULL DEFAULT '',
    \`release\` VARCHAR(255) NOT NULL DEFAULT '',

    trace_name VARCHAR(255) NOT NULL DEFAULT '',
    user_id VARCHAR(255) NOT NULL DEFAULT '',
    session_id VARCHAR(255) NOT NULL DEFAULT '',

    tags JSON NULL,
    bookmarked TINYINT(1) NOT NULL DEFAULT 0,
    \`public\` TINYINT(1) NOT NULL DEFAULT 0,

    level VARCHAR(50) NOT NULL DEFAULT '',
    status_message TEXT NULL,
    completion_start_time DATETIME(6) NULL,

    prompt_id VARCHAR(255) NOT NULL DEFAULT '',
    prompt_name VARCHAR(255) NOT NULL DEFAULT '',
    prompt_version SMALLINT UNSIGNED NULL,

    model_id VARCHAR(255) NOT NULL DEFAULT '',
    provided_model_name VARCHAR(255) NOT NULL DEFAULT '',
    model_parameters TEXT NULL,

    provided_usage_details JSON NULL,
    usage_details JSON NULL,
    provided_cost_details JSON NULL,
    cost_details JSON NULL,
    usage_pricing_tier_id VARCHAR(255) NULL,
    usage_pricing_tier_name VARCHAR(255) NULL,

    tool_definitions JSON NULL,
    tool_calls JSON NULL,
    tool_call_names JSON NULL,

    input LONGTEXT NULL,
    output LONGTEXT NULL,

    metadata JSON NULL,
    metadata_names JSON NULL,
    metadata_raw_values JSON NULL,

    experiment_id VARCHAR(255) NOT NULL DEFAULT '',
    experiment_name VARCHAR(255) NOT NULL DEFAULT '',
    experiment_metadata_names JSON NULL,
    experiment_metadata_values JSON NULL,
    experiment_description TEXT NULL,
    experiment_dataset_id VARCHAR(255) NOT NULL DEFAULT '',
    experiment_item_id VARCHAR(255) NOT NULL DEFAULT '',
    experiment_item_version DATETIME(6) NULL,
    experiment_item_expected_output LONGTEXT NULL,
    experiment_item_metadata_names JSON NULL,
    experiment_item_metadata_values JSON NULL,
    experiment_item_root_span_id VARCHAR(255) NOT NULL DEFAULT '',

    source VARCHAR(50) NOT NULL DEFAULT '',
    service_name VARCHAR(255) NOT NULL DEFAULT '',
    service_version VARCHAR(255) NOT NULL DEFAULT '',
    scope_name VARCHAR(255) NOT NULL DEFAULT '',
    scope_version VARCHAR(255) NOT NULL DEFAULT '',
    telemetry_sdk_language VARCHAR(50) NOT NULL DEFAULT '',
    telemetry_sdk_name VARCHAR(255) NOT NULL DEFAULT '',
    telemetry_sdk_version VARCHAR(255) NOT NULL DEFAULT '',

    blob_storage_file_path VARCHAR(1024) NOT NULL DEFAULT '',
    event_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    event_ts DATETIME(6) NOT NULL,
    is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (project_id, start_time, trace_id, span_id, event_ts),

    INDEX idx_events_span_id (span_id),
    INDEX idx_events_trace_id (trace_id),
    INDEX idx_events_type (type),
    INDEX idx_events_created_at (created_at),
    INDEX idx_events_updated_at (updated_at),
    INDEX idx_events_session_id (session_id),
    INDEX idx_events_user_id (user_id),
    INDEX idx_events_name (name),
    INDEX idx_events_level (level),
    INDEX idx_events_prompt_name (prompt_name),
    INDEX idx_events_provided_model_name (provided_model_name),
    INDEX idx_events_environment (environment),
    INDEX idx_events_is_deleted (is_deleted),
    INDEX idx_events_event_ts (event_ts),
    INDEX idx_events_project_start_time (project_id, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(start_time)) (
    PARTITION p202401 VALUES LESS THAN (TO_DAYS('2024-02-01')),
    PARTITION p202402 VALUES LESS THAN (TO_DAYS('2024-03-01')),
    PARTITION p202403 VALUES LESS THAN (TO_DAYS('2024-04-01')),
    PARTITION p202404 VALUES LESS THAN (TO_DAYS('2024-05-01')),
    PARTITION p202405 VALUES LESS THAN (TO_DAYS('2024-06-01')),
    PARTITION p202406 VALUES LESS THAN (TO_DAYS('2024-07-01')),
    PARTITION p202407 VALUES LESS THAN (TO_DAYS('2024-08-01')),
    PARTITION p202408 VALUES LESS THAN (TO_DAYS('2024-09-01')),
    PARTITION p202409 VALUES LESS THAN (TO_DAYS('2024-10-01')),
    PARTITION p202410 VALUES LESS THAN (TO_DAYS('2024-11-01')),
    PARTITION p202411 VALUES LESS THAN (TO_DAYS('2024-12-01')),
    PARTITION p202412 VALUES LESS THAN (TO_DAYS('2025-01-01')),
    PARTITION pmax VALUES LESS THAN MAXVALUE
)
`;

/**
 * Backfill events from observations (joined with traces).
 * OB equivalent of the ClickHouse INSERT INTO events SELECT FROM observations FINAL LEFT JOIN traces.
 * Uses ROW_NUMBER() to simulate ClickHouse FINAL (picks latest event_ts per row).
 */
const BACKFILL_FROM_OBSERVATIONS = `
INSERT INTO events (
    project_id, trace_id, span_id, parent_span_id, start_time, end_time,
    name, type, environment, version, \`release\`, tags, trace_name,
    user_id, session_id, \`public\`, bookmarked, level, status_message,
    completion_start_time, prompt_id, prompt_name, prompt_version,
    model_id, provided_model_name, model_parameters,
    provided_usage_details, usage_details, provided_cost_details, cost_details,
    tool_definitions, tool_calls, tool_call_names,
    input, output,
    metadata, metadata_names, metadata_raw_values,
    source, service_name, service_version, scope_name, scope_version,
    telemetry_sdk_language, telemetry_sdk_name, telemetry_sdk_version,
    blob_storage_file_path, event_bytes,
    created_at, updated_at, event_ts, is_deleted
)
SELECT
    o.project_id,
    o.trace_id,
    o.id                                                        AS span_id,
    IFNULL(o.parent_observation_id, '')                         AS parent_span_id,
    o.start_time,
    o.end_time,
    o.name,
    o.type,
    IFNULL(o.environment, 'default'),
    IFNULL(o.version, ''),
    IFNULL(t.\`release\`, '')                                   AS \`release\`,
    t.tags                                                      AS tags,
    IFNULL(t.name, '')                                          AS trace_name,
    IFNULL(t.user_id, '')                                       AS user_id,
    IFNULL(t.session_id, '')                                    AS session_id,
    IFNULL(t.\`public\`, 0)                                     AS \`public\`,
    CASE WHEN t.bookmarked = 1
         AND (o.parent_observation_id IS NULL OR o.parent_observation_id = '')
         THEN 1 ELSE 0 END                                     AS bookmarked,
    IFNULL(o.level, ''),
    IFNULL(o.status_message, '')                                AS status_message,
    o.completion_start_time,
    IFNULL(o.prompt_id, ''),
    IFNULL(o.prompt_name, ''),
    o.prompt_version,
    IFNULL(o.internal_model_id, '')                             AS model_id,
    IFNULL(o.provided_model_name, ''),
    COALESCE(o.model_parameters, '{}'),
    o.provided_usage_details,
    o.usage_details,
    o.provided_cost_details,
    o.cost_details,
    o.tool_definitions,
    o.tool_calls,
    o.tool_call_names,
    IFNULL(o.input, '')                                         AS input,
    IFNULL(o.output, '')                                        AS output,
    o.metadata,
    CASE WHEN o.metadata IS NOT NULL AND JSON_TYPE(o.metadata) = 'OBJECT'
         THEN JSON_KEYS(o.metadata)
         ELSE JSON_ARRAY() END                                  AS metadata_names,
    JSON_ARRAY()                                                AS metadata_raw_values,
    CASE WHEN o.metadata IS NOT NULL
         AND JSON_CONTAINS_PATH(o.metadata, 'one', '$.resourceAttributes')
         THEN 'otel' ELSE 'ingestion-api' END                  AS source,
    ''                                                          AS service_name,
    ''                                                          AS service_version,
    ''                                                          AS scope_name,
    ''                                                          AS scope_version,
    ''                                                          AS telemetry_sdk_language,
    ''                                                          AS telemetry_sdk_name,
    ''                                                          AS telemetry_sdk_version,
    ''                                                          AS blob_storage_file_path,
    0                                                           AS event_bytes,
    o.created_at,
    o.updated_at,
    o.event_ts,
    o.is_deleted
FROM (
    SELECT obs_inner.*, ROW_NUMBER() OVER (
        PARTITION BY obs_inner.project_id, obs_inner.id
        ORDER BY obs_inner.event_ts DESC
    ) AS rn
    FROM observations obs_inner
    WHERE obs_inner.is_deleted = 0
) o
LEFT JOIN (
    SELECT t_inner.*, ROW_NUMBER() OVER (
        PARTITION BY t_inner.project_id, t_inner.id
        ORDER BY t_inner.event_ts DESC
    ) AS rn
    FROM traces t_inner
    WHERE t_inner.is_deleted = 0
) t ON o.trace_id = t.id AND o.project_id = t.project_id AND t.rn = 1
WHERE o.rn = 1
`;

/**
 * Backfill events from traces (as root spans).
 * OB equivalent of the ClickHouse INSERT INTO events SELECT FROM traces FINAL.
 */
const BACKFILL_FROM_TRACES = `
INSERT INTO events (
    project_id, trace_id, span_id, parent_span_id, start_time,
    name, type, environment, version, \`release\`, tags, trace_name,
    user_id, session_id, \`public\`, bookmarked, level,
    model_parameters, provided_usage_details, usage_details,
    provided_cost_details, cost_details, tool_definitions, tool_calls, tool_call_names,
    input, output,
    metadata, metadata_names, metadata_raw_values,
    source, service_name, service_version, scope_name, scope_version,
    telemetry_sdk_language, telemetry_sdk_name, telemetry_sdk_version,
    blob_storage_file_path, event_bytes,
    created_at, updated_at, event_ts, is_deleted
)
SELECT
    t.project_id,
    t.id,
    t.id                                                        AS span_id,
    ''                                                          AS parent_span_id,
    t.timestamp                                                 AS start_time,
    IFNULL(t.name, ''),
    'SPAN'                                                      AS type,
    IFNULL(t.environment, 'default'),
    IFNULL(t.version, ''),
    IFNULL(t.\`release\`, '')                                   AS \`release\`,
    t.tags                                                      AS tags,
    IFNULL(t.name, '')                                          AS trace_name,
    IFNULL(t.user_id, '')                                       AS user_id,
    IFNULL(t.session_id, '')                                    AS session_id,
    IFNULL(t.\`public\`, 0)                                     AS \`public\`,
    IFNULL(t.bookmarked, 0)                                     AS bookmarked,
    'DEFAULT'                                                   AS level,
    '{}'                                                        AS model_parameters,
    JSON_OBJECT(),
    JSON_OBJECT(),
    JSON_OBJECT(),
    JSON_OBJECT(),
    JSON_OBJECT(),
    JSON_ARRAY(),
    JSON_ARRAY(),
    IFNULL(t.input, '')                                         AS input,
    IFNULL(t.output, '')                                        AS output,
    t.metadata,
    CASE WHEN t.metadata IS NOT NULL AND JSON_TYPE(t.metadata) = 'OBJECT'
         THEN JSON_KEYS(t.metadata)
         ELSE JSON_ARRAY() END                                  AS metadata_names,
    JSON_ARRAY()                                                AS metadata_raw_values,
    CASE WHEN t.metadata IS NOT NULL
         AND JSON_CONTAINS_PATH(t.metadata, 'one', '$.resourceAttributes')
         THEN 'otel' ELSE 'ingestion-api' END                  AS source,
    ''                                                          AS service_name,
    ''                                                          AS service_version,
    ''                                                          AS scope_name,
    ''                                                          AS scope_version,
    ''                                                          AS telemetry_sdk_language,
    ''                                                          AS telemetry_sdk_name,
    ''                                                          AS telemetry_sdk_version,
    ''                                                          AS blob_storage_file_path,
    0                                                           AS event_bytes,
    t.created_at,
    t.updated_at,
    t.event_ts,
    t.is_deleted
FROM (
    SELECT t_inner.*, ROW_NUMBER() OVER (
        PARTITION BY t_inner.project_id, t_inner.id
        ORDER BY t_inner.event_ts DESC
    ) AS rn
    FROM traces t_inner
    WHERE t_inner.is_deleted = 0
) t
WHERE t.rn = 1
`;

async function main() {
  console.log("Creating OceanBase development tables...");
  console.log(`Host: ${OB_HOST}:${OB_PORT}`);
  console.log(`Database: ${OB_DATABASE}`);
  console.log(`User: ${OB_ADMIN_USER}`);
  console.log("");

  const connection = await createConnection();

  try {
    console.log("Creating observations_batch_staging table...");
    await executeSqlWithRetry(
      connection,
      CREATE_OBSERVATIONS_BATCH_STAGING,
      "Create observations_batch_staging",
    );
    console.log("observations_batch_staging created (or already exists).");

    console.log("Creating events table...");
    await executeSqlWithRetry(connection, CREATE_EVENTS, "Create events");
    console.log("events table created (or already exists).");

    console.log("");
    console.log("Populating events table with sample data...");

    console.log("Truncating events table...");
    await executeSqlWithRetry(
      connection,
      "TRUNCATE TABLE events",
      "Truncate events",
    );

    console.log("Backfilling events from observations + traces...");
    const obsResult = await executeSqlWithRetry(
      connection,
      BACKFILL_FROM_OBSERVATIONS,
      "Backfill events from observations",
    );
    const obsRows = obsResult ? obsResult.affectedRows || 0 : 0;
    console.log(`  Inserted ${obsRows} rows from observations.`);

    console.log("Backfilling events from traces (root spans)...");
    const traceResult = await executeSqlWithRetry(
      connection,
      BACKFILL_FROM_TRACES,
      "Backfill events from traces",
    );
    const traceRows = traceResult ? traceResult.affectedRows || 0 : 0;
    console.log(`  Inserted ${traceRows} rows from traces.`);

    console.log("");
    console.log("Development tables created and populated successfully.");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
