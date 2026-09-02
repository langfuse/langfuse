import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { Skeleton } from "@/src/components/ui/skeleton";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createDropdownTableColumn } from "@/src/components/design-system/table/columns/createDropdownTableColumn";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { createTagsTableColumn } from "@/src/components/design-system/table/columns/createTagsTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createTokenUsageTableColumn } from "@/src/components/design-system/table/columns/createTokenUsageTableColumn";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type RouterOutput } from "@/src/utils/types";
import { type RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import type Decimal from "decimal.js";
import {
  compactNumberFormatter,
  numberFormatter,
  usdFormatter,
} from "@/src/utils/numbers";
import {
  formatAsLabel,
  LevelSymbols,
  getObservationLevelStatus,
} from "@/src/components/level-colors";
import {
  detailPageListKeys,
  useDetailPageLists,
} from "@/src/features/navigate-detail-pages/context";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import {
  type FilterState,
  type ObservationLevelType,
  BatchExportTableName,
  AnnotationQueueObjectType,
  BatchActionType,
  ActionId,
  TableViewPresetTableName,
  type TimeFilter,
  type ScoreAggregate,
  DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
} from "@langfuse/shared";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { ConnectedIOTableCell } from "@/src/components/table/ConnectedIOTableCell";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useLiveTableDateRange } from "@/src/hooks/useLiveTableDateRange";
import { usePendingRowIds } from "@/src/components/table/hooks/usePendingRowIds";
import { usePaginationWindowPin } from "@/src/components/table/hooks/usePaginationWindowPin";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { BreakdownTooltip } from "@/src/features/traces/components/BreakdownTooltip";
import { InfoIcon, Trash2 } from "lucide-react";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { type TableAction } from "@/src/features/table/types";
import {
  LevelCountsDisplay,
  type LevelCount,
} from "@/src/components/level-counts-display";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import {
  type UseSidebarFilterStateOptions,
  useSidebarFilterState,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  getTraceFilterConfig,
  type TraceOmittableFilterColumn,
} from "@/src/features/filters/config/traces-config";
import { buildSidebarFilterSessionContextId } from "@/src/features/filters/lib/persistedSidebarFilterQuery";
import { sortOptionValues } from "@/src/features/filters/lib/option-sort";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { type TableDateRange } from "@/src/utils/date-range-utils";
import useSessionStorage from "@/src/components/useSessionStorage";
import {
  REFRESH_INTERVALS,
  type RefreshInterval,
} from "@/src/components/table/utils/refresh-intervals";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { usePeekTableState } from "@/src/components/table/peek/contexts/PeekTableStateContext";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import { AddTracesToAnnotationQueueDialogController } from "@/src/features/annotation-queues/components/AddTracesToAnnotationQueueDialogController";
import { DialogController } from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { DeleteTraceDialogContent } from "@/src/features/traces/components/DeleteTraceDialogContent";

export type TracesTableRow = {
  // Shown by default
  timestamp: Date;
  name: string;
  // i/o and metadata not set explicitly, but fetched from the server from the cell
  input?: unknown;
  output?: unknown;
  levelCounts: {
    errorCount?: bigint;
    warningCount?: bigint;
    debugCount?: bigint;
    defaultCount?: bigint;
  };
  latency?: number;
  tokenDetails?: Record<string, number>;
  totalCost?: Decimal;
  costDetails?: Record<string, number>;
  environment?: string;
  tags: string[];
  metadata?: unknown;
  // scores holds grouped column with individual scores
  scores?: ScoreAggregate;
  // Hidden by default
  sessionId?: string;
  userId: string;
  observationCount?: bigint;
  level?: ObservationLevelType;
  version?: string;
  release?: string;
  id: string;
  usage: {
    inputUsage?: bigint;
    outputUsage?: bigint;
    totalUsage?: bigint;
  };
  cost?: {
    inputCost?: Decimal;
    outputCost?: Decimal;
  };
};

export type TracesTableProps = {
  projectId: string;
  userId?: string;
  omittedFilter?: TraceOmittableFilterColumn[];
  hideControls?: boolean;
  externalFilterState?: FilterState;
  externalDateRange?: TableDateRange;
  limitRows?: number;
  /**
   * When true, render the time-range picker and auto-refresh button in the
   * page header (next to the title) via the header controls slot, instead of
   * inside the table toolbar. Only used when the table is the primary content
   * of a `Page`.
   */
  showControlsInPageHeader?: boolean;
};

function TracesTableInternal({
  projectId,
  userId,
  omittedFilter = [],
  hideControls = false,
  externalFilterState,
  externalDateRange,
  limitRows,
  showControlsInPageHeader = false,
  openDeleteTraceDialog,
}: TracesTableProps & {
  openDeleteTraceDialog: (traceId: string) => void;
}) {
  const peekContext = usePeekTableState();
  const hasTraceDeleteAccess = useHasProjectAccess({
    projectId,
    scope: "traces:delete",
  });
  const tracesFilterConfig = useMemo(
    () => getTraceFilterConfig(omittedFilter),
    [omittedFilter],
  );
  const utils = api.useUtils();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const [rawRefreshInterval, setRawRefreshInterval] =
    useSessionStorage<RefreshInterval>(
      `tableRefreshInterval-${projectId}`,
      null,
    );

  // Validate session storage value against allowed intervals to prevent too small intervals
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

  const [manualRefreshTrigger, setManualRefreshTrigger] = useState(0); // resets the interval when manual refresh is called
  const { setDetailPageList } = useDetailPageLists();

  // A refresh is invalidation only: the queried window is anchored (see
  // useLiveTableDateRange), so a refetch reuses the same query keys and updates
  // the rows on screen in place instead of blanking them.
  const invalidateTableQueries = useCallback(() => {
    Promise.all([
      utils.traces.all.invalidate(),
      utils.traces.metrics.invalidate(),
      utils.traces.countAll.invalidate(),
      utils.traces.filterOptions.invalidate(),
      utils.projects.environmentFilterOptions.invalidate(),
    ]);
  }, [utils]);

  const handleRefresh = useCallback(() => {
    setManualRefreshTrigger((t) => t + 1);
    invalidateTableQueries();
  }, [invalidateTableQueries]);

  useEffect(() => {
    if (!refreshInterval) return;
    const id = setInterval(invalidateTableQueries, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval, manualRefreshTrigger, invalidateTableQueries]);

  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  const { range: tableDateRange } = useLiveTableDateRange(timeRange);

  const dateRange = externalDateRange ?? tableDateRange;

  const [orderByState, setOrderByState] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

  const toTimestampFilter = (range: TableDateRange | undefined): FilterState =>
    range
      ? [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: range.from,
          },
          ...(range.to
            ? [
                {
                  column: "timestamp",
                  type: "datetime",
                  operator: "<=",
                  value: range.to,
                } as const,
              ]
            : []),
        ]
      : [];

  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });
  const { selectAll, setSelectAll } = useSelectAll(projectId, "traces");

  // Facets describe the whole window; only the paged row/count queries need the
  // upper bound pinned, so that offset paging does not repeat or skip rows while
  // the window keeps taking in newly ingested ones.
  const dateRangeFilter: FilterState = toTimestampFilter(dateRange);
  const { range: rowsDateRange, pinOnLeavingFirstPage } =
    usePaginationWindowPin(
      dateRange,
      limitRows ? 0 : paginationState.pageIndex,
    );
  const rowsDateRangeFilter: FilterState = toTimestampFilter(rowsDateRange);
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

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId,
        fromTimestamp: dateRange?.from,
      },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const traceFilterOptionsResponse = api.traces.filterOptions.useQuery(
    {
      projectId,
      timestampFilter:
        dateRangeFilter.length > 0
          ? (dateRangeFilter as TimeFilter[])
          : undefined,
    },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const filterOptions = useMemo(() => {
    const scoreCategories =
      traceFilterOptionsResponse.data?.score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;

    const scoresNumeric =
      traceFilterOptionsResponse.data?.scores_avg ?? undefined;
    const scoresBoolean =
      traceFilterOptionsResponse.data?.score_booleans ?? undefined;

    return {
      traceName:
        traceFilterOptionsResponse.data?.name?.map((n) => ({
          value: n.value,
          count: Number(n.count),
        })) ?? undefined,
      // tags don't have counts; they read A→Z
      traceTags: sortOptionValues(
        traceFilterOptionsResponse.data?.tags?.map((t) => t.value),
      ),
      environment:
        environmentFilterOptions.data?.map((value) => value.environment) ??
        undefined,
      level: ["DEFAULT", "DEBUG", "WARNING", "ERROR"],
      userId:
        traceFilterOptionsResponse.data?.users?.map((u) => ({
          value: u.value,
          count: Number(u.count),
        })) ?? undefined,
      sessionId:
        traceFilterOptionsResponse.data?.sessions?.map((s) => ({
          value: s.value,
          count: Number(s.count),
        })) ?? undefined,
      latency: [],
      inputTokens: [],
      outputTokens: [],
      totalTokens: [],
      inputCost: [],
      outputCost: [],
      totalCost: [],
      score_categories: scoreCategories,
      scores_avg: scoresNumeric,
      score_booleans: scoresBoolean,
    };
  }, [environmentFilterOptions.data, traceFilterOptionsResponse.data]);

  const isSidebarFilterLoading =
    traceFilterOptionsResponse.isPending || environmentFilterOptions.isPending;

  const queryFilterOptions: UseSidebarFilterStateOptions = useMemo(() => {
    const baseOptions = {
      loading: isSidebarFilterLoading,
      implicitDefaultConfig: DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
    };

    if (peekContext) {
      return {
        ...baseOptions,
        stateLocation: "peekContext",
        context: peekContext,
      };
    }

    if (hideControls) {
      return {
        ...baseOptions,
        stateLocation: "memory",
      };
    }

    return {
      ...baseOptions,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: buildSidebarFilterSessionContextId(
        projectId,
        userId ? "user" : undefined,
      ),
    };
  }, [hideControls, isSidebarFilterLoading, peekContext, projectId, userId]);

  const queryFilter = useSidebarFilterState(
    tracesFilterConfig,
    filterOptions,
    queryFilterOptions,
  );

  const combinedFilterState = queryFilter.effectiveFilterState.concat(
    userIdFilter,
    rowsDateRangeFilter,
  );

  // Use external filter state if provided, otherwise use combined filter
  // state. Even with an external filter, still apply the date-range bound so
  // callers that pass an externalDateRange (e.g. the eval preview's "last 24
  // hours" window) have it honored for the row query, not just score columns.
  const filterState = externalFilterState
    ? externalFilterState.concat(rowsDateRangeFilter)
    : combinedFilterState;

  const { searchQuery, searchType, setSearchQuery, setSearchType } =
    useFullTextSearch();
  const legacyTracingSearchConfig = api.public.tracingSearchConfig.useQuery(
    { projectId },
    {
      enabled: !hideControls,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );
  const legacyTracingIoSearchEnabled =
    legacyTracingSearchConfig.data?.legacyTracingIoSearchEnabled ?? true;

  const tracesAllCountFilter = {
    projectId,
    filter: filterState,
    searchQuery: searchQuery,
    searchType: searchType,
    orderBy: null,
  };

  // Deliberately NOT placeholder-backed, unlike the row query: its key only
  // changes when the filter does, and keeping the previous value would pair rows
  // for the new filter with a count for the old one. It reports as loading
  // instead until it catches up.
  const totalCountQuery = api.traces.countAll.useQuery(tracesAllCountFilter, {
    enabled: environmentFilterOptions.data !== undefined,
  });

  const tracesAllQueryFilter = {
    ...tracesAllCountFilter,
    searchQuery: searchQuery,
    searchType: searchType,
    page: limitRows ? 0 : paginationState.pageIndex,
    limit: limitRows ?? paginationState.pageSize,
    orderBy: orderByState,
  };

  // A filter/page/sort change (or a re-anchored window) is a new query key:
  // keep the rows that are on screen until the new ones land, so only a genuine
  // cold load renders skeletons.
  const traces = api.traces.all.useQuery(tracesAllQueryFilter, {
    enabled: environmentFilterOptions.data !== undefined,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });
  const traceMetrics = api.traces.metrics.useQuery(
    {
      projectId,
      filter: filterState,
      traceIds: traces.data?.traces.map((t) => t.id) ?? [],
    },
    {
      enabled: traces.data !== undefined,
      refetchOnMount: false,
      refetchOnWindowFocus: true,
      placeholderData: (prev) => prev,
    },
  );

  // Metrics arrive per trace id, one query behind the rows.
  const isMetricPending = usePendingRowIds(traceMetrics);

  type TracesCoreOutput = RouterOutput["traces"]["all"]["traces"][number];
  type TraceMetricOutput = RouterOutput["traces"]["metrics"][number];

  const traceRowData = useMemo(
    () =>
      joinTableCoreAndMetrics<TracesCoreOutput, TraceMetricOutput>(
        traces.data?.traces,
        traceMetrics.data,
      ),
    [traces.data?.traces, traceMetrics.data],
  );

  const totalCount = totalCountQuery.data?.totalCount ?? null;

  useEffect(() => {
    if (traces.isSuccess) {
      setDetailPageList(
        detailPageListKeys.traces,
        traces.data.traces.map((t) => ({
          id: t.id,
          params: { timestamp: t.timestamp.toISOString() },
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traces.isSuccess, traces.data]);

  // loading filter options individually from the remaining calls
  // traces.all should load first together with everything else.
  // This here happens in the background.

  const [storedRowHeight, setRowHeight] = useRowHeightLocalStorage(
    "traces",
    "s",
  );
  const rowHeight = hideControls ? "s" : storedRowHeight;

  // Trace rows render trace-scoped aggregates: direct trace scores plus
  // observation scores that belong to the same trace.
  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<TracesTableRow>({
      scoreColumnKey: "scores",
      projectId,
      filter: scoreFilters.forTraceScopedAggregates(),
      fromTimestamp: dateRange?.from,
    });

  const hasTraceDeletionEntitlement = useHasEntitlement("trace-deletion");

  const { selectActionColumn } = TableSelectionManager<TracesTableRow>({
    projectId,
    tableName: "traces",
    setSelectedRows,
    setSelectAll,
  });

  const traceDeleteMutation = api.traces.deleteMany.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Traces deleted",
        description:
          "Selected traces will be deleted. Traces are removed asynchronously and may continue to be visible for up to 15 minutes.",
      });
    },
    onSettled: () => {
      utils.traces.all.invalidate();
    },
  });

  const addToQueueMutation = api.annotationQueueItems.createMany.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: "Traces added to queue",
        description: `Selected traces will be added to queue "${data.queueName}". This may take a minute.`,
        link: {
          href: `/project/${projectId}/annotation-queues/${data.queueId}`,
          text: `View queue "${data.queueName}"`,
        },
      });
    },
  });

  const handleDeleteTraces = async ({ projectId }: { projectId: string }) => {
    const selectedTraceIds = Object.keys(selectedRows).filter((traceId) =>
      traces.data?.traces.map((t) => t.id).includes(traceId),
    );

    await traceDeleteMutation.mutateAsync({
      projectId,
      traceIds: selectedTraceIds,
      query: {
        filter: filterState,
        orderBy: orderByState,
        searchQuery: searchQuery || undefined,
        searchType,
      },
      isBatchAction: selectAll,
    });
    setSelectedRows({});
  };

  const handleAddToAnnotationQueue = async ({
    projectId,
    targetId,
  }: {
    projectId: string;
    targetId: string;
  }) => {
    const selectedTraceIds = Object.keys(selectedRows).filter((traceId) =>
      traces.data?.traces.map((t) => t.id).includes(traceId),
    );

    await addToQueueMutation.mutateAsync({
      projectId,
      objectIds: selectedTraceIds,
      objectType: AnnotationQueueObjectType.TRACE,
      queueId: targetId,
      isBatchAction: selectAll,
      query: {
        filter: filterState,
        orderBy: orderByState,
      },
    });
    setSelectedRows({});
  };

  const displayCount = totalCountQuery.isPending
    ? "..."
    : selectAll
      ? compactNumberFormatter(totalCountQuery.data?.totalCount)
      : compactNumberFormatter(Object.keys(selectedRows).length);

  // Select-all deletes persist the raw filterState into the batch action, but
  // comment filters resolve via Postgres at read time and the server rejects
  // such dispatches, so disable the action up front with a clear reason.
  // Column ids mirror the traces.deleteMany guard in
  // web/src/server/api/routers/traces.ts.
  const hasCommentFilter = filterState.some(
    (f) => f.column === "commentCount" || f.column === "commentContent",
  );

  const tableActions: TableAction[] = [
    ...(hasTraceDeletionEntitlement
      ? [
          {
            id: ActionId.TraceDelete,
            type: BatchActionType.Delete,
            label: "Delete Traces",
            description: `This action permanently deletes ${displayCount} traces and cannot be undone. Trace deletion happens asynchronously and may take up to 24 hours.`,
            disabled: selectAll && hasCommentFilter,
            disabledReason:
              "Batch deletion does not support comment filters. Remove the comment filter to delete.",
            accessCheck: {
              scope: "traces:delete",
              entitlement: "trace-deletion",
            },
            execute: handleDeleteTraces,
          } as TableAction,
        ]
      : []),
    {
      id: ActionId.TraceAddToAnnotationQueue,
      type: BatchActionType.Create,
      label: "Add to Annotation Queue",
      description: `Add ${displayCount} selected traces to an annotation queue.`,
      customDialog: true,
      accessCheck: {
        scope: "annotationQueues:CUD",
      },
    },
  ];

  const enableSorting = !hideControls;

  const columns: LangfuseColumnDef<TracesTableRow>[] = [
    ...(hideControls ? [] : [selectActionColumn]),
    createDateTableColumn<TracesTableRow>({
      accessorKey: "timestamp",
      header: "Timestamp",
      size: 150,
      enableHiding: true,
      enableSorting,
    }),
    createTextTableColumn<TracesTableRow>({
      accessorKey: "name",
      header: "Name",
      size: 150,
      enableHiding: true,
      enableSorting,
    }),
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 400,
      cellBackground: "gray",
      loadingCell: () => (
        <ConnectedIOTableCell isLoading singleLine={rowHeight === "s"} />
      ),
      cell: ({ row }) => {
        const traceId: TracesTableRow["id"] = row.getValue("id");
        const traceTimestamp: TracesTableRow["timestamp"] =
          row.getValue("timestamp");
        return (
          <TracesDynamicCell
            traceId={traceId}
            projectId={projectId}
            timestamp={new Date(traceTimestamp)}
            col="input"
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "output",
      header: "Output",
      id: "output",
      size: 400,
      cellBackground: "green",
      loadingCell: () => (
        <ConnectedIOTableCell isLoading singleLine={rowHeight === "s"} />
      ),
      cell: ({ row }) => {
        const traceId: TracesTableRow["id"] = row.getValue("id");
        const traceTimestamp: TracesTableRow["timestamp"] =
          row.getValue("timestamp");
        return (
          <TracesDynamicCell
            traceId={traceId}
            projectId={projectId}
            timestamp={new Date(traceTimestamp)}
            col="output"
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "levelCounts",
      id: "levelCounts",
      header: "Observation Levels",
      size: 150,
      loadingCell: <Skeleton className="h-4 w-1/2" />,
      cell: ({ row }) => {
        const value: TracesTableRow["levelCounts"] =
          row.getValue("levelCounts");
        if (isMetricPending(row.original.id)) {
          return <Skeleton className="h-4 w-1/2" />;
        }

        const counts: LevelCount[] = Object.entries(value).map(
          ([level, count]) => ({
            level: formatAsLabel(level),
            count,
            symbol: LevelSymbols[formatAsLabel(level)],
          }),
        );

        return <LevelCountsDisplay counts={counts} />;
      },
      enableHiding: true,
    },
    {
      accessorKey: "latency",
      id: "latency",
      header: "Latency",
      size: 100,
      loadingCell: <Skeleton className="h-4 w-1/2" />,
      cell: ({ row }) => {
        const value: TracesTableRow["latency"] = row.getValue("latency");
        if (isMetricPending(row.original.id)) {
          return <Skeleton className="h-4 w-1/2" />;
        }
        return value !== undefined ? (
          <span className="text-nowrap">{formatIntervalSeconds(value)}</span>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting,
    },

    createTokenUsageTableColumn<TracesTableRow, TracesTableRow["usage"]>({
      id: "tokens",
      accessorFn: (row) => row.usage,
      header: "Tokens",
      size: 180,
      enableSorting,
      enableHiding: true,
      getCell: (value, { row }) => {
        if (isMetricPending(row.original.id)) return { type: "loading" };
        if (!value?.inputUsage && !value?.outputUsage && !value?.totalUsage) {
          return undefined;
        }

        return {
          type: "usage",
          inputUsage: Number(value.inputUsage ?? 0),
          outputUsage: Number(value.outputUsage ?? 0),
          totalUsage: Number(value.totalUsage ?? 0),
          details: row.original.tokenDetails ?? [],
        };
      },
    }),
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: "Total Cost",
      size: 130,
      loadingCell: <Skeleton className="h-4 w-1/2" />,
      cell: ({ row }) => {
        const cost: TracesTableRow["totalCost"] = row.getValue("totalCost");
        if (isMetricPending(row.original.id)) {
          return <Skeleton className="h-4 w-1/2" />;
        }
        return cost != null ? (
          <BreakdownTooltip details={row.original.costDetails ?? []} isCost>
            <div className="flex items-center gap-1">
              {cost ? (
                <span>{usdFormatter(cost.toNumber())}</span>
              ) : (
                <span>-</span>
              )}
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        ) : null;
      },
      enableHiding: true,
      enableSorting,
    },
    createBadgeTableColumn<TracesTableRow>({
      accessorKey: "environment",
      header: "Environment",
      size: 150,
      enableHiding: true,
    }),
    createTagsTableColumn<TracesTableRow>({
      accessorKey: "tags",
      header: "Tags",
      size: 150,
      headerTooltip: {
        description: (
          <>
            Group traces with tags. Read more about implementing tags{" "}
            <a
              href="https://langfuse.com/docs/observability/features/tags"
              target="_blank"
              rel="noopener noreferrer"
              className="decoration-primary/30 hover:decoration-primary underline"
              onClick={(e) => e.stopPropagation()}
            >
              here
            </a>
            .
          </>
        ),
        href: "https://langfuse.com/docs/observability/features/tags",
      },
      shouldWrap: rowHeight !== "s",
      enableHiding: true,
    }),
    {
      accessorKey: "metadata",
      header: "Metadata",
      size: 400,
      loadingCell: () => (
        <ConnectedIOTableCell isLoading singleLine={rowHeight === "s"} />
      ),
      headerTooltip: {
        description: (
          <>
            Add metadata to traces to track additional information. Read more
            about adding metadata{" "}
            <a
              href="https://langfuse.com/docs/observability/features/metadata"
              target="_blank"
              rel="noopener noreferrer"
              className="decoration-primary/30 hover:decoration-primary underline"
              onClick={(e) => e.stopPropagation()}
            >
              here
            </a>
            .
          </>
        ),
        href: "https://langfuse.com/docs/observability/features/metadata",
      },
      cell: ({ row }) => {
        const traceId: TracesTableRow["id"] = row.getValue("id");
        const traceTimestamp: TracesTableRow["timestamp"] =
          row.getValue("timestamp");
        return (
          <TracesDynamicCell
            traceId={traceId}
            projectId={projectId}
            timestamp={new Date(traceTimestamp)}
            col="metadata"
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
    },
    ...(hideControls
      ? []
      : [
          {
            accessorKey: "scores",
            header: "Scores",
            id: "scores",
            enableHiding: true,
            defaultHidden: true,
            cell: () => {
              return isColumnLoading ? (
                <Skeleton className="h-4 w-1/2" />
              ) : null;
            },
            columns: scoreColumns,
          },
        ]),
    createIdTableColumn<TracesTableRow>({
      accessorKey: "sessionId",
      enableColumnFilter: !omittedFilter.includes("sessionId"),
      header: "Session",
      size: 150,
      headerTooltip: {
        description: (
          <>
            Group traces into sessions to track longer conversations/workflows.
            Read more about sessions{" "}
            <a
              href="https://langfuse.com/docs/observability/features/sessions"
              target="_blank"
              rel="noopener noreferrer"
              className="decoration-primary/30 hover:decoration-primary underline"
              onClick={(e) => e.stopPropagation()}
            >
              here
            </a>
            .
          </>
        ),
        href: "https://langfuse.com/docs/observability/features/sessions",
      },
      defaultHidden: true,
      enableHiding: true,
      enableSorting,
    }),
    createIdTableColumn<TracesTableRow>({
      accessorKey: "userId",
      header: "User",
      size: 150,
      headerTooltip: {
        description: (
          <>
            Add <code>userId</code> to traces to track users. Read more about
            user tracking{" "}
            <a
              href="https://langfuse.com/docs/observability/features/users"
              target="_blank"
              rel="noopener noreferrer"
              className="decoration-primary/30 hover:decoration-primary underline"
              onClick={(e) => e.stopPropagation()}
            >
              here
            </a>
            .
          </>
        ),
        href: "https://langfuse.com/docs/observability/features/users",
      },
      defaultHidden: true,
      enableHiding: true,
      enableSorting,
    }),
    createNumberTableColumn<TracesTableRow, bigint>({
      accessorKey: "observationCount",
      header: "Observations",
      size: 120,
      headerTooltip: {
        description: "The number of observations in the trace.",
      },
      enableHiding: true,
      defaultHidden: true,
      formatter: (value) => numberFormatter(value, 0),
      getValue: (value, { row }) =>
        isMetricPending(row.original.id) ? { type: "loading" } : (value ?? 0n),
    }),
    createStatusTableColumn<TracesTableRow, ObservationLevelType>({
      accessorKey: "level",
      header: "Status",
      size: 75,
      defaultHidden: true,
      enableHiding: true,
      enableSorting,
      isLive: false,
      emptyValue: "-",
      getStatus: (level, { row }) =>
        isMetricPending(row.original.id)
          ? { type: "loading" }
          : level
            ? getObservationLevelStatus(level)
            : undefined,
    }),
    createTextTableColumn<TracesTableRow>({
      accessorKey: "version",
      header: "Version",
      size: 100,
      headerTooltip: {
        description: (
          <>
            Track changes via the version tag. Read more about versions{" "}
            <a
              href="https://langfuse.com/docs/observability/features/releases-and-versioning"
              target="_blank"
              rel="noopener noreferrer"
              className="decoration-primary/30 hover:decoration-primary underline"
              onClick={(e) => e.stopPropagation()}
            >
              here
            </a>
            .
          </>
        ),
        href: "https://langfuse.com/docs/observability/features/releases-and-versioning",
      },
      defaultHidden: true,
      enableHiding: true,
      enableSorting,
    }),
    createTextTableColumn<TracesTableRow>({
      accessorKey: "release",
      header: "Release",
      size: 100,
      headerTooltip: {
        description: (
          <>
            Track changes to your application via the release tag. Read more
            about the release tag{" "}
            <a
              href="https://langfuse.com/docs/observability/features/releases-and-versioning"
              target="_blank"
              rel="noopener noreferrer"
              className="decoration-primary/30 hover:decoration-primary underline"
              onClick={(e) => e.stopPropagation()}
            >
              here
            </a>
            .
          </>
        ),
        href: "https://langfuse.com/docs/observability/features/releases-and-versioning",
      },
      defaultHidden: true,
      enableHiding: true,
      enableSorting,
    }),
    createIdTableColumn<TracesTableRow>({
      accessorKey: "id",
      header: "Trace ID",
      size: 90,
      defaultHidden: true,
      enableHiding: true,
      enableSorting,
    }),
    {
      accessorKey: "cost",
      header: "Cost",
      id: "cost",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return traceMetrics.isPending ? (
          <Skeleton className="h-4 w-1/2" />
        ) : null;
      },
      columns: [
        createNumberTableColumn<TracesTableRow>({
          accessorFn: (row) => row.cost?.inputCost?.toNumber(),
          id: "inputCost",
          header: "Input Cost",
          size: 100,
          emptyValue: "-",
          formatter: (value) => usdFormatter(value),
          getValue: (value, { row }) => {
            if (isMetricPending(row.original.id)) return { type: "loading" };
            return value ?? undefined;
          },
          defaultHidden: true,
          enableHiding: true,
          enableSorting,
        }),
        createNumberTableColumn<TracesTableRow>({
          accessorFn: (row) => row.cost?.outputCost?.toNumber(),
          id: "outputCost",
          header: "Output Cost",
          size: 100,
          emptyValue: "-",
          formatter: (value) => usdFormatter(value),
          getValue: (value, { row }) => {
            if (isMetricPending(row.original.id)) return { type: "loading" };
            return value ?? undefined;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        }),
      ] satisfies LangfuseColumnDef<TracesTableRow>[],
    },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return traceMetrics.isPending ? (
          <Skeleton className="h-4 w-1/2" />
        ) : null;
      },
      columns: [
        createNumberTableColumn<TracesTableRow, bigint>({
          accessorFn: (row) => row.usage.inputUsage,
          id: "inputTokens",
          header: "Input Tokens",
          size: 110,
          formatter: (value) => numberFormatter(value, 0),
          getValue: (value, { row }) =>
            isMetricPending(row.original.id)
              ? { type: "loading" }
              : (value ?? 0n),
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        }),
        createNumberTableColumn<TracesTableRow, bigint>({
          accessorFn: (row) => row.usage.outputUsage,
          id: "outputTokens",
          header: "Output Tokens",
          size: 110,
          formatter: (value) => numberFormatter(value, 0),
          getValue: (value, { row }) =>
            isMetricPending(row.original.id)
              ? { type: "loading" }
              : (value ?? 0n),
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        }),
        createNumberTableColumn<TracesTableRow, bigint>({
          accessorFn: (row) => row.usage.totalUsage,
          id: "totalTokens",
          header: "Total Tokens",
          size: 110,
          formatter: (value) => numberFormatter(value, 0),
          getValue: (value, { row }) =>
            isMetricPending(row.original.id)
              ? { type: "loading" }
              : (value ?? 0n),
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        }),
      ] satisfies LangfuseColumnDef<TracesTableRow>[],
    },
    ...(hideControls
      ? []
      : [
          createDropdownTableColumn<TracesTableRow, TracesTableRow["id"]>({
            id: "action",
            accessorFn: (row) => row.id,
            header: "Action",
            size: 70,
            isFixedPosition: true,
            renderMenu: (traceId) =>
              typeof traceId === "string" ? (
                <DropdownMenuItem
                  disabled={
                    !hasTraceDeleteAccess || !hasTraceDeletionEntitlement
                  }
                  onSelect={() => openDeleteTraceDialog(traceId)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              ) : null,
          }),
        ]),
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<TracesTableRow>(
      `traceColumnVisibility-${projectId}${hideControls ? "-hideControl" : "-showControls"}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<TracesTableRow>(
    `traceColumnOrder-${projectId}${hideControls ? "-hideControl" : "-showControls"}`,
    columns,
  );

  const peekNavigationProps = usePeekNavigation({
    // traceId is not written by this table but arrives on v4-dialect shared
    // URLs (LFE-11041); listing it clears it on open/navigate/close so it
    // cannot pin the peek to the originally shared trace.
    queryParams: ["observation", "display", "timestamp", "traceId"],
    tableName: tracesFilterConfig.tableName,
    isV4: false,
    extractParamsValuesFromRow: (row: TracesTableRow) => ({
      timestamp: row.timestamp?.toISOString() || "",
    }),
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
      pathParam: "traceId",
      reader: "trace",
    },
  });

  const peekConfig = useMemo(() => {
    if (hideControls) return undefined;
    return {
      itemType: "TRACE" as const,
      detailNavigationKey: detailPageListKeys.traces,
      ...peekNavigationProps,
    };
  }, [hideControls, peekNavigationProps]);

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Traces,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setExpandedFilters: queryFilter.onExpandedChange,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibility,
      setSearchQuery: setSearchQuery,
    },
    validationContext: {
      columns,
      filterColumnDefinition: tracesFilterConfig.columnDefinitions,
      expandableFilterColumns: tracesFilterConfig.facets.map(
        (facet) => facet.column,
      ),
    },
    currentFilterState: queryFilter.explicitFilterState,
    currentExpandedFilters: queryFilter.expanded,
    disabled: hideControls,
  });

  const rows = useMemo(() => {
    return traces.isSuccess
      ? (traceRowData?.rows?.map((trace) => {
          return {
            id: trace.id,
            timestamp: trace.timestamp,
            name: trace.name ?? "",
            level: trace.level,
            observationCount: trace.observationCount,
            release: trace.release ?? undefined,
            version: trace.version ?? undefined,
            userId: trace.userId ?? "",
            sessionId: trace.sessionId ?? undefined,
            environment: trace.environment ?? undefined,
            latency: trace.latency === null ? undefined : trace.latency,
            tags: trace.tags,
            usage: {
              inputUsage: trace.promptTokens,
              outputUsage: trace.completionTokens,
              totalUsage: trace.totalTokens,
            },
            tokens: {
              inputUsage: trace.promptTokens,
              outputUsage: trace.completionTokens,
              totalUsage: trace.totalTokens,
            },
            levelCounts: {
              errorCount: trace.errorCount,
              warningCount: trace.warningCount,
              defaultCount: trace.defaultCount,
              debugCount: trace.debugCount,
            },
            tokenDetails: trace.usageDetails,
            costDetails: trace.costDetails,
            scores: trace.scores,
            cost: {
              inputCost: trace.calculatedInputCost ?? undefined,
              outputCost: trace.calculatedOutputCost ?? undefined,
            },
            totalCost: trace.calculatedTotalCost ?? undefined,
          };
        }) ?? [])
      : [];
  }, [traces.isSuccess, traceRowData?.rows]);

  const selectedTraceIds = useMemo(
    () =>
      Object.keys(selectedRows).filter((traceId) =>
        traces.data?.traces.map((t) => t.id).includes(traceId),
      ),
    [selectedRows, traces.data?.traces],
  );

  const selectedTraceCount = selectAll ? totalCount : selectedTraceIds.length;

  const refreshConfig = {
    onRefresh: handleRefresh,
    isRefreshing:
      traces.isFetching ||
      traceMetrics.isFetching ||
      totalCountQuery.isFetching,
    interval: refreshInterval,
    setInterval: setRefreshInterval,
  };

  return (
    <DataTableControlsProvider tableName={tracesFilterConfig.tableName}>
      <div className="flex h-full w-full flex-col">
        {showControlsInPageHeader && !hideControls && (
          <TableHeaderControls
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            refresh={refreshConfig}
          />
        )}
        {/* Toolbar spanning full width */}
        {!hideControls && (
          <DataTableToolbar
            columns={columns}
            filterWithAI
            filterState={queryFilter.explicitFilterState}
            tableName={tracesFilterConfig.tableName}
            isV4={false}
            viewConfig={{
              tableName: TableViewPresetTableName.Traces,
              projectId,
              controllers: viewControllers,
            }}
            searchConfig={{
              metadataSearchFields: ["ID", "Trace Name", "User ID"],
              updateQuery: setSearchQuery,
              currentQuery: searchQuery ?? undefined,
              tableAllowsFullTextSearch: legacyTracingIoSearchEnabled,
              setSearchType,
              searchType,
            }}
            columnsWithCustomSelect={["traceName", "traceTags"]}
            actionButtons={[
              selectedTraceIds.length > 0 || selectAll ? (
                <AddTracesToAnnotationQueueDialogController
                  key="traces-multi-select-actions"
                  projectId={projectId}
                  onSuccess={() => {
                    setSelectedRows({});
                    setSelectAll(false);
                  }}
                  description={`Add ${displayCount} selected traces to an annotation queue.`}
                  onAddToQueue={handleAddToAnnotationQueue}
                >
                  {({ openDialog }) => (
                    <TableActionMenu
                      projectId={projectId}
                      actions={tableActions}
                      tableName={BatchExportTableName.Traces}
                      selectedCount={selectedTraceCount}
                      onClearSelection={() => {
                        setSelectedRows({});
                        setSelectAll(false);
                      }}
                      onCustomAction={(actionType) => {
                        if (actionType === ActionId.TraceAddToAnnotationQueue) {
                          openDialog();
                        }
                      }}
                    />
                  )}
                </AddTracesToAnnotationQueueDialogController>
              ) : null,
              <BatchExportTableButton
                {...{
                  projectId,
                  filterState,
                  orderByState,
                  searchQuery,
                  searchType,
                }}
                tableName={BatchExportTableName.Traces}
                key="batchExport"
              />,
            ]}
            orderByState={orderByState}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibility}
            columnOrder={columnOrder}
            setColumnOrder={setColumnOrder}
            rowHeight={rowHeight}
            setRowHeight={setRowHeight}
            timeRange={showControlsInPageHeader ? undefined : timeRange}
            setTimeRange={showControlsInPageHeader ? undefined : setTimeRange}
            refreshConfig={showControlsInPageHeader ? undefined : refreshConfig}
            multiSelect={{
              selectAll,
              setSelectAll,
              selectedRowIds: selectedTraceIds,
              setRowSelection: setSelectedRows,
              totalCount,
              ...paginationState,
            }}
          />
        )}

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          {!hideControls && (
            <DataTableControls
              // Remount the sidebar when the saved view changes so the new view's filters replace any stale draft UI state.
              key={viewControllers.selectedViewId ?? "no-view"}
              queryFilter={queryFilter}
              filterWithAI
            />
          )}

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              columns={columns}
              hidePagination={hideControls}
              isFetching={refreshConfig.isRefreshing}
              data={
                traces.isPending || isViewLoading
                  ? { isLoading: true, isError: false }
                  : traces.isError
                    ? {
                        isLoading: false,
                        isError: true,
                        error: traces.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: rows,
                      }
              }
              pagination={
                limitRows
                  ? undefined
                  : {
                      totalCount,
                      isTotalCountLoading: totalCountQuery.isPending,
                      onChange: (updater) => {
                        const next =
                          typeof updater === "function"
                            ? updater(paginationState)
                            : updater;
                        // Leaving page 1 freezes the paged set at the newest row
                        // still on screen, so page 2 continues where this page
                        // ends even if rows keep arriving.
                        pinOnLeavingFirstPage(
                          next.pageIndex,
                          rows[0]?.timestamp,
                        );
                        setPaginationState(next);
                      },
                      state: paginationState,
                    }
              }
              setOrderBy={setOrderByState}
              orderBy={orderByState}
              rowSelection={selectedRows}
              highlightAllRows={selectAll}
              setRowSelection={setSelectedRows}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              rowHeight={rowHeight}
              peekView={peekConfig}
              tableName="traces"
            />
          </div>
        </ResizableFilterLayout>
        {peekConfig && (
          <TablePeekViewTraceDetail {...peekConfig} projectId={projectId} />
        )}
      </div>
    </DataTableControlsProvider>
  );
}

const TracesDynamicCell = ({
  traceId,
  projectId,
  timestamp,
  col,
  singleLine = false,
}: {
  traceId: string;
  projectId: string;
  timestamp: Date;
  col: "input" | "output" | "metadata";
  singleLine?: boolean;
}) => {
  const trace = api.traces.byId.useQuery(
    { traceId, projectId, timestamp, verbosity: "compact" },
    {
      refetchOnMount: false, // prevents refetching loops
      staleTime: 60 * 1000, // 1 minute
      meta: { silentHttpCodes: [404] },
    },
  );

  const data =
    col === "output"
      ? trace.data?.output
      : col === "input"
        ? trace.data?.input
        : trace.data?.metadata;

  if (trace.isPending) {
    return <ConnectedIOTableCell isLoading singleLine={singleLine} />;
  }

  return (
    <ConnectedIOTableCell
      data={data}
      singleLine={singleLine}
      enableExpandOnHover={singleLine}
    />
  );
};

export default function TracesTable(props: TracesTableProps) {
  const [traceIdToDelete, setTraceIdToDelete] = useState<string | null>(null);
  const capture = usePostHogClientCapture();

  return (
    <DialogController
      closeOnInteractionOutside
      size="default"
      renderContent={({ closeDialog }) =>
        traceIdToDelete ? (
          <DeleteTraceDialogContent
            closeDialog={closeDialog}
            projectId={props.projectId}
            traceId={traceIdToDelete}
          />
        ) : null
      }
    >
      {({ openDialog }) => (
        <TracesTableInternal
          {...props}
          openDeleteTraceDialog={(traceId) => {
            capture("trace:delete_form_open", {
              source: "table-single-row",
            });
            setTraceIdToDelete(traceId);
            openDialog();
          }}
        />
      )}
    </DialogController>
  );
}
