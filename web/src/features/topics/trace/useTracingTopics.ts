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

/** Facet name → topic names, for the sidebar facet and the search bar. */
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
  /** Facet name → its published topic names; picks the facet. */
  facetTopics: Record<string, string[]> | undefined;
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
  if (!segments.some((segment) => segment.kind === "topic")) return null;
  const query = new URLSearchParams({
    ...(map.ruleId ? topicMapQuery({ kind: "rule", id: map.ruleId }) : {}),
    topicFacet: map.facetId,
  });
  return {
    facet,
    segments,
    selected: selectedStripeTopics(filters, facet),
    onToggle: (topic: string) =>
      onFiltersChange(toggleStripeTopic(filters, facet, topic)),
    details: {
      ...topicStripeCoverage({ rows, topicsByTrace, facet, map }),
      mapName: map.mapName,
      href: `/project/${encodeURIComponent(projectId)}/topics?${query}`,
    },
  };
}
