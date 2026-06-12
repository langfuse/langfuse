import { prisma } from "../../../db";
import { type FilterState } from "../../../types";
import { type ColumnDefinition } from "../../../tableDefinitions";
import { tracesTableCols } from "../../../tableDefinitions/tracesTable";
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
