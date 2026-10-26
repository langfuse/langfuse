import type { FilterState } from "@langfuse/shared";
import { TableSearchBar } from "@/src/features/search-bar";
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
}: TopicsTraceToolbarProps) {
  const registry = createTopicTraceRegistry(topics, filters);
  const topicField = registry.fields.find((field) => field.id === "topic");

  return (
    <div className="shrink-0 border-b p-2">
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
};
