import { StarTraceToggle } from "@/src/components/star-toggle";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { Badge } from "@/src/components/ui/badge";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type RouterOutput } from "@/src/utils/types";
import { type Row, type RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import type Decimal from "decimal.js";
import {
  compactNumberFormatter,
  numberFormatter,
  usdFormatter,
} from "@/src/utils/numbers";
import { DeleteTraceButton } from "@/src/components/deleteButton";
import {
  formatAsLabel,
  LevelColors,
  LevelSymbols,
} from "@/src/components/level-colors";
import { cn } from "@/src/utils/tailwind";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
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
} from "@langfuse/shared";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { MemoizedIOTableCell } from "../../ui/IOTableCell";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { type ScoreAggregate } from "@langfuse/shared";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Skeleton } from "@/src/components/ui/skeleton";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { BreakdownTooltip } from "@/src/components/trace2/components/_shared/BreakdownToolTip";
import { InfoIcon, MoreVertical } from "lucide-react";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import React from "react";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { type TableAction } from "@/src/features/table/types";
import {
  LevelCountsDisplay,
  type LevelCount,
} from "@/src/components/level-counts-display";
import {
  DropdownMenuContent,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import TableIdOrName from "@/src/components/table/table-id";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { traceFilterConfig } from "@/src/features/filters/config/traces-config";
import { PeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { type TableDateRange } from "@/src/utils/date-range-utils";
import useSessionStorage from "@/src/components/useSessionStorage";
import {
  type RefreshInterval,
  REFRESH_INTERVALS,
} from "@/src/components/table/data-table-refresh-button";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import TagList from "@/src/features/tag/components/TagList";

export type TracesTableRow = {
  // Shown by default
  bookmarked: boolean;
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
  omittedFilter?: string[];
  hideControls?: boolean;
  externalFilterState?: FilterState;
  externalDateRange?: TableDateRange;
  limitRows?: number;
};

export default function TracesTable({
  projectId,
  userId,
  omittedFilter = [],
  hideControls = false,
  externalFilterState,
  externalDateRange,
  limitRows,
}: TracesTableProps) {
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

  const [refreshTick, setRefreshTick] = useState(0);
  const [manualRefreshTrigger, setManualRefreshTrigger] = useState(0); // resets the interval when manual refresh is called
  const { setDetailPageList } = useDetailPageLists();

  // Auto-increment refresh tick to force date range recalculation
  useEffect(() => {
    if (!refreshInterval) return;
    const id = setInterval(() => {
      setRefreshTick((t) => t + 1);
    }, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval, manualRefreshTrigger]);

  const handleRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
    setManualRefreshTrigger((t) => t + 1);
    void Promise.all([
      utils.traces.all.invalidate(),
      utils.traces.metrics.invalidate(),
      utils.traces.countAll.invalidate(),
      utils.traces.filterOptions.invalidate(),
      utils.projects.environmentFilterOptions.invalidate(),
    ]);
  }, [utils]);

  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Convert timeRange to absolute date range for compatibility
  // refreshTick forces recalculation on each refresh cycle
  const tableDateRange = useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, refreshTick]);

  const dateRange = externalDateRange ?? tableDateRange;

  const [orderByState, setOrderByState] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "timestamp",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
        ...(dateRange.to
          ? [
              {
                column: "timestamp",
                type: "datetime",
                operator: "<=",
                value: dateRange.to,
              } as const,
            ]
          : []),
      ]
    : [];
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

    return {
      name:
        traceFilterOptionsResponse.data?.name?.map((n) => ({
          value: n.value,
          count: Number(n.count),
        })) ?? undefined,
      // tags don't have counts
      tags:
        traceFilterOptionsResponse.data?.tags?.map((t) => t.value) ?? undefined,
      environment:
        environmentFilterOptions.data?.map((value) => value.environment) ??
        undefined,
      level: ["DEFAULT", "DEBUG", "WARNING", "ERROR"],
      bookmarked: ["Bookmarked", "Not bookmarked"],
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
    };
  }, [environmentFilterOptions.data, traceFilterOptionsResponse.data]);

  const queryFilter = useSidebarFilterState(
    traceFilterConfig,
    filterOptions,
    projectId,
    traceFilterOptionsResponse.isPending || environmentFilterOptions.isPending,
    hideControls, // Disable URL persistence for embedded preview tables
  );

  const combinedFilterState = queryFilter.filterState.concat(
    userIdFilter,
    dateRangeFilter,
  );

  // Use external filter state if provided, otherwise use combined filter state
  const filterState = externalFilterState || combinedFilterState;

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const { selectAll, setSelectAll } = useSelectAll(projectId, "traces");

  const { searchQuery, searchType, setSearchQuery, setSearchType } =
    useFullTextSearch();

  const tracesAllCountFilter = {
    projectId,
    filter: filterState,
    searchQuery: searchQuery,
    searchType: searchType,
    page: 0,
    limit: 0,
    orderBy: null,
  };

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

  const traces = api.traces.all.useQuery(tracesAllQueryFilter, {
    enabled: environmentFilterOptions.data !== undefined,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
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
    },
  );

  type TracesCoreOutput = RouterOutput["traces"]["all"]["traces"][number];
  type TraceMetricOutput = RouterOutput["traces"]["metrics"][number];

  const traceRowData = joinTableCoreAndMetrics<
    TracesCoreOutput,
    TraceMetricOutput
  >(traces.data?.traces, traceMetrics.data);

  const totalCount = totalCountQuery.data?.totalCount ?? null;

  useEffect(() => {
    if (traces.isSuccess) {
      setDetailPageList(
        "traces",
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

  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<TracesTableRow>({
      scoreColumnKey: "scores",
      projectId,
      filter: scoreFilters.forTraces(),
      fromTimestamp: dateRange?.from,
    });

  const hasTraceDeletionEntitlement = useHasEntitlement("trace-deletion");

  const { selectActionColumn } = TableSelectionManager<TracesTableRow>({
    projectId,
    tableName: "traces",
    setSelectedRows,
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
      void utils.traces.all.invalidate();
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

  const displayCount = totalCountQuery.isPending ? (
    <span className="inline-block font-mono">...</span>
  ) : selectAll ? (
    compactNumberFormatter(totalCountQuery.data?.totalCount)
  ) : (
    compactNumberFormatter(Object.keys(selectedRows).length)
  );

  const tableActions: TableAction[] = [
    ...(hasTraceDeletionEntitlement
      ? [
          {
            id: ActionId.TraceDelete,
            type: BatchActionType.Delete,
            label: "Delete Traces",
            description: `This action permanently deletes ${displayCount} traces and cannot be undone. Trace deletion happens asynchronously and may take up to 24 hours.`,
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
      description: "Add selected traces to an annotation queue.",
      targetLabel: "Annotation Queue",
      execute: handleAddToAnnotationQueue,
      accessCheck: {
        scope: "annotationQueues:CUD",
      },
    },
  ];

  const enableSorting = !hideControls;

  const columns: LangfuseColumnDef<TracesTableRow>[] = [
    ...(hideControls
      ? []
      : [
          selectActionColumn,
          {
            accessorKey: "bookmarked",
            header: undefined,
            id: "bookmarked",
            size: 30,
            isFixedPosition: true,
            cell: ({ row }: { row: Row<TracesTableRow> }) => {
              const bookmarked: TracesTableRow["bookmarked"] =
                row.getValue("bookmarked");
              const traceId = row.getValue("id");
              return typeof traceId === "string" &&
                typeof bookmarked === "boolean" ? (
                <StarTraceToggle
                  tracesFilter={tracesAllQueryFilter}
                  traceId={traceId}
                  projectId={projectId}
                  value={bookmarked}
                  size="icon-xs"
                />
              ) : undefined;
            },
            enableSorting,
          },
        ]),
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      id: "timestamp",
      size: 150,
      enableHiding: true,
      enableSorting,
      cell: ({ row }) => {
        const value: TracesTableRow["timestamp"] = row.getValue("timestamp");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      size: 150,
      enableHiding: true,
      enableSorting,
      cell: ({ row }) => {
        const value: TracesTableRow["name"] = row.getValue("name");
        return value ?? undefined;
      },
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 400,
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
      cell: ({ row }) => {
        const value: TracesTableRow["levelCounts"] =
          row.getValue("levelCounts");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;

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
      // add seconds to the end of the latency
      cell: ({ row }) => {
        const value: TracesTableRow["latency"] = row.getValue("latency");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return value !== undefined ? (
          <span className="text-nowrap">{formatIntervalSeconds(value)}</span>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting,
    },

    {
      accessorKey: "tokens",
      header: "Tokens",
      id: "tokens",
      size: 180,
      cell: ({ row }) => {
        const value: TracesTableRow["usage"] = row.getValue("usage");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        if (!value.inputUsage && !value.outputUsage && !value.totalUsage) {
          return null;
        }

        return (
          <BreakdownTooltip details={row.original.tokenDetails ?? []}>
            <div className="flex items-center gap-1">
              <TokenUsageBadge
                inputUsage={Number(value.inputUsage ?? 0)}
                outputUsage={Number(value.outputUsage ?? 0)}
                totalUsage={Number(value.totalUsage ?? 0)}
                inline
              />
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        );
      },
      enableSorting,
      enableHiding: true,
    },
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: "Total Cost",
      size: 130,
      cell: ({ row }) => {
        const cost: TracesTableRow["totalCost"] = row.getValue("totalCost");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
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
    {
      accessorKey: "environment",
      header: "Environment",
      id: "environment",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: TracesTableRow["environment"] =
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
      accessorKey: "tags",
      id: "tags",
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
              className="underline decoration-primary/30 hover:decoration-primary"
              onClick={(e) => e.stopPropagation()}
            >
              here
            </a>
            .
          </>
        ),
        href: "https://langfuse.com/docs/observability/features/tags",
      },
      cell: ({ row }) => {
        const traceTags: string[] | undefined = row.getValue("tags");
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
      enableHiding: true,
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      size: 400,
      headerTooltip: {
        description: (
          <>
            Add metadata to traces to track additional information. Read more
            about adding metadata{" "}
            <a
              href="https://langfuse.com/docs/observability/features/metadata"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-primary/30 hover:decoration-primary"
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
                <Skeleton className="h-3 w-1/2" />
              ) : null;
            },
            columns: scoreColumns,
          },
        ]),
    {
      accessorKey: "sessionId",
      enableColumnFilter: !omittedFilter.find((f) => f === "sessionId"),
      id: "sessionId",
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
              className="underline decoration-primary/30 hover:decoration-primary"
              onClick={(e) => e.stopPropagation()}
            >
              here
            </a>
            .
          </>
        ),
        href: "https://langfuse.com/docs/observability/features/sessions",
      },
      cell: ({ row }) => {
        const value: TracesTableRow["sessionId"] = row.getValue("sessionId");
        return value && typeof value === "string" ? (
          <TableIdOrName value={value} />
        ) : undefined;
      },
      defaultHidden: true,
      enableHiding: true,
      enableSorting,
    },
    {
      accessorKey: "userId",
      header: "User",
      id: "userId",
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
              className="underline decoration-primary/30 hover:decoration-primary"
              onClick={(e) => e.stopPropagation()}
            >
              here
            </a>
            .
          </>
        ),
        href: "https://langfuse.com/docs/observability/features/users",
      },
      cell: ({ row }) => {
        const value: TracesTableRow["userId"] = row.getValue("userId");
        return value && typeof value === "string" ? (
          <TableIdOrName value={value} />
        ) : undefined;
      },
      defaultHidden: true,
      enableHiding: true,
      enableSorting,
    },
    {
      accessorKey: "observationCount",
      id: "observationCount",
      header: "Observations",
      size: 120,
      headerTooltip: {
        description: "The number of observations in the trace.",
      },
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: TracesTableRow["observationCount"] =
          row.getValue("observationCount");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return <span>{numberFormatter(value, 0)}</span>;
      },
    },
    {
      accessorKey: "level",
      id: "level",
      header: "Level",
      size: 75,
      cell: ({ row }) => {
        const value: TracesTableRow["level"] = row.getValue("level");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
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
        ) : (
          <span>-</span>
        );
      },
      defaultHidden: true,
      enableHiding: true,
      enableSorting,
    },
    {
      accessorKey: "version",
      id: "version",
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
              className="underline decoration-primary/30 hover:decoration-primary"
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
    },
    {
      accessorKey: "release",
      id: "release",
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
              className="underline decoration-primary/30 hover:decoration-primary"
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
    },
    {
      accessorKey: "id",
      header: "Trace ID",
      id: "id",
      size: 90,
      cell: ({ row }) => {
        const value: TracesTableRow["id"] = row.getValue("id");

        return value && typeof value === "string" ? (
          <TableIdOrName value={value} />
        ) : undefined;
      },
      defaultHidden: true,
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
        return traceMetrics.isPending ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: [
        {
          accessorKey: "inputCost",
          id: "inputCost",
          header: "Input Cost",
          size: 100,
          cell: ({ row }: { row: Row<TracesTableRow> }) => {
            const cost: TracesTableRow["cost"] = row.getValue("cost");
            if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
            return (
              <div>
                {cost?.inputCost ? (
                  <span>{usdFormatter(cost.inputCost.toNumber())}</span>
                ) : (
                  <span>-</span>
                )}
              </div>
            );
          },
          defaultHidden: true,
          enableHiding: true,
          enableSorting,
        },
        {
          accessorKey: "outputCost",
          id: "outputCost",
          header: "Output Cost",
          size: 100,
          cell: ({ row }: { row: Row<TracesTableRow> }) => {
            const cost: TracesTableRow["cost"] = row.getValue("cost");
            if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
            return (
              <div>
                {cost?.outputCost ? (
                  <span>{usdFormatter(cost.outputCost.toNumber())}</span>
                ) : (
                  <span>-</span>
                )}
              </div>
            );
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        },
      ],
    },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return traceMetrics.isPending ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: [
        {
          accessorKey: "inputTokens",
          id: "inputTokens",
          header: "Input Tokens",
          size: 110,
          cell: ({ row }: { row: Row<TracesTableRow> }) => {
            const value: TracesTableRow["usage"] = row.getValue("usage");
            if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
            return <span>{numberFormatter(value.inputUsage, 0)}</span>;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        },
        {
          accessorKey: "outputTokens",
          id: "outputTokens",
          header: "Output Tokens",
          size: 110,
          cell: ({ row }: { row: Row<TracesTableRow> }) => {
            const value: TracesTableRow["usage"] = row.getValue("usage");
            if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
            return <span>{numberFormatter(value.outputUsage, 0)}</span>;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        },
        {
          accessorKey: "totalTokens",
          id: "totalTokens",
          header: "Total Tokens",
          size: 110,
          cell: ({ row }: { row: Row<TracesTableRow> }) => {
            const value: TracesTableRow["usage"] = row.getValue("usage");
            if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
            return <span>{numberFormatter(value.totalUsage, 0)}</span>;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        },
      ],
    },
    ...(hideControls
      ? []
      : [
          {
            accessorKey: "action",
            header: "Action",
            size: 70,
            isFixedPosition: true,
            cell: ({ row }: { row: Row<TracesTableRow> }) => {
              const traceId: TracesTableRow["id"] = row.getValue("id");
              return (
                traceId &&
                typeof traceId === "string" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem asChild>
                        <DeleteTraceButton
                          itemId={traceId}
                          projectId={projectId}
                          isTableAction
                        />
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              );
            },
          },
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
    queryParams: ["observation", "display", "timestamp"],
    extractParamsValuesFromRow: (row: TracesTableRow) => ({
      timestamp: row.timestamp?.toISOString() || "",
    }),
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
    },
  });

  const peekConfig = useMemo(() => {
    if (hideControls) return undefined;
    return {
      itemType: "TRACE" as const,
      detailNavigationKey: "traces",
      peekEventOptions: {
        ignoredSelectors: ['[role="checkbox"]', '[aria-label="bookmark"]'],
      },
      children: <PeekViewTraceDetail projectId={projectId} />,
      tableDataUpdatedAt: Math.max(
        traces.dataUpdatedAt,
        traceMetrics.dataUpdatedAt,
      ),
      ...peekNavigationProps,
    };
  }, [
    projectId,
    hideControls,
    peekNavigationProps,
    traces.dataUpdatedAt,
    traceMetrics.dataUpdatedAt,
  ]);

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
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibility,
      setSearchQuery: setSearchQuery,
    },
    validationContext: {
      columns,
      filterColumnDefinition: traceFilterConfig.columnDefinitions,
    },
    currentFilterState: queryFilter.filterState,
  });

  const rows = useMemo(() => {
    return traces.isSuccess
      ? (traceRowData?.rows?.map((trace) => {
          return {
            bookmarked: trace.bookmarked,
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

  return (
    <DataTableControlsProvider>
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        {!hideControls && (
          <DataTableToolbar
            columns={columns}
            filterWithAI
            filterState={queryFilter.filterState}
            viewConfig={{
              tableName: TableViewPresetTableName.Traces,
              projectId,
              controllers: viewControllers,
            }}
            searchConfig={{
              metadataSearchFields: ["ID", "Trace Name", "User ID"],
              updateQuery: setSearchQuery,
              currentQuery: searchQuery ?? undefined,
              tableAllowsFullTextSearch: true,
              setSearchType,
              searchType,
            }}
            columnsWithCustomSelect={["name", "tags"]}
            actionButtons={[
              Object.keys(selectedRows).filter((traceId) =>
                traces.data?.traces.map((t) => t.id).includes(traceId),
              ).length > 0 ? (
                <TableActionMenu
                  key="traces-multi-select-actions"
                  projectId={projectId}
                  actions={tableActions}
                  tableName={BatchExportTableName.Traces}
                />
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
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            refreshConfig={{
              onRefresh: handleRefresh,
              isRefreshing:
                traces.isFetching ||
                traceMetrics.isFetching ||
                totalCountQuery.isFetching,
              interval: refreshInterval,
              setInterval: setRefreshInterval,
            }}
            multiSelect={{
              selectAll,
              setSelectAll,
              selectedRowIds: Object.keys(selectedRows).filter((traceId) =>
                traces.data?.traces.map((t) => t.id).includes(traceId),
              ),
              setRowSelection: setSelectedRows,
              totalCount,
              ...paginationState,
            }}
          />
        )}

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          {!hideControls && (
            <DataTableControls queryFilter={queryFilter} filterWithAI />
          )}

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              columns={columns}
              hidePagination={hideControls}
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
                      onChange: setPaginationState,
                      state: paginationState,
                    }
              }
              setOrderBy={setOrderByState}
              orderBy={orderByState}
              rowSelection={selectedRows}
              setRowSelection={setSelectedRows}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              rowHeight={rowHeight}
              peekView={peekConfig}
              tableName={"traces"}
            />
          </div>
        </ResizableFilterLayout>
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

  return (
    <MemoizedIOTableCell
      isLoading={trace.isPending}
      data={data}
      className={cn(
        col === "output" && "bg-accent-light-green",
        col === "input" && "bg-muted/50",
      )}
      singleLine={singleLine}
    />
  );
};
