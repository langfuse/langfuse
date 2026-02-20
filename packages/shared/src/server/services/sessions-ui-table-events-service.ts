import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { OrderByState } from "../../interfaces/orderBy";
import { FilterState } from "../../types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import {
  CTEQueryBuilder,
  DateTimeFilter,
  FilterList,
  StringOptionsFilter,
  orderByToClickhouseSql,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  eventsSessionsAggregation,
  eventsSessionScoresAggregation,
  eventsTracesAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import { queryClickhouse } from "../repositories";
import { sessionCols } from "../tableMappings/mapSessionTable";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";

type SessionEventsBaseReturnType = {
  session_id: string;
  max_timestamp: string;
  min_timestamp: string;
  trace_ids: string[];
  user_ids: string[];
  trace_count: number;
  trace_tags: string[];
  environment?: string;
};

type SessionScoreFields = {
  scores_avg?: Array<Array<[string, number]>>;
  score_categories?: Array<Array<string>>;
};

export type SessionEventsDataReturnType = SessionEventsBaseReturnType &
  SessionScoreFields;

export type SessionTraceFromEvents = {
  id: string;
  name: string | null;
  timestamp: Date;
  environment: string | null;
  userId: string | null;
};

export const getSessionTracesFromEvents = async (props: {
  projectId: string;
  sessionId: string;
}) => {
  const tracesBuilder = eventsTracesAggregation({
    projectId: props.projectId,
  })
    .whereRaw("e.session_id = {sessionId: String}", {
      sessionId: props.sessionId,
    })
    .whereRaw("e.is_deleted = 0")
    .orderByColumns([{ column: "timestamp", direction: "ASC" }]);

  const tracesCte = tracesBuilder.buildWithParams();

  const query = `
    ${tracesCte.query}
  `;

  const rows = await measureAndReturn({
    operationName: "getSessionTracesFromEvents",
    projectId: props.projectId,
    input: {
      params: {
        ...tracesCte.params,
        projectId: props.projectId,
        sessionId: props.sessionId,
      },
      tags: {
        feature: "tracing",
        type: "sessions-traces",
        projectId: props.projectId,
        operation_name: "getSessionTracesFromEvents",
      },
    },
    fn: async (input) => {
      return queryClickhouse<{
        id: string;
        name: string | null;
        timestamp: string;
        environment: string | null;
        user_id: string | null;
      }>({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
    environment: row.environment,
    userId: row.user_id,
  }));
};

export const getSessionsTableCountFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows = await getSessionsTableFromEventsGeneric<{ count: string }>({
    select: "count",
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
    tags: { kind: "count" },
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

export const getSessionsTableFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows =
    await getSessionsTableFromEventsGeneric<SessionEventsDataReturnType>({
      select: "rows",
      projectId: props.projectId,
      filter: props.filter,
      orderBy: props.orderBy,
      limit: props.limit,
      page: props.page,
      tags: { kind: "list" },
    });

  return rows.map((row) => ({
    ...row,
    trace_count: Number(row.trace_count),
  }));
};

export type FetchSessionsTableFromEventsProps = {
  select: "count" | "rows" | "metrics";
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  tags?: Record<string, string>;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
};

const getSessionsTableFromEventsGeneric = async <T>(
  props: FetchSessionsTableFromEventsProps,
) => {
  const { select, projectId, filter, orderBy, limit, page, clickhouseConfigs } =
    props;

  const sessionFilters = new FilterList(
    createFilterFromFilterState(filter, sessionCols),
  );
  const sessionsFilterRes = sessionFilters.apply();

  const traceTimestampFilter = sessionFilters.find(
    (f) =>
      f.field === "min_timestamp" &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const sessionIdFilter = sessionFilters.find(
    (f) => f instanceof StringOptionsFilter && f.field === "session_id",
  ) as StringOptionsFilter | undefined;

  const requiresScoresJoin =
    sessionFilters.some((f) => f.clickhouseTable === "scores") ||
    sessionCols.find(
      (c) =>
        c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
    )?.clickhouseTableName === "scores";

  // Build session_data CTE
  const sessionsBuilder = eventsSessionsAggregation({
    projectId,
    sessionIds: sessionIdFilter?.values,
    startTimeFrom: traceTimestampFilter
      ? convertDateToClickhouseDateTime(traceTimestampFilter.value)
      : null,
  });

  // Compose query using CTEQueryBuilder
  let queryBuilder = new CTEQueryBuilder()
    .withCTEFromBuilder("session_data", sessionsBuilder)
    .from("session_data", "s");

  // Conditionally add scores CTE
  if (select === "metrics" || requiresScoresJoin) {
    queryBuilder = queryBuilder
      .withCTE("scores_agg", eventsSessionScoresAggregation({ projectId }))
      .leftJoin(
        "scores_agg",
        "sc",
        "ON sc.project_id = {projectId: String} AND sc.score_session_id = s.session_id",
      );
  }

  // Select fields based on query type
  switch (select) {
    case "count":
      queryBuilder.select("count(s.session_id) as count");
      break;
    case "rows":
      queryBuilder.selectColumns(
        "s.session_id",
        "s.max_timestamp",
        "s.min_timestamp",
        "s.trace_ids",
        "s.user_ids",
        "s.trace_count",
        "s.trace_tags",
        "s.environment",
      );
      break;
    case "metrics":
      queryBuilder
        .selectColumns(
          "s.session_id",
          "s.max_timestamp",
          "s.min_timestamp",
          "s.trace_ids",
          "s.user_ids",
          "s.trace_count",
          "s.trace_tags",
          "s.environment",
          "s.total_observations",
          "s.duration",
          "s.session_usage_details",
          "s.session_cost_details",
          "s.session_input_cost",
          "s.session_output_cost",
          "s.session_total_cost",
          "s.session_input_usage",
          "s.session_output_usage",
          "s.session_total_usage",
        )
        .select("sc.scores_avg", "sc.score_categories");
      break;
    default: {
      const exhaustiveCheckDefault: never = select;
      throw new Error(`Unknown select type: ${exhaustiveCheckDefault}`);
    }
  }

  // Apply filters, ordering, and pagination
  if (sessionsFilterRes.query) {
    queryBuilder.whereRaw(sessionsFilterRes.query, sessionsFilterRes.params);
  }

  const orderBySql = orderByToClickhouseSql(orderBy ?? null, sessionCols);
  if (orderBySql) {
    queryBuilder.orderBy(orderBySql);
  }

  if (limit !== undefined && page !== undefined) {
    queryBuilder.limit(limit, limit * page);
  }

  const { query, params } = queryBuilder.buildWithParams();

  return measureAndReturn({
    operationName: "getSessionsTableFromEventsGeneric",
    projectId,
    input: {
      params: {
        ...params,
        projectId,
      },
      tags: {
        ...(props.tags ?? {}),
        feature: "tracing",
        type: "sessions-table",
        projectId,
        operation_name: `getSessionsTableFromEventsGeneric-${select}`,
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
