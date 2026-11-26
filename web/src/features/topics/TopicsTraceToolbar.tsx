import type { FilterState } from "@langfuse/shared";
import { type ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { cn } from "@/src/utils/tailwind";
import { TableSearchBar } from "@/src/features/search-bar/components/TableSearchBar";
import {
  createTopicTraceRegistry,
  TOPIC_ASSIGNMENT_OPTIONS,
} from "./topic-trace-filters";

export function TopicsTraceToolbar({
  projectId,
  topics,
  filters,
  onFiltersChange,
  searchQuery,
  onSearchQueryChange,
  traceFields,
  divider = true,
}: TopicsTraceToolbarProps) {
  const registry = createTopicTraceRegistry(topics, filters, {
    traceFields: Boolean(traceFields),
  });
  const topicField = registry.fields.find((field) => field.id === "topic");

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
  /** Off when something below already draws the line, e.g. a table header. */
  divider?: boolean;
};
