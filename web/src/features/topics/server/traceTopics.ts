import {
  getPublishedTopicMaps,
  listTopicFacets,
  listTopicRules,
  readCurrentTraceTopics,
} from "@langfuse/shared/topics/server";
import { topicStripeRanking } from "./currentResults";

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

/** The Tracing stripe's map of a facet: the oldest covering rule's that has one, as the Topics page opens it. */
export async function topicStripeMap(projectId: string, facetName: string) {
  const facet = (await listTopicFacets(projectId)).find(
    (item) => item.name === facetName,
  );
  if (!facet) return null;
  const rules = (await listTopicRules(projectId)).filter((item) =>
    item.facetIds.includes(facet.id),
  );
  // The oldest covering rule with a map; a rule may not have one yet.
  for (const rule of rules) {
    const ranking = await topicStripeRanking(projectId, facet, rule.id);
    if (ranking)
      return {
        facetId: facet.id,
        ruleId: rule.id,
        mapName: rule.name,
        ...ranking,
      };
  }
  const ranking = rules.length
    ? null
    : await topicStripeRanking(projectId, facet);
  return ranking
    ? { facetId: facet.id, ruleId: null, mapName: null, ...ranking }
    : null;
}
