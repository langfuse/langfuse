import {
  getPublishedTopicMaps,
  getTopicRuns,
  listTopicFacets,
  readCurrentTraceTopics,
} from "@langfuse/shared/topics/server";

/** Sidebar and search bar options: facet name → topic names of its current published map. */
export async function topicFilterOptions(projectId: string) {
  const [facets, { maps }] = await Promise.all([
    listTopicFacets(projectId),
    getPublishedTopicMaps(projectId),
  ]);
  return Object.fromEntries(
    facets.flatMap((facet) => {
      const names =
        maps
          .find((map) => map.facetId === facet.id)
          ?.topics.map((topic) => topic.name) ?? [];
      return names.length > 0 ? [[facet.name, names]] : [];
    }),
  ) as Record<string, string[]>;
}

/** Current topics for a page of traces: one ClickHouse read across facets, named by the published maps. */
export async function tracesTopics(
  projectId: string,
  traces: { traceId: string; timestamp: Date }[],
) {
  const [facets, { runIds, maps }] = await Promise.all([
    listTopicFacets(projectId),
    getPublishedTopicMaps(projectId),
  ]);
  if (facets.length === 0) return {};
  const rows = await readCurrentTraceTopics(projectId, {
    traces,
    facetIds: facets.map((facet) => facet.id),
    publishedRunIds: runIds,
  });
  // Names come from each facet's serving map; topics assigned by an older published run
  // (split or merged since) fall back to that run's definitions, like the Topics page.
  const servingTopics = maps.flatMap((map) => map.topics);
  const missingRunIds = rows.flatMap((row) =>
    row.runId &&
    !servingTopics.some((topic) => topic.topicVersionId === row.topicVersionId)
      ? [row.runId]
      : [],
  );
  const olderTopics = (
    await getTopicRuns(projectId, [...new Set(missingRunIds)])
  ).flatMap((run) => run.topics);
  const topicNames = new Map(
    [...servingTopics, ...olderTopics].map((topic) => [
      topic.topicVersionId,
      topic.name,
    ]),
  );
  const result: Record<string, { facet: string; topic: string }[]> = {};
  for (const facet of facets)
    for (const row of rows) {
      const topic = topicNames.get(row.topicVersionId);
      if (row.facetId !== facet.id || !topic) continue;
      result[row.traceId] = [
        ...(result[row.traceId] ?? []),
        { facet: facet.name, topic },
      ];
    }
  return result;
}
