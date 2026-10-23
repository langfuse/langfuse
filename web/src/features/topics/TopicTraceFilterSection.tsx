import { useState } from "react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import {
  EventsSearchBarRow,
  type toObservedOptions,
  useEventsSearchBar,
} from "@/src/features/search-bar";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import {
  type experimentEvalFilterColsWithOptions,
  type FilterState,
  type TracingSearchType,
} from "@langfuse/shared";

const topicsFilterRegistry = {
  ...RULE_FIELD_REGISTRY,
  aiFilterPrompt: true,
  fields: RULE_FIELD_REGISTRY.fields.filter(
    (field) => field.id !== "isRootObservation",
  ),
  columns: RULE_FIELD_REGISTRY.columns.filter(
    (column) => column.id !== "isRootObservation",
  ),
};

const queryOnlyColumnIds = topicsFilterRegistry.fields
  .filter((field) => field.directFilter === false)
  .map((field) => field.filterColumn ?? field.id);

export type TopicTraceFilterSectionProps = {
  projectId?: string;
  mode?: EvaluatorFilterExperience;
  filters?: FilterState;
  searchQuery?: string | null;
  searchType?: TracingSearchType[];
  observed?: ReturnType<typeof toObservedOptions>;
  builderColumns?: ReturnType<typeof experimentEvalFilterColsWithOptions>;
  erroredColumns?: ReadonlySet<string>;
  onRequestColumns?: (columns: readonly string[]) => void;
  onModeChange?: (mode: EvaluatorFilterExperience) => void;
  onFiltersChange?: (filters: FilterState) => void;
  onSearchQueryChange?: (query: string | null) => void;
  onSearchTypeChange?: (searchType: TracingSearchType[]) => void;
  description?: string;
};

/** The trace filter, shown disabled until custom filters ship. */
export function TopicTraceFilterSection({
  projectId,
  mode: modeProp,
  filters: filtersProp,
  searchQuery: searchQueryProp,
  searchType: searchTypeProp,
  observed,
  builderColumns,
  erroredColumns,
  onRequestColumns,
  onModeChange,
  onFiltersChange,
  onSearchQueryChange,
  onSearchTypeChange,
  description = "The sampling rate applies to all incoming traces. Custom trace filters are coming soon.",
}: TopicTraceFilterSectionProps) {
  const [localMode, setLocalMode] =
    useState<EvaluatorFilterExperience>("query");
  const [localFilters, setLocalFilters] = useState<FilterState>([]);
  const [localSearchQuery, setLocalSearchQuery] = useState<string | null>(null);
  const [localSearchType, setLocalSearchType] = useState<TracingSearchType[]>(
    [],
  );
  const mode = modeProp ?? localMode;
  const filters = filtersProp ?? localFilters;
  const searchQuery = searchQueryProp ?? localSearchQuery;
  const searchType = searchTypeProp ?? localSearchType;
  const setMode = onModeChange ?? setLocalMode;
  const setFilters = onFiltersChange ?? setLocalFilters;
  const setSearchQuery = onSearchQueryChange ?? setLocalSearchQuery;
  const setSearchType = onSearchTypeChange ?? setLocalSearchType;
  const search = useEventsSearchBar({
    projectId,
    tableName: "topics-automatic-processing",
    enabled: true,
    filterState: filters,
    searchQuery,
    searchType,
    observed,
    setFilterState: setFilters,
    setSearchQuery,
    setSearchType,
    registry: topicsFilterRegistry,
  });

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Filter traces"
        meta={<Badge text="Coming soon" color="blue" size="sm" />}
        description={description}
        tooltip="Only traces matching this filter will be summarized. Topics always runs on whole traces."
        trailing={
          <div inert className="opacity-50">
            <FilterModeToggle
              mode={mode}
              onChange={(next) => {
                if (next === "builder" && searchQuery !== null)
                  search.applyFilters(filters);
                setMode(next);
              }}
            />
          </div>
        }
      />
      <div inert aria-disabled className="opacity-50">
        {mode === "query" ? (
          <EventsSearchBarRow
            projectId={projectId}
            tableName="topics-automatic-processing"
            store={search.store}
            commit={search.commit}
            observed={observed}
            erroredColumns={erroredColumns}
            registry={topicsFilterRegistry}
            onApplyFilters={search.applyFilters}
            onRequestColumns={onRequestColumns}
            className="p-0"
          />
        ) : (
          <ObservationFilterBuilder
            columns={builderColumns ?? [...topicsFilterRegistry.columns]}
            filterState={filters}
            onChange={setFilters}
            queryOnlyColumnIds={queryOnlyColumnIds}
          />
        )}
      </div>
    </section>
  );
}
