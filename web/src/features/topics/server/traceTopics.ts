import {
  buildTopicFilterOptions,
  sortTopicFacets,
} from "@langfuse/shared/topics";
import {
  getCompletedTopicRuleRunIds,
  getCurrentTopicMapRows,
  getPublishedTopicMaps,
  listTopicFacets,
  listTopicRules,
  readCurrentTraceTopics,
} from "@langfuse/shared/topics/server";

/** Sidebar and search bar options: facet name → `{ value: stableTopicId, displayValue: name }` of its current published maps. */
export async function topicFilterOptions(projectId: string) {
  const facets = sortTopicFacets(await listTopicFacets(projectId));
  const { maps } = await getPublishedTopicMaps(
    projectId,
    facets.map((facet) => facet.id),
  );
  return Object.fromEntries(
    facets.flatMap((facet) => {
      const options = buildTopicFilterOptions(
        maps
          .filter((map) => map.facetId === facet.id)
          .flatMap((map) =>
            map.topics.map((topic) => ({
              id: topic.topicId,
              name: topic.name,
            })),
          ),
      );
      return options.length > 0 ? [[facet.name, options]] : [];
    }),
  ) as Record<string, { value: string; displayValue: string }[]>;
}

/** Latest topics for a page of traces: one ClickHouse read across facets, one topic or outlier per rule's map. */
export async function tracesTopics(
  projectId: string,
  traces: { traceId: string; timestamp: Date }[],
) {
  const facets = sortTopicFacets(await listTopicFacets(projectId));
  if (facets.length === 0) return {};
  const { runIds, ruleIds, maps } = await getPublishedTopicMaps(
    projectId,
    facets.map((facet) => facet.id),
  );
  const ruleRunIds = await getCompletedTopicRuleRunIds(projectId, ruleIds);
  const rows = await readCurrentTraceTopics(projectId, {
    traces,
    facetIds: facets.map((facet) => facet.id),
    runIds: [...new Set([...runIds, ...ruleRunIds])],
    includeOutliers: true,
  });
  // A placement belongs to its rule's current map, a snapshot placement to its own run. That map
  // names its stable topic id and is the run the stripe compares against.
  const currentMaps = new Map(
    maps.flatMap((map) => {
      const names = new Map(
        map.topics.map((topic) => [topic.topicId, topic.name]),
      );
      const entry = { runId: map.runId, names };
      return [
        [`${map.facetId}:run:${map.runId}`, entry] as const,
        ...(map.ruleId
          ? [[`${map.facetId}:rule:${map.ruleId}`, entry] as const]
          : []),
      ];
    }),
  );
  const result: Record<
    string,
    {
      facet: string;
      topicId: string | null;
      topic: string | null;
      runIds: string[];
    }[]
  > = {};
  for (const facet of facets)
    for (const row of rows) {
      if (row.facetId !== facet.id) continue;
      const map = currentMaps.get(
        row.ruleId
          ? `${row.facetId}:rule:${row.ruleId}`
          : `${row.facetId}:run:${row.runId}`,
      );
      // A null topic is an outlier: the map analysed the trace without assigning one.
      const topicId = row.topicId === "" ? null : row.topicId;
      const topic = topicId === null ? null : map?.names.get(topicId);
      if (!map || topic === undefined) continue;
      const items = result[row.traceId] ?? [];
      result[row.traceId] = items;
      // Rules can each assign a topic; a stable topic ID several rules assigned shows once, listing each map.
      const same = items.find(
        (item) =>
          item.facet === facet.name &&
          item.topicId === topicId &&
          item.topic === topic,
      );
      if (same) same.runIds.push(map.runId);
      else
        items.push({ facet: facet.name, topicId, topic, runIds: [map.runId] });
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
