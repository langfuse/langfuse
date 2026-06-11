import {
  commandClickhouse,
  logger,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  BaseChunkTodo,
  ChunkedBackfillState,
  ChunkedClickhouseBackfillMigration,
  ResolvedChunkedBackfillConfig,
  assertSafePartition,
  loadPartitionsFromClickhouse,
  runBackfillMigrationCli,
} from "./utils/backfillBase";

// Hard-coded UUID identifying the row in background_migrations.
// Must match the Prisma migration that registers this row.
const backgroundMigrationId = "9c2d5a4f-7b8e-4f6a-a91c-3e5d7f8a2b1c";

const LOG_PREFIX = "[Backfill PidTid Sorting]";

// ============================================================================
// Cluster-aware DDL helpers
// ============================================================================

/**
 * Returns `ON CLUSTER <name>` when running against a clustered ClickHouse
 * deployment, an empty string otherwise. Self-hosters typically run a single
 * node and rely on `ReplacingMergeTree` instead of the replicated variant.
 */
function onClusterClause(): string {
  if (env.CLICKHOUSE_CLUSTER_ENABLED === "true") {
    return `ON CLUSTER ${env.CLICKHOUSE_CLUSTER_NAME}`;
  }
  return "";
}

/**
 * Returns the engine clause for the scratch table. We use the replicated
 * variant only on clusters; single-node deployments use the unreplicated
 * engine, mirroring the production CH migrations under
 * `packages/shared/clickhouse/migrations/{clustered,unclustered}/`.
 */
function replacingMergeTreeEngine(): string {
  if (env.CLICKHOUSE_CLUSTER_ENABLED === "true") {
    return "ReplicatedReplacingMergeTree(event_ts, is_deleted)";
  }
  return "ReplacingMergeTree(event_ts, is_deleted)";
}

/**
 * V4 chain step 2: copies `observations` into the
 * `observations_pid_tid_sorting` scratch table whose sort key is reordered to
 * `(project_id, trace_id, id)`, chunked by yyyymm observations partition.
 *
 * Intentionally has no predecessor guard: the rewrite has no data dependency
 * on M1 (createRootSpansFromTraces) and may run even if M1 failed.
 */
export default class RewriteObservationsToPidTidSorting extends ChunkedClickhouseBackfillMigration {
  protected readonly migrationId = backgroundMigrationId;
  protected readonly logPrefix = LOG_PREFIX;
  protected readonly requiredTables = ["observations"];

  // ==========================================================================
  // Lazy DDL: scratch table
  // ==========================================================================

  /**
   * Lazy-create the scratch table so it does not pollute fresh installs.
   */
  protected async afterTablesValidated(): Promise<void> {
    await this.ensureScratchTable();
  }

  /**
   * Creates `observations_pid_tid_sorting` if it does not exist. The schema
   * mirrors `observations` (all columns through migration 0033) but the
   * sort key is reordered to `(project_id, trace_id, id)` so M3 can perform
   * a merge-sort join against this table without an explicit re-sort.
   *
   * Engine selection is cluster-aware so single-node self-hoster deployments
   * use `ReplacingMergeTree` instead of the replicated variant.
   */
  private async ensureScratchTable(): Promise<void> {
    const ddl = `
      CREATE TABLE IF NOT EXISTS observations_pid_tid_sorting ${onClusterClause()} (
        \`id\` String,
        \`trace_id\` String,
        \`project_id\` String,
        \`environment\` LowCardinality(String) DEFAULT 'default',
        \`type\` LowCardinality(String),
        \`parent_observation_id\` Nullable(String),
        \`start_time\` DateTime64(3),
        \`end_time\` Nullable(DateTime64(3)),
        \`name\` String,
        \`metadata\` Map(LowCardinality(String), String),
        \`level\` LowCardinality(String),
        \`status_message\` Nullable(String),
        \`version\` Nullable(String),
        \`input\` Nullable(String) CODEC(ZSTD(3)),
        \`output\` Nullable(String) CODEC(ZSTD(3)),
        \`provided_model_name\` Nullable(String),
        \`internal_model_id\` Nullable(String),
        \`model_parameters\` Nullable(String),
        \`provided_usage_details\` Map(LowCardinality(String), UInt64),
        \`usage_details\` Map(LowCardinality(String), UInt64),
        \`provided_cost_details\` Map(LowCardinality(String), Decimal64(12)),
        \`cost_details\` Map(LowCardinality(String), Decimal64(12)),
        \`total_cost\` Nullable(Decimal64(12)),
        \`completion_start_time\` Nullable(DateTime64(3)),
        \`prompt_id\` Nullable(String),
        \`prompt_name\` Nullable(String),
        \`prompt_version\` Nullable(UInt16),
        \`usage_pricing_tier_id\` Nullable(String),
        \`usage_pricing_tier_name\` Nullable(String),
        \`tool_definitions\` Map(String, String) DEFAULT map(),
        \`tool_calls\` Array(String) DEFAULT [],
        \`tool_call_names\` Array(String) DEFAULT [],
        \`created_at\` DateTime64(3) DEFAULT now(),
        \`updated_at\` DateTime64(3) DEFAULT now(),
        event_ts DateTime64(3),
        is_deleted UInt8,
        INDEX idx_id id TYPE bloom_filter() GRANULARITY 1,
        INDEX idx_project_id project_id TYPE bloom_filter() GRANULARITY 1
      ) ENGINE = ${replacingMergeTreeEngine()}
      PARTITION BY toYYYYMM(start_time)
      PRIMARY KEY (project_id, trace_id)
      ORDER BY (project_id, trace_id, id)
    `;

    logger.info(
      `${this.logPrefix} Ensuring observations_pid_tid_sorting exists`,
    );

    await commandClickhouse({
      query: ddl,
      tags: {
        feature: "background-migration",
        operation: "ensureScratchTable",
      },
    });
  }

  // ==========================================================================
  // Merge control
  // ==========================================================================

  /**
   * Returns the engine name ClickHouse actually picked for the scratch table.
   * On ClickHouse Cloud the engine is silently rewritten to a `Shared*` variant
   * (e.g. `SharedReplacingMergeTree`) regardless of what the DDL requested, so
   * inspecting `system.tables` is the most reliable way to tell whether we're
   * talking to a SharedMergeTree-based deployment.
   */
  private async detectScratchTableEngine(): Promise<string> {
    const rows = await queryClickhouse<{ engine: string }>({
      query: `
        SELECT engine
        FROM system.tables
        WHERE database = currentDatabase()
          AND name = 'observations_pid_tid_sorting'
      `,
      tags: {
        feature: "background-migration",
        operation: "detectScratchTableEngine",
      },
    });
    return rows[0]?.engine ?? "";
  }

  private async stopMergesOnScratchTable(): Promise<void> {
    const engine = await this.detectScratchTableEngine();
    const isSharedMergeTree = engine.startsWith("Shared");

    logger.info(
      `${this.logPrefix} Stopping merges on observations_pid_tid_sorting (engine=${engine || "unknown"})`,
    );

    if (isSharedMergeTree) {
      // ClickHouse Cloud (SharedMergeTree) does not support `SYSTEM STOP MERGES`.
      // The documented equivalent is the per-table setting below, which is
      // assignment-scoped and persists until explicitly reset.
      await commandClickhouse({
        query: `ALTER TABLE observations_pid_tid_sorting MODIFY SETTING shared_merge_tree_disable_merges_and_mutations_assignment = 1`,
        tags: {
          feature: "background-migration",
          operation: "stopMerges",
        },
      });
    } else {
      await commandClickhouse({
        query: `SYSTEM STOP MERGES ${onClusterClause()} observations_pid_tid_sorting`,
        tags: {
          feature: "background-migration",
          operation: "stopMerges",
        },
      });
    }
  }

  // ==========================================================================
  // Chunk enumeration and query building
  // ==========================================================================

  protected async enumerateChunks(
    config: ResolvedChunkedBackfillConfig,
  ): Promise<BaseChunkTodo[]> {
    return loadPartitionsFromClickhouse(
      "observations",
      config.partitions,
      this.logPrefix,
    );
  }

  /**
   * Builds the INSERT that copies one yyyymm partition of `observations` into
   * `observations_pid_tid_sorting`. Columns are enumerated explicitly in the
   * same order on both sides to avoid surprises when CH adds new columns.
   */
  protected buildChunkQuery(todo: BaseChunkTodo): {
    query: string;
    params: Record<string, unknown>;
  } {
    assertSafePartition(todo.partition);

    const query = `
      INSERT INTO observations_pid_tid_sorting (
        id, trace_id, project_id, environment, type, parent_observation_id,
        start_time, end_time, name, metadata, level, status_message, version,
        input, output,
        provided_model_name, internal_model_id, model_parameters,
        provided_usage_details, usage_details, provided_cost_details, cost_details,
        total_cost, completion_start_time,
        prompt_id, prompt_name, prompt_version,
        usage_pricing_tier_id, usage_pricing_tier_name,
        tool_definitions, tool_calls, tool_call_names,
        created_at, updated_at, event_ts, is_deleted
      )
      SELECT
        id, trace_id, project_id, environment, type, parent_observation_id,
        start_time, end_time, name, metadata, level, status_message, version,
        input, output,
        provided_model_name, internal_model_id, model_parameters,
        provided_usage_details, usage_details, provided_cost_details, cost_details,
        total_cost, completion_start_time,
        prompt_id, prompt_name, prompt_version,
        usage_pricing_tier_id, usage_pricing_tier_name,
        tool_definitions, tool_calls, tool_call_names,
        created_at, updated_at, event_ts, is_deleted
      FROM observations
      WHERE _partition_id = {partition: String}
      SETTINGS
        type_json_skip_duplicated_paths = 1
    `;

    return {
      query,
      params: { partition: todo.partition },
    };
  }

  // ==========================================================================
  // Completion hooks
  // ==========================================================================

  /**
   * Stop merges now that the backfill is done. The subsequent migration step
   * depends on the post-backfill part layout staying frozen and owns
   * re-enabling (or replacing the table entirely).
   */
  protected async onBackfillSucceeded(
    _state: ChunkedBackfillState<BaseChunkTodo>,
  ): Promise<void> {
    await this.stopMergesOnScratchTable();
    logger.info(
      `${this.logPrefix} Stopped merges on observations_pid_tid_sorting for downstream processing`,
    );
  }

  /**
   * Backfill is incomplete. Leave merges running so a later re-run with
   * --retry-failed can insert into a table whose parts still merge; freezing a
   * partially populated table would let retried inserts pile up as unmerged
   * parts (part explosion) until M5 drops it.
   */
  protected async onBackfillFailed(
    state: ChunkedBackfillState<BaseChunkTodo>,
  ): Promise<void> {
    const failed = state.todos.filter((t) => t.status === "failed").length;
    logger.error(
      `${this.logPrefix} Migration completed with ${failed} failed chunks; leaving merges enabled on observations_pid_tid_sorting for --retry-failed`,
    );
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
  runBackfillMigrationCli(() => new RewriteObservationsToPidTidSorting(), {
    logPrefix: LOG_PREFIX,
  });
}
