/**
 * Logic mirrors repositories/traces.ts (ClickHouse); syntax adapted for OceanBase.
 */
import { DatabaseAdapterFactory } from "../database";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/oceanbase-sql/factory";
import { FilterState } from "../../types";
import {
  DateTimeFilter,
  FilterList,
  StringFilter,
} from "../queries/oceanbase-sql/oceanbase-filter";
import { TraceRecordReadType } from "../repositories/definitions";
import { tracesTableUiColumnDefinitions } from "../tableMappings/mapTracesTable";
import { UiColumnMappings } from "../../tableDefinitions";
import { convertClickhouseToDomain } from "../repositories/traces_converters";
import { oceanbaseSearchCondition } from "../queries/oceanbase-sql/search";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  TRACE_TO_OBSERVATIONS_INTERVAL,
} from "../repositories/constants";
import { env } from "../../env";
import type { AnalyticsTraceEvent } from "../analytics-integrations/types";
import { recordDistribution } from "../instrumentation";
import { measureAndReturn } from "../oceanbase/measureAndReturn";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";
import { convertFilterParamsToPositional } from "../database/oceanbase-filter-helper";
import { logger } from "../logger";

/**
 * Checks if trace exists in OceanBase.
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
  const adapter = DatabaseAdapterFactory.getInstance();
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

  return measureAndReturn({
    operationName: "checkTraceExistsAndGetTimestamp",
    projectId,
    input: {
      params: {
        projectId,
        ...tracesFilterRes.params,
        ...(observationFilterRes ? observationFilterRes.params : {}),
        ...(timestamp
          ? { timestamp: adapter.convertDateToDateTime(timestamp) }
          : {}),
        ...(maxTimeStamp
          ? { maxTimeStamp: adapter.convertDateToDateTime(maxTimeStamp) }
          : {}),
        ...(exactTimestamp
          ? { exactTimestamp: adapter.convertDateToDateTime(exactTimestamp) }
          : {}),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "exists",
        projectId,
        operation_name: "checkTraceExistsAndGetTimestamp",
      },
    },
    fn: async (input: {
      params: Record<string, unknown>;
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();

      // OceanBase: mirror CH "FROM observations o FINAL" via dedup subquery
      const observations_dedup = `
    WITH observations_dedup AS (
      SELECT o.*
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) AS rn
        FROM observations
        WHERE project_id = ?
          ${timeStampFilter ? `AND start_time >= DATE_SUB(?, ${OBSERVATIONS_TO_TRACE_INTERVAL})` : ""}
          AND start_time >= DATE_SUB(?, ${OBSERVATIONS_TO_TRACE_INTERVAL})
      ) o
      WHERE o.rn = 1
    ),
    observations_agg AS (
      SELECT
        CASE
          WHEN SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) > 0 THEN 'ERROR'
          WHEN SUM(CASE WHEN level = 'WARNING' THEN 1 ELSE 0 END) > 0 THEN 'WARNING'
          WHEN SUM(CASE WHEN level = 'DEFAULT' THEN 1 ELSE 0 END) > 0 THEN 'DEFAULT'
          ELSE 'DEBUG'
        END AS aggregated_level,
        SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) AS error_count,
        SUM(CASE WHEN level = 'WARNING' THEN 1 ELSE 0 END) AS warning_count,
        SUM(CASE WHEN level = 'DEFAULT' THEN 1 ELSE 0 END) AS default_count,
        SUM(CASE WHEN level = 'DEBUG' THEN 1 ELSE 0 END) AS debug_count,
        trace_id,
        project_id
      FROM observations_dedup o
      GROUP BY trace_id, project_id
    )
  `;

      const filterConverted = convertFilterParamsToPositional(
        tracesFilterRes.query,
        tracesFilterRes.params,
      );

      const query = `
        ${observations_dedup}
        SELECT
          t.id AS id,
          t.project_id AS project_id,
          t.\`timestamp\` AS \`timestamp\`
        FROM (
          SELECT t.*,
            ROW_NUMBER() OVER (PARTITION BY t.id, t.project_id ORDER BY t.\`event_ts\` DESC) AS rn
          FROM traces t
          WHERE ${filterConverted.query}
          AND t.project_id = ?
          AND t.\`timestamp\` >= DATE_SUB(?, ${TRACE_TO_OBSERVATIONS_INTERVAL})
          ${maxTimeStamp ? "AND t.`timestamp` <= ?" : ""}
          ${!maxTimeStamp ? "AND t.`timestamp` <= DATE_ADD(?, INTERVAL 2 DAY)" : ""}
          ${exactTimestamp ? "AND DATE(t.`timestamp`) = DATE(?)" : ""}
        ) t
        ${observationFilterRes ? `INNER JOIN observations_agg o ON t.id = o.trace_id AND t.project_id = o.project_id` : ""}
        WHERE t.rn = 1
        GROUP BY t.id, t.project_id, t.\`timestamp\`
      `;

      // Param order: CTE (projectId, [traceTimestamp], timestamp, timestamp), then filter params, then main (projectId, timestamp, maxOrTimestamp, [exactTimestamp])
      const cteParams: unknown[] = [
        input.params.projectId,
        ...(timeStampFilter
          ? [adapter.convertDateToDateTime(timeStampFilter.value)]
          : []),
        input.params.timestamp,
        input.params.timestamp,
      ];
      const mainParams: unknown[] = [
        input.params.projectId,
        input.params.timestamp,
        maxTimeStamp ? input.params.maxTimeStamp : input.params.timestamp,
        ...(exactTimestamp ? [input.params.exactTimestamp] : []),
      ];
      const finalParams: unknown[] = [
        ...cteParams,
        ...filterConverted.params,
        ...mainParams,
      ];

      const rows = await adapter.queryWithOptions<{
        id: string;
        project_id: string;
        timestamp: string;
      }>({
        query,
        params: finalParams,
        tags: input.tags,
      });

      return {
        exists: rows.length > 0,
        timestamp:
          rows.length > 0
            ? adapter.parseUTCDateTimeFormat(rows[0].timestamp)
            : undefined,
      };
    },
  });
};

/**
 * Accepts a trace in a database-ready format.
 * id, project_id, and timestamp must always be provided.
 */
export const upsertTrace = async (trace: Partial<TraceRecordReadType>) => {
  if (!["id", "project_id", "timestamp"].every((key) => key in trace)) {
    throw new Error("Identifier fields must be provided to upsert Trace.");
  }

  // Ensure required fields have values for OceanBase compatibility
  const traceWithDefaults = {
    ...trace,
    name: trace.name ?? "", // Provide empty string as default for name field to satisfy NOT NULL constraint
  } as TraceRecordReadType;

  const adapter = DatabaseAdapterFactory.getInstance();
  await adapter.upsert({
    table: "traces",
    records: [traceWithDefaults],
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
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const records = await measureAndReturn({
    operationName: "getTracesByIds",
    projectId,
    input: {
      params: {
        traceIds,
        projectId,
        timestamp: timestamp ? adapter.convertDateToDateTime(timestamp) : null,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "byId",
        projectId,
        operation_name: "getTracesByIds",
      },
    },
    fn: (input: {
      params: {
        traceIds: string[];
        projectId: string;
        timestamp: string | null;
      };
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();
      const traceIdsArray = (input.params.traceIds as string[]) || [];
      const traceIdsCondition =
        traceIdsArray.length > 0
          ? `id IN (${traceIdsArray.map(() => "?").join(", ")})`
          : "1=0";

      const query = `
        SELECT *
        FROM (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
          FROM traces
          WHERE ${traceIdsCondition}
          AND project_id = ?
          ${timestamp ? `AND \`timestamp\` >= ?` : ""}
        ) ranked
        WHERE rn = 1
        ORDER BY \`event_ts\` DESC
      `;

      const params = [
        ...(traceIdsArray.length > 0 ? traceIdsArray : []),
        input.params.projectId,
        ...(timestamp ? [input.params.timestamp] : []),
      ] as unknown[];

      return adapter.queryWithOptions<TraceRecordReadType>({
        query,
        params,
        tags: input.tags,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const records = await measureAndReturn({
    operationName: "getTracesBySessionId",
    projectId,
    input: {
      params: {
        sessionIds,
        projectId,
        timestamp: timestamp ? adapter.convertDateToDateTime(timestamp) : null,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "list",
        projectId,
        operation_name: "getTracesBySessionId",
      },
    },
    fn: (input: {
      params: {
        sessionIds: string[];
        projectId: string;
        timestamp: string | null;
      };
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();
      const sessionIdsArray = input.params.sessionIds as string[];
      // Handle empty sessionIds array by using 1=0 condition to avoid SQL syntax error with IN ()
      const sessionIdCondition =
        sessionIdsArray.length === 0
          ? "1=0"
          : `session_id IN (${sessionIdsArray.map(() => "?").join(", ")})`;

      const query = `
        SELECT *
        FROM (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
          FROM traces
          WHERE ${sessionIdCondition}
          AND project_id = ?
          ${timestamp ? `AND \`timestamp\` >= ?` : ""}
        ) ranked
        WHERE rn = 1
        ORDER BY \`event_ts\` DESC
      `;

      const params = [
        ...(sessionIdsArray.length > 0 ? sessionIdsArray : []),
        input.params.projectId,
        ...(timestamp ? [input.params.timestamp] : []),
      ] as unknown[];

      return adapter.queryWithOptions<TraceRecordReadType>({
        query,
        params,
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
  return measureAndReturn({
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
      const adapter = DatabaseAdapterFactory.getInstance();

      const query = `
        SELECT 1
        FROM traces
        WHERE project_id = ?
        LIMIT 1
      `;

      const params = [input.projectId] as unknown[];

      const rows = await adapter.queryWithOptions<{ 1: number }>({
        query,
        params,
        tags: input.tags,
      });

      return rows.length > 0;
    },
  });
};

export const getTraceCountsByProjectInCreationInterval = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  return measureAndReturn({
    operationName: "getTraceCountsByProjectInCreationInterval",
    projectId: "__CROSS_PROJECT__",
    input: {
      params: {
        start: adapter.convertDateToDateTime(start),
        end: adapter.convertDateToDateTime(end),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "analytic",
        operation_name: "getTraceCountsByProjectInCreationInterval",
      },
    },
    fn: async (input: {
      params: {
        start: string;
        end: string;
      };
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();

      const query = `
        SELECT
          project_id,
          count(*) as count
        FROM traces
        WHERE created_at >= ?
        AND created_at < ?
        GROUP BY project_id
      `;

      const params = [input.params.start, input.params.end] as unknown[];

      const rows = await adapter.queryWithOptions<{
        project_id: string;
        count: string;
      }>({
        query,
        params,
        tags: input.tags,
      });

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
  const adapter = DatabaseAdapterFactory.getInstance();
  return measureAndReturn({
    operationName: "getTraceCountOfProjectsSinceCreationDate",
    projectId: "__CROSS_PROJECT__",
    input: {
      params: {
        projectIds,
        start: adapter.convertDateToDateTime(start),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "analytic",
        operation_name: "getTraceCountOfProjectsSinceCreationDate",
      },
    },
    fn: async (input: {
      params: {
        projectIds: string[];
        start: string;
      };
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();
      const projectIdsArray = input.params.projectIds as string[];
      const projectIdsPlaceholders =
        projectIdsArray.length > 0
          ? projectIdsArray.map(() => "?").join(", ")
          : "NULL";
      const projectIdsCondition =
        projectIdsArray.length > 0
          ? `project_id IN (${projectIdsPlaceholders})`
          : "1=0";

      const query = `
        SELECT
          count(*) as count
        FROM traces
        WHERE ${projectIdsCondition}
        AND created_at >= ?
      `;

      const params = [
        ...(projectIdsArray.length > 0 ? projectIdsArray : []),
        input.params.start,
      ] as unknown[];

      const rows = await adapter.queryWithOptions<{ count: string }>({
        query,
        params,
        tags: input.tags,
      });

      return Number(rows[0]?.count ?? 0);
    },
  });
};

/**
 * Retrieves a trace record by its ID and associated project ID, with optional filtering by timestamp range.
 */
export const getTraceById = async ({
  traceId,
  projectId,
  timestamp,
  fromTimestamp,
  renderingProps = DEFAULT_RENDERING_PROPS,
  clickhouseFeatureTag = "tracing",
  excludeInputOutput = false,
}: {
  traceId: string;
  projectId: string;
  timestamp?: Date;
  fromTimestamp?: Date;
  renderingProps?: RenderingProps;
  clickhouseFeatureTag?: string;
  /** When true, sets input/output columns to empty in the query to reduce database load */
  excludeInputOutput?: boolean;
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const records = await measureAndReturn({
    operationName: "getTraceById",
    projectId,
    input: {
      params: {
        traceId,
        projectId,
        ...(timestamp
          ? { timestamp: adapter.convertDateToDateTime(timestamp) }
          : {}),
        ...(fromTimestamp
          ? { fromTimestamp: adapter.convertDateToDateTime(fromTimestamp) }
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
    fn: (input: {
      params: {
        traceId: string;
        projectId: string;
        timestamp?: string;
        fromTimestamp?: string;
      };
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();

      const inputColumn = excludeInputOutput
        ? "''"
        : renderingProps.truncated
          ? `LEFT(input, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT})`
          : "input";
      const outputColumn = excludeInputOutput
        ? "''"
        : renderingProps.truncated
          ? `LEFT(output, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT})`
          : "output";

      const query = `
        SELECT 
          id,
          \`name\` as name,
          user_id as user_id,
          metadata as metadata,
          \`release\` as \`release\`,
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
          \`timestamp\`,
          created_at,
          updated_at
        FROM traces
        WHERE id = ?
        AND project_id = ?
        ${timestamp ? "AND DATE(`timestamp`) = DATE(?)" : ""}
        ${fromTimestamp ? "AND `timestamp` >= ?" : ""}
        ORDER BY \`event_ts\` DESC
        LIMIT 1
      `;

      const params = [
        input.params.traceId,
        input.params.projectId,
        ...(timestamp ? [input.params.timestamp] : []),
        ...(fromTimestamp ? [input.params.fromTimestamp] : []),
      ] as unknown[];

      return adapter.queryWithOptions<TraceRecordReadType>({
        query,
        params,
        tags: input.tags,
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
    fn: async (input: {
      params: {
        projectId: string;
      };
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();

      // Convert filter query and params for OceanBase
      let filterQuery = timestampFilterRes?.query || "";
      let filterParams: unknown[] = [];
      if (timestampFilterRes) {
        const converted = convertFilterParamsToPositional(
          timestampFilterRes.query,
          timestampFilterRes.params,
        );
        filterQuery = converted.query;
        filterParams = converted.params;
      }

      const query = `
        select
          \`name\` as name,
          count(*) as count
        from traces t
        WHERE t.project_id = ?
        AND t.\`name\` IS NOT NULL
        ${filterQuery ? `AND ${filterQuery}` : ""}
        GROUP BY \`name\`
        ORDER BY count(*) desc
        LIMIT 1000
      `;

      const params = [input.params.projectId, ...filterParams] as unknown[];

      return adapter.queryWithOptions<{
        name: string;
        count: string;
      }>({
        query,
        params,
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
  const search = oceanbaseSearchCondition(searchQuery, undefined, "t");

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
      const adapter = DatabaseAdapterFactory.getInstance();

      // Convert filter and search queries for OceanBase
      let tracesFilterQuery = tracesFilterRes?.query || "";
      let tracesFilterParams: unknown[] = [];
      if (tracesFilterRes) {
        const converted = convertFilterParamsToPositional(
          tracesFilterRes.query,
          tracesFilterRes.params,
        );
        tracesFilterQuery = converted.query;
        tracesFilterParams = converted.params;
      }

      let searchQueryStr = search.query;
      let searchParams: unknown[] = [];
      if (search.params) {
        const converted = convertFilterParamsToPositional(
          search.query,
          search.params,
        );
        searchQueryStr = converted.query;
        searchParams = converted.params;
      }

      const query = `
        select
          session_id as session_id,
          count(*) as count
        from traces t
        WHERE t.project_id = ?
        AND t.session_id IS NOT NULL
        AND t.session_id != ''
        ${tracesFilterQuery ? `AND ${tracesFilterQuery}` : ""}
        ${searchQueryStr}
        GROUP BY session_id
        ORDER BY count desc
        ${limit !== undefined && offset !== undefined ? `LIMIT ? OFFSET ?` : ""}
      `;

      const params: unknown[] = [
        projectId,
        ...tracesFilterParams,
        ...searchParams,
        ...(limit !== undefined && offset !== undefined ? [limit, offset] : []),
      ];

      return adapter.queryWithOptions<{
        session_id: string;
        count: string;
      }>({
        query,
        params,
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
  const search = oceanbaseSearchCondition(searchQuery, undefined, "t");

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
      const adapter = DatabaseAdapterFactory.getInstance();

      // Convert filter and search queries for OceanBase
      let tracesFilterQuery = tracesFilterRes?.query || "";
      let tracesFilterParams: unknown[] = [];
      if (tracesFilterRes) {
        const converted = convertFilterParamsToPositional(
          tracesFilterRes.query,
          tracesFilterRes.params,
        );
        tracesFilterQuery = converted.query;
        tracesFilterParams = converted.params;
      }

      let searchQueryLocal = search.query;
      let searchParams: unknown[] = [];
      if (search.params) {
        const converted = convertFilterParamsToPositional(
          search.query,
          search.params,
        );
        searchQueryLocal = converted.query;
        searchParams = converted.params;
      }

      const query = `
        select
          user_id as user,
          count(*) as count
        from traces t
        WHERE t.project_id = ?
        AND t.user_id IS NOT NULL
        AND t.user_id != ''
        ${tracesFilterQuery ? `AND ${tracesFilterQuery}` : ""}
        ${searchQueryLocal}
        GROUP BY user
        ORDER BY count desc
        ${limit !== undefined && offset !== undefined ? `LIMIT ? OFFSET ?` : ""}
      `;

      const params: unknown[] = [
        projectId,
        ...tracesFilterParams,
        ...searchParams,
        ...(limit !== undefined && offset !== undefined ? [limit, offset] : []),
      ];

      return adapter.queryWithOptions<{
        user: string;
        count: string;
      }>({
        query,
        params,
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
    fn: async (input: {
      params: {
        projectId: string;
      };
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();

      // Convert filter query for OceanBase
      let filterQuery = filterRes?.query || "";
      let filterParams: unknown[] = [];
      if (filterRes) {
        const converted = convertFilterParamsToPositional(
          filterRes.query,
          filterRes.params,
        );
        filterQuery = converted.query;
        filterParams = converted.params;
      }

      const query = `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(tags, CONCAT('$[', n, ']'))) as \`value\`
     FROM traces t,
     (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
      UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) numbers
     WHERE t.project_id = ?
     AND JSON_EXTRACT(tags, CONCAT('$[', n, ']')) IS NOT NULL
     ${filterQuery ? `AND ${filterQuery}` : ""}
     LIMIT 1000`;

      const params = [input.params.projectId, ...filterParams] as unknown[];

      return adapter.queryWithOptions<{
        value: string;
      }>({
        query,
        params,
        tags: input.tags,
      });
    },
  });
};

export const getTracesIdentifierForSession = async (
  projectId: string,
  sessionId: string,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
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
    fn: (input: {
      params: {
        projectId: string;
        sessionId: string;
      };
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();

      const query = `
        SELECT
          id,
          user_id,
          \`name\`,
          \`timestamp\`,
          project_id,
          environment
        FROM (
          SELECT
            id,
            user_id,
            \`name\`,
            \`timestamp\`,
            project_id,
            environment,
            ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`timestamp\` ASC) as rn
          FROM traces
          WHERE (project_id = ?)
          AND (session_id = ?)
        ) ranked
        WHERE rn = 1
        ORDER BY \`timestamp\` ASC
      `;

      const params = [
        input.params.projectId,
        input.params.sessionId,
      ] as unknown[];

      return adapter.queryWithOptions<{
        id: string;
        user_id: string;
        name: string;
        timestamp: string;
        environment: string;
      }>({
        query,
        params,
        tags: input.tags,
      });
    },
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    timestamp: adapter.parseUTCDateTimeFormat(row.timestamp),
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
      const adapter = DatabaseAdapterFactory.getInstance();
      const traceIdsArray = input.params.traceIds as string[];
      const traceIdCondition =
        traceIdsArray.length === 0
          ? "1=0"
          : `id IN (${traceIdsArray.map(() => "?").join(", ")})`;

      // Pre-flight: time bounds for partition pruning (mirror CH)
      const preflight = await adapter.queryWithOptions<{
        min_ts: string;
        max_ts: string;
        cnt: string;
      }>({
        query: `
          SELECT
            DATE_SUB(MIN(\`timestamp\`), INTERVAL 1 HOUR) AS min_ts,
            DATE_ADD(MAX(\`timestamp\`), INTERVAL 1 HOUR) AS max_ts,
            COUNT(*) AS cnt
          FROM traces
          WHERE project_id = ? AND (${traceIdsArray.length === 0 ? "1=0" : traceIdCondition})
        `,
        params: [
          input.params.projectId,
          ...(traceIdsArray.length > 0 ? traceIdsArray : []),
        ] as unknown[],
        tags: { ...input.tags, kind: "delete-preflight" },
      });

      const count = Number(preflight[0]?.cnt ?? 0);
      if (count === 0) {
        logger.info(
          `deleteTraces: no rows found for project ${projectId}, skipping DELETE`,
        );
        return;
      }

      await adapter.commandWithOptions({
        query: `
          DELETE FROM traces
          WHERE project_id = ?
          AND (${traceIdsArray.length === 0 ? "1=0" : traceIdCondition})
          AND \`timestamp\` >= ?
          AND \`timestamp\` <= ?
        `,
        params: [
          input.params.projectId,
          ...(traceIdsArray.length > 0 ? traceIdsArray : []),
          preflight[0].min_ts,
          preflight[0].max_ts,
        ] as unknown[],
        tags: input.tags,
      });
    },
  });
};

export const hasAnyTraceOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT 1
    FROM traces
    WHERE project_id = ?
    AND \`timestamp\` < ?
    LIMIT 1
  `;

  const rows = await adapter.queryWithOptions<{ 1: number }>({
    query,
    params: [projectId, adapter.convertDateToDateTime(beforeDate)],
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

  const adapter = DatabaseAdapterFactory.getInstance();
  await measureAndReturn({
    operationName: "deleteTracesOlderThanDays",
    projectId,
    input: {
      params: {
        projectId,
        cutoffDate: adapter.convertDateToDateTime(beforeDate),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "delete",
        projectId,
      },
    },
    fn: async (input) => {
      const adapter = DatabaseAdapterFactory.getInstance();

      const query = `
        DELETE FROM traces
        WHERE project_id = ?
        AND \`timestamp\` < ?
      `;

      const params = [
        input.params.projectId,
        input.params.cutoffDate,
      ] as unknown[];

      await adapter.commandWithOptions({
        query: query,
        params,
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
    fn: async (input: {
      params: {
        projectId: string;
      };
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();

      const query = `
        DELETE FROM traces
        WHERE project_id = ?
      `;

      const params = [input.params.projectId] as unknown as Record<
        string,
        unknown
      >;

      await adapter.commandWithOptions({
        query: query,
        params,
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
    fn: async (input: { projectId: string; tags: Record<string, string> }) => {
      const adapter = DatabaseAdapterFactory.getInstance();

      const query = `
        SELECT 1
        FROM traces
        WHERE project_id = ?
        AND user_id IS NOT NULL
        AND user_id != ''
        LIMIT 1
      `;

      const params = [input.projectId] as unknown[];

      const rows = await adapter.queryWithOptions<{ 1: number }>({
        query,
        params,
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
  const search = oceanbaseSearchCondition(searchQuery, undefined, "t");

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
      const adapter = DatabaseAdapterFactory.getInstance();

      // Convert filter and search queries for OceanBase
      let tracesFilterQuery = tracesFilterRes?.query || "";
      let tracesFilterParams: unknown[] = [];
      if (tracesFilterRes) {
        const converted = convertFilterParamsToPositional(
          tracesFilterRes.query,
          tracesFilterRes.params,
        );
        tracesFilterQuery = converted.query;
        tracesFilterParams = converted.params;
      }

      let searchQueryLocal = search.query;
      let searchParams: unknown[] = [];
      if (search.params) {
        const converted = convertFilterParamsToPositional(
          search.query,
          search.params,
        );
        searchQueryLocal = converted.query;
        searchParams = converted.params;
      }

      const query = `
        SELECT COUNT(DISTINCT t.user_id) AS totalCount
        FROM traces t
        WHERE t.project_id = ?
        ${tracesFilterQuery ? `AND ${tracesFilterQuery}` : ""}
        ${searchQueryLocal}
        AND t.user_id IS NOT NULL
        AND t.user_id != ''
      `;

      const params: unknown[] = [
        projectId,
        ...tracesFilterParams,
        ...searchParams,
      ];

      return adapter.queryWithOptions({
        query,
        params,
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
  // OceanBase compatible version with JSON aggregation for usage_details
  const query = `
      WITH ranked_observations AS (
        SELECT
            o.project_id,
            o.trace_id,
            o.usage_details,
            o.total_cost,
            o.id,
            ROW_NUMBER() OVER (
                PARTITION BY o.id
                ORDER BY o.\`event_ts\` DESC
            ) AS rn
        FROM observations o
        WHERE o.project_id = ?
            ${timestampFilter ? `AND o.start_time >= DATE_SUB(?, ${OBSERVATIONS_TO_TRACE_INTERVAL})` : ""}
            AND o.trace_id IN (
                SELECT DISTINCT id
                FROM traces t
                WHERE t.user_id IN (${userIds.map(() => "?").join(", ")})
                    AND t.project_id = ?
            )
            AND o.type = 'GENERATION'
      ),
      deduplicated_observations AS (
        SELECT *
        FROM ranked_observations
        WHERE rn = 1
      ),
      ranked_traces AS (
        SELECT
            t.id,
            t.user_id,
            t.project_id,
            t.\`timestamp\`,
            t.environment,
            ROW_NUMBER() OVER (
                PARTITION BY t.id, t.project_id
                ORDER BY t.\`event_ts\` DESC
            ) AS rn
        FROM traces t
        WHERE t.user_id IN (${userIds.map(() => "?").join(", ")})
            AND t.project_id = ?
      ),
      deduplicated_traces AS (
        SELECT *
        FROM ranked_traces
        WHERE rn = 1
      ),
      usage_keys AS (
        SELECT 
            o.trace_id,
            t.user_id,
            JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(o.usage_details), CONCAT('$[', n.n, ']'))) AS usage_key
        FROM deduplicated_observations o
        JOIN deduplicated_traces t ON t.id = o.trace_id AND t.project_id = o.project_id
        CROSS JOIN (
            SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
            UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
            UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
        ) n
        WHERE JSON_EXTRACT(JSON_KEYS(o.usage_details), CONCAT('$[', n.n, ']')) IS NOT NULL
      ),
      usage_expanded AS (
        SELECT 
            uk.trace_id,
            uk.user_id,
            uk.usage_key,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(o.usage_details, CONCAT('$.', uk.usage_key))) AS UNSIGNED) AS usage_value
        FROM usage_keys uk
        JOIN deduplicated_observations o ON uk.trace_id = o.trace_id
      ),
      usage_summed AS (
        SELECT 
            t.user_id,
            ue.usage_key,
            SUM(ue.usage_value) as usage_value
        FROM usage_expanded ue
        JOIN deduplicated_traces t ON ue.trace_id = t.id
        GROUP BY t.user_id, ue.usage_key
      ),
      usage_agg AS (
        SELECT 
            user_id,
            JSON_OBJECTAGG(usage_key, usage_value) as sum_usage_details
        FROM usage_summed
        GROUP BY user_id
      ),
      stats AS (
        SELECT
            t.user_id as user_id,
            MAX(t.environment) as environment,
            COUNT(DISTINCT o.id) as obs_count,
            COALESCE(ua.sum_usage_details, CAST('{}' AS JSON)) as sum_usage_details,
            SUM(o.total_cost) as sum_total_cost,
            MAX(t.\`timestamp\`) as max_timestamp,
            MIN(t.\`timestamp\`) as min_timestamp,
            COUNT(DISTINCT t.id) as trace_count
        FROM deduplicated_traces t
        LEFT JOIN deduplicated_observations o ON t.id = o.trace_id AND t.project_id = o.project_id
        LEFT JOIN usage_agg ua ON t.user_id = ua.user_id
        GROUP BY t.user_id
      )
      SELECT
          COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(sum_usage_details, '$.input')) AS UNSIGNED), 0) as input_usage,
          COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(sum_usage_details, '$.output')) AS UNSIGNED), 0) as output_usage,
          COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(sum_usage_details, '$.total')) AS UNSIGNED), 0) as total_usage,
          obs_count,
          trace_count,
          user_id,
          environment,
          sum_total_cost,
          max_timestamp,
          min_timestamp
      FROM stats`;
  const adapter = DatabaseAdapterFactory.getInstance();
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
              traceTimestamp: adapter.convertDateToDateTime(
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
    fn: async (input: {
      params: {
        projectId: string;
        userIds: string[];
        traceTimestamp?: string;
      };
      tags: Record<string, string>;
    }) => {
      const adapter = DatabaseAdapterFactory.getInstance();

      // Build positional parameters array for OceanBase
      const params: unknown[] = [
        projectId, // ranked_observations WHERE project_id = ?
      ];

      if (timestampFilter) {
        params.push(
          adapter.convertDateToDateTime(
            (timestampFilter as DateTimeFilter).value,
          ),
        );
      }

      // ranked_observations subquery IN clause
      params.push(...userIds);
      params.push(projectId);

      // ranked_traces WHERE user_id IN
      params.push(...userIds);
      params.push(projectId);

      const rows = await adapter.queryWithOptions<{
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
        query,
        params,
        tags: input.tags,
      });

      return rows.map((row) => ({
        userId: row.user_id,
        environment: row.environment,
        maxTimestamp: adapter.parseUTCDateTimeFormat(row.max_timestamp),
        minTimestamp: adapter.parseUTCDateTimeFormat(row.min_timestamp),
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const traceTable = "traces";
  // OceanBase: mirror CH "FROM traces FINAL" via ROW_NUMBER dedup
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
      \`release\`,
      version,
      public,
      bookmarked,
      tags,
      input,
      output
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) AS rn
      FROM ${traceTable}
      WHERE project_id = ?
      AND \`timestamp\` >= ?
      AND \`timestamp\` <= ?
    ) t
    WHERE rn = 1
  `;

  return adapter.queryStreamWithOptions<Record<string, unknown>>({
    query,
    params: [
      projectId,
      adapter.convertDateToDateTime(minTimestamp),
      adapter.convertDateToDateTime(maxTimestamp),
    ],
    tags: {
      feature: "blobstorage",
      type: "trace",
      kind: "analytic",
      projectId,
    },
  });
};

export const getTracesForAnalyticsIntegrations = async function* (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const traceTable = "traces";
  const adapter = DatabaseAdapterFactory.getInstance();
  const minTs = adapter.convertDateToDateTime(minTimestamp);
  const maxTs = adapter.convertDateToDateTime(maxTimestamp);
  // OceanBase: mirror CH "observations o FINAL" and "traces t FINAL" via ROW_NUMBER dedup
  const query = `
    WITH observations_dedup AS (
      SELECT o.*
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) AS rn
        FROM observations
        WHERE project_id = ?
        AND start_time >= DATE_SUB(?, ${TRACE_TO_OBSERVATIONS_INTERVAL})
      ) o
      WHERE o.rn = 1
    ),
    observations_agg AS (
      SELECT o.project_id,
             o.trace_id,
             SUM(o.total_cost) AS total_cost,
             COUNT(*) AS observation_count,
             TIMESTAMPDIFF(MICROSECOND, LEAST(MIN(o.start_time), MIN(o.end_time)), GREATEST(MAX(o.start_time), MAX(o.end_time))) / 1000 AS latency_milliseconds
      FROM observations_dedup o
      GROUP BY o.project_id, o.trace_id
    ),
    traces_dedup AS (
      SELECT t.*
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) AS rn
        FROM ${traceTable}
        WHERE project_id = ?
        AND \`timestamp\` >= ?
        AND \`timestamp\` <= ?
      ) t
      WHERE t.rn = 1
    )
    SELECT
      t.id AS id,
      t.\`timestamp\` AS \`timestamp\`,
      t.\`name\` AS name,
      t.session_id AS session_id,
      t.user_id AS user_id,
      t.\`release\` AS \`release\`,
      t.version AS version,
      t.tags AS tags,
      t.environment AS environment,
      JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.$posthog_session_id')) AS posthog_session_id,
      JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.$mixpanel_session_id')) AS mixpanel_session_id,
      o.total_cost AS total_cost,
      o.latency_milliseconds / 1000 AS latency,
      o.observation_count AS observation_count
    FROM traces_dedup t
    LEFT JOIN observations_agg o ON t.id = o.trace_id AND t.project_id = o.project_id
  `;

  const records = adapter.queryStreamWithOptions<Record<string, unknown>>({
    query,
    params: [projectId, minTs, projectId, minTs, maxTs],
    tags: {
      feature: "posthog",
      type: "trace",
      kind: "analytic",
      projectId,
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
      const adapter = DatabaseAdapterFactory.getInstance();
      const traceIdsArray = input.params.traceIds as string[];
      // Handle empty traceIds array by using 1=0 condition to avoid SQL syntax error with IN ()
      const traceIdCondition =
        traceIdsArray.length === 0
          ? "1=0"
          : `id IN (${traceIdsArray.map(() => "?").join(", ")})`;

      const query = `
          SELECT id, project_id
          FROM (
            SELECT id, project_id,
              ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
            FROM traces
            WHERE ${traceIdCondition}
          ) ranked
          WHERE rn = 1
          ORDER BY \`event_ts\` DESC`;
      const records = await adapter.queryWithOptions<{
        id: string;
        project_id: string;
      }>({
        query,
        params: traceIdsArray.length > 0 ? traceIdsArray : [],
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const { projectId, traceId, chMinStartTime, chMaxStartTime } = params;

  const query = `
          SELECT
            id,
            parent_observation_id,
            type,
            \`name\`,
            start_time,
            end_time,
            JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.langgraph_node')) AS node,
            JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.langgraph_step')) AS step
          FROM
            observations
          WHERE
            project_id = ?
            AND trace_id = ?
            AND start_time >= ?
            AND start_time <= ?
        `;

  return adapter.queryWithOptions({
    query,
    params: [projectId, traceId, chMinStartTime, chMaxStartTime],
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
 * queries against database. Generous 4x overcompensation before blocking allows
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT
      count(*) as count,
      project_id,
      DATE(\`timestamp\`) as date
    FROM traces
    WHERE \`timestamp\` >= ?
    AND \`timestamp\` < ?
    GROUP BY project_id, DATE(\`timestamp\`)
  `;

  const rows = await adapter.queryWithOptions<{
    count: string;
    project_id: string;
    date: string;
  }>({
    query,
    params: [
      adapter.convertDateToDateTime(startDate),
      adapter.convertDateToDateTime(endDate),
    ],
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
