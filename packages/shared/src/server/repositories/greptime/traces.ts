import { prisma } from "../../../db";
import { type FilterState } from "../../../types";
import {
  type ColumnDefinition,
  findUiColumnMapping,
} from "../../../tableDefinitions";
import { tracesTableCols } from "../../../tableDefinitions/tracesTable";
import { tracesTableUiColumnDefinitions } from "../../tableMappings/mapTracesTable";
import { greptimeQuery } from "../../greptime/client";
import { measureAndReturn } from "../../clickhouse/measureAndReturn";
import { recordDistribution, traceException } from "../../instrumentation";
import { logger } from "../../logger";
import {
  DEFAULT_RENDERING_PROPS,
  type RenderingProps,
} from "../../utils/rendering";
import { FilterList } from "../../greptime/sql/greptime-filter";
import {
  createGreptimeFilterFromFilterState,
  greptimeProjectIdDefaultFilter,
} from "../../greptime/sql/factory";
import {
  tracesTableGreptimeColumnDefinitions,
  type GreptimeColumnMappings,
} from "../../greptime/sql/columnMappings";
import { greptimeSearchCondition } from "../../greptime/sql/search";
import { greptimeOrderBySql } from "../../greptime/sql/orderby";
import {
  convertGreptimeTraceRowToDomain,
  greptimeTraceSelect,
} from "./converters";
import {
  greptimeDayBounds,
  greptimeInClause,
  greptimeTsParam,
  notDeleted,
} from "./queryHelpers";
import { type OrderByState } from "../../../interfaces/orderBy";
import { LISTABLE_SCORE_TYPES } from "../../../domain/scores";
import {
  type FilterList as ChFilterList,
  DateTimeFilter as ChDateTimeFilter,
} from "../../queries";
import { translateChFilterList } from "./translateChFilter";
import { type ScoreGrain } from "../../greptime/sql/greptime-filter";

/**
 * GreptimeDB core trace reads (04-read-path.md, P1). These replace the legacy ClickHouse
 * `traces FINAL / LIMIT 1 BY id` reads with a plain SELECT on the merged `last_non_null` projection,
 * filtered to live rows (`is_deleted = false`). Signatures mirror `repositories/traces.ts`; the
 * public functions delegate here.
 */

export const getTracesByIds = async (
  traceIds: string[],
  projectId: string,
  timestamp?: Date,
) => {
  if (traceIds.length === 0) return [];
  const idList = greptimeInClause("id", traceIds, "tid");
  const records = await measureAndReturn({
    operationName: "getTracesByIds",
    projectId,
    input: {
      params: {
        projectId,
        ...idList.params,
        ...(timestamp ? { ts: greptimeTsParam(timestamp) } : {}),
      },
      tags: { operation_name: "getTracesByIds" },
    },
    fn: (input) =>
      greptimeQuery<Record<string, unknown>>({
        query: `
          SELECT ${greptimeTraceSelect()}
          FROM traces
          WHERE ${idList.sql}
            AND project_id = :projectId
            ${timestamp ? "AND timestamp >= :ts" : ""}
            AND ${notDeleted()}`,
        params: input.params,
        readOnly: true,
      }),
  });
  return records.map((r) =>
    convertGreptimeTraceRowToDomain(r, DEFAULT_RENDERING_PROPS),
  );
};

export const getTracesBySessionId = async (
  projectId: string,
  sessionIds: string[],
  timestamp?: Date,
) => {
  if (sessionIds.length === 0) return [];
  const sessionList = greptimeInClause("session_id", sessionIds, "sid");
  const records = await measureAndReturn({
    operationName: "getTracesBySessionId",
    projectId,
    input: {
      params: {
        projectId,
        ...sessionList.params,
        ...(timestamp ? { ts: greptimeTsParam(timestamp) } : {}),
      },
      tags: { operation_name: "getTracesBySessionId" },
    },
    fn: (input) =>
      greptimeQuery<Record<string, unknown>>({
        query: `
          SELECT ${greptimeTraceSelect()}
          FROM traces
          WHERE ${sessionList.sql}
            AND project_id = :projectId
            ${timestamp ? "AND timestamp >= :ts" : ""}
            AND ${notDeleted()}`,
        params: input.params,
        readOnly: true,
      }),
  });
  const traces = records.map((r) =>
    convertGreptimeTraceRowToDomain(r, DEFAULT_RENDERING_PROPS),
  );
  traces.forEach((trace) => {
    recordDistribution(
      "langfuse.traces_by_session_id_age",
      new Date().getTime() - trace.timestamp.getTime(),
    );
  });
  return traces;
};

export const getTraceByIdFromTracesTable = async ({
  traceId,
  projectId,
  timestamp,
  fromTimestamp,
  renderingProps = DEFAULT_RENDERING_PROPS,
  excludeInputOutput = false,
  excludeMetadata = false,
}: {
  traceId: string;
  projectId: string;
  timestamp?: Date;
  fromTimestamp?: Date;
  renderingProps?: RenderingProps;
  excludeInputOutput?: boolean;
  excludeMetadata?: boolean;
}) => {
  const day = timestamp ? greptimeDayBounds(timestamp) : null;
  const records = await measureAndReturn({
    operationName: "getTraceById",
    projectId,
    input: {
      params: {
        traceId,
        projectId,
        ...(day ? { dayStart: day.start, dayEnd: day.end } : {}),
        ...(fromTimestamp ? { fromTs: greptimeTsParam(fromTimestamp) } : {}),
      },
      tags: { operation_name: "getTraceById" },
    },
    fn: (input) =>
      greptimeQuery<Record<string, unknown>>({
        query: `
          SELECT ${greptimeTraceSelect({ excludeIo: excludeInputOutput, excludeMetadata })}
          FROM traces
          WHERE id = :traceId
            AND project_id = :projectId
            ${day ? "AND timestamp >= :dayStart AND timestamp < :dayEnd" : ""}
            ${fromTimestamp ? "AND timestamp >= :fromTs" : ""}
            AND ${notDeleted()}
          LIMIT 1`,
        params: input.params,
        readOnly: true,
      }),
  });
  const res = records.map((r) =>
    convertGreptimeTraceRowToDomain(r, renderingProps),
  );
  res.forEach((trace) => {
    recordDistribution(
      "langfuse.query_by_id_age",
      new Date().getTime() - trace.timestamp.getTime(),
      { table: "traces" },
    );
  });
  return res.shift();
};

export const getTracesIdentifierForSessionFromTracesTable = async (
  projectId: string,
  sessionId: string,
) => {
  const rows = await measureAndReturn({
    operationName: "getTracesIdentifierForSession",
    projectId,
    input: {
      params: { projectId, sessionId },
      tags: { operation_name: "getTracesIdentifierForSession" },
    },
    fn: () =>
      greptimeQuery<{
        id: string;
        user_id: string | null;
        name: string | null;
        timestamp: Date;
        environment: string;
      }>({
        query: `
          SELECT id, user_id, name, timestamp, environment
          FROM traces
          WHERE project_id = :projectId
            AND session_id = :sessionId
            AND ${notDeleted()}
          ORDER BY timestamp ASC`,
        params: { projectId, sessionId },
        readOnly: true,
      }),
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    timestamp: row.timestamp,
    environment: row.environment,
  }));
};

// ---------------------------------------------------------------------------
// existence checks
// ---------------------------------------------------------------------------

export const hasAnyTrace = async (projectId: string) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { hasTraces: true },
    });
    if (project?.hasTraces) return true;
  } catch (error) {
    traceException(error);
    logger.error("Failed to read hasTraces flag from PostgreSQL", {
      projectId,
      error,
    });
  }

  const rows = await greptimeQuery<{ one: number }>({
    query: `SELECT 1 AS one FROM traces WHERE project_id = :projectId AND ${notDeleted()} LIMIT 1`,
    params: { projectId },
    readOnly: true,
  });
  const result = rows.length > 0;

  if (result) {
    try {
      await prisma.project.updateMany({
        where: { id: projectId, hasTraces: false },
        data: { hasTraces: true },
      });
    } catch (error) {
      traceException(error);
      logger.error("Failed to persist hasTraces flag to PostgreSQL", {
        projectId,
        error,
      });
    }
  }
  return result;
};

export const hasAnyTraceOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => {
  const rows = await greptimeQuery<{ one: number }>({
    query: `
      SELECT 1 AS one FROM traces
      WHERE project_id = :projectId AND timestamp < :cutoff AND ${notDeleted()}
      LIMIT 1`,
    params: { projectId, cutoff: greptimeTsParam(beforeDate) },
    readOnly: true,
  });
  return rows.length > 0;
};

export const hasAnyUser = async (projectId: string) => {
  const rows = await greptimeQuery<{ one: number }>({
    query: `
      SELECT 1 AS one FROM traces
      WHERE project_id = :projectId AND user_id IS NOT NULL AND user_id != '' AND ${notDeleted()}
      LIMIT 1`,
    params: { projectId },
    readOnly: true,
  });
  return rows.length > 0;
};

// ---------------------------------------------------------------------------
// groupings (filter-option helpers) — plain `traces` projection
// ---------------------------------------------------------------------------

export const getTracesGroupedByName = async (
  projectId: string,
  tableDefinitions: GreptimeColumnMappings = tracesTableGreptimeColumnDefinitions,
  timestampFilter?: FilterState,
) => {
  const filter = timestampFilter
    ? new FilterList(
        createGreptimeFilterFromFilterState(timestampFilter, tableDefinitions),
      ).apply()
    : undefined;

  return greptimeQuery<{ name: string; count: string }>({
    query: `
      SELECT name AS name, count(*) AS count
      FROM traces t
      WHERE t.project_id = :projectId
        AND t.name IS NOT NULL
        AND t.name != ''
        AND ${notDeleted("t")}
        ${filter?.query ? `AND ${filter.query}` : ""}
      GROUP BY name
      ORDER BY count(*) DESC
      LIMIT 1000`,
    params: { projectId, ...(filter ? filter.params : {}) },
    readOnly: true,
  });
};

const groupedByColumn = async (params: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  limit?: number;
  offset?: number;
  columns?: GreptimeColumnMappings;
  columnDefinitions?: ColumnDefinition[];
  selectCol: string; // e.g. "session_id AS session_id"
  whereCol: string; // e.g. "t.session_id"
  groupBy: string; // e.g. "session_id"
}) => {
  const { tracesFilter } = greptimeProjectIdDefaultFilter(params.projectId, {
    tracesPrefix: "t",
  });
  tracesFilter.push(
    ...createGreptimeFilterFromFilterState(
      params.filter,
      params.columns ?? tracesTableGreptimeColumnDefinitions,
      params.columnDefinitions ?? tracesTableCols,
    ),
  );
  const filterRes = tracesFilter.apply();
  const search = greptimeSearchCondition({
    query: params.searchQuery,
    tablePrefix: "t",
  });
  const paginate =
    params.limit !== undefined && params.offset !== undefined
      ? `LIMIT ${Number(params.limit)} OFFSET ${Number(params.offset)}`
      : "";

  return greptimeQuery<{ [k: string]: string }>({
    query: `
      SELECT ${params.selectCol}, count(*) AS count
      FROM traces t
      WHERE ${filterRes.query}
        AND ${params.whereCol} IS NOT NULL
        AND ${params.whereCol} != ''
        AND ${notDeleted("t")}
        ${search.query}
      GROUP BY ${params.groupBy}
      ORDER BY count DESC
      ${paginate}`,
    params: { ...filterRes.params, ...search.params },
    readOnly: true,
  });
};

export const getTracesGroupedBySessionId = (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  limit?: number,
  offset?: number,
  columns?: GreptimeColumnMappings,
  columnDefinitions?: ColumnDefinition[],
) =>
  groupedByColumn({
    projectId,
    filter,
    searchQuery,
    limit,
    offset,
    columns,
    columnDefinitions,
    selectCol: "session_id AS session_id",
    whereCol: "t.session_id",
    groupBy: "session_id",
  }) as Promise<{ session_id: string; count: string }[]>;

export const getTracesGroupedByUsers = (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  limit?: number,
  offset?: number,
  columns?: GreptimeColumnMappings,
  columnDefinitions?: ColumnDefinition[],
) =>
  groupedByColumn({
    projectId,
    filter,
    searchQuery,
    limit,
    offset,
    columns,
    columnDefinitions,
    selectCol: "user_id AS user",
    whereCol: "t.user_id",
    groupBy: "user",
  }) as Promise<{ user: string; count: string }[]>;

export const getTracesGroupedByTags = async (props: {
  projectId: string;
  filter: FilterState;
  columns?: GreptimeColumnMappings;
  columnDefinitions?: ColumnDefinition[];
}) => {
  const filterRes = new FilterList(
    createGreptimeFilterFromFilterState(
      props.filter,
      props.columns ?? tracesTableGreptimeColumnDefinitions,
      props.columnDefinitions ?? tracesTableCols,
    ),
  ).apply();

  return greptimeQuery<{ value: string }>({
    query: `
      SELECT DISTINCT tt.tag AS value
      FROM traces_tags tt
      WHERE tt.project_id = :projectId
        AND ${notDeleted("tt")}
        AND EXISTS (
          SELECT 1 FROM traces t
          WHERE t.project_id = tt.project_id
            AND t.id = tt.entity_id
            AND ${notDeleted("t")}
            ${filterRes.query ? `AND ${filterRes.query}` : ""}
        )
      LIMIT 1000`,
    params: { projectId: props.projectId, ...filterRes.params },
    readOnly: true,
  });
};

export const getTotalUserCount = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
): Promise<{ totalCount: bigint }[]> => {
  const { tracesFilter } = greptimeProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });
  tracesFilter.push(
    ...createGreptimeFilterFromFilterState(
      filter,
      tracesTableGreptimeColumnDefinitions,
      tracesTableCols,
    ),
  );
  const filterRes = tracesFilter.apply();
  const search = greptimeSearchCondition({
    query: searchQuery,
    tablePrefix: "t",
  });

  const rows = await greptimeQuery<{ totalCount: string }>({
    query: `
      SELECT count(DISTINCT t.user_id) AS totalCount
      FROM traces t
      WHERE ${filterRes.query}
        ${search.query}
        AND t.user_id IS NOT NULL
        AND t.user_id != ''
        AND ${notDeleted("t")}`,
    params: { ...filterRes.params, ...search.params },
    readOnly: true,
  });
  return rows.map((r) => ({ totalCount: BigInt(r.totalCount ?? 0) }));
};

// ---------------------------------------------------------------------------
// cross-project counts (operational)
// ---------------------------------------------------------------------------

export const getTraceCountsByProjectInCreationInterval = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => {
  const rows = await greptimeQuery<{ project_id: string; count: string }>({
    query: `
      SELECT project_id, count(*) AS count
      FROM traces
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

export const getTraceCountOfProjectsSinceCreationDate = async ({
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
      FROM traces
      WHERE ${idList.sql} AND created_at >= :start AND ${notDeleted()}`,
    params: { ...idList.params, start: greptimeTsParam(start) },
    readOnly: true,
  });
  return Number(rows[0]?.count ?? 0);
};

export const getTraceCountsByProjectAndDay = async ({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}) => {
  const rows = await greptimeQuery<{
    count: string;
    project_id: string;
    date: Date | string;
  }>({
    query: `
      SELECT count(*) AS count, project_id, date_trunc('day', timestamp) AS date
      FROM traces
      WHERE timestamp >= :start AND timestamp < :end AND ${notDeleted()}
      GROUP BY project_id, date_trunc('day', timestamp)`,
    params: {
      start: greptimeTsParam(startDate),
      end: greptimeTsParam(endDate),
    },
    readOnly: true,
  });
  return rows.map((row) => ({
    count: Number(row.count),
    projectId: row.project_id,
    // CH returned toDate() as a 'YYYY-MM-DD' string; keep that contract.
    date:
      row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : String(row.date).slice(0, 10),
  }));
};

/**
 * Cross-project trace lookup by id (legacy redirect support, no projectId). The merged projection is
 * unique per (project_id, id), so a plain SELECT replaces the CH `ORDER BY event_ts DESC LIMIT 1 by
 * id, project_id`; one (id, projectId) pair is returned per project that holds the id.
 */
export const getTracesByIdsForAnyProject = async (
  traceIds: string[],
): Promise<Array<{ id: string; projectId: string }>> => {
  if (traceIds.length === 0) return [];
  const idList = greptimeInClause("id", traceIds, "tid");
  const rows = await greptimeQuery<{ id: string; project_id: string }>({
    query: `
      SELECT id, project_id
      FROM traces
      WHERE ${idList.sql} AND ${notDeleted()}`,
    params: idList.params,
    readOnly: true,
  });
  return rows.map((r) => ({ id: r.id, projectId: r.project_id }));
};

// ---------------------------------------------------------------------------
// P2 rollup: trace existence (eval path) + per-user metrics
// ---------------------------------------------------------------------------

/**
 * Existence probe used by the eval/dataset trigger path. The CH version aggregated observation
 * levels in a CTE but never selected those columns — the observation side only gated the trace via
 * an INNER JOIN (a trace must have >=1 observation in the lookback window when the filter targets
 * observations). Here: apply the trace-level filter on the merged `traces` projection within the
 * timestamp window, and when the filter targets observations, require an EXISTS observation.
 */
export const checkTraceExistsAndGetTimestamp = async ({
  projectId,
  traceId,
  timestamp,
  filter,
  maxTimeStamp,
  exactTimestamp,
}: {
  projectId: string;
  traceId: string;
  timestamp: Date;
  filter: FilterState;
  maxTimeStamp: Date | undefined;
  exactTimestamp?: Date;
}): Promise<{ exists: boolean; timestamp?: Date }> => {
  const isTraceLevel = (column: string): boolean => {
    const mapping = findUiColumnMapping(tracesTableUiColumnDefinitions, column);
    return !mapping || mapping.clickhouseTableName === "traces";
  };
  const traceLevelFilter = filter.filter((f) => isTraceLevel(f.column));
  const requiresObservation = filter.some((f) => !isTraceLevel(f.column));

  const filterRes = new FilterList(
    createGreptimeFilterFromFilterState(
      traceLevelFilter,
      tracesTableGreptimeColumnDefinitions,
      tracesTableCols,
    ),
  ).apply();

  // CH lookback bounds applied app-side as absolute timestamps.
  const TWO_DAY_MS = 2 * 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const params: Record<string, unknown> = {
    projectId,
    traceId,
    lowerBound: greptimeTsParam(new Date(timestamp.getTime() - HOUR_MS)),
    ...filterRes.params,
  };
  let upperClause: string;
  if (maxTimeStamp) {
    params.upperBound = greptimeTsParam(maxTimeStamp);
    upperClause = "AND t.timestamp <= :upperBound";
  } else {
    params.upperBound = greptimeTsParam(
      new Date(timestamp.getTime() + TWO_DAY_MS),
    );
    upperClause = "AND t.timestamp <= :upperBound";
  }
  let exactClause = "";
  if (exactTimestamp) {
    const { start, end } = greptimeDayBounds(exactTimestamp);
    params.dayStart = start;
    params.dayEnd = end;
    exactClause = "AND t.timestamp >= :dayStart AND t.timestamp < :dayEnd";
  }

  const obsLookback = greptimeTsParam(
    new Date(timestamp.getTime() - TWO_DAY_MS),
  );
  let existsClause = "";
  if (requiresObservation) {
    params.obsLookback = obsLookback;
    existsClause = `AND EXISTS (
      SELECT 1 FROM observations o
      WHERE o.project_id = t.project_id AND o.trace_id = t.id
        AND o.start_time >= :obsLookback AND ${notDeleted("o")}
    )`;
  }

  const rows = await greptimeQuery<{ timestamp: Date | string }>({
    query: `
      SELECT t.timestamp AS timestamp
      FROM traces t
      WHERE t.project_id = :projectId AND t.id = :traceId AND ${notDeleted("t")}
        AND t.timestamp >= :lowerBound
        ${upperClause}
        ${exactClause}
        ${filterRes.query ? `AND ${filterRes.query}` : ""}
        ${existsClause}
      LIMIT 1`,
    params,
    readOnly: true,
  });

  if (rows.length === 0) return { exists: false };
  const ts = rows[0].timestamp;
  return {
    exists: true,
    timestamp: ts instanceof Date ? ts : new Date(ts),
  };
};

/**
 * Per-user usage/cost/trace metrics. CH used ROW_NUMBER dedup + sumMap + positionCaseInsensitive
 * map filtering; on the merged projection this collapses to a traces<->observations JOIN grouped by
 * user_id. Input/output/total usage use the known-key JSON sums (input/output/total) — the dynamic
 * long-tail of usage keys is not broken out here (documented narrowing vs the CH substring match).
 */
export const getUserMetrics = async (
  projectId: string,
  userIds: string[],
  filter: FilterState,
) => {
  if (userIds.length === 0) return [];

  const filterRes = new FilterList(
    createGreptimeFilterFromFilterState(
      filter,
      tracesTableGreptimeColumnDefinitions,
      tracesTableCols,
    ),
  ).apply();
  const userList = greptimeInClause("user_id", userIds, "uid");

  // Optional observation lookback (CH used start_time >= traceTimestamp - 2 DAY when a timestamp
  // filter is present). Derive the absolute lower bound from the trace timestamp filter if any.
  const tsFilter = filter.find(
    (f) => f.type === "datetime" && (f.operator === ">=" || f.operator === ">"),
  );
  const params: Record<string, unknown> = {
    projectId,
    ...userList.params,
    ...filterRes.params,
  };
  let obsLookbackClause = "";
  if (tsFilter && tsFilter.type === "datetime") {
    const TWO_DAY_MS = 2 * 24 * 60 * 60 * 1000;
    params.obsLookback = greptimeTsParam(
      new Date(new Date(tsFilter.value).getTime() - TWO_DAY_MS),
    );
    obsLookbackClause = "AND o.start_time >= :obsLookback";
  }

  const rows = await greptimeQuery<{
    user_id: string;
    environment: string | null;
    obs_count: string | number;
    trace_count: string | number;
    sum_total_cost: string | null;
    input_usage: string | null;
    output_usage: string | null;
    total_usage: string | null;
    max_timestamp: Date | string;
    min_timestamp: Date | string;
  }>({
    query: `
      SELECT
        t.user_id AS user_id,
        max(t.environment) AS environment,
        count(distinct o.id) AS obs_count,
        count(distinct t.id) AS trace_count,
        sum(coalesce(o.total_cost, 0)) AS sum_total_cost,
        sum(coalesce(json_get_float(o.usage_details, 'input'), 0)) AS input_usage,
        sum(coalesce(json_get_float(o.usage_details, 'output'), 0)) AS output_usage,
        sum(coalesce(json_get_float(o.usage_details, 'total'), 0)) AS total_usage,
        max(t.timestamp) AS max_timestamp,
        min(t.timestamp) AS min_timestamp
      FROM traces t
      JOIN observations o ON o.trace_id = t.id AND o.project_id = t.project_id
      WHERE t.project_id = :projectId
        AND ${userList.sql}
        AND ${notDeleted("t")} AND ${notDeleted("o")}
        ${obsLookbackClause}
        ${filterRes.query ? `AND ${filterRes.query}` : ""}
      GROUP BY t.user_id`,
    params,
    readOnly: true,
  });

  const toDate = (v: Date | string): Date =>
    v instanceof Date ? v : new Date(v);
  return rows.map((row) => ({
    userId: row.user_id,
    environment: row.environment ?? "",
    maxTimestamp: toDate(row.max_timestamp),
    minTimestamp: toDate(row.min_timestamp),
    inputUsage: Number(row.input_usage ?? 0),
    outputUsage: Number(row.output_usage ?? 0),
    totalUsage: Number(row.total_usage ?? 0),
    observationCount: Number(row.obs_count ?? 0),
    traceCount: Number(row.trace_count ?? 0),
    totalCost: Number(row.sum_total_cost ?? 0),
  }));
};

/**
 * Agent-graph observation rows for a trace (LangGraph node/step from `metadata`). Replaces the CH
 * `metadata['langgraph_node'/'langgraph_step']` reads. Returns `start_time`/`end_time` as ISO strings
 * to satisfy the `AgentGraphDataSchema` (`z.string()`); `node`/`step` come from the JSON metadata.
 * The CH start-time window strings are bound directly (GreptimeDB coerces the string to TIMESTAMP).
 */
export async function getAgentGraphData(params: {
  projectId: string;
  traceId: string;
  chMinStartTime: string;
  chMaxStartTime: string;
}): Promise<
  {
    id: string;
    parent_observation_id: string | null;
    type: string;
    name: string | null;
    start_time: string | null;
    end_time: string | null;
    node: string | null;
    step: string | null;
  }[]
> {
  const { projectId, traceId, chMinStartTime, chMaxStartTime } = params;
  const rows = await greptimeQuery<{
    id: string;
    parent_observation_id: string | null;
    type: string;
    name: string | null;
    start_time: Date | null;
    end_time: Date | null;
    node: string | null;
    step: string | null;
  }>({
    query: `
      SELECT id, parent_observation_id, type, name, start_time, end_time,
        json_get_string(metadata, 'langgraph_node') AS node,
        json_get_string(metadata, 'langgraph_step') AS step
      FROM observations
      WHERE project_id = :projectId AND trace_id = :traceId
        AND start_time >= :minStart AND start_time <= :maxStart
        AND ${notDeleted()}`,
    params: {
      projectId,
      traceId,
      minStart: chMinStartTime,
      maxStart: chMaxStartTime,
    },
    readOnly: true,
  });
  return rows.map((r) => ({
    id: r.id,
    parent_observation_id: r.parent_observation_id
      ? r.parent_observation_id
      : null,
    type: r.type,
    name: r.name,
    start_time: r.start_time ? r.start_time.toISOString() : null,
    end_time: r.end_time ? r.end_time.toISOString() : null,
    node: r.node ? r.node : null,
    step: r.step ? r.step : null,
  }));
}

// ---------------------------------------------------------------------------
// P5 public-API trace generators (legacy /api/public/traces path)
// ---------------------------------------------------------------------------

const TRACE_SCORE_GRAIN: ScoreGrain = {
  scoresColumn: "trace_id",
  outerPrefix: "t",
  outerColumn: "id",
};
const ID_AGG_SEP = "";
// Lookback when bounding the observation/score CTE scan by the trace from-time filter
// (mirrors CH TRACE_TO_OBSERVATIONS_INTERVAL = 2 days; LEFT JOIN so over-wide is safe).
const TRACE_TO_OBS_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
// Score id-array CTE only collects listable score types (mirrors CH `data_type IN (...)`).
const dataTypeInClause = greptimeInClause(
  "data_type",
  LISTABLE_SCORE_TYPES,
  "sdt",
);

const splitIds = (blob: unknown): string[] =>
  typeof blob === "string" && blob.length > 0 ? blob.split(ID_AGG_SEP) : [];

const findFromTimeFilter = (
  filter: ChFilterList,
): ChDateTimeFilter | undefined =>
  filter.find(
    (f) =>
      f instanceof ChDateTimeFilter &&
      f.clickhouseTable === "traces" &&
      f.field.includes("timestamp") &&
      (f.operator === ">=" || f.operator === ">"),
  ) as ChDateTimeFilter | undefined;

const ALL_TRACE_FIELDS = [
  "core",
  "io",
  "scores",
  "observations",
  "metrics",
] as const;

/**
 * Public-API trace list. Mirrors the CH `buildTracesBaseQuery` field-group contract on the merged
 * projection: optional observation/score CTEs supply the `observations` / `scores` id arrays and the
 * `latency` / `totalCost` metrics; rollup-score advanced filters route to a correlated score-grain
 * EXISTS (TRACE_SCORE_GRAIN). Observation-aggregate advanced filtering (CH `observation_stats` column
 * filters) has no per-row projection column and is a documented narrow gap — it throws loud rather
 * than silently mis-filter. Returns the same domain shape as `convertClickhouseTracesListToDomain`.
 */
export const generateTracesForPublicApi = async ({
  projectId,
  filter,
  orderBy,
  pagination,
  fields,
}: {
  projectId: string;
  filter: ChFilterList;
  orderBy: OrderByState;
  pagination?: { limit: number; page: number };
  fields?: readonly string[];
}) => {
  if (filter.some((f) => f.clickhouseTable === "observations")) {
    throw new Error(
      "Observation-aggregate filtering is not supported on the GreptimeDB public traces API; " +
        "filter on trace columns (or score categories/values) instead.",
    );
  }

  const requested = fields ?? ALL_TRACE_FIELDS;
  const includeIo = requested.includes("io");
  const includeScores = requested.includes("scores");
  const includeObservations = requested.includes("observations");
  const includeMetrics = requested.includes("metrics");
  const needObsCte = includeObservations || includeMetrics;

  const applied = translateChFilterList(filter, {
    scoreGrain: TRACE_SCORE_GRAIN,
  }).apply();
  const fromTime = findFromTimeFilter(filter);
  const obsLowerBound = fromTime
    ? greptimeTsParam(
        new Date(fromTime.value.getTime() - TRACE_TO_OBS_LOOKBACK_MS),
      )
    : undefined;

  const ctes: string[] = [];
  if (needObsCte) {
    ctes.push(`obs_stats AS (
      SELECT
        trace_id,
        project_id,
        array_to_string(array_agg(id), :idsep) AS observation_ids,
        sum(coalesce(total_cost, 0)) AS total_cost,
        CAST((to_unixtime(greatest(max(start_time), max(end_time))) - to_unixtime(least(min(start_time), min(end_time)))) * 1000 AS BIGINT) AS latency_ms
      FROM observations
      WHERE project_id = :projectId AND ${notDeleted()}
        ${obsLowerBound ? "AND start_time >= :obsLowerBound" : ""}
      GROUP BY project_id, trace_id
    )`);
  }
  if (includeScores) {
    ctes.push(`score_stats AS (
      SELECT trace_id, project_id, array_to_string(array_agg(id), :idsep) AS score_ids
      FROM scores
      WHERE project_id = :projectId
        AND session_id IS NULL AND dataset_run_id IS NULL
        AND ${dataTypeInClause.sql}
        ${fromTime ? "AND timestamp >= :scoreFromTime" : ""}
        AND ${notDeleted()}
      GROUP BY project_id, trace_id
    )`);
  }

  const orderByClause =
    greptimeOrderBySql(orderBy, tracesTableGreptimeColumnDefinitions) ||
    "ORDER BY t.timestamp DESC";

  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      ${ctes.length ? `WITH ${ctes.join(",\n")}` : ""}
      SELECT ${greptimeTraceSelect({ prefix: "t", excludeIo: !includeIo, excludeMetadata: !includeIo })}
        ${needObsCte ? ", o.observation_ids AS observation_ids, o.total_cost AS rollup_total_cost, o.latency_ms AS rollup_latency_ms" : ""}
        ${includeScores ? ", sc.score_ids AS score_ids" : ""}
      FROM traces t
      ${needObsCte ? "LEFT JOIN obs_stats o ON t.id = o.trace_id AND t.project_id = o.project_id" : ""}
      ${includeScores ? "LEFT JOIN score_stats sc ON t.id = sc.trace_id AND t.project_id = sc.project_id" : ""}
      WHERE t.project_id = :projectId AND ${notDeleted("t")}
        ${applied.query ? `AND ${applied.query}` : ""}
      ${orderByClause}
      ${pagination ? "LIMIT :limit OFFSET :offset" : ""}`,
    params: {
      projectId,
      idsep: ID_AGG_SEP,
      ...(includeScores ? dataTypeInClause.params : {}),
      ...(obsLowerBound ? { obsLowerBound } : {}),
      ...(includeScores && fromTime
        ? { scoreFromTime: greptimeTsParam(fromTime.value) }
        : {}),
      ...(pagination
        ? {
            limit: pagination.limit,
            offset: (pagination.page - 1) * pagination.limit,
          }
        : {}),
      ...applied.params,
    },
    readOnly: true,
  });

  return rows.map((row) => ({
    ...convertGreptimeTraceRowToDomain(row),
    observations: includeObservations ? splitIds(row.observation_ids) : [],
    scores: includeScores ? splitIds(row.score_ids) : [],
    totalCost: includeMetrics ? Number(row.rollup_total_cost ?? 0) : -1,
    latency: includeMetrics ? Number(row.rollup_latency_ms ?? 0) / 1000 : -1,
    htmlPath: `/project/${projectId}/traces/${convertGreptimeTraceRowToDomain(row).id}`,
  }));
};

export const getTracesCountForPublicApi = async ({
  projectId,
  filter,
}: {
  projectId: string;
  filter: ChFilterList;
}): Promise<number> => {
  if (filter.some((f) => f.clickhouseTable === "observations")) {
    throw new Error(
      "Observation-aggregate filtering is not supported on the GreptimeDB public traces API; " +
        "filter on trace columns (or score categories/values) instead.",
    );
  }
  const applied = translateChFilterList(filter, {
    scoreGrain: TRACE_SCORE_GRAIN,
  }).apply();
  const rows = await greptimeQuery<{ count: string | number }>({
    query: `
      SELECT count(*) AS count
      FROM traces t
      WHERE t.project_id = :projectId AND ${notDeleted("t")}
        ${applied.query ? `AND ${applied.query}` : ""}`,
    params: { projectId, ...applied.params },
    readOnly: true,
  });
  return rows.length > 0 ? Number(rows[0].count) : 0;
};
