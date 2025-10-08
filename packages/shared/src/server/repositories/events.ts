import { prisma } from "../../db";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import {
  DateTimeFilter,
  FilterList,
  FullObservations,
  orderByToClickhouseSql,
  StringFilter,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { eventsTracesAggregation } from "../queries/clickhouse-sql/query-fragments";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import { observationsTableTraceUiColumnDefinitions } from "../tableMappings";
import {
  eventsTableLegacyTraceUiColumnDefinitions,
  eventsTableUiColumnDefinitions,
} from "../tableMappings/mapEventsTable";
import { queryClickhouse } from "./clickhouse";
import {
  ObservationsTableQueryResult,
  ObservationTableQuery,
} from "./observations";
import { convertObservation } from "./observations_converters";

export const getObservationsCountFromEventsTable = async (
  opts: ObservationTableQuery,
) => {
  const count = await getObservationsFromEventsTableInternal<{
    count: string;
  }>({
    ...opts,
    select: "count",
    tags: { kind: "count" },
  });

  return Number(count[0].count);
};

export const getObservationsWithModelDataFromEventsTable = async (
  opts: ObservationTableQuery,
): Promise<FullObservations> => {
  const observationRecords = await getObservationsFromEventsTableInternal<
    Omit<
      ObservationsTableQueryResult,
      "trace_tags" | "trace_name" | "trace_user_id"
    >
  >({
    ...opts,
    select: "rows",
    tags: { kind: "list" },
  });

  const uniqueModels: string[] = Array.from(
    new Set(
      observationRecords
        .map((r) => r.internal_model_id)
        .filter((r): r is string => Boolean(r)),
    ),
  );

  const models =
    uniqueModels.length > 0
      ? await prisma.model.findMany({
          where: {
            id: {
              in: uniqueModels,
            },
            OR: [{ projectId: opts.projectId }, { projectId: null }],
          },
          include: {
            Price: true,
          },
        })
      : [];

  return observationRecords.map((o) => {
    const model = models.find((m) => m.id === o.internal_model_id);
    return {
      ...convertObservation(o),
      latency: o.latency ? Number(o.latency) / 1000 : null,
      timeToFirstToken: o.time_to_first_token
        ? Number(o.time_to_first_token) / 1000
        : null,
      traceName: o.name ?? null,
      traceTags: [], // TODO pull from PG
      traceTimestamp: null,
      modelId: model?.id ?? null,
      inputPrice:
        model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
      outputPrice:
        model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
      totalPrice:
        model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
    };
  });
};

const getObservationsFromEventsTableInternal = async <T>(
  opts: ObservationTableQuery & {
    select: "count" | "rows";
    tags: Record<string, string>;
  },
): Promise<Array<T>> => {
  const select =
    opts.select === "count"
      ? "count(*) as count"
      : `
        e.span_id as id,
        e.type as type,
        e.project_id as "project_id",
        e.name as name,
        e."model_parameters" as model_parameters,
        e.start_time as "start_time",
        e.end_time as "end_time",
        e.trace_id as "trace_id",
        e.completion_start_time as "completion_start_time",
        e.provided_usage_details as "provided_usage_details",
        e.usage_details as "usage_details",
        e.provided_cost_details as "provided_cost_details",
        e.cost_details as "cost_details",
        e.level as level,
        e.environment as "environment",
        e.status_message as "status_message",
        e.version as version,
        e.parent_span_id as "parent_observation_id",
        e.created_at as "created_at",
        e.updated_at as "updated_at",
        e.provided_model_name as "provided_model_name",
        e.total_cost as "total_cost",
        e.prompt_id as "prompt_id",
        e.prompt_name as "prompt_name",
        e.prompt_version as "prompt_version",
        e.model_id as "internal_model_id",
        if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time)) as latency,
        if(isNull(completion_start_time), NULL,  date_diff('millisecond', start_time, completion_start_time)) as "time_to_first_token"`;

  const {
    projectId,
    filter,
    selectIOAndMetadata,
    limit,
    offset,
    orderBy,
    clickhouseConfigs,
  } = opts;

  const selectString = selectIOAndMetadata
    ? `${select}, e.input, e.output, e.metadata`
    : select;

  const timeFilter = filter.find(
    (f) =>
      (f.column === "Start Time" || f.column === "startTime") &&
      (f.operator === ">=" || f.operator === ">"),
  );

  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const hasScoresFilter = filter.some((f) =>
    f.column.toLowerCase().includes("scores"),
  );

  const orderByTraces = orderBy
    ? eventsTableLegacyTraceUiColumnDefinitions.some(
        (c) =>
          c.uiTableId === orderBy.column || c.uiTableName === orderBy.column,
      )
    : undefined;

  timeFilter
    ? scoresFilter.push(
        new DateTimeFilter({
          clickhouseTable: "scores",
          field: "timestamp",
          operator: ">=",
          value: timeFilter.value as Date,
        }),
      )
    : undefined;

  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "events",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "e",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedScoresFilter = scoresFilter.apply();
  const appliedObservationsFilter = observationsFilter.apply();

  const search = clickhouseSearchCondition(
    opts.searchQuery,
    opts.searchType,
    "e",
  );

  const scoresCte = `WITH scores_agg AS (
    SELECT
      trace_id,
      observation_id,
      -- For numeric scores, use tuples of (name, avg_value)
      groupArrayIf(
        tuple(name, avg_value),
        data_type IN ('NUMERIC', 'BOOLEAN')
      ) AS scores_avg,
      -- For categorical scores, use name:value format for improved query performance
      groupArrayIf(
        concat(name, ':', string_value),
        data_type = 'CATEGORICAL' AND notEmpty(string_value)
      ) AS score_categories
    FROM (
      SELECT
        trace_id,
        observation_id,
        name,
        avg(value) avg_value,
        string_value,
        data_type,
        comment
      FROM
        scores FINAL
      WHERE ${appliedScoresFilter.query}
      GROUP BY
        trace_id,
        observation_id,
        name,
        string_value,
        data_type,
        comment
      ORDER BY
        trace_id
      ) tmp
    GROUP BY
      trace_id,
      observation_id
  )`;

  // Query optimisation: joining traces onto observations is expensive.
  // Hence, only join if the UI table contains filters on traces.
  // Joins with traces are very expensive. We need to filter by time as well.
  // We assume that a trace has to have been within the last 2 days to be relevant.
  const traceTableFilter = filter.filter((f) =>
    eventsTableLegacyTraceUiColumnDefinitions.some(
      (c) => c.uiTableId === f.column || c.uiTableName === f.column,
    ),
  );

  const startTimeFrom = timeFilter
    ? convertDateToClickhouseDateTime(timeFilter.value as Date)
    : null;

  const tracesCte = `traces AS (${eventsTracesAggregation({
    projectId,
    startTimeFrom,
  })})`;

  // When we have default ordering by time, we order by toUnixTimestamp(o.start_time)
  // This way, clickhouse is able to read more efficiently directly from disk without ordering
  const newDefaultOrder =
    orderBy?.column === "startTime"
      ? [{ column: "order_by_unix", order: orderBy.order }]
      : [orderBy ?? null];

  const chOrderBy = orderByToClickhouseSql(newDefaultOrder, [
    ...eventsTableUiColumnDefinitions,
    {
      uiTableName: "order_by_unix",
      uiTableId: "order_by_unix",
      clickhouseTableName: "events",
      clickhouseSelect: "toUnixTimestamp(e.start_time)",
    },
  ]);

  const query = `
      ${scoresCte},
      ${tracesCte}
      SELECT
       ${selectString}
      FROM events e
        ${
          traceTableFilter.length > 0 || orderByTraces || search.query
            ? "LEFT JOIN traces t ON t.id = e.trace_id AND t.project_id = e.project_id"
            : ""
        }
        ${hasScoresFilter ? `LEFT JOIN scores_agg AS s ON s.trace_id = e.trace_id and s.observation_id = e.span_id` : ""}
      WHERE ${appliedObservationsFilter.query}
        ${search.query}
      ${chOrderBy}
      ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : "LIMIT 1000"};`;

  return measureAndReturn({
    operationName: "getObservationsFromEventsTableInternal",
    projectId,
    input: {
      params: {
        projectId,
        startTimeFrom,
        ...appliedScoresFilter.params,
        ...appliedObservationsFilter.params,
        ...search.params,
      },
      tags: {
        ...(opts.tags ?? {}),
        feature: "tracing",
        type: "events",
        projectId,
        kind: opts.select,
        operation_name: "getObservationsTableInternal",
      },
    },
    fn: async (input) => {
      return queryClickhouse<T>({
        query,
        params: input.params,
        tags: input.tags,
        clickhouseConfigs,
      });
    },
  });
};
