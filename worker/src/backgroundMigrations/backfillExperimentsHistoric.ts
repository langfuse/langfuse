import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
  logger,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import {
  DatasetRunItem,
  SpanRecord,
  EnrichedSpan,
  TraceProperties,
  buildSpanMaps,
  findAllChildren,
  enrichSpansWithExperiment,
  writeEnrichedSpans,
} from "../features/eventPropagation/handleExperimentBackfill";
import { parseArgs } from "node:util";

// Hard-coded migration ID (must match the Prisma migration INSERT)
const backgroundMigrationId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

// Configuration defaults
const DEFAULT_CHUNK_SIZE = 1_000;
const DEFAULT_BATCH_TIMEOUT_MS = 600_000; // 10 minutes

// ============================================================================
// Interfaces
// ============================================================================

interface CursorPosition {
  project_id: string;
  dataset_id: string;
  dataset_run_id: string;
  id: string;
}

interface MigrationState {
  cursor: CursorPosition | null;
  totalProcessed: number;
  totalDRIs: number | null;
  lastUpdated: string;
}

interface MigrationArgs {
  chunkSize?: string;
  batchTimeoutMs?: string;
  maxDate?: string;
}

// ============================================================================
// Migration Class
// ============================================================================

export default class BackfillExperimentsHistoric
  implements IBackgroundMigration
{
  private isAborted = false;

  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------

  private async loadState(): Promise<MigrationState> {
    const migration = await prisma.backgroundMigration.findUnique({
      where: { id: backgroundMigrationId },
      select: { state: true },
    });

    const defaultState: MigrationState = {
      cursor: null,
      totalProcessed: 0,
      totalDRIs: null,
      lastUpdated: new Date().toISOString(),
    };

    if (!migration || !migration.state) {
      return defaultState;
    }

    const state = migration.state as any;
    return {
      cursor: state.cursor ?? null,
      totalProcessed: state.totalProcessed ?? 0,
      totalDRIs: state.totalDRIs ?? null,
      lastUpdated: state.lastUpdated ?? new Date().toISOString(),
    };
  }

  private async updateState(state: MigrationState): Promise<void> {
    await prisma.backgroundMigration.update({
      where: { id: backgroundMigrationId },
      data: { state: state as any },
    });
  }

  // --------------------------------------------------------------------------
  // DRI Fetching
  // --------------------------------------------------------------------------

  private async countTotalDRIs(maxDate: Date): Promise<number> {
    const result = await queryClickhouse<{ count: string }>({
      query: `SELECT count(*) as count FROM dataset_run_items_rmt WHERE created_at <= {maxDate: DateTime64(3)}`,
      params: { maxDate: convertDateToClickhouseDateTime(maxDate) },
      tags: {
        feature: "background-migration",
        operation: "countTotalDRIs",
      },
    });
    return parseInt(result[0]?.count ?? "0", 10);
  }

  private async fetchDRIsChunk(
    cursor: CursorPosition | null,
    chunkSize: number,
    maxDate: Date,
  ): Promise<DatasetRunItem[]> {
    let query: string;

    if (cursor === null) {
      // First chunk - no cursor
      query = `
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
          dri.dataset_item_version,
          dri.dataset_item_expected_output,
          dri.dataset_item_metadata,
          dri.created_at
        FROM dataset_run_items_rmt AS dri
        WHERE dri.created_at <= {maxDate: DateTime64(3)}
        ORDER BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.id
        LIMIT 1 BY dri.project_id, dri.trace_id, coalesce(dri.observation_id, '')
        LIMIT {chunkSize: UInt32}
      `;
    } else {
      // Subsequent chunks - use cursor
      query = `
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
          dri.dataset_item_version,
          dri.dataset_item_expected_output,
          dri.dataset_item_metadata,
          dri.created_at
        FROM dataset_run_items_rmt AS dri
        WHERE (dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.id) >
              ({cursor_project_id: String}, {cursor_dataset_id: String}, {cursor_dataset_run_id: String}, {cursor_id: String})
        AND dri.created_at <= {maxDate: DateTime64(3)}
        ORDER BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.id
        LIMIT 1 BY dri.project_id, dri.trace_id, coalesce(dri.observation_id, '')
        LIMIT {chunkSize: UInt32}
      `;
    }

    return queryClickhouse<DatasetRunItem>({
      query,
      params: cursor
        ? {
            cursor_project_id: cursor.project_id,
            cursor_dataset_id: cursor.dataset_id,
            cursor_dataset_run_id: cursor.dataset_run_id,
            cursor_id: cursor.id,
            chunkSize,
            maxDate: convertDateToClickhouseDateTime(maxDate),
          }
        : { chunkSize, maxDate: convertDateToClickhouseDateTime(maxDate) },
      tags: {
        feature: "background-migration",
        operation: "fetchDRIsChunk",
      },
    });
  }

  // --------------------------------------------------------------------------
  // Span Fetching
  // --------------------------------------------------------------------------

  private async fetchObservationsForTraces(
    projectIds: string[],
    traceIds: string[],
  ): Promise<SpanRecord[]> {
    if (projectIds.length === 0 || traceIds.length === 0) {
      return [];
    }

    const query = `
      SELECT
        o.project_id,
        o.trace_id,
        o.id AS span_id,
        CASE
          WHEN o.id = concat('t-', o.trace_id) THEN ''
          ELSE coalesce(o.parent_observation_id, concat('t-', o.trace_id))
        END AS parent_span_id,
        o.start_time,
        o.end_time,
        o.name,
        o.type,
        coalesce(o.environment, '') AS environment,
        coalesce(o.version, '') AS version,
        '' AS release,
        coalesce(o.input, '') AS input,
        coalesce(o.output, '') AS output,
        o.level,
        coalesce(o.status_message, '') AS status_message,
        o.completion_start_time,
        coalesce(o.prompt_id, '') AS prompt_id,
        coalesce(o.prompt_name, '') AS prompt_name,
        o.prompt_version,
        coalesce(o.internal_model_id, '') AS model_id,
        coalesce(o.provided_model_name, '') AS provided_model_name,
        coalesce(o.model_parameters, '{}') AS model_parameters,
        o.provided_usage_details,
        o.usage_details,
        o.provided_cost_details,
        o.cost_details,
        coalesce(o.total_cost, 0) AS total_cost,
        o.tool_definitions,
        o.tool_calls,
        o.tool_call_names,
        o.usage_pricing_tier_id,
        o.usage_pricing_tier_name,
        o.metadata,
        multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel-backfill-experiments', 'ingestion-api-backfill-experiments') AS source,
        [] AS tags,
        false AS bookmarked,
        false AS public,
        '' as trace_name,
        '' AS user_id,
        '' AS session_id
      FROM observations o
      WHERE o.project_id IN {projectIds: Array(String)}
        AND o.trace_id IN {traceIds: Array(String)}
      ORDER BY o.event_ts DESC
      LIMIT 1 BY o.project_id, o.trace_id, o.id
    `;

    return queryClickhouse<SpanRecord>({
      query,
      params: { projectIds, traceIds },
      tags: {
        feature: "background-migration",
        operation: "fetchObservationsForTraces",
      },
    });
  }

  private async fetchTracesForTraces(
    projectIds: string[],
    traceIds: string[],
  ): Promise<SpanRecord[]> {
    if (projectIds.length === 0 || traceIds.length === 0) {
      return [];
    }

    const query = `
      SELECT
        t.project_id,
        t.id AS trace_id,
        concat('t-', t.id) AS span_id,
        '' AS parent_span_id,
        t.timestamp AS start_time,
        NULL AS end_time,
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
        multiIf(mapContains(t.metadata, 'resourceAttributes'), 'otel-backfill-experiments', 'ingestion-api-backfill-experiments') AS source,
        t.tags,
        t.bookmarked,
        t.public,
        t.name as trace_name,
        coalesce(t.user_id, '') AS user_id,
        coalesce(t.session_id, '') AS session_id
      FROM traces t
      WHERE t.project_id IN {projectIds: Array(String)}
        AND t.id IN {traceIds: Array(String)}
      ORDER BY t.event_ts DESC
      LIMIT 1 BY t.project_id, t.id
    `;

    return queryClickhouse<SpanRecord>({
      query,
      params: { projectIds, traceIds },
      tags: {
        feature: "background-migration",
        operation: "fetchTracesForTraces",
      },
    });
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  async validate(
    args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    // Ensure the background migration record exists
    await prisma.backgroundMigration.upsert({
      where: { id: backgroundMigrationId },
      create: {
        id: backgroundMigrationId,
        name: "20251202_backfill_experiments_historic",
        script: "backfillExperimentsHistoric",
        args: {},
        state: {},
      },
      update: {},
    });

    // Check ClickHouse credentials
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

    // Check required tables exist
    const tables = await clickhouseClient().query({ query: "SHOW TABLES" });
    const tableNames = (await tables.json()).data as { name: string }[];

    const requiredTables = ["events", "dataset_run_items_rmt"];

    for (const tableName of requiredTables) {
      if (!tableNames.some((r) => r.name === tableName)) {
        if (attempts > 0) {
          logger.info(
            `[Backfill Experiments] Table ${tableName} does not exist. Retrying in 10s...`,
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
          invalidReason: `Required ClickHouse table '${tableName}' does not exist`,
        };
      }
    }

    logger.info("[Backfill Experiments] Validation passed, all tables exist");
    return { valid: true, invalidReason: undefined };
  }

  // --------------------------------------------------------------------------
  // Main Run Loop
  // --------------------------------------------------------------------------

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    const migrationArgs = args as MigrationArgs;
    const chunkSize = parseInt(
      migrationArgs.chunkSize ?? String(DEFAULT_CHUNK_SIZE),
    );
    const batchTimeoutMs = parseInt(
      migrationArgs.batchTimeoutMs ?? String(DEFAULT_BATCH_TIMEOUT_MS),
    );
    const maxDate = migrationArgs.maxDate
      ? new Date(migrationArgs.maxDate)
      : new Date(); // Process everything up to now

    logger.info(
      `[Backfill Experiments] Starting historic experiment backfill with args: ${JSON.stringify({ chunkSize, batchTimeoutMs })}`,
    );

    // Load state
    let state = await this.loadState();

    // Get total count on first run
    if (state.totalDRIs === null) {
      state.totalDRIs = await this.countTotalDRIs(maxDate);
      await this.updateState(state);
      logger.info(
        `[Backfill Experiments] Total DRIs to process: ${state.totalDRIs.toLocaleString()}`,
      );
    }

    // Main processing loop
    while (!this.isAborted) {
      // Fetch next chunk
      const dris = await this.fetchDRIsChunk(state.cursor, chunkSize, maxDate);

      if (dris.length === 0) {
        logger.info(
          "[Backfill Experiments] No more DRIs to process. Migration complete!",
        );
        break;
      }

      logger.info(
        `[Backfill Experiments] Processing chunk of ${dris.length} DRIs (total processed: ${state.totalProcessed}/${state.totalDRIs ?? "?"})`,
      );

      // Extract unique project and trace IDs
      const projectIds = [...new Set(dris.map((dri) => dri.project_id))];
      const traceIds = [...new Set(dris.map((dri) => dri.trace_id))];

      // Fetch observations and traces
      const [observations, traces] = await Promise.all([
        this.fetchObservationsForTraces(projectIds, traceIds),
        this.fetchTracesForTraces(projectIds, traceIds),
      ]);

      logger.info(
        `[Backfill Experiments] Fetched ${observations.length} observations and ${traces.length} traces`,
      );

      // Build span maps
      const allSpans = [...observations, ...traces];
      const { spanMap, childMap } = buildSpanMaps(allSpans);

      // Build trace properties map
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

      // Process each DRI and collect enriched spans
      const allEnrichedSpans: EnrichedSpan[] = [];
      const processedSpanIds = new Set<string>();
      let skippedCount = 0;

      for (const dri of dris) {
        const rootSpanId = dri.observation_id || `t-${dri.trace_id}`;
        const rootSpan = spanMap.get(rootSpanId);

        if (!rootSpan) {
          logger.warn(
            `[Backfill Experiments] Root span ${rootSpanId} not found for DRI ${dri.id}, skipping`,
          );
          skippedCount++;
          continue;
        }

        const traceProperties = tracePropertiesMap.get(dri.trace_id);
        const childSpans = findAllChildren(rootSpanId, childMap);

        const enrichedSpans = enrichSpansWithExperiment(
          rootSpan,
          childSpans,
          dri,
          traceProperties,
        );

        allEnrichedSpans.push(...enrichedSpans);

        // Track processed spans
        processedSpanIds.add(rootSpan.span_id);
        for (const child of childSpans) {
          processedSpanIds.add(child.span_id);
        }
      }

      if (skippedCount > 0) {
        logger.warn(
          `[Backfill Experiments] Skipped ${skippedCount} DRIs due to missing root spans`,
        );
      }

      // Write enriched spans to events table
      if (allEnrichedSpans.length > 0) {
        await writeEnrichedSpans(allEnrichedSpans);
        logger.info(
          `[Backfill Experiments] Wrote ${allEnrichedSpans.length} enriched spans to events table`,
        );
      }

      // Update cursor to last DRI in this chunk
      const lastDRI = dris[dris.length - 1];
      state.cursor = {
        project_id: lastDRI.project_id,
        dataset_id: lastDRI.dataset_id,
        dataset_run_id: lastDRI.dataset_run_id,
        id: lastDRI.id,
      };
      state.totalProcessed += dris.length;
      state.lastUpdated = new Date().toISOString();
      await this.updateState(state);
    }

    if (this.isAborted) {
      logger.info(
        `[Backfill Experiments] Migration aborted. Can be resumed from current state.`,
      );
      return;
    }

    logger.info(
      `[Backfill Experiments] Finished historic experiment backfill in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes. Total processed: ${state.totalProcessed.toLocaleString()}`,
    );
  }

  async abort(): Promise<void> {
    logger.info("[Backfill Experiments] Aborting historic experiment backfill");
    this.isAborted = true;
  }
}

// ============================================================================
// CLI Support
// ============================================================================

async function main() {
  const args = parseArgs({
    options: {
      chunkSize: {
        type: "string",
        short: "c",
        default: String(DEFAULT_CHUNK_SIZE),
      },
      batchTimeoutMs: {
        type: "string",
        short: "t",
        default: String(DEFAULT_BATCH_TIMEOUT_MS),
      },
      maxDate: {
        type: "string",
        short: "m",
        default: undefined,
      },
    },
  });

  const migration = new BackfillExperimentsHistoric();
  const validation = await migration.validate(args.values);

  if (!validation.valid) {
    logger.error(`Validation failed: ${validation.invalidReason}`);
    process.exit(1);
  }

  await migration.run(args.values);
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
