import { logger, queryClickhouse } from "@langfuse/shared/src/server";
import {
  BaseChunkTodo,
  ChunkedBackfillState,
  ChunkedClickhouseBackfillMigration,
  ResolvedChunkedBackfillConfig,
  assertSafePartition,
  runBackfillMigrationCli,
} from "./utils/backfillBase";

// Hard-coded UUID identifying the row in background_migrations. Must match
// the Prisma migration that registers this row.
const backgroundMigrationId = "7a3f8d6e-2c91-4b5e-8d72-f4a5b6c7d8e9";

const LOG_PREFIX = "[Backfill Events Observations]";

interface PartChunkTodo extends BaseChunkTodo {
  partId: string;
}

/**
 * V4 chain step 3: backfills `events_full` from the
 * `observations_pid_tid_sorting` scratch table (populated by M2), one
 * ClickHouse part per chunk, joining live `traces` for property propagation.
 */
export default class BackfillEventsFullFromObservations extends ChunkedClickhouseBackfillMigration<PartChunkTodo> {
  protected readonly migrationId = backgroundMigrationId;
  protected readonly logPrefix = LOG_PREFIX;
  protected readonly requiredTables = [
    "observations_pid_tid_sorting",
    "traces",
    "events_full",
    "events_core",
  ];
  protected readonly predecessor = {
    id: "9c2d5a4f-7b8e-4f6a-a91c-3e5d7f8a2b1c",
    name: "20260521_v4_step_2_rewrite_observations_to_pid_tid_sorting",
  };

  // ==========================================================================
  // Part discovery
  // ==========================================================================

  /**
   * Enumerates active parts of `observations_pid_tid_sorting` from
   * `system.parts`, newest partition first. One todo per part keeps each
   * INSERT bounded to a single ClickHouse part (single-digit GBs in most
   * cases, capped well below an entire monthly partition), which is the only
   * granularity that's safe to assume self-hoster hardware can chew through
   * without OOM or memory-limit failures.
   *
   * Partition restriction (`--partitions`) is not supported here — chunks are
   * parts, not partitions, and a restricted run would silently leave the
   * remaining parts unprocessed.
   *
   * Excludes meta partitions that aren't yyyymm data ranges:
   *   - `all`        — appears on tables without a PARTITION BY clause.
   *   - `patch-%`    — used by patch tables for ad hoc corrections.
   */
  protected async enumerateChunks(
    _config: ResolvedChunkedBackfillConfig,
  ): Promise<PartChunkTodo[]> {
    logger.info(`${this.logPrefix} Discovering parts from system.parts`);

    const parts = await queryClickhouse<{
      partition_id: string;
      name: string;
    }>({
      query: `
        SELECT partition_id, name
        FROM system.parts
        WHERE table = 'observations_pid_tid_sorting'
          AND database = currentDatabase()
          AND active = 1
          AND partition_id NOT LIKE 'patch-%'
          AND partition_id != 'all'
        ORDER BY partition_id DESC, name
      `,
      tags: {
        feature: "background-migration",
        operation: "loadPartsFromClickhouse",
      },
    });

    logger.info(
      `${this.logPrefix} Loaded ${parts.length} parts from system.parts`,
    );

    return parts.map((part) => ({
      id: part.name,
      partId: part.name,
      partition: part.partition_id,
      status: "pending" as const,
    }));
  }

  private async getActivePartIds(): Promise<Set<string>> {
    const parts = await queryClickhouse<{ name: string }>({
      query: `
        SELECT name
        FROM system.parts
        WHERE table = 'observations_pid_tid_sorting'
          AND database = currentDatabase()
          AND active = 1
      `,
      tags: {
        feature: "background-migration",
        operation: "getActivePartIds",
      },
    });
    return new Set(parts.map((p) => p.name));
  }

  // ==========================================================================
  // Query building
  // ==========================================================================

  /**
   * Builds the per-part INSERT into events_full.
   *
   * To keep the join scan small, we bound `traces` by a `timestamp` window aligned with the observation
   * partition's month. This may produce some observation on the month boundary that do not have full
   * propagation. Light trace property propagation only —
   * `trace.metadata` is intentionally excluded; the observation's metadata is
   * used as-is.
   */
  protected buildChunkQuery(todo: PartChunkTodo): {
    query: string;
    params: Record<string, unknown>;
  } {
    assertSafePartition(todo.partition);

    // The traces subquery dedupes to the latest row per (project_id, id):
    // traces is a ReplacingMergeTree, so unmerged duplicate versions co-exist
    // between background merges and ANY-join strictness would pick an
    // arbitrary one. Unlike M1 (which copies every version with its own
    // event_ts and lets events_full's replacing key collapse them), a stale
    // pick here is baked into the observation row and never repaired.
    //
    // `bookmarked` is only propagated to root spans (observations without a
    // parent); child spans always get false.
    const query = `
      INSERT INTO events_full (
        project_id, trace_id, span_id, parent_span_id, start_time, end_time,
        name, type, environment, version, release, tags, public, bookmarked,
        trace_name, user_id, session_id, level, status_message, completion_start_time,
        prompt_id, prompt_name, prompt_version, model_id, provided_model_name,
        model_parameters, provided_usage_details, usage_details,
        provided_cost_details, cost_details, tool_definitions, tool_calls, tool_call_names,
        usage_pricing_tier_id, usage_pricing_tier_name,
        input, output,
        metadata_names, metadata_values, source,
        blob_storage_file_path, event_bytes, created_at, updated_at, event_ts, is_deleted
      )
      SELECT
        o.project_id,
        o.trace_id,
        o.id AS span_id,
        if(o.id = o.trace_id, NULL, coalesce(o.parent_observation_id, concat('t-', o.trace_id))) AS parent_span_id,
        o.start_time AS start_time,
        o.end_time,
        o.name,
        o.type,
        o.environment,
        coalesce(o.version, t.version) as version,
        coalesce(t.release, '') as release,
        t.tags as tags,
        t.public as public,
        t.bookmarked AND (o.parent_observation_id IS NULL OR o.parent_observation_id = '') AS bookmarked,
        coalesce(t.name, '') AS trace_name,
        coalesce(t.user_id, '') AS user_id,
        coalesce(t.session_id, '') AS session_id,
        o.level,
        coalesce(o.status_message, '') AS status_message,
        o.completion_start_time,
        o.prompt_id,
        o.prompt_name,
        o.prompt_version,
        o.internal_model_id AS model_id,
        o.provided_model_name,
        coalesce(o.model_parameters, '{}') AS model_parameters,
        o.provided_usage_details,
        o.usage_details,
        o.provided_cost_details,
        o.cost_details,
        o.tool_definitions,
        o.tool_calls,
        o.tool_call_names,
        o.usage_pricing_tier_id,
        o.usage_pricing_tier_name,
        coalesce(o.input, '') AS input,
        coalesce(o.output, '') AS output,
        mapKeys(o.metadata) AS metadata_names,
        mapValues(o.metadata) AS metadata_values,
        multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel-backfill', 'ingestion-api-backfill') AS source,
        '' AS blob_storage_file_path,
        0 AS event_bytes,
        o.created_at,
        o.updated_at,
        o.event_ts,
        o.is_deleted
      FROM observations_pid_tid_sorting o
      LEFT ANY JOIN (
        SELECT project_id, id, version, release, tags, public, bookmarked, name, user_id, session_id
        FROM traces t
        WHERE t._partition_id = {partition: String}
        ORDER BY event_ts DESC
        LIMIT 1 BY project_id, id
      ) t
      ON o.project_id = t.project_id AND o.trace_id = t.id
      WHERE o._partition_id = {partition: String}
        AND o._part = {partId: String}
      SETTINGS
        join_algorithm = 'full_sorting_merge',
        type_json_skip_duplicated_paths = 1
    `;

    return {
      query,
      params: {
        partition: todo.partition,
        partId: todo.partId,
      },
    };
  }

  // ==========================================================================
  // Part-integrity verification
  // ==========================================================================

  /**
   * Confirms a part is still active after its INSERT completed. ClickHouse
   * merges parts in the background; if our source part disappeared between
   * listing and processing, the INSERT may have read 0 rows and the merged
   * successor part is not in this run's todo list. Returning the error halts
   * the migration so the operator can clear `state.chunksLoaded` (or wipe
   * state) and re-run so the merged successor gets enumerated and processed.
   */
  protected async verifyCompletedChunk(
    todo: PartChunkTodo,
  ): Promise<string | null> {
    const result = await queryClickhouse<{ count: string }>({
      query: `
        SELECT count() AS count
        FROM system.parts
        WHERE table = 'observations_pid_tid_sorting'
          AND database = currentDatabase()
          AND name = {partId: String}
          AND active = 1
      `,
      params: { partId: todo.partId },
      tags: {
        feature: "background-migration",
        operation: "verifyPartStillActive",
      },
    });
    const partStillActive =
      result.length > 0 && parseInt(result[0].count, 10) > 0;
    if (partStillActive) return null;

    return (
      `Part ${todo.partId} no longer active after processing — its rows are in a ` +
      `merged successor part that is not in this run's todo list. Clear failedAt ` +
      `and re-run with state.chunksLoaded=false to enumerate the merged successor.`
    );
  }

  /**
   * Final verification: confirm every completed part is still active. If a
   * part merged into a larger successor that wasn't in our todo list, the
   * successor's rows were never inserted — surface this so the operator
   * knows to clear state.chunksLoaded and re-run.
   */
  protected async onBackfillSucceeded(
    state: ChunkedBackfillState<PartChunkTodo>,
  ): Promise<void> {
    const completedTodos = state.todos.filter((t) => t.status === "completed");
    if (completedTodos.length === 0) return;

    logger.info(
      `${this.logPrefix} Running final verification for ${completedTodos.length} completed parts...`,
    );
    const activePartIds = await this.getActivePartIds();
    const missingParts = completedTodos.filter(
      (t) => !activePartIds.has(t.partId),
    );
    if (missingParts.length > 0) {
      const sample = missingParts
        .slice(0, 10)
        .map((p) => p.partId)
        .join(", ");
      const tail =
        missingParts.length > 10
          ? ` (and ${missingParts.length - 10} more)`
          : "";
      logger.error(
        `${this.logPrefix} CRITICAL: ${missingParts.length} processed parts are no longer active. ` +
          `Their merged successors are not in this run's todo list. ` +
          `Re-run with state.chunksLoaded=false to enumerate and process them. Sample: ${sample}${tail}`,
      );
      throw new Error(
        `Migration completed but ${missingParts.length} parts are no longer active — re-run with state.chunksLoaded=false`,
      );
    }
    logger.info(
      `${this.logPrefix} Final verification passed — all ${completedTodos.length} parts still active`,
    );
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
  runBackfillMigrationCli(() => new BackfillEventsFullFromObservations(), {
    logPrefix: LOG_PREFIX,
    includePartitions: false,
  });
}
