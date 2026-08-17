import { useMemo, useState, type UIEvent } from "react";
import { EyeOff, FlaskConical, ListTree, Sparkles, Wrench } from "lucide-react";
import {
  type FilterState,
  type TimeFilter,
  type TracingSearchType,
} from "@langfuse/shared";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { buildAiContext } from "@/src/features/search-bar/lib/ai-context";
import type { FieldRegistry } from "@/src/features/search-bar/lib/fields";
import { EVENTS_FIELD_REGISTRY } from "@/src/features/search-bar/lib/fields";
import {
  observedScoreNamesFromOptions,
  toObservedOptions,
} from "@/src/features/search-bar/lib/observed-options";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api, sendAsPostOption, type RouterOutputs } from "@/src/utils/api";
import type { AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { EXPERIMENTS_AND_EVALS_EXCLUSION_FILTERS } from "@/src/features/search-bar/lib/filter-aliases";

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
  {
    label: "Exclude experiments & evals",
    icon: EyeOff,
    filters: EXPERIMENTS_AND_EVALS_EXCLUSION_FILTERS,
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
  mapObservedOptions: (
    observed: ReturnType<typeof toObservedOptions>,
  ) => ReturnType<typeof toObservedOptions>;
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
  } = props;
  const [pageCount, setPageCount] = useState(1);
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
    () => [...previewFilters, ...timeFilters(timeRange)],
    [previewFilters, timeRange],
  );
  const options = useEventsFilterOptions({
    projectId,
    startTimeFilter,
    refiningFilter: previewFilters,
    includeApproxCount: true,
    lazy: true,
  });
  const observed = useMemo(
    () =>
      mapObservedOptions(
        toObservedOptions(
          options.filterOptions,
          options.isFilterOptionsPending,
        ),
      ),
    [mapObservedOptions, options.filterOptions, options.isFilterOptionsPending],
  );
  const search = useEventsSearchBar({
    projectId,
    tableName,
    enabled: true,
    filterState,
    searchQuery,
    searchType,
    observed,
    setFilterState: (next) => {
      setPageCount(1);
      setFilters(next);
    },
    setSearchQuery: (next) => {
      setPageCount(1);
      setSearchQuery(next);
    },
    setSearchType: (next) => {
      setPageCount(1);
      setSearchType(next);
    },
    ...(registry ? { registry } : {}),
  });
  const queryInput = {
    projectId,
    filter: effectiveFilters,
    searchQuery,
    searchType,
    orderBy: { column: "startTime", order: "DESC" as const },
  };
  const observationPages = api.useQueries((t) =>
    Array.from({ length: pageCount }, (_, index) =>
      t.events.all(
        { ...queryInput, page: index + 1, limit: PAGE_SIZE },
        { placeholderData: (previous) => previous },
      ),
    ),
  );
  const matchingObservations = observationPages.flatMap(
    (page) => page.data?.observations ?? [],
  );
  const observationIOPages = api.useQueries((t) =>
    observationPages.map((page) => {
      const observations = (page.data?.observations ?? []).filter(
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
          enabled:
            page.status === "success" &&
            !page.isPlaceholderData &&
            observations.length > 0,
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
  const observationsPending = observationPages.some((page) => page.isPending);
  const observationsFetching = observationPages.some((page) => page.isFetching);
  const observationsError = observationPages.find((page) => page.isError);
  const lastObservationPage = observationPages.at(-1);
  const aiDataContext = useMemo(
    () =>
      buildAiContext({
        observed,
        sampleMetadata: matchingObservations
          .slice(0, 30)
          .map((observation) => observation.metadata),
        resultCount: observationPages.every((page) => page.status === "success")
          ? matchingObservations.length
          : null,
        registry: registry ?? EVENTS_FIELD_REGISTRY,
      }),
    [matchingObservations, observationPages, observed, registry],
  );
  const aiScoreNames = useMemo(
    () =>
      (registry ?? EVENTS_FIELD_REGISTRY).scores
        ? observedScoreNamesFromOptions(observed)
        : undefined,
    [observed, registry],
  );
  const selectionToReconcile =
    observationPages[0]?.status === "success" &&
    !observationPages[0].isPlaceholderData
      ? resolveSelection(matchingObservations, selectedObservationId)
      : undefined;

  const columns = useMemo<LangfuseColumnDef<SampleObservation>[]>(
    () => [
      ...leadingColumns,
      {
        accessorKey: "startTime",
        id: "startTime",
        header: "Start time",
        size: 170,
        enableHiding: true,
        cell: ({ row }) => <LocalIsoDate date={row.original.startTime} />,
      },
      {
        accessorKey: "type",
        id: "type",
        header: "Type",
        size: 110,
        enableHiding: true,
      },
      {
        accessorKey: "name",
        id: "name",
        header: "Name",
        size: 200,
        enableHiding: true,
        cell: ({ row }) => row.original.name ?? "—",
      },
      {
        accessorKey: "traceName",
        id: "traceName",
        header: "Trace name",
        size: 180,
        enableHiding: true,
        defaultHidden: true,
        cell: ({ row }) => row.original.traceName ?? "—",
      },
      {
        accessorKey: "input",
        id: "input",
        header: "Input",
        size: 300,
        enableHiding: true,
        cell: ({ row }) => {
          const io = observationIOById.get(row.original.id);
          return (
            <MemoizedIOTableCell
              isLoading={!io && observationIOPending}
              data={io?.input}
              className="bg-muted/50"
              singleLine={rowHeight === "s"}
              enableExpandOnHover={rowHeight === "s"}
            />
          );
        },
      },
      {
        accessorKey: "output",
        id: "output",
        header: "Output",
        size: 300,
        enableHiding: true,
        cell: ({ row }) => {
          const io = observationIOById.get(row.original.id);
          return (
            <MemoizedIOTableCell
              isLoading={!io && observationIOPending}
              data={io?.output}
              className="bg-accent-light-green"
              singleLine={rowHeight === "s"}
              enableExpandOnHover={rowHeight === "s"}
            />
          );
        },
      },
      {
        accessorKey: "metadata",
        id: "metadata",
        header: "Metadata",
        size: 300,
        enableHiding: true,
        cell: ({ row }) => {
          const io = observationIOById.get(row.original.id);
          return (
            <MemoizedIOTableCell
              isLoading={!io && observationIOPending}
              data={io?.metadata}
              singleLine={rowHeight === "s"}
              enableExpandOnHover={rowHeight === "s"}
            />
          );
        },
      },
      {
        accessorKey: "environment",
        id: "environment",
        header: "Environment",
        size: 130,
        enableHiding: true,
        defaultHidden: true,
      },
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
      lastObservationPage?.data?.hasMore &&
      !observationsFetching &&
      element.scrollHeight - element.scrollTop - element.clientHeight < 80
    ) {
      setPageCount((current) => current + 1);
    }
  };

  return (
    <div className="flex shrink-0 flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Filter observations"
          meta={null}
          description={filterDescription}
          tooltip={filterTooltip}
          trailing={null}
        />
        <EventsSearchBarRow
          projectId={projectId}
          tableName={tableName}
          store={search.store}
          commit={search.commit}
          observed={observed}
          erroredColumns={options.erroredColumns}
          {...(registry ? { registry } : {})}
          onApplyFilters={search.applyFilters}
          onRequestColumns={options.requestColumns}
          aiDataContext={aiDataContext}
          aiScoreNames={aiScoreNames}
          className="p-0"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <Button
              key={example.label}
              type="button"
              variant="outline"
              size="sm"
              className="flex h-8 items-center gap-2 text-sm"
              onClick={() => {
                setPageCount(1);
                setFilters((current) => {
                  const next = [...current];
                  for (const addition of example.filters) {
                    const index = next.findIndex(
                      (filter) =>
                        filter.column === addition.column &&
                        filter.type === addition.type &&
                        filter.operator === addition.operator,
                    );
                    if (index < 0) {
                      next.push(addition);
                      continue;
                    }
                    const existing = next[index];
                    if (
                      Array.isArray(existing.value) &&
                      Array.isArray(addition.value)
                    ) {
                      next[index] = {
                        ...existing,
                        value: Array.from(
                          new Set([...existing.value, ...addition.value]),
                        ),
                      } as typeof existing;
                    }
                  }
                  return next;
                });
              }}
            >
              <example.icon className="h-4 w-4" />
              <span>{example.label}</span>
            </Button>
          ))}
        </div>
      </section>

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
            <DataTableColumnVisibilityFilter
              columns={columns}
              columnVisibility={columnVisibility}
              setColumnVisibility={setColumnVisibility}
              columnOrder={columnOrder}
              setColumnOrder={setColumnOrder}
              triggerSize="sm"
            />
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
          className="flex h-64 min-h-0 flex-col overflow-hidden rounded-md border"
        >
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
                      error: observationsError.error.message,
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
        </div>
      </section>
    </div>
  );
}
