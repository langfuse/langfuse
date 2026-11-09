import { useMemo, useState } from "react";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import {
  removeInternalEvaluationEnvironmentColumnOptions,
  removeInternalEvaluationEnvironmentOptions,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/buildSampleQueryFilters";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import {
  observationEvalFilterColsWithOptions,
  traceTranscriptFilterDefinition,
  type FilterState,
  type TimeFilter,
  type TracingSearchType,
} from "@langfuse/shared";
import {
  TOPICS_RULE_FILTER_HINT,
  topicRuleFilterError,
} from "@langfuse/shared/topics";

const ruleColumns = new Set(
  traceTranscriptFilterDefinition.columns.map((column) => column.id),
);
// Rules match at ingestion, so they only offer the trace-transcript filter fields.
const topicsFilterRegistry = {
  ...RULE_FIELD_REGISTRY,
  fields: RULE_FIELD_REGISTRY.fields.filter((field) =>
    ruleColumns.has(field.filterColumn ?? field.id),
  ),
  columns: RULE_FIELD_REGISTRY.columns.filter((column) =>
    ruleColumns.has(column.id),
  ),
  filterStateErrors: (filters: FilterState) => {
    const error = topicRuleFilterError(filters);
    return error ? [error] : [];
  },
};

// Suggested values come from the setup backfill window.
const BUILDER_OPTION_COLUMNS = [
  "environment",
  "name",
  "traceTags",
  "traceName",
] as const;
const SUGGESTION_WINDOW_MS = 7 * 86_400_000;

const queryOnlyColumnIds = topicsFilterRegistry.fields
  .filter((field) => field.directFilter === false)
  .map((field) => field.filterColumn ?? field.id);

/** The first rule's trace filter in the setup flow; empty means every trace. */
export function TopicTraceFilterSection({
  projectId,
  filters,
  onFiltersChange,
}: {
  projectId?: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const [mode, setMode] = useState<EvaluatorFilterExperience>("query");
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<TracingSearchType[]>([]);
  const [startTimeFilter] = useState<TimeFilter[]>(() => [
    {
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: new Date(Date.now() - SUGGESTION_WINDOW_MS),
    },
  ]);
  const options = useEventsFilterOptions({
    projectId: projectId ?? "",
    startTimeFilter,
    lazy: mode === "query",
    columns: mode === "builder" ? [...BUILDER_OPTION_COLUMNS] : undefined,
    enabled: Boolean(projectId),
  });
  const { filterOptions, isFilterOptionsPending } = options;
  const observed = useMemo(
    () =>
      removeInternalEvaluationEnvironmentOptions(
        toObservedOptions(filterOptions, isFilterOptionsPending),
      ),
    [filterOptions, isFilterOptionsPending],
  );
  const builderColumns = useMemo(
    () =>
      removeInternalEvaluationEnvironmentColumnOptions(
        observationEvalFilterColsWithOptions(
          { ...filterOptions, tags: filterOptions.traceTags },
          [...topicsFilterRegistry.columns],
        ),
      ),
    [filterOptions],
  );
  const search = useEventsSearchBar({
    projectId,
    tableName: "topics-setup-trace-filter",
    enabled: true,
    filterState: filters,
    searchQuery,
    searchType,
    observed,
    setFilterState: onFiltersChange,
    setSearchQuery,
    setSearchType,
    registry: topicsFilterRegistry,
  });
  const error = topicRuleFilterError(filters);

  return (
    <section className="ph-no-capture flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold whitespace-nowrap">Filter traces</h3>
        <FilterModeToggle
          mode={mode}
          onChange={(next) => {
            if (next === "builder" && searchQuery !== null)
              search.applyFilters(filters);
            setMode(next);
          }}
        />
      </div>
      {mode === "query" ? (
        <EventsSearchBarRow
          projectId={projectId}
          tableName="topics-setup-trace-filter"
          store={search.store}
          commit={search.commit}
          observed={observed}
          erroredColumns={options.erroredColumns}
          onRequestColumns={options.requestColumns}
          registry={topicsFilterRegistry}
          onApplyFilters={search.applyFilters}
          className="p-0"
        />
      ) : (
        <ObservationFilterBuilder
          columns={builderColumns}
          filterState={filters}
          onChange={onFiltersChange}
          queryOnlyColumnIds={queryOnlyColumnIds}
        />
      )}
      <p
        className={
          error ? "text-destructive text-xs" : "text-muted-foreground text-xs"
        }
      >
        {error ?? TOPICS_RULE_FILTER_HINT}
      </p>
    </section>
  );
}
