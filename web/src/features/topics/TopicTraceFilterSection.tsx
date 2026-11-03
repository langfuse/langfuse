import { useState } from "react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Input } from "@/src/components/design-system/Input/Input";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import {
  EventsSearchBarRow,
  type toObservedOptions,
  useEventsSearchBar,
} from "@/src/features/search-bar";
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
};

/** Custom trace filters are not available yet; the live filter stays wired for when they ship. */
const TRACE_FILTERS_AVAILABLE = false;

function ComingSoonTraceFilter() {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <h3 className="text-muted-foreground text-sm font-bold">
          Filter traces
        </h3>
        <Badge text="Coming soon" color="filled" size="sm" />
      </div>
      <Input
        disabled
        aria-label="Filter traces"
        placeholder="level:ERROR -env:dev tags:billing"
      />
    </section>
  );
}

function LiveTraceFilter({
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="text-sm font-bold whitespace-nowrap">Filter traces</h3>
          <Badge text="Coming soon" color="blue" size="sm" />
        </div>
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
      </div>
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

/** The trace filter, shown as coming soon until custom filters ship. */
export function TopicTraceFilterSection(props: TopicTraceFilterSectionProps) {
  if (!TRACE_FILTERS_AVAILABLE) return <ComingSoonTraceFilter />;
  return <LiveTraceFilter {...props} />;
}
