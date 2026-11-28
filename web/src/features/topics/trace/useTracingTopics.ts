import { type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { topicMapQuery } from "@/src/features/topics/topic-maps";
import {
  selectedStripeTopics,
  toggleStripeTopic,
  topicStripeCoverage,
  topicStripeFacet,
  topicStripeSegments,
} from "./topic-stripe";

/** Facet name → topic options (`{ value, displayValue }`), for the sidebar facet and the search bar. */
export function useTopicFilterOptions(projectId: string, enabled: boolean) {
  return api.topics.filterOptions.useQuery(
    { projectId },
    { enabled, staleTime: 5 * 60 * 1000 },
  ).data;
}

/** Current topics of the visible rows' traces; every Topics cell shares this one query per page. */
export function useTraceTopicsForRows(
  projectId: string,
  rows: { traceId?: string | null; startTime: Date }[],
) {
  const traces = rows.flatMap((row) =>
    row.traceId ? [{ traceId: row.traceId, timestamp: row.startTime }] : [],
  );
  return api.topics.forTraces.useQuery(
    { projectId, traces },
    { enabled: traces.length > 0, staleTime: 60 * 1000 },
  ).data;
}

/** The pulse chart's topic stripe for the loaded rows; null when disabled or no trace has a topic in the facet's map. */
export function useTopicStripe({
  projectId,
  enabled,
  rows,
  facetTopics,
  filters,
  onFiltersChange,
}: {
  projectId: string;
  enabled: boolean;
  rows: { traceId?: string | null; startTime: Date }[];
  /** Facet name → its published topic options; picks the facet and supplies all known topic IDs/names. */
  facetTopics:
    | Record<
        string,
        readonly { value: string; displayValue: string; name?: string }[]
      >
    | undefined;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const facet = topicStripeFacet(Object.keys(facetTopics ?? {}));
  const map = api.topics.stripeMap.useQuery(
    { projectId, facet: facet ?? "" },
    // Matches the trace topics' refresh, so a refit's new run id lines up.
    { enabled: enabled && facet !== null, staleTime: 60 * 1000 },
  ).data;
  const topicsByTrace = useTraceTopicsForRows(
    projectId,
    enabled && facet ? rows : [],
  );
  if (!enabled || !facet || !map || !topicsByTrace) return null;
  const segments = topicStripeSegments({ rows, topicsByTrace, facet, map });
  const stripeTopics = segments.filter((segment) => segment.kind === "topic");
  if (stripeTopics.length === 0) return null;
  // Combine all published topics for this facet (including off-page/folded ones) with visible stripe topics.
  const knownTopicsById = new Map<string, { topicId: string; name: string }>();
  for (const option of facetTopics?.[facet] ?? []) {
    knownTopicsById.set(option.value, {
      topicId: option.value,
      name: option.name ?? option.displayValue,
    });
  }
  for (const segment of stripeTopics) {
    if (!knownTopicsById.has(segment.topicId)) {
      knownTopicsById.set(segment.topicId, {
        topicId: segment.topicId,
        name: segment.name,
      });
    }
  }
  const knownTopics = [...knownTopicsById.values()];
  const query = new URLSearchParams({
    ...(map.ruleId ? topicMapQuery({ kind: "rule", id: map.ruleId }) : {}),
    topicFacet: map.facetId,
  });
  return {
    facet,
    segments,
    selected: selectedStripeTopics(filters, facet, knownTopics),
    onToggle: (topic: string) =>
      onFiltersChange(toggleStripeTopic(filters, facet, topic, knownTopics)),
    details: {
      ...topicStripeCoverage({ rows, topicsByTrace, facet, map }),
      mapName: map.mapName,
      href: `/project/${encodeURIComponent(projectId)}/topics?${query}`,
    },
  };
}
