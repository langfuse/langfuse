import {
  BaseChunkTodo,
  ChunkedClickhouseBackfillMigration,
  ResolvedChunkedBackfillConfig,
  assertSafePartition,
  loadPartitionsFromClickhouse,
  runBackfillMigrationCli,
} from "./utils/backfillBase";

// Hard-coded UUID identifying the row in background_migrations.
// Must match the Prisma migration that registers this row.
const backgroundMigrationId = "8e1f4a2b-5c63-4d8e-9a47-1b2f3c4d5e6f";

const LOG_PREFIX = "[Backfill Root Spans]";

/**
 * V4 chain step 1: materializes one virtual root span per trace into
 * `events_full`, chunked by yyyymm traces partition. Traces referenced by a
 * dataset run item are skipped — M4 owns those end-to-end.
 */
export default class CreateRootSpansFromTraces extends ChunkedClickhouseBackfillMigration {
  protected readonly migrationId = backgroundMigrationId;
  protected readonly logPrefix = LOG_PREFIX;
  protected readonly requiredTables = [
    "events_full",
    "traces",
    "events_core",
    "events_core_mv",
    "dataset_run_items_rmt",
  ];

  protected async enumerateChunks(
    config: ResolvedChunkedBackfillConfig,
  ): Promise<BaseChunkTodo[]> {
    return loadPartitionsFromClickhouse(
      "traces",
      config.partitions,
      this.logPrefix,
    );
  }

  /**
   * Builds the INSERT that materializes one virtual root span per trace into
   * `events_full`. It
   *   - skips DRI-referenced traces entirely (M4 materializes those traces
   *     end-to-end, root + every observation, with experiment enrichment),
   *   - is scoped to a single yyyymm partition so the scan is bounded.
   *
   * Unmerged duplicate trace rows are copied as-is: each carries its own
   * `event_ts`, so the ReplacingMergeTree semantics of `events_full` collapse
   * them to the latest version.
   */
  protected buildChunkQuery(todo: BaseChunkTodo): {
    query: string;
    params: Record<string, unknown>;
  } {
    assertSafePartition(todo.partition);

    const query = `
      INSERT INTO events_full (
        project_id, trace_id, span_id, parent_span_id, start_time,
        name, type, environment, version, release, tags,
        trace_name, user_id, session_id, public, bookmarked, level,
        model_parameters,
        provided_usage_details, usage_details, provided_cost_details, cost_details,
        tool_definitions, tool_calls, tool_call_names,
        input, output,
        metadata_names, metadata_values,
        source, blob_storage_file_path, event_bytes,
        created_at, updated_at, event_ts, is_deleted
      )
      SELECT
        t.project_id,
        t.id AS trace_id,
        concat('t-', t.id) AS span_id,
        '' AS parent_span_id,
        t.timestamp AS start_time,
        t.name AS name,
        'SPAN' AS type,
        t.environment,
        coalesce(t.version, '') AS version,
        coalesce(t.release, '') AS release,
        t.tags AS tags,
        t.name AS trace_name,
        coalesce(t.user_id, '') AS user_id,
        coalesce(t.session_id, '') AS session_id,
        t.public AS public,
        t.bookmarked AS bookmarked,
        'DEFAULT' AS level,
        '{}' AS model_parameters,
        map() AS provided_usage_details,
        map() AS usage_details,
        map() AS provided_cost_details,
        map() AS cost_details,
        map() AS tool_definitions,
        [] AS tool_calls,
        [] AS tool_call_names,
        coalesce(t.input, '') AS input,
        coalesce(t.output, '') AS output,
        mapKeys(t.metadata) AS metadata_names,
        mapValues(t.metadata) AS metadata_values,
        multiIf(mapContains(t.metadata, 'resourceAttributes'), 'otel-backfill', 'ingestion-api-backfill') AS source,
        '' AS blob_storage_file_path,
        0 AS event_bytes,
        t.created_at,
        t.updated_at,
        t.event_ts,
        t.is_deleted
      FROM traces t
      WHERE t._partition_id = {partition: String}
        -- DRI-referenced traces are materialized end-to-end by M4 (root + every
        -- observation, with experiment enrichment), so M1 skips them to keep
        -- ownership disjoint and avoid plain-vs-enriched root collisions. Relies
        -- on the same per-project co-location as the rest of the chain.
        AND (t.project_id, t.id) NOT IN (
          SELECT project_id, trace_id FROM dataset_run_items_rmt
        )
      SETTINGS
        type_json_skip_duplicated_paths = 1
    `;

    return {
      query,
      params: { partition: todo.partition },
    };
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
  runBackfillMigrationCli(() => new CreateRootSpansFromTraces(), {
    logPrefix: LOG_PREFIX,
  });
}
