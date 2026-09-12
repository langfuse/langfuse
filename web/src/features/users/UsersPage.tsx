import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { DataTable } from "@/src/components/table/data-table";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { getUsersFilterConfig } from "@/src/features/filters/config/users-config";
import {
  USERS_FIELD_REGISTRY,
  LEGACY_USERS_FIELD_REGISTRY,
} from "@/src/features/filters/config/usersSearchRegistry";
import {
  useSidebarFilterPresentation,
  useSidebarFilterStateCore,
  type FacetOptions,
  type UseSidebarFilterStateOptions,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import { buildSidebarFilterSessionContextId } from "@/src/features/filters/lib/persistedSidebarFilterQuery";
import { sortOptionValues } from "@/src/features/filters";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { TableSearchBar } from "@/src/features/search-bar/components/TableSearchBar";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useTableViewFilterChange } from "@/src/components/table/table-view-presets/hooks/useTableViewFilterChange";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { type RouterOutput } from "@/src/utils/types";
import {
  DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
  TableViewPresetTableName,
  type FilterState,
  type TimeFilter,
} from "@langfuse/shared";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import Page from "@/src/components/layouts/page";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { UsersOnboarding } from "@/src/components/onboarding/UsersOnboarding";

type RowData = {
  userId: string;
  environment?: string;
  firstEvent: string;
  lastEvent: string;
  totalEvents: string;
  totalTokens: string;
  totalCost: string;
};

export default function UsersPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { isV4 } = useReadPath();

  // Check if the user has any users
  const { data: hasAnyUser, isLoading } = api.users.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId && !isV4,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchInterval: 10_000,
    },
  );

  const { data: hasAnyUserFromEvents, isLoading: isLoadingFromEvents } =
    api.users.hasAnyFromEvents.useQuery(
      { projectId },
      {
        enabled: !!projectId && isV4,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        refetchInterval: 10_000,
      },
    );

  const hasUsers = isV4 ? hasAnyUserFromEvents : hasAnyUser;
  const isLoadingUsers = isV4 ? isLoadingFromEvents : isLoading;
  const showOnboarding = !isLoadingUsers && !hasUsers;

  return (
    <Page
      headerProps={{
        title: "Users",
        help: {
          description: (
            <>
              Attribute data in Langfuse to a user by adding a userId to your
              traces. See{" "}
              <a
                href="https://langfuse.com/docs/observability/features/users"
                target="_blank"
                rel="noopener noreferrer"
                className="decoration-primary/30 hover:decoration-primary underline"
                onClick={(e) => e.stopPropagation()}
              >
                docs
              </a>{" "}
              to learn more.
            </>
          ),
          href: "https://langfuse.com/docs/observability/features/users",
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no users */}
      {showOnboarding ? (
        <UsersOnboarding />
      ) : (
        <UsersTable isV4={isV4} showControlsInPageHeader />
      )}
    </Page>
  );
}

const UsersTable = ({
  isV4,
  showControlsInPageHeader = false,
}: {
  isV4: boolean;
  showControlsInPageHeader?: boolean;
}) => {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // The two read paths answer different facet sets from different tables, so
  // they get different configs — and different persistence keys, or a v4-only
  // filter would rehydrate on a v3 project as a failed query.
  const usersFilterConfig = useMemo(() => getUsersFilterConfig(isV4), [isV4]);

  const { setDetailPageList } = useDetailPageLists();

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  // The picker renders in the page header via the header controls slot; this
  // reads the same shared per-project range to filter the table.
  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Convert timeRange to absolute date range for compatibility
  const dateRange = useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
  }, [timeRange]);

  // Both users queries map "Timestamp" onto their own time column
  // (`t.timestamp` on v3, `e.start_time` on v4), so one filter serves both.
  const dateRangeFilter = useMemo<FilterState>(
    () =>
      dateRange
        ? [
            {
              column: "Timestamp",
              type: "datetime",
              operator: ">=",
              value: dateRange.from,
            },
            {
              column: "Timestamp",
              type: "datetime",
              operator: "<=",
              value: dateRange.to,
            },
          ]
        : [],
    [dateRange],
  );

  const { viewControllersRef, onExplicitFilterStateChange } =
    useTableViewFilterChange();

  const filterStateOptions: UseSidebarFilterStateOptions = useMemo(
    () => ({
      stateLocation: "urlAndSessionStorage",
      onExplicitFilterStateChange,
      sessionFilterContextId: buildSidebarFilterSessionContextId(projectId),
      // Environment is a sidebar facet here, like every other filter — the page
      // no longer keeps its own environment selection beside the filter state.
      implicitDefaultConfig: DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
      isV4,
    }),
    [isV4, projectId, onExplicitFilterStateChange],
  );

  // Split core/presentation so the v4 facet scan can refine its counts against
  // the filters already applied — the presentation half needs the options the
  // scan produces, so it cannot also be the thing that supplies the filters.
  const filterCore = useSidebarFilterStateCore(
    usersFilterConfig,
    filterStateOptions,
  );

  // v3 facet options: the trace facets this page inherits, from the traces
  // endpoint that already answers them.
  const traceFilterOptionsResponse = api.traces.filterOptions.useQuery(
    {
      projectId,
      timestampFilter:
        dateRangeFilter.length > 0
          ? (dateRangeFilter as TimeFilter[])
          : undefined,
    },
    {
      enabled: !isV4,
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId,
        fromTimestamp: dateRange?.from,
      },
      {
        enabled: !isV4,
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const v3FacetOptions = useMemo<FacetOptions>(
    () => ({
      environment:
        environmentFilterOptions.data?.map((value) => value.environment) ??
        undefined,
      traceName:
        traceFilterOptionsResponse.data?.name?.map((n) => ({
          value: n.value,
          count: Number(n.count),
        })) ?? undefined,
      // tags don't have counts; they read A→Z
      traceTags: sortOptionValues(
        traceFilterOptionsResponse.data?.tags?.map((t) => t.value),
      ),
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
    }),
    [environmentFilterOptions.data, traceFilterOptionsResponse.data],
  );

  // v4 facet options: the events facet scan, lazily per column, refined by the
  // filters already applied.
  const facetStartTimeFilter = useMemo<TimeFilter[]>(
    () =>
      dateRange
        ? [
            {
              column: "startTime",
              type: "datetime",
              operator: ">=",
              value: dateRange.from,
            },
            {
              column: "startTime",
              type: "datetime",
              operator: "<=",
              value: dateRange.to,
            },
          ]
        : [],
    [dateRange],
  );

  const {
    filterOptions: v4FacetOptions,
    isFilterOptionsPending: isV4FacetOptionsPending,
    erroredColumns,
    loadingColumns,
    requestColumns,
  } = useEventsFilterOptions({
    projectId,
    startTimeFilter: facetStartTimeFilter,
    refiningFilter: filterCore.filterState,
    lazy: true,
    enabled: isV4,
  });

  const isSidebarFilterLoading = isV4
    ? isV4FacetOptionsPending
    : traceFilterOptionsResponse.isPending ||
      environmentFilterOptions.isPending;

  const queryFilter = useSidebarFilterPresentation(
    filterCore,
    usersFilterConfig,
    isV4 ? v4FacetOptions : v3FacetOptions,
    {
      loading: isSidebarFilterLoading,
      loadingColumns,
      isV4,
    },
  );

  // Lazy filter-options: load a facet's values when its sidebar section is
  // expanded (also covers active filters, which auto-expand on mount).
  const expandedFacets = queryFilter.expanded;
  useEffect(() => {
    requestColumns(expandedFacets);
  }, [expandedFacets, requestColumns]);

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) =>
      queryFilterRef.current?.setFilterState(filters, { origin: "user" }),
    [],
  );

  const observedOptions = toObservedOptions(
    isV4 ? v4FacetOptions : v3FacetOptions,
    isSidebarFilterLoading,
  );

  const filterState = queryFilter.effectiveFilterState.concat(dateRangeFilter);

  const usersV3 = api.users.all.useQuery(
    {
      filter: filterState,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId,
      searchQuery: searchQuery ?? undefined,
    },
    { enabled: !isV4 },
  );

  const userMetricsV3 = api.users.metrics.useQuery(
    {
      projectId,
      userIds: usersV3.data?.users.map((u) => u.userId) ?? [],
      filter: filterState,
    },
    {
      enabled: usersV3.isSuccess && !isV4,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const usersV4 = api.users.allFromEvents.useQuery(
    {
      filter: filterState,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId,
      searchQuery: searchQuery ?? undefined,
    },
    { enabled: isV4 },
  );

  const userMetricsV4 = api.users.metricsFromEvents.useQuery(
    {
      projectId,
      userIds: usersV4.data?.users.map((u) => u.userId) ?? [],
      filter: filterState,
    },
    {
      enabled: usersV4.isSuccess && isV4,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  // Select the active query based on beta state
  const users = isV4 ? usersV4 : usersV3;
  const userMetrics = isV4 ? userMetricsV4 : userMetricsV3;

  type UserCoreOutput = RouterOutput["users"]["all"]["users"][number];
  type UserMetricsOutput = RouterOutput["users"]["metrics"][number];

  type CoreType = Omit<UserCoreOutput, "userId"> & { id: string };
  type MetricType = Omit<UserMetricsOutput, "userId"> & { id: string };

  const userRowData = joinTableCoreAndMetrics<CoreType, MetricType>(
    users.data?.users.map((u) => ({
      ...u,
      id: u.userId,
    })),
    userMetrics.data?.map((u) => ({
      ...u,
      id: u.userId,
    })),
  );

  const totalCount = users.data?.totalUsers
    ? Number(users.data.totalUsers)
    : null;

  useEffect(() => {
    if (users.isSuccess) {
      setDetailPageList(
        "users",
        users.data.users.map((u) => ({ id: encodeURIComponent(u.userId) })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users.isSuccess, users.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    createLinkTableColumn<RowData>({
      accessorKey: "userId",
      enableColumnFilter: true,
      header: "User ID",
      headerTooltip: {
        description:
          "The unique identifier for the user that was logged in Langfuse. See docs for more details on how to set this up.",
        href: "https://langfuse.com/docs/observability/features/users",
      },
      size: 150,
      getCell: (value) => {
        if (typeof value !== "string") return undefined;

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/users/${encodeURIComponent(value)}`,
            value,
          },
        };
      },
    }),
    createBadgeTableColumn<RowData>({
      accessorKey: "environment",
      header: "Environment",
      size: 150,
      enableHiding: true,
    }),
    createTextTableColumn<RowData>({
      accessorKey: "firstEvent",
      header: "First Event",
      headerTooltip: {
        description: "The earliest trace recorded for this user.",
      },
      size: 150,
      mapValue: (value) =>
        userMetrics.isSuccess ? (value ?? undefined) : { type: "loading" },
    }),
    createTextTableColumn<RowData>({
      accessorKey: "lastEvent",
      header: "Last Event",
      headerTooltip: {
        description: "The latest trace recorded for this user.",
      },
      size: 150,
      mapValue: (value) =>
        userMetrics.isSuccess ? (value ?? undefined) : { type: "loading" },
    }),
    createTextTableColumn<RowData>({
      accessorKey: "totalEvents",
      header: "Total Events",
      headerTooltip: {
        description:
          "Total number of events for the user, includes traces and observations. See data model for more details.",
        href: "https://langfuse.com/docs/observability/data-model",
      },
      size: 120,
      mapValue: (value) =>
        userMetrics.isSuccess ? (value ?? undefined) : { type: "loading" },
    }),
    createTextTableColumn<RowData>({
      accessorKey: "totalTokens",
      header: "Total Tokens",
      headerTooltip: {
        description:
          "Total number of tokens used for the user across all generations.",
        href: "https://langfuse.com/docs/model-usage-and-cost",
      },
      size: 120,
      mapValue: (value) =>
        userMetrics.isSuccess ? (value ?? undefined) : { type: "loading" },
    }),
    createTextTableColumn<RowData>({
      accessorKey: "totalCost",
      header: "Total Cost",
      headerTooltip: {
        description: "Total cost for the user across all generations.",
        href: "https://langfuse.com/docs/model-usage-and-cost",
      },
      size: 120,
      mapValue: (value) =>
        userMetrics.isSuccess ? (value ?? undefined) : { type: "loading" },
    }),
  ];

  const [columnVisibility, setColumnVisibility] = useColumnVisibility(
    "users",
    columns,
  );
  const [columnOrder, setColumnOrder] = useColumnOrder<RowData>(
    "users",
    columns,
  );
  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Users,
    projectId,
    stateUpdaters: {
      setFilters: (filters) =>
        queryFilterRef.current.setFilterState(filters, {
          origin: "saved_view",
        }),
      setExpandedFilters: queryFilter.onExpandedChange,
      setSearchQuery,
      setColumnOrder,
      setColumnVisibility,
    },
    currentFilterState: queryFilter.explicitFilterState,
    currentExpandedFilters: queryFilter.expanded,
    validationContext: {
      columns,
      filterColumnDefinition: usersFilterConfig.columnDefinitions,
      expandableFilterColumns: usersFilterConfig.facets.map(
        (facet) => facet.column,
      ),
    },
  });
  viewControllersRef.current = viewControllers;
  const handleSearchChange = (query: string | null) => {
    viewControllers.handleUserStateChange(searchQuery ?? "", query ?? "");
    setSearchQuery(query);
    setPaginationState({ pageIndex: 0 });
  };
  const handleColumnOrderChange: typeof setColumnOrder = (update) => {
    const next = typeof update === "function" ? update(columnOrder) : update;
    viewControllers.handleUserStateChange(columnOrder, next);
    setColumnOrder(next);
  };
  const handleColumnVisibilityChange: typeof setColumnVisibility = (update) => {
    const next =
      typeof update === "function" ? update(columnVisibility) : update;
    viewControllers.handleUserStateChange(columnVisibility, next);
    setColumnVisibility(next);
  };

  return (
    <DataTableControlsProvider tableName={usersFilterConfig.tableName}>
      <div className="flex h-full w-full flex-col">
        {showControlsInPageHeader && (
          <TableHeaderControls
            timeRange={timeRange}
            setTimeRange={setTimeRange}
          />
        )}
        {/* In bar mode the composer and the toolbar stick together as one band
            so the toolbar cannot scroll under the composer and render
            half-clipped. */}
        <div className="bg-background sticky top-0 z-30 pb-1.5">
          <TableSearchBar
            key={`${viewControllers.filterEditorResetKey}-${queryFilter.draftResetKey}`}
            isV4={isV4}
            filterState={queryFilter.searchBarFilterState}
            setFilterState={setFiltersWrapper}
            search={{ query: searchQuery, setQuery: handleSearchChange }}
            projectId={projectId}
            tableName={usersFilterConfig.tableName}
            observed={observedOptions}
            erroredColumns={erroredColumns}
            onRequestColumns={requestColumns}
            registry={isV4 ? USERS_FIELD_REGISTRY : LEGACY_USERS_FIELD_REGISTRY}
          />
          <DataTableToolbar
            tableName={usersFilterConfig.tableName}
            isV4={isV4}
            rowClassName="my-1"
            filterState={queryFilter.explicitFilterState}
            columns={columns}
            timeRange={showControlsInPageHeader ? undefined : timeRange}
            setTimeRange={showControlsInPageHeader ? undefined : setTimeRange}
            currentSearchQuery={searchQuery ?? ""}
            columnVisibility={columnVisibility}
            setColumnVisibility={handleColumnVisibilityChange}
            columnOrder={columnOrder}
            setColumnOrder={handleColumnOrderChange}
            viewConfig={{
              tableName: TableViewPresetTableName.Users,
              projectId,
              controllers: viewControllers,
            }}
          />
        </div>
        <ResizableFilterLayout>
          <DataTableControls
            key={viewControllers.filterEditorResetKey}
            queryFilter={queryFilter}
          />
          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName="users"
              columns={columns}
              data={
                users.isLoading || isViewLoading
                  ? { isLoading: true, isError: false }
                  : users.isError
                    ? {
                        isLoading: false,
                        isError: true,
                        error: users.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: userRowData.rows?.map((t) => {
                          return {
                            userId: t.id,
                            environment: t.environment ?? undefined,
                            firstEvent:
                              t.firstTrace?.toLocaleString() ?? "No event yet",
                            lastEvent:
                              t.lastTrace?.toLocaleString() ?? "No event yet",
                            totalEvents: compactNumberFormatter(
                              isV4
                                ? Number(t.totalObservations ?? 0)
                                : Number(t.totalTraces ?? 0) +
                                    Number(t.totalObservations ?? 0),
                            ),
                            totalTokens: compactNumberFormatter(
                              t.totalTokens ?? 0,
                            ),
                            totalCost: usdFormatter(
                              t.sumCalculatedTotalCost ?? 0,
                              2,
                              2,
                            ),
                          };
                        }),
                      }
              }
              pagination={{
                totalCount,
                onChange: setPaginationState,
                state: paginationState,
              }}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              columnOrder={columnOrder}
              onColumnOrderChange={handleColumnOrderChange}
              cellPadding="comfortable"
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
};
