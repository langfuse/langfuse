import { useState } from "react";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import {
  traceTranscriptFilterDefinition,
  type FilterState,
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
  const search = useEventsSearchBar({
    projectId,
    tableName: "topics-setup-trace-filter",
    enabled: true,
    filterState: filters,
    searchQuery,
    searchType,
    observed: undefined,
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
          observed={undefined}
          registry={topicsFilterRegistry}
          onApplyFilters={search.applyFilters}
          className="p-0"
        />
      ) : (
        <ObservationFilterBuilder
          columns={[...topicsFilterRegistry.columns]}
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
