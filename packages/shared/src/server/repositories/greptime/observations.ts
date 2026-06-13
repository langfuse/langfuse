import { prisma } from "../../../db";
import { InternalServerError, LangfuseNotFoundError } from "../../../errors";
import { type FilterState } from "../../../types";
import { type ObservationType } from "../../../domain";
import { observationsTableCols } from "../../../observationsTable";
import { env } from "../../../env";
import { greptimeQuery } from "../../greptime/client";
import { recordDistribution } from "../../instrumentation";
import { logger } from "../../logger";
import {
  DEFAULT_RENDERING_PROPS,
  type RenderingProps,
} from "../../utils/rendering";
import { FilterList, StringFilter } from "../../greptime/sql/greptime-filter";
import { createGreptimeFilterFromFilterState } from "../../greptime/sql/factory";
import {
  observationsTableGreptimeColumnDefinitions,
  type GreptimeColumnMappings,
} from "../../greptime/sql/columnMappings";
import {
  convertGreptimeObservationRowToDomain,
  greptimeObservationSelect,
} from "./converters";
import { greptimeJson, selectJsonColumn } from "../../greptime/sql/rowContract";
import { greptimeQuantile } from "../../greptime/sql/quantile";
import {
  greptimeDayBounds,
  greptimeInClause,
  greptimeTsParam,
  notDeleted,
} from "./queryHelpers";
import { type FilterList as ChFilterList } from "../../queries";
import { translateChFilterList } from "./translateChFilter";
import { type ScoreGrain } from "../../greptime/sql/greptime-filter";

/**
 * GreptimeDB core observation reads (04-read-path.md, P1). Plain SELECT on the merged projection
 * (drop FINAL / LIMIT 1 BY), `is_deleted = false`, explicit JSON-aware SELECT lists. The CH lookback
 * intervals (`start_time >= ts - INTERVAL ...`) are applied app-side as an absolute bound.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const minus = (d: Date, ms: number) => new Date(d.getTime() - ms);

const projectFilterWithState = (
  projectId: string,
  filter: FilterState,
  columns: GreptimeColumnMappings,
) => {
  const list = new FilterList([
    new StringFilter({
      table: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);
  list.push(
    ...createGreptimeFilterFromFilterState(
      filter,
      columns,
      observationsTableCols,
    ),
  );
  return list.apply();
};

export const checkObservationExists = async (
  projectId: string,
  id: string,
  startTime: Date | undefined,
): Promise<boolean> => {
  const rows = await greptimeQuery<{ id: string }>({
    query: `
      SELECT id FROM observations
      WHERE project_id = :projectId AND id = :id
        ${startTime ? "AND start_time >= :startLookback" : ""}
        AND ${notDeleted()}
      LIMIT 1`,
    params: {
      projectId,
      id,
      ...(startTime
        ? { startLookback: greptimeTsParam(minus(startTime, 2 * DAY_MS)) }
        : {}),
    },
    readOnly: true,
  });
  return rows.length > 0;
};

export const getObservationsForTrace = async <IncludeIO extends boolean>(opts: {
  traceId: string;
  projectId: string;
  timestamp?: Date;
  includeIO?: IncludeIO;
}) => {
  const { traceId, projectId, timestamp, includeIO = false } = opts;
  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT ${greptimeObservationSelect({ excludeIo: !includeIO, excludeMetadata: !includeIO })}
      FROM observations
      WHERE trace_id = :traceId AND project_id = :projectId
        ${timestamp ? "AND start_time >= :traceLookback" : ""}
        AND ${notDeleted()}`,
    params: {
      traceId,
      projectId,
      ...(timestamp
        ? { traceLookback: greptimeTsParam(minus(timestamp, HOUR_MS)) }
        : {}),
    },
    readOnly: true,
  });

  // Guard against pathologically large traces (mirrors the ClickHouse path, LFE-4882).
  let payloadSize = 0;
  for (const row of rows) {
    for (const key of ["input", "output", "metadata"] as const) {
      const v = row[key];
      if (typeof v === "string") payloadSize += v.length;
    }
    if (payloadSize >= env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES) {
      throw new Error(
        `Observations in trace are too large: ${(payloadSize / 1e6).toFixed(2)}MB exceeds limit of ${(env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES / 1e6).toFixed(2)}MB`,
      );
    }
  }

  return rows.map((row) => {
    const observation = convertGreptimeObservationRowToDomain(row);
    recordDistribution(
      "langfuse.query_by_id_age",
      new Date().getTime() - observation.startTime.getTime(),
      { table: "observations" },
    );
    return observation;
  });
};

export const getObservationForTraceIdByName = async ({
  traceId,
  projectId,
  name,
  timestamp,
  fetchWithInputOutput = false,
}: {
  traceId: string;
  projectId: string;
  name: string;
  timestamp?: Date;
  fetchWithInputOutput?: boolean;
}) => {
  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT ${greptimeObservationSelect({ excludeIo: !fetchWithInputOutput })}
      FROM observations
      WHERE trace_id = :traceId AND project_id = :projectId AND name = :name
        ${timestamp ? "AND start_time >= :traceLookback" : ""}
        AND ${notDeleted()}`,
    params: {
      traceId,
      projectId,
      name,
      ...(timestamp
        ? { traceLookback: greptimeTsParam(minus(timestamp, HOUR_MS)) }
        : {}),
    },
    readOnly: true,
  });
  return rows.map((row) => convertGreptimeObservationRowToDomain(row));
};

export const getObservationsById = async (
  ids: string[],
  projectId: string,
  fetchWithInputOutput: boolean = false,
) => {
  if (ids.length === 0) return [];
  const idList = greptimeInClause("id", ids, "oid");
  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT ${greptimeObservationSelect({ excludeIo: !fetchWithInputOutput })}
      FROM observations
      WHERE ${idList.sql} AND project_id = :projectId AND ${notDeleted()}`,
    params: { ...idList.params, projectId },
    readOnly: true,
  });
  return rows.map((row) => convertGreptimeObservationRowToDomain(row));
};

export const getObservationByIdFromObservationsTable = async ({
  id,
  projectId,
  fetchWithInputOutput = false,
  startTime,
  type,
  traceId,
  renderingProps = DEFAULT_RENDERING_PROPS,
}: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: ObservationType;
  traceId?: string;
  renderingProps?: RenderingProps;
}) => {
  const day = startTime ? greptimeDayBounds(startTime) : null;
  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT ${greptimeObservationSelect({ excludeIo: !fetchWithInputOutput })}
      FROM observations
      WHERE id = :id AND project_id = :projectId
        ${day ? "AND start_time >= :dayStart AND start_time < :dayEnd" : ""}
        ${type ? "AND type = :type" : ""}
        ${traceId ? "AND trace_id = :traceId" : ""}
        AND ${notDeleted()}`,
    params: {
      id,
      projectId,
      ...(day ? { dayStart: day.start, dayEnd: day.end } : {}),
      ...(type ? { type } : {}),
      ...(traceId ? { traceId } : {}),
    },
    readOnly: true,
  });

  const mapped = rows.map((row) =>
    convertGreptimeObservationRowToDomain(row, renderingProps),
  );
  mapped.forEach((observation) => {
    recordDistribution(
      "langfuse.query_by_id_age",
      new Date().getTime() - observation.startTime.getTime(),
      { table: "observations" },
    );
  });
  if (mapped.length === 0) {
    throw new LangfuseNotFoundError(`Observation with id ${id} not found`);
  }
  if (mapped.length > 1) {
    logger.error(
      `Multiple observations found for id ${id} and project ${projectId}`,
    );
    throw new InternalServerError(
      `Multiple observations found for id ${id} and project ${projectId}`,
    );
  }
  return mapped.shift();
};

// ---------------------------------------------------------------------------
// groupings (filter-option helpers)
// ---------------------------------------------------------------------------

export const getObservationsGroupedByModel = async (
  projectId: string,
  filter: FilterState,
) => {
  const applied = projectFilterWithState(
    projectId,
    filter,
    observationsTableGreptimeColumnDefinitions,
  );
  const res = await greptimeQuery<{ name: string }>({
    query: `
      SELECT o.provided_model_name AS name
      FROM observations o
      WHERE ${applied.query} AND o.type = 'GENERATION' AND ${notDeleted("o")}
        AND o.provided_model_name IS NOT NULL AND o.provided_model_name != ''
      GROUP BY o.provided_model_name
      ORDER BY count(*) DESC
      LIMIT 1000`,
    params: applied.params,
    readOnly: true,
  });
  return res.map((r) => ({ model: r.name }));
};

export const getObservationsGroupedByModelId = async (
  projectId: string,
  filter: FilterState,
) => {
  const applied = projectFilterWithState(
    projectId,
    filter,
    observationsTableGreptimeColumnDefinitions,
  );
  const res = await greptimeQuery<{ modelId: string }>({
    query: `
      SELECT o.internal_model_id AS modelId
      FROM observations o
      WHERE ${applied.query} AND o.type = 'GENERATION' AND ${notDeleted("o")}
        AND o.internal_model_id IS NOT NULL AND o.internal_model_id != ''
      GROUP BY o.internal_model_id
      ORDER BY count(*) DESC
      LIMIT 1000`,
    params: applied.params,
    readOnly: true,
  });
  return res.map((r) => ({ modelId: r.modelId }));
};

export const getObservationsGroupedByName = async (
  projectId: string,
  filter: FilterState,
  type: ObservationType | null = "GENERATION",
) => {
  const applied = projectFilterWithState(
    projectId,
    filter,
    observationsTableGreptimeColumnDefinitions,
  );
  return greptimeQuery<{ name: string }>({
    query: `
      SELECT o.name AS name
      FROM observations o
      WHERE ${applied.query} ${type ? "AND o.type = :type" : ""} AND ${notDeleted("o")}
        AND o.name IS NOT NULL AND o.name != ''
      GROUP BY o.name
      ORDER BY count(*) DESC
      LIMIT 1000`,
    params: { ...applied.params, ...(type ? { type } : {}) },
    readOnly: true,
  });
};

export const getObservationsGroupedByPromptName = async (
  projectId: string,
  filter: FilterState,
) => {
  const applied = projectFilterWithState(
    projectId,
    filter,
    observationsTableGreptimeColumnDefinitions,
  );
  const res = await greptimeQuery<{ id: string }>({
    query: `
      SELECT o.prompt_id AS id
      FROM observations o
      WHERE ${applied.query} AND o.type = 'GENERATION' AND o.prompt_id IS NOT NULL AND ${notDeleted("o")}
      GROUP BY o.prompt_id
      ORDER BY count(*) DESC
      LIMIT 1000`,
    params: applied.params,
    readOnly: true,
  });
  const prompts = res.map((r) => r.id).filter((r): r is string => Boolean(r));
  const pgPrompts =
    prompts.length > 0
      ? await prisma.prompt.findMany({
          select: { id: true, name: true },
          where: { id: { in: prompts }, projectId },
        })
      : [];
  return pgPrompts.map((p) => ({ promptName: p.name }));
};

// ---------------------------------------------------------------------------
// existence + cross-project counts
// ---------------------------------------------------------------------------

export const hasAnyObservation = async (projectId: string) => {
  const rows = await greptimeQuery<{ one: number }>({
    query: `SELECT 1 AS one FROM observations WHERE project_id = :projectId AND ${notDeleted()} LIMIT 1`,
    params: { projectId },
    readOnly: true,
  });
  return rows.length > 0;
};

export const hasAnyObservationOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => {
  const rows = await greptimeQuery<{ one: number }>({
    query: `
      SELECT 1 AS one FROM observations
      WHERE project_id = :projectId AND start_time < :cutoff AND ${notDeleted()}
      LIMIT 1`,
    params: { projectId, cutoff: greptimeTsParam(beforeDate) },
    readOnly: true,
  });
  return rows.length > 0;
};

export const getObservationCountsByProjectInCreationInterval = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => {
  const rows = await greptimeQuery<{ project_id: string; count: string }>({
    query: `
      SELECT project_id, count(*) AS count
      FROM observations
      WHERE created_at >= :start AND created_at < :end AND ${notDeleted()}
      GROUP BY project_id`,
    params: { start: greptimeTsParam(start), end: greptimeTsParam(end) },
    readOnly: true,
  });
  return rows.map((row) => ({
    projectId: row.project_id,
    count: Number(row.count),
  }));
};

export const getObservationCountOfProjectsSinceCreationDate = async ({
  projectIds,
  start,
}: {
  projectIds: string[];
  start: Date;
}) => {
  if (projectIds.length === 0) return 0;
  const idList = greptimeInClause("project_id", projectIds, "pid");
  const rows = await greptimeQuery<{ count: string }>({
    query: `
      SELECT count(*) AS count
      FROM observations
      WHERE ${idList.sql} AND created_at >= :start AND ${notDeleted()}`,
    params: { ...idList.params, start: greptimeTsParam(start) },
    readOnly: true,
  });
  return Number(rows[0]?.count ?? 0);
};

export const getTraceIdsForObservations = async (
  projectId: string,
  observationIds: string[],
) => {
  if (observationIds.length === 0) return [];
  const idList = greptimeInClause("id", observationIds, "oid");
  const rows = await greptimeQuery<{ id: string; trace_id: string }>({
    query: `
      SELECT trace_id, id
      FROM observations
      WHERE project_id = :projectId AND ${idList.sql} AND ${notDeleted()}`,
    params: { projectId, ...idList.params },
    readOnly: true,
  });
  return rows.map((row) => ({ id: row.id, traceId: row.trace_id }));
};

// ---------------------------------------------------------------------------
// tool groupings (CH arrayJoin(mapKeys/array) → app-side JSON flatten)
// ---------------------------------------------------------------------------

// GreptimeDB cannot unnest dynamic JSON keys/arrays in SQL, so the matching observations' tool JSON
// is fetched (bounded by the filter + a scan cap) and flattened app-side. Mirrors the CH result cap
// of LIMIT 1000 on distinct tool names.
const TOOL_SCAN_LIMIT = 10000;

const topToolCounts = (counts: Map<string, number>): string[] =>
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1000)
    .map(([name]) => name);

export const getObservationsGroupedByToolName = async (
  projectId: string,
  filter: FilterState,
) => {
  const applied = projectFilterWithState(
    projectId,
    filter,
    observationsTableGreptimeColumnDefinitions,
  );
  const rows = await greptimeQuery<{ tool_definitions: unknown }>({
    query: `
      SELECT ${selectJsonColumn("tool_definitions", { tablePrefix: "o" })}
      FROM observations o
      WHERE ${applied.query} AND ${notDeleted("o")}
      LIMIT ${TOOL_SCAN_LIMIT}`,
    params: applied.params,
    readOnly: true,
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const defs = greptimeJson<Record<string, unknown>>(
      row.tool_definitions,
      {},
    );
    for (const key of Object.keys(defs ?? {})) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return topToolCounts(counts).map((toolName) => ({ toolName }));
};

export const getObservationsGroupedByCalledToolName = async (
  projectId: string,
  filter: FilterState,
) => {
  const applied = projectFilterWithState(
    projectId,
    filter,
    observationsTableGreptimeColumnDefinitions,
  );
  const rows = await greptimeQuery<{ tool_call_names: unknown }>({
    query: `
      SELECT ${selectJsonColumn("tool_call_names", { tablePrefix: "o" })}
      FROM observations o
      WHERE ${applied.query} AND ${notDeleted("o")}
      LIMIT ${TOOL_SCAN_LIMIT}`,
    params: applied.params,
    readOnly: true,
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const names = greptimeJson<unknown[]>(row.tool_call_names, []);
    for (const name of names ?? []) {
      if (typeof name === "string") {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
  }
  return topToolCounts(counts).map((calledToolName) => ({ calledToolName }));
};

// ---------------------------------------------------------------------------
// cost / latency rollups (merged projection; sum(total_cost), timestamp-diff latency)
// ---------------------------------------------------------------------------

export const getCostForTraces = async (
  projectId: string,
  timestamp: Date,
  traceIds: string[],
): Promise<number | undefined> => {
  if (traceIds.length === 0) return undefined;
  const idList = greptimeInClause("trace_id", traceIds, "tid");
  const rows = await greptimeQuery<{ total_cost: string | null }>({
    query: `
      SELECT sum(total_cost) AS total_cost
      FROM observations
      WHERE project_id = :projectId AND ${idList.sql}
        AND start_time >= :lookback AND ${notDeleted()}`,
    params: {
      projectId,
      ...idList.params,
      // CH used start_time >= timestamp - OBSERVATIONS_TO_TRACE_INTERVAL (2 DAY), applied app-side.
      lookback: greptimeTsParam(minus(timestamp, 2 * DAY_MS)),
    },
    readOnly: true,
  });
  const value = rows[0]?.total_cost;
  return value == null ? undefined : Number(value);
};

export const getLatencyAndTotalCostForObservations = async (
  projectId: string,
  observationIds: string[],
  timestamp?: Date,
) => {
  if (observationIds.length === 0) return [];
  const idList = greptimeInClause("id", observationIds, "oid");
  const rows = await greptimeQuery<{
    id: string;
    total_cost: string | null;
    latency_ms: string | number | null;
  }>({
    query: `
      SELECT id,
        total_cost,
        CAST((to_unixtime(end_time) - to_unixtime(start_time)) * 1000 AS BIGINT) AS latency_ms
      FROM observations
      WHERE project_id = :projectId AND ${idList.sql}
        ${timestamp ? "AND start_time >= :ts" : ""} AND ${notDeleted()}`,
    params: {
      projectId,
      ...idList.params,
      ...(timestamp ? { ts: greptimeTsParam(timestamp) } : {}),
    },
    readOnly: true,
  });
  return rows.map((r) => ({
    id: r.id,
    totalCost: Number(r.total_cost ?? 0),
    latency: Number(r.latency_ms ?? 0) / 1000,
  }));
};

export const getLatencyAndTotalCostForObservationsByTraces = async (
  projectId: string,
  traceIds: string[],
  timestamp?: Date,
) => {
  if (traceIds.length === 0) return [];
  const idList = greptimeInClause("trace_id", traceIds, "tid");
  const rows = await greptimeQuery<{
    trace_id: string;
    total_cost: string | null;
    latency_ms: string | number | null;
  }>({
    query: `
      SELECT trace_id,
        sum(total_cost) AS total_cost,
        CAST((to_unixtime(max(end_time)) - to_unixtime(min(start_time))) * 1000 AS BIGINT) AS latency_ms
      FROM observations
      WHERE project_id = :projectId AND ${idList.sql}
        ${timestamp ? "AND start_time >= :ts" : ""} AND ${notDeleted()}
      GROUP BY trace_id`,
    params: {
      projectId,
      ...idList.params,
      ...(timestamp ? { ts: greptimeTsParam(timestamp) } : {}),
    },
    readOnly: true,
  });
  return rows.map((r) => ({
    traceId: r.trace_id,
    totalCost: Number(r.total_cost ?? 0),
    latency: Number(r.latency_ms ?? 0) / 1000,
  }));
};

// ---------------------------------------------------------------------------
// P4 scattered reads (prompt / evaluator analytics; observation tuples per trace)
// ---------------------------------------------------------------------------

export const getObservationsWithPromptName = async (
  projectId: string,
  promptNames: string[],
  {
    fromTimestamp,
    toTimestamp,
  }: { fromTimestamp?: Date; toTimestamp?: Date } = {},
): Promise<{ count: number; promptName: string }[]> => {
  if (promptNames.length === 0) return [];
  const names = greptimeInClause("prompt_name", promptNames, "pn");
  const rows = await greptimeQuery<{
    count: string | number;
    prompt_name: string;
  }>({
    query: `
      SELECT count(DISTINCT id) AS count, prompt_name
      FROM observations
      WHERE project_id = :projectId AND ${names.sql}
        AND prompt_name IS NOT NULL AND prompt_name != ''
        ${fromTimestamp ? "AND start_time >= :fromTs" : ""}
        ${toTimestamp ? "AND start_time <= :toTs" : ""}
        AND ${notDeleted()}
      GROUP BY prompt_name`,
    params: {
      projectId,
      ...names.params,
      ...(fromTimestamp ? { fromTs: greptimeTsParam(fromTimestamp) } : {}),
      ...(toTimestamp ? { toTs: greptimeTsParam(toTimestamp) } : {}),
    },
    readOnly: true,
  });
  return rows.map((r) => ({
    count: Number(r.count),
    promptName: r.prompt_name,
  }));
};

/**
 * Per-(prompt_id, prompt_version) GENERATION metrics. CH used `medianExact`; GreptimeDB uses the
 * uddsketch median (`greptimeQuantile(0.5, ...)`, approximate). usage input/output medians use the
 * known `input`/`output` usage keys (CH summed every key whose name contains 'input'/'output'); custom
 * usage keys (e.g. `input_cached`) are not folded into the median — a documented narrowing consistent
 * with the dashboards known-key reader. `coalesce(...,0)` matches CH's `arraySum` of an empty map = 0.
 */
export const getObservationMetricsForPrompts = async (
  projectId: string,
  promptIds: string[],
  {
    fromTimestamp,
    toTimestamp,
  }: { fromTimestamp?: Date; toTimestamp?: Date } = {},
): Promise<
  {
    count: number;
    promptId: string;
    promptVersion: number;
    firstObservation: Date;
    lastObservation: Date;
    medianInputUsage: number;
    medianOutputUsage: number;
    medianTotalCost: number;
    medianLatencyMs: number;
  }[]
> => {
  if (promptIds.length === 0) return [];
  const ids = greptimeInClause("prompt_id", promptIds, "pid");
  const latencyMs =
    "CAST((to_unixtime(end_time) - to_unixtime(start_time)) * 1000 AS BIGINT)";
  const rows = await greptimeQuery<{
    count: string | number;
    prompt_id: string;
    prompt_version: number;
    first_observation: Date;
    last_observation: Date;
    median_input_usage: string | number | null;
    median_output_usage: string | number | null;
    median_total_cost: string | number | null;
    median_latency_ms: string | number | null;
  }>({
    query: `
      SELECT
        count(*) AS count,
        prompt_id,
        prompt_version,
        min(start_time) AS first_observation,
        max(start_time) AS last_observation,
        ${greptimeQuantile(0.5, "coalesce(json_get_float(usage_details, 'input'), 0)")} AS median_input_usage,
        ${greptimeQuantile(0.5, "coalesce(json_get_float(usage_details, 'output'), 0)")} AS median_output_usage,
        ${greptimeQuantile(0.5, "coalesce(json_get_float(cost_details, 'total'), 0)")} AS median_total_cost,
        ${greptimeQuantile(0.5, latencyMs)} AS median_latency_ms
      FROM observations
      WHERE project_id = :projectId AND type = 'GENERATION'
        AND prompt_name IS NOT NULL AND ${ids.sql}
        ${fromTimestamp ? "AND start_time >= :fromTs" : ""}
        ${toTimestamp ? "AND start_time <= :toTs" : ""}
        AND ${notDeleted()}
      GROUP BY prompt_id, prompt_version
      ORDER BY prompt_version DESC`,
    params: {
      projectId,
      ...ids.params,
      ...(fromTimestamp ? { fromTs: greptimeTsParam(fromTimestamp) } : {}),
      ...(toTimestamp ? { toTs: greptimeTsParam(toTimestamp) } : {}),
    },
    readOnly: true,
  });
  return rows.map((r) => ({
    count: Number(r.count),
    promptId: r.prompt_id,
    promptVersion: r.prompt_version,
    firstObservation: r.first_observation,
    lastObservation: r.last_observation,
    medianInputUsage: Number(r.median_input_usage ?? 0),
    medianOutputUsage: Number(r.median_output_usage ?? 0),
    medianTotalCost: Number(r.median_total_cost ?? 0),
    medianLatencyMs: Number(r.median_latency_ms ?? 0),
  }));
};

/** Observation cost/latency tuples grouped by trace (CH `groupArray(tuple(...))` -> app-side Map). */
export const getObservationsGroupedByTraceId = async (
  projectId: string,
  traceIds: string[],
  timestamp?: Date,
): Promise<
  Map<string, [string, string | null, string, string, string, number][]>
> => {
  if (traceIds.length === 0) return new Map();
  const ids = greptimeInClause("trace_id", traceIds, "tid");
  const rows = await greptimeQuery<{
    trace_id: string;
    id: string;
    parent_observation_id: string | null;
    total_cost: string | number | null;
    input_cost: string | number | null;
    output_cost: string | number | null;
    latency_ms: string | number | null;
  }>({
    query: `
      SELECT trace_id, id, parent_observation_id,
        coalesce(json_get_float(cost_details, 'total'), 0) AS total_cost,
        coalesce(json_get_float(cost_details, 'input'), 0) AS input_cost,
        coalesce(json_get_float(cost_details, 'output'), 0) AS output_cost,
        CAST((to_unixtime(end_time) - to_unixtime(start_time)) * 1000 AS BIGINT) AS latency_ms
      FROM observations
      WHERE project_id = :projectId AND ${ids.sql}
        ${timestamp ? "AND start_time >= :ts" : ""} AND ${notDeleted()}`,
    params: {
      projectId,
      ...ids.params,
      ...(timestamp ? { ts: greptimeTsParam(timestamp) } : {}),
    },
    readOnly: true,
  });
  const map = new Map<
    string,
    [string, string | null, string, string, string, number][]
  >();
  for (const r of rows) {
    const tuple: [string, string | null, string, string, string, number] = [
      r.id,
      r.parent_observation_id ? r.parent_observation_id : null,
      String(r.total_cost ?? 0),
      String(r.input_cost ?? 0),
      String(r.output_cost ?? 0),
      Number(r.latency_ms ?? 0),
    ];
    const existing = map.get(r.trace_id);
    if (existing) existing.push(tuple);
    else map.set(r.trace_id, [tuple]);
  }
  return map;
};

/** Per-evaluator GENERATION cost over the last 7 days (CH `metadata['job_configuration_id']`). */
export const getCostByEvaluatorIds = async (
  projectId: string,
  evaluatorIds: string[],
): Promise<Array<{ evaluatorId: string; totalCost: number }>> => {
  if (evaluatorIds.length === 0) return [];
  const evalExpr = "json_get_string(metadata, 'job_configuration_id')";
  const params: Record<string, unknown> = { projectId };
  const placeholders = evaluatorIds.map((val, i) => {
    params[`ev${i}`] = val;
    return `:ev${i}`;
  });
  // CH `today() - 7` = midnight 7 days ago (UTC); computed app-side as an absolute lower bound.
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  params.lookback = greptimeTsParam(minus(midnight, 7 * DAY_MS));

  const rows = await greptimeQuery<{
    evaluator_id: string | null;
    total_cost: string | number | null;
  }>({
    query: `
      SELECT ${evalExpr} AS evaluator_id, sum(total_cost) AS total_cost
      FROM observations
      WHERE project_id = :projectId AND type = 'GENERATION'
        AND start_time >= :lookback
        AND ${evalExpr} IN (${placeholders.join(", ")})
        AND ${notDeleted()}
      GROUP BY ${evalExpr}`,
    params,
    readOnly: true,
  });
  return rows
    .filter((r) => r.evaluator_id != null)
    .map((r) => ({
      evaluatorId: String(r.evaluator_id),
      totalCost: Number(r.total_cost ?? 0),
    }));
};

// ---------------------------------------------------------------------------
// P5 scattered small reads
// ---------------------------------------------------------------------------

/**
 * Observation counts grouped by project and UTC day over a half-open [startDate, endDate) window
 * (telemetry / usage-thresholds cron). Mirrors `getTraceCountsByProjectAndDay` on `start_time`.
 */
export const getObservationCountsByProjectAndDay = async ({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}): Promise<Array<{ count: number; projectId: string; date: string }>> => {
  const rows = await greptimeQuery<{
    count: string;
    project_id: string;
    date: Date | string;
  }>({
    query: `
      SELECT count(*) AS count, project_id, date_trunc('day', start_time) AS date
      FROM observations
      WHERE start_time >= :start AND start_time < :end AND ${notDeleted()}
      GROUP BY project_id, date_trunc('day', start_time)`,
    params: {
      start: greptimeTsParam(startDate),
      end: greptimeTsParam(endDate),
    },
    readOnly: true,
  });
  return rows.map((row) => ({
    count: Number(row.count),
    projectId: row.project_id,
    // CH returned toDate() as 'YYYY-MM-DD'; keep that contract.
    date:
      row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : String(row.date).slice(0, 10),
  }));
};

// ---------------------------------------------------------------------------
// P5 public-API observation generators (legacy /api/public/observations path)
// ---------------------------------------------------------------------------

// Any rollup-score filter arriving via an advanced ?filter= correlates by observation id.
const OBSERVATION_SCORE_GRAIN: ScoreGrain = {
  scoresColumn: "observation_id",
  outerPrefix: "o",
  outerColumn: "id",
};

/**
 * Public-API observation list. The CH two-phase keys-CTE + FINAL dedup collapses to a single SELECT
 * on the merged projection (`is_deleted = false`). A trace join is added only when the (translated)
 * filter references trace columns. Returns domain observations (same contract as `convertObservation`).
 */
export const generateObservationsForPublicApi = async ({
  projectId,
  filter,
  pagination,
}: {
  projectId: string;
  filter: ChFilterList;
  pagination: { limit: number; page: number };
}) => {
  const needsTraceJoin = filter.some((f) => f.clickhouseTable === "traces");
  const applied = translateChFilterList(filter, {
    scoreGrain: OBSERVATION_SCORE_GRAIN,
  }).apply();
  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT ${greptimeObservationSelect({ prefix: "o" })}
      FROM observations o
      ${needsTraceJoin ? `LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id AND ${notDeleted("t")}` : ""}
      WHERE o.project_id = :projectId AND ${notDeleted("o")}
        ${applied.query ? `AND ${applied.query}` : ""}
      ORDER BY o.start_time DESC
      LIMIT :limit OFFSET :offset`,
    params: {
      projectId,
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      ...applied.params,
    },
    readOnly: true,
  });
  return rows.map((r) => convertGreptimeObservationRowToDomain(r));
};

export const getObservationsCountForPublicApi = async ({
  projectId,
  filter,
}: {
  projectId: string;
  filter: ChFilterList;
}): Promise<number | undefined> => {
  const needsTraceJoin = filter.some((f) => f.clickhouseTable === "traces");
  const applied = translateChFilterList(filter, {
    scoreGrain: OBSERVATION_SCORE_GRAIN,
  }).apply();
  const rows = await greptimeQuery<{ count: string | number }>({
    query: `
      SELECT count(*) AS count
      FROM observations o
      ${needsTraceJoin ? `LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id AND ${notDeleted("t")}` : ""}
      WHERE o.project_id = :projectId AND ${notDeleted("o")}
        ${applied.query ? `AND ${applied.query}` : ""}`,
    params: { projectId, ...applied.params },
    readOnly: true,
  });
  return rows.length > 0 ? Number(rows[0].count) : undefined;
};

/**
 * Last-used timestamp per internal model id within a project (model table UI). CH:
 * `MAX(start_time) GROUP BY internal_model_id` over GENERATION observations. camelCase aliases are
 * backticked (GreptimeDB case-folds unquoted aliases to lowercase).
 */
export const getModelLastUsedByIds = async ({
  projectId,
  modelIds,
}: {
  projectId: string;
  modelIds: string[];
}): Promise<Array<{ modelId: string; lastUsed: Date }>> => {
  if (modelIds.length === 0) return [];
  const idList = greptimeInClause("internal_model_id", modelIds, "mid");
  return greptimeQuery<{ modelId: string; lastUsed: Date }>({
    query: `
      SELECT internal_model_id AS \`modelId\`, max(start_time) AS \`lastUsed\`
      FROM observations
      WHERE project_id = :projectId AND type = 'GENERATION'
        AND ${idList.sql} AND ${notDeleted()}
      GROUP BY internal_model_id`,
    params: { projectId, ...idList.params },
    readOnly: true,
  });
};
