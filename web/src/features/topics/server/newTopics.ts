import {
  getNewTopicCounts,
  listTopicFacets,
} from "@langfuse/shared/topics/server";

/** Per rule and facet, how many topics the rule's current map added. */
export async function newTopicCounts(projectId: string) {
  const facets = await listTopicFacets(projectId);
  const facetNames = new Map(facets.map((facet) => [facet.id, facet.name]));
  const counts = await getNewTopicCounts(
    projectId,
    facets.map((facet) => facet.id),
  );
  return counts.map((count) => ({
    ...count,
    facetName: facetNames.get(count.facetId) ?? "",
  }));
}
