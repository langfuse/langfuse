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
import { TraceRecordReadType, convertTraceToTraceNull } from "./definitions";
import { tracesTableUiColumnDefinitions } from "../../tableDefinitions/mapTracesTable";
import { UiColumnMappings } from "../../tableDefinitions";
import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
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
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";

// eslint-disable-next-line no-unused-vars
enum TracesAMTs {
  Traces7dAMT = "traces_7d_amt", // eslint-disable-line no-unused-vars
  Traces30dAMT = "traces_30d_amt", // eslint-disable-line no-unused-vars
  TracesAllAMT = "traces_all_amt", // eslint-disable-line no-unused-vars
}

/**
 * Returns which AMT table to use given the timestamp.
 * For <= 6 days, we use traces_7d_amt,
 * for <= 29 days, we use traces_30d_amt,
 * for all other cases we use traces_all_amt.
 *
 * @param fromTimestamp
 */
export const getTimeframesTracesAMT = (
  fromTimestamp: Date | undefined,
): TracesAMTs => {
  if (!fromTimestamp) {
    return TracesAMTs.TracesAllAMT;
  }

  const now = new Date();
  const diffInDays = Math.floor(
    (now.getTime() - fromTimestamp.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffInDays <= 6) {
    return TracesAMTs.Traces7dAMT;
  } else if (diffInDays <= 29) {
    return TracesAMTs.Traces30dAMT;
  }
  return TracesAMTs.TracesAllAMT;
};

/**
 * Checks if trace exists in clickhouse.
 *
 * @param {string} projectId - Project ID for the trace
 * @param {string} traceId - ID of the trace to check
 * @param {Date} timestamp - Timestamp for time-based filtering, uses event payload or job timestamp
 * @param {FilterState} filter - Filter for the trace
 * @returns {Promise<boolean>} - True if trace exists
 *
 * Notes:
 * • Filters within ±2 day window
 * • Used for validating trace references before eval job creation
 */
export const checkTraceExists = async ({
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
}): Promise<boolean> => {
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
    operationName: "checkTraceExists",
    projectId,
    minStartTime: timestamp ?? exactTimestamp,
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
        operation_name: "checkTraceExists",
      },
      timestamp: timestamp ?? exactTimestamp,
    },
    existingExecution: async (input) => {
      const query = `
        ${observations_cte}
        SELECT
          t.id as id,
          t.project_id as project_id
        FROM traces t FINAL
        ${observationFilterRes ? `INNER JOIN observations_agg o ON t.id = o.trace_id AND t.project_id = o.project_id` : ""}
        WHERE ${tracesFilterRes.query}
        AND t.project_id = {projectId: String}
        AND timestamp >= {timestamp: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}
        ${maxTimeStamp ? `AND timestamp <= {maxTimeStamp: DateTime64(3)}` : ""}
        ${!maxTimeStamp ? `AND timestamp <= {timestamp: DateTime64(3)} + INTERVAL 2 DAY` : ""}
        ${exactTimestamp ? `AND timestamp = {exactTimestamp: DateTime64(3)}` : ""}
        GROUP BY t.id, t.project_id
      `;

      const rows = await queryClickhouse<{ id: string; project_id: string }>({
        query,
        params: input.params,
        tags: { ...input.tags, experiment_amt: "original" },
      });

      return rows.length > 0;
    },
    newExecution: async (input) => {
      const traceAmt = getTimeframesTracesAMT(input.timestamp);
      const query = `
        ${observations_cte}
        SELECT
          t.id as id,
          t.project_id as project_id,
          -- Add a timestamp alias to ensure we can filter on it
          t.start_time as timestamp
        FROM ${traceAmt} t FINAL
        ${observationFilterRes ? `INNER JOIN observations_agg o ON t.id = o.trace_id AND t.project_id = o.project_id` : ""}
        WHERE ${tracesFilterRes.query}
        AND t.project_id = {projectId: String}
      `;

      const rows = await queryClickhouse<{ id: string; project_id: string }>({
        query,
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
      });

      return rows.length > 0;
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

  // Also insert into traces_null if experiment flag is enabled
  if (env.LANGFUSE_EXPERIMENT_INSERT_INTO_AGGREGATING_MERGE_TREES === "true") {
    // Convert trace to insert format first (since we have read format)
    const traceRecord = trace as TraceRecordReadType;
    const traceInsert = {
      ...traceRecord,
      timestamp: new Date(traceRecord.timestamp).getTime(),
      created_at: new Date(traceRecord.created_at).getTime(),
      updated_at: new Date(traceRecord.updated_at).getTime(),
      event_ts: new Date(traceRecord.event_ts).getTime(),
      is_deleted: 0,
    };

    // Convert to traces_null format
    const traceNull = convertTraceToTraceNull(traceInsert);

    // Insert directly into traces_null using clickhouse client
    await clickhouseClient().insert({
      table: "traces_null",
      format: "JSONEachRow",
      values: [traceNull],
      clickhouse_settings: {
        log_comment: JSON.stringify({
          feature: "tracing",
          type: "traces_null",
          kind: "upsert",
          experiment: "insert_into_aggregating_merge_trees",
        }),
      },
    });
  }
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
    existingExecution: (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
        clickhouseConfigs: input.clickhouseConfigs,
      });
    },
    newExecution: (input) => {
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
          finalizeAggregation(public) as public,
          finalizeAggregation(bookmarked) as bookmarked,
          tags,
          finalizeAggregation(input) as input,
          finalizeAggregation(output) as output,
          session_id as session_id,
          0 as is_deleted,
          start_time as timestamp,
          created_at,
          updated_at,
          updated_at as event_ts
        FROM traces_all_amt
        WHERE id IN ({traceIds: Array(String)})
        AND project_id = {projectId: String}
        LIMIT 1 BY project_id, id
      `;

      return queryClickhouse<TraceRecordReadType>({
        query,
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
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
    minStartTime: timestamp,
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
    existingExecution: (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
      });
    },
    newExecution: (input) => {
      const traceAmt = getTimeframesTracesAMT(input.timestamp);
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
          finalizeAggregation(public) as public,
          finalizeAggregation(bookmarked) as bookmarked,
          tags,
          finalizeAggregation(input) as input,
          finalizeAggregation(output) as output,
          session_id as session_id,
          start_time as timestamp,
          created_at,
          updated_at
        FROM ${traceAmt} FINAL
        WHERE session_id IN ({sessionIds: Array(String)})
        AND project_id = {projectId: String}
      `;
      return queryClickhouse<TraceRecordReadType>({
        query,
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
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
    existingExecution: async (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
      });

      return rows.length > 0;
    },
    newExecution: async (input) => {
      const query = `
        SELECT 1
        FROM traces_all_amt
        WHERE project_id = {projectId: String}
        LIMIT 1
      `;

      const rows = await queryClickhouse<{ 1: number }>({
        query,
        params: {
          projectId: input.projectId,
        },
        tags: { ...input.tags, experiment_amt: "new" },
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
  return measureAndReturn({
    operationName: "getTraceCountsByProjectInCreationInterval",
    projectId: "__CROSS_PROJECT__",
    minStartTime: start,
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
    existingExecution: async (input) => {
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
          tags: { ...input.tags, experiment_amt: "original" },
        },
      );

      return rows.map((row) => ({
        projectId: row.project_id,
        count: Number(row.count),
      }));
    },
    newExecution: async (input) => {
      const traceAmt = getTimeframesTracesAMT(input.timestamp);
      const query = `
        SELECT
          project_id,
          count(*) as count
        FROM ${traceAmt}
        WHERE created_at >= {start: DateTime64(3)}
        AND created_at < {end: DateTime64(3)}
        GROUP BY project_id
      `;

      const rows = await queryClickhouse<{ project_id: string; count: string }>(
        {
          query,
          params: input.params,
          tags: { ...input.tags, experiment_amt: "new" },
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
    minStartTime: start,
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
    existingExecution: async (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
      });

      return Number(rows[0]?.count ?? 0);
    },
    newExecution: async (input) => {
      const traceAmt = getTimeframesTracesAMT(input.timestamp);
      const query = `
        SELECT
          count(*) as count
        FROM ${traceAmt}
        WHERE project_id IN ({projectIds: Array(String)})
        AND created_at >= {start: DateTime64(3)}
      `;

      const rows = await queryClickhouse<{ count: string }>({
        query,
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
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
}: {
  traceId: string;
  projectId: string;
  timestamp?: Date;
  fromTimestamp?: Date;
  renderingProps?: RenderingProps;
}) => {
  const records = await measureAndReturn({
    operationName: "getTraceById",
    projectId,
    minStartTime: fromTimestamp ?? timestamp,
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
        feature: "tracing",
        type: "trace",
        kind: "byId",
        projectId,
        operation_name: "getTraceById",
      },
    },
    existingExecution: (input) => {
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
          ${renderingProps.truncated ? `left(input, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT})` : "input"} as input,
          ${renderingProps.truncated ? `left(output, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT})` : "output"} as output,
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
        tags: { ...input.tags, experiment_amt: "original" },
      });
    },
    newExecution: (input) => {
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
          finalizeAggregation(public) as public,
          finalizeAggregation(bookmarked) as bookmarked,
          tags,
          ${renderingProps.truncated ? `left(finalizeAggregation(input), ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT})` : "finalizeAggregation(input)"} as input,
          ${renderingProps.truncated ? `left(finalizeAggregation(output), ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT})` : "finalizeAggregation(output)"} as output,
          session_id as session_id,
          0 as is_deleted,
          start_time as timestamp,
          created_at,
          updated_at,
          updated_at as event_ts
        FROM traces_all_amt
        WHERE id = {traceId: String}
        AND project_id = {projectId: String}
        LIMIT 1
      `;

      return queryClickhouse<TraceRecordReadType>({
        query,
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
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
    minStartTime: timestampFilter?.find(
      (f) =>
        f.column === "timestamp" && (f.operator === ">=" || f.operator === ">"),
    )?.value as Date | undefined,
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
    existingExecution: async (input) => {
      // We mainly use queries like this to retrieve filter options.
      // Therefore, we can skip final as some inaccuracy in count is acceptable.
      const query = `
        select
          name as name,
          count(*) as count
        from traces t FINAL
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
        tags: { ...input.tags, experiment_amt: "original" },
      });
    },
    newExecution: async (input) => {
      // Extract the timestamp from filter for AMT table selection
      const fromTimestamp = timestampFilter?.find(
        (f) =>
          f.column === "timestamp" &&
          (f.operator === ">=" || f.operator === ">"),
      )?.value as Date | undefined;
      const traceAmt = getTimeframesTracesAMT(fromTimestamp);
      const query = `
        select
          name as name,
          count(*) as count
        from ${traceAmt} t
        WHERE t.project_id = {projectId: String}
        AND t.name IS NOT NULL
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
        tags: { ...input.tags, experiment_amt: "new" },
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
    minStartTime: filter?.find(
      (f) =>
        f.column === "timestamp" && (f.operator === ">=" || f.operator === ">"),
    )?.value as Date | undefined,
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
    existingExecution: async (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
      });
    },
    newExecution: async (input) => {
      // Extract the timestamp from filter for AMT table selection
      const fromTimestamp = filter?.find(
        (f) =>
          f.column === "timestamp" &&
          (f.operator === ">=" || f.operator === ">"),
      )?.value as Date | undefined;
      const traceAmt = getTimeframesTracesAMT(fromTimestamp);
      const query = `
        select
          user_id as user,
          count(*) as count
        from ${traceAmt} t
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
        tags: { ...input.tags, experiment_amt: "new" },
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
    minStartTime: filter?.find(
      (f) =>
        f.column === "timestamp" && (f.operator === ">=" || f.operator === ">"),
    )?.value as Date | undefined,
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
    existingExecution: async (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
      });
    },
    newExecution: async (input) => {
      // Extract the timestamp from filter for AMT table selection
      const fromTimestamp = filter?.find(
        (f) =>
          f.column === "timestamp" &&
          (f.operator === ">=" || f.operator === ">"),
      )?.value as Date | undefined;
      const traceAmt = getTimeframesTracesAMT(fromTimestamp);
      const query = `
        select distinct(arrayJoin(tags)) as value
        from ${traceAmt} t
        WHERE t.project_id = {projectId: String}
        ${filterRes?.query ? `AND ${filterRes.query}` : ""}
        LIMIT 1000;
      `;

      return queryClickhouse<{
        value: string;
      }>({
        query,
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
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
    existingExecution: (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
      });
    },
    newExecution: (input) => {
      const query = `
        SELECT
          id,
          user_id,
          name,
          start_time as timestamp,
          project_id,
          environment
        FROM traces_all_amt
        WHERE (project_id = {projectId: String})
        AND (session_id = {sessionId: String})
        ORDER BY start_time ASC
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
        tags: { ...input.tags, experiment_amt: "new" },
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
    existingExecution: async (input) => {
      const query = `
        DELETE FROM traces
        WHERE project_id = {projectId: String}
        AND id IN ({traceIds: Array(String)});
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
    newExecution: async (input) => {
      await Promise.all([
        // Delete from traces
        await commandClickhouse({
          query: `
            DELETE FROM traces
            WHERE project_id = {projectId: String}
            AND id IN ({traceIds: Array(String)});
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_null
        commandClickhouse({
          query: `
            DELETE FROM traces_null
            WHERE project_id = {projectId: String}
            AND id IN ({traceIds: Array(String)});
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_all_amt
        commandClickhouse({
          query: `
            DELETE FROM traces_all_amt
            WHERE project_id = {projectId: String}
            AND id IN ({traceIds: Array(String)});
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_7d_amt
        commandClickhouse({
          query: `
            DELETE FROM traces_7d_amt
            WHERE project_id = {projectId: String}
            AND id IN ({traceIds: Array(String)});
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_30d_amt
        commandClickhouse({
          query: `
            DELETE FROM traces_30d_amt
            WHERE project_id = {projectId: String}
            AND id IN ({traceIds: Array(String)});
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
      ]);
    },
  });
};

export const deleteTracesOlderThanDays = async (
  projectId: string,
  beforeDate: Date,
) => {
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
    existingExecution: async (input) => {
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
    newExecution: async (input) => {
      await Promise.all([
        // Delete from traces
        await commandClickhouse({
          query: `
            DELETE FROM traces
            WHERE project_id = {projectId: String}
            AND timestamp < {cutoffDate: DateTime64(3)};
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_all_amt
        commandClickhouse({
          query: `
            DELETE FROM traces_all_amt
            WHERE project_id = {projectId: String}
            AND start_time < {cutoffDate: DateTime64(3)};
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_7d_amt
        commandClickhouse({
          query: `
            DELETE FROM traces_7d_amt
            WHERE project_id = {projectId: String}
            AND start_time < {cutoffDate: DateTime64(3)};
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_30d_amt
        commandClickhouse({
          query: `
            DELETE FROM traces_30d_amt
            WHERE project_id = {projectId: String}
            AND start_time < {cutoffDate: DateTime64(3)};
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
      ]);
    },
  });
};

export const deleteTracesByProjectId = async (projectId: string) => {
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
    existingExecution: async (input) => {
      const query = `
        DELETE FROM traces
        WHERE project_id = {projectId: String};
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
    newExecution: async (input) => {
      await Promise.all([
        // Delete from traces
        await commandClickhouse({
          query: `
            DELETE FROM traces
            WHERE project_id = {projectId: String};
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_null
        commandClickhouse({
          query: `
            DELETE FROM traces_null
            WHERE project_id = {projectId: String};
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_all_amt
        commandClickhouse({
          query: `
            DELETE FROM traces_all_amt
            WHERE project_id = {projectId: String};
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_7d_amt
        commandClickhouse({
          query: `
            DELETE FROM traces_7d_amt
            WHERE project_id = {projectId: String};
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
        // Delete from traces_30d_amt
        commandClickhouse({
          query: `
            DELETE FROM traces_30d_amt
            WHERE project_id = {projectId: String};
          `,
          params: input.params,
          clickhouseConfigs: {
            request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
          },
          tags: input.tags,
        }),
      ]);
    },
  });
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
    existingExecution: async (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
      });

      return rows.length > 0;
    },
    newExecution: async (input) => {
      const query = `
        SELECT 1
        FROM traces_all_amt
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
        tags: { ...input.tags, experiment_amt: "new" },
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
    minStartTime: filter?.find(
      (f) =>
        f.column === "timestamp" && (f.operator === ">=" || f.operator === ">"),
    )?.value as Date | undefined,
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
    existingExecution: async (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
      });
    },
    newExecution: async (input) => {
      // Extract the timestamp from filter for AMT table selection
      const fromTimestamp = filter?.find(
        (f) =>
          f.column === "timestamp" &&
          (f.operator === ">=" || f.operator === ">"),
      )?.value as Date | undefined;
      const traceAmt = getTimeframesTracesAMT(fromTimestamp);
      const query = `
        SELECT COUNT(DISTINCT t.user_id) AS totalCount
        FROM ${traceAmt} t
        WHERE ${tracesFilterRes.query}
        ${search.query}
        AND t.user_id IS NOT NULL
        AND t.user_id != ''
      `;

      return queryClickhouse({
        query,
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
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
                        from __TRACE_TABLE__
                        where
                            user_id IN ({userIds: Array(String) })
                            AND project_id = {projectId: String }
                            ${filter.length > 0 ? `AND ${chFilterRes.query}` : ""}
                    )
                    AND o.type = 'GENERATION'
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
    minStartTime: filter?.find(
      (f) =>
        f.column === "timestamp" && (f.operator === ">=" || f.operator === ">"),
    )?.value as Date | undefined,
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
    existingExecution: async (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
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
    newExecution: async (input) => {
      // Extract the timestamp from filter for AMT table selection
      const fromTimestamp = filter?.find(
        (f) =>
          f.column === "timestamp" &&
          (f.operator === ">=" || f.operator === ">"),
      )?.value as Date | undefined;
      const traceAmt = getTimeframesTracesAMT(fromTimestamp);
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
        query: query.replaceAll("__TRACE_TABLE__", traceAmt),
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
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
      public,
      bookmarked,
      tags,
      input,
      output
    FROM traces FINAL
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

export const getTracesForPostHog = async function* (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
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
      o.total_cost as total_cost,
      o.latency_milliseconds / 1000 as latency,
      o.observation_count as observation_count
    FROM traces t FINAL
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
      langfuse_cost_usd: record.total_cost,
      langfuse_count_observations: record.observation_count,
      langfuse_session_id: record.session_id,
      langfuse_project_id: projectId,
      langfuse_user_id: record.user_id || "langfuse_unknown_user",
      langfuse_latency: record.latency,
      langfuse_release: record.release,
      langfuse_version: record.version,
      langfuse_tags: record.tags,
      langfuse_environment: record.environment,
      langfuse_event_version: "1.0.0",
      $session_id: record.posthog_session_id ?? null,
      $set: {
        langfuse_user_url: record.user_id
          ? `${baseUrl}/project/${projectId}/users/${encodeURIComponent(record.user_id as string)}`
          : null,
      },
    };
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
    existingExecution: async (input) => {
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
        tags: { ...input.tags, experiment_amt: "original" },
      });

      return records.map((record) => ({
        id: record.id,
        projectId: record.project_id,
      }));
    },
    newExecution: async (input) => {
      // For this query, we need to query all AMT tables as we don't have a specific timestamp
      // We'll use the all AMT table as it contains all data
      const query = `
          SELECT DISTINCT id, project_id
          FROM traces_all_amt
          WHERE id IN ({traceIds: Array(String)})`;
      const records = await queryClickhouse<{
        id: string;
        project_id: string;
      }>({
        query,
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
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
