import {
  getLatestFacetSummaries,
  getPublishedTopicRun,
  getTopicDefinitions,
  listTopicFacets,
  readLatestTopicAssignments,
  readTopicSummaries,
} from "@langfuse/shared/topics/server";
import { topicIdSchema } from "@langfuse/shared/topics";

/** Current state is resolved per trace and facet, independently of execution batches. */
export async function currentTopicResults(projectId: string) {
  const facets = await listTopicFacets(projectId);
  return Promise.all(
    facets.map(async (facet) => {
      const version = facet.versions[0];
      const [storedAssignments, storedSummaries, run] = await Promise.all([
        readLatestTopicAssignments(projectId, facet.id),
        version
          ? getLatestFacetSummaries(projectId, facet.id, version.id)
          : Promise.resolve([]),
        getPublishedTopicRun(projectId, facet.id),
      ]);
      const assignments = storedAssignments.filter(
        (row) => row.traceId !== null,
      );
      const latestSummaries = storedSummaries.filter(
        (row) => row.traceId !== null,
      );
      const topicVersionIds = [
        ...new Set(
          assignments.flatMap((row) =>
            row.topicVersionId ? [row.topicVersionId] : [],
          ),
        ),
      ];
      const [definitions, assignedSummaries] = await Promise.all([
        getTopicDefinitions(projectId, topicVersionIds),
        readTopicSummaries(projectId, [
          ...new Set(assignments.map((row) => row.summaryId)),
        ]),
      ]);
      const summaries = new Map(
        [...latestSummaries, ...assignedSummaries].map((row) => [row.id, row]),
      );
      const latestByTrace = new Map(
        latestSummaries.map((row) => [row.traceId, row]),
      );
      const assignmentByTrace = new Map(
        assignments.map((row) => [row.traceId, row]),
      );
      const topicByVersion = new Map(
        definitions.map((topic) => [topic.topicVersionId, topic]),
      );
      const traces = new Set([
        ...assignmentByTrace.keys(),
        ...latestByTrace.keys(),
      ]);
      const rows = [...traces]
        .map((traceId) => {
          const assignment = assignmentByTrace.get(traceId);
          const latest = latestByTrace.get(traceId);
          const summary = assignment
            ? summaries.get(assignment.summaryId)
            : latest;
          const awaitingMap = assignment?.outcome === "awaiting_topics";
          const awaitingUpdate =
            awaitingMap ||
            Boolean(
              latest &&
              latest.id !== assignment?.summaryId &&
              latest.state === "complete",
            );
          const topic = assignment?.topicVersionId
            ? topicByVersion.get(assignment.topicVersionId)
            : undefined;
          return {
            traceId,
            summaryId: summary?.id ?? assignment?.summaryId ?? null,
            summary: summary?.summary ?? "",
            facetVersion:
              summary?.facetVersion ?? assignment?.facetVersion ?? null,
            outcome: awaitingMap
              ? "awaiting_map"
              : (assignment?.outcome ??
                (latest?.state === "complete"
                  ? "awaiting_map"
                  : (latest?.state ?? "unavailable"))),
            topicId:
              assignment?.outcome === "assigned" ? assignment.topicId : null,
            topicVersionId: assignment?.topicVersionId ?? null,
            topicName: topic?.name ?? null,
            topicDescription: topic?.description ?? null,
            assignedAt: assignment?.assignedAt ?? null,
            traceTimestamp:
              assignment?.traceTimestamp ?? summary?.traceTimestamp ?? null,
            awaitingUpdate,
          };
        })
        .sort(
          (a, b) =>
            (b.traceTimestamp ?? "").localeCompare(a.traceTimestamp ?? "") ||
            a.traceId.localeCompare(b.traceId),
        );
      // Current map names take precedence; retired IDs keep their latest referenced name.
      const currentTopics = new Map(
        (run?.publishedAt ? run.topics : []).map((topic) => [
          topic.topicId,
          topic,
        ]),
      );
      const topicRows = [...rows].sort((a, b) =>
        (b.assignedAt ?? "").localeCompare(a.assignedAt ?? ""),
      );
      const topics = new Map<
        string,
        { id: string; name: string; description: string; count: number }
      >();
      for (const row of topicRows) {
        if (!row.topicId) continue;
        const currentTopic = currentTopics.get(row.topicId);
        const topic = topics.get(row.topicId) ?? {
          id: row.topicId,
          name: currentTopic?.name ?? row.topicName ?? "Unavailable topic",
          description: currentTopic?.description ?? row.topicDescription ?? "",
          count: 0,
        };
        topic.count++;
        topics.set(topic.id, topic);
      }
      const discoveryId = topicIdSchema.safeParse(run?.config.executionId);
      return {
        facetId: facet.id,
        name: facet.name,
        facetVersionId: version?.id ?? null,
        facetVersion: version?.version ?? null,
        usableCount: latestSummaries.filter((row) => row.state === "complete")
          .length,
        awaitingCount: rows.filter((row) => row.awaitingUpdate).length,
        topics: [...topics.values()].sort((a, b) => b.count - a.count),
        rows,
        map:
          run?.publishedAt && discoveryId.success
            ? {
                executionId: discoveryId.data,
                facetVersionId: run.facetVersionId,
                publishedAt: run.publishedAt,
                exploratory: run.config.exploratory === true,
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
