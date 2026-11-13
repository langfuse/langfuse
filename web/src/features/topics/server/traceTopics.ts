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
      // Each rule maps the facet separately; equal names merge into one option.
      const names = [
        ...new Set(
          maps
            .filter((map) => map.facetId === facet.id)
            .flatMap((map) => map.topics.map((topic) => topic.name)),
        ),
      ];
      return names.length > 0 ? [[facet.name, names]] : [];
    }),
  ) as Record<string, string[]>;
}

/** Current topics for a page of traces: one ClickHouse read across facets, one topic per rule's map. */
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
      const current = result[row.traceId] ?? [];
      // Rules can each assign a topic; a name another rule also assigned shows once.
      if (row.facetId !== facet.id || !topic) continue;
      if (
        current.some(
          (item) => item.facet === facet.name && item.topic === topic,
        )
      )
        continue;
      result[row.traceId] = [...current, { facet: facet.name, topic }];
    }
  return result;
}
