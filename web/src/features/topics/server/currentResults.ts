import {
  TOPICS_MAX_TIME_RANGE_MS,
  topicTimeRangeSchema,
  type TopicRun,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import {
  getTopicResultCounts,
  listCurrentTopicSummaries,
  OBSERVATIONS_TO_TRACE_INTERVAL_DAYS,
  type TopicAssignmentStatus,
  type TopicResultCondition,
  type TopicResultCursor,
  type TopicSummaryState,
} from "@langfuse/shared/src/server";
import {
  getPublishedTopicRun,
  getTopicTraceUnitTimeRange,
  hasStoredTopicSummaries,
  listTopicFacets,
  listTopicRules,
} from "@langfuse/shared/topics/server";

/** Facets the page shows: only those enabled on the project's rule get tabs; without a rule, all. */
async function enabledTopicFacets(projectId: string) {
  const facets = await listTopicFacets(projectId);
  const hasStoredSummaries =
    facets.length > 0 && (await hasStoredTopicSummaries(projectId));
  if (!hasStoredSummaries) return { hasStoredSummaries, facets: [] };
  const [rule] = await listTopicRules(projectId);
  return {
    hasStoredSummaries,
    facets: facets.filter((facet) => !rule || rule.facetIds.includes(facet.id)),
  };
}

const DEFAULT_RESULT_WINDOW_MS = 7 * 86_400_000;

/**
 * The Topics page window of a facet: from its published map's clustering
 * cohort to now, so the page follows the latest map instead of a time filter.
 * Without a map, the last 7 days.
 */
function facetResultWindow(
  run: TopicRun | null,
  to = new Date(),
): TopicTimeRange {
  const cohort = topicTimeRangeSchema.safeParse(run?.config.timeRange);
  const from = cohort.success
    ? Math.max(
        cohort.data.from.getTime(),
        to.getTime() - TOPICS_MAX_TIME_RANGE_MS,
      )
    : to.getTime() - DEFAULT_RESULT_WINDOW_MS;
  return { from: new Date(from), to };
}

/**
 * Topic and status counts per enabled facet, aggregated in ClickHouse. Without
 * an explicit window, each facet uses its published map's window. Traces
 * themselves are paged by `listTopicTraces`.
 */
export async function currentTopicResults(
  projectId: string,
  timeRange?: TopicTimeRange,
  { facetIds }: { facetIds?: string[] } = {},
) {
  const { hasStoredSummaries, facets } = await enabledTopicFacets(projectId);
  const enabled = facets.filter(
    (facet) => !facetIds || facetIds.includes(facet.id),
  );
  const runs = await Promise.all(
    enabled.map((facet) => getPublishedTopicRun(projectId, facet.id)),
  );
  const now = new Date();
  const windows = runs.map((run) => timeRange ?? facetResultWindow(run, now));
  // Facets whose maps share a cohort window share one count query.
  const groups = new Map<string, number[]>();
  windows.forEach((window, index) => {
    const key = `${window.from.getTime()}:${window.to.getTime()}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  const countsByFacet = new Map(
    (
      await Promise.all(
        [...groups.values()].map((indices) =>
          getTopicResultCounts({
            projectId,
            window: windows[indices[0]],
            facets: indices.map((index) => ({
              facetId: enabled[index].id,
              version: enabled[index].versions[0]?.version ?? null,
              runId: runs[index]?.id ?? null,
            })),
          }),
        ),
      )
    )
      .flat()
      .map((count) => [count.facetId, count]),
  );
  return {
    hasStoredSummaries,
    facets: enabled.map((facet, index) => {
      const count = countsByFacet.get(facet.id)!;
      const run = runs[index];
      const current = new Map(
        run?.topics.map((topic) => [topic.topicId, topic]),
      );
      const topics = count.topics.flatMap((topic) => {
        const definition = current.get(topic.topicId);
        return definition
          ? [
              {
                id: topic.topicId,
                versionId: definition.topicVersionId,
                runId: definition.createdByRunId,
                name: definition.name,
                description: definition.description,
                count: topic.count,
              },
            ]
          : [];
      });
      return {
        facetId: facet.id,
        name: facet.name,
        facetVersion: facet.versions[0]?.version ?? null,
        window: windows[index],
        usableCount: count.usable,
        awaitingCount: count.awaiting,
        counts: {
          total: count.total,
          assigned: count.assigned,
          outlier: count.outliers,
          awaitingMap: count.awaiting,
          notApplicable: count.notApplicable,
          insufficientInput: count.insufficientInput,
        },
        topics,
        map: run
          ? {
              runId: run.id,
              topics: run.topics.map((topic) => ({
                id: topic.topicId,
                versionId: topic.topicVersionId,
                runId: topic.createdByRunId,
                name: topic.name,
                description: topic.description,
              })),
            }
          : null,
      };
    }),
  };
}

/** Current result per facet for one trace; summaries start within a few days of the trace. */
export async function traceFacetResults(
  projectId: string,
  traceId: string,
  timestamp: Date,
) {
  const slackMs = OBSERVATIONS_TO_TRACE_INTERVAL_DAYS * 86_400_000;
  // Narrow to the trace's exact source time so assignment reads prune to its minute.
  const unitTimeRange = await getTopicTraceUnitTimeRange(projectId, [traceId], {
    from: new Date(timestamp.getTime() - slackMs),
    to: new Date(timestamp.getTime() + slackMs),
  });
  if (!unitTimeRange) return [];
  const { facets } = await enabledTopicFacets(projectId);
  if (facets.length === 0) return [];
  const runs = await Promise.all(
    facets.map((facet) => getPublishedTopicRun(projectId, facet.id)),
  );
  const { rows } = await listCurrentTopicSummaries({
    projectId,
    window: unitTimeRange,
    facetIds: facets.map((facet) => facet.id),
    conditions: [
      { column: "traceId", match: { operator: "any of", values: [traceId] } },
    ],
    orderBy: "timestamp.desc",
    limit: facets.length,
    includeAssignment: true,
    truncateSummaries: false,
    publishedRunIds: runs.flatMap((run) => (run ? [run.id] : [])),
  });
  return facets.map((facet, index) => {
    const run = runs[index];
    const row = rows.find((item) => item.facetId === facet.id);
    const topicId = row?.assignment?.topicId ?? null;
    return {
      facetId: facet.id,
      name: facet.name,
      summary: row?.summary ?? null,
      outcome: row?.assignment?.status ?? null,
      topicId,
      topicName: topicName(run, row?.assignment?.topicVersionId),
      // Slot in the published map; picks the topic's color.
      topicIndex:
        run?.topics.findIndex((topic) => topic.topicId === topicId) ?? -1,
    };
  });
}

/** The published map's name for a topic version; null once the version left the map. */
function topicName(run: TopicRun | null, topicVersionId?: string | null) {
  if (!topicVersionId) return null;
  return (
    run?.topics.find((topic) => topic.topicVersionId === topicVersionId)
      ?.name ?? null
  );
}

const TOPIC_TRACES_PAGE_SIZE = 50;

/**
 * One page of a facet's traces with their current summary and topic, newest
 * first. Filters run in ClickHouse; a short page with a cursor means the scan
 * budget ran out, not the end.
 */
export async function listTopicTraces(input: {
  projectId: string;
  facetId: string;
  topicIds?: { operator: "any of" | "none of"; values: string[] };
  statuses?: {
    operator: "any of" | "none of";
    values: (TopicAssignmentStatus | TopicSummaryState)[];
  };
  assigned?: boolean;
  traceId?: string;
  cursor?: TopicResultCursor;
}) {
  const conditions: TopicResultCondition[] = [];
  if (input.topicIds)
    conditions.push({ column: "topicId", match: input.topicIds });
  if (input.statuses)
    conditions.push({ column: "assignmentStatus", match: input.statuses });
  if (input.assigned !== undefined)
    conditions.push({ column: "assigned", match: input.assigned });
  if (input.traceId)
    conditions.push({
      column: "traceId",
      match: { operator: "any of", values: [input.traceId] },
    });
  const run = await getPublishedTopicRun(input.projectId, input.facetId);
  const page = await listCurrentTopicSummaries({
    projectId: input.projectId,
    window: facetResultWindow(run),
    facetIds: [input.facetId],
    conditions,
    orderBy: "timestamp.desc",
    limit: TOPIC_TRACES_PAGE_SIZE,
    cursor: input.cursor,
    includeAssignment: true,
    truncateSummaries: false,
    publishedRunIds: run ? [run.id] : [],
  });
  return {
    rows: page.rows.map((row) => ({
      traceId: row.traceId,
      unitStartTime: row.timestamp.toISOString(),
      facetVersion: row.facetVersion,
      summary: row.summary,
      outcome: row.assignment?.status ?? row.state,
      topicId: row.assignment?.topicId ?? null,
      topicName: topicName(run, row.assignment?.topicVersionId),
    })),
    nextCursor: page.next ?? null,
  };
}
