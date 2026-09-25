import type { TopicAssignment, TopicSummary } from "@langfuse/shared/topics";
import {
  getLatestFacetSummaries,
  getPublishedTopicRun,
  getTopicDefinitions,
  listTopicFacets,
  readLatestTopicAssignments,
} from "@langfuse/shared/topics/server";

function resolveTopicResult(summary: TopicSummary, stored?: TopicAssignment) {
  const assignment =
    summary.state === "complete" &&
    stored?.projectId === summary.projectId &&
    stored.facetId === summary.facetId &&
    stored.facetVersion === summary.facetVersion &&
    stored.traceId === summary.traceId &&
    stored.summaryProcessedAt === summary.processedAt
      ? stored
      : undefined;
  let outcome: string = summary.state;
  if (summary.state === "complete") outcome = "awaiting_map";
  if (assignment) outcome = assignment.topicId ? "assigned" : "outlier";
  return { assignment, outcome };
}

/** Current state is resolved per trace and facet, independently of execution batches. */
export async function currentTopicResults(projectId: string) {
  const facets = await listTopicFacets(projectId);
  return Promise.all(
    facets.map(async (facet) => {
      const version = facet.versions[0];
      const [storedAssignments, storedSummaries, run] = await Promise.all([
        readLatestTopicAssignments(projectId, facet.id),
        getLatestFacetSummaries(projectId, facet.id),
        getPublishedTopicRun(projectId, facet.id),
      ]);
      const assignments = storedAssignments.filter(
        (row) => row.traceId !== null,
      );
      const latestSummaries = storedSummaries.filter(
        (row) => row.traceId !== null,
      );
      const topicVersionIds = assignments.flatMap((row) =>
        row.topicVersionId ? [row.topicVersionId] : [],
      );
      const definitions = await getTopicDefinitions(projectId, topicVersionIds);
      const assignmentByTrace = new Map(
        assignments.map((row) => [row.traceId, row]),
      );
      const topicByVersion = new Map(
        definitions.map((topic) => [topic.topicVersionId, topic]),
      );
      const topics = new Map<
        string,
        { assignment: TopicAssignment; count: number }
      >();
      const rows = latestSummaries
        .sort(
          (a, b) =>
            b.unitStartTime.localeCompare(a.unitStartTime) ||
            a.traceId.localeCompare(b.traceId),
        )
        .map((summary) => {
          const { assignment, outcome } = resolveTopicResult(
            summary,
            assignmentByTrace.get(summary.traceId),
          );
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
              })),
            }
          : null,
      };
    }),
  );
}
