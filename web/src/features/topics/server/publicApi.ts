import { LangfuseNotFoundError, type FilterState } from "@langfuse/shared";
import {
  InMemoryFilterService,
  listCurrentTopicTraces,
  TOPIC_TRACE_STATUSES,
  type TopicTraceCondition,
  type TopicTraceFacetResult,
  type TopicTraceStatus,
} from "@langfuse/shared/src/server";
import {
  TOPICS_MAX_TIME_RANGE_MS,
  type TopicDefinition,
  type TopicFacet,
  type TopicRun,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import {
  getPublishedTopicRun,
  getTopicRuns,
  isTopicsProjectEnabled,
  listTopicFacets,
  listTopicRules,
} from "@langfuse/shared/topics/server";
import { createStructuredPublicApiError } from "@/src/features/public-api/types/structuredPublicApiError";
import { encodeTopicTraceCursor } from "@/src/features/public-api/types/unstable-topics";
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

function resolveWindow(from?: Date, to?: Date): TopicTimeRange {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - DEFAULT_WINDOW_MS);
  if (
    start >= end ||
    end.getTime() - start.getTime() > TOPICS_MAX_TIME_RANGE_MS
  )
    throw createStructuredPublicApiError({
      httpCode: 400,
      code: "invalid_query",
      message:
        "fromTimestamp must be before toTimestamp, and the window can span at most 93 days.",
    });
  return { from: start, to: end };
}

// Matches currentTopicResults: the latest rule's facets, or all facets without a rule (manual runs).
async function isFacetActive(projectId: string) {
  const [rule] = await listTopicRules(projectId);
  return (facetId: string) => !rule || rule.facetIds.includes(facetId);
}

function publicFacet(facet: TopicFacet, active: boolean, run: TopicRun | null) {
  const version = facet.versions[0];
  return {
    id: facet.id,
    name: facet.name,
    description: facet.description,
    isBuiltIn: facet.isBuiltIn,
    active,
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
  const [facets, isActive] = await Promise.all([
    listTopicFacets(projectId),
    isFacetActive(projectId),
  ]);
  return Promise.all(
    facets.map(async (facet) =>
      publicFacet(
        facet,
        isActive(facet.id),
        await getPublishedTopicRun(projectId, facet.id),
      ),
    ),
  );
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
}> = {
  facetId: { types: ["stringOptions"], value: (row) => row.facet.id },
  facetName: {
    types: ["string", "stringOptions"],
    value: (row) => row.facet.name,
  },
};

async function loadPublicTopics(
  projectId: string,
  window: TopicTimeRange,
  facetFilter?: FilterState,
) {
  const [facets, isActive] = await Promise.all([
    listTopicFacets(projectId),
    isFacetActive(projectId),
  ]);
  const facetIds = applyFilter(
    facets
      .filter(({ id }) => isActive(id))
      .map(({ id, name }) => ({ facet: { id, name } })),
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
    const traceCounts = new Map(facet.topics.map((topic) => [topic.id, topic]));
    const current = (facet.map?.topics ?? []).map((topic) => ({
      id: topic.id,
      versionId: topic.versionId,
      name: topic.name,
      description: topic.description,
      facet: ref,
      runId: topic.runId,
      traceCount: traceCounts.get(topic.id)?.count ?? 0,
    }));
    const currentIds = new Set(current.map(({ id }) => id));
    const retired = facet.topics
      .filter((topic) => !currentIds.has(topic.id))
      .map((topic) => ({
        id: topic.id,
        versionId: topic.versionId,
        name: topic.name,
        description: topic.description,
        facet: ref,
        runId: topic.runId,
        traceCount: topic.count,
      }));
    const count = (outcome: string) =>
      facet.rows.filter((row) => row.outcome === outcome).length;
    return {
      summary: {
        facet: ref,
        publishedRunId: facet.map?.runId ?? null,
        counts: {
          assigned: count("assigned"),
          outlier: count("outlier"),
          awaitingMap: count("awaiting_map"),
          notApplicable: count("not_applicable"),
          insufficientInput: count("insufficient_input"),
        },
      },
      current,
      retired,
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

const TOPIC_TRACE_FILTER_LIMITS = {
  conditions: 20,
  values: 1000,
  stringLength: 1000,
};

const topicTraceColumns = {
  traceId: ["stringOptions"],
  traceName: ["string", "stringOptions"],
  environment: ["stringOptions"],
  sessionId: ["string", "stringOptions"],
  userId: ["stringOptions"],
  timestamp: ["datetime"],
  processedAt: ["datetime"],
  topicId: ["stringOptions"],
  topicName: ["stringOptions", "categoryOptions"],
  topicStatus: ["categoryOptions"],
  summary: ["stringObject"],
  facetVersion: ["numberObject"],
} satisfies Record<string, FilterType[]>;

const STRING_MATCH_OPERATORS = [
  "=",
  "contains",
  "does not contain",
  "starts with",
  "ends with",
] as const;

type FacetLookup = {
  facets: TopicFacet[];
  find: (value: string) => TopicFacet | undefined;
  choices: string[];
};

function facetLookup(facets: TopicFacet[]): FacetLookup {
  return {
    facets,
    find: (value) =>
      facets.find(({ id }) => id === value) ??
      facets.find(({ name }) => name.toLowerCase() === value.toLowerCase()),
    choices: facets.flatMap(({ id, name }) => [id, name]),
  };
}

function checkFilterLimits(filter: FilterState) {
  if (filter.length > TOPIC_TRACE_FILTER_LIMITS.conditions)
    throw createStructuredPublicApiError({
      httpCode: 400,
      code: "invalid_query",
      message: `At most ${TOPIC_TRACE_FILTER_LIMITS.conditions} filter conditions are allowed.`,
    });
  for (const condition of filter) {
    const values = Array.isArray(condition.value)
      ? condition.value
      : [condition.value];
    if (
      values.length > TOPIC_TRACE_FILTER_LIMITS.values ||
      values.some(
        (value) =>
          typeof value === "string" &&
          value.length > TOPIC_TRACE_FILTER_LIMITS.stringLength,
      )
    )
      throw createStructuredPublicApiError({
        httpCode: 400,
        code: "invalid_query",
        message: `Filter "${condition.column}" allows at most ${TOPIC_TRACE_FILTER_LIMITS.values} values of up to ${TOPIC_TRACE_FILTER_LIMITS.stringLength} characters.`,
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

/**
 * Translates the public filter into reader conditions. Returns `null` when a
 * condition can match nothing (an unknown topic name in `any of`).
 */
async function topicTraceConditions(
  projectId: string,
  filter: FilterState,
  lookup: FacetLookup,
): Promise<{ conditions: TopicTraceCondition[]; facetIds: string[] } | null> {
  checkFilterLimits(filter);
  const conditions: TopicTraceCondition[] = [];
  const facetIds = new Set<string>();
  const facetFor = (column: string, key: string) => {
    const facet = lookup.find(key);
    if (!facet)
      throw invalidFilter(
        `Unknown facet "${key}" in filter "${column}".`,
        column,
        lookup.choices,
      );
    facetIds.add(facet.id);
    return facet.id;
  };
  const stringMatch = (column: string, operator: string, value: string) => {
    const match = STRING_MATCH_OPERATORS.find((item) => item === operator);
    if (!match)
      throw invalidFilter(
        `Filter column "${column}" does not support operator "${operator}".`,
        column,
        [...STRING_MATCH_OPERATORS],
      );
    return { operator: match, value };
  };
  let topics: Map<string, TopicDefinition[]> | undefined;

  for (const condition of filter) {
    const column = Object.hasOwn(topicTraceColumns, condition.column)
      ? (condition.column as keyof typeof topicTraceColumns)
      : undefined;
    if (!column)
      throw invalidFilter(
        `Unknown filter column "${condition.column}".`,
        condition.column,
        Object.keys(topicTraceColumns),
      );
    const types: FilterType[] = topicTraceColumns[column];
    if (!types.includes(condition.type))
      throw invalidFilter(
        `Filter column "${column}" does not support type "${condition.type}".`,
        column,
        types,
      );

    if (column === "topicName") {
      if (
        condition.type !== "stringOptions" &&
        condition.type !== "categoryOptions"
      )
        continue;
      const facetId =
        condition.type === "categoryOptions"
          ? facetFor(column, condition.key)
          : undefined;
      if (!topics)
        topics = await publishedTopicsByFacet(projectId, lookup.facets);
      const names = new Set(condition.value.map((name) => name.toLowerCase()));
      const topicIds = [
        ...new Set(
          [...topics]
            .filter(([id]) => !facetId || id === facetId)
            .flatMap(([, definitions]) => definitions)
            .filter((topic) => names.has(topic.name.toLowerCase()))
            .map((topic) => topic.topicId),
        ),
      ];
      if (topicIds.length === 0) {
        if (condition.operator === "any of") return null;
        continue;
      }
      conditions.push({
        column: "topicId",
        facetId,
        match: { operator: condition.operator, values: topicIds },
      });
      continue;
    }

    switch (condition.type) {
      case "stringOptions":
        conditions.push({
          column,
          match: { operator: condition.operator, values: condition.value },
        } as TopicTraceCondition);
        break;
      case "string":
        conditions.push({
          column,
          match: stringMatch(column, condition.operator, condition.value),
        } as TopicTraceCondition);
        break;
      case "datetime":
        conditions.push({
          column,
          match: { operator: condition.operator, value: condition.value },
        } as TopicTraceCondition);
        break;
      case "numberObject":
        conditions.push({
          column: "facetVersion",
          facetId: facetFor(column, condition.key),
          match: { operator: condition.operator, value: condition.value },
        });
        break;
      case "stringObject":
        conditions.push({
          column: "summary",
          facetId: facetFor(column, condition.key),
          match:
            condition.operator === "is set" ||
            condition.operator === "is not set"
              ? { operator: condition.operator }
              : stringMatch(column, condition.operator, condition.value),
        });
        break;
      case "categoryOptions": {
        const invalid = condition.value.filter(
          (value) => !TOPIC_TRACE_STATUSES.includes(value as TopicTraceStatus),
        );
        if (invalid.length || condition.value.length === 0)
          throw invalidFilter(
            `Unknown topicStatus value "${invalid[0] ?? ""}".`,
            column,
            [...TOPIC_TRACE_STATUSES],
          );
        conditions.push({
          column: "topicStatus",
          facetId: facetFor(column, condition.key),
          match: {
            operator: condition.operator,
            values: condition.value as TopicTraceStatus[],
          },
        });
        break;
      }
    }
  }
  return { conditions, facetIds: [...facetIds] };
}

function publicTopicTraceFacet(
  facet: TopicFacet,
  result: TopicTraceFacetResult | undefined,
  topicNames: Map<string, string>,
) {
  if (!result)
    return {
      facetId: facet.id,
      facetName: facet.name,
      facetVersion: null,
      state: "not_processed" as const,
      summary: null,
      summaryTruncated: false,
      processedAt: null,
      assignment: null,
    };
  const complete =
    result.status === "assigned" ||
    result.status === "outlier" ||
    result.status === "awaiting_map";
  return {
    facetId: facet.id,
    facetName: facet.name,
    facetVersion: result.facetVersion,
    state: complete
      ? ("complete" as const)
      : (result.status as "not_applicable" | "insufficient_input"),
    summary: complete ? result.summary : null,
    summaryTruncated: complete && result.summaryTruncated,
    processedAt: result.processedAt,
    assignment: complete
      ? {
          status: result.status as "assigned" | "outlier" | "awaiting_map",
          topic:
            result.status === "assigned" &&
            result.topicId &&
            result.topicVersionId
              ? {
                  id: result.topicId,
                  versionId: result.topicVersionId,
                  name:
                    topicNames.get(result.topicVersionId) ??
                    "Unavailable topic",
                }
              : null,
        }
      : null,
  };
}

/** Topic names by version id, from the runs that assigned them and the current maps. */
async function topicNamesForResults(
  projectId: string,
  facets: TopicFacet[],
  results: TopicTraceFacetResult[],
) {
  const runIds = [
    ...new Set(results.flatMap(({ runId }) => (runId ? [runId] : []))),
  ];
  const [runs, published] = await Promise.all([
    getTopicRuns(projectId, runIds),
    results.some(({ topicVersionId, runId }) => topicVersionId && !runId)
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

/** Lists traces with each projected facet's current result; filtering and pagination run in ClickHouse. */
export async function listPublicTopicTraces(params: {
  projectId: string;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  filter?: FilterState;
  facets?: string[];
  includeTotal: boolean;
  truncateSummaries: boolean;
  orderBy: "timestamp.desc" | "timestamp.asc";
  limit: number;
  cursor?: { timestamp: Date; traceId: string };
}) {
  assertTopicsApiAvailable(params.projectId);
  const window = resolveWindow(params.fromTimestamp, params.toTimestamp);
  const [facets, isActive] = await Promise.all([
    listTopicFacets(params.projectId),
    isFacetActive(params.projectId),
  ]);
  const lookup = facetLookup(facets);
  const projectedIds = new Set(
    params.facets
      ? params.facets.map((value) => {
          const facet = lookup.find(value);
          if (!facet)
            throw invalidFilter(
              `Unknown facet "${value}".`,
              "facets",
              lookup.choices,
            );
          return facet.id;
        })
      : facets.filter(({ id }) => isActive(id)).map(({ id }) => id),
  );
  const projected = facets.filter(({ id }) => projectedIds.has(id));
  const translated = await topicTraceConditions(
    params.projectId,
    params.filter ?? [],
    lookup,
  );
  if (!translated)
    return {
      window,
      data: [],
      meta: { cursor: null, ...(params.includeTotal ? { totalItems: 0 } : {}) },
    };

  const result = await listCurrentTopicTraces({
    projectId: params.projectId,
    window,
    facetIds: [...new Set([...projectedIds, ...translated.facetIds])],
    projectedFacetIds: [...projectedIds],
    conditions: translated.conditions,
    orderBy: params.orderBy,
    limit: params.limit,
    cursor: params.cursor,
    includeTotal: params.includeTotal,
    truncateSummaries: params.truncateSummaries,
  });
  const topicNames = await topicNamesForResults(
    params.projectId,
    projected,
    result.rows.flatMap(({ results }) => results),
  );
  return {
    window,
    data: result.rows.map((row) => ({
      traceId: row.traceId,
      traceName: row.traceName,
      environment: row.environment,
      timestamp: row.timestamp,
      traceUrl: `/project/${params.projectId}/traces/${encodeURIComponent(row.traceId)}`,
      processedAt: row.processedAt,
      facets: projected.map((facet) =>
        publicTopicTraceFacet(
          facet,
          row.results.find(({ facetId }) => facetId === facet.id),
          topicNames,
        ),
      ),
    })),
    meta: {
      cursor: result.next ? encodeTopicTraceCursor(result.next) : null,
      ...(result.total !== undefined ? { totalItems: result.total } : {}),
    },
  };
}

/**
 * Resolves a topic of an active facet's current map, or a retired topic that
 * still has current traces in the window.
 */
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
    const retired = facet.retired.find(({ id }) => id === params.topicId);
    if (retired) return { ...retired, inCurrentMap: false, window };
  }
  throw new LangfuseNotFoundError("Topic not found.");
}
