import { commandClickhouse, logger } from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  BaseChunkTodo,
  ChunkedBackfillState,
  ChunkedClickhouseBackfillMigration,
  ResolvedChunkedBackfillConfig,
  assertSafePartition,
  detectTableEngine,
  loadPartitionsFromClickhouse,
  onClusterClause,
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
 * Returns the engine clause for the scratch table. We use the replicated
 * variant only on clusters; single-node deployments use the unreplicated
 * engine.
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
   * mirrors `observations` but the
   * sort key is reordered to `(project_id, trace_id, id)` so M3 can perform
   * a merge-sort join against this table without an explicit re-sort.
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
        is_deleted UInt8
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
        surface: "worker",
        route: "background-migration.ensureScratchTable",
      },
    });
  }

  // ==========================================================================
  // Merge control
  // ==========================================================================

  private async stopMergesOnScratchTable(): Promise<void> {
    const engine = await detectTableEngine("observations_pid_tid_sorting");
    const isSharedMergeTree = engine.startsWith("Shared");
    const isReplicatedMergeTree = engine.startsWith("Replicated");

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
          surface: "worker",
          route: "background-migration.stopMerges",
        },
      });
    } else {
      // Self-hosted MergeTree. `SYSTEM STOP MERGES` takes an in-memory action
      // lock (held by the ActionLocksManager) that is *not* persisted: it is
      // reset on server restart, so on its own it is not a durable freeze
      // across the M2 -> M3 gap.
      await commandClickhouse({
        query: `SYSTEM STOP MERGES ${onClusterClause()} observations_pid_tid_sorting`,
        tags: {
          surface: "worker",
          route: "background-migration.stopMerges",
        },
      });

      // For the replicated engine, persist the freeze in table metadata on top
      // of the in-memory lock so it survives restarts and holds on every
      // replica: stop enqueuing new merges (`max_replicated_merges_in_queue=0`)
      // and stop any replica from executing a merge locally
      // (`always_fetch_merged_part=1`).
      // See https://github.com/ClickHouse/ClickHouse/issues/22830.
      if (isReplicatedMergeTree) {
        await commandClickhouse({
          query: `ALTER TABLE observations_pid_tid_sorting ${onClusterClause()} MODIFY SETTING max_replicated_merges_in_queue = 0, always_fetch_merged_part = 1`,
          tags: {
            surface: "worker",
            route: "background-migration.stopMerges",
          },
        });
      }
    }
  }

  /**
   * Drives every replica to drain its replication queue so each node's
   * `system.parts` reflects the full, post-backfill part set before M3 reads
   * it. This is the convergence half of the pair: the freeze above keeps the
   * layout from drifting, and this makes every node actually current.
   *
   * Only meaningful on the replicated engine — a single-node plain MergeTree
   * has nothing to sync (and `SYSTEM SYNC REPLICA` errors on it), and
   * Cloud/SharedMergeTree keeps part metadata centrally consistent already.
   * `STRICT` waits for the queue to fully empty so a merge that committed just
   * before the freeze is propagated everywhere. `ON CLUSTER` fans the sync to
   * every node, and the default `distributed_ddl_output_mode='throw'` surfaces
   * an unreachable replica as a hard failure — which keeps M2 unfinished (and
   * therefore blocks M3) until the cluster converges, instead of advancing on
   * a half-synced cluster.
   */
  private async syncReplicasOnScratchTable(): Promise<void> {
    const engine = await detectTableEngine("observations_pid_tid_sorting");
    if (!engine.startsWith("Replicated")) {
      logger.info(
        `${this.logPrefix} Skipping SYSTEM SYNC REPLICA (engine=${engine || "unknown"} is not replicated)`,
      );
      return;
    }

    logger.info(
      `${this.logPrefix} Syncing all replicas of observations_pid_tid_sorting`,
    );
    await commandClickhouse({
      query: `SYSTEM SYNC REPLICA ${onClusterClause()} observations_pid_tid_sorting STRICT`,
      tags: {
        surface: "worker",
        route: "background-migration.syncReplica",
      },
    });
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
   * Finalize the scratch table for downstream processing: freeze its part
   * layout, then converge every replica onto that frozen layout. M3 depends on
   * the post-backfill parts staying frozen and identical across replicas; it
   * owns re-enabling merges (or replacing the table entirely). Syncing here
   * gates the chain — a throw leaves M2 unfinished and M3 blocked until the
   * cluster converges, rather than advancing on a half-synced cluster.
   */
  protected async onBackfillSucceeded(
    _state: ChunkedBackfillState<BaseChunkTodo>,
  ): Promise<void> {
    await this.stopMergesOnScratchTable();
    await this.syncReplicasOnScratchTable();
    logger.info(
      `${this.logPrefix} Froze and synced observations_pid_tid_sorting for downstream processing`,
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
