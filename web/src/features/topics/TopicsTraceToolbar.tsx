import { useMemo } from "react";
import type { FilterState } from "@langfuse/shared";
import { type ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { cn } from "@/src/utils/tailwind";
import { TableSearchBar } from "@/src/features/search-bar/components/TableSearchBar";
import {
  buildTopicOptions,
  createTopicTraceRegistry,
  TOPIC_ASSIGNMENT_OPTIONS,
  type TopicFilterFacet,
} from "./topic-trace-filters";

function facetTopicsList(facet: TopicFilterFacet) {
  if (!facet.map) return facet.topics;
  const mapped = facet.map.topics;
  return [
    ...mapped,
    ...facet.topics.filter(
      (topic) => !mapped.some((item) => item.id === topic.id),
    ),
  ];
}

export function TopicsTraceToolbar({
  projectId,
  topics,
  filters,
  onFiltersChange,
  searchQuery,
  onSearchQueryChange,
  traceFields,
  activeFacetId,
  allFacets,
  divider = true,
}: TopicsTraceToolbarProps) {
  const filterableFacets = useMemo(() => {
    if (!allFacets || allFacets.length === 0) return [];
    const withTopics = allFacets
      .map((facet) => ({ facet, topics: facetTopicsList(facet) }))
      .filter((entry) => entry.topics.length > 0);
    // Sibling facets first so cross-facet filters surface immediately in autocomplete.
    return [
      ...withTopics.filter((entry) => entry.facet.facetId !== activeFacetId),
      ...withTopics.filter((entry) => entry.facet.facetId === activeFacetId),
    ];
  }, [allFacets, activeFacetId]);

  const hasSiblingFacets = filterableFacets.some(
    (entry) => entry.facet.facetId !== activeFacetId,
  );
  const crossFacetExamples = useMemo(() => {
    const sibling = filterableFacets.find(
      (entry) => entry.facet.facetId !== activeFacetId,
    );
    const firstTopic = sibling?.topics[0];
    if (!sibling || !firstTopic) return [];
    const facetSegment = /^[A-Za-z0-9_-]+$/.test(sibling.facet.name)
      ? sibling.facet.name
      : JSON.stringify(sibling.facet.name);
    return [`topics.${facetSegment}:${JSON.stringify(firstTopic.name)}`];
  }, [filterableFacets, activeFacetId]);

  const registry = createTopicTraceRegistry(topics, filters, {
    traceFields: Boolean(traceFields),
    crossFacetTopics: hasSiblingFacets || filterableFacets.length > 1,
    searchExamples: crossFacetExamples,
  });
  const topicField = registry.fields.find((field) => field.id === "topic");

  const crossFacetObserved = useMemo(() => {
    if (filterableFacets.length === 0) return undefined;
    const observed: ObservedOptions = {
      topics: filterableFacets.map(({ facet, topics: facetTopics }) => ({
        value: facet.name,
        type: `${facetTopics.length} ${facetTopics.length === 1 ? "topic" : "topics"}`,
      })),
    };
    for (const { facet, topics: facetTopics } of filterableFacets) {
      observed[`topics.${facet.name}`] = buildTopicOptions(facetTopics).map(
        (option) => ({ value: option.displayValue }),
      );
    }
    return observed;
  }, [filterableFacets]);

  return (
    <div className={cn("shrink-0", divider ? "border-b p-2" : "px-4 pt-3")}>
      <TableSearchBar
        projectId={projectId}
        tableName="topics"
        registry={registry}
        filterState={filters}
        setFilterState={onFiltersChange}
        observed={{
          ...traceFields?.observed,
          ...crossFacetObserved,
          topic: topics.map((topic) => ({
            value:
              topicField?.displayValueByFilterValue?.get(topic.id) ??
              topic.name,
          })),
          assignment: TOPIC_ASSIGNMENT_OPTIONS.map((option) => ({
            value: option.displayValue,
          })),
        }}
        onRequestColumns={traceFields?.onRequestColumns}
        erroredColumns={traceFields?.erroredColumns}
        isV4
        inset
        search={{
          query: searchQuery,
          type: ["id"],
          setQuery: onSearchQueryChange,
        }}
      />
    </div>
  );
}

/** Value suggestions for the trace fields; stories may leave `observed` empty. */
type TopicTraceFieldSuggestions = {
  observed: ObservedOptions | undefined;
  onRequestColumns?: (columns: readonly string[]) => void;
  erroredColumns?: ReadonlySet<string>;
};

type TopicsTraceToolbarProps = {
  projectId?: string;
  topics: { id: string; name: string }[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  searchQuery: string | null;
  onSearchQueryChange: (query: string | null) => void;
  /** Offers trace fields (session, user, tags, …) next to topic and assignment. */
  traceFields?: TopicTraceFieldSuggestions;
  /** Active facet ID, used to rank sibling facets first in `topics.<Facet>` completions. */
  activeFacetId?: string;
  /** All facets in the current rule/snapshot map, enabling `topics.<Facet>` filters. */
  allFacets?: readonly TopicFilterFacet[];
  /** Off when something below already draws the line, e.g. a table header. */
  divider?: boolean;
};
