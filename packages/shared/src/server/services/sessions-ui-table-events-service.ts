/* eslint-disable @typescript-eslint/no-use-before-define */
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { OrderByState } from "../../interfaces/orderBy";
import { FilterState } from "../../types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  ALL_SESSION_EVENTS_FIELDS,
  CTEQueryBuilder,
  normalizeSessionCounts,
  type SessionEventsFields,
} from "../queries/clickhouse-sql/event-query-builder";
import {
  DateTimeFilter,
  FilterList,
  StringOptionsFilter,
  filtersRequireEventsFull,
  metadataFilterCanPruneEventsFull,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { orderByToClickhouseSql } from "../queries/clickhouse-sql/orderby-factory";
import {
  type SessionEventsField,
  type SessionEventsMetricsRow,
  TRACE_AGGREGATION_FIELDS,
  traceAggregationSelects,
} from "../repositories/events-selects";

import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { compileClickhouseQuery } from "../query-ast/compile";
import { getClickhouseKysely } from "../query-ast/dialect";
import {
  eventsSessionsAggregation,
  eventsSessionScoresAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import {
  queryClickhouse,
  parseClickhouseUTCDateTimeFormat,
} from "../repositories/clickhouse";

import {
  sessionEventsCols,
  sessionEventsOrderByCols,
} from "../tableMappings/mapSessionTable";
import { sessionsEventsViewCols } from "../../tableDefinitions/sessionsView";
import { findUiColumnMapping } from "../../tableDefinitions/types";
import {
  sessionTraceFilterSchema,
  sessionTraceFilterColumns,
} from "../../features/filters/sessionTraceFilters";
import { tracesTableUiColumnDefinitions } from "../tableMappings/mapTracesTable";
import { eventsTableNativeUiColumnDefinitions } from "../tableMappings/mapEventsTable";
import { EventsQueryBuilder } from "../queries/clickhouse-sql/event-query-builder";
import {
  type AgentTraceScope,
  type AgentCountActivityResult,
} from "../../features/agents/api";
import {
  agentActivityLayout,
  buildAgentCountActivityResult,
  type AgentActivityBucketRow,
} from "../repositories/agent-activity-buckets";
import {
  AGENT_QUERY_SETTINGS,
  agentEnvironmentFilter,
  buildAgentSessionMembershipQuery,
} from "../repositories/agents";
import { bindUtcDateTimeParam } from "../queries/clickhouse-sql/clickhouse-filter";

/** Full session activity within an agent's selected time window and environment. */
export const agentSessionActivityFilter = (
  projectId: string,
  scope: AgentTraceScope,
) => {
  const membership = buildAgentSessionMembershipQuery({ projectId, ...scope });
  const from = bindUtcDateTimeParam("agentSessionFrom", scope.from);
  const to = bindUtcDateTimeParam("agentSessionTo", scope.to);
  const environment = agentEnvironmentFilter(scope, "e");
  return {
    query: `e.session_id IN (${membership.query}) AND e.start_time >= ${from.placeholder} AND e.start_time < ${to.placeholder}${environment.query.length > 0 ? ` AND (${environment.query})` : ""}`,
    params: {
      ...membership.params,
      agentSessionFrom: from.value,
      agentSessionTo: to.value,
      ...environment.params,
    },
  };
};

export type SessionTraceFromEvents = {
  id: string;
  name: string | null;
  timestamp: Date;
  environment: string | null;
  userId: string | null;
  observationCount: number;
  latencyMs: number | null;
};

export const getSessionTracesFromEvents = async (props: {
  projectId: string;
  sessionId: string;
  filter: FilterState;
  limit?: number;
  traceIds?: string[];
}) => {
  const { projectId, sessionId } = props;
  let builder = getClickhouseKysely()
    .selectFrom("events as e")
    .select(traceAggregationSelects(TRACE_AGGREGATION_FIELDS))
    .where("e.session_id", "=", sessionId)
    .groupBy(["trace_id", "project_id"])
    .orderBy("timestamp", "asc");
  if (props.traceIds)
    builder = builder.where("e.trace_id", "in", props.traceIds);
  const { sql: tracesQuery, params: tracesParams } = compileClickhouseQuery(
    builder,
    projectId,
  );
  const filters = sessionTraceFilterSchema.parse(props.filter);
  const traceFilters = new FilterList(
    createFilterFromFilterState(
      filters.filter(
        (filter) =>
          !["name", "type", "level", "metadata", "isRootObservation"].includes(
            filter.column,
          ),
      ),
      tracesTableUiColumnDefinitions,
      sessionTraceFilterColumns,
    ),
  ).apply();
  const observationFilters = filters.filter((filter) =>
    ["name", "type", "level", "metadata", "isRootObservation"].includes(
      filter.column,
    ),
  );
  const sessionTraceIdsQuery = compileClickhouseQuery(
    builder.clearSelect().select("e.trace_id").clearGroupBy().clearOrderBy(),
    projectId,
  );
  const observationQuery =
    observationFilters.length > 0
      ? new EventsQueryBuilder({ projectId: props.projectId })
          .selectRaw("e.trace_id")
          .when(
            observationFilters.some((filter) => filter.column === "metadata"),
            (builder) => builder.forceFullTable(),
          )
          .whereRaw("e.is_deleted = 0")
          .whereRaw(`e.trace_id IN (${sessionTraceIdsQuery.sql})`)
          .where(
            new FilterList(
              createFilterFromFilterState(
                observationFilters,
                eventsTableNativeUiColumnDefinitions,
                sessionTraceFilterColumns,
              ),
            ).apply(),
          )
          .buildWithParams()
      : null;
  const query =
    filters.length === 0
      ? tracesQuery
      : `
    WITH session_traces AS (${tracesQuery})
    SELECT t.* FROM session_traces t
    WHERE 1 = 1 ${traceFilters.query ? `AND ${traceFilters.query}` : ""}
      ${observationQuery ? `AND t.id IN (${observationQuery.query})` : ""}
    ORDER BY t.timestamp ASC
  `;

  const params =
    filters.length === 0
      ? tracesParams
      : {
          ...tracesParams,
          ...traceFilters.params,
          ...observationQuery?.params,
          ...sessionTraceIdsQuery.params,
          projectId,
        };

  const rows = await queryClickhouse<{
    id: string;
    name: string | null;
    timestamp: string;
    environment: string | null;
    user_id: string | null;
    observation_count: number | string;
    latency_milliseconds: number | string | null;
  }>({
    query: props.limit
      ? `${query} LIMIT ${Math.max(1, Math.floor(props.limit))}`
      : query,
    params,
    tags: { projectId },
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
  agentScope?: AgentTraceScope;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows = await getSessionsTableFromEventsGeneric<{ count: string }>({
    select: "count",
    projectId: props.projectId,
    agentScope: props.agentScope,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

export const getSessionsTableFromEvents = async <
  F extends SessionEventsField,
>(props: {
  projectId: string;
  agentScope?: AgentTraceScope;
  filter: FilterState;
  fields: SessionEventsFields<F>;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}) => {
  const rows = await getSessionsTableFromEventsGeneric<
    Pick<SessionEventsMetricsRow, F>
  >({
    select: { fields: props.fields },
    projectId: props.projectId,
    agentScope: props.agentScope,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
    clickhouseConfigs: props.clickhouseConfigs,
  });

  return rows.map(normalizeSessionCounts);
};

export type FetchSessionsTableFromEventsProps = {
  select: "count" | { fields: SessionEventsFields<SessionEventsField> };
  projectId: string;
  agentScope?: AgentTraceScope;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  tags?: Record<string, string>;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
};

const buildSessionsTableFromEventsQuery = (
  props: FetchSessionsTableFromEventsProps,
) => {
  const { select, projectId, filter, orderBy, limit, page } = props;

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
  const fullTable = filtersRequireEventsFull(sessionFilters);
  const metadataSessionPrefilter = fullTable
    ? buildMetadataSessionPrefilter(filter)
    : null;
  const toolColumns = ["toolNames", "calledToolNames", "toolCalls"];
  const requiresTools =
    filter.some((item) => toolColumns.includes(item.column)) ||
    (orderBy != null && toolColumns.includes(orderBy.column));

  const orderBySql = orderByToClickhouseSql(
    orderBy ?? null,
    sessionEventsOrderByCols,
  );

  const buildQuery = (
    cteName: "session_data" | "page_sessions",
    columns: FetchSessionsTableFromEventsProps["select"],
    pageSessions?: { query: string; params: Record<string, unknown> },
  ) => {
    // Build the session aggregation CTE
    const sessionsBuilder = eventsSessionsAggregation({
      projectId,
      fields: ALL_SESSION_EVENTS_FIELDS,
      sessionIds: sessionIdFilter?.values,
      startTimeFrom: traceTimestampFilter
        ? convertDateToClickhouseDateTime(traceTimestampFilter.value)
        : null,
      includeMetadata: requiresMetadata,
      includeTools: requiresTools,
      fullTable,
      // The page subquery has already applied the prefilter.
      metadataSessionPrefilter: pageSessions ? null : metadataSessionPrefilter,
    });
    if (props.agentScope) {
      const activity = agentSessionActivityFilter(projectId, props.agentScope);
      sessionsBuilder.whereRaw(activity.query, activity.params);
    }
    if (pageSessions) {
      sessionsBuilder.whereRaw(
        `session_id IN (${pageSessions.query})`,
        pageSessions.params,
      );
    }

    // Compose query using CTEQueryBuilder
    let queryBuilder = new CTEQueryBuilder()
      .withCTEFromBuilder(cteName, sessionsBuilder)
      .from(cteName, "s");

    // Conditionally add scores CTE
    if (requiresScoresJoin) {
      const membership = props.agentScope
        ? buildAgentSessionMembershipQuery({ projectId, ...props.agentScope })
        : undefined;
      queryBuilder = queryBuilder
        .withCTE(
          "scores_agg",
          eventsSessionScoresAggregation({
            projectId,
            scoreRowsFilter: membership
              ? {
                  query: `s.session_id IN (${membership.query})`,
                  params: membership.params,
                }
              : undefined,
          }),
        )
        .leftJoin(
          "scores_agg",
          "sc",
          "ON sc.project_id = {projectId: String} AND sc.score_session_id = s.session_id",
        );
    }

    if (columns === "count") {
      queryBuilder.select("count(s.session_id) as count");
    } else {
      queryBuilder.selectColumns(
        ...columns.fields.map((field) => `s.${field}` as const),
      );
    }

    // Apply filters, ordering, and pagination
    if (sessionsFilterRes.query) {
      queryBuilder.whereRaw(sessionsFilterRes.query, sessionsFilterRes.params);
    }

    if (orderBySql) {
      queryBuilder.orderBy(orderBySql);
    }

    // The page subquery has already applied the pagination.
    if (!pageSessions && limit !== undefined && page !== undefined) {
      queryBuilder.limit(limit, limit * page);
    }

    return queryBuilder.buildWithParams();
  };

  // A page of rows is read in two steps within one query. The subquery ranks
  // the sessions selecting only session_id, so ClickHouse computes just the
  // aggregates that filters and ordering read for every session in the
  // window. The outer query then computes the requested fields for the
  // page's sessions only, over the same events, so the values are unchanged.
  // Score filters and ordering keep the single query: both steps would have
  // to join the session scores aggregation, which reads the whole project.
  const { query, params } =
    select !== "count" &&
    !requiresScoresJoin &&
    limit !== undefined &&
    page !== undefined
      ? buildQuery(
          "session_data",
          select,
          buildQuery("page_sessions", { fields: ["session_id"] }),
        )
      : buildQuery("session_data", select);

  return { query, params: { ...params, projectId } };
};

const getSessionsTableFromEventsGeneric = async <T>(
  props: FetchSessionsTableFromEventsProps,
) => {
  const { query, params } = buildSessionsTableFromEventsQuery(props);
  return queryClickhouse<T>({
    query,
    params,
    tags: { ...(props.tags ?? {}), projectId: props.projectId },
    clickhouseConfigs: props.clickhouseConfigs,
    clickhouseSettings: props.agentScope ? AGENT_QUERY_SETTINGS : undefined,
    preferredClickhouseService: "EventsReadOnly",
  });
};

export async function getAgentSessionsActivity(input: {
  projectId: string;
  agentScope: AgentTraceScope;
  filter: FilterState;
  bucketCount?: number;
}): Promise<AgentCountActivityResult> {
  const window = {
    from: input.agentScope.from,
    to: input.agentScope.to,
    bucketCount: input.bucketCount,
  };
  const { bucketMs } = agentActivityLayout(window);
  const cohort = buildSessionsTableFromEventsQuery({
    projectId: input.projectId,
    agentScope: input.agentScope,
    filter: input.filter,
    select: { fields: ["session_id"] },
    orderBy: null,
  });
  const activity = new EventsQueryBuilder({ projectId: input.projectId })
    .selectRaw("e.start_time AS start_time", "e.session_id AS session_id")
    .where(agentSessionActivityFilter(input.projectId, input.agentScope))
    .whereRaw(`e.session_id IN (${cohort.query})`, cohort.params)
    .buildWithParams();
  const rows = await queryClickhouse<AgentActivityBucketRow>({
    query: `SELECT intDiv(toUnixTimestamp64Milli(start_time) - {activityFromMs: Int64}, {activityBucketMs: Int64}) AS bucket_index,
      uniqExact(session_id) AS count FROM (${activity.query}) GROUP BY bucket_index`,
    params: {
      ...activity.params,
      activityFromMs: window.from.getTime(),
      activityBucketMs: bucketMs,
    },
    tags: { projectId: input.projectId },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseSettings: AGENT_QUERY_SETTINGS,
  });
  return buildAgentCountActivityResult(window, rows);
}

// Keeps only metadata filters an events_full skip index can prune on, so the
// prefilter subquery stays bounded. Any subset of the conjuncts is still a
// necessary condition for the outer filter. Returns null when none qualify.
const buildMetadataSessionPrefilter = (filter: FilterState) => {
  const prunableMetadataFilters = filter.filter(
    (item) =>
      item.type === "stringObject" &&
      findUiColumnMapping(sessionEventsCols, item.column)?.uiTableId ===
        "metadata" &&
      metadataFilterCanPruneEventsFull(item.operator, item.value),
  );
  if (prunableMetadataFilters.length === 0) {
    return null;
  }
  return new FilterList(
    createFilterFromFilterState(
      prunableMetadataFilters,
      sessionEventsCols.map((column) =>
        column.uiTableId === "metadata"
          ? { ...column, queryPrefix: "m" }
          : column,
      ),
      sessionsEventsViewCols,
    ),
  ).apply();
};
