import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  logger,
  queryClickhouse,
  clickhouseClient,
  convertDateToClickhouseDateTime,
} from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import {
  getRelevantObservations,
  getRelevantTraces,
  buildSpanMaps,
  enrichSpansWithExperiment,
  findAllChildren,
  type DatasetRunItem,
  type SpanRecord,
  type EnrichedSpan,
  type TraceProperties,
} from "../features/eventPropagation/handleExperimentBackfill";
import { IngestionService } from "../services/IngestionService";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { redis } from "@langfuse/shared/src/server";

// This ID would need to be registered in the background_migrations table
const backgroundMigrationId = "backfill-historic-dataset-run-items";

interface MigrationState {
  cutoffDate: string; // Upper bound - process items before this date
  lastCreatedAt: string; // Pagination cursor - last processed created_at
  lastId: string; // Secondary cursor for handling ties in created_at
  processedItems: number; // Total dataset run items processed
  processedTraces: number; // Unique traces enriched
  skippedTraces: number; // Traces that failed enrichment
  lastUpdated: string; // Timestamp of last state update
}

/**
 * Background migration to backfill historic dataset_run_item_rmt records.
 *
 * This migration applies the same enrichment logic as handleExperimentBackfill
 * to historic traces and observations that were recorded before the dual write
 * was fully operational.
 *
 * Key features:
 * - Processes data in batches for stability and resumability
 * - Time-based pagination with deterministic ordering (created_at ASC, id ASC)
 * - Reuses enrichment logic from handleExperimentBackfill
 * - Skips and logs individual trace failures rather than failing the entire batch
 * - Stores progress in Postgres for resumability after crashes
 *
 * Configuration:
 * - cutoffDate: Process items created before this date (required)
 * - batchSize: Number of dataset_run_items per batch (default: 1000)
 * - minDate: Optional start date for partial reruns
 * - maxRowsToProcess: Optional limit for testing (default: Infinity)
 */
export default class BackfillHistoricDatasetRunItems
  implements IBackgroundMigration
{
  private isAborted = false;
  private isFinished = false;

  async validate(
    args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
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

    // Check if required dependencies are available
    if (!redis) {
      return {
        valid: false,
        invalidReason: "Redis must be available for IngestionService",
      };
    }

    if (!prisma) {
      return {
        valid: false,
        invalidReason:
          "Prisma must be available for migration state management",
      };
    }

    // Validate cutoffDate parameter
    if (!args.cutoffDate || typeof args.cutoffDate !== "string") {
      return {
        valid: false,
        invalidReason:
          "cutoffDate parameter is required and must be an ISO 8601 date string",
      };
    }

    try {
      new Date(args.cutoffDate as string);
    } catch {
      return {
        valid: false,
        invalidReason: "cutoffDate must be a valid ISO 8601 date string",
      };
    }

    // Check if ClickHouse tables exist
    const tables = await clickhouseClient().query({
      query: "SHOW TABLES",
    });
    const tableNames = (await tables.json()).data as { name: string }[];

    if (!tableNames.some((r) => r.name === "dataset_run_items_rmt")) {
      // Retry if the table does not exist as this may mean migrations are still pending
      if (attempts > 0) {
        logger.info(
          `ClickHouse dataset_run_items_rmt table does not exist. Retrying in 10s...`,
        );
        return new Promise((resolve) => {
          setTimeout(() => resolve(this.validate(args, attempts - 1)), 10_000);
        });
      }

      return {
        valid: false,
        invalidReason: "ClickHouse dataset_run_items_rmt table does not exist",
      };
    }

    if (!tableNames.some((r) => r.name === "events")) {
      return {
        valid: false,
        invalidReason: "ClickHouse events table does not exist",
      };
    }

    if (!tableNames.some((r) => r.name === "observations")) {
      return {
        valid: false,
        invalidReason: "ClickHouse observations table does not exist",
      };
    }

    if (!tableNames.some((r) => r.name === "traces")) {
      return {
        valid: false,
        invalidReason: "ClickHouse traces table does not exist",
      };
    }

    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    logger.info(
      `[BACKFILL HISTORIC DRI] Starting backfill with args: ${JSON.stringify(args)}`,
    );

    // Parse configuration from args
    const cutoffDate = new Date(args.cutoffDate as string);
    const batchSize = Number(args.batchSize ?? 1000);
    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const minDate = args.minDate
      ? new Date(args.minDate as string)
      : new Date(0); // Epoch start if not specified

    // Initialize or restore state
    const state = await this.initializeState(
      backgroundMigrationId,
      cutoffDate,
      minDate,
    );

    logger.info(
      `[BACKFILL HISTORIC DRI] Initialized state: ${JSON.stringify(state)}`,
    );

    let totalProcessedItems = state.processedItems;
    let totalProcessedTraces = state.processedTraces;
    let totalSkippedTraces = state.skippedTraces;

    // Main processing loop
    while (
      !this.isAborted &&
      !this.isFinished &&
      totalProcessedItems < maxRowsToProcess
    ) {
      const batchStart = Date.now();

      try {
        // Fetch batch of dataset run items
        const datasetRunItems = await this.fetchDatasetRunItemBatch(
          state.lastCreatedAt,
          state.lastId,
          state.cutoffDate,
          batchSize,
        );

        if (datasetRunItems.length === 0) {
          logger.info(
            "[BACKFILL HISTORIC DRI] No more dataset run items to process. Migration complete.",
          );
          this.isFinished = true;
          break;
        }

        logger.info(
          `[BACKFILL HISTORIC DRI] Fetched batch of ${datasetRunItems.length} items in ${Date.now() - batchStart}ms`,
        );

        // Process the batch
        const batchResult = await this.processBatch(datasetRunItems);

        totalProcessedItems += datasetRunItems.length;
        totalProcessedTraces += batchResult.processedTraces;
        totalSkippedTraces += batchResult.skippedTraces;

        // Update state with last item in batch
        const lastItem = datasetRunItems[datasetRunItems.length - 1];
        state.lastCreatedAt = lastItem.created_at;
        state.lastId = lastItem.id;
        state.processedItems = totalProcessedItems;
        state.processedTraces = totalProcessedTraces;
        state.skippedTraces = totalSkippedTraces;
        state.lastUpdated = new Date().toISOString();

        await this.updateState(backgroundMigrationId, state);

        const batchDuration = Date.now() - batchStart;
        logger.info(
          `[BACKFILL HISTORIC DRI] Batch completed in ${batchDuration}ms. ` +
            `Processed: ${datasetRunItems.length} items, ` +
            `${batchResult.processedTraces} traces enriched, ` +
            `${batchResult.skippedTraces} traces skipped. ` +
            `Total progress: ${totalProcessedItems} items, ${totalProcessedTraces} traces`,
        );

        // Check if we've reached the end (batch smaller than requested)
        if (datasetRunItems.length < batchSize) {
          logger.info(
            "[BACKFILL HISTORIC DRI] Received partial batch. Migration complete.",
          );
          this.isFinished = true;
        }
      } catch (error) {
        logger.error("[BACKFILL HISTORIC DRI] Failed to process batch", error);
        throw error; // Fail the migration on batch-level errors
      }
    }

    if (this.isAborted) {
      logger.info(
        `[BACKFILL HISTORIC DRI] Migration aborted after processing ${totalProcessedItems} items. ` +
          `State saved for resumption.`,
      );
      return;
    }

    const totalDuration = Date.now() - start;
    logger.info(
      `[BACKFILL HISTORIC DRI] Migration completed successfully in ${totalDuration}ms. ` +
        `Total: ${totalProcessedItems} items processed, ` +
        `${totalProcessedTraces} traces enriched, ` +
        `${totalSkippedTraces} traces skipped`,
    );
  }

  async abort(): Promise<void> {
    logger.info("[BACKFILL HISTORIC DRI] Aborting migration");
    this.isAborted = true;
  }

  /**
   * Initialize migration state from database or create new state
   */
  private async initializeState(
    migrationId: string,
    cutoffDate: Date,
    minDate: Date,
  ): Promise<MigrationState> {
    try {
      const migration = await prisma.backgroundMigration.findUnique({
        where: { id: migrationId },
        select: { state: true },
      });

      if (migration?.state && typeof migration.state === "object") {
        const existingState = migration.state as any;

        // Restore existing state
        return {
          cutoffDate: existingState.cutoffDate || cutoffDate.toISOString(),
          lastCreatedAt: existingState.lastCreatedAt || minDate.toISOString(),
          lastId: existingState.lastId || "",
          processedItems: existingState.processedItems || 0,
          processedTraces: existingState.processedTraces || 0,
          skippedTraces: existingState.skippedTraces || 0,
          lastUpdated: existingState.lastUpdated || new Date().toISOString(),
        };
      }
    } catch (error) {
      logger.warn(
        "[BACKFILL HISTORIC DRI] Could not load existing state, creating new state",
        error,
      );
    }

    // Create initial state
    const initialState: MigrationState = {
      cutoffDate: cutoffDate.toISOString(),
      lastCreatedAt: minDate.toISOString(),
      lastId: "",
      processedItems: 0,
      processedTraces: 0,
      skippedTraces: 0,
      lastUpdated: new Date().toISOString(),
    };

    await this.updateState(migrationId, initialState);
    return initialState;
  }

  /**
   * Update migration state in database
   */
  private async updateState(
    migrationId: string,
    state: MigrationState,
  ): Promise<void> {
    await prisma.backgroundMigration.update({
      where: { id: migrationId },
      data: { state: state as any },
    });
  }

  /**
   * Fetch a batch of dataset_run_items from ClickHouse
   * Uses time-based pagination with secondary ID ordering for deterministic results
   */
  private async fetchDatasetRunItemBatch(
    lastCreatedAt: string,
    lastId: string,
    cutoffDate: string,
    batchSize: number,
  ): Promise<DatasetRunItem[]> {
    const query = `
      SELECT
        dri.id,
        dri.project_id,
        dri.trace_id,
        dri.observation_id,
        dri.dataset_run_id,
        dri.dataset_run_name,
        dri.dataset_run_description,
        dri.dataset_run_metadata,
        dri.dataset_id,
        dri.dataset_item_id,
        dri.dataset_item_expected_output,
        dri.dataset_item_metadata,
        dri.created_at
      FROM dataset_run_items_rmt AS dri
      WHERE dri.created_at < {cutoffDate: DateTime64(3)}
        AND (
          dri.created_at > {lastCreatedAt: DateTime64(3)}
          OR (dri.created_at = {lastCreatedAt: DateTime64(3)} AND dri.id > {lastId: String})
        )
      ORDER BY dri.created_at ASC, dri.id ASC
      LIMIT {batchSize: UInt32}
    `;

    const rows = await queryClickhouse<DatasetRunItem>({
      query,
      params: {
        cutoffDate: convertDateToClickhouseDateTime(new Date(cutoffDate)),
        lastCreatedAt: convertDateToClickhouseDateTime(new Date(lastCreatedAt)),
        lastId,
        batchSize,
      },
      tags: {
        feature: "backfill-historic-dri",
        operation_name: "fetchDatasetRunItemBatch",
      },
    });

    return rows;
  }

  /**
   * Process a batch of dataset run items
   * Enriches associated traces and observations with experiment metadata
   */
  private async processBatch(
    datasetRunItems: DatasetRunItem[],
  ): Promise<{ processedTraces: number; skippedTraces: number }> {
    let processedTraces = 0;
    let skippedTraces = 0;

    // Extract unique project and trace IDs
    const projectIds = [
      ...new Set(datasetRunItems.map((dri) => dri.project_id)),
    ];
    const traceIds = [...new Set(datasetRunItems.map((dri) => dri.trace_id))];

    logger.info(
      `[BACKFILL HISTORIC DRI] Processing ${datasetRunItems.length} items covering ${traceIds.length} unique traces`,
    );

    // Calculate minimum time for fetching related data (use oldest item in batch)
    const minTime = new Date(
      Math.min(
        ...datasetRunItems.map((item) => new Date(item.created_at).getTime()),
      ),
    );

    // Fetch observations and traces in parallel
    const fetchStart = Date.now();
    const [observations, traces] = await Promise.all([
      getRelevantObservations(projectIds, traceIds, minTime),
      getRelevantTraces(projectIds, traceIds, minTime),
    ]);

    logger.info(
      `[BACKFILL HISTORIC DRI] Fetched ${observations.length} observations and ${traces.length} traces in ${Date.now() - fetchStart}ms`,
    );

    // Build span maps for efficient lookups
    const allSpans = [...observations, ...traces];
    const { spanMap, childMap } = buildSpanMaps(allSpans);

    // Build trace properties map for efficient lookup
    const tracePropertiesMap = new Map<string, TraceProperties>();
    for (const trace of traces) {
      tracePropertiesMap.set(trace.trace_id, {
        userId: trace.user_id,
        sessionId: trace.session_id,
        version: trace.version,
        release: trace.release,
        tags: trace.tags,
        bookmarked: trace.bookmarked,
        public: trace.public,
      });
    }

    // Process each dataset run item individually with error handling
    const processedTraceIds = new Set<string>();

    for (const dri of datasetRunItems) {
      try {
        // Skip if we've already processed this trace in this batch
        if (processedTraceIds.has(dri.trace_id)) {
          continue;
        }

        // Find the root span (either observation or trace)
        const rootSpanId = dri.observation_id || `t-${dri.trace_id}`;
        const rootSpan = spanMap.get(rootSpanId);

        if (!rootSpan) {
          logger.warn(
            `[BACKFILL HISTORIC DRI] Root span ${rootSpanId} not found for DRI ${dri.id} (trace: ${dri.trace_id}). Skipping.`,
          );
          skippedTraces++;
          continue;
        }

        // Get trace-level properties
        const traceProperties = tracePropertiesMap.get(dri.trace_id);

        // Find all child spans recursively
        const childSpans = findAllChildren(rootSpanId, childMap);

        // Enrich spans with experiment properties
        const enrichedSpans = enrichSpansWithExperiment(
          rootSpan,
          childSpans,
          dri,
          traceProperties,
        );

        // Write enriched spans to events table
        await this.writeEnrichedSpans(enrichedSpans);

        processedTraceIds.add(dri.trace_id);
        processedTraces++;
      } catch (error) {
        logger.error(
          `[BACKFILL HISTORIC DRI] Failed to process DRI ${dri.id} (trace: ${dri.trace_id}). Skipping.`,
          error,
        );
        skippedTraces++;
        // Continue processing next item (skip and log strategy)
      }
    }

    return { processedTraces, skippedTraces };
  }

  /**
   * Write enriched spans to the events table using IngestionService
   * Reuses the same logic as handleExperimentBackfill
   */
  private async writeEnrichedSpans(spans: EnrichedSpan[]): Promise<void> {
    if (spans.length === 0) {
      return;
    }

    const ingestionService = new IngestionService(
      redis!,
      prisma,
      ClickhouseWriter.getInstance(),
      clickhouseClient(),
    );

    for (const span of spans) {
      // Convert EnrichedSpan to EventInput format
      const eventInput = {
        // Required identifiers
        projectId: span.project_id,
        traceId: span.trace_id,
        spanId: span.span_id,
        startTimeISO: span.start_time,
        endTimeISO: span.end_time || span.start_time, // Required field, use start_time as fallback

        // Optional identifiers
        parentSpanId: span.parent_span_id || undefined,

        // Core properties
        name: span.name,
        type: span.type,
        environment: span.environment || undefined,
        version: span.version || undefined,
        release: span.release || undefined,
        tags: span.tags || [],
        bookmarked: span.bookmarked || false,
        public: span.public || false,
        completionStartTime: span.completion_start_time || undefined,

        // User/session
        userId: span.user_id || undefined,
        sessionId: span.session_id || undefined,
        level: span.level || undefined,
        statusMessage: span.status_message || undefined,

        // Prompt
        promptId: span.prompt_id || undefined,
        promptName: span.prompt_name || undefined,
        promptVersion: span.prompt_version || undefined,

        // Model
        modelName: span.provided_model_name || undefined,
        modelParameters: span.model_parameters || undefined,

        // Usage & Cost
        providedUsageDetails: span.provided_usage_details || undefined,
        usageDetails: span.usage_details || undefined,
        providedCostDetails: span.provided_cost_details || undefined,
        costDetails: span.cost_details || undefined,
        totalCost: span.total_cost || undefined,

        // I/O
        input: span.input || undefined,
        output: span.output || undefined,

        // Metadata
        metadata: span.metadata,

        // Source/instrumentation
        source: span.source,

        // Experiment fields
        experimentId: span.experiment_id,
        experimentName: span.experiment_name,
        experimentMetadataNames: span.experiment_metadata_names,
        experimentMetadataValues: span.experiment_metadata_values,
        experimentDescription: span.experiment_description,
        experimentDatasetId: span.experiment_dataset_id,
        experimentItemId: span.experiment_item_id,
        experimentItemRootSpanId: span.experiment_item_root_span_id,
        experimentItemExpectedOutput: span.experiment_item_expected_output,
        experimentItemMetadataNames: span.experiment_item_metadata_names,
        experimentItemMetadataValues: span.experiment_item_metadata_values,
      };

      await ingestionService.writeEvent(eventInput, ""); // Empty fileKey since we're not storing raw events
    }
  }
}

/**
 * Main function for running the migration standalone
 * Useful for testing and manual execution
 */
async function main() {
  const args = parseArgs({
    options: {
      cutoffDate: {
        type: "string",
        short: "c",
        description:
          "Process items created before this ISO 8601 date (required)",
      },
      batchSize: {
        type: "string",
        short: "b",
        default: "1000",
        description: "Number of items per batch (default: 1000)",
      },
      minDate: {
        type: "string",
        short: "m",
        description: "Start processing from this ISO 8601 date (optional)",
      },
      maxRowsToProcess: {
        type: "string",
        short: "r",
        default: "Infinity",
        description: "Maximum rows to process (for testing, default: Infinity)",
      },
    },
  });

  if (!args.values.cutoffDate) {
    console.error("Error: cutoffDate parameter is required");
    console.error("\nUsage:");
    console.error(
      '  node backfillHistoricDatasetRunItems.js --cutoffDate "2025-01-01T00:00:00Z"',
    );
    console.error("\nOptions:");
    console.error(
      "  --cutoffDate, -c   ISO 8601 date - process items before this date (required)",
    );
    console.error("  --batchSize, -b    Items per batch (default: 1000)");
    console.error(
      "  --minDate, -m      ISO 8601 date - start from this date (optional)",
    );
    console.error(
      "  --maxRowsToProcess, -r   Max items to process (default: Infinity)",
    );
    process.exit(1);
  }

  const migration = new BackfillHistoricDatasetRunItems();

  // Validate before running
  const validation = await migration.validate(args.values);
  if (!validation.valid) {
    logger.error(`Migration validation failed: ${validation.invalidReason}`);
    process.exit(1);
  }

  await migration.run(args.values);
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      logger.info(
        "[BACKFILL HISTORIC DRI] Migration script completed successfully",
      );
      process.exit(0);
    })
    .catch((error) => {
      logger.error(
        `[BACKFILL HISTORIC DRI] Migration script failed: ${error}`,
        error,
      );
      process.exit(1);
    });
}
