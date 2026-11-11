import {
  getPublishedTopicMaps,
  listTopicFacets,
  readCurrentTraceTopics,
} from "@langfuse/shared/topics/server";

/** Sidebar and search bar options: facet name → topic names of its current published map. */
export async function topicFilterOptions(projectId: string) {
  const facets = await listTopicFacets(projectId);
  const { maps } = await getPublishedTopicMaps(
    projectId,
    facets.map((facet) => facet.id),
  );
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

/** Current topics for a page of traces: one ClickHouse read across facets, named by each facet's serving map. */
export async function tracesTopics(
  projectId: string,
  traces: { traceId: string; timestamp: Date }[],
) {
  const facets = await listTopicFacets(projectId);
  if (facets.length === 0) return {};
  const { runIds, maps } = await getPublishedTopicMaps(
    projectId,
    facets.map((facet) => facet.id),
  );
  const rows = await readCurrentTraceTopics(projectId, {
    traces,
    facetIds: facets.map((facet) => facet.id),
    publishedRunIds: runIds,
  });
  const topicNames = new Map(
    maps
      .flatMap((map) => map.topics)
      .map((topic) => [topic.topicVersionId, topic.name]),
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
