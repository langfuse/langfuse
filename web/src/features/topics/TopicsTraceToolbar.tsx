import type { FilterState } from "@langfuse/shared";
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
  divider = true,
}: TopicsTraceToolbarProps) {
  const registry = createTopicTraceRegistry(topics, filters);
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
          topic: topics.map((topic) => ({
            value:
              topicField?.displayValueByFilterValue?.get(topic.id) ??
              topic.name,
          })),
          assignment: TOPIC_ASSIGNMENT_OPTIONS.map((option) => ({
            value: option.displayValue,
          })),
        }}
        isV4={false}
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

type TopicsTraceToolbarProps = {
  projectId?: string;
  topics: { id: string; name: string }[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  searchQuery: string | null;
  onSearchQueryChange: (query: string | null) => void;
  /** Off when something below already draws the line, e.g. a table header. */
  divider?: boolean;
};
