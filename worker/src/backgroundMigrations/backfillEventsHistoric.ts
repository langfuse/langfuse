import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  commandClickhouse,
  logger,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import { parseArgs } from "node:util";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "d8cf9f5e-747e-4ffe-8156-dec0eaebce9d";

interface PartitionState {
  modulo: number; // Power of 2 (1, 2, 4, 8, ..., maxModulo)
  rowCount: number; // Total rows in partition
  chunksProcessed: number[]; // Array of completed chunk IDs
  lastUpdated: string;
}

interface MigrationState {
  partitions: Record<string, PartitionState>;
  currentPartition: string | null;
  completedPartitions: string[];
}

interface MigrationArgs {
  targetChunkSize?: string; // Default: 20_000_000
  maxModulo?: string; // Default: 512
  batchTimeoutMs?: string; // Default: 7_200_000 (2h)
}

export default class BackfillEventsHistoric implements IBackgroundMigration {
  private isAborted = false;

  /**
   * Calculate the next power of 2 greater than or equal to n
   */
  private nextPowerOf2(n: number): number {
    if (n <= 1) return 1;
    return Math.pow(2, Math.ceil(Math.log2(n)));
  }

  /**
   * Calculate optimal modulo value based on row count and target chunk size.
   * Returns a power of 2 between 1 and maxModulo.
   */
  private calculateModulo(
    rowCount: number,
    targetChunkSize: number,
    maxModulo: number,
  ): number {
    if (rowCount === 0) return 1;

    const chunksNeeded = rowCount / targetChunkSize;
    const calculatedModulo = this.nextPowerOf2(Math.ceil(chunksNeeded));

    // Enforce minimum of 1 and maximum of maxModulo
    return Math.min(maxModulo, Math.max(1, calculatedModulo));
  }

  /**
   * Discover all partitions from observations table, ordered newest to oldest
   */
  private async discoverPartitions(): Promise<string[]> {
    logger.info("[Backfill Events] Discovering partitions from observations");

    const result = await queryClickhouse<{ partition: string }>({
      query: `
        SELECT DISTINCT _partition_id AS partition
        FROM observations
        WHERE is_deleted = 0
        ORDER BY partition DESC
      `,
      tags: {
        feature: "background-migration",
        operation: "discoverPartitions",
      },
    });

    const partitions = result.map((r) => r.partition);
    logger.info(
      `[Backfill Events] Discovered ${partitions.length} partitions: ${partitions.join(", ")}`,
    );

    return partitions;
  }

  /**
   * Count rows in a specific partition
   */
  private async countPartitionRows(partition: string): Promise<number> {
    logger.info(`[Backfill Events] Counting rows in partition ${partition}`);

    const result = await queryClickhouse<{ count: string }>({
      query: `
        SELECT count(*) AS count
        FROM observations
        WHERE _partition_id = '${partition}'
          AND is_deleted = 0
      `,
      tags: {
        feature: "background-migration",
        operation: "countPartitionRows",
        partition,
      },
    });

    const count = parseInt(result[0]?.count ?? "0", 10);
    logger.info(
      `[Backfill Events] Partition ${partition} has ${count.toLocaleString()} rows`,
    );

    return count;
  }

  /**
   * Load migration state from database
   */
  private async loadState(): Promise<MigrationState> {
    const migration = await prisma.backgroundMigration.findUnique({
      where: { id: backgroundMigrationId },
      select: { state: true },
    });

    const defaultState: MigrationState = {
      partitions: {},
      currentPartition: null,
      completedPartitions: [],
    };

    if (!migration || !migration.state) {
      return defaultState;
    }

    const state = migration.state as any;

    // Validate and merge with defaults to ensure all required fields exist
    return {
      partitions: state.partitions ?? defaultState.partitions,
      currentPartition: state.currentPartition ?? defaultState.currentPartition,
      completedPartitions:
        state.completedPartitions ?? defaultState.completedPartitions,
    };
  }

  /**
   * Update migration state in database
   */
  private async updateState(state: MigrationState): Promise<void> {
    await prisma.backgroundMigration.update({
      where: { id: backgroundMigrationId },
      data: { state: state as any },
    });
  }

  /**
   * Get the next chunk to process for a partition
   */
  private getNextChunkToProcess(partition: PartitionState): number | null {
    const { modulo, chunksProcessed } = partition;

    for (let i = 0; i < modulo; i++) {
      if (!chunksProcessed.includes(i)) {
        return i;
      }
    }

    return null; // All chunks processed
  }

  /**
   * Process a single chunk for the trace_attrs phase
   */
  private async processTraceAttrsChunk(
    partition: string,
    chunkId: number,
    modulo: number,
    timeoutMs: number,
  ): Promise<void> {
    logger.info(
      `[Backfill Events] Processing trace_attrs for chunk ${chunkId + 1}/${modulo} in partition ${partition}`,
    );

    await commandClickhouse({
      query: `
        INSERT INTO trace_attrs
        SELECT
          t.project_id,
          t.id AS trace_id,
          t.user_id,
          t.session_id,
          mapConcat(
            mapFilter((k,v) -> NOT in(k, ['attributes']), t.metadata),
            if(length(t.tags) > 0, map('trace_tags', toJSONString(t.tags)), map())
          ) AS metadata,
          t.event_ts,
          0 AS is_deleted
        FROM traces t
        WHERE t._partition_id = '${partition}'
          AND (xxHash32(t.id) % ${modulo}) = ${chunkId}
          AND t.is_deleted = 0
          AND (t.user_id is not null OR t.session_id is not null OR length(mapKeys(t.metadata)) > 0 OR length(t.tags) > 0)
      `,
      tags: {
        feature: "background-migration",
        operation: "processTraceAttrsChunk",
        partition,
        chunkId: chunkId.toString(),
      },
      clickhouseConfigs: {
        request_timeout: timeoutMs,
      },
      clickhouseSettings: {
        http_headers_progress_interval_ms: "100000", // 100 seconds - prevent header overflow on long queries
        // max_insert_threads: "4",
        parallel_distributed_insert_select: "2",
        enable_parallel_replicas: 1,
        // max_threads: 4,
        min_insert_block_size_rows: "10048576",
      },
    });

    logger.info(
      `[Backfill Events] Completed trace_attrs for chunk ${chunkId + 1}/${modulo} in partition ${partition}`,
    );
  }

  /**
   * Process a single chunk for the events phase
   */
  private async processEventsChunk(
    partition: string,
    chunkId: number,
    modulo: number,
    timeoutMs: number,
  ): Promise<void> {
    logger.info(
      `[Backfill Events] Processing events for chunk ${chunkId + 1}/${modulo} in partition ${partition}`,
    );

    await commandClickhouse({
      query: `
        INSERT INTO events (
          project_id,
          trace_id,
          span_id,
          parent_span_id,
          start_time,
          end_time,
          name,
          type,
          environment,
          version,
          user_id,
          session_id,
          level,
          status_message,
          completion_start_time,
          prompt_id,
          prompt_name,
          prompt_version,
          model_id,
          provided_model_name,
          model_parameters,
          provided_usage_details,
          usage_details,
          provided_cost_details,
          cost_details,
          total_cost,
          input,
          output,
          -- metadata,
          metadata_names,
          metadata_values,
          source,
          service_name,
          service_version,
          scope_name,
          scope_version,
          telemetry_sdk_language,
          telemetry_sdk_name,
          telemetry_sdk_version,
          blob_storage_file_path,
          event_raw,
          event_bytes,
          created_at,
          updated_at,
          event_ts,
          is_deleted
        )
        SELECT
          o.project_id,
          o.trace_id,
          o.id AS span_id,
          CASE
            WHEN o.id = concat('t-', o.trace_id) THEN ''
            ELSE coalesce(o.parent_observation_id, concat('t-', o.trace_id))
          END AS parent_span_id,
          greatest(o.start_time, toDateTime64('1970-01-01', 3)) AS start_time,
          o.end_time,
          o.name,
          o.type,
          o.environment,
          coalesce(o.version, '') AS version,
          coalesce(t.user_id, '') AS user_id,
          coalesce(t.session_id, '') AS session_id,
          o.level,
          coalesce(o.status_message, '') AS status_message,
          o.completion_start_time,
          o.prompt_id,
          o.prompt_name,
          CAST(o.prompt_version, 'Nullable(String)') AS prompt_version,
          o.internal_model_id AS model_id,
          o.provided_model_name,
          o.model_parameters,
          o.provided_usage_details,
          o.usage_details,
          o.provided_cost_details,
          o.cost_details,
          coalesce(o.total_cost, 0) AS total_cost,
          coalesce(o.input, '') AS input,
          coalesce(o.output, '') AS output,
          -- CAST(mapConcat(o.metadata, coalesce(t.metadata, map())), 'JSON') AS metadata,
          mapKeys(mapConcat(o.metadata, coalesce(t.metadata, map()))) AS metadata_names,
          mapValues(mapConcat(o.metadata, coalesce(t.metadata, map()))) AS metadata_values,
          multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel', 'ingestion-api') AS source,
          NULL AS service_name,
          NULL AS service_version,
          NULL AS scope_name,
          NULL AS scope_version,
          NULL AS telemetry_sdk_language,
          NULL AS telemetry_sdk_name,
          NULL AS telemetry_sdk_version,
          '' AS blob_storage_file_path,
          '' AS event_raw,
          byteSize(*) AS event_bytes,
          o.created_at,
          o.updated_at,
          o.event_ts,
          o.is_deleted
        FROM observations o
        LEFT ANY JOIN trace_attrs t
          ON o.project_id = t.project_id
          AND o.trace_id = t.trace_id
        WHERE o._partition_id = '${partition}'
          AND (xxHash32(o.trace_id) % ${modulo}) = ${chunkId}
          AND o.is_deleted = 0
      `,
      tags: {
        feature: "background-migration",
        operation: "processEventsChunk",
        partition,
        chunkId: chunkId.toString(),
      },
      clickhouseConfigs: {
        request_timeout: timeoutMs,
      },
      clickhouseSettings: {
        http_headers_progress_interval_ms: "100000", // 100 seconds - prevent header overflow on long queries
        min_insert_block_size_rows: "10048576",
        // join_algorithm: "partial_merge",
        min_insert_block_size_bytes: "512Mi",
        parallel_distributed_insert_select: "2",
        enable_parallel_replicas: "1",
        type_json_skip_duplicated_paths: 1,
        // TODO: May need fine-tuning for self-hosters
        allow_experimental_parallel_reading_from_replicas: "1",
        max_parallel_replicas: "2",
      },
    });

    logger.info(
      `[Backfill Events] Completed events for chunk ${chunkId + 1}/${modulo} in partition ${partition}`,
    );
  }

  /**
   * Truncate trace_attrs table after processing a chunk
   */
  private async truncateTraceAttrs(): Promise<void> {
    try {
      await commandClickhouse({
        query: `TRUNCATE TABLE trace_attrs`,
        tags: {
          feature: "background-migration",
          operation: "truncateTraceAttrs",
        },
      });
      logger.debug(`[Backfill Events] Truncated trace_attrs table`);
    } catch (error) {
      logger.error(
        `[Backfill Events] Failed to truncate trace_attrs, continuing anyway`,
        error,
      );
      // Don't fail the migration if truncate fails
    }
  }

  async validate(
    args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    // Ensure the background migration record exists
    // TODO: Remove for golive
    await prisma.backgroundMigration.upsert({
      where: { id: backgroundMigrationId },
      create: {
        id: backgroundMigrationId,
        name: "20251027_backfill_events_historic",
        script: "backfillEventsHistoric",
        args: {},
        state: {},
      },
      update: {},
    });

    // Check if ClickHouse credentials are configured
    if (
      !env.CLICKHOUSE_URL ||
      !env.CLICKHOUSE_USER ||
      !env.CLICKHOUSE_PASSWORD
    ) {
      return {
        valid: false,
        invalidReason:
          "ClickHouse credentials must be configured to perform migration",
      };
    }

    // Check if ClickHouse events table exists
    const tables = await clickhouseClient().query({
      query: "SHOW TABLES",
    });
    const tableNames = (await tables.json()).data as { name: string }[];

    if (!tableNames.some((r) => r.name === "events")) {
      // Retry if the table does not exist as this may mean migrations are still pending
      if (attempts > 0) {
        logger.info(
          `ClickHouse events table does not exist. Retrying in 10s...`,
        );
        return new Promise((resolve) => {
          setTimeout(() => resolve(this.validate(args, attempts - 1)), 10_000);
        });
      }

      return {
        valid: false,
        invalidReason: "ClickHouse events table does not exist",
      };
    }

    // Create trace_attrs table if it doesn't exist
    logger.info("[Backfill Events] Creating trace_attrs table if not exists");

    // TODO: Need to modify the engine for self-hosters or use actual migration logic.
    await commandClickhouse({
      query: `
        CREATE TABLE IF NOT EXISTS trace_attrs (
          project_id String,
          trace_id String,
          user_id String,
          session_id String,
          metadata Map(LowCardinality(String), String),
          event_ts DateTime64(3),
          is_deleted UInt8 DEFAULT 0
        ) ENGINE = ReplacingMergeTree(event_ts, is_deleted)
        ORDER BY (project_id, trace_id)
      `,
      tags: {
        feature: "background-migration",
        operation: "createTraceAttrsTable",
      },
    });

    logger.info("[Backfill Events] trace_attrs table ready");

    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    const migrationArgs = args as MigrationArgs;
    const targetChunkSize = parseInt(
      migrationArgs.targetChunkSize ?? "20_000_000",
    );
    const maxModulo = parseInt(migrationArgs.maxModulo ?? "512");
    const batchTimeoutMs = parseInt(migrationArgs.batchTimeoutMs ?? "7200000");

    logger.info(
      `[Backfill Events] Starting historic event backfill with args: ${JSON.stringify({ targetChunkSize, maxModulo, batchTimeoutMs })}`,
    );

    // Load or initialize state
    let state = await this.loadState();

    // Discover all partitions if this is the first run
    if (Object.keys(state.partitions).length === 0) {
      const partitions = await this.discoverPartitions();

      if (partitions.length === 0) {
        logger.info("[Backfill Events] No partitions found to process");
        return;
      }

      // Initialize state with discovered partitions
      for (const partition of partitions) {
        state.partitions[partition] = {
          modulo: 0, // Will be calculated when processing starts
          rowCount: 0,
          chunksProcessed: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      state.currentPartition = partitions[0]; // Start with newest
      await this.updateState(state);
      logger.info(
        `[Backfill Events] Initialized state with ${partitions.length} partitions`,
      );
    }

    // Main processing loop
    while (!this.isAborted) {
      // Reload state to get latest progress
      state = await this.loadState();

      // Get current partition to process
      const currentPartition = state.currentPartition;

      if (!currentPartition) {
        logger.info(
          "[Backfill Events] All partitions processed. Migration complete!",
        );
        break;
      }

      const partitionState = state.partitions[currentPartition];

      if (!partitionState) {
        logger.error(
          `[Backfill Events] Partition ${currentPartition} not found in state`,
        );
        break;
      }

      // Initialize partition if modulo not calculated yet
      if (partitionState.modulo === 0) {
        const rowCount = await this.countPartitionRows(currentPartition);
        const modulo = this.calculateModulo(
          rowCount,
          targetChunkSize,
          maxModulo,
        );

        partitionState.rowCount = rowCount;
        partitionState.modulo = modulo;
        partitionState.lastUpdated = new Date().toISOString();

        await this.updateState(state);

        logger.info(
          `[Backfill Events] Partition ${currentPartition}: ${rowCount.toLocaleString()} rows → modulo ${modulo} (${modulo} chunks of ~${Math.floor(rowCount / modulo).toLocaleString()} rows each)`,
        );
      }

      // Get next chunk to process
      const nextChunk = this.getNextChunkToProcess(partitionState);

      if (nextChunk === null) {
        // All chunks processed for this partition
        logger.info(
          `[Backfill Events] Partition ${currentPartition}: all chunks complete`,
        );

        // Mark as completed and move to next partition
        if (!state.completedPartitions.includes(currentPartition)) {
          state.completedPartitions.push(currentPartition);
        }

        // Find next partition to process
        const allPartitions = Object.keys(state.partitions).sort().reverse();
        const currentIndex = allPartitions.indexOf(currentPartition);

        state.currentPartition =
          currentIndex < allPartitions.length - 1
            ? allPartitions[currentIndex + 1]
            : null;
        await this.updateState(state);
        continue;
      }

      // Process the chunk: trace_attrs -> events -> truncate
      try {
        // Step 1: Fill trace_attrs for this chunk
        await this.processTraceAttrsChunk(
          currentPartition,
          nextChunk,
          partitionState.modulo,
          batchTimeoutMs,
        );

        // Step 2: Fill events for this chunk (joining with trace_attrs)
        await this.processEventsChunk(
          currentPartition,
          nextChunk,
          partitionState.modulo,
          batchTimeoutMs,
        );

        // Step 3: Truncate trace_attrs to free memory
        await this.truncateTraceAttrs();

        // Mark chunk as completed
        partitionState.chunksProcessed.push(nextChunk);
        partitionState.lastUpdated = new Date().toISOString();
        await this.updateState(state);

        logger.info(
          `[Backfill Events] Partition ${currentPartition}: ${partitionState.chunksProcessed.length}/${partitionState.modulo} chunks complete`,
        );
      } catch (error) {
        logger.error(
          `[Backfill Events] Error processing chunk ${nextChunk} for partition ${currentPartition}`,
          error,
        );
        throw error; // Let the background migration manager handle the error
      }
    }

    if (this.isAborted) {
      logger.info(
        `[Backfill Events] Migration aborted. Can be resumed from current state.`,
      );
      return;
    }

    logger.info(
      `[Backfill Events] Finished historic event backfill in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );
  }

  async abort(): Promise<void> {
    logger.info("[Backfill Events] Aborting historic event backfill");
    this.isAborted = true;
  }
}

async function main() {
  const args = parseArgs({
    options: {
      targetChunkSize: { type: "string", short: "s", default: "20000000" },
      maxModulo: { type: "string", short: "m", default: "512" },
      batchTimeoutMs: {
        type: "string",
        short: "t",
        default: "7200000",
      },
    },
  });

  const migration = new BackfillEventsHistoric();
  await migration.validate(args.values);
  await migration.run(args.values);
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Migration execution failed: ${error}`, error);
      process.exit(1); // Exit with an error code
    });
}
