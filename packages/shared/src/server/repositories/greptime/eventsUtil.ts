import { Readable } from "stream";
import { type FilterCondition } from "../../../types";
import { type MetadataDomain } from "../../../domain";
import { type TracingSearchType } from "../../../interfaces/search";
import { greptimeKeysetScan, greptimeQuery } from "../../greptime/client";
import { quoteIdent } from "../../greptime/schemaUtils";
import { FilterList } from "../../greptime/sql/greptime-filter";
import { createGreptimeFilterFromFilterState } from "../../greptime/sql/factory";
import { observationsTableGreptimeColumnDefinitions } from "../../greptime/sql/columnMappings";
import { greptimeJson, selectJsonColumn } from "../../greptime/sql/rowContract";
import { eventsTableCols } from "../../../eventsTable";
import { eventsTableUiColumnDefinitions } from "../../tableMappings/mapEventsTable";
import {
  applyInputOutputRendering,
  type RenderingProps,
} from "../../utils/rendering";
import { parseMetadataCHRecordToDomain } from "../../utils/metadata_conversion";
import { greptimeInClause, greptimeTsParam, notDeleted } from "./queryHelpers";

/**
 * GreptimeDB events "utility + eval-stream + batch-IO" reads (04-read-path.md, P5). GreptimeDB has no
 * `events_*` event-log tables; every read here collapses onto the merged `observations` projection
 * (plus `traces` / `dataset_run_items` joins). The legacy event-array columns (metadata_names/values,
 * experiment_item_*_names) are replaced by native JSON columns and the DRI projection.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const minus = (d: Date, ms: number) => new Date(d.getTime() - ms);

// ---------------------------------------------------------------------------
// batch-IO output shapes (mirrors events.ts EventBatchIO*Output)
// ---------------------------------------------------------------------------

type EventBatchIOStringOutput = {
  id: string;
  input: string | null;
  output: string | null;
  metadata: MetadataDomain;
};

type EventBatchIOWithExperimentOutput = EventBatchIOStringOutput & {
  experimentItemExpectedOutput: string | null;
  experimentItemMetadata: MetadataDomain;
};

const BATCH_IO_STRING_RENDERING_PROPS: RenderingProps = {
  // Batch I/O truncation is left to the caller; this reader returns the raw projection strings.
  truncated: false,
  shouldJsonParse: false,
};

const applyBatchIOStringRendering = (
  io: string | null | undefined,
): string | null =>
  applyInputOutputRendering(io, BATCH_IO_STRING_RENDERING_PROPS) as
    | string
    | null;

// ---------------------------------------------------------------------------
// 1. avg cost per evaluator (last 7 days)
// ---------------------------------------------------------------------------

/**
 * Per-evaluator GENERATION avg cost + execution count over the last 7 days. Replaces the CH events
 * `avg(total_cost)` / `count(*)` grouped by `metadata['job_configuration_id']`. The evaluator id lives
 * in the observation `metadata` JSON (`json_get_string`), matching `getCostByEvaluatorIds`. CH used
 * `today() - 7` (UTC midnight 7 days ago), applied here app-side as an absolute lower bound.
 */
export const getAvgCostByEvaluatorIdsGreptime = async (
  projectId: string,
  evaluatorIds: string[],
): Promise<
  Array<{ evaluatorId: string; avgCost: number; executionCount: number }>
> => {
  if (evaluatorIds.length === 0) return [];

  const evalExpr = "json_get_string(o.metadata, 'job_configuration_id')";
  const params: Record<string, unknown> = { projectId };
  const placeholders = evaluatorIds.map((val, i) => {
    params[`ev${i}`] = val;
    return `:ev${i}`;
  });

  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  params.lookback = greptimeTsParam(minus(midnight, 7 * DAY_MS));

  const rows = await greptimeQuery<{
    evaluator_id: string | null;
    avg_cost: string | number | null;
    execution_count: string | number | null;
  }>({
    query: `
      SELECT ${evalExpr} AS evaluator_id,
        avg(o.total_cost) AS avg_cost,
        count(*) AS execution_count
      FROM observations o
      WHERE o.project_id = :projectId AND o.type = 'GENERATION'
        AND o.start_time >= :lookback
        AND ${evalExpr} IN (${placeholders.join(", ")})
        AND ${notDeleted("o")}
      GROUP BY ${evalExpr}`,
    params,
    readOnly: true,
  });

  return rows
    .filter((r) => r.evaluator_id != null)
    .map((r) => ({
      evaluatorId: String(r.evaluator_id),
      avgCost: Number(r.avg_cost ?? 0),
      executionCount: Number(r.execution_count ?? 0),
    }));
};

// ---------------------------------------------------------------------------
// 2. batch I/O (per-observation input/output/metadata, optional experiment fields)
// ---------------------------------------------------------------------------

/**
 * Per-observation input/output/metadata for the batch-IO view. Replaces the CH events_core/events_full
 * read (`leftUTF8` truncation handled by the caller's rendering, not in SQL here). Window is the
 * provided [minStartTime, maxStartTime] padded ±1 second, exactly as the CH version.
 *
 * When `includeExperimentFields` is set, the item's `dataset_item_expected_output` and
 * `dataset_item_metadata` are joined from the deduped `dataset_run_items` projection by `trace_id`
 * (an experiment item == a DRI row; `experiment_item_root_span_id == observation_id`). The DRI dedup
 * mirrors `getExperimentItemsBatchIORowsGreptime`. If a trace has no DRI row, the two experiment fields
 * fall back to `null` / `{}`.
 */
export const getObservationsBatchIOFromEventsGreptime = async <
  TIncludeExperiment extends boolean = false,
>(opts: {
  projectId: string;
  observations: Array<{ id: string; traceId: string }>;
  minStartTime: Date;
  maxStartTime: Date;
  truncated?: boolean;
  includeExperimentFields?: TIncludeExperiment;
}): Promise<
  Array<
    TIncludeExperiment extends true
      ? EventBatchIOWithExperimentOutput
      : EventBatchIOStringOutput
  >
> => {
  if (opts.observations.length === 0) return [];

  const observationIds = opts.observations.map((o) => o.id);
  const traceIds = [...new Set(opts.observations.map((o) => o.traceId))];

  // ±1 second buffer (matches the CH version).
  const minTs = greptimeTsParam(new Date(opts.minStartTime.getTime() - 1000));
  const maxTs = greptimeTsParam(new Date(opts.maxStartTime.getTime() + 1000));

  const obsIds = greptimeInClause("id", observationIds, "oid");
  const tids = greptimeInClause("trace_id", traceIds, "tid");

  if (!opts.includeExperimentFields) {
    const rows = await greptimeQuery<{
      id: string;
      input: string | null;
      output: string | null;
      metadata: unknown;
    }>({
      query: `
        SELECT o.id AS id, o.input AS input, o.output AS output,
          ${selectJsonColumn("metadata", { tablePrefix: "o" })}
        FROM observations o
        WHERE o.project_id = :projectId
          AND ${obsIds.sql} AND ${tids.sql}
          AND o.start_time >= :minTs AND o.start_time <= :maxTs
          AND ${notDeleted("o")}`,
      params: {
        projectId: opts.projectId,
        ...obsIds.params,
        ...tids.params,
        minTs,
        maxTs,
      },
      readOnly: true,
    });

    return rows.map((r) => ({
      id: r.id,
      input: applyBatchIOStringRendering(r.input),
      output: applyBatchIOStringRendering(r.output),
      metadata: parseMetadataCHRecordToDomain(
        greptimeJson<Record<string, string>>(r.metadata, {}),
      ),
    })) as Array<
      TIncludeExperiment extends true
        ? EventBatchIOWithExperimentOutput
        : EventBatchIOStringOutput
    >;
  }

  // Experiment fields: join the deduped DRI row for each observation's trace. The DRI dedup keeps the
  // latest physical row per logical (run, item) key (no QUALIFY in GreptimeDB -> outer rn = 1 filter).
  const driScope = `project_id = :projectId AND ${tids.sql} AND ${notDeleted()}`;
  const driCols = [
    "trace_id",
    "dataset_item_expected_output",
    "dataset_item_metadata",
  ];
  const dedup =
    `SELECT ${driCols.map((c) => quoteIdent(c)).join(", ")} FROM (` +
    `SELECT ${driCols.map((c) => quoteIdent(c)).join(", ")}, ROW_NUMBER() OVER (` +
    `PARTITION BY ${quoteIdent("project_id")}, ${quoteIdent("dataset_id")}, ` +
    `${quoteIdent("dataset_run_id")}, ${quoteIdent("dataset_item_id")} ` +
    `ORDER BY ${quoteIdent("created_at")} DESC, ${quoteIdent("updated_at")} DESC, ${quoteIdent("id")} DESC) AS rn ` +
    `FROM ${quoteIdent("dataset_run_items")} WHERE ${driScope}) d WHERE d.rn = 1`;

  const rows = await greptimeQuery<{
    id: string;
    input: string | null;
    output: string | null;
    metadata: unknown;
    experiment_item_expected_output: string | null;
    experiment_item_metadata: unknown;
  }>({
    query: `
      WITH dri_dedup AS (${dedup})
      SELECT o.id AS id, o.input AS input, o.output AS output,
        ${selectJsonColumn("metadata", { tablePrefix: "o" })},
        dri.${quoteIdent("dataset_item_expected_output")} AS experiment_item_expected_output,
        ${selectJsonColumn("dataset_item_metadata", { tablePrefix: "dri", alias: "experiment_item_metadata" })}
      FROM observations o
      LEFT JOIN dri_dedup dri ON dri.${quoteIdent("trace_id")} = o.trace_id
      WHERE o.project_id = :projectId
        AND ${obsIds.sql} AND ${tids.sql}
        AND o.start_time >= :minTs AND o.start_time <= :maxTs
        AND ${notDeleted("o")}`,
    params: {
      projectId: opts.projectId,
      ...obsIds.params,
      ...tids.params,
      minTs,
      maxTs,
    },
    readOnly: true,
  });

  return rows.map((r) => ({
    id: r.id,
    input: applyBatchIOStringRendering(r.input),
    output: applyBatchIOStringRendering(r.output),
    metadata: parseMetadataCHRecordToDomain(
      greptimeJson<Record<string, string>>(r.metadata, {}),
    ),
    experimentItemExpectedOutput: r.experiment_item_expected_output ?? null,
    experimentItemMetadata: parseMetadataCHRecordToDomain(
      greptimeJson<Record<string, string>>(r.experiment_item_metadata, {}),
    ),
  })) as Array<
    TIncludeExperiment extends true
      ? EventBatchIOWithExperimentOutput
      : EventBatchIOStringOutput
  >;
};

// ---------------------------------------------------------------------------
// 3. latest SDK version info
// ---------------------------------------------------------------------------

/**
 * SDK metadata detection result (kept identical to the CH `SdkMetadata` so the swap typechecks).
 */
export type SdkMetadata = {
  isOtel: boolean;
  name?: string;
  version?: string;
  language?: string;
};

/**
 * Extract SDK info from a v3-style observation metadata object.
 * `scope: {name, version}`, `resourceAttributes: {"telemetry.sdk.language" / ".name": ...}`.
 */
function extractSdkInfoFromMetadata(metadata: Record<string, unknown>): {
  name?: string;
  version?: string;
  language?: string;
  telemetrySdkName?: string;
} {
  try {
    const scopeRaw = metadata["scope"];
    const resourceRaw = metadata["resourceAttributes"];

    const scope =
      typeof scopeRaw === "string" ? JSON.parse(scopeRaw) : (scopeRaw ?? null);
    const resource =
      typeof resourceRaw === "string"
        ? JSON.parse(resourceRaw)
        : (resourceRaw ?? null);

    const name = scope?.name;
    const version = scope?.version;
    const language = resource?.["telemetry.sdk.language"];
    const telemetrySdkName = resource?.["telemetry.sdk.name"];

    return {
      ...(name && { name }),
      ...(version && { version }),
      ...(language && { language }),
      ...(telemetrySdkName && { telemetrySdkName }),
    };
  } catch {
    return {};
  }
}

/**
 * Infers SDK details from the most recent observation in the past 7 days carrying SDK metadata.
 *
 * The GreptimeDB observations projection has no dedicated `scope_name` / `scope_version` /
 * `telemetry_sdk_language` columns (the CH events v4 fast path); that info lives inside the
 * observation `metadata` JSON (`scope`, `resourceAttributes`). Documented narrowing: the v4 direct
 * column path is unavailable, so detection always goes through the v3 metadata-extraction path —
 * faithful for OTel/v3 producers and a superset of what the columns encoded.
 */
export async function getLatestSdkVersionInfoFromEventsGreptime(params: {
  projectId: string;
}): Promise<SdkMetadata> {
  const { projectId } = params;
  const sevenDaysAgo = greptimeTsParam(new Date(Date.now() - 7 * DAY_MS));

  const rows = await greptimeQuery<{ metadata: unknown }>({
    query: `
      SELECT ${selectJsonColumn("metadata", { tablePrefix: "o" })}
      FROM observations o
      WHERE o.project_id = :projectId
        AND o.start_time >= :lookback
        AND (
          json_get_string(o.metadata, 'scope.name') IS NOT NULL
          OR json_get_string(o.metadata, 'scope') IS NOT NULL
        )
        AND ${notDeleted("o")}
      ORDER BY o.start_time DESC
      LIMIT 1`,
    params: { projectId, lookback: sevenDaysAgo },
    readOnly: true,
  });

  if (rows.length === 0) return { isOtel: false };

  const metadata = greptimeJson<Record<string, unknown>>(rows[0].metadata, {});
  const { telemetrySdkName, ...sdkInfo } = extractSdkInfoFromMetadata(metadata);
  return {
    isOtel:
      telemetrySdkName === "opentelemetry" ||
      Boolean(sdkInfo.name || sdkInfo.version || sdkInfo.language),
    ...sdkInfo,
  };
}

// ---------------------------------------------------------------------------
// 4. eval stream (lightweight observation stream for batch evaluation)
// ---------------------------------------------------------------------------

type EvalEventRow = {
  id: string;
  span_id: string;
  parent_span_id: string | null;
  trace_id: string;
  project_id: string;
  parent_observation_id: string | null;
  type: string;
  name: string | null;
  environment: string | null;
  version: string | null;
  level: string;
  status_message: string | null;
  trace_name: string | null;
  user_id: string | null;
  session_id: string | null;
  tags: string[];
  release: string | null;
  provided_model_name: string | null;
  model_parameters: unknown;
  prompt_id: string | null;
  prompt_name: string | null;
  prompt_version: number | null;
  provided_usage_details: Record<string, number>;
  usage_details: Record<string, number>;
  provided_cost_details: Record<string, number>;
  cost_details: Record<string, number>;
  tool_definitions: Record<string, unknown>;
  tool_calls: unknown[];
  tool_call_names: string[];
  input: unknown;
  output: unknown;
  metadata: Record<string, unknown> | null;
  experiment_id: string | null;
  experiment_item_root_span_id: string | null;
  experiment_item_expected_output: string | null;
  experiment_item_metadata: Record<string, unknown> | null;
};

/**
 * Lightweight observation stream for batch observation evaluation. Replaces the CH events stream
 * (`selectFieldSet("eval")`). Pages the `observations` projection by the keyset `(start_time, id)` DESC
 * (page size 1000, honoring rowLimit), LEFT JOINing `traces t` per page for the denormalized
 * trace-level fields. Each row is mapped to the `ObservationForEval` field names the consumer parses —
 * crucially `span_id = id` and `parent_span_id = parent_observation_id`.
 *
 * The `cutoffCreatedAt` becomes a `start_time < cutoff` bound. The `filter` (event-only columns;
 * scores/comments columns are dropped exactly as the CH path does) is translated through
 * `createGreptimeFilterFromFilterState` against the observations column mappings; any column that does
 * not resolve to an observations/traces projection column is skipped (best-effort — the eval filter is
 * minimal). `experiment_*` fields are null: there is no events table denormalizing them here.
 */
export const getEventsStreamForEvalGreptime = async (props: {
  projectId: string;
  cutoffCreatedAt?: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit: number;
}): Promise<Readable> => {
  const { projectId, cutoffCreatedAt, filter, rowLimit } = props;

  // Drop scores/comments columns (mirrors the CH eventOnlyFilters narrowing), then keep only columns
  // that resolve to an observations/traces projection mapping so the translator never throws on an
  // event-only synthetic column.
  const resolvableFilters = (filter ?? []).filter((f) => {
    const columnDef = eventsTableUiColumnDefinitions.find(
      (col) => col.uiTableName === f.column || col.uiTableId === f.column,
    );
    if (
      columnDef?.clickhouseTableName === "scores" ||
      columnDef?.clickhouseTableName === "comments"
    ) {
      return false;
    }
    return observationsTableGreptimeColumnDefinitions.some(
      (c) => c.uiTableId === f.column || c.uiTableName === f.column,
    );
  });

  const filterList = new FilterList(
    createGreptimeFilterFromFilterState(
      resolvableFilters,
      observationsTableGreptimeColumnDefinitions,
      eventsTableCols,
    ),
  );
  const applied = filterList.apply();

  const baseParams: Record<string, string | number | null> = {
    projectId,
    ...(applied.params as Record<string, string | number | null>),
    ...(cutoffCreatedAt ? { cutoff: greptimeTsParam(cutoffCreatedAt) } : {}),
  };

  // Bound the total emitted rows by rowLimit across pages.
  let remaining = rowLimit;

  const generator = greptimeKeysetScan<Record<string, unknown>>({
    cursorColumns: ["o.start_time", "o.id"],
    cursorOf: (row) => [
      (row.start_time as Date)?.toISOString?.() ??
        (row.start_time as string | null),
      row.id as string,
    ],
    direction: "DESC",
    pageSize: 1000,
    readOnly: true,
    buildPage: (seekPredicate, _cursor, limit) => {
      const pageLimit = Math.min(limit, Math.max(remaining, 0));
      return {
        query: `
          SELECT
            o.id AS id, o.trace_id AS trace_id, o.project_id AS project_id,
            o.parent_observation_id AS parent_observation_id,
            o.type AS type, o.name AS name, o.environment AS environment,
            o.version AS version, o.level AS level, o.status_message AS status_message,
            o.provided_model_name AS provided_model_name,
            ${selectJsonColumn("model_parameters", { tablePrefix: "o" })},
            o.prompt_id AS prompt_id, o.prompt_name AS prompt_name, o.prompt_version AS prompt_version,
            ${selectJsonColumn("provided_usage_details", { tablePrefix: "o" })},
            ${selectJsonColumn("usage_details", { tablePrefix: "o" })},
            ${selectJsonColumn("provided_cost_details", { tablePrefix: "o" })},
            ${selectJsonColumn("cost_details", { tablePrefix: "o" })},
            ${selectJsonColumn("tool_definitions", { tablePrefix: "o" })},
            ${selectJsonColumn("tool_calls", { tablePrefix: "o" })},
            ${selectJsonColumn("tool_call_names", { tablePrefix: "o" })},
            o.input AS input, o.output AS output,
            ${selectJsonColumn("metadata", { tablePrefix: "o" })},
            t.name AS trace_name, t.user_id AS user_id, t.session_id AS session_id,
            ${selectJsonColumn("tags", { tablePrefix: "t" })}, t.release AS release
          FROM observations o
          LEFT JOIN traces t ON t.id = o.trace_id AND t.project_id = o.project_id AND ${notDeleted("t")}
          WHERE o.project_id = :projectId AND ${notDeleted("o")}
            ${cutoffCreatedAt ? "AND o.start_time < :cutoff" : ""}
            ${applied.query ? `AND ${applied.query}` : ""}
            ${seekPredicate ? `AND ${seekPredicate}` : ""}
          ORDER BY o.start_time DESC, o.id DESC
          LIMIT ${Math.max(pageLimit, 1)}`,
        params: baseParams,
      };
    },
  });

  async function* mapRows(): AsyncGenerator<EvalEventRow> {
    for await (const row of generator) {
      if (remaining <= 0) return;
      remaining -= 1;
      const tags = greptimeJson<string[]>(row.tags, []);
      yield {
        id: row.id as string,
        span_id: row.id as string,
        parent_span_id: (row.parent_observation_id as string | null) ?? null,
        trace_id: row.trace_id as string,
        project_id: row.project_id as string,
        parent_observation_id:
          (row.parent_observation_id as string | null) ?? null,
        type: row.type as string,
        name: (row.name as string | null) ?? null,
        environment: (row.environment as string | null) ?? null,
        version: (row.version as string | null) ?? null,
        level: (row.level as string | null) ?? "DEFAULT",
        status_message: (row.status_message as string | null) ?? null,
        trace_name: (row.trace_name as string | null) ?? null,
        user_id: (row.user_id as string | null) ?? null,
        session_id: (row.session_id as string | null) ?? null,
        tags,
        release: (row.release as string | null) ?? null,
        provided_model_name: (row.provided_model_name as string | null) ?? null,
        model_parameters: greptimeJson(row.model_parameters, null),
        prompt_id: (row.prompt_id as string | null) ?? null,
        prompt_name: (row.prompt_name as string | null) ?? null,
        prompt_version:
          row.prompt_version == null ? null : Number(row.prompt_version),
        provided_usage_details: greptimeJson(row.provided_usage_details, {}),
        usage_details: greptimeJson(row.usage_details, {}),
        provided_cost_details: greptimeJson(row.provided_cost_details, {}),
        cost_details: greptimeJson(row.cost_details, {}),
        tool_definitions: greptimeJson(row.tool_definitions, {}),
        tool_calls: greptimeJson(row.tool_calls, []),
        tool_call_names: greptimeJson(row.tool_call_names, []),
        // input/output are stored as raw projection strings; the eval schema accepts `unknown`, and
        // downstream variable mapping treats them as raw payloads (no parse here, matching the CH path).
        input: (row.input as unknown) ?? null,
        output: (row.output as unknown) ?? null,
        metadata: parseMetadataCHRecordToDomain(
          greptimeJson<Record<string, string>>(row.metadata, {}),
        ) as Record<string, unknown>,
        experiment_id: null,
        experiment_item_root_span_id: null,
        experiment_item_expected_output: null,
        experiment_item_metadata: null,
      };
    }
  }

  return Readable.from(mapRows());
};
