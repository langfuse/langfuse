import type { ObservationType } from "../../domain";
import { InvalidRequestError } from "../../errors";
import {
  AGENT_NAME_METADATA_KEY,
  SKILL_TOOL_NAMES,
} from "../../features/agents/constants";
import type {
  AgentMapSkeletonResult,
  AgentMetrics,
  AgentSkillsResult,
} from "../../features/agents/types";
import type { UiColumnMappings } from "../../tableDefinitions";
import type { FilterState } from "../../types";
import {
  bindUtcDateTimeParam,
  FilterList,
} from "../queries/clickhouse-sql/clickhouse-filter";
import {
  EventsAggQueryBuilder,
  EventsQueryBuilder,
} from "../queries/clickhouse-sql/event-query-builder";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { eventsTableNativeUiColumnDefinitions } from "../tableMappings/mapEventsTable";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";

// The identity projection is the replacement seam for dedicated agent columns.
export const AGENT_NAME_EXPR = `e.metadata_values[indexOf(e.metadata_names, '${AGENT_NAME_METADATA_KEY}')]`;
export const HAS_AGENT_EXPR = `has(e.metadata_names, '${AGENT_NAME_METADATA_KEY}')`;

type AgentQueryScope = {
  projectId: string;
  from: Date;
  to: Date;
  filter?: FilterState | null;
};

const agentColumnDefinitions: UiColumnMappings = [
  ...eventsTableNativeUiColumnDefinitions.filter((column) =>
    ["environment", "startTime"].includes(column.uiTableId ?? ""),
  ),
  {
    uiTableName: "Timestamp",
    uiTableId: "timestamp",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "e.start_time",
  },
];

function scopedQuery<T extends EventsQueryBuilder | EventsAggQueryBuilder>(
  builder: T,
  scope: AgentQueryScope,
): T {
  if (
    !Number.isFinite(scope.from.getTime()) ||
    !Number.isFinite(scope.to.getTime()) ||
    scope.from > scope.to
  ) {
    throw new InvalidRequestError("A valid agent time window is required.");
  }
  const from = bindUtcDateTimeParam("agentFrom", scope.from);
  const to = bindUtcDateTimeParam("agentTo", scope.to);
  builder
    .whereRaw(`e.start_time >= ${from.placeholder}`, { agentFrom: from.value })
    .whereRaw(`e.start_time <= ${to.placeholder}`, { agentTo: to.value })
    .whereRaw("e.is_deleted = 0")
    .where(
      new FilterList(
        createFilterFromFilterState(scope.filter ?? [], agentColumnDefinitions),
      ).apply(),
    );
  return builder;
}

function withAgent<T extends EventsQueryBuilder | EventsAggQueryBuilder>(
  builder: T,
): T {
  builder.whereRaw(HAS_AGENT_EXPR).whereRaw(`${AGENT_NAME_EXPR} != ''`);
  return builder;
}

function withSearch<T extends EventsQueryBuilder | EventsAggQueryBuilder>(
  builder: T,
  searchQuery?: string,
): T {
  if (!searchQuery) return builder;
  builder.whereRaw(
    `positionCaseInsensitiveUTF8(${AGENT_NAME_EXPR}, {agentSearch: String}) > 0`,
    { agentSearch: searchQuery },
  );
  return builder;
}

export async function getAgentsFromEventsTable(
  scope: AgentQueryScope & {
    searchQuery?: string;
    limit: number;
    offset: number;
  },
): Promise<{ agentName: string; totalTraces: bigint }[]> {
  const builder = withSearch(
    withAgent(
      scopedQuery(
        new EventsAggQueryBuilder({
          projectId: scope.projectId,
          groupByColumn: AGENT_NAME_EXPR,
          selectExpression: `${AGENT_NAME_EXPR} AS agent_name, uniq(e.trace_id) AS trace_count`,
        }),
        scope,
      ),
    ),
    scope.searchQuery,
  )
    .orderBy("ORDER BY trace_count DESC, agent_name ASC")
    .limit(scope.limit, scope.offset);
  const rows = await queryClickhouse<{
    agent_name: string;
    trace_count: string;
  }>({
    ...builder.buildWithParams(),
    tags: { projectId: scope.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
  return rows.map((row) => ({
    agentName: row.agent_name,
    totalTraces: BigInt(row.trace_count),
  }));
}

export async function getAgentsCountFromEventsTable(
  scope: AgentQueryScope & { searchQuery?: string },
): Promise<number> {
  const builder = withSearch(
    withAgent(
      scopedQuery(
        new EventsQueryBuilder({ projectId: scope.projectId }).selectRaw(
          `uniq(${AGENT_NAME_EXPR}) AS total_count`,
        ),
        scope,
      ),
    ),
    scope.searchQuery,
  );
  const rows = await queryClickhouse<{ total_count: string }>({
    ...builder.buildWithParams(),
    tags: { projectId: scope.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
  return Number(rows[0]?.total_count ?? 0);
}

export async function getAgentMetricsFromEventsTable(
  scope: AgentQueryScope & { agentNames: string[] },
): Promise<AgentMetrics[]> {
  if (!scope.agentNames.length) return [];
  const builder = withAgent(
    scopedQuery(
      new EventsAggQueryBuilder({
        projectId: scope.projectId,
        groupByColumn: AGENT_NAME_EXPR,
        selectExpression: `
          ${AGENT_NAME_EXPR} AS agent_name,
          count(DISTINCT e.span_id) AS observation_count,
          count(DISTINCT e.trace_id) AS trace_count,
          uniqExactIf(e.span_id, e.type = 'AGENT') AS run_count,
          sumMap(e.usage_details) AS sum_usage_details,
          sum(e.total_cost) AS total_cost,
          min(e.start_time) AS first_seen,
          max(e.start_time) AS last_seen`,
      }),
      scope,
    ),
  ).whereRaw(`${AGENT_NAME_EXPR} IN ({agentNames: Array(String)})`, {
    agentNames: [...new Set(scope.agentNames)],
  });
  const { query: statsQuery, params } = builder.buildWithParams();
  const rows = await queryClickhouse<{
    agent_name: string;
    observation_count: string;
    trace_count: string;
    run_count: string;
    total_cost: string;
    input_usage: string;
    output_usage: string;
    total_usage: string;
    first_seen: string;
    last_seen: string;
  }>({
    query: `WITH stats AS (${statsQuery})
      SELECT agent_name, observation_count, trace_count, run_count, total_cost,
        first_seen, last_seen,
        arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, sum_usage_details))) AS input_usage,
        arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, sum_usage_details))) AS output_usage,
        sum_usage_details['total'] AS total_usage
      FROM stats`,
    params,
    tags: { projectId: scope.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
  return rows.map((row) => ({
    agentName: row.agent_name,
    firstSeen: parseClickhouseUTCDateTimeFormat(row.first_seen),
    lastSeen: parseClickhouseUTCDateTimeFormat(row.last_seen),
    totalTraces: BigInt(row.trace_count),
    totalObservations: BigInt(row.observation_count),
    totalRuns: BigInt(row.run_count),
    totalPromptTokens: BigInt(row.input_usage),
    totalCompletionTokens: BigInt(row.output_usage),
    totalTokens: BigInt(row.total_usage),
    sumCalculatedTotalCost: Number(row.total_cost),
    averageCostPerTrace:
      Number(row.trace_count) > 0
        ? Number(row.total_cost) / Number(row.trace_count)
        : 0,
  }));
}

export async function getAgentStatsFromEventsTable(
  scope: AgentQueryScope & { agentName: string },
): Promise<AgentMetrics> {
  const rows = await getAgentMetricsFromEventsTable({
    ...scope,
    agentNames: [scope.agentName],
  });
  return (
    rows[0] ?? {
      agentName: scope.agentName,
      firstSeen: null,
      lastSeen: null,
      totalTraces: 0n,
      totalObservations: 0n,
      totalRuns: 0n,
      totalPromptTokens: 0n,
      totalCompletionTokens: 0n,
      totalTokens: 0n,
      sumCalculatedTotalCost: 0,
      averageCostPerTrace: 0,
    }
  );
}

// PLACEHOLDER(skills): replace with skillsResourceLoaded / skillsAvailable once the skill columns land.
export async function getAgentSkillsFromEventsTable(
  scope: AgentQueryScope & { agentName: string },
): Promise<AgentSkillsResult> {
  const limit = 50;
  const skillNameExpression = `coalesce(
    nullIf(e.metadata_values[indexOf(e.metadata_names, 'attributes.gen_ai.skill.name')], ''),
    nullIf(JSONExtractString(concat('"', extract(e.input, {skillInputPattern: String}), '"')), ''), e.name)`;
  const builder = withAgent(
    scopedQuery(
      new EventsAggQueryBuilder({
        projectId: scope.projectId,
        groupByColumn: "skill_name",
        selectExpression: `${skillNameExpression} AS skill_name,
          count(DISTINCT e.span_id) AS invocations, uniq(e.trace_id) AS traces,
          groupUniqArray(5)(e.trace_id) AS sample_trace_ids,
          max(e.start_time) AS last_used`,
      }),
      scope,
    ),
  )
    .whereRaw(`${AGENT_NAME_EXPR} = {agentName: String}`, {
      agentName: scope.agentName,
    })
    .whereRaw("e.type = 'TOOL'")
    .whereRaw("match(lower(e.name), {skillToolPattern: String})", {
      // Token boundaries match wrapped tool names without matching e.g. skillful_search.
      skillToolPattern: `(^|[^a-z0-9_])(${SKILL_TOOL_NAMES.join("|")})($|[^a-z0-9_])`,
      // A closing quote is required: a name cut by events_core's I/O cap stays a tool-name fallback.
      skillInputPattern:
        '"(?:skillName|skill_name|skill|name)"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"',
    })
    .orderBy("ORDER BY invocations DESC, skill_name ASC")
    .limit(limit + 1);
  const rows = await queryClickhouse<{
    skill_name: string;
    invocations: string;
    traces: string;
    sample_trace_ids: string[];
    last_used: string;
  }>({
    ...builder.buildWithParams(),
    tags: { projectId: scope.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
  return {
    skills: rows.slice(0, limit).map((row) => ({
      skillName: row.skill_name,
      invocations: Number(row.invocations),
      traces: Number(row.traces),
      sampleTraceIds: row.sample_trace_ids,
      lastUsed: parseClickhouseUTCDateTimeFormat(row.last_used),
    })),
    source: "tool-name-preview",
    limit,
    hasMore: rows.length > limit,
    inputTruncated: true,
  };
}

export async function getAgentMapSkeleton(
  scope: AgentQueryScope & { agentName: string },
): Promise<AgentMapSkeletonResult> {
  const traceLimit = 100;
  const rowLimit = 20_000;
  const traceBuilder = withAgent(
    scopedQuery(
      new EventsAggQueryBuilder({
        projectId: scope.projectId,
        groupByColumn: "e.trace_id",
        selectExpression:
          "e.trace_id AS trace_id, max(e.start_time) AS last_seen",
      }),
      scope,
    ),
  )
    .whereRaw(`${AGENT_NAME_EXPR} = {agentName: String}`, {
      agentName: scope.agentName,
    })
    .orderBy("ORDER BY last_seen DESC, trace_id ASC")
    .limit(traceLimit + 1);
  const traces = await queryClickhouse<{ trace_id: string }>({
    ...traceBuilder.buildWithParams(),
    tags: { projectId: scope.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
  const traceIds = traces.slice(0, traceLimit).map((row) => row.trace_id);
  const base = {
    traceIds,
    traceCount: traceIds.length,
    traceLimit,
    rowLimit,
    tracesTruncated: traces.length > traceLimit,
    windowBounded: true as const,
  };
  if (!traceIds.length) {
    return { ...base, rows: [], rowsTruncated: false, isTruncated: false };
  }
  const skeletonBuilder = scopedQuery(
    new EventsQueryBuilder({ projectId: scope.projectId }).selectRaw(
      "e.trace_id AS trace_id",
      "e.span_id AS span_id",
      "e.parent_span_id AS parent_span_id",
      "e.type AS type",
      `${AGENT_NAME_EXPR} AS agent_name`,
      "e.start_time AS start_time",
    ),
    scope,
  )
    .whereRaw("e.trace_id IN ({agentTraceIds: Array(String)})", {
      agentTraceIds: traceIds,
    })
    .orderBy(
      "ORDER BY e.event_ts DESC, e.start_time DESC, e.trace_id ASC, e.span_id ASC",
    )
    .limitBy("e.trace_id", "e.span_id")
    .limit(rowLimit + 1);
  const rows = await queryClickhouse<{
    trace_id: string;
    span_id: string;
    parent_span_id: string | null;
    type: ObservationType;
    agent_name: string;
    start_time: string;
  }>({
    ...skeletonBuilder.buildWithParams(),
    tags: { projectId: scope.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
  const rowsTruncated = rows.length > rowLimit;
  return {
    ...base,
    rows: rows.slice(0, rowLimit).map((row) => ({
      traceId: row.trace_id,
      spanId: row.span_id,
      parentSpanId: row.parent_span_id || null,
      type: row.type,
      agentName: row.agent_name || null,
      startTime: parseClickhouseUTCDateTimeFormat(row.start_time),
    })),
    rowsTruncated,
    isTruncated: rowsTruncated || base.tracesTruncated,
  };
}

export async function hasAnyAgentFromEventsTable(
  scope: AgentQueryScope,
): Promise<boolean> {
  const builder = withAgent(
    scopedQuery(
      new EventsQueryBuilder({ projectId: scope.projectId }).selectRaw("1"),
      scope,
    ),
  ).limit(1);
  const rows = await queryClickhouse<{ "1": number }>({
    ...builder.buildWithParams(),
    tags: { projectId: scope.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
  return rows.length > 0;
}
