import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { sql, type Expression, type SqlBool } from "kysely";
import { InvalidRequestError } from "../../errors";
import { OrderByState } from "../../interfaces/orderBy";
import { FilterState } from "../../types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  CTEQueryBuilder,
  DateTimeFilter,
  FilterList,
  StringOptionsFilter,
  orderByToClickhouseSql,
  type SessionEventsMetricsRow,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { EVENTS_AGGREGATION_FIELDS } from "../queries/clickhouse-sql/event-query-builder";
import {
  compileClickhouseQuery,
  type ExecutionContext,
} from "../query-ast/compile";
import { getClickhouseKysely } from "../query-ast/dialect";
import {
  eventsSessionsAggregation,
  eventsSessionScoresAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import { queryClickhouse } from "../repositories";
import {
  sessionEventsCols,
  sessionEventsOrderByCols,
} from "../tableMappings/mapSessionTable";
import { sessionsEventsViewCols } from "../../tableDefinitions/sessionsView";
import { findUiColumnMapping } from "../../tableDefinitions";
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
  score_booleans?: Array<Array<string>>;
};

export type SessionEventsDataReturnType = SessionEventsBaseReturnType &
  SessionScoreFields;

export type SessionTraceFromEvents = {
  id: string;
  name: string | null;
  timestamp: Date;
  environment: string | null;
  userId: string | null;
  observationCount: number;
  latencyMs: number | null;
};

function compileSessionTracesFromEvents(opts: {
  projectId: string;
  sessionId: string;
}) {
  const ctx: ExecutionContext = { projectId: opts.projectId };
  // Same field map as the events traces builder, so both stay in sync.
  const selects = Object.values(EVENTS_AGGREGATION_FIELDS).map((field) =>
    sql.raw(field),
  );

  const query = getClickhouseKysely()
    .selectFrom("events_full as e")
    .select(selects as never)
    .where("e.session_id", "=", opts.sessionId)
    .where(sql`e.is_deleted = 0` as unknown as Expression<SqlBool>)
    .groupBy(["trace_id", "project_id"])
    .orderBy(sql`timestamp` as unknown as Expression<Date>, "asc");

  return compileClickhouseQuery(query, ctx);
}

export const getSessionTracesFromEvents = async (props: {
  projectId: string;
  sessionId: string;
}) => {
  const { sql: query, params } = compileSessionTracesFromEvents(props);

  const rows = await queryClickhouse<{
    id: string;
    name: string | null;
    timestamp: string;
    environment: string | null;
    user_id: string | null;
    observation_count: number | string;
    latency_milliseconds: number | string | null;
  }>({
    query,
    params,
    tags: { projectId: props.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
    environment: row.environment,
    userId: row.user_id,
    observationCount: Number(row.observation_count),
    latencyMs:
      row.latency_milliseconds === null
        ? null
        : Number(row.latency_milliseconds),
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
    });

  return rows.map((row) => ({
    ...row,
    trace_count: Number(row.trace_count),
  }));
};

// Single-query equivalent of getSessionsTableFromEvents + getSessionMetricsFromEvents,
// mirroring the legacy getSessionsWithMetrics. Used by batch export so the metrics
// aggregation inherits the same filter (incl. the createdAt cutoff) and clickhouseConfigs
// (extended HTTP timeouts) as the row query, in a single round-trip.
export const getSessionsWithMetricsFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}) => {
  const rows = await getSessionsTableFromEventsGeneric<SessionEventsMetricsRow>(
    {
      select: "metrics",
      projectId: props.projectId,
      filter: props.filter,
      orderBy: props.orderBy,
      limit: props.limit,
      page: props.page,
      clickhouseConfigs: props.clickhouseConfigs,
    },
  );

  return rows.map((row) => ({
    ...row,
    trace_count: Number(row.trace_count),
    total_observations: Number(row.total_observations),
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

  const nullMetadataFilter = filter.find(
    (candidate) =>
      candidate.type === "null" &&
      findUiColumnMapping(sessionEventsCols, candidate.column)?.uiTableId ===
        "metadata",
  );
  if (nullMetadataFilter) {
    throw new InvalidRequestError(
      `Invalid filter type 'null' for column '${nullMetadataFilter.column}'. Expected filter type 'stringObject'.`,
    );
  }

  const sessionFilters = new FilterList(
    createFilterFromFilterState(
      filter,
      sessionEventsCols,
      sessionsEventsViewCols,
    ),
  );
  const sessionsFilterRes = sessionFilters.apply();

  const traceTimestampFilter = sessionFilters.find(
    (f) =>
      f.field === "min_timestamp" &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  // Only push the session_id filter into the inner aggregation CTE for
  // "any of": withSessionIds always emits `session_id IN (...)`, which would
  // contradict the outer `NOT IN (...)` for "none of" and yield empty results.
  const sessionIdFilter = sessionFilters.find(
    (f) =>
      f instanceof StringOptionsFilter &&
      f.field === "session_id" &&
      f.operator === "any of",
  ) as StringOptionsFilter | undefined;

  const requiresScoresJoin =
    sessionFilters.some((f) => f.clickhouseTable === "scores") ||
    findUiColumnMapping(sessionEventsOrderByCols, orderBy?.column)
      ?.clickhouseTableName === "scores";
  const requiresMetadata = sessionFilters.some(
    (filter) =>
      filter.clickhouseTable === "events_proto" && filter.field === "metadata",
  );
  const toolColumns = ["toolNames", "calledToolNames", "toolCalls"];
  const requiresTools =
    filter.some((item) => toolColumns.includes(item.column)) ||
    (orderBy != null && toolColumns.includes(orderBy.column));

  // Build session_data CTE
  const sessionsBuilder = eventsSessionsAggregation({
    projectId,
    sessionIds: sessionIdFilter?.values,
    startTimeFrom: traceTimestampFilter
      ? convertDateToClickhouseDateTime(traceTimestampFilter.value)
      : null,
    includeMetadata: requiresMetadata,
    includeTools: requiresTools,
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
        .select("sc.scores_avg", "sc.score_categories", "sc.score_booleans");
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

  const orderBySql = orderByToClickhouseSql(
    orderBy ?? null,
    sessionEventsOrderByCols,
  );
  if (orderBySql) {
    queryBuilder.orderBy(orderBySql);
  }

  if (limit !== undefined && page !== undefined) {
    queryBuilder.limit(limit, limit * page);
  }

  const { query, params } = queryBuilder.buildWithParams();

  const input = {
    params: {
      ...params,
      projectId,
    },
    tags: { ...(props.tags ?? {}), projectId },
  };

  return queryClickhouse<T>({
    query,
    params: input.params,
    tags: input.tags,
    clickhouseConfigs,
    preferredClickhouseService: "EventsReadOnly",
  });
};
