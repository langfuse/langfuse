import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import {
  EventsSearchBarRow,
  toObservedOptions,
  useEventsSearchBar,
} from "@/src/features/search-bar";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import {
  eventsEvalFilterColumns,
  experimentEvalFilterColsWithOptions,
  observationEvalFilterColsWithOptions,
  type FilterState,
  type TimeFilter,
  type TracingSearchType,
} from "@langfuse/shared";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { api, sendAsPostOption } from "@/src/utils/api";
import { relativeTopicTimeRange } from "./time-range";

const SAMPLE_TRACES_IN_SCOPE = [
  {
    start: "2026-10-08 15:58:44",
    type: "GENERATION",
    name: "billing-question",
    input: '{"role":"user","content":"My subscription invoice..."}',
  },
  {
    start: "2026-10-08 15:58:43",
    type: "GENERATION",
    name: "weather-question",
    input: '{"role":"user","content":"I\'m visiting Lisbon this..."}',
  },
  {
    start: "2026-10-08 15:54:02",
    type: "SPAN",
    name: "weather-question",
    input: '{"role":"user","content":"What is the weather in..."}',
  },
];

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

const BUILDER_OPTION_COLUMNS = [
  "environment",
  "name",
  "traceTags",
  "traceName",
  "calledToolNames",
] as const;

function authoredTraceFilters(filters: FilterState): FilterState {
  return filters.flatMap((filter) => {
    if (filter.column === "isRootObservation") return [];
    if (filter.column === "tags")
      return [{ ...filter, column: "traceTags" as const }];
    return [filter];
  });
}

function matchCountLabel(count: number | null) {
  if (count === null) return null;
  const noun = count === 1 ? "match" : "matches";
  return `(${count} ${noun})`;
}

function previewStatus(
  pending: boolean,
  error: string | undefined,
  rowCount: number,
) {
  if (pending) return "Loading traces…";
  if (error) return error;
  if (rowCount === 0) return "No traces match this filter in the last 7 days.";
  return null;
}

export function TopicAutomaticTraceScope({
  projectId,
  filters,
  onFiltersChange,
}: TopicAutomaticTraceScopeProps) {
  if (!projectId)
    return (
      <SampleTraceScope filters={filters} onFiltersChange={onFiltersChange} />
    );
  return (
    <ProjectTraceScope
      projectId={projectId}
      filters={filters}
      onFiltersChange={onFiltersChange}
    />
  );
}

function SampleTraceScope({
  filters,
  onFiltersChange,
}: {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  return (
    <TraceScopeFrame
      projectId={undefined}
      filters={filters}
      onFiltersChange={onFiltersChange}
      countLabel="Sample"
      rows={SAMPLE_TRACES_IN_SCOPE}
    />
  );
}

function ProjectTraceScope({
  projectId,
  filters,
  onFiltersChange,
}: {
  projectId: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const [range] = useState(() => relativeTopicTimeRange(7));
  const [mode, setMode] = useState<EvaluatorFilterExperience>("query");
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<TracingSearchType[]>([]);
  const startTimeFilter = useMemo<TimeFilter[]>(
    () => [
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: range.from,
      },
      {
        column: "startTime",
        type: "datetime",
        operator: "<",
        value: range.to,
      },
    ],
    [range],
  );
  const authored = useMemo(() => authoredTraceFilters(filters), [filters]);
  const options = useEventsFilterOptions({
    projectId,
    startTimeFilter,
    refiningFilter: authored,
    isRootObservation: true,
    includeApproxCount: true,
    lazy: mode === "query",
    columns: mode === "query" ? undefined : [...BUILDER_OPTION_COLUMNS],
    enabled: true,
  });
  const observed = useMemo(
    () =>
      toObservedOptions(options.filterOptions, options.isFilterOptionsPending),
    [options.filterOptions, options.isFilterOptionsPending],
  );
  const previewFilters = useMemo<FilterState>(
    () => [
      ...authored,
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
      ...startTimeFilter,
    ],
    [authored, startTimeFilter],
  );
  const preview = api.events.listCursor.useQuery({
    projectId,
    filter: previewFilters,
    searchQuery,
    searchType,
    limit: 10,
  });
  const observations = preview.data?.observations ?? [];
  const ioTargets = observations.flatMap((observation) =>
    observation.traceId
      ? [{ id: observation.id, traceId: observation.traceId }]
      : [],
  );
  const startTimes = observations.map((observation) =>
    observation.startTime.getTime(),
  );
  const io = api.events.batchIO.useQuery(
    {
      projectId,
      observations: ioTargets,
      minStartTime: new Date(
        startTimes.length > 0 ? Math.min(...startTimes) : 0,
      ),
      maxStartTime: new Date(
        startTimes.length > 0 ? Math.max(...startTimes) : 0,
      ),
    },
    {
      ...sendAsPostOption,
      enabled: preview.isSuccess && ioTargets.length > 0,
    },
  );
  const inputById = new Map((io.data ?? []).map((row) => [row.id, row.input]));
  const builderColumns = useMemo(
    () =>
      experimentEvalFilterColsWithOptions(
        options.filterOptions,
        observationEvalFilterColsWithOptions(
          {
            ...options.filterOptions,
            tags: options.filterOptions?.traceTags,
          },
          [...eventsEvalFilterColumns],
        ),
      ).flatMap((column) =>
        column.id === "isRootObservation" ? [] : [column],
      ),
    [options.filterOptions],
  );
  const rows = observations.map((observation) => ({
    id: observation.id,
    start: format(observation.startTime, "yyyy-MM-dd HH:mm:ss"),
    type: observation.type,
    name: observation.name ?? "—",
    input: inputById.get(observation.id) ?? (io.isPending ? "…" : ""),
  }));
  const status = previewStatus(
    preview.isPending,
    preview.error?.message,
    rows.length,
  );

  return (
    <TraceScopeFrame
      projectId={projectId}
      mode={mode}
      filters={filters}
      searchQuery={searchQuery}
      observed={observed}
      builderColumns={builderColumns}
      erroredColumns={options.erroredColumns}
      onRequestColumns={options.requestColumns}
      countLabel={matchCountLabel(options.approxTotalCount)}
      description="Root observations from the last 7 days. Topics summarizes the whole trace."
      tooltip="The same filter Topics uses when it selects traces, limited to the last 7 days. Only root observations are shown."
      rows={rows}
      status={status}
      searchType={searchType}
      onModeChange={setMode}
      onFiltersChange={onFiltersChange}
      onSearchQueryChange={setSearchQuery}
      onSearchTypeChange={setSearchType}
    />
  );
}

function TraceScopeFrame({
  projectId,
  mode: modeProp,
  filters: filtersProp,
  searchQuery: searchQueryProp,
  searchType: searchTypeProp,
  observed,
  builderColumns,
  erroredColumns,
  onRequestColumns,
  countLabel,
  description,
  tooltip,
  rows,
  status,
  onModeChange,
  onFiltersChange,
  onSearchQueryChange,
  onSearchTypeChange,
}: {
  projectId?: string;
  mode?: EvaluatorFilterExperience;
  filters?: FilterState;
  searchQuery?: string | null;
  searchType?: TracingSearchType[];
  observed?: ReturnType<typeof toObservedOptions>;
  builderColumns?: ReturnType<typeof experimentEvalFilterColsWithOptions>;
  erroredColumns?: ReadonlySet<string>;
  onRequestColumns?: (columns: readonly string[]) => void;
  countLabel?: string | null;
  description?: string;
  tooltip?: string;
  rows: Array<{
    id?: string;
    start: string;
    type: string;
    name: string;
    input: string;
  }>;
  status?: string | null;
  onModeChange?: (mode: EvaluatorFilterExperience) => void;
  onFiltersChange?: (filters: FilterState) => void;
  onSearchQueryChange?: (query: string | null) => void;
  onSearchTypeChange?: (searchType: TracingSearchType[]) => void;
}) {
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
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Filter traces"
          meta={<Badge text="Coming soon" color="blue" size="sm" />}
          description="The sampling rate applies to all incoming traces. Custom trace filters are coming soon."
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
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Matching traces"
          meta={
            countLabel ? (
              <span className="text-muted-foreground text-sm">
                {countLabel}
              </span>
            ) : null
          }
          description={
            description ?? "A sample of traces this setup would include."
          }
          tooltip={
            tooltip ??
            "A fixed sample. The filter is applied when traces are processed, not in this table."
          }
          trailing={null}
        />
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground bg-background sticky top-0">
              <tr className="border-b">
                <th className="px-3 py-2 font-normal">Start time</th>
                <th className="px-3 py-2 font-normal">Type</th>
                <th className="px-3 py-2 font-normal">Name</th>
                <th className="px-3 py-2 font-normal">Input</th>
              </tr>
            </thead>
            <tbody>
              {status ? (
                <tr>
                  <td className="text-muted-foreground px-3 py-2" colSpan={4}>
                    {status}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id ?? `${row.start}-${row.name}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{row.start}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td
                      className="text-muted-foreground max-w-48 truncate px-3 py-2"
                      title={row.input}
                    >
                      {row.input}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type TopicAutomaticTraceScopeProps = {
  projectId?: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
};
