import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
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
import { Table } from "@/src/components/design-system/table/Table";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { env } from "@/src/env.mjs";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import {
  removeInternalEvaluationEnvironmentColumnOptions,
  removeInternalEvaluationEnvironmentOptions,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/buildSampleQueryFilters";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { api, type RouterOutputs } from "@/src/utils/api";
import { compactNumberFormatter } from "@/src/utils/numbers";

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
const BUILDER_OPTION_COLUMNS = [
  "environment",
  "name",
  "traceTags",
  "traceName",
] as const;
// Matches the setup backfill window.
const WINDOW_MS = 7 * 86_400_000;
const PREVIEW_TRACES = 20;

type TracePreview = RouterOutputs["topics"]["previewTraces"]["traces"][number];

/** The first rule's trace filter in the setup flow, with the latest traces it matches. */
export function TopicTraceFilterSection({
  projectId,
  filters,
  onFiltersChange,
}: {
  projectId: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const [mode, setMode] = useState<EvaluatorFilterExperience>("query");
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<TracingSearchType[]>([]);
  const [range] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - WINDOW_MS), to };
  });
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
  const options = useEventsFilterOptions({
    projectId,
    startTimeFilter,
    lazy: mode === "query",
    columns: mode === "builder" ? [...BUILDER_OPTION_COLUMNS] : undefined,
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
  const filterValid = topicRuleFilterError(filters) === null;
  const preview = api.topics.previewTraces.useQuery(
    {
      projectId,
      filter: filters,
      ...range,
      limit: PREVIEW_TRACES,
      sampling: "latest",
      seed: "topics-setup",
    },
    { enabled: filterValid, retry: false },
  );

  return (
    <div className="ph-no-capture flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Filter traces"
          meta={null}
          description="A trace matches when one of its observations meets every filter."
          tooltip={TOPICS_RULE_FILTER_HINT}
          trailing={
            <FilterModeToggle
              mode={mode}
              onChange={(next) => {
                if (next === "builder" && searchQuery !== null)
                  search.applyFilters(filters);
                setMode(next);
              }}
            />
          }
        />
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
      </section>
      <section className="flex min-h-0 flex-col gap-2">
        <SectionHeader
          title="Matching traces"
          meta={
            preview.data ? (
              <span className="text-muted-foreground shrink-0 text-sm">
                ({compactNumberFormatter(preview.data.matchedTraceCount)}{" "}
                {preview.data.matchedTraceCount === 1 ? "trace" : "traces"})
              </span>
            ) : null
          }
          description="The latest traces from the last seven days that match the filters."
          tooltip="Traces that are still running are included."
          trailing={null}
        />
        <MatchingTraceTable
          projectId={projectId}
          traces={preview.data?.traces}
          error={preview.error?.message ?? null}
          loading={filterValid && preview.isPending}
        />
      </section>
    </div>
  );
}

function MatchingTraceTable({
  projectId,
  traces,
  error,
  loading,
}: {
  projectId: string;
  traces: TracePreview[] | undefined;
  error: string | null;
  loading: boolean;
}) {
  const columns = matchingTraceColumns(projectId);
  return (
    <div className="flex h-72 min-h-0 min-w-0 flex-col overflow-hidden rounded-md border">
      <Table
        tableName="Topics setup matching traces"
        columns={columns}
        data={tableData(traces, error, loading)}
        onRowClick={(trace) => openTrace(projectId, trace)}
        noResultsMessage="No traces in the last seven days match these filters."
      />
    </div>
  );
}

function tableData(
  traces: TracePreview[] | undefined,
  error: string | null,
  loading: boolean,
) {
  if (error) return { status: "error" as const, error };
  if (loading || !traces) return { status: "loading" as const };
  return { status: "success" as const, data: traces };
}

function TraceNameCell({
  trace,
  path,
  onOpen,
}: {
  trace: TracePreview;
  path: string;
  onOpen: (trace: TracePreview) => void;
}) {
  return (
    <div className="min-w-0">
      <TextLink
        path={path}
        value={trace.name ?? trace.id}
        onClick={() => onOpen(trace)}
      />
      {trace.name ? (
        <span
          title={trace.id}
          className="text-muted-foreground block truncate font-mono text-xs"
        >
          {trace.id}
        </span>
      ) : null}
    </div>
  );
}

const tracePath = (projectId: string, traceId: string) =>
  `/project/${projectId}/traces/${encodeURIComponent(traceId)}`;

function openTrace(projectId: string, trace: TracePreview) {
  window.open(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}${tracePath(projectId, trace.id)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function matchingTraceColumns(projectId: string): ColumnDef<TracePreview>[] {
  return [
    {
      accessorKey: "name",
      header: "Trace",
      size: 320,
      cell: ({ row }) => (
        <TraceNameCell
          trace={row.original}
          path={tracePath(projectId, row.original.id)}
          onOpen={(trace) => openTrace(projectId, trace)}
        />
      ),
    },
    {
      accessorKey: "timestamp",
      header: "Latest match",
      size: 176,
      cell: ({ row }) => new Date(row.original.timestamp).toLocaleString(),
    },
    { accessorKey: "environment", header: "Environment", size: 128 },
  ];
}
