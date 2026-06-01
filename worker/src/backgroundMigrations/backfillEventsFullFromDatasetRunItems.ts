import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
  logger,
  queryClickhouse,
  sleep,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { parseArgs } from "node:util";
import {
  buildSpanMaps,
  enrichSpansWithExperiment,
  findAllChildren,
  writeEnrichedSpans,
  type DatasetRunItem,
  type EnrichedSpan,
  type SpanRecord,
  type TraceProperties,
} from "../features/eventPropagation/handleExperimentBackfill";
import { ClickhouseWriter } from "../services/ClickhouseWriter";

// Hard-coded UUID identifying the row in background_migrations. Must match
// the Prisma migration that registers this row.
const backgroundMigrationId = "9d4f8a12-7b35-4e6c-9f48-a2b3c4d5e6f7";

// ============================================================================
// Types
// ============================================================================

interface DriCursor {
  projectId: string;
  datasetId: string;
  datasetRunId: string;
  driId: string;
}

interface MigrationArgs {
  concurrency?: number;
  pollIntervalMs?: number;
  maxRetries?: number;
  envGate?: string;
  batchSize?: number;
  maxDescendantsPerDri?: number;
  lookbackDays?: number;
}

type ResolvedConfig = Required<Omit<MigrationArgs, "envGate">>;

interface MigrationState {
  phase: "init" | "processing" | "completed";
  cursor: DriCursor | null;
  processedDris: number;
  config: ResolvedConfig;
}

const DEFAULT_CONFIG: ResolvedConfig = {
  concurrency: 1,
  pollIntervalMs: 30_000,
  maxRetries: 3,
  batchSize: 200,
  maxDescendantsPerDri: 50_000,
  lookbackDays: 90,
};

// ============================================================================
// Errors
// ============================================================================

/**
 * Thrown when a single DRI's trace tree exceeds `maxDescendantsPerDri`.
 *
 * Halts the migration so the operator can either bump the cap, skip the
 * offending DRI, or run a manual SQL fallback. The cursor in state is
 * **not** advanced before this is thrown so a retry resumes from the same
 * batch — bump the cap and re-run, or fix the cursor manually.
 */
class DescendantCapExceededError extends Error {
  constructor(
    public readonly dri: DatasetRunItem,
    public readonly descendantCount: number,
    public readonly cap: number,
  ) {
    super(
      [
        `DRI ${dri.id} (project=${dri.project_id}, trace=${dri.trace_id}) has`,
        `${descendantCount} descendant spans, exceeding the cap of ${cap}.`,
        `\n\nTo proceed, either:`,
        `  (a) raise maxDescendantsPerDri in the background_migrations.args`,
        `      JSONB and re-run the migration;`,
        `  (b) advance the cursor in background_migrations.state to skip this`,
        `      DRI (the trace will not get experiment enrichment); or`,
        `  (c) handle this trace manually via SQL and then advance the cursor.`,
      ].join(" "),
    );
    this.name = "DescendantCapExceededError";
  }
}

// ============================================================================
// Migration Class
// ============================================================================

export default class BackfillEventsFullFromDatasetRunItems implements IBackgroundMigration {
  private isAborted = false;

  // ============================================================================
  // State Management
  // ============================================================================

  private async loadState(): Promise<MigrationState> {
    const migration = await prisma.backgroundMigration.findUnique({
      where: { id: backgroundMigrationId },
      select: { state: true },
    });

    const defaultState: MigrationState = {
      phase: "init",
      cursor: null,
      processedDris: 0,
      config: { ...DEFAULT_CONFIG },
    };

    if (!migration || !migration.state) {
      return defaultState;
    }

    const state = migration.state as Partial<MigrationState>;

    return {
      phase: state.phase ?? defaultState.phase,
      cursor: state.cursor ?? defaultState.cursor,
      processedDris: state.processedDris ?? defaultState.processedDris,
      config: {
        ...DEFAULT_CONFIG,
        ...state.config,
      },
    };
  }

  private async updateState(state: MigrationState): Promise<void> {
    await prisma.backgroundMigration.update({
      where: { id: backgroundMigrationId },
      data: { state: state as any },
    });
  }

  // ============================================================================
  // DRI Loading (cursor-paginated)
  // ============================================================================

  /**
   * Loads the next batch of DRIs after the given cursor, ordered by the
   * dataset_run_items_rmt PK (project_id, dataset_id, dataset_run_id, id) so
   * the scan is index-aligned. Dedupes to one row per
   * (project_id, trace_id, observation_id) — matching the live cron — so we
   * don't process the same trace+observation slot twice within a batch.
   *
   * Note: traces that belong to multiple dataset_runs may surface in
   * different batches, in which case events_full ends up enriched with the
   * last-written experiment (ReplacingMergeTree). This matches the live
   * cron's behaviour.
   */
  private async loadDriBatch(
    cursor: DriCursor | null,
    batchSize: number,
  ): Promise<DatasetRunItem[]> {
    const cursorTuple: DriCursor = cursor ?? {
      projectId: "",
      datasetId: "",
      datasetRunId: "",
      driId: "",
    };

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
        dri.dataset_item_version,
        dri.dataset_item_id,
        dri.dataset_item_expected_output,
        dri.dataset_item_metadata,
        dri.created_at
      FROM dataset_run_items_rmt AS dri
      WHERE (dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.id) >
            ({cProjectId: String}, {cDatasetId: String}, {cDatasetRunId: String}, {cDriId: String})
      ORDER BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.id ASC
      LIMIT 1 BY dri.project_id, dri.trace_id, coalesce(dri.observation_id, '')
      LIMIT {batchSize: UInt64}
    `;

    return queryClickhouse<DatasetRunItem>({
      query,
      params: {
        cProjectId: cursorTuple.projectId,
        cDatasetId: cursorTuple.datasetId,
        cDatasetRunId: cursorTuple.datasetRunId,
        cDriId: cursorTuple.driId,
        batchSize,
      },
      clickhouseConfigs: {
        request_timeout: 120_000,
      },
      tags: {
        feature: "background-migration",
        operation: "loadDriBatch",
      },
    });
  }

  // ============================================================================
  // Span fetching for a DRI batch
  // ============================================================================

  /**
   * Fetches observations for the batch's traces, padded by `lookbackDays` on
   * either side of the batch's DRI created_at window so trace timestamps that
   * predate or postdate the DRI insert are still found.
   *
   * Differs from `getRelevantObservations` in `handleExperimentBackfill.ts`:
   * we deliberately do **not** filter out the `langfuse-prompt-experiment`
   * environment because historical backfill must include that data.
   */
  private async fetchObservationsForBatch(
    driBatch: DatasetRunItem[],
    lookbackDays: number,
  ): Promise<SpanRecord[]> {
    if (driBatch.length === 0) return [];

    const projectIds = [...new Set(driBatch.map((d) => d.project_id))];
    const traceIds = [...new Set(driBatch.map((d) => d.trace_id))];
    const { minTime, maxTime } = computeBatchTimeWindow(driBatch, lookbackDays);

    const query = `
      SELECT
        o.project_id,
        o.trace_id,
        o.id AS span_id,
        coalesce(o.parent_observation_id, concat('t-', o.trace_id)) AS parent_span_id,
        o.start_time,
        o.end_time,
        o.name,
        o.type,
        coalesce(o.environment, '') AS environment,
        coalesce(o.version, '') AS version,
        '' as release,
        coalesce(o.input, '') AS input,
        coalesce(o.output, '') AS output,
        o.level AS level,
        coalesce(o.status_message, '') AS status_message,
        o.completion_start_time AS completion_start_time,
        coalesce(o.prompt_id, '') AS prompt_id,
        coalesce(o.prompt_name, '') AS prompt_name,
        o.prompt_version AS prompt_version,
        coalesce(o.internal_model_id, '') AS model_id,
        coalesce(o.provided_model_name, '') AS provided_model_name,
        coalesce(o.model_parameters, '{}') AS model_parameters,
        o.provided_usage_details AS provided_usage_details,
        o.usage_details AS usage_details,
        o.provided_cost_details AS provided_cost_details,
        o.cost_details AS cost_details,
        coalesce(o.total_cost, 0) AS total_cost,
        o.tool_definitions,
        o.tool_calls,
        o.tool_call_names,
        o.usage_pricing_tier_id,
        o.usage_pricing_tier_name,
        o.metadata,
        multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel-backfill', 'ingestion-api-backfill') AS source,
        [] as tags,
        false AS bookmarked,
        false AS public,
        '' AS trace_name,
        '' AS user_id,
        '' AS session_id
      FROM observations o
      WHERE o.project_id IN {projectIds: Array(String)}
        AND o.trace_id IN {traceIds: Array(String)}
        AND o.start_time >= {minTime: DateTime64(3)}
        AND o.start_time <= {maxTime: DateTime64(3)}
      ORDER BY o.event_ts DESC
      LIMIT 1 BY o.project_id, o.id
    `;

    return queryClickhouse<SpanRecord>({
      query,
      params: {
        projectIds,
        traceIds,
        minTime: convertDateToClickhouseDateTime(minTime),
        maxTime: convertDateToClickhouseDateTime(maxTime),
      },
      clickhouseConfigs: {
        request_timeout: 120_000,
      },
      tags: {
        feature: "background-migration",
        operation: "fetchObservationsForBatch",
      },
    });
  }

  /**
   * Fetches traces for the batch, padded by `lookbackDays`. Mirrors the
   * shape of `getRelevantTraces` so the result can flow through the same
   * `buildSpanMaps`/`findAllChildren` helpers, but without the prompt-
   * experiment environment filter.
   */
  private async fetchTracesForBatch(
    driBatch: DatasetRunItem[],
    lookbackDays: number,
  ): Promise<SpanRecord[]> {
    if (driBatch.length === 0) return [];

    const projectIds = [...new Set(driBatch.map((d) => d.project_id))];
    const traceIds = [...new Set(driBatch.map((d) => d.trace_id))];
    const { minTime, maxTime } = computeBatchTimeWindow(driBatch, lookbackDays);

    const query = `
      SELECT
        t.project_id,
        t.id AS trace_id,
        concat('t-', t.id) AS span_id,
        '' AS parent_span_id,
        t.timestamp AS start_time,
        '' AS end_time,
        t.name AS name,
        'SPAN' AS type,
        coalesce(t.environment, '') AS environment,
        coalesce(t.version, '') AS version,
        coalesce(t.release, '') AS release,
        coalesce(t.input, '') AS input,
        coalesce(t.output, '') AS output,
        '' AS level,
        '' AS status_message,
        '' AS completion_start_time,
        '' AS prompt_id,
        '' AS prompt_name,
        '' AS prompt_version,
        '' AS model_id,
        '' AS provided_model_name,
        '' AS model_parameters,
        map() AS provided_usage_details,
        map() AS usage_details,
        map() AS provided_cost_details,
        map() AS cost_details,
        0 AS total_cost,
        map() AS tool_definitions,
        [] AS tool_calls,
        [] AS tool_call_names,
        t.metadata,
        multiIf(mapContains(t.metadata, 'resourceAttributes'), 'otel-backfill', 'ingestion-api-backfill') AS source,
        t.tags,
        t.bookmarked,
        t.public,
        t.name AS trace_name,
        coalesce(t.user_id, '') AS user_id,
        coalesce(t.session_id, '') AS session_id
      FROM traces t
      WHERE t.project_id IN {projectIds: Array(String)}
        AND t.id IN {traceIds: Array(String)}
        AND t.timestamp >= {minTime: DateTime64(3)}
        AND t.timestamp <= {maxTime: DateTime64(3)}
      ORDER BY t.event_ts DESC
      LIMIT 1 BY t.project_id, t.id
    `;

    return queryClickhouse<SpanRecord>({
      query,
      params: {
        projectIds,
        traceIds,
        minTime: convertDateToClickhouseDateTime(minTime),
        maxTime: convertDateToClickhouseDateTime(maxTime),
      },
      clickhouseConfigs: {
        request_timeout: 120_000,
      },
      tags: {
        feature: "background-migration",
        operation: "fetchTracesForBatch",
      },
    });
  }

  // ============================================================================
  // Batch processing
  // ============================================================================

  /**
   * Enriches one DRI batch and writes the resulting EnrichedSpans to the
   * ClickhouseWriter queue. Throws DescendantCapExceededError if any DRI's
   * trace exceeds the cap.
   */
  private async processBatch(
    driBatch: DatasetRunItem[],
    config: ResolvedConfig,
  ): Promise<{ enriched: number; skipped: number }> {
    const [observations, traces] = await Promise.all([
      this.fetchObservationsForBatch(driBatch, config.lookbackDays),
      this.fetchTracesForBatch(driBatch, config.lookbackDays),
    ]);

    logger.info(
      `[Backfill Events DRIs] Fetched ${observations.length} observations and ${traces.length} traces for ${driBatch.length} DRIs`,
    );

    const allSpans: SpanRecord[] = [...observations, ...traces];
    const { spanMap, childMap } = buildSpanMaps(allSpans);

    const tracePropertiesMap = new Map<string, TraceProperties>();
    for (const trace of traces) {
      tracePropertiesMap.set(trace.trace_id, {
        name: trace.name,
        userId: trace.user_id,
        sessionId: trace.session_id,
        version: trace.version,
        release: trace.release,
        tags: trace.tags,
        bookmarked: trace.bookmarked,
        public: trace.public,
      });
    }

    const allEnrichedSpans: EnrichedSpan[] = [];
    let skipped = 0;

    for (const dri of driBatch) {
      const rootSpanId = dri.observation_id || `t-${dri.trace_id}`;
      const rootSpan = spanMap.get(rootSpanId);

      if (!rootSpan) {
        logger.warn(
          `[Backfill Events DRIs] Root span ${rootSpanId} not found for DRI ${dri.id} (project=${dri.project_id}, trace=${dri.trace_id}); skipping`,
        );
        skipped++;
        continue;
      }

      const childSpans = findAllChildren(rootSpanId, childMap);
      if (childSpans.length > config.maxDescendantsPerDri) {
        throw new DescendantCapExceededError(
          dri,
          childSpans.length,
          config.maxDescendantsPerDri,
        );
      }

      const traceProperties = tracePropertiesMap.get(dri.trace_id);
      const enrichedSpans = enrichSpansWithExperiment(
        rootSpan,
        childSpans,
        dri,
        traceProperties,
      );
      allEnrichedSpans.push(...enrichedSpans);
    }

    if (allEnrichedSpans.length > 0) {
      writeEnrichedSpans(allEnrichedSpans);
    }

    return { enriched: allEnrichedSpans.length, skipped };
  }

  // ============================================================================
  // Validation
  // ============================================================================

  async validate(
    args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    const tables = await clickhouseClient().query({ query: "SHOW TABLES" });
    const tableNames = (await tables.json()).data as { name: string }[];

    const requiredTables = [
      "dataset_run_items_rmt",
      "observations",
      "traces",
      "events_full",
      "events_core",
    ];
    for (const table of requiredTables) {
      if (!tableNames.some((r) => r.name === table)) {
        if (attempts > 0) {
          logger.info(
            `[Backfill Events DRIs] ${table} table does not exist. Retrying in 10s...`,
          );
          return new Promise((resolve) => {
            setTimeout(
              () => resolve(this.validate(args, attempts - 1)),
              10_000,
            );
          });
        }
        return {
          valid: false,
          invalidReason: `ClickHouse ${table} table does not exist`,
        };
      }
    }

    logger.info(
      "[Backfill Events DRIs] All prerequisites validated successfully",
    );

    return { valid: true, invalidReason: undefined };
  }

  // ============================================================================
  // Main Run Loop
  // ============================================================================

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    const migrationArgs = args as MigrationArgs;

    const config: ResolvedConfig = {
      concurrency: migrationArgs.concurrency ?? DEFAULT_CONFIG.concurrency,
      pollIntervalMs:
        migrationArgs.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs,
      maxRetries: migrationArgs.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      batchSize: migrationArgs.batchSize ?? DEFAULT_CONFIG.batchSize,
      maxDescendantsPerDri:
        migrationArgs.maxDescendantsPerDri ??
        DEFAULT_CONFIG.maxDescendantsPerDri,
      lookbackDays: migrationArgs.lookbackDays ?? DEFAULT_CONFIG.lookbackDays,
    };

    logger.info(
      `[Backfill Events DRIs] Starting events_full backfill from dataset_run_items_rmt with config: ${JSON.stringify(config)}`,
    );

    let state = await this.loadState();
    state.config = config;

    if (state.phase === "init") {
      state.phase = "processing";
    }
    await this.updateState(state);

    if (state.phase === "completed") {
      logger.info(
        `[Backfill Events DRIs] Migration already marked completed (processed ${state.processedDris} DRIs); nothing to do`,
      );
      return;
    }

    let totalEnriched = 0;
    let totalSkipped = 0;
    let consecutiveBatchFailures = 0;

    while (!this.isAborted) {
      let driBatch: DatasetRunItem[];
      try {
        driBatch = await this.loadDriBatch(state.cursor, config.batchSize);
      } catch (err) {
        consecutiveBatchFailures++;
        logger.error(
          `[Backfill Events DRIs] Failed to load DRI batch (failure ${consecutiveBatchFailures}/${config.maxRetries})`,
          err,
        );
        if (consecutiveBatchFailures >= config.maxRetries) {
          throw err;
        }
        await sleep(config.pollIntervalMs);
        continue;
      }

      if (driBatch.length === 0) {
        state.phase = "completed";
        await this.updateState(state);
        logger.info(
          `[Backfill Events DRIs] No more DRIs to process; processed ${state.processedDris} DRIs in total`,
        );
        break;
      }

      logger.info(
        `[Backfill Events DRIs] Processing batch of ${driBatch.length} DRIs (cursor: ${
          state.cursor
            ? `${state.cursor.projectId}/${state.cursor.datasetId}/${state.cursor.datasetRunId}/${state.cursor.driId}`
            : "<start>"
        })`,
      );

      try {
        const { enriched, skipped } = await this.processBatch(driBatch, config);
        totalEnriched += enriched;
        totalSkipped += skipped;
        consecutiveBatchFailures = 0;
      } catch (err) {
        if (err instanceof DescendantCapExceededError) {
          // Hard stop. Log and rethrow so the manager records failedAt and
          // the operator can act on the structured message.
          logger.error(
            `[Backfill Events DRIs] Descendant cap exceeded — halting`,
            err,
          );
          throw err;
        }
        consecutiveBatchFailures++;
        logger.error(
          `[Backfill Events DRIs] Failed to process batch (failure ${consecutiveBatchFailures}/${config.maxRetries})`,
          err,
        );
        if (consecutiveBatchFailures >= config.maxRetries) {
          throw err;
        }
        await sleep(config.pollIntervalMs);
        continue;
      }

      // Advance cursor to the last DRI's PK so a resume picks up after it.
      const last = driBatch[driBatch.length - 1];
      state.cursor = {
        projectId: last.project_id,
        datasetId: last.dataset_id,
        datasetRunId: last.dataset_run_id,
        driId: last.id,
      };
      state.processedDris += driBatch.length;
      await this.updateState(state);

      // Brief pause between batches so the ClickhouseWriter queue can drain
      // and we don't hot-loop the DRI table.
      await sleep(Math.min(config.pollIntervalMs, 5_000));
    }

    if (this.isAborted) {
      logger.info(
        "[Backfill Events DRIs] Migration aborted. Can be resumed from current state.",
      );
      return;
    }

    // Drain pending writes before we return. Inner function catches all errors, i.e. no try/catch wrap.
    await ClickhouseWriter.getInstance().flushAll(true);

    logger.info(
      `[Backfill Events DRIs] Finished events_full backfill in ${(
        (Date.now() - start) /
        1000 /
        60
      ).toFixed(
        2,
      )} minutes (enriched=${totalEnriched}, skipped=${totalSkipped})`,
    );
  }

  async abort(): Promise<void> {
    logger.info("[Backfill Events DRIs] Aborting migration");
    this.isAborted = true;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function computeBatchTimeWindow(
  driBatch: DatasetRunItem[],
  lookbackDays: number,
): { minTime: Date; maxTime: Date } {
  const dayMs = 24 * 60 * 60 * 1000;
  const timestamps = driBatch.map((d) => new Date(d.created_at).getTime());
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  return {
    minTime: new Date(minTs - lookbackDays * dayMs),
    maxTime: new Date(maxTs + lookbackDays * dayMs),
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  process.on("unhandledRejection", (reason) => {
    logger.error(
      "[Backfill Events DRIs] Unhandled promise rejection - process will exit",
      {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      },
    );
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.error(
      "[Backfill Events DRIs] Uncaught exception - process will exit",
      error,
    );
    process.exit(1);
  });

  const args = parseArgs({
    options: {
      concurrency: { type: "string", short: "c", default: "1" },
      pollIntervalMs: { type: "string", short: "p", default: "30000" },
      maxRetries: { type: "string", short: "r", default: "3" },
      batchSize: { type: "string", short: "b", default: "200" },
      maxDescendantsPerDri: {
        type: "string",
        short: "d",
        default: "50000",
      },
      lookbackDays: { type: "string", short: "l", default: "90" },
    },
  });

  const migration = new BackfillEventsFullFromDatasetRunItems();

  const parsedArgs = {
    concurrency: parseInt(args.values.concurrency as string, 10),
    pollIntervalMs: parseInt(args.values.pollIntervalMs as string, 10),
    maxRetries: parseInt(args.values.maxRetries as string, 10),
    batchSize: parseInt(args.values.batchSize as string, 10),
    maxDescendantsPerDri: parseInt(
      args.values.maxDescendantsPerDri as string,
      10,
    ),
    lookbackDays: parseInt(args.values.lookbackDays as string, 10),
  };

  const validation = await migration.validate(parsedArgs);

  if (!validation.valid) {
    logger.error(`Validation failed: ${validation.invalidReason}`);
    process.exit(1);
  }

  await migration.run(parsedArgs);
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Migration execution failed: ${error}`, error);
      process.exit(1);
    });
}
