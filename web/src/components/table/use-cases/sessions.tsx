import { StarSessionToggle } from "@/src/components/star-toggle";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  sessionFilterConfig,
  SESSION_COLUMN_TO_BACKEND_KEY,
} from "@/src/features/filters/config/sessions-config";
import { transformFiltersForBackend } from "@/src/features/filters/lib/filter-transform";
import {
  type FilterState,
  BatchExportTableName,
  TableViewPresetTableName,
  AnnotationQueueObjectType,
  BatchActionType,
  ActionId,
  type TimeFilter,
} from "@langfuse/shared";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { type RouterOutput } from "@/src/utils/types";
import type Decimal from "decimal.js";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Skeleton } from "@/src/components/ui/skeleton";
import TagList from "@/src/features/tag/components/TagList";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { cn } from "@/src/utils/tailwind";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { Badge } from "@/src/components/ui/badge";
import { type ScoreAggregate } from "@langfuse/shared";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { type TableAction } from "@/src/features/table/types";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type RowSelectionState } from "@tanstack/react-table";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";

export type SessionTableRow = {
  id: string;
  createdAt: Date;
  bookmarked: boolean;
  userIds: string[] | undefined;
  countTraces: number | undefined;
  sessionDuration: number | null | undefined;
  inputCost: Decimal | undefined;
  outputCost: Decimal | undefined;
  totalCost: Decimal | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  traceTags: string[] | undefined;
  environment?: string;
  scores?: ScoreAggregate;
};

export type SessionTableProps = {
  projectId: string;
  userId?: string;
  omittedFilter?: string[];
  isBetaEnabled?: boolean;
};

export default function SessionsTable({
  projectId,
  userId,
  omittedFilter = [],
  isBetaEnabled = false,
}: SessionTableProps) {
  const { setDetailPageList } = useDetailPageLists();
  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Convert timeRange to absolute date range for compatibility
  const dateRange = useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
  }, [timeRange]);
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});

  const userIdFilter: FilterState = userId
    ? [
        {
          column: "User IDs",
          type: "arrayOptions",
          operator: "any of",
          value: [userId],
        },
      ]
    : [];

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "createdAt",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
        ...(dateRange.to
          ? [
              {
                column: "createdAt",
                type: "datetime",
                operator: "<=",
                value: dateRange.to,
              } as const,
            ]
          : []),
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

  const environmentOptions = useMemo(
    () =>
      environmentFilterOptions.data?.map((value) => value.environment) ??
      undefined,
    [environmentFilterOptions.data],
  );

  const { selectAll, setSelectAll } = useSelectAll(projectId, "sessions");

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("sessions", "s");

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });

  // dateRangeFilter contains only createdAt datetime filters, pass directly to API
  const filterOptionsV3 = api.sessions.filterOptions.useQuery(
    {
      projectId,
      timestampFilter:
        dateRangeFilter.length > 0
          ? (dateRangeFilter as TimeFilter[])
          : undefined,
    },
    {
      enabled: !isBetaEnabled,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const filterOptionsV4 = api.sessions.filterOptionsFromEvents.useQuery(
    {
      projectId,
      timestampFilter:
        dateRangeFilter.length > 0
          ? (dateRangeFilter as TimeFilter[])
          : undefined,
    },
    {
      enabled: isBetaEnabled,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const filterOptions = isBetaEnabled ? filterOptionsV4 : filterOptionsV3;

  const newFilterOptions = useMemo(() => {
    const scoreCategories =
      filterOptions.data?.score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;

    const scoresNumeric = filterOptions.data?.scores_avg ?? undefined;

    return {
      bookmarked: ["Bookmarked", "Not bookmarked"],
      environment: environmentOptions,
      userIds:
        filterOptions.data?.userIds.map((u) => ({
          value: u.value,
          count: Number(u.count),
        })) ?? undefined,
      tags: filterOptions.data?.tags.map((t) => t.value) ?? undefined, // tags don't have counts
      sessionDuration: [],
      countTraces: [],
      inputTokens: [],
      outputTokens: [],
      totalTokens: [],
      inputCost: [],
      outputCost: [],
      totalCost: [],
      score_categories: scoreCategories,
      scores_avg: scoresNumeric,
    };
  }, [environmentOptions, filterOptions.data]);

  const queryFilter = useSidebarFilterState(
    sessionFilterConfig,
    newFilterOptions,
    projectId,
    filterOptions.isPending || environmentFilterOptions.isPending,
  );

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  const combinedFilterState = queryFilter.filterState.concat(
    userIdFilter,
    dateRangeFilter,
  );

  const backendFilterState = transformFiltersForBackend(
    combinedFilterState,
    SESSION_COLUMN_TO_BACKEND_KEY,
    sessionFilterConfig.columnDefinitions,
  );

  const payloadCount = {
    projectId,
    filter: backendFilterState,
    orderBy: null,
    page: 0,
    limit: 1,
  };

  const payloadGetAll = {
    ...payloadCount,
    orderBy: orderByState,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  };

  const sessionsV3 = api.sessions.all.useQuery(payloadGetAll, {
    enabled: !isBetaEnabled,
    refetchOnWindowFocus: true,
  });
  const sessionsV4 = api.sessions.allFromEvents.useQuery(payloadGetAll, {
    enabled: isBetaEnabled,
    refetchOnWindowFocus: true,
  });
  const sessions = isBetaEnabled ? sessionsV4 : sessionsV3;

  const sessionCountQueryV3 = api.sessions.countAll.useQuery(payloadCount, {
    enabled: !isBetaEnabled,
    refetchOnWindowFocus: true,
  });
  const sessionCountQueryV4 = api.sessions.countAllFromEvents.useQuery(
    payloadCount,
    {
      enabled: isBetaEnabled,
      refetchOnWindowFocus: true,
    },
  );
  const sessionCountQuery = isBetaEnabled
    ? sessionCountQueryV4
    : sessionCountQueryV3;

  const addToQueueMutation = api.annotationQueueItems.createMany.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: "Sessions added to queue",
        description: `Selected sessions will be added to queue "${data.queueName}". This may take a minute.`,
        link: {
          href: `/project/${projectId}/annotation-queues/${data.queueId}`,
          text: `View queue "${data.queueName}"`,
        },
      });
    },
  });

  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<SessionTableRow>({
      projectId,
      scoreColumnKey: "scores",
      fromTimestamp: dateRange?.from,
      filter: scoreFilters.forSessions(),
    });

  const sessionMetricsV3 = api.sessions.metrics.useQuery(
    {
      projectId,
      sessionIds: sessionsV3.data?.sessions.map((s) => s.id) ?? [],
    },
    {
      enabled: sessionsV3.data !== undefined && !isBetaEnabled,
      refetchOnWindowFocus: true,
    },
  );

  const sessionMetricsV4 = api.sessions.metricsFromEvents.useQuery(
    {
      projectId,
      sessionIds: sessionsV4.data?.sessions.map((s) => s.id) ?? [],
    },
    {
      enabled: sessionsV4.data !== undefined && isBetaEnabled,
      refetchOnWindowFocus: true,
    },
  );

  const sessionMetrics = isBetaEnabled ? sessionMetricsV4 : sessionMetricsV3;

  type SessionCoreOutput = RouterOutput["sessions"]["all"]["sessions"][number];
  type SessionMetricOutput = RouterOutput["sessions"]["metrics"][number];

  const sessionRowData = joinTableCoreAndMetrics<
    SessionCoreOutput,
    SessionMetricOutput
  >(sessions.data?.sessions, sessionMetrics.data);

  const totalCount = sessionCountQuery.data?.totalCount ?? null;
  useEffect(() => {
    if (sessions.isSuccess) {
      setDetailPageList(
        "sessions",
        sessions.data.sessions.map((t) => ({ id: t.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.isSuccess, sessions.data]);

  const { selectActionColumn } = TableSelectionManager<SessionTableRow>({
    projectId,
    tableName: "sessions",
    setSelectedRows,
  });

  const handleAddToAnnotationQueue = async ({
    projectId,
    targetId,
  }: {
    projectId: string;
    targetId: string;
  }) => {
    const selectedSessionIds = Object.keys(selectedRows).filter((sessionId) =>
      sessions.data?.sessions.map((t) => t.id).includes(sessionId),
    );

    await addToQueueMutation.mutateAsync({
      projectId,
      objectIds: selectedSessionIds,
      objectType: AnnotationQueueObjectType.SESSION,
      queueId: targetId,
      isBatchAction: selectAll,
      query: {
        filter: backendFilterState,
        orderBy: orderByState,
      },
    });
    setSelectedRows({});
  };

  const tableActions: TableAction[] = [
    {
      id: ActionId.SessionAddToAnnotationQueue,
      type: BatchActionType.Create,
      label: "Add to Annotation Queue",
      description: "Add selected sessions to an annotation queue.",
      targetLabel: "Annotation Queue",
      execute: handleAddToAnnotationQueue,
      accessCheck: {
        scope: "annotationQueues:CUD",
      },
    },
  ];

  const columns: LangfuseColumnDef<SessionTableRow>[] = [
    selectActionColumn,
    {
      accessorKey: "bookmarked",
      id: "bookmarked",
      isFixedPosition: true,
      header: undefined,
      size: 50,
      cell: ({ row }) => {
        const bookmarked: SessionTableRow["bookmarked"] =
          row.getValue("bookmarked");
        const sessionId: SessionTableRow["id"] = row.getValue("id");

        return typeof sessionId === "string" &&
          typeof bookmarked === "boolean" ? (
          <StarSessionToggle
            sessionId={sessionId}
            projectId={projectId}
            value={bookmarked}
            size="icon-xs"
          />
        ) : undefined;
      },
      enableSorting: false,
    },

    {
      accessorKey: "id",
      id: "id",
      header: "ID",
      size: 200,
      isFixedPosition: true,
      cell: ({ row }) => {
        const value: SessionTableRow["id"] = row.getValue("id");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/sessions/${encodeURIComponent(value)}`}
            value={value}
          />
        ) : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: "Created At",
      size: 150,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: SessionTableRow["createdAt"] = row.getValue("createdAt");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "sessionDuration",
      id: "sessionDuration",
      header: "Duration",
      size: 130,
      enableHiding: true,
      cell: ({ row }) => {
        const value: SessionTableRow["sessionDuration"] =
          row.getValue("sessionDuration");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value && typeof value === "number"
          ? formatIntervalSeconds(value)
          : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "environment",
      header: "Environment",
      id: "environment",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: SessionTableRow["environment"] =
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
      accessorKey: "userIds",
      enableColumnFilter: !omittedFilter.find((f) => f === "userIds"),
      id: "userIds",
      header: "User IDs",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const value: SessionTableRow["userIds"] = row.getValue("userIds");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value && Array.isArray(value) ? (
          <div className="flex gap-1">
            {(value as string[]).map((user) => (
              <TableLink
                key={user}
                path={`/project/${projectId}/users/${encodeURIComponent(user)}`}
                value={user}
              />
            ))}
          </div>
        ) : undefined;
      },
    },
    {
      accessorKey: "countTraces",
      id: "countTraces",
      header: "Traces",
      size: 100,
      headerTooltip: {
        description: "The number of traces in the session.",
      },
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: SessionTableRow["countTraces"] =
          row.getValue("countTraces");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value ? <span>{numberFormatter(value, 0)}</span> : undefined;
      },
    },
    {
      accessorKey: "inputCost",
      id: "inputCost",
      header: "Input Cost",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: SessionTableRow["inputCost"] = row.getValue("inputCost");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "outputCost",
      id: "outputCost",
      header: "Output Cost",
      size: 110,
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: SessionTableRow["outputCost"] = row.getValue("outputCost");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: "Total Cost",
      size: 110,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: SessionTableRow["totalCost"] = row.getValue("totalCost");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "inputTokens",
      id: "inputTokens",
      header: "Input Tokens",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: SessionTableRow["inputTokens"] =
          row.getValue("inputTokens");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value ? (
          <span>{numberFormatter(Number(value), 0)}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "outputTokens",
      id: "outputTokens",
      header: "Output Tokens",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: SessionTableRow["outputTokens"] =
          row.getValue("outputTokens");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value ? (
          <span>{numberFormatter(Number(value), 0)}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "totalTokens",
      id: "totalTokens",
      header: "Total Tokens",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: SessionTableRow["totalTokens"] =
          row.getValue("totalTokens");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value ? (
          <span>{numberFormatter(Number(value), 0)}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "usage",
      id: "usage",
      header: "Usage",
      size: 220,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const promptTokens: SessionTableRow["inputTokens"] =
          row.getValue("inputTokens");
        const completionTokens: SessionTableRow["outputTokens"] =
          row.getValue("outputTokens");
        const totalTokens: SessionTableRow["totalTokens"] =
          row.getValue("totalTokens");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return (
          <TokenUsageBadge
            inputUsage={Number(promptTokens ?? 0)}
            outputUsage={Number(completionTokens ?? 0)}
            totalUsage={Number(totalTokens ?? 0)}
            inline
          />
        );
      },
    },
    {
      accessorKey: "traceTags",
      id: "traceTags",
      header: "Trace Tags",
      size: 250,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: SessionTableRow["traceTags"] = row.getValue("traceTags");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return (
          value && (
            <div
              className={cn(
                "flex gap-x-2 gap-y-1",
                rowHeight !== "s" && "flex-wrap",
              )}
            >
              <TagList selectedTags={value} isLoading={false} viewOnly />
            </div>
          )
        );
      },
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<SessionTableRow>("sessionsColumnVisibility", columns);

  const [columnOrder, setColumnOrder] = useColumnOrder<SessionTableRow>(
    "sessionsColumnOrder",
    columns,
  );

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Sessions,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibility,
    },
    validationContext: {
      columns,
      filterColumnDefinition: sessionFilterConfig.columnDefinitions,
    },
    currentFilterState: queryFilter.filterState,
  });

  return (
    <DataTableControlsProvider>
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        <DataTableToolbar
          filterState={queryFilter.filterState}
          actionButtons={[
            Object.keys(selectedRows).filter((sessionId) =>
              sessions.data?.sessions.map((s) => s.id).includes(sessionId),
            ).length > 0 ? (
              <TableActionMenu
                key="sessions-multi-select-actions"
                projectId={projectId}
                actions={tableActions}
                tableName={BatchExportTableName.Sessions}
              />
            ) : null,
            <BatchExportTableButton
              {...{
                projectId,
                filterState: backendFilterState,
                orderByState,
              }}
              tableName={BatchExportTableName.Sessions}
              key="batchExport"
            />,
          ]}
          columns={columns}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
          columnOrder={columnOrder}
          setColumnOrder={setColumnOrder}
          viewConfig={{
            tableName: TableViewPresetTableName.Sessions,
            projectId,
            controllers: viewControllers,
          }}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          columnsWithCustomSelect={["userIds"]}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          multiSelect={{
            selectAll,
            setSelectAll,
            selectedRowIds: Object.keys(selectedRows).filter((sessionId) =>
              sessions.data?.sessions.map((s) => s.id).includes(sessionId),
            ),
            setRowSelection: setSelectedRows,
            totalCount,
            ...paginationState,
          }}
        />

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          <DataTableControls queryFilter={queryFilter} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName={"sessions"}
              columns={columns}
              data={
                sessions.isPending || isViewLoading
                  ? { isLoading: true, isError: false }
                  : sessions.isError
                    ? {
                        isLoading: false,
                        isError: true,
                        error: sessions.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: sessionRowData.rows?.map<SessionTableRow>(
                          (session) => {
                            return {
                              id: session.id,
                              createdAt: session.createdAt,
                              bookmarked: session.bookmarked,
                              userIds: session.userIds,
                              countTraces: session.countTraces,
                              sessionDuration: session.sessionDuration,
                              inputCost: session.inputCost,
                              outputCost: session.outputCost,
                              totalCost: session.totalCost,
                              inputTokens: session.promptTokens,
                              outputTokens: session.completionTokens,
                              totalTokens: session.totalTokens,
                              traceTags: session.traceTags,
                              environment: session.environment,
                              scores: session.scores,
                            };
                          },
                        ),
                      }
              }
              pagination={{
                totalCount,
                onChange: setPaginationState,
                state: paginationState,
              }}
              setOrderBy={setOrderByState}
              orderBy={orderByState}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              rowSelection={selectedRows}
              setRowSelection={setSelectedRows}
              help={{
                description:
                  "A session is a collection of related traces, such as a conversation or thread. To begin, add a sessionId to the trace.",
                href: "https://langfuse.com/docs/observability/features/sessions",
              }}
              rowHeight={rowHeight}
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}
