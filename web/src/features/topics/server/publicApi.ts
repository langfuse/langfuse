import { LangfuseNotFoundError, type FilterState } from "@langfuse/shared";
import { InMemoryFilterService } from "@langfuse/shared/src/server";
import {
  TOPICS_MAX_TIME_RANGE_MS,
  type TopicFacet,
  type TopicRun,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import {
  getPublishedTopicRun,
  isTopicsProjectEnabled,
  listTopicFacets,
  listTopicRules,
} from "@langfuse/shared/topics/server";
import { createStructuredPublicApiError } from "@/src/features/public-api/types/structuredPublicApiError";
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
