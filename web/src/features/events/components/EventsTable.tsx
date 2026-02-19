import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  getEventsColumnName,
  observationEventsFilterConfig,
} from "../config/filter-config";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type ObservationLevelType,
  type FilterState,
  BatchExportTableName,
  type ObservationType,
  TableViewPresetTableName,
  BatchActionType,
  ActionId,
  RESOURCE_LIMIT_ERROR_MESSAGE,
} from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { LevelColors } from "@/src/components/level-colors";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import {
  toAbsoluteTimeRange,
  type TableDateRange,
} from "@/src/utils/date-range-utils";
import { type ScoreAggregate } from "@langfuse/shared";
import TagList from "@/src/features/tag/components/TagList";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { BreakdownTooltip } from "@/src/components/trace2/components/_shared/BreakdownToolTip";
import { InfoIcon, LightbulbIcon, PlusCircle } from "lucide-react";
import { UpsertModelFormDialog } from "@/src/features/models/components/UpsertModelFormDialog";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Badge } from "@/src/components/ui/badge";
import { type Row, type RowSelectionState } from "@tanstack/react-table";
import TableIdOrName from "@/src/components/table/table-id";
import { ItemBadge } from "@/src/components/ItemBadge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PeekViewObservationDetail } from "@/src/components/table/peek/peek-observation-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useRouter } from "next/router";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type TableAction } from "@/src/features/table/types";
import {
  type DataTablePeekViewProps,
  TablePeekView,
} from "@/src/components/table/peek";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import { useEventsTableData } from "@/src/features/events/hooks/useEventsTableData";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
// Disabled for now because perhaps confusing
// import {
//   useEventsViewMode,
//   type EventsViewMode,
// } from "@/src/features/events/hooks/useEventsViewMode";
// import { EventsViewModeToggle } from "@/src/features/events/components/EventsViewModeToggle";
// import { useObservationCountCheck } from "@/src/features/events/hooks/useObservationCountCheck";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import {
  type RefreshInterval,
  REFRESH_INTERVALS,
} from "@/src/components/table/data-table-refresh-button";
import useSessionStorage from "@/src/components/useSessionStorage";
import { api } from "@/src/utils/api";
import { RunEvaluationDialog } from "@/src/features/batch-actions/components/RunEvaluationDialog/index";

export type EventsTableRow = {
  // Identity fields
  id: string;
  traceId?: string;
  spanId: string;
  parentSpanId?: string;

  // Time fields
  startTime: Date;
  endTime?: Date;
  completionStartTime?: Date;
  timestamp?: Date;

  // Core properties
  type: ObservationType;
  name?: string;
  environment?: string;
  version?: string;
  level?: ObservationLevelType;
  statusMessage?: string;

  // User context
  userId?: string;
  sessionId?: string;

  // Model fields
  providedModelName?: string;
  modelId?: string;
  modelParameters?: string;

  // Prompt fields
  promptId?: string;
  promptName?: string;
  promptVersion?: string;

  // Usage and cost
  usage: {
    inputUsage: number;
    outputUsage: number;
    totalUsage: number;
  };
  usageDetails: Record<string, number>;
  totalCost?: number;
  cost: {
    inputCost?: number;
    outputCost?: number;
  };
  costDetails: Record<string, number>;
  usagePricingTierName?: string | null;

  // Performance metrics
  latency?: number;
  timeToFirstToken?: number;

  input?: string;
  output?: string;
  metadata?: unknown;

  // Trace fields
  traceTags?: string[];
  traceName?: string;

  // Scores
  scores: ScoreAggregate;
};

export type EventsTableProps = {
  projectId: string;
  userId?: string;
  hideControls?: boolean;
  // External control props for embedded preview tables
  externalFilterState?: FilterState;
  externalDateRange?: TableDateRange;
  limitRows?: number;
  sessionId?: string;
};

export default function ObservationsEventsTable({
  projectId,
  userId,
  hideControls = false,
  externalFilterState,
  externalDateRange,
  limitRows,
  sessionId,
}: EventsTableProps) {
  const router = useRouter();
  const { viewId } = router.query;

  const { setDetailPageList } = useDetailPageLists();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const { searchQuery, searchType, setSearchQuery, setSearchType } =
    useFullTextSearch();

  const { selectAll, setSelectAll } = useSelectAll(projectId, "observations");
  const [showRunEvaluationDialog, setShowRunEvaluationDialog] = useState(false);

  const [paginationState, setPaginationState] = usePaginationState(1, 50);

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "observations",
    "s",
  );

  const [inputFilterState] = useQueryFilterState(
    // Default type filter - exclude SPAN and EVENT types
    !viewId
      ? [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: [
              "GENERATION",
              "AGENT",
              "TOOL",
              "CHAIN",
              "RETRIEVER",
              "EVALUATOR",
              "EMBEDDING",
              "GUARDRAIL",
            ],
          },
        ]
      : [],
    "generations", // Use "generations" table name for compatibility
    projectId,
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Disabled for now because perhaps confusing — replaced by "Is Root Observation"
  // boolean facet in the sidebar (see filter-config.ts).
  //
  // RE-ENABLING THE VIEW MODE TOGGLE:
  // To re-enable, uncomment the code below AND the viewModeFilter, viewModeToggle,
  // auto-switch logic, and imports further down. However, note that the sidebar now
  // has an "Is Root Observation" boolean facet that also controls `hasParentObservation`.
  // Having BOTH active would create duplicate/conflicting filters. Pick one:
  //   - Sidebar facet only (current): remove this commented code entirely
  //   - Toolbar toggle only: uncomment this code, remove the boolean facet from
  //     web/src/features/events/config/filter-config.ts, and re-add
  //     `hasParentObservation` param to the useEventsFilterOptions call below
  //   - Both: would need deduplication logic to prevent conflicting filters
  //
  // View mode toggle (Trace vs Observation)
  // const { viewMode, setViewMode: setViewModeRaw } =
  //   useEventsViewMode(projectId);
  //
  // const [userExplicitChoice, setUserExplicitChoice] =
  //   useSessionStorage<EventsViewMode | null>(
  //     `eventsViewModeUserChoice-${projectId}`,
  //     null,
  //   );
  //
  // const [autoSwitchedForRange, setAutoSwitchedForRange] = useSessionStorage<
  //   string | null
  // >(`eventsAutoSwitchRange-${projectId}`, null);
  //
  // const hasParentObservation = viewMode === "observation" ? undefined : false;
  //
  // const setViewMode = useCallback(
  //   (mode: EventsViewMode) => {
  //     setUserExplicitChoice(mode);
  //     setViewModeRaw(mode);
  //     setPaginationState({ page: 1, limit: 50 });
  //   },
  //   [setUserExplicitChoice, setViewModeRaw, setPaginationState],
  // );

  // for auto data refresh
  const utils = api.useUtils();
  const [rawRefreshInterval, setRawRefreshInterval] =
    useSessionStorage<RefreshInterval>(
      `tableRefreshInterval-events-${projectId}`,
      60_000,
    );

  // Validate session storage value against allowed intervals
  const allowedValues = REFRESH_INTERVALS.map((i) => i.value);
  const refreshInterval = allowedValues.includes(rawRefreshInterval)
    ? rawRefreshInterval
    : null;
  const setRefreshInterval = useCallback(
    (value: RefreshInterval) => {
      if (allowedValues.includes(value)) {
        setRawRefreshInterval(value);
      }
    },
    [allowedValues, setRawRefreshInterval],
  );

  const [refreshTick, setRefreshTick] = useState(0);

  // Auto-increment refresh tick to force date range recalculation
  useEffect(() => {
    if (!refreshInterval) return;
    const id = setInterval(() => {
      setRefreshTick((t) => t + 1);
    }, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval]);

  const handleRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
    void Promise.all([
      utils.events.all.invalidate(),
      utils.events.countAll.invalidate(),
      utils.events.filterOptions.invalidate(),
    ]);
  }, [utils]);

  // Convert timeRange to absolute date range for compatibility
  // Include refreshTick to force recalculation on refresh
  const tableDateRange = useMemo(() => {
    // refreshTick forces recalculation but isn't used in computation
    void refreshTick;
    return toAbsoluteTimeRange(timeRange) ?? undefined;
  }, [timeRange, refreshTick]);

  const dateRange = externalDateRange ?? tableDateRange;

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
        ...(dateRange.to
          ? [
              {
                column: "startTime",
                type: "datetime",
                operator: "<=",
                value: dateRange.to,
              } as const,
            ]
          : []),
      ]
    : [];

  const oldFilterState = inputFilterState.concat(dateRangeFilter);

  // Fetch filter options
  const { filterOptions, isFilterOptionsPending } = useEventsFilterOptions({
    projectId,
    oldFilterState,
  });

  const queryFilter = useSidebarFilterState(
    observationEventsFilterConfig,
    filterOptions,
    projectId,
    isFilterOptionsPending,
    hideControls, // Disable URL persistence for embedded preview tables
  );

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  // Disabled for now because perhaps confusing
  // const viewModeFilter: FilterState =
  //   viewMode === "trace"
  //     ? [
  //         {
  //           column: "hasParentObservation",
  //           type: "boolean",
  //           operator: "=",
  //           value: false,
  //         },
  //       ]
  //     : [];

  // Create user ID filter if userId is provided
  const userIdFilter: FilterState = userId
    ? [
        {
          column: "User ID",
          type: "string",
          operator: "=",
          value: userId,
        },
      ]
    : [];

  const sessionIdFilter: FilterState = sessionId
    ? [
        {
          column: "Session ID",
          type: "string",
          operator: "=",
          value: sessionId,
        },
      ]
    : [];

  const combinedFilterState = queryFilter.filterState
    .concat(dateRangeFilter)
    .concat(userIdFilter)
    .concat(sessionIdFilter);

  // Use external filter state if provided, otherwise use combined filter state
  const filterState = externalFilterState || combinedFilterState;

  // Use the custom hook for observations data fetching
  const {
    observations,
    totalCount,
    handleAddToAnnotationQueue,
    dataUpdatedAt,
    ioLoading,
    isSilencedError,
  } = useEventsTableData({
    projectId,
    filterState,
    paginationState: limitRows
      ? { page: 1, limit: limitRows }
      : paginationState,
    orderByState,
    searchQuery,
    searchType,
    selectedRows,
    selectAll,
    setSelectedRows,
  });

  // Disabled for now because perhaps confusing
  // === Auto-switch to observation mode when trace view is empty ===
  // (commented out along with view mode toggle)

  useEffect(() => {
    if (observations.status === "success") {
      setDetailPageList(
        "observations",
        observations?.rows?.map((o) => ({
          id: o?.id,
          params: {
            traceId: o?.traceId || "",
            ...(o?.startTime ? { timestamp: o?.startTime.toISOString() } : {}),
          },
        })) ?? [],
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations.status, observations.rows]);

  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<EventsTableRow>({
      scoreColumnKey: "scores",
      projectId,
      filter: scoreFilters.forObservations(),
      fromTimestamp: dateRange?.from,
    });

  const { selectActionColumn } = TableSelectionManager<EventsTableRow>({
    projectId,
    tableName: "observations",
    setSelectedRows,
  });

  const tableActions: TableAction[] = [
    {
      id: ActionId.ObservationAddToAnnotationQueue,
      type: BatchActionType.Create,
      label: "Add to Annotation Queue",
      description: "Add selected observations to an annotation queue.",
      targetLabel: "Annotation Queue",
      execute: handleAddToAnnotationQueue,
      accessCheck: {
        scope: "annotationQueues:CUD",
      },
    },
    {
      id: ActionId.ObservationBatchEvaluation,
      type: BatchActionType.Create,
      label: "Evaluate",
      description: "Run evaluations on selected observations.",
      customDialog: true,
      icon: <LightbulbIcon className="mr-2 h-4 w-4" />,
      accessCheck: {
        scope: "evalJob:CUD",
      },
    },
  ];

  const enableSorting = !hideControls;

  const columns: LangfuseColumnDef<EventsTableRow>[] = [
    ...(hideControls ? [] : [selectActionColumn]),
    {
      accessorKey: "startTime",
      id: "startTime",
      header: getEventsColumnName("startTime"),
      size: 150,
      enableHiding: true,
      enableSorting,
      cell: ({ row }) => {
        const value: Date = row.getValue("startTime");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "type",
      id: "type",
      header: getEventsColumnName("type"),
      size: 50,
      enableSorting,
      cell: ({ row }) => {
        const value: ObservationType = row.getValue("type");
        return value ? (
          <div className="flex items-center gap-1">
            <ItemBadge type={value} />
          </div>
        ) : undefined;
      },
    },
    {
      accessorKey: "name",
      id: "name",
      header: getEventsColumnName("name"),
      size: 150,
      enableSorting,
      cell: ({ row }) => {
        const value: EventsTableRow["name"] = row.getValue("name");
        return value ?? undefined;
      },
    },
    {
      accessorKey: "traceName",
      id: "traceName",
      header: getEventsColumnName("traceName"),
      size: 150,
      enableSorting: true,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("traceName");
        return value ?? undefined;
      },
    },
    {
      accessorKey: "input",
      header: getEventsColumnName("input"),
      id: "input",
      size: 300,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("input");
        if (ioLoading) {
          return (
            <JsonSkeleton
              borderless
              className="h-full w-full overflow-hidden px-2 py-1"
            />
          );
        }
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
      enableHiding: true,
    },
    {
      accessorKey: "output",
      id: "output",
      header: getEventsColumnName("output"),
      size: 300,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("output");
        if (ioLoading) {
          return (
            <JsonSkeleton
              borderless
              className="h-full w-full overflow-hidden px-2 py-1"
            />
          );
        }
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            className={cn("bg-accent-light-green")}
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
      enableHiding: true,
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      size: 300,
      headerTooltip: {
        description: "Add metadata to traces to track additional information.",
        href: "https://langfuse.com/docs/observability/features/metadata",
      },
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("metadata");
        if (ioLoading) {
          return (
            <JsonSkeleton
              borderless
              className="h-full w-full overflow-hidden px-2 py-1"
            />
          );
        }
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
      enableHiding: true,
    },
    {
      accessorKey: "level",
      id: "level",
      header: getEventsColumnName("level"),
      size: 100,
      headerTooltip: {
        description:
          "You can differentiate the importance of observations with the level attribute to control the verbosity of your traces and highlight errors and warnings.",
        href: "https://langfuse.com/docs/observability/features/log-levels",
      },
      enableHiding: true,
      cell: ({ row }) => {
        const value: ObservationLevelType | undefined = row.getValue("level");
        return value ? (
          <span
            className={cn(
              "rounded-sm p-0.5 text-xs",
              LevelColors[value].bg,
              LevelColors[value].text,
            )}
          >
            {value}
          </span>
        ) : undefined;
      },
      enableSorting,
    },
    {
      accessorKey: "statusMessage",
      header: getEventsColumnName("statusMessage"),
      id: "statusMessage",
      size: 150,
      headerTooltip: {
        description:
          "Use a statusMessage to e.g. provide additional information on a status such as level=ERROR.",
        href: "https://langfuse.com/docs/observability/features/log-levels",
      },
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("statusMessage");
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            singleLine={rowHeight === "s"}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "latency",
      id: "latency",
      header: getEventsColumnName("latency"),
      size: 100,
      cell: ({ row }) => {
        const latency: number | undefined = row.getValue("latency");
        return latency !== undefined ? (
          <span>{formatIntervalSeconds(latency)}</span>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting,
    },
    {
      accessorKey: "totalCost",
      header: getEventsColumnName("totalCost"),
      id: "totalCost",
      size: 120,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("totalCost");

        return value !== undefined ? (
          <BreakdownTooltip
            details={row.original.costDetails}
            isCost
            pricingTierName={row.original.usagePricingTierName ?? undefined}
          >
            <div className="flex items-center gap-1">
              <span>{usdFormatter(value)}</span>
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting,
    },
    {
      accessorKey: "cost",
      header: "Cost",
      id: "cost",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return observations.status === "loading" ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: [
        {
          accessorKey: "inputCost",
          id: "inputCost",
          header: getEventsColumnName("inputCost"),
          size: 120,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const value = row.getValue("cost") as {
              inputCost: number | undefined;
              outputCost: number | undefined;
            };

            return value.inputCost !== undefined ? (
              <span>{usdFormatter(value.inputCost)}</span>
            ) : undefined;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        },
        {
          accessorKey: "outputCost",
          id: "outputCost",
          header: getEventsColumnName("outputCost"),
          size: 120,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const value = row.getValue("cost") as {
              inputCost: number | undefined;
              outputCost: number | undefined;
            };

            return value.outputCost !== undefined ? (
              <span>{usdFormatter(value.outputCost)}</span>
            ) : undefined;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        },
      ],
    },
    {
      accessorKey: "timeToFirstToken",
      id: "timeToFirstToken",
      header: getEventsColumnName("timeToFirstToken"),
      size: 150,
      enableHiding: true,
      enableSorting,
      cell: ({ row }) => {
        const timeToFirstToken: number | undefined =
          row.getValue("timeToFirstToken");

        return (
          <span>
            {timeToFirstToken ? formatIntervalSeconds(timeToFirstToken) : "-"}
          </span>
        );
      },
    },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return observations.status === "loading" ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: [
        {
          accessorKey: "tokensPerSecond",
          id: "tokensPerSecond",
          header: "Tokens per second",
          size: 200,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const latency: number | undefined = row.getValue("latency");
            const usage = row.getValue("usage") as {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            };
            return latency !== undefined &&
              (usage.outputUsage !== 0 || usage.totalUsage !== 0) ? (
              <span>
                {usage.outputUsage && latency
                  ? Number((usage.outputUsage / latency).toFixed(1))
                  : undefined}
              </span>
            ) : undefined;
          },
          defaultHidden: true,
          enableHiding: true,
          enableSorting,
        },
        {
          accessorKey: "inputTokens",
          id: "inputTokens",
          header: getEventsColumnName("inputTokens"),
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const value = row.getValue("usage") as {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            };
            return <span>{numberFormatter(value.inputUsage, 0)}</span>;
          },
        },
        {
          accessorKey: "outputTokens",
          id: "outputTokens",
          header: getEventsColumnName("outputTokens"),
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const value = row.getValue("usage") as {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            };
            return <span>{numberFormatter(value.outputUsage, 0)}</span>;
          },
        },
        {
          accessorKey: "totalTokens",
          id: "totalTokens",
          header: getEventsColumnName("totalTokens"),
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const value = row.getValue("usage") as {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            };
            return <span>{numberFormatter(value.totalUsage, 0)}</span>;
          },
        },
      ],
    },
    {
      accessorKey: "providedModelName",
      id: "providedModelName",
      header: getEventsColumnName("providedModelName"),
      size: 150,
      enableHiding: true,
      enableSorting,
      cell: ({ row }) => {
        const model = row.getValue("providedModelName") as string;
        const modelId = row.getValue("modelId") as string | undefined;

        if (!model) return null;

        return modelId ? (
          <TableIdOrName value={model} />
        ) : (
          <UpsertModelFormDialog
            action="create"
            projectId={projectId}
            prefilledModelData={{
              modelName: model,
              prices:
                Object.keys(row.original.usageDetails).length > 0
                  ? Object.keys(row.original.usageDetails)
                      .filter((key) => key != "total")
                      .reduce(
                        (acc, key) => {
                          acc[key] = 0.000001;
                          return acc;
                        },
                        {} as Record<string, number>,
                      )
                  : undefined,
            }}
            className="cursor-pointer"
          >
            <span className="flex items-center gap-1">
              <span>{model}</span>
              <PlusCircle className="h-3 w-3" />
            </span>
          </UpsertModelFormDialog>
        );
      },
    },
    {
      accessorKey: "promptName",
      id: "promptName",
      header: getEventsColumnName("promptName"),
      headerTooltip: {
        description: "Link to prompt version in Langfuse prompt management.",
        href: "https://langfuse.com/docs/prompt-management/get-started",
      },
      size: 200,
      enableHiding: true,
      enableSorting,
      cell: ({ row }) => {
        const promptName = row.original.promptName;
        const promptVersion = row.original.promptVersion;
        const value = `${promptName} (v${promptVersion})`;
        return promptName && promptVersion && <TableIdOrName value={value} />;
      },
    },
    {
      accessorKey: "environment",
      header: getEventsColumnName("environment"),
      id: "environment",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: EventsTableRow["environment"] =
          row.getValue("environment");
        return value ? (
          <Badge
            variant="secondary"
            className="max-w-fit truncate rounded-sm px-1 font-normal"
          >
            {value}
          </Badge>
        ) : null;
      },
    },
    {
      accessorKey: "traceTags",
      id: "traceTags",
      header: getEventsColumnName("traceTags"),
      size: 250,
      enableHiding: true,
      cell: ({ row }) => {
        const traceTags: string[] | undefined = row.getValue("traceTags");
        return (
          traceTags && (
            <div
              className={cn(
                "flex gap-x-2 gap-y-1",
                rowHeight !== "s" && "flex-wrap",
              )}
            >
              <TagList selectedTags={traceTags} isLoading={false} />
            </div>
          )
        );
      },
    },
    {
      accessorKey: "scores",
      header: "Scores",
      id: "scores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isColumnLoading ? <Skeleton className="h-3 w-1/2" /> : null;
      },
      columns: scoreColumns,
    },
    {
      accessorKey: "endTime",
      id: "endTime",
      header: getEventsColumnName("endTime"),
      size: 150,
      enableHiding: true,
      enableSorting,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: Date | undefined = row.getValue("endTime");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "traceId",
      id: "traceId",
      header: getEventsColumnName("traceId"),
      size: 100,
      cell: ({ row }) => {
        const value = row.getValue("traceId");
        return typeof value === "string" ? (
          <TableIdOrName value={value} />
        ) : undefined;
      },
      enableSorting,
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "modelId",
      id: "modelId",
      header: getEventsColumnName("modelId"),
      size: 100,
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "version",
      id: "version",
      header: getEventsColumnName("version"),
      size: 100,
      headerTooltip: {
        description: "Track changes via the version tag.",
        href: "https://langfuse.com/docs/experimentation",
      },
      enableHiding: true,
      enableSorting,
      defaultHidden: true,
    },
    {
      accessorKey: "userId",
      id: "userId",
      header: getEventsColumnName("userId"),
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "sessionId",
      id: "sessionId",
      header: getEventsColumnName("sessionId"),
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    },
  ];

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<EventsTableRow>(
      `eventsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<EventsTableRow>(
    `eventsColumnOrder-${projectId}`,
    columns,
  );

  const peekNavigationProps = usePeekNavigation({
    queryParams: ["observation", "display", "timestamp", "traceId"],
    paramsToMirrorPeekValue: ["observation"],
    extractParamsValuesFromRow: (row: EventsTableRow) => ({
      traceId: row.traceId || "",
      timestamp: row.timestamp?.toISOString() || "",
    }),
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
      pathParam: "traceId",
    },
  });

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Observations,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibilityState,
      setSearchQuery: setSearchQuery,
    },
    validationContext: {
      columns,
      filterColumnDefinition: observationEventsFilterConfig.columnDefinitions,
    },
    currentFilterState: queryFilter.filterState,
  });

  const peekConfig: DataTablePeekViewProps | undefined = useMemo(() => {
    if (hideControls) return undefined;
    return {
      itemType: "TRACE",
      customTitlePrefix: "Observation ID:",
      detailNavigationKey: "observations",
      children: <PeekViewObservationDetail projectId={projectId} />,
      ...peekNavigationProps,
    };
  }, [projectId, peekNavigationProps, hideControls]);

  const rows: EventsTableRow[] = useMemo(() => {
    const result =
      observations.status === "success" && observations.rows
        ? observations.rows.map((observation) => {
            return {
              id: observation.id,
              traceId: observation.traceId ?? undefined,
              type: observation.type ?? undefined,
              spanId: observation.id, // span_id maps to id
              parentSpanId: observation.parentObservationId ?? undefined,
              startTime: observation.startTime,
              endTime: observation.endTime ?? undefined,
              timeToFirstToken: observation.timeToFirstToken ?? undefined,
              scores: {}, // TODO: scores not included in FullObservation type
              latency: observation.latency ?? undefined,
              totalCost: observation.totalCost ?? undefined,
              cost: {
                inputCost: observation.inputCost ?? undefined,
                outputCost: observation.outputCost ?? undefined,
              },
              name: observation.name ?? undefined,
              version: observation.version ?? "",
              providedModelName: observation.model ?? "",
              modelId: observation.internalModelId ?? undefined,
              level: observation.level,
              statusMessage: observation.statusMessage ?? undefined,
              usage: {
                inputUsage: observation.inputUsage,
                outputUsage: observation.outputUsage,
                totalUsage: observation.totalUsage,
              },
              promptId: observation.promptId ?? undefined,
              promptName: observation.promptName ?? undefined,
              promptVersion: observation.promptVersion?.toString() ?? undefined,
              traceTags: undefined, // TODO: traceTags not available in EventsObservation
              traceName: observation.traceName ?? undefined,
              timestamp: observation.startTime ?? undefined,
              usageDetails: observation.usageDetails ?? {},
              costDetails: observation.costDetails ?? {},
              usagePricingTierName:
                observation.usagePricingTierName ?? undefined,
              environment: observation.environment ?? undefined,
              // I/O data comes from joined data already
              input: observation.input
                ? typeof observation.input === "string"
                  ? observation.input
                  : JSON.stringify(observation.input)
                : undefined,
              output: observation.output
                ? typeof observation.output === "string"
                  ? observation.output
                  : JSON.stringify(observation.output)
                : undefined,
              metadata: observation.metadata,
              userId: observation.userId ?? undefined,
              sessionId: observation.sessionId ?? undefined,
              completionStartTime: observation.completionStartTime ?? undefined,
            };
          })
        : [];

    return result;
  }, [observations]);

  return (
    <DataTableControlsProvider>
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        {!hideControls && (
          <DataTableToolbar
            columns={columns}
            filterState={queryFilter.filterState}
            searchConfig={{
              metadataSearchFields: ["ID", "Name", "Trace Name", "Model"],
              updateQuery: setSearchQuery,
              currentQuery: searchQuery ?? undefined,
              searchType,
              setSearchType,
              tableAllowsFullTextSearch: true,
            }}
            viewConfig={{
              tableName: TableViewPresetTableName.Observations,
              projectId,
              controllers: viewControllers,
            }}
            columnsWithCustomSelect={[
              "providedModelName",
              "name",
              "promptName",
            ]}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibilityState}
            columnOrder={columnOrder}
            setColumnOrder={setColumnOrder}
            orderByState={orderByState}
            rowHeight={rowHeight}
            setRowHeight={setRowHeight}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            // Disabled, for now moved to filter sidebar
            // TODO: remove this toggle once v4 looks good as is
            // viewModeToggle={
            //   <EventsViewModeToggle
            //     viewMode={viewMode}
            //     onViewModeChange={setViewMode}
            //   />
            // }
            refreshConfig={{
              onRefresh: handleRefresh,
              isRefreshing: observations.status === "loading",
              interval: refreshInterval,
              setInterval: setRefreshInterval,
            }}
            actionButtons={[
              <BatchExportTableButton
                {...{
                  projectId,
                  filterState,
                  orderByState,
                  searchQuery,
                  searchType,
                }}
                tableName={BatchExportTableName.Events}
                key="batchExport"
              />,
              Object.keys(selectedRows).filter((observationId) =>
                observations.rows?.map((o) => o.id).includes(observationId),
              ).length > 0 ? (
                <TableActionMenu
                  key="observations-multi-select-actions"
                  projectId={projectId}
                  actions={tableActions}
                  tableName={BatchExportTableName.Observations}
                  onCustomAction={(actionType) => {
                    if (actionType === ActionId.ObservationBatchEvaluation) {
                      setShowRunEvaluationDialog(true);
                    }
                  }}
                />
              ) : null,
            ]}
            multiSelect={{
              selectAll,
              setSelectAll,
              selectedRowIds:
                Object.keys(selectedRows).filter((observationId) =>
                  observations.rows?.map((o) => o.id).includes(observationId),
                ) ?? [],
              setRowSelection: setSelectedRows,
              totalCount,
              pageSize: paginationState.limit,
              pageIndex: paginationState.page - 1,
            }}
            filterWithAI
          />
        )}

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          {!hideControls && (
            <DataTableControls queryFilter={queryFilter} filterWithAI />
          )}

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              key={`observations-table-${dataUpdatedAt}-${rows.length > 0 && rows[0]?.input ? "with-io" : "without-io"}`}
              tableName={"observations"}
              columns={columns}
              peekView={peekConfig}
              data={
                observations.status === "loading" || isViewLoading
                  ? { isLoading: true, isError: false }
                  : observations.status === "error"
                    ? isSilencedError
                      ? {
                          isLoading: false,
                          isError: false,
                          data: [],
                        }
                      : {
                          isLoading: false,
                          isError: true,
                          error: "",
                        }
                    : {
                        isLoading: false,
                        isError: false,
                        data: rows,
                      }
              }
              noResultsMessage={
                isSilencedError ? (
                  <span className="text-muted-foreground">
                    {RESOURCE_LIMIT_ERROR_MESSAGE}
                  </span>
                ) : undefined
              }
              pagination={
                limitRows
                  ? undefined
                  : {
                      totalCount,
                      onChange: (updater) => {
                        const newState =
                          typeof updater === "function"
                            ? updater({
                                pageIndex: paginationState.page - 1,
                                pageSize: paginationState.limit,
                              })
                            : updater;
                        setPaginationState({
                          page: newState.pageIndex + 1,
                          limit: newState.pageSize,
                        });
                      },
                      state: {
                        pageIndex: paginationState.page - 1,
                        pageSize: paginationState.limit,
                      },
                    }
              }
              rowSelection={selectedRows}
              setRowSelection={setSelectedRows}
              setOrderBy={setOrderByState}
              orderBy={orderByState}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibilityState}
              rowHeight={rowHeight}
              onRowClick={(row, event) => {
                // Handle Command/Ctrl+click to open observation in new tab
                if (event && (event.metaKey || event.ctrlKey)) {
                  // Prevent the default peek behavior
                  event.preventDefault();

                  // Construct the observation URL directly to avoid race conditions
                  const observationId = row.id;
                  const traceId = row.traceId;
                  const timestamp = row.timestamp;

                  if (traceId) {
                    let observationUrl = `/project/${projectId}/traces/${encodeURIComponent(traceId)}`;

                    const params = new URLSearchParams();
                    params.set("observation", observationId);
                    if (timestamp) {
                      params.set("timestamp", timestamp.toISOString());
                    }

                    observationUrl += `?${params.toString()}`;

                    const fullUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${observationUrl}`;
                    window.open(fullUrl, "_blank");
                  }
                }
                // For normal clicks, let the data-table handle opening the peek view
              }}
            />
          </div>
        </ResizableFilterLayout>
        {peekConfig && <TablePeekView peekView={peekConfig} />}
      </div>

      {showRunEvaluationDialog && (
        <RunEvaluationDialog
          projectId={projectId}
          selectedObservationIds={(() => {
            const rowIds = new Set(observations.rows?.map((o) => o.id));
            return Object.keys(selectedRows).filter((id) => rowIds.has(id));
          })()}
          query={{
            filter: filterState,
            orderBy: orderByState,
            searchQuery: searchQuery ?? undefined,
            searchType,
          }}
          selectAll={selectAll}
          totalCount={totalCount ?? 0}
          onClose={() => {
            setShowRunEvaluationDialog(false);
            setSelectedRows({});
            setSelectAll(false);
          }}
        />
      )}
    </DataTableControlsProvider>
  );
}
