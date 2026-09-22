import {
  getLatestFacetSummaries,
  getPublishedTopicRun,
  getTopicDefinitions,
  listTopicFacets,
  readLatestTopicAssignments,
} from "@langfuse/shared/topics/server";

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
      const topicVersionIds = [
        ...new Set(
          assignments.flatMap((row) =>
            row.topicVersionId ? [row.topicVersionId] : [],
          ),
        ),
      ];
      const definitions = await getTopicDefinitions(projectId, topicVersionIds);
      const assignmentByTrace = new Map(
        assignments.map((row) => [row.traceId, row]),
      );
      const topicByVersion = new Map(
        definitions.map((topic) => [topic.topicVersionId, topic]),
      );
      const rows = latestSummaries
        .map((summary) => {
          const storedAssignment = assignmentByTrace.get(summary.traceId);
          const assignment =
            summary.state === "complete" &&
            storedAssignment?.summaryId === summary.id &&
            storedAssignment.summaryProcessedAt === summary.processedAt
              ? storedAssignment
              : undefined;
          const topic = assignment?.topicVersionId
            ? topicByVersion.get(assignment.topicVersionId)
            : undefined;
          let outcome: string = summary.state;
          if (summary.state === "complete") outcome = "awaiting_map";
          if (assignment) outcome = assignment.topicId ? "assigned" : "outlier";
          return {
            traceId: summary.traceId,
            summary: summary.summary,
            outcome,
            topicId: assignment?.topicId ?? null,
            topicName: topic?.name ?? null,
            topicDescription: topic?.description ?? null,
            assignedAt: assignment?.assignedAt ?? null,
            unitStartTime: summary.unitStartTime,
          };
        })
        .sort(
          (a, b) =>
            (b.unitStartTime ?? "").localeCompare(a.unitStartTime ?? "") ||
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
      return {
        facetId: facet.id,
        name: facet.name,
        facetVersion: version?.version ?? null,
        usableCount: latestSummaries.filter(
          (row) =>
            row.facetVersionId === version?.id && row.state === "complete",
        ).length,
        awaitingCount: rows.filter((row) => row.outcome === "awaiting_map")
          .length,
        topics: [...topics.values()].sort((a, b) => b.count - a.count),
        rows,
        map: run?.publishedAt
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
