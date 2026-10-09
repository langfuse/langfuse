/* eslint-disable no-nested-ternary */
/* eslint-disable @repo/no-style-props */
import { useCallback, useMemo, useState, type UIEvent } from "react";
import {
  ArrowUpRight,
  Database,
  FlaskConical,
  ListTree,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  type FilterState,
  type TimeFilter,
  type TracingSearchType,
} from "@langfuse/shared";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import {
  resolveRowHeightRendering,
  useRowHeightLocalStorage,
} from "@/src/components/table/data-table-row-height-switch";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  buildAiContext,
  EVENTS_FIELD_REGISTRY,
  EventsSearchBarRow,
  type FieldRegistry,
  observedScoreNamesFromOptions,
  useEventsSearchBar,
} from "@/src/features/search-bar";
import {
  useColumnOrder,
  useColumnVisibility,
} from "@/src/features/column-visibility";
import { api, sendAsPostOption, type RouterOutputs } from "@/src/utils/api";
import type { AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { EVALUATOR_FILTER_EXPERIENCE_STORAGE_KEY } from "@/src/features/evals/v2/constants/evaluatorFilterExperience";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { buildSampleQueryFilters } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/buildSampleQueryFilters";
import { dedupeObservationPages } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/dedupeObservations";
import { toggleExampleFilters } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/toggleExampleFilters";
import {
  type MapSampleObservedOptions,
  useSampleObservationFilterOptions,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/hooks/useSampleObservationFilterOptions";
import { useReusableRuleFilterPresets } from "@/src/features/evals/v2/hooks/useReusableRuleFilterPresets";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { formatCompactRelativeTime } from "@/src/utils/dates";

export type SampleObservation =
  RouterOutputs["events"]["all"]["observations"][number];

const PAGE_SIZE = 25;

const EXAMPLES = [
  {
    label: "Root spans",
    icon: ListTree,
    filters: [
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ] satisfies FilterState,
  },
  {
    label: "Generations",
    icon: Sparkles,
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
    ] satisfies FilterState,
  },
  {
    label: "Experiments",
    icon: FlaskConical,
    filters: [
      {
        column: "isExperimentItemRootSpan",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ] satisfies FilterState,
  },
  {
    label: "Tools",
    icon: Wrench,
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["TOOL"],
      },
    ] satisfies FilterState,
  },
] as const;

function timeFilters(range: AbsoluteTimeRange | null): FilterState {
  if (!range) return [];
  return [
    {
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: range.from,
    },
    ...(range.to
      ? ([
          {
            column: "startTime",
            type: "datetime",
            operator: "<",
            value: range.to,
          },
        ] satisfies FilterState)
      : []),
  ];
}

export type SampleObservationSelectorBaseProps = {
  projectId: string;
  timeRange: AbsoluteTimeRange | null;
  filterState: FilterState;
  onFilterStateChange: (filters: FilterState) => void;
  previewFilters: FilterState;
  tableName: string;
  registry: FieldRegistry | undefined;
  selectedObservationId: string | null;
  onSelect: (observation: SampleObservation | null) => void;
  onActivate?: (observation: SampleObservation) => void;
  onOpenTrace: (observation: SampleObservation) => void;
  leadingColumns: LangfuseColumnDef<SampleObservation>[];
  resolveSelection: (
    observations: SampleObservation[],
    selectedObservationId: string | null,
  ) => SampleObservation | null | undefined;
  getRowClassName: ((observation: SampleObservation) => string) | undefined;
  filterDescription: string;
  filterTooltip: string;
  matchingDescription: string;
  matchingTooltip: string;
  formatCount: (count: number) => string;
  mapObservedOptions: MapSampleObservedOptions;
  displayMode?: "table" | "compact-list";
  sections?: "all" | "filters" | "matches";
};

export function SampleObservationSelectorBase(
  props: SampleObservationSelectorBaseProps,
) {
  const {
    projectId,
    timeRange,
    filterState,
    onFilterStateChange,
    previewFilters,
    tableName,
    registry,
    selectedObservationId,
    onSelect,
    onActivate,
    onOpenTrace,
    leadingColumns,
    resolveSelection,
    getRowClassName,
    filterDescription,
    filterTooltip,
    matchingDescription,
    matchingTooltip,
    formatCount,
    mapObservedOptions,
    displayMode = "table",
    sections = "all",
  } = props;
  const activeRegistry = registry ?? EVENTS_FIELD_REGISTRY;
  const [filterMode, setFilterMode] =
    useLocalStorage<EvaluatorFilterExperience>(
      EVALUATOR_FILTER_EXPERIENCE_STORAGE_KEY,
      "query",
    );
  const datasets = api.datasets.allDatasetMeta.useQuery(
    { projectId },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );
  const datasetOptions = useMemo(() => datasets.data ?? [], [datasets.data]);
  const examples = useMemo(() => {
    const firstDataset = datasetOptions[0];
    return firstDataset
      ? [
          ...EXAMPLES,
          {
            label: "Datasets",
            icon: Database,
            filters: [
              {
                column: "experimentDatasetId",
                type: "stringOptions",
                operator: "any of",
                value: [firstDataset.id],
              },
            ] satisfies FilterState,
          },
        ]
      : EXAMPLES;
  }, [datasetOptions]);
  const setFilters = (
    next: FilterState | ((current: FilterState) => FilterState),
  ) => {
    const resolved = typeof next === "function" ? next(filterState) : next;
    onFilterStateChange(resolved);
  };
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<TracingSearchType[]>([]);
  const [rowHeight] = useRowHeightLocalStorage(
    `${tableName}-${projectId}-rowHeight`,
    "s",
  );
  const startTimeFilter = useMemo<TimeFilter[]>(
    () =>
      timeFilters(timeRange).filter(
        (filter): filter is TimeFilter => filter.column === "startTime",
      ),
    [timeRange],
  );
  const effectiveFilters = useMemo(
    () => buildSampleQueryFilters(previewFilters, timeFilters(timeRange)),
    [previewFilters, timeRange],
  );
  const refiningFilter = useMemo(
    () => buildSampleQueryFilters(previewFilters),
    [previewFilters],
  );
  const options = useSampleObservationFilterOptions({
    projectId,
    startTimeFilter,
    refiningFilter,
    filterMode,
    activeRegistry,
    datasetOptions,
    mapObservedOptions,
  });
  const { searchRegistry, observed, builderColumns, queryOnlyColumnIds } =
    options;
  const reusableRuleFilters = useReusableRuleFilterPresets(
    projectId,
    searchRegistry,
  );
  const capture = usePostHogClientCapture();
  const onQueryPresetPick = useCallback(
    (presetId: string) => {
      const preset = reusableRuleFilters.presets.find(
        (candidate) => candidate.id === presetId,
      );
      if (!preset) return;
      capture("evaluation_rules:filter_reused", {
        tableName,
        evaluatorCount: preset.evaluatorCount,
        filterCount: preset.filterCount,
        replacedFilterCount: filterState.length,
        isV4: true,
      });
    },
    [capture, filterState.length, reusableRuleFilters.presets, tableName],
  );
  const search = useEventsSearchBar({
    projectId,
    tableName,
    enabled: !datasets.isPending,
    filterState,
    searchQuery,
    searchType,
    observed,
    setFilterState: (next) => {
      setFilters(next);
    },
    setSearchQuery: (next) => {
      setSearchQuery(next);
    },
    setSearchType: (next) => {
      setSearchType(next);
    },
    registry: searchRegistry,
  });
  // listCursor always reads in the events table's stable start_time DESC tuple
  // order, so it takes no orderBy.
  const observationQuery = api.events.listCursor.useInfiniteQuery(
    {
      projectId,
      filter: effectiveFilters,
      searchQuery,
      searchType,
      limit: PAGE_SIZE,
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const observationPages = useMemo(
    () =>
      dedupeObservationPages(
        observationQuery.data?.pages.map((page) => page.observations) ?? [],
      ),
    [observationQuery.data?.pages],
  );
  const matchingObservations = observationPages.flat();
  const observationIOPages = api.useQueries((t) =>
    displayMode === "compact-list"
      ? []
      : observationPages
          .filter((page) => page.length > 0)
          .map((page) => {
            const observations = page.filter(
              (observation) =>
                observation.id && observation.traceId && observation.startTime,
            );
            const startTimes = observations.map((observation) =>
              observation.startTime.getTime(),
            );

            return t.events.batchIO(
              {
                projectId,
                observations: observations.map((observation) => ({
                  id: observation.id,
                  traceId: observation.traceId!,
                })),
                minStartTime: new Date(
                  startTimes.length > 0 ? Math.min(...startTimes) : 0,
                ),
                maxStartTime: new Date(
                  startTimes.length > 0 ? Math.max(...startTimes) : 0,
                ),
              },
              {
                ...sendAsPostOption,
                enabled: observationQuery.isSuccess && observations.length > 0,
              },
            );
          }),
  );
  const observationIOById = useMemo(
    () =>
      new Map(
        observationIOPages
          .flatMap((page) => page.data ?? [])
          .map((io) => [io.id, io]),
      ),
    [observationIOPages],
  );
  const observationIOPending = observationIOPages.some(
    (page) => page.isPending,
  );
  const observationsPending = observationQuery.isPending;
  const observationsFetching = observationQuery.isFetchingNextPage;
  const observationsError = observationQuery.error;
  const aiDataContext = useMemo(
    () =>
      buildAiContext({
        observed,
        sampleMetadata: matchingObservations
          .slice(0, 30)
          .map((observation) => observation.metadata),
        resultCount: observationQuery.isSuccess
          ? matchingObservations.length
          : null,
        registry: searchRegistry,
      }),
    [
      searchRegistry,
      matchingObservations,
      observationQuery.isSuccess,
      observed,
    ],
  );
  const aiScoreNames = useMemo(
    () =>
      searchRegistry.scores
        ? observedScoreNamesFromOptions(observed)
        : undefined,
    [searchRegistry, observed],
  );
  const selectionToReconcile = observationQuery.isSuccess
    ? resolveSelection(matchingObservations, selectedObservationId)
    : undefined;

  const columns = useMemo<LangfuseColumnDef<SampleObservation>[]>(
    () => [
      ...leadingColumns,
      createDateTableColumn<SampleObservation>({
        accessorKey: "startTime",
        header: "Start time",
        size: 170,
        enableHiding: true,
      }),
      createTextTableColumn<SampleObservation>({
        accessorKey: "type",
        header: "Type",
        size: 110,
        enableHiding: true,
      }),
      createTextTableColumn<SampleObservation>({
        accessorKey: "name",
        header: "Name",
        size: 200,
        enableHiding: true,
        mapValue: (value) => value ?? "—",
      }),
      createTextTableColumn<SampleObservation>({
        accessorKey: "traceName",
        header: "Trace name",
        size: 180,
        enableHiding: true,
        defaultHidden: true,
        mapValue: (value) => value ?? "—",
      }),
      createIOTableColumn<SampleObservation>({
        accessorKey: "input",
        header: "Input",
        size: 300,
        enableHiding: true,
        getCell: (_value, { row }) => {
          const io = observationIOById.get(row.original.id);
          if (!io && observationIOPending) return { type: "loading" };
          return io?.input;
        },
        singleLine: resolveRowHeightRendering({ preset: rowHeight }).compact,
        enableExpandOnHover: true,
        variant: "input",
      }),
      createIOTableColumn<SampleObservation>({
        accessorKey: "output",
        header: "Output",
        size: 300,
        enableHiding: true,
        getCell: (_value, { row }) => {
          const io = observationIOById.get(row.original.id);
          if (!io && observationIOPending) return { type: "loading" };
          return io?.output;
        },
        singleLine: resolveRowHeightRendering({ preset: rowHeight }).compact,
        enableExpandOnHover: true,
        variant: "output",
      }),
      createIOTableColumn<SampleObservation>({
        accessorKey: "metadata",
        header: "Metadata",
        size: 300,
        enableHiding: true,
        getCell: (_value, { row }) => {
          const io = observationIOById.get(row.original.id);
          if (!io && observationIOPending) return { type: "loading" };
          return io?.metadata;
        },
        singleLine: resolveRowHeightRendering({ preset: rowHeight }).compact,
        enableExpandOnHover: true,
      }),
      createTextTableColumn<SampleObservation>({
        accessorKey: "environment",
        header: "Environment",
        size: 130,
        enableHiding: true,
        defaultHidden: true,
      }),
    ],
    [observationIOById, observationIOPending, leadingColumns, rowHeight],
  );
  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<SampleObservation>(
      `${tableName}-${projectId}-columns`,
      columns,
    );
  const [columnOrder, setColumnOrder] = useColumnOrder<SampleObservation>(
    `${tableName}-${projectId}-columnOrder`,
    columns,
  );

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (
      observationQuery.hasNextPage &&
      !observationsFetching &&
      element.scrollHeight - element.scrollTop - element.clientHeight < 80
    ) {
      observationQuery.fetchNextPage().catch(() => undefined);
    }
  };

  return (
    <div className="flex shrink-0 flex-col gap-6">
      {sections !== "matches" ? (
        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Filter observations"
            meta={null}
            description={filterDescription}
            tooltip={filterTooltip}
            trailing={
              <FilterModeToggle
                mode={filterMode}
                onChange={(mode) => {
                  if (mode === "builder" && searchQuery !== null) {
                    search.applyFilters(filterState);
                  }
                  setFilterMode(mode);
                }}
              />
            }
          />
          {datasets.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : filterMode === "query" ? (
            <EventsSearchBarRow
              projectId={projectId}
              tableName={tableName}
              store={search.store}
              commit={search.commit}
              observed={observed}
              erroredColumns={options.erroredColumns}
              registry={searchRegistry}
              onApplyFilters={search.applyFilters}
              onRequestColumns={options.requestColumns}
              presetSections={reusableRuleFilters.sections}
              onQueryPresetPick={onQueryPresetPick}
              aiDataContext={aiDataContext}
              aiScoreNames={aiScoreNames}
              className="p-0"
            />
          ) : (
            <ObservationFilterBuilder
              columns={builderColumns}
              filterState={filterState}
              onChange={setFilters}
              queryOnlyColumnIds={queryOnlyColumnIds}
            />
          )}
          {filterMode === "query" ? (
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <Button
                  key={example.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex h-8 items-center gap-2 text-sm"
                  onClick={() => {
                    setFilters((current) =>
                      toggleExampleFilters(current, [...example.filters]),
                    );
                  }}
                >
                  <example.icon className="icon-base" />
                  <span>{example.label}</span>
                </Button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {sections !== "filters" ? (
        <section className="flex min-h-0 flex-col gap-2">
          <SectionHeader
            title="Matching observations"
            meta={
              options.approxTotalCount !== null ? (
                <span className="text-muted-foreground shrink-0 text-sm">
                  {formatCount(options.approxTotalCount)}
                </span>
              ) : null
            }
            description={matchingDescription}
            tooltip={matchingTooltip}
            trailing={
              displayMode === "compact-list" ? null : (
                <DataTableColumnVisibilityFilter
                  tableName="evaluator-sample-observations"
                  isV4
                  columns={columns}
                  columnVisibility={columnVisibility}
                  setColumnVisibility={setColumnVisibility}
                  columnOrder={columnOrder}
                  setColumnOrder={setColumnOrder}
                  triggerSize="sm"
                />
              )
            }
          />
          <div
            ref={
              selectionToReconcile !== undefined
                ? (element) => {
                    // Commit fresh query results through the existing selection owner without a data-sync effect.
                    if (element) onSelect(selectionToReconcile);
                  }
                : undefined
            }
            className={
              displayMode === "compact-list"
                ? "flex min-h-0 flex-1 flex-col overflow-y-auto"
                : "flex h-64 min-h-0 flex-col overflow-hidden rounded-md border"
            }
            onScroll={displayMode === "compact-list" ? handleScroll : undefined}
          >
            {displayMode === "compact-list" ? (
              <div className="space-y-1 pb-2">
                {observationsPending && matchingObservations.length === 0 ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : observationsError ? (
                  <p className="text-destructive px-2 py-6 text-sm">
                    {observationsError.message}
                  </p>
                ) : matchingObservations.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-6 text-sm">
                    No observations match this filter and time range.
                  </p>
                ) : (
                  matchingObservations.map((observation) => {
                    const selected = observation.id === selectedObservationId;
                    return (
                      <div
                        key={observation.id}
                        className={`flex w-full items-start rounded-lg border text-left transition-colors ${
                          selected
                            ? "border-primary bg-primary/5 ring-primary/20 ring-1"
                            : "hover:border-border hover:bg-muted/50 border-transparent"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(observation);
                            onActivate?.(observation);
                          }}
                          className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left"
                        >
                          <ItemBadge
                            type={observation.type as LangfuseItemType}
                            isSmall
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className="truncate text-sm font-bold"
                              title={observation.name ?? observation.type}
                            >
                              {observation.name ?? observation.type}
                            </div>
                            <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]">
                              <span
                                className="truncate"
                                title={
                                  observation.traceName ??
                                  observation.traceId ??
                                  undefined
                                }
                              >
                                {observation.traceName ?? observation.traceId}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="shrink-0">
                                {formatCompactRelativeTime(
                                  observation.startTime,
                                )}
                              </span>
                            </div>
                            <div className="text-muted-foreground/70 mt-1 font-mono text-[10px]">
                              {observation.id.slice(0, 8)}
                            </div>
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="m-1.5 h-8 w-8 shrink-0"
                          title="Open this example in context"
                          aria-label={`Open ${observation.name ?? observation.id} in context`}
                          onClick={() => onOpenTrace(observation)}
                        >
                          <ArrowUpRight className="icon-base" />
                        </Button>
                      </div>
                    );
                  })
                )}
                {observationsFetching ? (
                  <Skeleton className="h-12 w-full" />
                ) : null}
              </div>
            ) : (
              <DataTable
                tableName={tableName}
                columns={columns}
                data={
                  observationsPending && matchingObservations.length === 0
                    ? { isLoading: true, isError: false }
                    : observationsError
                      ? {
                          isLoading: false,
                          isError: true,
                          error: observationsError.message,
                        }
                      : {
                          isLoading: false,
                          isError: false,
                          data: matchingObservations,
                        }
                }
                hidePagination
                onScroll={handleScroll}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibility}
                columnOrder={columnOrder}
                onColumnOrderChange={setColumnOrder}
                rowHeight={rowHeight}
                onRowClick={onOpenTrace}
                getRowClassName={getRowClassName}
                noResultsMessage="No observations match the current filters and time range."
              />
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
