import {
  getPublishedTopicMaps,
  listTopicFacets,
  readCurrentTraceTopics,
} from "@langfuse/shared/topics/server";

const DAY_MS = 86_400_000;

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
      return names.length ? [[facet.name, names]] : [];
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
  const times = traces.map((trace) => trace.timestamp.getTime());
  const rows = await readCurrentTraceTopics(projectId, {
    traceIds: [...new Set(traces.map((trace) => trace.traceId))],
    facetIds: facets.map((facet) => facet.id),
    publishedRunIds: runIds,
    // Summaries start at a trace's first observation, which can precede the row's start time.
    timeRange: {
      from: new Date(Math.min(...times) - DAY_MS),
      to: new Date(Math.max(...times) + DAY_MS),
    },
  });
  const topicNames = new Map(
    maps.flatMap((map) =>
      map.topics.map((topic) => [
        `${map.facetId}:${topic.topicId}`,
        topic.name,
      ]),
    ),
  );
  const result: Record<string, { facet: string; topic: string }[]> = {};
  for (const facet of facets)
    for (const row of rows) {
      const topic = topicNames.get(`${row.facetId}:${row.topicId}`);
      if (row.facetId !== facet.id || !topic) continue;
      result[row.traceId] = [
        ...(result[row.traceId] ?? []),
        { facet: facet.name, topic },
      ];
    }
  return result;
}
