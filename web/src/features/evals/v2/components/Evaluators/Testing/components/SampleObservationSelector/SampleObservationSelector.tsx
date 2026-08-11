import { useMemo, useState, type UIEvent } from "react";
import {
  EyeOff,
  FlaskConical,
  ListTree,
  Sparkles,
  Star,
  Wrench,
} from "lucide-react";
import {
  type FilterState,
  type TimeFilter,
  type TracingSearchType,
} from "@langfuse/shared";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
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
import {
  observedScoreNamesFromOptions,
  toObservedOptions,
} from "@/src/features/search-bar/lib/observed-options";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { api, sendAsPostOption, type RouterOutputs } from "@/src/utils/api";
import type { AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";

export type SampleObservation =
  RouterOutputs["events"]["all"]["observations"][number];

const PAGE_SIZE = 25;

const EVALUATION_EXCLUSIONS: FilterState = [
  {
    column: "environment",
    type: "string",
    operator: "does not contain",
    value: "langfuse-",
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "none of",
    value: ["sdk-experiment"],
  },
];

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
        column: "experimentId",
        type: "null",
        operator: "is not null",
        value: "",
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
    label: "Exclude evaluations and experiments",
    icon: EyeOff,
    filters: EVALUATION_EXCLUSIONS,
  },
] as const;

export function mergeSampleFilters(
  current: FilterState,
  additions: FilterState,
): FilterState {
  const next = [...current];
  for (const addition of additions) {
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
    if (Array.isArray(existing.value) && Array.isArray(addition.value)) {
      next[index] = {
        ...existing,
        value: Array.from(new Set([...existing.value, ...addition.value])),
      } as typeof existing;
    }
  }
  return next;
}

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

export function SampleObservationSelector({
  projectId,
  timeRange,
  selectedObservationId,
  onSelect,
  onOpenTrace,
}: {
  projectId: string;
  timeRange: AbsoluteTimeRange | null;
  selectedObservationId: string | null;
  onSelect: (observation: SampleObservation | null) => void;
  onOpenTrace: (observation: SampleObservation) => void;
}) {
  const [pageCount, setPageCount] = useState(1);
  const [filters, setFilters] = useState<FilterState>([]);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<TracingSearchType[]>([]);
  const [rowHeight] = useRowHeightLocalStorage(
    `evaluatorSampleObservations-${projectId}`,
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
    () => [...filters, ...timeFilters(timeRange)],
    [filters, timeRange],
  );
  const options = useEventsFilterOptions({
    projectId,
    startTimeFilter,
    refiningFilter: filters,
    lazy: true,
  });
  const observed = useMemo(
    () =>
      toObservedOptions(options.filterOptions, options.isFilterOptionsPending),
    [options.filterOptions, options.isFilterOptionsPending],
  );
  const search = useEventsSearchBar({
    projectId,
    tableName: "evaluator-sample-observations",
    enabled: true,
    filterState: filters,
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
  const count = api.events.countAll.useQuery(queryInput);
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
      }),
    [matchingObservations, observationPages, observed],
  );
  const aiScoreNames = useMemo(
    () => observedScoreNamesFromOptions(observed),
    [observed],
  );
  const selectedObservationMatches = matchingObservations.some(
    (observation) => observation.id === selectedObservationId,
  );
  const selectionToReconcile =
    observationPages[0]?.status === "success" &&
    !observationPages[0].isPlaceholderData &&
    ((selectedObservationId === null && matchingObservations.length > 0) ||
      (selectedObservationId !== null && !selectedObservationMatches))
      ? (matchingObservations[0] ?? null)
      : undefined;

  const columns = useMemo<LangfuseColumnDef<SampleObservation>[]>(
    () => [
      {
        accessorKey: "sample",
        id: "sample",
        header: () => (
          <>
            <Star aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">Sample</span>
          </>
        ),
        size: 72,
        enableHiding: false,
        isFixedPosition: true,
        isPinnedLeft: true,
        cell: ({ row }) => (
          <Checkbox
            checked={selectedObservationId === row.original.id}
            aria-label={`Use ${row.original.name ?? row.original.id} as sample`}
            onCheckedChange={() => onSelect(row.original)}
          />
        ),
      },
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
    [
      observationIOById,
      observationIOPending,
      onSelect,
      rowHeight,
      selectedObservationId,
    ],
  );
  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<SampleObservation>(
      `evaluatorSampleColumns-${projectId}`,
      columns,
    );
  const [columnOrder, setColumnOrder] = useColumnOrder<SampleObservation>(
    `evaluatorSampleColumnOrder-${projectId}`,
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
    <div className="flex min-h-0 flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Filter observations"
          meta={null}
          description="Narrow the observations to representative test data for this evaluator."
          tooltip="Filters only affect which observations are available as test samples."
          trailing={null}
        />
        <EventsSearchBarRow
          projectId={projectId}
          tableName="evaluator-sample-observations"
          store={search.store}
          commit={search.commit}
          observed={observed}
          erroredColumns={options.erroredColumns}
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
                setFilters((current) =>
                  mergeSampleFilters(current, example.filters),
                );
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
            count.data ? (
              <span className="text-muted-foreground shrink-0 text-sm">
                ({compactNumberFormatter(count.data.totalCount)})
              </span>
            ) : null
          }
          description="Select an observation to test and verify the variable mapping."
          tooltip="Observations matching the current filters and time range."
          trailing={
            <DataTableColumnVisibilityFilter
              columns={columns}
              columnVisibility={columnVisibility}
              setColumnVisibility={setColumnVisibility}
              columnOrder={columnOrder}
              setColumnOrder={setColumnOrder}
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
            tableName={`evaluator-samples-v1-${projectId}`}
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
            getRowClassName={(row) =>
              row.id === selectedObservationId ? "bg-muted/50" : ""
            }
            noResultsMessage="No observations match the current filters and time range."
          />
        </div>
      </section>
    </div>
  );
}
