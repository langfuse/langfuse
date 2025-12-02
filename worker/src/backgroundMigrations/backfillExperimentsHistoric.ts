import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  commandClickhouse,
  logger,
  queryClickhouse,
  flattenJsonToPathArrays,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import { parseArgs } from "node:util";

// Hard-coded migration ID (must match the Prisma migration INSERT)
const backgroundMigrationId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

// Configuration defaults
const DEFAULT_CHUNK_SIZE = 10_000;
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
}

interface DatasetRunItem {
  id: string;
  project_id: string;
  trace_id: string;
  observation_id: string | null;
  dataset_run_id: string;
  dataset_run_name: string;
  dataset_run_description: string;
  dataset_run_metadata: Record<string, unknown>;
  dataset_id: string;
  dataset_item_id: string;
  dataset_item_expected_output: string;
  dataset_item_metadata: Record<string, unknown>;
  created_at: string;
}

interface SpanRecord {
  project_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  start_time: string;
  end_time: string | null;
  name: string;
  type: string;
  environment: string;
  version: string;
  release: string;
  input: string;
  output: string;
  level: string;
  status_message: string;
  completion_start_time: string | null;
  prompt_id: string;
  prompt_name: string;
  prompt_version: string | null;
  model_id: string;
  provided_model_name: string;
  model_parameters: string;
  provided_usage_details: Record<string, number> | null;
  usage_details: Record<string, number> | null;
  provided_cost_details: Record<string, number> | null;
  cost_details: Record<string, number> | null;
  total_cost: number;
  metadata: Record<string, unknown>;
  source: string;
  tags: Array<string>;
  bookmarked: boolean;
  public: boolean;
  user_id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  event_ts: string;
  is_deleted: number;
}

interface EnrichedSpan extends SpanRecord {
  experiment_id: string;
  experiment_name: string;
  experiment_metadata_names: string[];
  experiment_metadata_values: Array<string | null | undefined>;
  experiment_description: string;
  experiment_dataset_id: string;
  experiment_item_id: string;
  experiment_item_root_span_id: string;
  experiment_item_expected_output: string;
  experiment_item_metadata_names: string[];
  experiment_item_metadata_values: Array<string | null | undefined>;
}

interface TraceProperties {
  userId: string;
  sessionId: string;
  version: string;
  release: string;
  tags: string[];
  bookmarked: boolean;
  public: boolean;
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

  private async countTotalDRIs(): Promise<number> {
    const result = await queryClickhouse<{ count: string }>({
      query: `SELECT count(*) as count FROM dataset_run_items_rmt`,
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
          dri.dataset_item_expected_output,
          dri.dataset_item_metadata,
          dri.created_at
        FROM dataset_run_items_rmt AS dri
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
          dri.dataset_item_expected_output,
          dri.dataset_item_metadata,
          dri.created_at
        FROM dataset_run_items_rmt AS dri
        WHERE (dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.id) >
              ({cursor_project_id: String}, {cursor_dataset_id: String}, {cursor_dataset_run_id: String}, {cursor_id: String})
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
          }
        : { chunkSize },
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
        o.metadata,
        multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel', 'ingestion-api') AS source,
        [] AS tags,
        false AS bookmarked,
        false AS public,
        '' AS user_id,
        '' AS session_id,
        o.created_at,
        o.updated_at,
        o.event_ts,
        o.is_deleted
      FROM observations_pid_tid_sorting o
      WHERE o.project_id IN {projectIds: Array(String)}
        AND o.trace_id IN {traceIds: Array(String)}
      ORDER BY o.event_ts DESC
      LIMIT 1 BY o.project_id, o.id
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
        coalesce(t.name, '') AS name,
        'SPAN' AS type,
        coalesce(t.environment, '') AS environment,
        coalesce(t.version, '') AS version,
        coalesce(t.release, '') AS release,
        coalesce(t.input, '') AS input,
        coalesce(t.output, '') AS output,
        'DEFAULT' AS level,
        '' AS status_message,
        NULL AS completion_start_time,
        '' AS prompt_id,
        '' AS prompt_name,
        NULL AS prompt_version,
        '' AS model_id,
        '' AS provided_model_name,
        '{}' AS model_parameters,
        map() AS provided_usage_details,
        map() AS usage_details,
        map() AS provided_cost_details,
        map() AS cost_details,
        0 AS total_cost,
        t.metadata,
        multiIf(mapContains(t.metadata, 'resourceAttributes'), 'otel', 'ingestion-api') AS source,
        t.tags,
        t.bookmarked,
        t.public,
        coalesce(t.user_id, '') AS user_id,
        coalesce(t.session_id, '') AS session_id,
        t.created_at,
        t.updated_at,
        t.event_ts,
        t.is_deleted
      FROM traces_pid_tid_sorting t
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
  // Span Enrichment (adapted from handleExperimentBackfill.ts)
  // --------------------------------------------------------------------------

  private buildSpanMaps(spans: SpanRecord[]): {
    spanMap: Map<string, SpanRecord>;
    childMap: Map<string, SpanRecord[]>;
  } {
    const spanMap = new Map<string, SpanRecord>();
    const childMap = new Map<string, SpanRecord[]>();

    for (const span of spans) {
      spanMap.set(span.span_id, span);

      const parentId = span.parent_span_id;
      if (!childMap.has(parentId)) {
        childMap.set(parentId, []);
      }
      childMap.get(parentId)!.push(span);
    }

    return { spanMap, childMap };
  }

  private findAllChildren(
    rootSpanId: string,
    childMap: Map<string, SpanRecord[]>,
  ): SpanRecord[] {
    const children: SpanRecord[] = [];
    const queue: string[] = [rootSpanId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const directChildren = childMap.get(currentId) || [];

      for (const child of directChildren) {
        children.push(child);
        queue.push(child.span_id);
      }
    }

    return children;
  }

  private enrichSpansWithExperiment(
    rootSpan: SpanRecord,
    childSpans: SpanRecord[],
    dri: DatasetRunItem,
    traceProperties: TraceProperties | undefined,
  ): EnrichedSpan[] {
    const enrichedSpans: EnrichedSpan[] = [];

    const experimentMetadataFlattened = flattenJsonToPathArrays(
      dri.dataset_run_metadata,
    );
    const experimentItemMetadataFlattened = flattenJsonToPathArrays(
      dri.dataset_item_metadata,
    );

    // Enrich root span
    enrichedSpans.push({
      ...rootSpan,
      user_id: traceProperties?.userId || "",
      session_id: traceProperties?.sessionId || "",
      version: rootSpan.version || traceProperties?.version || "",
      release: traceProperties?.release || "",
      tags: traceProperties?.tags || [],
      bookmarked: traceProperties?.bookmarked || false,
      public: traceProperties?.public || false,
      experiment_id: dri.dataset_run_id,
      experiment_name: dri.dataset_run_name,
      experiment_metadata_names: experimentMetadataFlattened.names,
      experiment_metadata_values: experimentMetadataFlattened.values,
      experiment_description: dri.dataset_run_description,
      experiment_dataset_id: dri.dataset_id,
      experiment_item_id: dri.dataset_item_id,
      experiment_item_root_span_id: rootSpan.span_id,
      experiment_item_expected_output: dri.dataset_item_expected_output,
      experiment_item_metadata_names: experimentItemMetadataFlattened.names,
      experiment_item_metadata_values: experimentItemMetadataFlattened.values,
    });

    // Enrich child spans
    for (const child of childSpans) {
      enrichedSpans.push({
        ...child,
        user_id: traceProperties?.userId || "",
        session_id: traceProperties?.sessionId || "",
        version: child.version || traceProperties?.version || "",
        release: traceProperties?.release || "",
        tags: traceProperties?.tags || [],
        public: traceProperties?.public || false,
        bookmarked: false, // Only root span is bookmarked
        experiment_id: dri.dataset_run_id,
        experiment_name: dri.dataset_run_name,
        experiment_metadata_names: experimentMetadataFlattened.names,
        experiment_metadata_values: experimentMetadataFlattened.values,
        experiment_description: dri.dataset_run_description,
        experiment_dataset_id: dri.dataset_id,
        experiment_item_id: dri.dataset_item_id,
        experiment_item_root_span_id: rootSpan.span_id,
        experiment_item_expected_output: dri.dataset_item_expected_output,
        experiment_item_metadata_names: experimentItemMetadataFlattened.names,
        experiment_item_metadata_values: experimentItemMetadataFlattened.values,
      });
    }

    return enrichedSpans;
  }

  // --------------------------------------------------------------------------
  // Batch Writing
  // --------------------------------------------------------------------------

  private async writeEnrichedSpansToEvents(
    spans: EnrichedSpan[],
    timeoutMs: number,
  ): Promise<void> {
    if (spans.length === 0) return;

    // Build VALUES clause for batch insert
    const values = spans
      .map((span) => {
        const metadataNames = Object.keys(span.metadata || {});
        const metadataValues = Object.values(span.metadata || {}).map((v) =>
          typeof v === "string" ? v : JSON.stringify(v),
        );

        return `(
          '${this.escapeString(span.project_id)}',
          '${this.escapeString(span.trace_id)}',
          '${this.escapeString(span.span_id)}',
          '${this.escapeString(span.parent_span_id)}',
          parseDateTimeBestEffort('${span.start_time}'),
          ${span.end_time ? `parseDateTimeBestEffort('${span.end_time}')` : "NULL"},
          '${this.escapeString(span.name)}',
          '${this.escapeString(span.type)}',
          '${this.escapeString(span.environment)}',
          '${this.escapeString(span.version)}',
          '${this.escapeString(span.release)}',
          [${span.tags.map((t) => `'${this.escapeString(t)}'`).join(",")}],
          ${span.public ? 1 : 0},
          ${span.bookmarked ? 1 : 0},
          '${this.escapeString(span.user_id)}',
          '${this.escapeString(span.session_id)}',
          '${this.escapeString(span.level)}',
          '${this.escapeString(span.status_message)}',
          ${span.completion_start_time ? `parseDateTimeBestEffort('${span.completion_start_time}')` : "NULL"},
          '${this.escapeString(span.prompt_id)}',
          '${this.escapeString(span.prompt_name)}',
          ${span.prompt_version !== null ? span.prompt_version : "NULL"},
          '${this.escapeString(span.model_id)}',
          '${this.escapeString(span.provided_model_name)}',
          '${this.escapeString(span.model_parameters)}',
          ${this.formatMapUInt64(span.provided_usage_details)},
          ${this.formatMapUInt64(span.usage_details)},
          ${this.formatMapDecimal(span.provided_cost_details)},
          ${this.formatMapDecimal(span.cost_details)},
          '${this.escapeString(span.input)}',
          '${this.escapeString(span.output)}',
          CAST('${this.escapeString(JSON.stringify(span.metadata || {}))}', 'JSON'),
          [${metadataNames.map((n) => `'${this.escapeString(n)}'`).join(",")}],
          [${metadataValues.map((v) => `'${this.escapeString(v)}'`).join(",")}],
          '${this.escapeString(span.source)}',
          '' AS blob_storage_file_path,
          0 AS event_bytes,
          parseDateTimeBestEffort('${span.created_at}'),
          parseDateTimeBestEffort('${span.updated_at}'),
          parseDateTimeBestEffort('${span.event_ts}'),
          ${span.is_deleted},
          '${this.escapeString(span.experiment_id)}',
          '${this.escapeString(span.experiment_name)}',
          [${span.experiment_metadata_names.map((n) => `'${this.escapeString(n)}'`).join(",")}],
          [${span.experiment_metadata_values.map((v) => `${v === null || v === undefined ? "NULL" : `'${this.escapeString(String(v))}'`}`).join(",")}],
          '${this.escapeString(span.experiment_description)}',
          '${this.escapeString(span.experiment_dataset_id)}',
          '${this.escapeString(span.experiment_item_id)}',
          '${this.escapeString(span.experiment_item_root_span_id)}',
          '${this.escapeString(span.experiment_item_expected_output)}',
          [${span.experiment_item_metadata_names.map((n) => `'${this.escapeString(n)}'`).join(",")}],
          [${span.experiment_item_metadata_values.map((v) => `${v === null || v === undefined ? "NULL" : `'${this.escapeString(String(v))}'`}`).join(",")}]
        )`;
      })
      .join(",\n");

    const query = `
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
        release,
        tags,
        public,
        bookmarked,
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
        input,
        output,
        metadata,
        metadata_names,
        metadata_raw_values,
        source,
        blob_storage_file_path,
        event_bytes,
        created_at,
        updated_at,
        event_ts,
        is_deleted,
        experiment_id,
        experiment_name,
        experiment_metadata_names,
        experiment_metadata_values,
        experiment_description,
        experiment_dataset_id,
        experiment_item_id,
        experiment_item_root_span_id,
        experiment_item_expected_output,
        experiment_item_metadata_names,
        experiment_item_metadata_values
      )
      VALUES ${values}
    `;

    await commandClickhouse({
      query,
      tags: {
        feature: "background-migration",
        operation: "writeEnrichedSpansToEvents",
      },
      clickhouseConfigs: {
        request_timeout: timeoutMs,
      },
      clickhouseSettings: {
        http_headers_progress_interval_ms: "100000",
        type_json_skip_duplicated_paths: 1,
      },
    });
  }

  private escapeString(str: string): string {
    if (!str) return "";
    return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  private formatMapUInt64(
    map: Record<string, number> | null | undefined,
  ): string {
    if (!map || Object.keys(map).length === 0) return "map()";
    const entries = Object.entries(map)
      .map(([k, v]) => `'${this.escapeString(k)}', toUInt64(${v})`)
      .join(", ");
    return `map(${entries})`;
  }

  private formatMapDecimal(
    map: Record<string, number> | null | undefined,
  ): string {
    if (!map || Object.keys(map).length === 0) return "map()";
    const entries = Object.entries(map)
      .map(([k, v]) => `'${this.escapeString(k)}', toDecimal64(${v}, 12)`)
      .join(", ");
    return `map(${entries})`;
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

    const requiredTables = [
      "events",
      "observations_pid_tid_sorting",
      "traces_pid_tid_sorting",
      "dataset_run_items_rmt",
    ];

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

    logger.info(
      `[Backfill Experiments] Starting historic experiment backfill with args: ${JSON.stringify({ chunkSize, batchTimeoutMs })}`,
    );

    // Load state
    let state = await this.loadState();

    // Get total count on first run
    if (state.totalDRIs === null) {
      state.totalDRIs = await this.countTotalDRIs();
      await this.updateState(state);
      logger.info(
        `[Backfill Experiments] Total DRIs to process: ${state.totalDRIs.toLocaleString()}`,
      );
    }

    // Main processing loop
    while (!this.isAborted) {
      // Fetch next chunk
      const dris = await this.fetchDRIsChunk(state.cursor, chunkSize);

      if (dris.length === 0) {
        logger.info(
          "[Backfill Experiments] No more DRIs to process. Migration complete!",
        );
        break;
      }

      logger.info(
        `[Backfill Experiments] Processing chunk of ${dris.length} DRIs (total processed: ${state.totalProcessed.toLocaleString()}/${state.totalDRIs?.toLocaleString() ?? "?"})`,
      );

      // Extract unique project and trace IDs
      const projectIds = [...new Set(dris.map((dri) => dri.project_id))];
      const traceIds = [...new Set(dris.map((dri) => dri.trace_id))];

      // Fetch observations and traces
      const [observations, traces] = await Promise.all([
        this.fetchObservationsForTraces(projectIds, traceIds),
        this.fetchTracesForTraces(projectIds, traceIds),
      ]);

      logger.debug(
        `[Backfill Experiments] Fetched ${observations.length} observations and ${traces.length} traces`,
      );

      // Build span maps
      const allSpans = [...observations, ...traces];
      const { spanMap, childMap } = this.buildSpanMaps(allSpans);

      // Build trace properties map
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
        const childSpans = this.findAllChildren(rootSpanId, childMap);

        const enrichedSpans = this.enrichSpansWithExperiment(
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
        await this.writeEnrichedSpansToEvents(allEnrichedSpans, batchTimeoutMs);
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
