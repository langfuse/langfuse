import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { Skeleton } from "@/src/components/ui/skeleton";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createLinkListTableColumn } from "@/src/components/design-system/table/columns/createLinkListTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTokenUsageTableColumn } from "@/src/components/design-system/table/columns/createTokenUsageTableColumn";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import {
  type UseSidebarFilterStateOptions,
  useSidebarFilterState,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  getSessionFilterConfig,
  SESSION_COLUMN_TO_BACKEND_KEY,
  type SessionOmittableFilterColumn,
} from "@/src/features/filters/config/sessions-config";
import { buildSidebarFilterSessionContextId } from "@/src/features/filters/lib/persistedSidebarFilterQuery";
import {
  DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
  type FilterState,
  BatchExportTableName,
  TableViewPresetTableName,
  AnnotationQueueObjectType,
  BatchActionType,
  ActionId,
  type TimeFilter,
  type ScoreAggregate,
} from "@langfuse/shared";
import { transformFiltersForBackend } from "@/src/features/filters/lib/filter-transform";
import { sortOptionValues } from "@/src/features/filters/lib/option-sort";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { type RouterOutput } from "@/src/utils/types";
import type Decimal from "decimal.js";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { joinSessionCoreAndMetrics } from "@/src/components/table/use-cases/session-row-data";
import TagList from "@/src/features/tag/components/TagList";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { cn } from "@/src/utils/tailwind";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { type TableAction } from "@/src/features/table/types";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type RowSelectionState } from "@tanstack/react-table";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { SESSIONS_FIELD_REGISTRY } from "@/src/features/filters/config/sessionsSearchRegistry";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { DEFAULT_SEARCH_TYPE } from "@/src/features/search-bar/lib/commit";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";

export type SessionTableRow = {
  id: string;
  createdAt: Date;
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
  omittedFilter?: SessionOmittableFilterColumn[];
  isV4?: boolean;
  /**
   * When true, render the time-range picker and auto-refresh button in the
   * page header (next to the title) via the header controls slot, instead of
   * inside the table toolbar. Only used when the table is the primary content
   * of a `Page`.
   */
  showControlsInPageHeader?: boolean;
};

export default function SessionsTable({
  projectId,
  userId,
  omittedFilter = [],
  isV4 = false,
  showControlsInPageHeader = false,
}: SessionTableProps) {
  const sessionsFilterConfig = useMemo(
    () => getSessionFilterConfig(omittedFilter, isV4),
    [isV4, omittedFilter],
  );
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

  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
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
      enabled: !isV4,
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
      enabled: isV4,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const filterOptions = isV4 ? filterOptionsV4 : filterOptionsV3;

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
    const scoresBoolean = filterOptions.data?.score_booleans ?? undefined;

    return {
      environment: environmentOptions,
      userIds:
        filterOptions.data?.userIds.map((u) => ({
          value: u.value,
          count: Number(u.count),
        })) ?? undefined,
      // tags don't have counts; they read A→Z
      tags: sortOptionValues(filterOptions.data?.tags.map((t) => t.value)),
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
      score_booleans: scoresBoolean,
    };
  }, [environmentOptions, filterOptions.data]);

  const isSidebarFilterLoading =
    filterOptions.isPending || environmentFilterOptions.isPending;

  const queryFilterOptions: UseSidebarFilterStateOptions = useMemo(
    () => ({
      loading: isSidebarFilterLoading,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: buildSidebarFilterSessionContextId(
        projectId,
        userId ? "user" : undefined,
      ),
      // Sidebar-only implicit environment defaults
      implicitDefaultConfig: DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
      isV4,
    }),
    [isV4, isSidebarFilterLoading, projectId, userId],
  );

  const queryFilter = useSidebarFilterState(
    sessionsFilterConfig,
    newFilterOptions,
    queryFilterOptions,
  );

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  // Grammar search bar (Feature Preview): an ADDITIONAL editor over the same
  // FilterState the facet sidebar edits — the sidebar stays and the two reflect
  // each other with no explicit sync. Off on the user-detail mount, which is
  // page-scoped by a userId filter the bar must not fight (same embedded
  // opt-out as EventsTable).
  // Generally available on the v4 sessions table. Still off on the user-detail
  // mount, which is page-scoped by a userId filter the bar must not fight (the
  // same embedded opt-out EventsTable applies).
  const sessionsSearchBarEnabled = isV4 && !userId;
  const observedOptions = useMemo(
    () => toObservedOptions(newFilterOptions, isSidebarFilterLoading),
    [newFilterOptions, isSidebarFilterLoading],
  );
  // Sessions has no full-text lane (`sessions.all*` takes no searchQuery), so
  // the registry rejects free text and these stay inert.
  const noSearchLane = useCallback(() => {}, []);
  const {
    store: searchBarStore,
    commit: searchBarCommit,
    applyFilters: searchBarApplyFilters,
  } = useEventsSearchBar({
    projectId,
    tableName: sessionsFilterConfig.tableName,
    enabled: sessionsSearchBarEnabled,
    filterState: queryFilter.searchBarFilterState,
    searchQuery: null,
    searchType: DEFAULT_SEARCH_TYPE,
    observed: observedOptions,
    setFilterState: setFiltersWrapper,
    setSearchQuery: noSearchLane,
    setSearchType: noSearchLane,
    registry: SESSIONS_FIELD_REGISTRY,
  });

  const combinedFilterState = queryFilter.effectiveFilterState.concat(
    userIdFilter,
    dateRangeFilter,
  );

  const backendFilterState = transformFiltersForBackend(
    combinedFilterState,
    SESSION_COLUMN_TO_BACKEND_KEY,
    sessionsFilterConfig.columnDefinitions,
  );

  const payloadCount = {
    projectId,
    filter: backendFilterState,
    orderBy: null,
  };

  const payloadGetAll = {
    ...payloadCount,
    orderBy: orderByState,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  };

  const sessionsV3 = api.sessions.all.useQuery(payloadGetAll, {
    enabled: !isV4,
    refetchOnWindowFocus: true,
  });
  const sessionsV4 = api.sessions.allFromEvents.useQuery(payloadGetAll, {
    enabled: isV4,
    refetchOnWindowFocus: true,
  });
  const sessions = isV4 ? sessionsV4 : sessionsV3;

  const sessionCountQueryV3 = api.sessions.countAll.useQuery(payloadCount, {
    enabled: !isV4,
    refetchOnWindowFocus: true,
  });
  const sessionCountQueryV4 = api.sessions.countAllFromEvents.useQuery(
    payloadCount,
    {
      enabled: isV4,
      refetchOnWindowFocus: true,
    },
  );
  const sessionCountQuery = isV4 ? sessionCountQueryV4 : sessionCountQueryV3;

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
      enabled: sessionsV3.data !== undefined && !isV4,
      refetchOnWindowFocus: true,
    },
  );

  const sessionMetricsV4 = api.sessions.metricsFromEvents.useQuery(
    {
      projectId,
      sessionIds: sessionsV4.data?.sessions.map((s) => s.id) ?? [],
      queryFromTimestamp: dateRange?.from ?? null,
    },
    {
      enabled: sessionsV4.data !== undefined && isV4,
      refetchOnWindowFocus: true,
    },
  );

  const sessionMetrics = isV4 ? sessionMetricsV4 : sessionMetricsV3;

  type SessionCoreOutput = RouterOutput["sessions"]["all"]["sessions"][number];
  type SessionMetricOutput = RouterOutput["sessions"]["metrics"][number];

  const sessionRowData = useMemo(
    () =>
      joinSessionCoreAndMetrics<SessionCoreOutput, SessionMetricOutput>(
        sessions.data?.sessions,
        sessionMetrics.data,
      ),
    [sessions.data?.sessions, sessionMetrics.data],
  );

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
    setSelectAll,
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
    createLinkTableColumn<SessionTableRow>({
      accessorKey: "id",
      header: "ID",
      size: 200,
      isFixedPosition: true,
      getCell: (value) => {
        if (!value || typeof value !== "string") return undefined;

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/sessions/${encodeURIComponent(value)}`,
            value,
          },
        };
      },
      enableSorting: true,
    }),
    createDateTableColumn<SessionTableRow>({
      accessorKey: "createdAt",
      header: "Created At",
      size: 150,
      enableHiding: true,
      enableSorting: true,
    }),
    createNumberTableColumn<SessionTableRow>({
      accessorKey: "sessionDuration",
      header: "Duration",
      size: 130,
      enableHiding: true,
      formatter: (value) => formatIntervalSeconds(value),
      getValue: (value) => {
        if (!sessionMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
      enableSorting: true,
    }),
    createBadgeTableColumn<SessionTableRow>({
      accessorKey: "environment",
      header: "Environment",
      size: 150,
      enableHiding: true,
    }),
    {
      accessorKey: "scores",
      header: "Scores",
      id: "scores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isColumnLoading ? <Skeleton className="h-4 w-1/2" /> : null;
      },
      columns: scoreColumns,
    },
    createLinkListTableColumn<SessionTableRow>({
      accessorKey: "userIds",
      enableColumnFilter: !omittedFilter.includes("userIds"),
      header: "User IDs",
      size: 200,
      enableHiding: true,
      getCell: (userIds) => {
        if (!sessionMetrics.isSuccess) return { type: "loading" };
        if (!userIds?.length) return undefined;

        return userIds.map((userId) => ({
          path: `/project/${projectId}/users/${encodeURIComponent(userId)}`,
          value: userId,
        }));
      },
    }),
    createNumberTableColumn<SessionTableRow>({
      accessorKey: "countTraces",
      header: "Traces",
      size: 100,
      headerTooltip: {
        description: "The number of traces in the session.",
      },
      enableHiding: true,
      enableSorting: true,
      formatter: (value) => numberFormatter(value, 0),
      getValue: (value) => {
        if (!sessionMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
    }),
    createNumberTableColumn<SessionTableRow>({
      accessorFn: (row) => row.inputCost?.toNumber(),
      id: "inputCost",
      header: "Input Cost",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      formatter: (value) => usdFormatter(value),
      getValue: (value) => {
        if (!sessionMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
    }),
    createNumberTableColumn<SessionTableRow>({
      accessorFn: (row) => row.outputCost?.toNumber(),
      id: "outputCost",
      header: "Output Cost",
      size: 110,
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
      formatter: (value) => usdFormatter(value),
      getValue: (value) => {
        if (!sessionMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
    }),
    createNumberTableColumn<SessionTableRow>({
      accessorFn: (row) => row.totalCost?.toNumber(),
      id: "totalCost",
      header: "Total Cost",
      size: 110,
      enableHiding: true,
      enableSorting: true,
      formatter: (value) => usdFormatter(value),
      getValue: (value) => {
        if (!sessionMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
    }),
    createNumberTableColumn<SessionTableRow>({
      accessorKey: "inputTokens",
      header: "Input Tokens",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      formatter: (value) => numberFormatter(value, 0),
      getValue: (value) => {
        if (!sessionMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
    }),
    createNumberTableColumn<SessionTableRow>({
      accessorKey: "outputTokens",
      header: "Output Tokens",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      formatter: (value) => numberFormatter(value, 0),
      getValue: (value) => {
        if (!sessionMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
    }),
    createNumberTableColumn<SessionTableRow>({
      accessorKey: "totalTokens",
      header: "Total Tokens",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      formatter: (value) => numberFormatter(value, 0),
      getValue: (value) => {
        if (!sessionMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
    }),
    createTokenUsageTableColumn<SessionTableRow, number | undefined>({
      id: "usage",
      accessorFn: (row) => row.totalTokens,
      header: "Usage",
      size: 220,
      enableHiding: true,
      enableSorting: true,
      getCell: (_value, { row }) => {
        if (!sessionMetrics.isSuccess) return { type: "loading" };

        return {
          type: "usage",
          inputUsage: Number(row.original.inputTokens ?? 0),
          outputUsage: Number(row.original.outputTokens ?? 0),
          totalUsage: Number(row.original.totalTokens ?? 0),
        };
      },
    }),
    {
      accessorKey: "traceTags",
      id: "traceTags",
      header: "Trace Tags",
      size: 250,
      enableHiding: true,
      defaultHidden: true,
      loadingCell: <Skeleton className="h-4 w-1/2" />,
      cell: ({ row }) => {
        const value: SessionTableRow["traceTags"] = row.getValue("traceTags");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-4 w-1/2" />;
        }
        return (
          value &&
          value.length > 0 && (
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

  const selectedSessionIds = useMemo(
    () =>
      Object.keys(selectedRows).filter((sessionId) =>
        sessions.data?.sessions.map((s) => s.id).includes(sessionId),
      ),
    [selectedRows, sessions.data?.sessions],
  );

  const selectedSessionCount = selectAll
    ? totalCount
    : selectedSessionIds.length;

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Sessions,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setExpandedFilters: queryFilter.onExpandedChange,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibility,
    },
    validationContext: {
      columns,
      filterColumnDefinition: sessionsFilterConfig.columnDefinitions,
      expandableFilterColumns: sessionsFilterConfig.facets.map(
        (facet) => facet.column,
      ),
    },
    currentFilterState: queryFilter.explicitFilterState,
    currentExpandedFilters: queryFilter.expanded,
  });

  return (
    <DataTableControlsProvider tableName={sessionsFilterConfig.tableName}>
      <div className="flex h-full w-full flex-col">
        {showControlsInPageHeader && (
          <TableHeaderControls
            timeRange={timeRange}
            setTimeRange={setTimeRange}
          />
        )}
        {/* In bar mode the composer and the toolbar stick together as one band
            (matching EventsTable) so the toolbar cannot scroll under the
            composer and render half-clipped; pb-1.5 gives the band the same
            breathing room above the table that the events tables have. */}
        <div
          className={cn(
            sessionsSearchBarEnabled &&
              "bg-background sticky top-0 z-30 pb-1.5",
          )}
        >
          {sessionsSearchBarEnabled && (
            <EventsSearchBarRow
              projectId={projectId}
              tableName={sessionsFilterConfig.tableName}
              store={searchBarStore}
              commit={searchBarCommit}
              observed={observedOptions}
              onApplyFilters={searchBarApplyFilters}
              registry={SESSIONS_FIELD_REGISTRY}
            />
          )}
          {/* Toolbar spanning full width */}
          <DataTableToolbar
            rowClassName={sessionsSearchBarEnabled ? "my-1" : undefined}
            filterState={queryFilter.explicitFilterState}
            actionButtons={[
              selectedSessionIds.length > 0 || selectAll ? (
                <TableActionMenu
                  key="sessions-multi-select-actions"
                  projectId={projectId}
                  actions={tableActions}
                  tableName={BatchExportTableName.Sessions}
                  selectedCount={selectedSessionCount}
                  onClearSelection={() => {
                    setSelectedRows({});
                    setSelectAll(false);
                  }}
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
            timeRange={showControlsInPageHeader ? undefined : timeRange}
            setTimeRange={showControlsInPageHeader ? undefined : setTimeRange}
            columnsWithCustomSelect={["userIds"]}
            rowHeight={rowHeight}
            setRowHeight={setRowHeight}
            multiSelect={{
              selectAll,
              setSelectAll,
              selectedRowIds: selectedSessionIds,
              setRowSelection: setSelectedRows,
              totalCount,
              ...paginationState,
            }}
          />
        </div>

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          <DataTableControls
            // Remount the sidebar when the saved view changes so the new view's filters replace any stale draft UI state.
            key={viewControllers.selectedViewId ?? "no-view"}
            queryFilter={queryFilter}
          />

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName="sessions"
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
              highlightAllRows={selectAll}
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
