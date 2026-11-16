import { useCallback, useMemo, useState } from "react";
import { useStore } from "zustand";
import {
  traceTranscriptFilterDefinition,
  type ColumnDefinition,
  type FilterState,
  type SingleValueOption,
  type TimeFilter,
  type TracingSearchType,
} from "@langfuse/shared";
import { topicRuleFilterError } from "@langfuse/shared/topics";
import {
  removeInternalEvaluationEnvironmentColumnOptions,
  removeInternalEvaluationEnvironmentOptions,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/buildSampleQueryFilters";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import {
  toObservedOptions,
  type ObservedOptions,
} from "@/src/features/search-bar/lib/observed-options";
import { draftsSemanticallyEqual } from "@/src/features/search-bar/store/searchBarStore";
import { api, type RouterOutputs } from "@/src/utils/api";

const ruleColumns = new Set(
  traceTranscriptFilterDefinition.columns.map((column) => column.id),
);
// Rules match at ingestion, so they only offer the trace-transcript filter fields.
// Lookup stays on the full rule registry so an out-of-list filter (e.g. from
// Ask AI) shows as a token that validation flags, instead of hiding.
export const topicsFilterRegistry = {
  ...RULE_FIELD_REGISTRY,
  fields: RULE_FIELD_REGISTRY.fields.filter((field) =>
    ruleColumns.has(field.filterColumn ?? field.id),
  ),
  columns: RULE_FIELD_REGISTRY.columns.filter((column) =>
    ruleColumns.has(column.id),
  ),
  // Live scans reject negated filters, so no `-env:dev` example.
  searchExamples: [
    "level:ERROR",
    "env:prod",
    "tags:billing",
    "type:GENERATION",
  ],
  aiContextFields: RULE_FIELD_REGISTRY.aiContextFields.filter(
    ({ observedOptionsKey }) =>
      ruleColumns.has(
        observedOptionsKey === "traceTags" ? "tags" : observedOptionsKey,
      ),
  ),
  filterStateErrors: (filters: FilterState) => {
    const error = topicRuleFilterError(filters);
    return error ? [error] : [];
  },
};
export const topicsFilterQueryOnlyColumnIds = topicsFilterRegistry.fields
  .filter((field) => field.directFilter === false)
  .map((field) => field.filterColumn ?? field.id);

// Trace names come from stored names only (see traceNames below): the events
// options fall back to root observation names, which rule matching does not read.
const hasOptionList = (
  column: ColumnDefinition,
): column is Extract<
  ColumnDefinition,
  { type: "stringOptions" | "arrayOptions" }
> =>
  (column.type === "stringOptions" || column.type === "arrayOptions") &&
  column.id !== "traceName";
// Value suggestions load per filter-option column; tags are stored as trace tags.
const optionColumn = (fieldId: string) =>
  fieldId === "tags" ? "traceTags" : fieldId;
type OptionColumns = NonNullable<
  Parameters<typeof useEventsFilterOptions>[0]["columns"]
>;
const OPTION_COLUMNS = topicsFilterRegistry.columns
  .filter(hasOptionList)
  .map((column) => optionColumn(column.id)) as OptionColumns;

// Matches the setup backfill window.
const DAY_MS = 86_400_000;
const PREVIEW_TRACES = 20;

export type TopicTracePreviewRow =
  RouterOutputs["topics"]["previewTraces"]["traces"][number];
export type TopicTracePreview =
  | { status: "invalid" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; traces: TopicTracePreviewRow[]; count: number };

/** Mode, search bar and validity of the setup trace filter; no data fetching. */
export function useTopicTraceFilterState({
  projectId,
  filters,
  onFiltersChange,
  observed,
  mode,
  onModeChange,
}: {
  projectId: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  observed: ObservedOptions | undefined;
  mode: EvaluatorFilterExperience;
  onModeChange: (mode: EvaluatorFilterExperience) => void;
}) {
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<TracingSearchType[]>([]);
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
  const draft = useStore(search.store, (state) => state.draft);
  // A typed query counts only once it is applied; Next must not save an older filter.
  const draftApplied = draftsSemanticallyEqual(
    draft,
    filterStateToQueryText(
      filters,
      { searchQuery, searchType },
      topicsFilterRegistry,
    ).text,
    undefined,
    topicsFilterRegistry,
  );
  const error = topicRuleFilterError(filters);
  return {
    changeMode: (next: EvaluatorFilterExperience) => {
      if (next === "builder" && searchQuery !== null)
        search.applyFilters(filters);
      onModeChange(next);
    },
    search,
    error,
    ready: error === null && (mode === "builder" || draftApplied),
  };
}

/** The setup trace filter with value suggestions and the latest traces it matches. */
export function useTopicTraceFilter({
  projectId,
  active,
  filters,
  onFiltersChange,
  days = 7,
}: {
  projectId: string;
  /** Loads suggestions and the preview only while the Traces step shows. */
  active: boolean;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  /** Window the preview counts, ending when the hook mounts. */
  days?: number;
}) {
  const [to] = useState(() => new Date());
  const range = useMemo(
    () => ({ from: new Date(to.getTime() - days * DAY_MS), to }),
    [to, days],
  );
  const startTimeFilter = useMemo<TimeFilter[]>(
    () => [
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: range.from,
      },
    ],
    [range],
  );
  const [mode, setMode] = useState<EvaluatorFilterExperience>("query");
  // Builder mode lists every option column up front; query mode loads per field.
  const options = useEventsFilterOptions({
    projectId,
    startTimeFilter,
    lazy: mode === "query",
    columns: mode === "builder" ? OPTION_COLUMNS : undefined,
    enabled: active,
  });
  const { filterOptions, isFilterOptionsPending, requestColumns } = options;
  const traceNames = api.topics.setupTraceNames.useQuery(
    { projectId },
    { enabled: active, retry: false },
  );
  const observed = useMemo(() => {
    const values = removeInternalEvaluationEnvironmentOptions(
      toObservedOptions(filterOptions, isFilterOptionsPending),
    );
    if (!values) return values;
    return {
      ...values,
      tags: values.traceTags ?? [],
      traceName: traceNames.data ?? [],
    };
  }, [filterOptions, isFilterOptionsPending, traceNames.data]);
  const state = useTopicTraceFilterState({
    projectId,
    filters,
    onFiltersChange,
    observed,
    mode,
    onModeChange: setMode,
  });
  const builderColumns = useMemo(
    () =>
      removeInternalEvaluationEnvironmentColumnOptions(
        topicsFilterRegistry.columns.map((column) => {
          const values = (filterOptions as Record<string, unknown>)[
            optionColumn(column.id)
          ];
          if (column.id === "traceName" && column.type === "stringOptions")
            return { ...column, options: traceNames.data ?? [] };
          return hasOptionList(column) && Array.isArray(values)
            ? { ...column, options: values as SingleValueOption[] }
            : column;
        }),
      ),
    [filterOptions, traceNames.data],
  );
  const requestFieldColumns = useCallback(
    (fields: readonly string[]) => requestColumns(fields.map(optionColumn)),
    [requestColumns],
  );
  const preview = api.topics.previewTraces.useQuery(
    {
      projectId,
      filter: filters,
      ...range,
      limit: PREVIEW_TRACES,
      sampling: "latest",
      seed: "topics-setup",
    },
    { enabled: active && state.error === null, retry: false },
  );
  return {
    ...state,
    mode,
    observed,
    erroredColumns: options.erroredColumns,
    requestColumns: requestFieldColumns,
    builderColumns,
    preview: tracePreview(state.error, preview),
  };
}

function tracePreview(
  filterError: string | null,
  query: {
    data?: RouterOutputs["topics"]["previewTraces"];
    error: { message: string } | null;
  },
): TopicTracePreview {
  if (filterError) return { status: "invalid" };
  if (query.error) return { status: "error", message: query.error.message };
  if (!query.data) return { status: "loading" };
  return {
    status: "ready",
    traces: query.data.traces,
    count: query.data.matchedTraceCount,
  };
}

/** What the setup trace filter renders; stories build it from fixtures. */
export type TopicTraceFilterModel = ReturnType<
  typeof useTopicTraceFilterState
> & {
  mode: EvaluatorFilterExperience;
  observed: ObservedOptions | undefined;
  erroredColumns?: ReadonlySet<string>;
  requestColumns?: (columns: readonly string[]) => void;
  builderColumns: ColumnDefinition[];
  preview: TopicTracePreview;
};
