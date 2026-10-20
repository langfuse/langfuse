export function resolveTopicFacetId(
  facets: readonly { facetId: string }[],
  requestedId: string | undefined,
): string | undefined {
  if (facets.some((facet) => facet.facetId === requestedId)) return requestedId;
  return facets[0]?.facetId;
}
