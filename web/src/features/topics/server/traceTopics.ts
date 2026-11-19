import {
  getCurrentTopicMapRows,
  getPublishedTopicMaps,
  listTopicFacets,
  listTopicRules,
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

/** Current topics for a page of traces: one ClickHouse read across facets, one topic or outlier per rule's map. */
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
    includeOutliers: true,
  });
  const topicNames = new Map(
    maps
      .flatMap((map) => map.topics)
      .map((topic) => [topic.topicVersionId, topic.name]),
  );
  const result: Record<
    string,
    { facet: string; topic: string | null; runIds: string[] }[]
  > = {};
  for (const facet of facets)
    for (const row of rows) {
      // A null topic is an outlier: the map analysed the trace without assigning one.
      const topic =
        row.topicId === "" ? null : topicNames.get(row.topicVersionId);
      if (row.facetId !== facet.id || topic === undefined) continue;
      const items = result[row.traceId] ?? [];
      result[row.traceId] = items;
      // Rules can each assign a topic; a name several rules assigned shows once, listing each map.
      const same = items.find(
        (item) => item.facet === facet.name && item.topic === topic,
      );
      if (same) same.runIds.push(row.runId);
      else items.push({ facet: facet.name, topic, runIds: [row.runId] });
    }
  return result;
}

/** The Tracing stripe's map of a facet: the oldest covering rule's that has one, as the Topics page opens it. Postgres only. */
export async function topicStripeMap(projectId: string, facetName: string) {
  const facet = (await listTopicFacets(projectId)).find(
    (item) => item.name === facetName,
  );
  if (!facet) return null;
  const [rules, maps] = await Promise.all([
    listTopicRules(projectId),
    getCurrentTopicMapRows(projectId, [facet.id]),
  ]);
  const rule = rules.find(
    (item) =>
      item.facetIds.includes(facet.id) &&
      maps.some((map) => map.ruleId === item.id),
  );
  // A facet no rule covers keeps its serving map.
  const map = rule
    ? maps.find((item) => item.ruleId === rule.id)
    : maps.find((item) => item.ruleId === null);
  if (!map) return null;
  return {
    facetId: facet.id,
    ruleId: rule?.id ?? null,
    mapName: rule?.name ?? null,
    runId: map.run.id,
  };
}
