import { useMemo } from "react";
import type { FilterState } from "@langfuse/shared";
import {
  type Facet,
  orderedFacetTopics,
  type TopicTraceQuery,
} from "./facet-topics";
import { UNASSIGNED_TOPIC_ID } from "./prepare-topic-display";
import { topicTraceQuery } from "./topic-trace-filters";
import { type useTopicTraceFilters } from "./useTopicTraceFilters";

type SelectableTopic = {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  count: number;
};

/**
 * The search bar holds the selection: picking a topic writes its filter
 * there, so with nothing picked the list shows every trace the search allows.
 */
export function useTopicSearchSelection<Topic extends SelectableTopic>({
  projectId,
  facet,
  topics,
  traceFilters,
  showUnassigned = true,
}: {
  projectId: string;
  facet: Facet;
  topics: readonly Topic[];
  traceFilters: Pick<
    ReturnType<typeof useTopicTraceFilters>,
    "filters" | "setFilters" | "searchQuery" | "setSearchQuery"
  >;
  showUnassigned?: boolean;
}) {
  // A stable list keeps the scatter's highlight set, and so a pinned card, across selection re-renders.
  const searchTopics = useMemo(() => orderedFacetTopics(facet), [facet]);
  const selectedTopicId = pickedTopicId(
    traceFilters.filters,
    traceFilters.searchQuery,
  );
  const selected = topics.find((topic) => topic.id === selectedTopicId);
  const isSearching =
    !selected &&
    (traceFilters.filters.length > 0 ||
      Boolean(traceFilters.searchQuery?.trim()));
  function listQuery(): TopicTraceQuery | null {
    if (isSearching)
      return topicTraceQuery(
        traceFilters.filters,
        traceFilters.searchQuery,
        searchTopics,
        { assignedOnly: !showUnassigned },
      );
    if (selected) return topicQuery(selected.id);
    return showUnassigned ? {} : { assigned: true };
  }
  function listTitle() {
    if (isSearching) return "Matching traces";
    return selected ? selected.name : "All traces";
  }
  function listCount() {
    // A search's total is unknown; the list only holds the loaded pages.
    if (isSearching) return null;
    return selected ? selected.count : facet.counts.total;
  }
  // Picking a topic replaces the search with its filter; picking it again, or null, clears it.
  function selectTopic(topicId: string | null) {
    traceFilters.setSearchQuery(null);
    traceFilters.setFilters(
      topicId === null || topicId === selectedTopicId
        ? []
        : topicFilters(topicId),
    );
  }
  const describesTopic =
    !isSearching && selected && selected.id !== UNASSIGNED_TOPIC_ID;
  return {
    searchTopics,
    selectedTopicId,
    selected,
    isSearching,
    query: listQuery(),
    selectTopic,
    /** Drops a picked topic but keeps a typed search. */
    clearPickedTopic: () => {
      if (selected) selectTopic(null);
    },
    listProps: {
      title: listTitle(),
      description: describesTopic
        ? (selected.description ?? undefined)
        : undefined,
      swatchColor: isSearching ? undefined : selected?.color,
      totalCount: listCount(),
      tracingTopic: describesTopic ? { facet, name: selected.name } : undefined,
      emptyMessage: isSearching ? "No matches." : undefined,
      topicColors: new Map(topics.map((topic) => [topic.id, topic.color])),
      search: {
        projectId,
        topics: searchTopics,
        filters: traceFilters.filters,
        onFiltersChange: traceFilters.setFilters,
        searchQuery: traceFilters.searchQuery,
        onSearchQueryChange: traceFilters.setSearchQuery,
      },
    },
  };
}

function topicFilters(topicId: string): FilterState {
  return topicId === UNASSIGNED_TOPIC_ID
    ? [
        {
          column: "assignment",
          type: "stringOptions",
          operator: "none of",
          value: ["assigned"],
        },
      ]
    : [
        {
          column: "topicId",
          type: "stringOptions",
          operator: "any of",
          value: [topicId],
        },
      ];
}

/** The topic the search bar holds when it is exactly one picked topic. */
function pickedTopicId(filters: FilterState, searchQuery: string | null) {
  if (searchQuery?.trim() || filters.length !== 1) return null;
  const [filter] = filters;
  if (filter?.type !== "stringOptions" || filter.value.length !== 1)
    return null;
  if (filter.column === "topicId" && filter.operator === "any of")
    return filter.value[0] ?? null;
  if (
    filter.column === "assignment" &&
    filter.operator === "none of" &&
    filter.value[0] === "assigned"
  )
    return UNASSIGNED_TOPIC_ID;
  return null;
}

function topicQuery(topicId: string): TopicTraceQuery {
  if (topicId === UNASSIGNED_TOPIC_ID) return { assigned: false };
  return { topicIds: { operator: "any of", values: [topicId] } };
}
