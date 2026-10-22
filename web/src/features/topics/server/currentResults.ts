import type {
  TopicAssignment,
  TopicSummary,
  TopicTimeRange,
} from "@langfuse/shared/topics";
import { OBSERVATIONS_TO_TRACE_INTERVAL_DAYS } from "@langfuse/shared/src/server";
import {
  getLatestFacetSummaries,
  getPublishedTopicRun,
  getTopicRuns,
  hasStoredTopicSummaries,
  listTopicFacets,
  listTopicRules,
  readLatestTopicAssignments,
} from "@langfuse/shared/topics/server";

function resolveTopicResult(
  summary: Pick<
    TopicSummary,
    | "projectId"
    | "facetId"
    | "facetVersion"
    | "traceId"
    | "unitStartTime"
    | "processedAt"
    | "state"
  >,
  stored?: TopicAssignment,
) {
  const assignment =
    summary.state === "complete" &&
    stored?.projectId === summary.projectId &&
    stored.facetId === summary.facetId &&
    stored.facetVersion === summary.facetVersion &&
    stored.traceId === summary.traceId &&
    stored.unitStartTime === summary.unitStartTime &&
    stored.summaryProcessedAt === summary.processedAt
      ? stored
      : undefined;
  let outcome: string = summary.state;
  if (summary.state === "complete") outcome = "awaiting_map";
  if (assignment) outcome = assignment.topicId ? "assigned" : "outlier";
  return { assignment, outcome };
}

/** Current state is resolved per trace and facet, independently of execution batches. */
export async function currentTopicResults(
  projectId: string,
  timeRange: TopicTimeRange,
  traceIds?: string[],
) {
  const facets = await listTopicFacets(projectId);
  const hasStoredSummaries =
    facets.length > 0 && (await hasStoredTopicSummaries(projectId));
  if (!hasStoredSummaries) return { hasStoredSummaries, facets: [] };
  // Only facets enabled on the project's rule get tabs; without a rule, all show.
  const [rule] = await listTopicRules(projectId);
  const enabledFacetIds = rule ? new Set(rule.facetIds) : null;
  const currentFacets = await Promise.all(
    facets
      .filter((facet) => !enabledFacetIds || enabledFacetIds.has(facet.id))
      .map(async (facet) => {
        const version = facet.versions[0];
        const [storedAssignments, storedSummaries, run] = await Promise.all([
          readLatestTopicAssignments(projectId, facet.id, timeRange, traceIds),
          getLatestFacetSummaries(
            projectId,
            facet.id,
            undefined,
            timeRange,
            traceIds,
          ),
          getPublishedTopicRun(projectId, facet.id),
        ]);
        const latestSummaries = storedSummaries.filter(
          (row) => row.traceId !== null,
        );
        const assignmentByTrace = new Map(
          storedAssignments.map((row) => [row.traceId, row]),
        );
        const current = latestSummaries
          .sort(
            (a, b) =>
              b.unitStartTime.localeCompare(a.unitStartTime) ||
              a.traceId.localeCompare(b.traceId),
          )
          .map((summary) => ({
            summary,
            ...resolveTopicResult(
              summary,
              assignmentByTrace.get(summary.traceId),
            ),
          }));
        const assignmentRuns = await getTopicRuns(projectId, [
          ...new Set(
            current.flatMap(({ assignment }) =>
              assignment?.topicId &&
              assignment.runId &&
              assignment.runId !== run?.id
                ? [assignment.runId]
                : [],
            ),
          ),
        ]);
        const definitions = [
          ...(run?.topics ?? []),
          ...assignmentRuns.flatMap((item) => item.topics),
        ];
        const topicByVersion = new Map(
          definitions.map((topic) => [topic.topicVersionId, topic]),
        );
        const topics = new Map<
          string,
          { assignment: TopicAssignment; count: number }
        >();
        const rows = current.map(({ summary, assignment, outcome }) => {
          const definition = assignment?.topicVersionId
            ? topicByVersion.get(assignment.topicVersionId)
            : undefined;
          if (assignment?.topicId) {
            const topic = topics.get(assignment.topicId);
            topics.set(assignment.topicId, {
              assignment:
                !topic || assignment.assignedAt > topic.assignment.assignedAt
                  ? assignment
                  : topic.assignment,
              count: (topic?.count ?? 0) + 1,
            });
          }
          return {
            facetVersion: summary.facetVersion,
            traceId: summary.traceId,
            unitStartTime: summary.unitStartTime,
            summary: summary.summary,
            outcome,
            topicId: assignment?.topicId ?? null,
            topicName: definition?.name ?? null,
          };
        });
        // Current map names take precedence; retired IDs keep their latest referenced name.
        const currentTopics = new Map(
          run?.topics.map((topic) => [topic.topicId, topic]),
        );
        return {
          facetId: facet.id,
          name: facet.name,
          facetVersion: version?.version ?? null,
          usableCount: latestSummaries.filter(
            (row) =>
              row.facetVersion === version?.version && row.state === "complete",
          ).length,
          awaitingCount: rows.filter((row) => row.outcome === "awaiting_map")
            .length,
          topics: [...topics]
            .sort(
              ([, a], [, b]) =>
                b.count - a.count ||
                b.assignment.assignedAt.localeCompare(a.assignment.assignedAt),
            )
            .map(([id, topic]) => {
              const definition =
                currentTopics.get(id) ??
                topicByVersion.get(topic.assignment.topicVersionId ?? "");
              return {
                id,
                name: definition?.name ?? "Unavailable topic",
                description: definition?.description ?? "",
                count: topic.count,
              };
            }),
          rows,
          map: run
            ? {
                runId: run.id,
                topics: run.topics.map((topic) => ({
                  id: topic.topicId,
                  name: topic.name,
                  description: topic.description,
                })),
              }
            : null,
        };
      }),
  );
  return { hasStoredSummaries, facets: currentFacets };
}

/** Current result per facet for one trace; summaries start within a few days of the trace. */
export async function traceFacetResults(
  projectId: string,
  traceId: string,
  timestamp: Date,
) {
  const slackMs = OBSERVATIONS_TO_TRACE_INTERVAL_DAYS * 86_400_000;
  const { facets } = await currentTopicResults(
    projectId,
    {
      from: new Date(timestamp.getTime() - slackMs),
      to: new Date(timestamp.getTime() + slackMs),
    },
    [traceId],
  );
  return facets.flatMap((facet) => {
    const row = facet.rows.find((item) => item.traceId === traceId);
    if (!row) return [];
    return [
      {
        facetId: facet.facetId,
        name: facet.name,
        summary: row.summary,
        outcome: row.outcome,
        topicName: row.topicName,
        // Same color slot as the topic's position in the published map.
        topicIndex:
          facet.map?.topics.findIndex((topic) => topic.id === row.topicId) ??
          -1,
      },
    ];
  });
}
