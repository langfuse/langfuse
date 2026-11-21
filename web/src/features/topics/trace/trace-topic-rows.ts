import { type RouterOutputs } from "@/src/utils/api";
import { treemapBadgeColor } from "@/src/features/topics/topic-map-colors";

type TraceTopicFacet = RouterOutputs["topics"]["forTrace"][number];

/**
 * One row per facet with its summary once. Each rule map that assigned the
 * trace adds a topic, captioned with its rule when there are several; without
 * any, the row shows the facet's status.
 */
export function traceTopicRows(facets: TraceTopicFacet[]) {
  const byFacet = new Map<string, TraceTopicFacet[]>();
  for (const facet of facets)
    byFacet.set(facet.facetId, [...(byFacet.get(facet.facetId) ?? []), facet]);
  return [...byFacet].map(([facetId, results]) => {
    const assigned = results.filter((result) => result.topicName);
    const status =
      results.find((result) => result.outcome !== "awaiting_map") ?? results[0];
    return {
      id: facetId,
      label: results[0].name,
      description:
        results.find((result) => result.summary)?.summary ?? undefined,
      values: assigned.length
        ? assigned.map((result) => ({
            text: result.topicName!,
            caption:
              assigned.length > 1 ? (result.ruleName ?? undefined) : undefined,
            color: treemapBadgeColor(result.topicIndex),
          }))
        : [
            {
              text: status.outcome?.replaceAll("_", " ") ?? "Not analyzed yet",
              color: "filled" as const,
            },
          ],
    };
  });
}
