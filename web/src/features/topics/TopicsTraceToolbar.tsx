import type { FilterState } from "@langfuse/shared";
import { type ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { cn } from "@/src/utils/tailwind";
import { TableSearchBar } from "@/src/features/search-bar/components/TableSearchBar";
import {
  createTopicTraceRegistry,
  TOPIC_ASSIGNMENT_OPTIONS,
  topicFilterLabels,
} from "./topic-trace-filters";

export function TopicsTraceToolbar({
  projectId,
  facetName,
  topics,
  filters,
  onFiltersChange,
  searchQuery,
  onSearchQueryChange,
  traceFields,
  divider = true,
}: TopicsTraceToolbarProps) {
  const registry = createTopicTraceRegistry(facetName, {
    traceFields: Boolean(traceFields),
  });
  const topicNames = topicFilterLabels(topics);

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
          topics: [{ value: facetName }],
          [`topics.${facetName}`]: topicNames.map((value) => ({ value })),
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
  facetName: string;
  topics: { id: string; name: string }[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  searchQuery: string | null;
  onSearchQueryChange: (query: string | null) => void;
  /** Offers trace fields (session, user, tags, …) next to topic and assignment. */
  traceFields?: TopicTraceFieldSuggestions;
  /** Off when something below already draws the line, e.g. a table header. */
  divider?: boolean;
};
