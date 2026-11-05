import {
  LangfuseNotFoundError,
  type FilterState,
  type Plan,
} from "@langfuse/shared";
import {
  InMemoryFilterService,
  listCurrentTopicAssignments,
  listCurrentTopicSummaries,
  TOPIC_ASSIGNMENT_STATUSES,
  TOPIC_SUMMARY_STATES,
  type TopicAssignmentRow,
  type TopicResultCondition,
  type TopicResultCursor,
} from "@langfuse/shared/src/server";
import {
  TOPICS_MAX_TIME_RANGE_MS,
  type TopicDefinition,
  type TopicFacet,
  type TopicRule,
  type TopicRun,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import {
  getPublishedTopicRun,
  getTopicRule,
  getTopicRuns,
  getTopicTraceUnitTimeRange,
  isTopicsProjectEnabled,
  listTopicFacets,
  listTopicRules,
} from "@langfuse/shared/topics/server";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import { createStructuredPublicApiError } from "@/src/features/public-api/types/structuredPublicApiError";
import { encodeTopicResultCursor } from "@/src/features/public-api/types/unstable-topics";
import { currentTopicResults } from "./currentResults";

const DEFAULT_WINDOW_MS = 7 * 86_400_000;

type FilterType = FilterState[number]["type"];
type FilterColumns<T> = Record<
  string,
  { types: readonly FilterType[]; value: (row: T) => unknown }
>;

/**
 * Public read access uses the project gate only: API keys carry no user, so
 * the UI's per-user feature preview cannot apply.
 */
function assertTopicsApiAvailable(projectId: string) {
  if (!isTopicsProjectEnabled(projectId))
    throw new LangfuseNotFoundError(
      "Topics is not available for this project.",
    );
}

function invalidFilter(message: string, column: string, allowed: string[]) {
  return createStructuredPublicApiError({
    httpCode: 400,
    code: "invalid_query",
    message,
    details: { column, allowedValues: allowed },
  });
}

function lower(value: unknown): unknown {
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) return value.map(lower);
  return value;
}

/** String matching on Topics routes is case-insensitive. */
function applyFilter<T>(
  rows: T[],
  filter: FilterState | undefined,
  columns: FilterColumns<T>,
): T[] {
  if (!filter || filter.length === 0) return rows;
  const names = Object.keys(columns);
  for (const condition of filter) {
    const column = Object.hasOwn(columns, condition.column)
      ? columns[condition.column]
      : undefined;
    if (!column)
      throw invalidFilter(
        `Unknown filter column "${condition.column}".`,
        condition.column,
        names,
      );
    if (!column.types.includes(condition.type))
      throw invalidFilter(
        `Filter column "${condition.column}" does not support type "${condition.type}".`,
        condition.column,
        [...column.types],
      );
  }
  const conditions = filter.map(
    (condition) =>
      ({
        ...condition,
        value: lower(condition.value),
      }) as FilterState[number],
  );
  return rows.filter((row) =>
    InMemoryFilterService.evaluateFilter(row, conditions, (data, name) =>
      lower(columns[name].value(data)),
    ),
  );
}

function paginate<T>(rows: T[], page: number, limit: number) {
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    meta: {
      page,
      limit,
      totalItems: rows.length,
      totalPages: Math.ceil(rows.length / limit),
    },
  };
}

function resolveWindow(
  from?: Date,
  to?: Date,
  maxMs = TOPICS_MAX_TIME_RANGE_MS,
): TopicTimeRange {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - DEFAULT_WINDOW_MS);
  if (start >= end || end.getTime() - start.getTime() > maxMs)
    throw createStructuredPublicApiError({
      httpCode: 400,
      code: "invalid_query",
      message: `fromTimestamp must be before toTimestamp, and the window can span at most ${maxMs / 86_400_000} days.`,
    });
  return { from: start, to: end };
}

/**
 * A facet is active when a rule uses it, or always without a rule (manual
 * runs). Until assignments carry their rule (#19553), a facet's results belong
 * to the rules it is attached to.
 */
async function loadRuleScope(projectId: string) {
  const rules = await listTopicRules(projectId);
  const ruleIdsFor = (facetId: string) =>
    rules.filter((rule) => rule.facetIds.includes(facetId)).map(({ id }) => id);
  return {
    rules,
    ruleIdsFor,
    isActive: (facetId: string) =>
      rules.length === 0 || ruleIdsFor(facetId).length > 0,
  };
}

type RuleScope = Awaited<ReturnType<typeof loadRuleScope>>;

function publicFacet(
  facet: TopicFacet,
  scope: RuleScope,
  run: TopicRun | null,
) {
  const version = facet.versions[0];
  return {
    id: facet.id,
    name: facet.name,
    description: facet.description,
    isBuiltIn: facet.isBuiltIn,
    active: scope.isActive(facet.id),
    ruleIds: scope.ruleIdsFor(facet.id),
    version: version?.version ?? 0,
    prompt: version?.prompt ?? "",
    publishedRun: run
      ? {
          id: run.id,
          completedAt: run.finishedAt ? new Date(run.finishedAt) : null,
          topicCount: run.topics.length,
        }
      : null,
  };
}

type PublicFacet = ReturnType<typeof publicFacet>;

const facetColumns: FilterColumns<PublicFacet> = {
  id: { types: ["stringOptions"], value: (row) => row.id },
  name: { types: ["string", "stringOptions"], value: (row) => row.name },
  description: { types: ["string"], value: (row) => row.description },
  isBuiltIn: { types: ["boolean"], value: (row) => row.isBuiltIn },
  active: { types: ["boolean"], value: (row) => row.active },
};

const hasActiveCondition = (filter: FilterState | undefined) =>
  filter?.some((condition) => condition.column === "active") ?? false;

async function loadPublicFacets(projectId: string) {
  const [facets, scope] = await Promise.all([
    listTopicFacets(projectId),
    loadRuleScope(projectId),
  ]);
  return Promise.all(
    facets.map(async (facet) =>
      publicFacet(
        facet,
        scope,
        await getPublishedTopicRun(projectId, facet.id),
      ),
    ),
  );
}

function publicRule(rule: TopicRule) {
  return {
    id: rule.id,
    name: rule.name,
    filter: rule.filter,
    sampling: rule.sampling,
    facetIds: rule.facetIds,
    updatedAt: new Date(rule.updatedAt),
  };
}

const ruleColumns: FilterColumns<ReturnType<typeof publicRule>> = {
  id: { types: ["stringOptions"], value: (row) => row.id },
  name: { types: ["string", "stringOptions"], value: (row) => row.name },
};

/** Lists the project's Topics rules; each keeps its own live topic map. */
export async function listPublicTopicRules(params: {
  projectId: string;
  filter?: FilterState;
  page: number;
  limit: number;
}) {
  assertTopicsApiAvailable(params.projectId);
  const rules = (await listTopicRules(params.projectId)).map(publicRule);
  return paginate(
    applyFilter(rules, params.filter, ruleColumns),
    params.page,
    params.limit,
  );
}

export async function getPublicTopicRule(params: {
  projectId: string;
  ruleId: string;
}) {
  assertTopicsApiAvailable(params.projectId);
  const rule = await getTopicRule(params.projectId, params.ruleId);
  if (!rule) throw new LangfuseNotFoundError("Topics rule not found.");
  return publicRule(rule);
}

/** Lists facets; only active facets unless the filter names `active`. */
export async function listPublicTopicFacets(params: {
  projectId: string;
  filter?: FilterState;
  page: number;
  limit: number;
}) {
  assertTopicsApiAvailable(params.projectId);
  const facets = applyFilter(
    await loadPublicFacets(params.projectId),
    hasActiveCondition(params.filter)
      ? params.filter
      : [
          ...(params.filter ?? []),
          { type: "boolean", column: "active", operator: "=", value: true },
        ],
    facetColumns,
  );
  return paginate(facets, params.page, params.limit);
}

export async function getPublicTopicFacet(params: {
  projectId: string;
  facetId: string;
}) {
  assertTopicsApiAvailable(params.projectId);
  const facet = (await loadPublicFacets(params.projectId)).find(
    ({ id }) => id === params.facetId,
  );
  if (!facet) throw new LangfuseNotFoundError("Facet not found.");
  return facet;
}

const facetSummaryColumns: FilterColumns<{
  facet: { id: string; name: string };
  ruleId: string | null;
}> = {
  facetId: { types: ["stringOptions"], value: (row) => row.facet.id },
  facetName: {
    types: ["string", "stringOptions"],
    value: (row) => row.facet.name,
  },
  ruleId: { types: ["stringOptions"], value: (row) => row.ruleId },
};

async function loadPublicTopics(
  projectId: string,
  window: TopicTimeRange,
  facetFilter?: FilterState,
) {
  const [facets, scope] = await Promise.all([
    listTopicFacets(projectId),
    loadRuleScope(projectId),
  ]);
  const ruleIdOf = (facetId: string) => scope.ruleIdsFor(facetId)[0] ?? null;
  const facetIds = applyFilter(
    facets
      .filter(({ id }) => scope.isActive(id))
      .map(({ id, name }) => ({ facet: { id, name }, ruleId: ruleIdOf(id) })),
    facetFilter,
    facetSummaryColumns,
  ).map(({ facet }) => facet.id);
  const results = await currentTopicResults(projectId, window, { facetIds });
  return results.facets.map((facet) => {
    const ref = {
      id: facet.facetId,
      name: facet.name,
      version: facet.facetVersion ?? 0,
    };
    const ruleId = ruleIdOf(facet.facetId);
    const traceCounts = new Map(facet.topics.map((topic) => [topic.id, topic]));
    const current = (facet.map?.topics ?? []).map((topic) => ({
      id: topic.id,
      versionId: topic.versionId,
      name: topic.name,
      description: topic.description,
      facet: ref,
      ruleId,
      runId: topic.runId,
      traceCount: traceCounts.get(topic.id)?.count ?? 0,
    }));
    const { total: _total, ...counts } = facet.counts;
    return {
      summary: {
        facet: ref,
        ruleId,
        publishedRunId: facet.map?.runId ?? null,
        counts,
      },
      current,
    };
  });
}

type PublicTopic = Awaited<
  ReturnType<typeof loadPublicTopics>
>[number]["current"][number];

const topicColumns: FilterColumns<PublicTopic> = {
  ...facetSummaryColumns,
  id: { types: ["stringOptions"], value: (row) => row.id },
  name: { types: ["string", "stringOptions"], value: (row) => row.name },
};

const topicOrder = {
  "traceCount.desc": (a: PublicTopic, b: PublicTopic) =>
    b.traceCount - a.traceCount || a.name.localeCompare(b.name),
  "traceCount.asc": (a: PublicTopic, b: PublicTopic) =>
    a.traceCount - b.traceCount || a.name.localeCompare(b.name),
  "name.asc": (a: PublicTopic, b: PublicTopic) => a.name.localeCompare(b.name),
  "name.desc": (a: PublicTopic, b: PublicTopic) => b.name.localeCompare(a.name),
};

/** Lists the topics of each active facet's current map; retired topics are not listed. */
export async function listPublicTopics(params: {
  projectId: string;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  filter?: FilterState;
  orderBy: keyof typeof topicOrder;
  page: number;
  limit: number;
}) {
  assertTopicsApiAvailable(params.projectId);
  const window = resolveWindow(params.fromTimestamp, params.toTimestamp);
  const facets = await loadPublicTopics(
    params.projectId,
    window,
    params.filter?.filter(({ column }) =>
      Object.hasOwn(facetSummaryColumns, column),
    ),
  );
  const topics = applyFilter(
    facets.flatMap(({ current }) => current),
    params.filter,
    topicColumns,
  ).sort(topicOrder[params.orderBy]);
  return {
    window,
    facets: facets.map(({ summary }) => summary),
    ...paginate(topics, params.page, params.limit),
  };
}

const TOPIC_RESULT_FILTER_LIMITS = {
  conditions: 20,
  values: 1000,
  // Each trace id reads its own granules; 100 keeps a lookup near one page's cost.
  traceIds: 100,
  stringLength: 1000,
};
// Result lists read per-trace rows; keep their window shorter than the Topics counts'.
const RESULT_MAX_WINDOW_MS = 30 * 86_400_000;

const SUMMARY_COLUMNS = {
  traceId: ["stringOptions"],
  facetId: ["stringOptions"],
  facetName: ["stringOptions"],
  ruleId: ["stringOptions"],
  environment: ["stringOptions"],
  timestamp: ["datetime"],
  processedAt: ["datetime"],
  state: ["stringOptions"],
  topicId: ["stringOptions"],
  topicName: ["stringOptions"],
  assignmentStatus: ["stringOptions"],
} satisfies Record<string, FilterType[]>;

const ASSIGNMENT_COLUMNS = {
  traceId: ["stringOptions"],
  facetId: ["stringOptions"],
  facetName: ["stringOptions"],
  ruleId: ["stringOptions"],
  environment: ["stringOptions"],
  timestamp: ["datetime"],
  topicId: ["stringOptions"],
  topicName: ["stringOptions"],
  status: ["stringOptions"],
} satisfies Record<string, FilterType[]>;

function checkFilterLimits(filter: FilterState) {
  if (filter.length > TOPIC_RESULT_FILTER_LIMITS.conditions)
    throw createStructuredPublicApiError({
      httpCode: 400,
      code: "invalid_query",
      message: `At most ${TOPIC_RESULT_FILTER_LIMITS.conditions} filter conditions are allowed.`,
    });
  for (const condition of filter) {
    const values = Array.isArray(condition.value)
      ? condition.value
      : [condition.value];
    if (
      condition.column === "traceId" &&
      values.length > TOPIC_RESULT_FILTER_LIMITS.traceIds
    )
      throw createStructuredPublicApiError({
        httpCode: 400,
        code: "invalid_query",
        message: `Filter "traceId" allows at most ${TOPIC_RESULT_FILTER_LIMITS.traceIds} trace ids.`,
        details: { column: condition.column },
      });
    if (
      values.length > TOPIC_RESULT_FILTER_LIMITS.values ||
      values.some(
        (value) =>
          typeof value === "string" &&
          value.length > TOPIC_RESULT_FILTER_LIMITS.stringLength,
      )
    )
      throw createStructuredPublicApiError({
        httpCode: 400,
        code: "invalid_query",
        message: `Filter "${condition.column}" allows at most ${TOPIC_RESULT_FILTER_LIMITS.values} values of up to ${TOPIC_RESULT_FILTER_LIMITS.stringLength} characters.`,
        details: { column: condition.column },
      });
  }
}

/** Published map topics per facet, for resolving topic names. */
async function publishedTopicsByFacet(projectId: string, facets: TopicFacet[]) {
  const runs = await Promise.all(
    facets.map((facet) => getPublishedTopicRun(projectId, facet.id)),
  );
  return new Map(
    facets.map((facet, index) => [facet.id, runs[index]?.topics ?? []]),
  );
}

function checkValues<T extends string>(
  column: string,
  values: string[],
  allowed: readonly T[],
): T[] {
  const invalid = values.find((value) => !allowed.includes(value as T));
  if (invalid !== undefined || values.length === 0)
    throw invalidFilter(`Unknown ${column} value "${invalid ?? ""}".`, column, [
      ...allowed,
    ]);
  return values as T[];
}

/**
 * Translates the public filter into reader conditions and the facets to scan.
 * Facet and rule conditions narrow the scanned facets; a topic id filter scans
 * only the facets whose published map has the ids. Returns `null` when the
 * filter can match nothing (no facet left, or an unknown topic name in `any of`).
 */
async function topicResultQuery(params: {
  projectId: string;
  filter: FilterState;
  columns: Record<string, FilterType[]>;
  facets: TopicFacet[];
  scope: RuleScope;
}): Promise<{ conditions: TopicResultCondition[]; facetIds: string[] } | null> {
  let facetIds = params.facets
    .filter(({ id }) => params.scope.isActive(id))
    .map(({ id }) => id);
  const narrow = (ids: string[], operator: "any of" | "none of") => {
    const set = new Set(ids);
    facetIds = facetIds.filter((id) =>
      operator === "any of" ? set.has(id) : !set.has(id),
    );
  };
  const conditions: TopicResultCondition[] = [];
  let topicsPromise: Promise<Map<string, TopicDefinition[]>> | undefined;
  const publishedTopics = () => {
    if (!topicsPromise)
      topicsPromise = publishedTopicsByFacet(params.projectId, params.facets);
    return topicsPromise;
  };
  const topicOwners = async (topicIds: string[]) => {
    const owners = new Map(
      [...(await publishedTopics())].flatMap(([facetId, definitions]) =>
        definitions.map((topic) => [topic.topicId, facetId] as const),
      ),
    );
    return topicIds.every((id) => owners.has(id))
      ? topicIds.flatMap((id) => owners.get(id) ?? [])
      : null;
  };

  for (const condition of params.filter) {
    const types = Object.hasOwn(params.columns, condition.column)
      ? params.columns[condition.column]
      : undefined;
    if (!types)
      throw invalidFilter(
        `Unknown filter column "${condition.column}".`,
        condition.column,
        Object.keys(params.columns),
      );
    if (!types.includes(condition.type))
      throw invalidFilter(
        `Filter column "${condition.column}" does not support type "${condition.type}".`,
        condition.column,
        types,
      );
    const column = condition.column;

    if (condition.type === "datetime") {
      conditions.push({
        column: column as "timestamp" | "processedAt",
        match: { operator: condition.operator, value: condition.value },
      });
      continue;
    }
    if (condition.type !== "stringOptions") continue;
    const { operator, value: values } = condition;

    switch (column) {
      case "facetId":
        narrow(values, operator);
        break;
      case "facetName": {
        const names = new Set(values.map((name) => name.toLowerCase()));
        narrow(
          params.facets
            .filter(({ name }) => names.has(name.toLowerCase()))
            .map(({ id }) => id),
          operator,
        );
        break;
      }
      case "ruleId":
        narrow(
          params.facets
            .filter(({ id }) =>
              params.scope
                .ruleIdsFor(id)
                .some((ruleId) => values.includes(ruleId)),
            )
            .map(({ id }) => id),
          operator,
        );
        break;
      case "state":
        conditions.push({
          column: "state",
          match: {
            operator,
            values: checkValues(column, values, TOPIC_SUMMARY_STATES),
          },
        });
        break;
      case "status":
      case "assignmentStatus": {
        if (operator !== "any of")
          throw invalidFilter(
            `Filter column "${column}" supports only "any of".`,
            column,
            ["any of"],
          );
        const allowed =
          column === "status"
            ? (["assigned", "outlier"] as const)
            : TOPIC_ASSIGNMENT_STATUSES;
        conditions.push({
          column: "assignmentStatus",
          match: { operator, values: checkValues(column, values, allowed) },
        });
        break;
      }
      case "topicName": {
        const names = new Set(values.map((name) => name.toLowerCase()));
        const topicIds = [...(await publishedTopics()).values()]
          .flat()
          .filter((topic) => names.has(topic.name.toLowerCase()))
          .map((topic) => topic.topicId);
        if (topicIds.length === 0) {
          if (operator === "any of") return null;
          break;
        }
        if (operator === "any of")
          narrow((await topicOwners(topicIds)) ?? facetIds, operator);
        conditions.push({
          column: "topicId",
          match: { operator, values: [...new Set(topicIds)] },
        });
        break;
      }
      case "topicId": {
        if (operator === "any of")
          narrow((await topicOwners(values)) ?? facetIds, operator);
        conditions.push({ column: "topicId", match: { operator, values } });
        break;
      }
      case "traceId":
      case "environment":
        conditions.push({ column, match: { operator, values } });
        break;
    }
  }
  return facetIds.length > 0 ? { conditions, facetIds } : null;
}

/**
 * Without an explicit window, a `traceId` `any of` lookup reads the traces'
 * own source time within the longest window, as the trace page does.
 */
async function resultsWindow(params: ResultListParams) {
  const requested = resolveWindow(
    params.fromTimestamp,
    params.toTimestamp,
    RESULT_MAX_WINDOW_MS,
  );
  // The plan's data-access window floors every read, like the other list endpoints.
  const floor = (from: Date) =>
    clampToDataAccessDays({ plan: params.plan, fromTimestamp: from })
      .effectiveFromTimestamp ?? from;
  const window = { from: floor(requested.from), to: requested.to };
  if (params.fromTimestamp || params.toTimestamp) return window;
  const traceIds = params.filter?.find(
    (condition) =>
      condition.column === "traceId" &&
      condition.type === "stringOptions" &&
      condition.operator === "any of",
  )?.value;
  if (!Array.isArray(traceIds) || traceIds.length === 0) return window;
  const traceRange = await getTopicTraceUnitTimeRange(
    params.projectId,
    traceIds.map(String),
    {
      from: floor(new Date(window.to.getTime() - TOPICS_MAX_TIME_RANGE_MS)),
      to: window.to,
    },
  );
  return traceRange ?? window;
}

type ResultListParams = {
  projectId: string;
  plan: Plan | null;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  filter?: FilterState;
  orderBy: "timestamp.desc" | "timestamp.asc";
  limit: number;
  cursor?: TopicResultCursor;
};

async function prepareResultList(
  params: ResultListParams,
  columns: Record<string, FilterType[]>,
) {
  assertTopicsApiAvailable(params.projectId);
  // Before any read, so rejected filters never reach ClickHouse.
  checkFilterLimits(params.filter ?? []);
  const [facets, scope] = await Promise.all([
    listTopicFacets(params.projectId),
    loadRuleScope(params.projectId),
  ]);
  const [query, window] = await Promise.all([
    topicResultQuery({
      projectId: params.projectId,
      filter: params.filter ?? [],
      columns,
      facets,
      scope,
    }),
    resultsWindow(params),
  ]);
  return {
    facets: new Map(facets.map((facet) => [facet.id, facet])),
    scope,
    window,
    readerInput: query &&
      window.from < window.to && {
        projectId: params.projectId,
        window,
        facetIds: query.facetIds,
        conditions: query.conditions,
        orderBy: params.orderBy,
        limit: params.limit,
        cursor: params.cursor,
      },
  };
}

const resultMeta = (next?: TopicResultCursor, rows = 0, limit = 0) => ({
  cursor: next ? encodeTopicResultCursor(next) : null,
  ...(next && rows < limit
    ? {
        comment:
          "This page is shorter than limit because the scan budget ran out; it does not indicate completion. Continue with meta.cursor.",
      }
    : {}),
});

/** Lists the current summary per trace and facet; filtering and pagination run in ClickHouse. */
export async function listPublicTopicSummaries(
  params: ResultListParams & { truncateSummaries: boolean },
) {
  const { facets, window, readerInput } = await prepareResultList(
    params,
    SUMMARY_COLUMNS,
  );
  if (!readerInput) return { window, data: [], meta: resultMeta() };
  const result = await listCurrentTopicSummaries({
    ...readerInput,
    truncateSummaries: params.truncateSummaries,
  });
  return {
    window,
    data: result.rows.map((row) => ({
      traceId: row.traceId,
      traceName: row.traceName,
      environment: row.environment,
      timestamp: row.timestamp,
      facetId: row.facetId,
      facetName: facets.get(row.facetId)?.name ?? "",
      facetVersion: row.facetVersion,
      state: row.state,
      summary: row.state === "complete" ? row.summary : null,
      summaryTruncated: row.summaryTruncated,
      processedAt: row.processedAt,
    })),
    meta: resultMeta(result.next, result.rows.length, params.limit),
  };
}

/** Topic names by version id, from the runs that assigned them and the current maps. */
async function topicNamesForAssignments(
  projectId: string,
  facets: TopicFacet[],
  rows: TopicAssignmentRow[],
) {
  const runIds = [
    ...new Set(rows.flatMap(({ runId }) => (runId ? [runId] : []))),
  ];
  const [runs, published] = await Promise.all([
    getTopicRuns(projectId, runIds),
    rows.some(({ topicVersionId, runId }) => topicVersionId && !runId)
      ? publishedTopicsByFacet(projectId, facets)
      : Promise.resolve(new Map<string, TopicDefinition[]>()),
  ]);
  return new Map(
    [
      ...runs.flatMap(({ topics }) => topics),
      ...[...published.values()].flat(),
    ].map((topic) => [topic.topicVersionId, topic.name]),
  );
}

/** Lists the current assignment (assigned or outlier) per trace, facet and rule. */
export async function listPublicTopicAssignments(params: ResultListParams) {
  const { facets, scope, window, readerInput } = await prepareResultList(
    params,
    ASSIGNMENT_COLUMNS,
  );
  if (!readerInput) return { window, data: [], meta: resultMeta() };
  const result = await listCurrentTopicAssignments(readerInput);
  const names = await topicNamesForAssignments(
    params.projectId,
    [...facets.values()],
    result.rows,
  );
  return {
    window,
    data: result.rows.map((row) => ({
      traceId: row.traceId,
      timestamp: row.timestamp,
      facetId: row.facetId,
      facetName: facets.get(row.facetId)?.name ?? "",
      facetVersion: row.facetVersion,
      ruleId: scope.ruleIdsFor(row.facetId)[0] ?? null,
      status: row.status,
      topic:
        row.topicId && row.topicVersionId
          ? {
              id: row.topicId,
              versionId: row.topicVersionId,
              name: names.get(row.topicVersionId) ?? "Unavailable topic",
            }
          : null,
      runId: row.runId,
      assignedAt: row.assignedAt,
    })),
    meta: resultMeta(result.next, result.rows.length, params.limit),
  };
}

/** Resolves a topic of an active facet's current map; retired topics are not found. */
export async function getPublicTopic(params: {
  projectId: string;
  topicId: string;
  fromTimestamp?: Date;
  toTimestamp?: Date;
}) {
  assertTopicsApiAvailable(params.projectId);
  const window = resolveWindow(params.fromTimestamp, params.toTimestamp);
  for (const facet of await loadPublicTopics(params.projectId, window)) {
    const current = facet.current.find(({ id }) => id === params.topicId);
    if (current) return { ...current, inCurrentMap: true, window };
  }
  throw new LangfuseNotFoundError("Topic not found.");
}
