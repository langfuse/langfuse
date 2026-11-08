import { InvalidRequestError } from "../../errors/InvalidRequestError";
import {
  AGENT_LIMITS,
  AgentEnvironmentFilterListSchema,
  AgentListFilterListSchema,
  type AgentDetailInput,
  type AgentActivityInput,
  type AgentActivityResult,
  type AgentCountActivityResult,
  type AgentListActivityInput,
  type AgentOverviewStats,
  type AgentOverviewBucket,
  type AgentOverviewPeriod,
  type AgentOverviewResult,
  type AgentIdentity,
  type AgentInfo,
  type AgentListInput,
  type AgentListFilter,
  type AgentModelStats,
  type AgentPage,
  type AgentPageInput,
  type AgentRunRow,
  type AgentScope,
  type AgentSkillRow,
  type AgentSummary,
  type AgentTraceRow,
  type AgentTraceScope,
} from "../../features/agents/api";
import {
  bindUtcDateTimeParam,
  FilterList,
  NumberFilter,
  StringFilter,
  StringOptionsFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { EventsQueryBuilder } from "../queries/clickhouse-sql/event-query-builder";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import {
  agentActivityLayout,
  buildAgentCountActivityResult,
  type AgentActivityBucketRow,
} from "./agent-activity-buckets";
import { buildAgentCacheEventsQuery } from "./agent-cache-usage";

type Row = Record<string, unknown>;
type Query = { query: string; params: Record<string, unknown> };
const RUN = "type = 'AGENT' AND agent_run_id = span_id AND agent_run_id != ''";
const IDENTITY_KIND = "if(agent_id != '', 'id', 'name')";
const IDENTITY_VALUE = "if(agent_id != '', agent_id, agent_name)";
// JS trim() whitespace includes Unicode separators and BOM in addition to ASCII spaces.
const validText = (field: string, limit: number) =>
  `lengthUTF8(${field}) <= ${limit} AND match(${field}, '[^[:space:]\\\\p{Z}\\\\x{FEFF}]')`;
const VALID_NAME = validText("agent_name", AGENT_LIMITS.nameLength);
const VALID_IDENTITY = `((agent_id != '' AND ${validText("agent_id", AGENT_LIMITS.idLength)}) OR (agent_id = '' AND ${VALID_NAME}))`;

function boundedEvents(scope: AgentScope): EventsQueryBuilder {
  validateScope(scope);
  const from = bindUtcDateTimeParam("agentsFrom", scope.from);
  const to = bindUtcDateTimeParam("agentsTo", scope.to);
  return new EventsQueryBuilder({ projectId: scope.projectId })
    .whereRaw(`e.start_time >= ${from.placeholder}`, { agentsFrom: from.value })
    .whereRaw(`e.start_time < ${to.placeholder}`, { agentsTo: to.value });
}

function validateScope(scope: AgentScope) {
  const from = scope.from.getTime();
  const to = scope.to.getTime();
  if (
    !scope.projectId ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to ||
    to - from > AGENT_LIMITS.maxWindowDays * 86_400_000 ||
    (scope.environment !== null &&
      (typeof scope.environment !== "string" ||
        !scope.environment.trim() ||
        Array.from(scope.environment).length > 256)) ||
    !AgentEnvironmentFilterListSchema.safeParse(scope.environmentFilter ?? [])
      .success
  )
    throw new InvalidRequestError(
      "Select a project and a nonempty period of at most 30 days.",
    );
}

const SUMMARY_FILTER_FIELDS = {
  environment: "environment",
  displayName: "display_name",
  id: "if(identity_kind = 'id', identity_value, '')",
  runs: "runs",
  traces: "traces",
  modelCalls: "model_calls",
  totalTokens: "total_tokens",
  cost: "cost",
  errorRuns: "error_runs",
  averageRunDurationMs: "average_run_duration_ms",
} as const;

function compileAgentFilters(
  filters: AgentListFilter[],
  tablePrefix?: string,
): Query {
  return new FilterList(
    filters.map((filter) => {
      const common = {
        clickhouseTable: "events_core",
        field: SUMMARY_FILTER_FIELDS[filter.column],
        tablePrefix,
      };
      if (filter.type === "number")
        return new NumberFilter({
          ...common,
          operator: filter.operator,
          value: filter.value,
          clickhouseTypeOverwrite: "Float64",
        });
      if (filter.type === "stringOptions")
        return new StringOptionsFilter({
          ...common,
          operator: filter.operator,
          values: filter.value,
        });
      return new StringFilter({
        ...common,
        operator: filter.operator,
        value: filter.value,
      });
    }),
  ).apply();
}

/** Environment conditions share native filter semantics and intersect legacy single-value links. */
export function agentEnvironmentFilter(
  scope: Pick<AgentScope, "environment" | "environmentFilter">,
  tablePrefix?: string,
): Query {
  const filters = AgentEnvironmentFilterListSchema.parse(
    scope.environmentFilter ?? [],
  );
  const compiled = compileAgentFilters(filters, tablePrefix);
  if (scope.environment === null) return compiled;
  const field = tablePrefix ? `${tablePrefix}.environment` : "environment";
  return {
    query: [compiled.query, `${field} = {agentEnvironment: String}`]
      .filter((condition) => condition.length > 0)
      .map((condition) => `(${condition})`)
      .join(" AND "),
    params: { ...compiled.params, agentEnvironment: scope.environment },
  };
}

function validateIdentity(identity: AgentIdentity) {
  if (
    !["id", "name"].includes(identity.kind) ||
    typeof identity.value !== "string" ||
    !identity.value.trim() ||
    Array.from(identity.value).length >
      (identity.kind === "id" ? AGENT_LIMITS.idLength : AGENT_LIMITS.nameLength)
  )
    throw new InvalidRequestError("A valid agent identity is required.");
}

function validatePage(page: AgentPageInput) {
  if (
    !Number.isInteger(page.page) ||
    page.page < 0 ||
    page.page > AGENT_LIMITS.maxPage ||
    !Number.isInteger(page.pageSize) ||
    page.pageSize < 1 ||
    page.pageSize > AGENT_LIMITS.pageSize
  )
    throw new InvalidRequestError("Select a valid page of at most 100 rows.");
}

/** Deduplicate immutable event identities before applying mutable ownership or environment. */
function scopedEvents(
  scope: AgentScope,
  identity?: AgentIdentity | AgentIdentity[],
  columns: readonly string[] = [
    "e.usage_details AS usage_details",
    "e.cost_details AS cost_details",
  ],
  full = false,
): Query {
  validateScope(scope);
  if (Array.isArray(identity)) identity.forEach(validateIdentity);
  else if (identity) validateIdentity(identity);
  const candidates = boundedEvents(scope)
    .selectRaw("e.trace_id", "e.span_id")
    .whereRaw("(e.agent_id != '' OR e.agent_name != '')");
  if (Array.isArray(identity))
    candidates.whereRaw(
      "concat(if(e.agent_id != '', 'id', 'name'), ':', if(e.agent_id != '', e.agent_id, e.agent_name)) IN {candidateAgentIdentities: Array(String)}",
      {
        candidateAgentIdentities: identity.map(
          (item) => `${item.kind}:${item.value}`,
        ),
      },
    );
  else if (identity)
    candidates.whereRaw(
      "if(e.agent_id != '', 'id', 'name') = {candidateAgentKind: String} AND if(e.agent_id != '', e.agent_id, e.agent_name) = {candidateAgentValue: String}",
      {
        candidateAgentKind: identity.kind,
        candidateAgentValue: identity.value,
      },
    );
  const candidateQuery = candidates.buildWithParams();
  const builder = boundedEvents(scope)
    .selectRaw(
      "e.trace_id AS trace_id",
      "e.span_id AS span_id",
      "e.session_id AS session_id",
      "e.agent_id AS agent_id",
      "e.agent_name AS agent_name",
      "e.agent_run_id AS agent_run_id",
      "e.agent_identity_source AS agent_identity_source",
      "e.environment AS environment",
      "e.type AS type",
      "e.name AS name",
      "e.trace_name AS trace_name",
      "e.level AS level",
      "e.start_time AS start_time",
      "e.end_time AS end_time",
      "e.event_ts AS event_ts",
      "e.is_deleted AS is_deleted",
      ...columns,
    )
    .whereRaw(
      `(e.trace_id, e.span_id) IN (${candidateQuery.query})`,
      candidateQuery.params,
    )
    .orderBy("ORDER BY e.event_ts DESC, e.trace_id ASC, e.span_id ASC")
    .limitBy("e.trace_id", "e.span_id");
  if (full)
    builder
      .selectRaw(
        "leftUTF8(coalesce(nullIf(e.metadata_values[indexOf(e.metadata_names, 'attributes.langfuse.agent.description')], ''), e.metadata_values[indexOf(e.metadata_names, 'attributes.gen_ai.agent.description')]), 4000) AS agent_description",
        "lengthUTF8(coalesce(nullIf(e.metadata_values[indexOf(e.metadata_names, 'attributes.langfuse.agent.description')], ''), e.metadata_values[indexOf(e.metadata_names, 'attributes.gen_ai.agent.description')])) > 4000 AS description_truncated",
        "leftUTF8(coalesce(nullIf(e.metadata_values[indexOf(e.metadata_names, 'attributes.langfuse.agent.version')], ''), e.metadata_values[indexOf(e.metadata_names, 'attributes.gen_ai.agent.version')]), 256) AS agent_version",
        "e.scope_name AS scope_name",
        "e.scope_version AS scope_version",
        "e.service_name AS service_name",
        "e.service_version AS service_version",
        "e.provided_model_name AS provided_model_name",
        "leftUTF8(e.model_parameters, 4000) AS model_parameters",
        "lengthUTF8(e.model_parameters) > 4000 AS model_parameters_truncated",
        "e.prompt_id AS prompt_id",
        "e.prompt_name AS prompt_name",
        "e.prompt_version AS prompt_version",
      )
      .forceFullTable();
  const snapshot = builder.buildWithParams();
  const conditions = ["is_deleted = 0", VALID_IDENTITY];
  const params: Record<string, unknown> = { ...snapshot.params };
  const environment = agentEnvironmentFilter(scope);
  if (environment.query.length > 0) conditions.push(`(${environment.query})`);
  Object.assign(params, environment.params);
  if (Array.isArray(identity)) {
    conditions.push(
      `concat(${IDENTITY_KIND}, ':', ${IDENTITY_VALUE}) IN {agentIdentities: Array(String)}`,
    );
    params.agentIdentities = identity.map(
      (item) => `${item.kind}:${item.value}`,
    );
  } else if (identity) {
    conditions.push(
      `${IDENTITY_KIND} = {agentKind: String} AND ${IDENTITY_VALUE} = {agentValue: String}`,
    );
    params.agentKind = identity.kind;
    params.agentValue = identity.value;
  }
  return {
    query: `SELECT * FROM (${snapshot.query}) latest WHERE ${conditions.join(" AND ")}`,
    params,
  };
}

export {
  scopedEvents as buildAgentScopedEvents,
  boundedEvents as buildAgentBoundedEvents,
  validateScope as validateAgentScope,
  validateIdentity as validateAgentIdentity,
};

/** SQL-only membership preserves current ownership without materializing a trace list in application memory. */
export function buildAgentTraceMembershipQuery(
  input: AgentDetailInput & Pick<AgentTraceScope, "mode">,
): Query {
  const base = buildAgentObservationMembershipQuery(input);
  return {
    ...base,
    query: `SELECT DISTINCT trace_id FROM (${base.query})`,
  };
}

export function buildAgentObservationMembershipQuery(
  input: AgentDetailInput & Pick<AgentTraceScope, "mode">,
): Query {
  const base = scopedEvents(input, input.identity, []);
  let kind = "";
  if (input.mode === "tools") kind = " WHERE type = 'TOOL'";
  if (input.mode === "runs") kind = ` WHERE ${RUN}`;
  return {
    ...base,
    query: `SELECT trace_id, span_id, event_ts FROM (${base.query})${kind}`,
  };
}

export function buildAgentSessionMembershipQuery(
  input: AgentDetailInput & Pick<AgentTraceScope, "mode">,
): Query {
  if (input.mode && input.mode !== "traces")
    throw new InvalidRequestError("Session membership requires trace scope.");
  const traces = buildAgentTraceMembershipQuery(input);
  const latest = boundedEvents(input)
    .selectRaw(
      "e.session_id AS session_id",
      "e.environment AS environment",
      "e.is_deleted AS is_deleted",
    )
    .whereRaw(`e.trace_id IN (${traces.query})`, traces.params)
    .orderBy("ORDER BY e.event_ts DESC, e.trace_id ASC, e.span_id ASC")
    .limitBy("e.trace_id", "e.span_id")
    .buildWithParams();
  const environment = agentEnvironmentFilter(input);
  return {
    query: `SELECT DISTINCT session_id FROM (${latest.query}) WHERE is_deleted = 0 AND session_id != ''${environment.query.length > 0 ? ` AND (${environment.query})` : ""}`,
    params: {
      ...latest.params,
      ...environment.params,
    },
  };
}

export function agentTraceScopeFilter(
  projectId: string,
  agentScope: AgentTraceScope,
  traceField = "e.trace_id",
): Query {
  if (agentScope.mode === "tools" || agentScope.mode === "runs") {
    const base = buildAgentObservationMembershipQuery({
      projectId,
      ...agentScope,
    });
    return {
      ...base,
      query: `(e.trace_id, e.span_id, e.event_ts) IN (${base.query})`,
    };
  }
  const membership = buildAgentTraceMembershipQuery({
    ...agentScope,
    projectId,
  });
  return { ...membership, query: `${traceField} IN (${membership.query})` };
}

/** Trace scores remain visible; fixed observation views only expose scores on their eligible spans. */
export function agentScoreScopeFilter(
  projectId: string,
  agentScope: AgentTraceScope,
  prefix: "" | "s." = "",
): Query {
  const input = { ...agentScope, projectId };
  const traces = buildAgentTraceMembershipQuery(input);
  const exact =
    agentScope.mode && agentScope.mode !== "traces"
      ? buildAgentObservationMembershipQuery(input)
      : undefined;
  return {
    query: `${prefix}trace_id IN (${traces.query})${exact ? ` AND (${prefix}observation_id IS NULL OR (${prefix}trace_id, ${prefix}observation_id) IN (SELECT trace_id, span_id FROM (${exact.query})))` : ""}`,
    params: { ...traces.params, ...exact?.params },
  };
}

export const AGENT_QUERY_SETTINGS = {
  max_execution_time: 10,
  max_memory_usage: "268435456",
  max_bytes_to_read: "536870912",
  max_result_bytes: "4194304",
  max_threads: 2,
} as const;

async function execute<T extends Row = Row>(query: Query): Promise<T[]> {
  return queryClickhouse<T>({
    ...query,
    params: query.params as Record<string, string | number | string[]>,
    tags: { projectId: String(query.params.projectId) },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseSettings: AGENT_QUERY_SETTINGS,
  });
}

const MODEL_METRICS = `
  countIf(type = 'GENERATION') AS model_calls,
  countIf(type = 'GENERATION' AND (mapContains(usage_details, 'total') OR
    (mapContains(usage_details, 'input') AND mapContains(usage_details, 'output')))) AS usage_known_calls,
  countIf(type = 'GENERATION' AND mapContains(cost_details, 'total')) AS priced_model_calls,
  countIf(type = 'GENERATION' AND agent_run_id = '') AS unattributed_model_calls,
  if(countIf(type = 'GENERATION' AND mapContains(usage_details, 'input')) > 0,
    sumIf(usage_details['input'], type = 'GENERATION' AND mapContains(usage_details, 'input')), NULL) AS input_tokens,
  if(countIf(type = 'GENERATION' AND mapContains(usage_details, 'output')) > 0,
    sumIf(usage_details['output'], type = 'GENERATION' AND mapContains(usage_details, 'output')), NULL) AS output_tokens,
  if(usage_known_calls > 0, sumIf(if(mapContains(usage_details, 'total'), usage_details['total'],
    usage_details['input'] + usage_details['output']), type = 'GENERATION' AND
    (mapContains(usage_details, 'total') OR (mapContains(usage_details, 'input') AND mapContains(usage_details, 'output')))), NULL) AS total_tokens,
  if(priced_model_calls > 0, sumIf(cost_details['total'], type = 'GENERATION' AND mapContains(cost_details, 'total')), NULL) AS cost`;

const n = (value: unknown): number => Number(value ?? 0);
const nullableNumber = (value: unknown): number | null =>
  value == null ? null : Number(value);
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";
const date = (value: unknown): Date =>
  parseClickhouseUTCDateTimeFormat(str(value));
const optionalDate = (value: unknown): Date | null =>
  value == null ? null : date(value);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(str) : [];
function runStatus(value: unknown): AgentRunRow["status"] {
  if (value === "error" || value === "open") return value;
  return "ended";
}
const modelStats = (row: Row): AgentModelStats => ({
  modelCalls: n(row.model_calls),
  inputTokens: nullableNumber(row.input_tokens),
  outputTokens: nullableNumber(row.output_tokens),
  totalTokens: nullableNumber(row.total_tokens),
  cost: nullableNumber(row.cost),
  usageKnownCalls: n(row.usage_known_calls),
  pricedModelCalls: n(row.priced_model_calls),
  unattributedModelCalls: n(row.unattributed_model_calls),
  traceUnassignedModelCalls: 0,
});

/** Candidate keys include earlier revisions; eligibility is checked only after their latest snapshot. */
function unidentifiedModels(scope: AgentScope, traces: Query): Query {
  const candidates = boundedEvents(scope)
    .selectRaw("e.trace_id", "e.span_id")
    .whereRaw("e.type = 'GENERATION' AND e.agent_id = '' AND e.agent_name = ''")
    .whereRaw(`e.trace_id IN (${traces.query})`, traces.params)
    .buildWithParams();
  const latest = boundedEvents(scope)
    .selectRaw(
      "e.trace_id AS trace_id",
      "e.span_id AS span_id",
      "e.type AS type",
      "e.agent_id AS agent_id",
      "e.agent_name AS agent_name",
      "e.environment AS environment",
      "e.is_deleted AS is_deleted",
    )
    .whereRaw(
      `(e.trace_id, e.span_id) IN (${candidates.query})`,
      candidates.params,
    )
    .orderBy("ORDER BY e.event_ts DESC, e.trace_id ASC, e.span_id ASC")
    .limitBy("e.trace_id", "e.span_id")
    .buildWithParams();
  const environment = agentEnvironmentFilter(scope);
  return {
    query: `SELECT trace_id, span_id FROM (${latest.query}) latest_unassigned WHERE is_deleted = 0 AND type = 'GENERATION' AND agent_id = '' AND agent_name = ''${environment.query.length > 0 ? ` AND (${environment.query})` : ""}`,
    params: {
      ...latest.params,
      ...environment.params,
    },
  };
}

async function addSummaryCoverage(items: AgentSummary[], scope: AgentScope) {
  if (items.length === 0) return;
  const base = scopedEvents(
    scope,
    items.length === 1 ? items[0]!.identity : undefined,
    [],
  );
  const traces: Query = {
    query: `SELECT DISTINCT ${IDENTITY_KIND} AS identity_kind, ${IDENTITY_VALUE} AS identity_value, trace_id FROM (${base.query}) WHERE concat(${IDENTITY_KIND}, ':', ${IDENTITY_VALUE}) IN {coverageIdentities: Array(String)}`,
    params: {
      ...base.params,
      coverageIdentities: items.map(
        (item) => `${item.identity.kind}:${item.identity.value}`,
      ),
    },
  };
  // A historical-identity superset is sufficient for finding candidates. The join below
  // checks current participation after revision resolution, so it cannot revive old owners.
  const candidateTraces = boundedEvents(scope)
    .selectRaw("e.trace_id AS trace_id")
    .whereRaw("(e.agent_id != '' OR e.agent_name != '')")
    .whereRaw(
      "concat(if(e.agent_id != '', 'id', 'name'), ':', if(e.agent_id != '', e.agent_id, e.agent_name)) IN {coverageIdentities: Array(String)}",
      { coverageIdentities: traces.params.coverageIdentities },
    )
    .buildWithParams();
  const unassigned = unidentifiedModels(scope, candidateTraces);
  const counts = await execute({
    query: `SELECT participating.identity_kind, participating.identity_value, uniqExact(tuple(unassigned.trace_id, unassigned.span_id)) AS trace_unassigned_model_calls FROM (${traces.query}) participating INNER JOIN (${unassigned.query}) unassigned ON participating.trace_id = unassigned.trace_id GROUP BY participating.identity_kind, participating.identity_value`,
    params: { ...traces.params, ...unassigned.params },
  });
  for (const item of items)
    item.stats.traceUnassignedModelCalls = n(
      counts.find(
        (row) =>
          row.identity_kind === item.identity.kind &&
          row.identity_value === item.identity.value,
      )?.trace_unassigned_model_calls,
    );
}

async function addTraceCoverage<T extends AgentModelStats>(
  items: T[],
  scope: AgentScope,
  traceId: (item: T) => string,
) {
  if (items.length === 0) return;
  const traces: Query = {
    query: "SELECT arrayJoin({coverageTraceIds: Array(String)}) AS trace_id",
    params: { coverageTraceIds: [...new Set(items.map(traceId))] },
  };
  const unassigned = unidentifiedModels(scope, traces);
  const counts = await execute({
    ...unassigned,
    query: `SELECT trace_id, uniqExact(span_id) AS trace_unassigned_model_calls FROM (${unassigned.query}) GROUP BY trace_id`,
  });
  for (const item of items)
    item.traceUnassignedModelCalls = n(
      counts.find((row) => row.trace_id === traceId(item))
        ?.trace_unassigned_model_calls,
    );
}
const identityOf = (row: Row): AgentIdentity => ({
  kind: row.identity_kind === "id" ? "id" : "name",
  value: str(row.identity_value),
});
const summary = (row: Row): AgentSummary => ({
  identity: identityOf(row),
  id: row.identity_kind === "id" ? str(row.identity_value) : null,
  displayName: str(row.display_name) || str(row.identity_value),
  firstSeen: date(row.first_seen),
  lastSeen: date(row.last_seen),
  environments: strings(row.environments),
  stats: {
    ...modelStats(row),
    runs: n(row.runs),
    traces: n(row.traces),
    errorRuns: n(row.error_runs),
    averageRunDurationMs: nullableNumber(row.average_run_duration_ms),
    ...(row.observations !== undefined
      ? {
          observations: n(row.observations),
          toolCalls: n(row.tool_calls),
          skillLoads: n(row.skill_loads),
          completedRuns: n(row.completed_runs),
          unfinishedRuns: n(row.unfinished_runs),
          averageRunCost: nullableNumber(row.average_run_cost),
          runCostKnownRuns: n(row.run_cost_known_runs),
        }
      : {}),
  },
});

export function getAgentPeriods(scope: AgentScope) {
  validateScope(scope);
  const duration = scope.to.getTime() - scope.from.getTime();
  return {
    current: scope,
    previous: {
      ...scope,
      from: new Date(scope.from.getTime() - duration),
      to: new Date(scope.from),
    },
  };
}

function rebindQuery(base: Query, prefix: string): Query {
  const names = new Set(Object.keys(base.params));
  return {
    query: base.query.replace(/\{(\w+):/g, (match, name: string) =>
      names.has(name) ? `{${prefix}${name}:` : match,
    ),
    params: Object.fromEntries(
      Object.entries(base.params).map(([key, value]) => [
        `${prefix}${key}`,
        value,
      ]),
    ),
  };
}

function comparedEvents(
  scope: AgentScope,
  identity?: AgentIdentity,
  columns: readonly string[] = [
    "e.usage_details AS usage_details",
    "e.cost_details AS cost_details",
    "e.skills_resource_loaded AS skills_resource_loaded",
  ],
) {
  const periods = getAgentPeriods(scope);
  const current = scopedEvents(periods.current, identity, columns);
  const previous = rebindQuery(
    scopedEvents(periods.previous, identity, columns),
    "previous_",
  );
  return {
    query: `SELECT 'current' AS period, * FROM (${current.query}) UNION ALL SELECT 'previous' AS period, * FROM (${previous.query})`,
    params: { ...current.params, ...previous.params },
  };
}

const PERIOD_STAT_COLUMNS = [
  "runs",
  "traces",
  "error_runs",
  "average_run_duration_ms",
  "model_calls",
  "usage_known_calls",
  "priced_model_calls",
  "unattributed_model_calls",
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "cost",
  "observations",
  "tool_calls",
  "skill_loads",
  "completed_runs",
  "unfinished_runs",
  "average_run_cost",
  "run_cost_known_runs",
] as const;

function periodMetricsQuery(
  scope: AgentScope,
  identity?: AgentIdentity,
  bucketCount?: number,
): Query {
  const withBuckets = bucketCount !== undefined;
  const observations = comparedEvents(scope, identity);
  const base = withBuckets
    ? buildAgentCacheEventsQuery(observations)
    : observations;
  const completed = `(${RUN}) AND end_time IS NOT NULL AND end_time >= start_time AND end_time <= if(period = 'current', {metricsCurrentTo: DateTime64(3, 'UTC')}, {metricsPreviousTo: DateTime64(3, 'UTC')})`;
  const knownCost = `(${completed}) AND own_model_calls > 0 AND own_priced_calls = own_model_calls`;
  const { bucketMs } = agentActivityLayout({ ...scope, bucketCount });
  return {
    query: `WITH scoped AS (${base.query})
    SELECT ${IDENTITY_KIND} AS identity_kind, ${IDENTITY_VALUE} AS identity_value, period,
      ${withBuckets ? `intDiv(toUnixTimestamp64Milli(start_time) - if(period = 'current', {metricsCurrentFromMs: Int64}, {metricsPreviousFromMs: Int64}), {metricsBucketMs: Int64}) AS bucket_index, grouping(bucket_index) AS is_summary,` : ""}
      coalesce(nullIf(argMaxIf(agent_name, tuple(start_time, event_ts, trace_id, span_id), (${VALID_NAME}) AND (${RUN})), ''), argMaxIf(agent_name, tuple(start_time, event_ts, trace_id, span_id), ${VALID_NAME})) AS display_name,
      min(start_time) AS first_seen, max(start_time) AS last_seen, arraySort(groupUniqArray(environment)) AS environments,
      countIf(${RUN}) AS runs, uniqExact(trace_id) AS traces, countIf((${RUN}) AND level = 'ERROR') AS error_runs,
      countIf(${completed}) AS completed_runs, runs - completed_runs AS unfinished_runs,
      if(completed_runs > 0, avgIf(dateDiff('microsecond', start_time, end_time) / 1000, ${completed}), NULL) AS average_run_duration_ms,
      countIf(${knownCost}) AS run_cost_known_runs,
      if(run_cost_known_runs > 0, avgIf(own_model_cost, ${knownCost}), NULL) AS average_run_cost,
      count() AS observations, countIf(type = 'TOOL') AS tool_calls, sum(length(arrayDistinct(skills_resource_loaded))) AS skill_loads,
      ${MODEL_METRICS}
      ${
        withBuckets
          ? `, countIf(type = 'GENERATION' AND _agent_cache_known) AS known_cache_model_calls,
      if(known_cache_model_calls > 0, sumIf(_agent_cache_read, type = 'GENERATION' AND _agent_cache_known), NULL) AS cache_read_input_tokens,
      if(known_cache_model_calls > 0, sumIf(_agent_cache_input, type = 'GENERATION' AND _agent_cache_known), NULL) AS cache_eligible_input_tokens,
      if(cache_eligible_input_tokens > 0, cache_read_input_tokens / cache_eligible_input_tokens, NULL) AS cache_hit_rate`
          : ""
      }
    FROM (SELECT *, countIf(type = 'GENERATION') OVER owner AS own_model_calls,
      countIf(type = 'GENERATION' AND mapContains(cost_details, 'total')) OVER owner AS own_priced_calls,
      sumIf(cost_details['total'], type = 'GENERATION' AND mapContains(cost_details, 'total')) OVER owner AS own_model_cost
      FROM scoped WINDOW owner AS (PARTITION BY period, trace_id, agent_run_id, ${IDENTITY_KIND}, ${IDENTITY_VALUE})) e
    GROUP BY ${withBuckets ? "GROUPING SETS ((identity_kind, identity_value, period), (identity_kind, identity_value, period, bucket_index))" : "identity_kind, identity_value, period"}`,
    params: {
      ...base.params,
      metricsCurrentTo: scope.to
        .toISOString()
        .replace("T", " ")
        .replace("Z", ""),
      metricsPreviousTo: scope.from
        .toISOString()
        .replace("T", " ")
        .replace("Z", ""),
      ...(withBuckets
        ? {
            metricsCurrentFromMs: scope.from.getTime(),
            metricsPreviousFromMs:
              scope.from.getTime() -
              (scope.to.getTime() - scope.from.getTime()),
            metricsBucketMs: bucketMs,
          }
        : {}),
    },
  };
}

function overviewStats(row: Row = {}): AgentOverviewStats {
  const models = modelStats(row);
  if (models.modelCalls === 0) {
    models.cost = 0;
    models.inputTokens = 0;
    models.outputTokens = 0;
    models.totalTokens = 0;
  }
  return {
    ...models,
    runs: n(row.runs),
    traces: n(row.traces),
    errorRuns: n(row.error_runs),
    averageRunDurationMs: nullableNumber(row.average_run_duration_ms),
    observations: n(row.observations),
    toolCalls: n(row.tool_calls),
    skillLoads: n(row.skill_loads),
    completedRuns: n(row.completed_runs),
    unfinishedRuns: n(row.unfinished_runs),
    averageRunCost: nullableNumber(row.average_run_cost),
    runCostKnownRuns: n(row.run_cost_known_runs),
    cacheHitRate: nullableNumber(row.cache_hit_rate),
    cacheReadInputTokens: nullableNumber(row.cache_read_input_tokens),
    cacheEligibleInputTokens: nullableNumber(row.cache_eligible_input_tokens),
    knownCacheModelCalls: n(row.known_cache_model_calls),
  };
}

function comparisonSummaryQuery(
  scope: AgentScope,
  identity?: AgentIdentity,
): Query {
  const base = periodMetricsQuery(scope, identity);
  return {
    ...base,
    query: `SELECT p.identity_kind AS identity_kind, p.identity_value AS identity_value, argMax(p.display_name, p.last_seen) AS display_name,
      min(p.first_seen) AS first_seen, max(p.last_seen) AS last_seen,
      arraySort(arrayDistinct(arrayFlatten(groupArray(p.environments)))) AS environments,
      ${PERIOD_STAT_COLUMNS.flatMap((column) => [
        `${["cost", "input_tokens", "output_tokens", "total_tokens"].includes(column) ? `if(maxIf(p.model_calls, p.period = 'current') = 0, 0, maxIf(p.${column}, p.period = 'current'))` : `maxIf(p.${column}, p.period = 'current')`} AS ${column}`,
        `${["cost", "input_tokens", "output_tokens", "total_tokens"].includes(column) ? `if(maxIf(p.model_calls, p.period = 'previous') = 0, 0, maxIf(p.${column}, p.period = 'previous'))` : `maxIf(p.${column}, p.period = 'previous')`} AS previous_${column}`,
      ]).join(",\n")}
      FROM (${base.query}) p GROUP BY p.identity_kind, p.identity_value`,
  };
}

function comparisonSummary(row: Row, scope: AgentScope): AgentSummary {
  const previous = getAgentPeriods(scope).previous;
  return {
    ...summary(row),
    stats: overviewStats(row),
    comparison: {
      from: previous.from,
      to: previous.to,
      stats: overviewStats(
        Object.fromEntries(
          PERIOD_STAT_COLUMNS.map((column) => [
            column,
            row[`previous_${column}`],
          ]),
        ),
      ),
    },
  };
}

export async function getAgentOverview(
  input: AgentDetailInput & { bucketCount?: number },
): Promise<AgentOverviewResult> {
  const bucketCount = input.bucketCount ?? AGENT_LIMITS.activityBuckets;
  const periods = getAgentPeriods(input);
  const { bucketMs, length } = agentActivityLayout({ ...input, bucketCount });
  const rows = await execute(
    periodMetricsQuery(input, input.identity, bucketCount),
  );
  const periodResult = (
    period: "current" | "previous",
  ): AgentOverviewPeriod => {
    const scope = periods[period];
    const stats = overviewStats(
      rows.find((row) => row.period === period && n(row.is_summary) === 1),
    );
    const buckets: AgentOverviewBucket[] = Array.from(
      { length },
      (_, index) => ({
        timestamp: new Date(scope.from.getTime() + index * bucketMs),
        observations: 0,
        runs: 0,
        modelCalls: 0,
        toolCalls: 0,
        skillLoads: 0,
        errorRuns: 0,
        modelCost: 0,
        averageRunDurationMs: null,
        averageRunCost: null,
        completedRuns: 0,
        runCostKnownRuns: 0,
        cacheHitRate: null,
        cacheReadInputTokens: null,
        cacheEligibleInputTokens: null,
        knownCacheModelCalls: 0,
      }),
    );
    for (const row of rows.filter(
      (item) => item.period === period && n(item.is_summary) === 0,
    )) {
      const index = n(row.bucket_index);
      if (!buckets[index]) throw new Error("Invalid agent overview bucket.");
      const value = overviewStats(row);
      buckets[index] = {
        timestamp: buckets[index]!.timestamp,
        observations: value.observations,
        runs: value.runs,
        modelCalls: value.modelCalls,
        toolCalls: value.toolCalls,
        skillLoads: value.skillLoads,
        errorRuns: value.errorRuns,
        modelCost: value.cost,
        averageRunDurationMs: value.averageRunDurationMs,
        averageRunCost: value.averageRunCost,
        completedRuns: value.completedRuns,
        runCostKnownRuns: value.runCostKnownRuns,
        cacheHitRate: value.cacheHitRate,
        cacheReadInputTokens: value.cacheReadInputTokens,
        cacheEligibleInputTokens: value.cacheEligibleInputTokens,
        knownCacheModelCalls: value.knownCacheModelCalls,
      };
    }
    return { from: scope.from, to: scope.to, stats, bucketMs, buckets };
  };
  const current = periodResult("current");
  const previous = periodResult("previous");
  const groupLimit = 50;
  const groupsBase = comparedEvents(input, input.identity, [
    "e.skills_resource_loaded AS skills_resource_loaded",
  ]);
  const groupBucket = `intDiv(toUnixTimestamp64Milli(start_time) - if(period = 'current', {trendCurrentFromMs: Int64}, {trendPreviousFromMs: Int64}), {trendBucketMs: Int64})`;
  const groups = await execute({
    query: `WITH scoped AS (${groupsBase.query}), tool_buckets AS (
        SELECT name AS item_name, period, ${groupBucket} AS bucket_index, count() AS unit_count
        FROM scoped WHERE type = 'TOOL' GROUP BY item_name, period, bucket_index), skill_buckets AS (
        SELECT skill.skillName AS item_name, skill.langfuseSkillId AS skill_id, skill.skillVersion AS skill_version,
          skill.filePath AS file_path, period, ${groupBucket} AS bucket_index, count() AS unit_count
        FROM scoped ARRAY JOIN arrayDistinct(skills_resource_loaded) AS skill GROUP BY item_name, skill_id, skill_version, file_path, period, bucket_index)
      SELECT * FROM (SELECT 'tool' AS kind, item_name, '' AS skill_id, NULL AS skill_version, '' AS file_path,
        sumIf(unit_count, period = 'current') AS current_count, sumIf(unit_count, period = 'previous') AS previous_count,
        groupArrayIf(tuple(bucket_index, unit_count), period = 'current') AS activity_buckets, count() OVER () AS total_count
        FROM tool_buckets GROUP BY item_name ORDER BY current_count + previous_count DESC, item_name ASC LIMIT {trendLimit: UInt32})
      UNION ALL SELECT * FROM (SELECT 'skill' AS kind, item_name, skill_id, skill_version, file_path,
        sumIf(unit_count, period = 'current') AS current_count, sumIf(unit_count, period = 'previous') AS previous_count,
        groupArrayIf(tuple(bucket_index, unit_count), period = 'current') AS activity_buckets, count() OVER () AS total_count
        FROM skill_buckets GROUP BY item_name, skill_id, skill_version, file_path
        ORDER BY current_count + previous_count DESC, item_name ASC, skill_id ASC, skill_version ASC, file_path ASC LIMIT {trendLimit: UInt32})`,
    params: {
      ...groupsBase.params,
      trendLimit: groupLimit,
      trendCurrentFromMs: input.from.getTime(),
      trendPreviousFromMs: periods.previous.from.getTime(),
      trendBucketMs: bucketMs,
    },
  });
  for (const [scope, result] of [
    [periods.current, current],
    [periods.previous, previous],
  ] as const) {
    if (result.stats.observations === 0) continue;
    await addSummaryCoverage(
      [
        {
          identity: input.identity,
          id: input.identity.kind === "id" ? input.identity.value : null,
          displayName: input.identity.value,
          firstSeen: scope.from,
          lastSeen: scope.to,
          environments: [],
          stats: result.stats,
        },
      ],
      scope,
    );
  }
  const toolRows = groups.filter((row) => row.kind === "tool");
  const skillRows = groups.filter((row) => row.kind === "skill");
  const trendBuckets = (row: Row) =>
    buildAgentCountActivityResult(
      { ...input, bucketCount },
      (Array.isArray(row.activity_buckets) ? row.activity_buckets : []).map(
        (value: unknown) => {
          if (!Array.isArray(value) || value.length !== 2)
            throw new Error("Invalid resource activity bucket.");
          return { bucket_index: Number(value[0]), count: Number(value[1]) };
        },
      ),
    ).buckets;
  return {
    current,
    previous,
    groupLimit,
    toolsTotalCount: n(toolRows[0]?.total_count),
    skillsTotalCount: n(skillRows[0]?.total_count),
    tools: toolRows.map((row) => ({
      name: str(row.item_name),
      currentCount: n(row.current_count),
      previousCount: n(row.previous_count),
      buckets: trendBuckets(row),
    })),
    skills: skillRows.map((row) => ({
      name: str(row.item_name),
      skillId: str(row.skill_id) || null,
      skillVersion: nullableNumber(row.skill_version),
      filePath: str(row.file_path),
      currentCount: n(row.current_count),
      previousCount: n(row.previous_count),
      buckets: trendBuckets(row),
    })),
  };
}

async function page<T>(
  base: Query,
  input: AgentPageInput,
  order: string,
  convert: (row: Row) => T,
): Promise<AgentPage<T>> {
  validatePage(input);
  const rows = await execute({
    query: `SELECT *, count() OVER () AS total_count FROM (${base.query}) ${order}
    LIMIT {agentPageSize: UInt32} OFFSET {agentOffset: UInt32}`,
    params: {
      ...base.params,
      agentPageSize: input.pageSize,
      agentOffset: input.page * input.pageSize,
    },
  });
  let totalCount = rows.length > 0 ? n(rows[0]?.total_count) : 0;
  if (rows.length === 0 && input.page > 0)
    totalCount = n(
      (
        await execute({
          ...base,
          query: `SELECT count() AS count FROM (${base.query})`,
        })
      )[0]?.count,
    );
  return {
    items: rows.map(convert),
    totalCount,
    page: input.page,
    pageSize: input.pageSize,
  };
}

function filteredAgentSummary(input: AgentListActivityInput) {
  if (
    input.search !== undefined &&
    (typeof input.search !== "string" || Array.from(input.search).length > 200)
  )
    throw new InvalidRequestError("Select a valid agent search.");
  const parsedFilters = AgentListFilterListSchema.safeParse(input.filter ?? []);
  if (!parsedFilters.success)
    throw new InvalidRequestError("Select supported agent filters.");
  const filters = parsedFilters.data;
  const environmentFilters = filters.filter(
    (filter) => filter.column === "environment",
  );
  const scope = {
    ...input,
    environmentFilter: [
      ...(input.environmentFilter ?? []),
      ...environmentFilters,
    ],
  };
  let query = comparisonSummaryQuery(scope);
  const summaryFilters = compileAgentFilters(
    filters.filter((filter) => filter.column !== "environment"),
  );
  if (summaryFilters.query.length > 0)
    query = {
      query: `SELECT * FROM (${query.query}) WHERE ${summaryFilters.query}`,
      params: { ...query.params, ...summaryFilters.params },
    };
  if (input.search)
    query = {
      query: `SELECT * FROM (${query.query}) WHERE
    positionCaseInsensitiveUTF8(display_name, {agentSearch: String}) > 0 OR
    positionCaseInsensitiveUTF8(identity_value, {agentSearch: String}) > 0`,
      params: { ...query.params, agentSearch: input.search },
    };
  return { query, scope };
}

export async function listAgents(
  input: AgentListInput,
): Promise<AgentPage<AgentSummary>> {
  const columns = {
    lastSeen: "last_seen",
    runs: "runs",
    cost: "cost",
    name: "display_name",
  };
  if (
    !Object.hasOwn(columns, input.sort) ||
    !["asc", "desc"].includes(input.direction)
  )
    throw new InvalidRequestError("Select a valid agent sort.");
  const { query, scope } = filteredAgentSummary(input);
  const previousScope = getAgentPeriods(scope).previous;
  const result = await page(
    query,
    input,
    `ORDER BY ${columns[input.sort]} ${input.direction.toUpperCase()} NULLS LAST, identity_kind ASC, identity_value ASC`,
    (row) => comparisonSummary(row, scope),
  );
  await addSummaryCoverage(result.items, scope);
  const previousItems = result.items
    .filter((item) => (item.comparison?.stats.observations ?? 0) > 0)
    .map((item) => ({ ...item, stats: item.comparison!.stats }));
  await addSummaryCoverage(previousItems, previousScope);
  return result;
}

export async function getAgentListActivity(
  input: AgentListActivityInput,
): Promise<AgentCountActivityResult> {
  const { query: cohort, scope } = filteredAgentSummary(input);
  const base = scopedEvents(scope, undefined, []);
  const { bucketMs } = agentActivityLayout(input);
  const rows = await execute<AgentActivityBucketRow>({
    query: `SELECT intDiv(toUnixTimestamp64Milli(start_time) - {activityFromMs: Int64}, {activityBucketMs: Int64}) AS bucket_index,
      count() AS count FROM (${base.query})
      WHERE concat(${IDENTITY_KIND}, ':', ${IDENTITY_VALUE}) IN
        (SELECT concat(identity_kind, ':', identity_value) FROM (${cohort.query}))
      GROUP BY bucket_index`,
    params: {
      ...base.params,
      ...cohort.params,
      activityFromMs: input.from.getTime(),
      activityBucketMs: bucketMs,
    },
  });
  return buildAgentCountActivityResult(input, rows);
}

export async function getAgentDetail(
  input: AgentDetailInput,
): Promise<AgentSummary | null> {
  const rows = await execute(comparisonSummaryQuery(input, input.identity));
  const result = rows[0] ? comparisonSummary(rows[0], input) : null;
  if (result) {
    await addSummaryCoverage([result], input);
    if (result.comparison && result.comparison.stats.observations > 0)
      await addSummaryCoverage(
        [{ ...result, stats: result.comparison.stats }],
        getAgentPeriods(input).previous,
      );
  }
  return result;
}

export async function getAgentEnvironments(
  input: Omit<AgentScope, "environment" | "environmentFilter">,
): Promise<string[]> {
  const base = comparedEvents({ ...input, environment: null }, undefined, []);
  const rows = await execute({
    ...base,
    query: `SELECT DISTINCT environment FROM (${base.query}) ORDER BY environment ASC LIMIT 101`,
  });
  if (rows.length > 100)
    throw new InvalidRequestError("Too many agent environments to list.");
  return rows.map((row) => str(row.environment));
}

/** One bounded read for the visible identity cohort; counts describe observed spans. */
export async function getAgentActivity(
  input: AgentActivityInput,
): Promise<AgentActivityResult> {
  if (
    !Array.isArray(input.identities) ||
    input.identities.length === 0 ||
    input.identities.length > AGENT_LIMITS.pageSize ||
    new Set(
      input.identities.map((identity) => `${identity.kind}:${identity.value}`),
    ).size !== input.identities.length
  )
    throw new InvalidRequestError(
      "Select up to 100 distinct agents and activity buckets.",
    );
  const base = scopedEvents(input, input.identities, []);
  const { bucketMs, length } = agentActivityLayout(input);
  const rows = await execute({
    query: `SELECT ${IDENTITY_KIND} AS identity_kind, ${IDENTITY_VALUE} AS identity_value,
      intDiv(toUnixTimestamp64Milli(start_time) - {activityFromMs: Int64}, {activityBucketMs: Int64}) AS bucket_index,
      count() AS observation_count FROM (${base.query})
      GROUP BY identity_kind, identity_value, bucket_index`,
    params: {
      ...base.params,
      activityFromMs: input.from.getTime(),
      activityBucketMs: bucketMs,
    },
  });
  const series = input.identities.map((identity) => ({
    identity,
    buckets: Array.from({ length }, (_, index) => ({
      timestamp: new Date(input.from.getTime() + index * bucketMs),
      count: 0,
    })),
  }));
  const byIdentity = new Map(
    series.map((item) => [
      `${item.identity.kind}:${item.identity.value}`,
      item,
    ]),
  );
  for (const row of rows) {
    const bucket = byIdentity.get(`${row.identity_kind}:${row.identity_value}`)
      ?.buckets[n(row.bucket_index)];
    if (!bucket) throw new Error("Invalid agent activity bucket.");
    bucket.count = n(row.observation_count);
  }
  return { from: input.from, to: input.to, bucketMs, series };
}

export async function getAgentSkillsActivity(
  input: AgentDetailInput & { bucketCount?: number },
): Promise<AgentCountActivityResult> {
  const base = scopedEvents(input, input.identity, [
    "e.skills_resource_loaded AS skills_resource_loaded",
  ]);
  const { bucketMs } = agentActivityLayout(input);
  const rows = await execute<AgentActivityBucketRow>({
    query: `SELECT intDiv(toUnixTimestamp64Milli(start_time) - {activityFromMs: Int64}, {activityBucketMs: Int64}) AS bucket_index,
      count() AS count FROM (${base.query}) ARRAY JOIN arrayDistinct(skills_resource_loaded) AS skill
      GROUP BY bucket_index`,
    params: {
      ...base.params,
      activityFromMs: input.from.getTime(),
      activityBucketMs: bucketMs,
    },
  });
  return buildAgentCountActivityResult(input, rows);
}

export async function getAgentRuns(
  input: AgentDetailInput & AgentPageInput,
): Promise<AgentPage<AgentRunRow>> {
  const base = scopedEvents(input, input.identity);
  const query = `WITH scoped AS (${base.query}), models AS (
    SELECT trace_id, agent_run_id, ${MODEL_METRICS} FROM scoped WHERE type = 'GENERATION' AND agent_run_id != ''
    GROUP BY trace_id, agent_run_id)
    SELECT r.span_id AS id, r.trace_id, r.session_id, r.name, r.environment, r.start_time, r.end_time,
      if(r.end_time IS NOT NULL AND r.end_time >= r.start_time, dateDiff('microsecond', r.start_time, r.end_time) / 1000, NULL) AS duration_ms,
      multiIf(r.level = 'ERROR', 'error', r.end_time IS NULL, 'open', 'ended') AS status,
      m.model_calls, m.usage_known_calls, m.priced_model_calls, m.unattributed_model_calls,
      m.input_tokens, m.output_tokens, m.total_tokens, m.cost
    FROM (SELECT * FROM scoped WHERE ${RUN}) r
    LEFT JOIN models m ON r.trace_id = m.trace_id AND r.span_id = m.agent_run_id`;
  const result = await page(
    { query, params: base.params },
    input,
    "ORDER BY start_time DESC, trace_id ASC, id ASC",
    (row) => ({
      ...modelStats(row),
      id: str(row.id),
      traceId: str(row.trace_id),
      sessionId: str(row.session_id) || null,
      name: str(row.name),
      environment: str(row.environment),
      startTime: date(row.start_time),
      endTime: optionalDate(row.end_time),
      durationMs: nullableNumber(row.duration_ms),
      status: runStatus(row.status),
    }),
  );
  await addTraceCoverage(result.items, input, (row) => row.traceId);
  return result;
}

export async function getAgentTraces(
  input: AgentDetailInput & AgentPageInput,
): Promise<AgentPage<AgentTraceRow>> {
  const base = scopedEvents(input, input.identity);
  const result = await page(
    {
      ...base,
      query: `SELECT trace_id AS id,
    argMax(trace_events.trace_name, tuple(trace_events.start_time, trace_events.event_ts, trace_events.span_id)) AS name,
    argMax(trace_events.session_id, tuple(trace_events.start_time, trace_events.event_ts, trace_events.span_id)) AS session_id,
    min(trace_events.start_time) AS start_time, max(trace_events.end_time) AS end_time,
    countIf(${RUN}) AS runs, ${MODEL_METRICS}
    FROM (${base.query}) trace_events GROUP BY trace_id`,
    },
    input,
    "ORDER BY start_time DESC, id ASC",
    (row) => ({
      ...modelStats(row),
      id: str(row.id),
      name: str(row.name),
      sessionId: str(row.session_id) || null,
      startTime: date(row.start_time),
      endTime: optionalDate(row.end_time),
      runs: n(row.runs),
    }),
  );
  await addTraceCoverage(result.items, input, (row) => row.id);
  return result;
}

export async function getAgentSkills(
  input: AgentDetailInput & AgentPageInput,
): Promise<AgentPage<AgentSkillRow>> {
  const base = scopedEvents(input, input.identity, [
    "e.skills_resource_loaded AS skills_resource_loaded",
  ]);
  return page(
    {
      ...base,
      query: `SELECT skill.langfuseSkillId AS skill_id, skill.skillVersion AS skill_version,
    skill.skillName AS skill_name, skill.filePath AS file_path, count() AS loads, uniqExact(trace_id) AS traces,
    min(start_time) AS first_seen, max(start_time) AS last_seen, arraySort(groupUniqArray(5)(trace_id)) AS sample_trace_ids
    FROM (${base.query}) ARRAY JOIN arrayDistinct(skills_resource_loaded) AS skill
    GROUP BY skill_id, skill_version, skill_name, file_path`,
    },
    input,
    "ORDER BY loads DESC, skill_name ASC, file_path ASC, skill_id ASC, skill_version ASC",
    (row) => ({
      skillId: str(row.skill_id) || null,
      skillVersion: nullableNumber(row.skill_version),
      name: str(row.skill_name),
      filePath: str(row.file_path),
      loads: n(row.loads),
      traces: n(row.traces),
      firstSeen: date(row.first_seen),
      lastSeen: date(row.last_seen),
      sampleTraceIds: strings(row.sample_trace_ids),
    }),
  );
}

export async function getAgentInfo(
  input: AgentDetailInput,
): Promise<AgentInfo | null> {
  const base = scopedEvents(input, input.identity, [], true);
  const roots = await execute({
    ...base,
    query: `SELECT * FROM (${base.query}) WHERE ${RUN}
    ORDER BY start_time DESC, event_ts DESC, trace_id ASC, span_id ASC LIMIT 1`,
  });
  const root = roots[0];
  if (!root) return null;
  const rows = await execute({
    query: `SELECT provided_model_name, leftUTF8(model_parameters, 4000) AS model_parameters,
    model_parameters_truncated AS parameters_truncated, span_id, trace_id, prompt_id, prompt_name, prompt_version
    FROM (${base.query}) WHERE type = 'GENERATION' AND trace_id = {infoTrace: String} AND agent_run_id = {infoRun: String}
    ORDER BY start_time DESC, event_ts DESC, span_id ASC LIMIT 1`,
    params: {
      ...base.params,
      infoTrace: str(root.trace_id),
      infoRun: str(root.span_id),
    },
  });
  const model = rows[0];
  return {
    identity: input.identity,
    id: str(root.agent_id) || null,
    displayName:
      str(root.agent_name).trim().length > 0 &&
      Array.from(str(root.agent_name)).length <= AGENT_LIMITS.nameLength
        ? str(root.agent_name)
        : input.identity.value,
    environment: str(root.environment),
    source: {
      traceId: str(root.trace_id),
      observationId: str(root.span_id),
      startTime: date(root.start_time),
    },
    agentVersion: str(root.agent_version) || null,
    description: str(root.agent_description) || null,
    descriptionTruncated: Boolean(n(root.description_truncated)),
    scopeName: str(root.scope_name) || null,
    scopeVersion: str(root.scope_version) || null,
    serviceName: str(root.service_name) || null,
    serviceVersion: str(root.service_version) || null,
    model: model
      ? {
          name: str(model.provided_model_name),
          parameters: str(model.model_parameters) || null,
          parametersTruncated: Boolean(n(model.parameters_truncated)),
          sourceObservationId: str(model.span_id),
          sourceTraceId: str(model.trace_id),
          prompt: str(model.prompt_id)
            ? {
                id: str(model.prompt_id),
                name: str(model.prompt_name),
                version: nullableNumber(model.prompt_version),
              }
            : null,
        }
      : null,
  };
}
