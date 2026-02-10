import {
  commandClickhouse,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
  queryClickhouseStream,
  upsertClickhouse,
} from "./clickhouse";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-sql/factory";
import { FilterState } from "../../types";
import {
  DateTimeFilter,
  FilterList,
  StringFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { TraceRecordReadType } from "./definitions";
import { tracesTableUiColumnDefinitions } from "../tableMappings/mapTracesTable";
import { UiColumnMappings } from "../../tableDefinitions";
import {
  convertDateToClickhouseDateTime,
  PreferredClickhouseService,
} from "../clickhouse/client";
import { convertClickhouseToDomain } from "./traces_converters";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  TRACE_TO_OBSERVATIONS_INTERVAL,
} from "./constants";
import { env } from "../../env";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { recordDistribution } from "../instrumentation";
import type { AnalyticsTraceEvent } from "../analytics-integrations/types";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";
import { logger } from "../logger";
import { traceException } from "../instrumentation";
import { prisma } from "../../db";

/**
 * Checks if trace exists in clickhouse.
 * Additionally, give back the timestamp of the trace as metadata.
 *
 * @param {string} projectId - Project ID for the trace
 * @param {string} traceId - ID of the trace to check
 * @param {Date} timestamp - Timestamp for time-based filtering, uses event payload or job timestamp
 * @param {FilterState} filter - Filter for the trace
 * @param {Date} maxTimeStamp - Upper bound on timestamp
 * @param {Date} exactTimestamp - Exact match for the trace
 * @returns {Promise<boolean>} - True if trace exists
 *
 * Notes:
 * • Filters within ±2 day window
 * • Used for validating trace references before eval job creation
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
  const { tracesFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });

  const timeStampFilter = tracesFilter.find(
    (f) =>
      f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  tracesFilter.push(
    ...createFilterFromFilterState(filter, tracesTableUiColumnDefinitions),
    new StringFilter({
      clickhouseTable: "t",
      field: "id",
      operator: "=",
      value: traceId,
    }),
  );

  const observationFilter = tracesFilter.find(
    (f) => f.clickhouseTable === "observations",
  );
  const tracesFilterRes = tracesFilter.apply();
  const observationFilterRes = observationFilter?.apply();

  const observations_cte = `
    WITH observations_agg AS (
      SELECT
        multiIf(
          arrayExists(x -> x = 'ERROR', groupArray(level)), 'ERROR',
          arrayExists(x -> x = 'WARNING', groupArray(level)), 'WARNING',
          arrayExists(x -> x = 'DEFAULT', groupArray(level)), 'DEFAULT',
          'DEBUG'
        ) AS aggregated_level,
        countIf(level = 'ERROR') as error_count,
        countIf(level = 'WARNING') as warning_count,
        countIf(level = 'DEFAULT') as default_count,
        countIf(level = 'DEBUG') as debug_count,
        trace_id,
        project_id
      FROM observations o FINAL
      WHERE o.project_id = {projectId: String}
        ${timeStampFilter ? `AND o.start_time >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
        AND o.start_time >= {timestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}
      GROUP BY trace_id, project_id
    )
  `;

  return measureAndReturn({
    operationName: "checkTraceExistsAndGetTimestamp",
    projectId,
    input: {
      params: {
        projectId,
        ...tracesFilterRes.params,
        ...(observationFilterRes ? observationFilterRes.params : {}),
        ...(timestamp
          ? { timestamp: convertDateToClickhouseDateTime(timestamp) }
          : {}),
        ...(maxTimeStamp
          ? { maxTimeStamp: convertDateToClickhouseDateTime(maxTimeStamp) }
          : {}),
        ...(exactTimestamp
          ? { exactTimestamp: convertDateToClickhouseDateTime(exactTimestamp) }
          : {}),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "exists",
        projectId,
        operation_name: "checkTraceExistsAndGetTimestamp",
      },
      timestamp: timestamp ?? exactTimestamp,
    },
    fn: async (input) => {
      const query = `
        ${observations_cte}
        SELECT
          t.id as id,
          t.project_id as project_id,
          t.timestamp as timestamp
        FROM traces t FINAL
        ${observationFilterRes ? `INNER JOIN observations_agg o ON t.id = o.trace_id AND t.project_id = o.project_id` : ""}
        WHERE ${tracesFilterRes.query}
        AND t.project_id = {projectId: String}
        AND t.timestamp >= {timestamp: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}
        ${maxTimeStamp ? `AND t.timestamp <= {maxTimeStamp: DateTime64(3)}` : ""}
        ${!maxTimeStamp ? `AND t.timestamp <= {timestamp: DateTime64(3)} + INTERVAL 2 DAY` : ""}
        ${exactTimestamp ? `AND toDate(t.timestamp) = toDate({exactTimestamp: DateTime64(3)})` : ""}
        GROUP BY t.id, t.project_id, t.timestamp
      `;

      const rows = await queryClickhouse<{
        id: string;
        project_id: string;
        timestamp: string;
      }>({
        query,
        params: input.params,
        tags: input.tags,
      });

      return {
        exists: rows.length > 0,
        timestamp:
          rows.length > 0
            ? parseClickhouseUTCDateTimeFormat(rows[0].timestamp)
            : undefined,
      };
    },
  });
};

/**
 * Accepts a trace in a Clickhouse-ready format.
 * id, project_id, and timestamp must always be provided.
 */
export const upsertTrace = async (trace: Partial<TraceRecordReadType>) => {
  if (!["id", "project_id", "timestamp"].every((key) => key in trace)) {
    throw new Error("Identifier fields must be provided to upsert Trace.");
  }

  await upsertClickhouse({
    table: "traces",
    records: [trace as TraceRecordReadType],
    eventBodyMapper: convertClickhouseToDomain,
    tags: {
      feature: "tracing",
      type: "trace",
      kind: "upsert",
      projectId: trace.project_id ?? "",
    },
  });
};

export const getTracesByIds = async (
  traceIds: string[],
  projectId: string,
  timestamp?: Date,
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined,
) => {
  const records = await measureAndReturn({
    operationName: "getTracesByIds",
    projectId,
    input: {
      params: {
        traceIds,
        projectId,
        timestamp: timestamp
          ? convertDateToClickhouseDateTime(timestamp)
          : null,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "byId",
        projectId,
        operation_name: "getTracesByIds",
      },
      clickhouseConfigs,
    },
    fn: (input) => {
      const query = `
        SELECT *
        FROM traces
        WHERE id IN ({traceIds: Array(String)})
        AND project_id = {projectId: String}
        ${timestamp ? `AND timestamp >= {timestamp: DateTime64(3)}` : ""}
        ORDER BY event_ts DESC
        LIMIT 1 by id, project_id;
      `;
      return queryClickhouse<TraceRecordReadType>({
        query,
        params: input.params,
        tags: input.tags,
        clickhouseConfigs: input.clickhouseConfigs,
      });
    },
  });

  return records.map((record) =>
    convertClickhouseToDomain(record, DEFAULT_RENDERING_PROPS),
  );
};

export const getTracesBySessionId = async (
  projectId: string,
  sessionIds: string[],
  timestamp?: Date,
) => {
  const records = await measureAndReturn({
    operationName: "getTracesBySessionId",
    projectId,
    input: {
      params: {
        sessionIds,
        projectId,
        timestamp: timestamp
          ? convertDateToClickhouseDateTime(timestamp)
          : null,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "list",
        projectId,
        operation_name: "getTracesBySessionId",
      },
      timestamp,
    },
    fn: (input) => {
      const query = `
        SELECT *
        FROM traces
        WHERE session_id IN ({sessionIds: Array(String)})
        AND project_id = {projectId: String}
        ${timestamp ? `AND timestamp >= {timestamp: DateTime64(3)}` : ""}
        ORDER BY event_ts DESC
        LIMIT 1 by id, project_id;
      `;
      return queryClickhouse<TraceRecordReadType>({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });

  const traces = records.map((record) =>
    convertClickhouseToDomain(record, DEFAULT_RENDERING_PROPS),
  );

  traces.forEach((trace) => {
    recordDistribution(
      "langfuse.traces_by_session_id_age",
      new Date().getTime() - trace.timestamp.getTime(),
    );
  });

  return traces;
};

export const hasAnyTrace = async (projectId: string) => {
  // Check PostgreSQL flag first — once set, it's never reverted
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { hasTraces: true },
    });
    if (project?.hasTraces) {
      return true;
    }
  } catch (error) {
    traceException(error);
    logger.error("Failed to read hasTraces flag from PostgreSQL", {
      projectId,
      error,
    });
  }

  const result = await measureAndReturn({
    operationName: "hasAnyTrace",
    projectId,
    input: {
      projectId,
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "hasAny",
        projectId,
        operation_name: "hasAnyTrace",
      },
    },
    fn: async (input) => {
      const query = `
        SELECT 1
        FROM traces
        WHERE project_id = {projectId: String}
        LIMIT 1
      `;

      const rows = await queryClickhouse<{ 1: number }>({
        query,
        params: {
          projectId: input.projectId,
        },
        tags: input.tags,
        clickhouseSettings: {
          max_threads: 1,
        },
      });

      return rows.length > 0;
    },
  });

  // Persist positive result in PostgreSQL — once a project has traces, it stays true
  // Only update if not already set to avoid unnecessary writes
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

export const getTraceCountsByProjectInCreationInterval = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => {
  return measureAndReturn({
    operationName: "getTraceCountsByProjectInCreationInterval",
    projectId: "__CROSS_PROJECT__",
    input: {
      params: {
        start: convertDateToClickhouseDateTime(start),
        end: convertDateToClickhouseDateTime(end),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "analytic",
        operation_name: "getTraceCountsByProjectInCreationInterval",
      },
      timestamp: start,
    },
    fn: async (input) => {
      const query = `
        SELECT
          project_id,
          count(*) as count
        FROM traces
        WHERE created_at >= {start: DateTime64(3)}
        AND created_at < {end: DateTime64(3)}
        GROUP BY project_id
      `;

      const rows = await queryClickhouse<{ project_id: string; count: string }>(
        {
          query,
          params: input.params,
          tags: input.tags,
        },
      );

      return rows.map((row) => ({
        projectId: row.project_id,
        count: Number(row.count),
      }));
    },
  });
};

export const getTraceCountOfProjectsSinceCreationDate = async ({
  projectIds,
  start,
}: {
  projectIds: string[];
  start: Date;
}) => {
  return measureAndReturn({
    operationName: "getTraceCountOfProjectsSinceCreationDate",
    projectId: "__CROSS_PROJECT__",
    input: {
      params: {
        projectIds,
        start: convertDateToClickhouseDateTime(start),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "analytic",
        operation_name: "getTraceCountOfProjectsSinceCreationDate",
      },
      timestamp: start,
    },
    fn: async (input) => {
      const query = `
        SELECT
          count(*) as count
        FROM traces
        WHERE project_id IN ({projectIds: Array(String)})
        AND created_at >= {start: DateTime64(3)}
      `;

      const rows = await queryClickhouse<{ count: string }>({
        query,
        params: input.params,
        tags: input.tags,
      });

      return Number(rows[0]?.count ?? 0);
    },
  });
};

/**
 * Retrieves a trace record by its ID and associated project ID, with optional filtering by timestamp range.
 * If no timestamp filters are provided, runs two queries in parallel:
 * 1. One with a 7-day fromTimestamp filter (typically faster)
 * 2. One without any timestamp filters (complete but slower)
 * Returns the first non-empty result.
 */
export const getTraceById = async ({
  traceId,
  projectId,
  timestamp,
  fromTimestamp,
  renderingProps = DEFAULT_RENDERING_PROPS,
  clickhouseFeatureTag = "tracing",
  preferredClickhouseService,
  excludeInputOutput = false,
}: {
  traceId: string;
  projectId: string;
  timestamp?: Date;
  fromTimestamp?: Date;
  renderingProps?: RenderingProps;
  clickhouseFeatureTag?: string;
  preferredClickhouseService?: PreferredClickhouseService;
  /** When true, sets input/output columns to empty in the query to reduce database load */
  excludeInputOutput?: boolean;
}) => {
  const records = await measureAndReturn({
    operationName: "getTraceById",
    projectId,
    input: {
      params: {
        traceId,
        projectId,
        ...(timestamp
          ? { timestamp: convertDateToClickhouseDateTime(timestamp) }
          : {}),
        ...(fromTimestamp
          ? { fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp) }
          : {}),
      },
      tags: {
        feature: clickhouseFeatureTag,
        type: "trace",
        kind: "byId",
        projectId,
        operation_name: "getTraceById",
      },
    },
    fn: (input) => {
      const inputColumn = excludeInputOutput
        ? "''"
        : renderingProps.truncated
          ? `leftUTF8(input, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT})`
          : "input";
      const outputColumn = excludeInputOutput
        ? "''"
        : renderingProps.truncated
          ? `leftUTF8(output, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT})`
          : "output";

      const query = `
        SELECT
          id,
          name as name,
          user_id as user_id,
          metadata as metadata,
          release as release,
          version as version,
          project_id,
          environment,
          public as public,
          bookmarked as bookmarked,
          tags,
          ${inputColumn} as input,
          ${outputColumn} as output,
          session_id as session_id,
          0 as is_deleted,
          timestamp,
          created_at,
          updated_at
        FROM traces
        WHERE id = {traceId: String}
        AND project_id = {projectId: String}
        ${timestamp ? `AND toDate(timestamp) = toDate({timestamp: DateTime64(3)})` : ""}
        ${fromTimestamp ? `AND timestamp >= {fromTimestamp: DateTime64(3)}` : ""}
        ORDER BY event_ts DESC
        LIMIT 1
      `;

      return queryClickhouse<TraceRecordReadType>({
        query,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService,
      });
    },
  });

  const res = records.map((record) =>
    convertClickhouseToDomain(record, renderingProps),
  );

  res.forEach((trace) => {
    recordDistribution(
      "langfuse.query_by_id_age",
      new Date().getTime() - trace.timestamp.getTime(),
      {
        table: "traces",
      },
    );
  });

  return res.shift();
};

export const getTracesGroupedByName = async (
  projectId: string,
  tableDefinitions: UiColumnMappings = tracesTableUiColumnDefinitions,
  timestampFilter?: FilterState,
) => {
  const chFilter = timestampFilter
    ? createFilterFromFilterState(timestampFilter, tableDefinitions)
    : undefined;

  const timestampFilterRes = chFilter
    ? new FilterList(chFilter).apply()
    : undefined;

  return measureAndReturn({
    operationName: "getTracesGroupedByName",
    projectId,
    input: {
      params: {
        projectId,
        ...(timestampFilterRes ? timestampFilterRes.params : {}),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "analytic",
        projectId,
        operation_name: "getTracesGroupedByName",
      },
    },
    fn: async (input) => {
      // We mainly use queries like this to retrieve filter options.
      // Therefore, we can skip final as some inaccuracy in count is acceptable.
      const query = `
        select
          name as name,
          count(*) as count
        from traces t
        WHERE t.project_id = {projectId: String}
        AND t.name IS NOT NULL
        ${timestampFilterRes?.query ? `AND ${timestampFilterRes.query}` : ""}
        GROUP BY name
        ORDER BY count(*) desc
        LIMIT 1000;
      `;

      return queryClickhouse<{
        name: string;
        count: string;
      }>({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });
};

export const getTracesGroupedBySessionId = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  limit?: number,
  offset?: number,
  columns?: UiColumnMappings,
) => {
  const { tracesFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });

  tracesFilter.push(
    ...createFilterFromFilterState(
      filter,
      columns ?? tracesTableUiColumnDefinitions,
    ),
  );

  const tracesFilterRes = tracesFilter.apply();
  const search = clickhouseSearchCondition(searchQuery, undefined, "t");

  return measureAndReturn({
    operationName: "getTracesGroupedBySessionId",
    projectId,
    input: {
      params: {
        limit,
        offset,
        projectId,
        ...(tracesFilterRes ? tracesFilterRes.params : {}),
        ...(searchQuery ? search.params : {}),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "analytic",
        projectId,
        operation_name: "getTracesGroupedBySessionId",
      },
    },
    fn: async (input) => {
      // We mainly use queries like this to retrieve filter options.
      // Therefore, we can skip final as some inaccuracy in count is acceptable.
      const query = `
        select
          session_id as session_id,
          count(*) as count
        from traces t
        WHERE t.project_id = {projectId: String}
        AND t.session_id IS NOT NULL
        AND t.session_id != ''
        ${tracesFilterRes?.query ? `AND ${tracesFilterRes.query}` : ""}
        ${search.query}
        GROUP BY session_id
        ORDER BY count desc
        ${limit !== undefined && offset !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
      `;

      return queryClickhouse<{
        session_id: string;
        count: string;
      }>({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });
};

export const getTracesGroupedByUsers = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  limit?: number,
  offset?: number,
  columns?: UiColumnMappings,
) => {
  const { tracesFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });

  tracesFilter.push(
    ...createFilterFromFilterState(
      filter,
      columns ?? tracesTableUiColumnDefinitions,
    ),
  );

  const tracesFilterRes = tracesFilter.apply();
  const search = clickhouseSearchCondition(searchQuery, undefined, "t");

  return measureAndReturn({
    operationName: "getTracesGroupedByUsers",
    projectId,
    input: {
      params: {
        limit,
        offset,
        projectId,
        ...(tracesFilterRes ? tracesFilterRes.params : {}),
        ...(searchQuery ? search.params : {}),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "analytic",
        projectId,
        operation_name: "getTracesGroupedByUsers",
      },
    },
    fn: async (input) => {
      // We mainly use queries like this to retrieve filter options.
      // Therefore, we can skip final as some inaccuracy in count is acceptable.
      const query = `
        select
          user_id as user,
          count(*) as count
        from traces t
        WHERE t.project_id = {projectId: String}
        AND t.user_id IS NOT NULL
        AND t.user_id != ''
        ${tracesFilterRes?.query ? `AND ${tracesFilterRes.query}` : ""}
        ${search.query}
        GROUP BY user
        ORDER BY count desc
        ${limit !== undefined && offset !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
      `;

      return queryClickhouse<{
        user: string;
        count: string;
      }>({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });
};

export type GroupedTracesQueryProp = {
  projectId: string;
  filter: FilterState;
  columns?: UiColumnMappings;
};

export const getTracesGroupedByTags = async (props: GroupedTracesQueryProp) => {
  const { projectId, filter, columns } = props;

  const chFilter = createFilterFromFilterState(
    filter,
    columns ?? tracesTableUiColumnDefinitions,
  );

  const filterRes = new FilterList(chFilter).apply();

  return measureAndReturn({
    operationName: "getTracesGroupedByTags",
    projectId,
    input: {
      params: {
        projectId,
        ...(filterRes ? filterRes.params : {}),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "analytic",
        projectId,
        operation_name: "getTracesGroupedByTags",
      },
    },
    fn: async (input) => {
      const query = `
        select distinct(arrayJoin(tags)) as value
        from traces t
        WHERE t.project_id = {projectId: String}
        ${filterRes?.query ? `AND ${filterRes.query}` : ""}
        LIMIT 1000;
      `;

      return queryClickhouse<{
        value: string;
      }>({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });
};

export const getTracesIdentifierForSession = async (
  projectId: string,
  sessionId: string,
) => {
  const rows = await measureAndReturn({
    operationName: "getTracesIdentifierForSession",
    projectId,
    input: {
      params: {
        projectId,
        sessionId,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "list",
        projectId,
        operation_name: "getTracesIdentifierForSession",
      },
    },
    fn: (input) => {
      const query = `
        SELECT
          id,
          user_id,
          name,
          timestamp,
          project_id,
          environment
        FROM traces
        WHERE (project_id = {projectId: String})
        AND (session_id = {sessionId: String})
        ORDER BY timestamp ASC
        LIMIT 1 BY id, project_id;
      `;

      return queryClickhouse<{
        id: string;
        user_id: string;
        name: string;
        timestamp: string;
        environment: string;
      }>({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
    environment: row.environment,
  }));
};

export const deleteTraces = async (projectId: string, traceIds: string[]) => {
  await measureAndReturn({
    operationName: "deleteTraces",
    projectId,
    input: {
      params: {
        projectId,
        traceIds,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "delete",
        projectId,
      },
    },
    fn: async (input) => {
      // Pre-flight query with time bounds computed
      const preflight = await queryClickhouse<{
        min_ts: string;
        max_ts: string;
        cnt: string;
      }>({
        query: `
          SELECT
            min(timestamp) - INTERVAL 1 HOUR as min_ts,
            max(timestamp) + INTERVAL 1 HOUR as max_ts,
            count(*) as cnt
          FROM traces
          WHERE project_id = {projectId: String} AND id IN ({traceIds: Array(String)})
        `,
        params: input.params,
        clickhouseConfigs: {
          request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
        },
        tags: { ...input.tags, kind: "delete-preflight" },
      });

      const count = Number(preflight[0]?.cnt ?? 0);
      if (count === 0) {
        logger.info(
          `deleteTraces: no rows found for project ${projectId}, skipping DELETE`,
        );
        return;
      }

      await commandClickhouse({
        query: `
          DELETE FROM traces
          WHERE project_id = {projectId: String}
          AND id IN ({traceIds: Array(String)})
          AND timestamp >= {minTs: String}::DateTime64(3)
          AND timestamp <= {maxTs: String}::DateTime64(3)
        `,
        params: {
          ...input.params,
          minTs: preflight[0].min_ts,
          maxTs: preflight[0].max_ts,
        },
        clickhouseConfigs: {
          request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
        },
        tags: input.tags,
      });
    },
  });
};

export const hasAnyTraceOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => {
  const query = `
    SELECT 1
    FROM traces
    WHERE project_id = {projectId: String}
    AND timestamp < {cutoffDate: DateTime64(3)}
    LIMIT 1
  `;

  const rows = await queryClickhouse<{ 1: number }>({
    query,
    params: {
      projectId,
      cutoffDate: convertDateToClickhouseDateTime(beforeDate),
    },
    tags: {
      feature: "tracing",
      type: "trace",
      kind: "hasAnyOlderThan",
      projectId,
    },
  });

  return rows.length > 0;
};

export const deleteTracesOlderThanDays = async (
  projectId: string,
  beforeDate: Date,
): Promise<boolean> => {
  const hasData = await hasAnyTraceOlderThan(projectId, beforeDate);
  if (!hasData) {
    return false;
  }

  await measureAndReturn({
    operationName: "deleteTracesOlderThanDays",
    projectId,
    input: {
      params: {
        projectId,
        cutoffDate: convertDateToClickhouseDateTime(beforeDate),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "delete",
        projectId,
      },
    },
    fn: async (input) => {
      const query = `
        DELETE FROM traces
        WHERE project_id = {projectId: String}
        AND timestamp < {cutoffDate: DateTime64(3)};
      `;
      await commandClickhouse({
        query: query,
        params: input.params,
        clickhouseConfigs: {
          request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
        },
        tags: input.tags,
      });
    },
  });

  return true;
};

export const deleteTracesByProjectId = async (
  projectId: string,
): Promise<boolean> => {
  const hasData = await hasAnyTrace(projectId);
  if (!hasData) {
    return false;
  }

  await measureAndReturn({
    operationName: "deleteTracesByProjectId",
    projectId,
    input: {
      params: {
        projectId,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "delete",
        projectId,
      },
    },
    fn: async (input) => {
      const query = `
        DELETE FROM traces
        WHERE project_id = {projectId: String};
      `;

      await commandClickhouse({
        query,
        params: input.params,
        clickhouseConfigs: {
          request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
        },
        tags: input.tags,
      });
    },
  });

  return true;
};

export const hasAnyUser = async (projectId: string) => {
  return measureAndReturn({
    operationName: "hasAnyUser",
    projectId,
    input: {
      projectId,
      tags: {
        feature: "tracing",
        type: "user",
        kind: "hasAny",
        projectId,
        operation_name: "hasAnyUser",
      },
    },
    fn: async (input) => {
      const query = `
        SELECT 1
        FROM traces
        WHERE project_id = {projectId: String}
        AND user_id IS NOT NULL
        AND user_id != ''
        LIMIT 1
      `;

      const rows = await queryClickhouse<{ 1: number }>({
        query,
        params: {
          projectId: input.projectId,
        },
        tags: input.tags,
      });

      return rows.length > 0;
    },
  });
};

export const getTotalUserCount = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
): Promise<{ totalCount: bigint }[]> => {
  const { tracesFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });

  tracesFilter.push(
    ...createFilterFromFilterState(filter, tracesTableUiColumnDefinitions),
  );

  const tracesFilterRes = tracesFilter.apply();
  const search = clickhouseSearchCondition(searchQuery, undefined, "t");

  return measureAndReturn({
    operationName: "getTotalUserCount",
    projectId,
    input: {
      params: {
        ...tracesFilterRes.params,
        ...search.params,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "analytic",
        projectId,
        operation_name: "getTotalUserCount",
      },
    },
    fn: async (input) => {
      const query = `
        SELECT COUNT(DISTINCT t.user_id) AS totalCount
        FROM traces t
        WHERE ${tracesFilterRes.query}
        ${search.query}
        AND t.user_id IS NOT NULL
        AND t.user_id != ''
      `;

      return queryClickhouse({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });
};

export const getUserMetrics = async (
  projectId: string,
  userIds: string[],
  filter: FilterState,
) => {
  if (userIds.length === 0) {
    return [];
  }

  // filter state contains date range filter for traces so far.
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, tracesTableUiColumnDefinitions),
  );
  const chFilterRes = chFilter.apply();

  const timestampFilter = chFilter.find(
    (f) => f.field === "timestamp" && f.operator === ">=",
  );

  // this query uses window functions on observations + traces to always get only the first row and thereby remove deduplicates
  // we filter wherever possible by project id and user id
  const query = `
      WITH stats as (
        SELECT
            t.user_id as user_id,
            anyLast(t.environment) as environment,
            count(distinct o.id) as obs_count,
            sumMap(usage_details) as sum_usage_details,
            sum(total_cost) as sum_total_cost,
            max(t.timestamp) as max_timestamp,
            min(t.timestamp) as min_timestamp,
            count(distinct t.id) as trace_count
        FROM
            (
                SELECT
                    o.project_id,
                    o.trace_id,
                    o.usage_details,
                    o.total_cost,
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY id
                        ORDER BY
                            event_ts DESC
                    ) AS rn
                FROM
                    observations o
                WHERE
                    o.project_id = {projectId: String }
                    ${timestampFilter ? `AND o.start_time >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
                    AND o.trace_id in (
                        SELECT distinct id
                        from __TRACE_TABLE__ t
                        where
                            user_id IN ({userIds: Array(String) })
                            AND project_id = {projectId: String }
                            ${filter.length > 0 ? `AND ${chFilterRes.query}` : ""}
                    )
            ) as o
            JOIN (
                SELECT
                    t.id,
                    t.user_id,
                    t.project_id,
                    t.timestamp,
                    t.environment
                FROM
                    __TRACE_TABLE__ t FINAL
                WHERE
                    t.user_id IN ({userIds: Array(String) })
                    AND t.project_id = {projectId: String }
                    ${filter.length > 0 ? `AND ${chFilterRes.query}` : ""}
            ) as t on t.id = o.trace_id
            and t.project_id = o.project_id
        WHERE o.rn = 1
        group by t.user_id
    )
    SELECT
        arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, sum_usage_details))) as input_usage,
        arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, sum_usage_details))) as output_usage,
        sum_usage_details [ 'total' ] as total_usage,
        obs_count,
        trace_count,
        user_id,
        environment,
        sum_total_cost,
        max_timestamp,
        min_timestamp
    FROM stats`;

  return measureAndReturn({
    operationName: "getUserMetrics",
    projectId,
    input: {
      params: {
        projectId,
        userIds,
        ...chFilterRes.params,
        ...(timestampFilter
          ? {
              traceTimestamp: convertDateToClickhouseDateTime(
                (timestampFilter as DateTimeFilter).value,
              ),
            }
          : {}),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "analytic",
        projectId,
        operation_name: "getUserMetrics",
      },
    },
    fn: async (input) => {
      const rows = await queryClickhouse<{
        user_id: string;
        environment: string;
        max_timestamp: string;
        min_timestamp: string;
        input_usage: string;
        output_usage: string;
        total_usage: string;
        obs_count: string;
        trace_count: string;
        sum_total_cost: string;
      }>({
        query: query.replaceAll("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
      });

      return rows.map((row) => ({
        userId: row.user_id,
        environment: row.environment,
        maxTimestamp: parseClickhouseUTCDateTimeFormat(row.max_timestamp),
        minTimestamp: parseClickhouseUTCDateTimeFormat(row.min_timestamp),
        inputUsage: Number(row.input_usage),
        outputUsage: Number(row.output_usage),
        totalUsage: Number(row.total_usage),
        observationCount: Number(row.obs_count),
        traceCount: Number(row.trace_count),
        totalCost: Number(row.sum_total_cost),
      }));
    },
  });
};

export const getTracesForBlobStorageExport = function (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const traceTable = "traces";

  const query = `
    SELECT
      id,
      timestamp,
      name,
      environment,
      project_id,
      metadata,
      user_id,
      session_id,
      release,
      version,
      public as public,
      bookmarked as bookmarked,
      tags,
      input as input,
      output as output
    FROM ${traceTable} FINAL
    WHERE project_id = {projectId: String}
    AND timestamp >= {minTimestamp: DateTime64(3)}
    AND timestamp <= {maxTimestamp: DateTime64(3)}
  `;

  return queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
    },
    tags: {
      feature: "blobstorage",
      type: "trace",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
    },
  });
};

export const getTracesForAnalyticsIntegrations = async function* (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  // Determine which trace table to use based on experiment flag
  const traceTable = "traces";

  const query = `
    WITH observations_agg AS (
      SELECT o.project_id,
             o.trace_id,
             sum(total_cost) as total_cost,
             count(*) as observation_count,
             date_diff('millisecond', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latency_milliseconds
      FROM observations o FINAL
      WHERE o.project_id = {projectId: String}
      AND o.start_time >= {minTimestamp: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}
      GROUP BY o.project_id, o.trace_id
    )

    SELECT
      t.id as id,
      t.timestamp as timestamp,
      t.name as name,
      t.session_id as session_id,
      t.user_id as user_id,
      t.release as release,
      t.version as version,
      t.tags as tags,
      t.environment as environment,
      t.metadata['$posthog_session_id'] as posthog_session_id,
      t.metadata['$mixpanel_session_id'] as mixpanel_session_id,
      o.total_cost as total_cost,
      o.latency_milliseconds / 1000 as latency,
      o.observation_count as observation_count
    FROM ${traceTable} t FINAL
    LEFT JOIN observations_agg o ON t.id = o.trace_id AND t.project_id = o.project_id
    WHERE t.project_id = {projectId: String}
    AND t.timestamp >= {minTimestamp: DateTime64(3)}
    AND t.timestamp <= {maxTimestamp: DateTime64(3)}
  `;

  const records = queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
    },
    tags: {
      feature: "posthog",
      type: "trace",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
      clickhouse_settings: {
        join_algorithm: "grace_hash",
        grace_hash_join_initial_buckets: "32",
      },
    },
  });

  const baseUrl = env.NEXTAUTH_URL?.replace("/api/auth", "");

  for await (const record of records) {
    yield {
      timestamp: record.timestamp,
      langfuse_id: record.id,
      langfuse_trace_name: record.name,
      langfuse_url: `${baseUrl}/project/${projectId}/traces/${encodeURIComponent(record.id as string)}`,
      langfuse_user_url: record.user_id
        ? `${baseUrl}/project/${projectId}/users/${encodeURIComponent(record.user_id as string)}`
        : undefined,
      langfuse_cost_usd: record.total_cost,
      langfuse_count_observations: record.observation_count,
      langfuse_session_id: record.session_id,
      langfuse_project_id: projectId,
      langfuse_user_id: record.user_id || null,
      langfuse_latency: record.latency,
      langfuse_release: record.release,
      langfuse_version: record.version,
      langfuse_tags: record.tags,
      langfuse_environment: record.environment,
      langfuse_event_version: "1.0.0",
      posthog_session_id: record.posthog_session_id ?? null,
      mixpanel_session_id: record.mixpanel_session_id ?? null,
    } satisfies AnalyticsTraceEvent;
  }
};

/**
 * This query is used only for legacy support of redirects without a projectId.
 * We don't have an index on the traceId so it will be a full table scan.
 * We expect at most 10s of calls per day, so this is acceptable.
 */
export const getTracesByIdsForAnyProject = async (traceIds: string[]) => {
  return measureAndReturn({
    operationName: "getTracesByIdsForAnyProject",
    projectId: "__CROSS_PROJECT__",
    input: {
      params: {
        traceIds,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "list",
        operation_name: "getTracesByIdsForAnyProject",
      },
    },
    fn: async (input) => {
      const query = `
          SELECT id, project_id
          FROM traces
          WHERE id IN ({traceIds: Array(String)})
          ORDER BY event_ts DESC
          LIMIT 1 by id, project_id;`;
      const records = await queryClickhouse<{
        id: string;
        project_id: string;
      }>({
        query,
        params: input.params,
        tags: input.tags,
      });

      return records.map((record) => ({
        id: record.id,
        projectId: record.project_id,
      }));
    },
  });
};

export async function getAgentGraphData(params: {
  projectId: string;
  traceId: string;
  chMinStartTime: string;
  chMaxStartTime: string;
}) {
  const { projectId, traceId, chMinStartTime, chMaxStartTime } = params;

  const query = `
          SELECT
            id,
            parent_observation_id,
            type,
            name,
            start_time,
            end_time,
            metadata['langgraph_node'] AS node,
            metadata['langgraph_step'] AS step
          FROM
            observations
          WHERE
            project_id = {projectId: String}
            AND trace_id = {traceId: String}
            AND start_time >= {chMinStartTime: DateTime64(3)}
            AND start_time <= {chMaxStartTime: DateTime64(3)}
        `;

  return queryClickhouse({
    query,
    params: {
      traceId,
      projectId,
      chMinStartTime,
      chMaxStartTime,
    },
  });
}

/**
 * Get trace counts grouped by project and day within a date range.
 *
 * Returns one row per project per day with the count of traces created on that day.
 * Uses half-open interval [startDate, endDate) for filtering.
 *
 * @param startDate - Start of date range (inclusive)
 * @param endDate - End of date range (exclusive)
 * @returns Array of { count, projectId, date } objects
 *
 * @example
 * // Get trace counts for March 1-2, 2024
 * const counts = await getTraceCountsByProjectAndDay({
 *   startDate: new Date('2024-03-01T00:00:00Z'),
 *   endDate: new Date('2024-03-03T00:00:00Z')
 * });
 * // Returns: [
 * //   { count: 1500, projectId: 'proj-123', date: '2024-03-01' },
 * //   { count: 1200, projectId: 'proj-123', date: '2024-03-02' },
 * //   { count: 2300, projectId: 'proj-456', date: '2024-03-01' },
 * //   ...
 * // ]
 *
 * Note: Skips using FINAL (double counting risk) for faster and cheaper
 * queries against clickhouse. Generous 4x overcompensation before blocking allows
 * for usage aggregation to be meaningful.
 *
 */
export const getTraceCountsByProjectAndDay = async ({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}) => {
  const query = `
    SELECT
      count(*) as count,
      project_id,
      toDate(timestamp) as date
    FROM traces
    WHERE timestamp >= {startDate: DateTime64(3)}
    AND timestamp < {endDate: DateTime64(3)}
    GROUP BY project_id, toDate(timestamp)
  `;

  const rows = await queryClickhouse<{
    count: string;
    project_id: string;
    date: string;
  }>({
    query,
    params: {
      startDate: convertDateToClickhouseDateTime(startDate),
      endDate: convertDateToClickhouseDateTime(endDate),
    },
    tags: {
      feature: "tracing",
      type: "trace",
      kind: "analytic",
    },
  });

  return rows.map((row) => ({
    count: Number(row.count),
    projectId: row.project_id,
    date: row.date,
  }));
};
