import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";
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
import {
  TableBadgeLoadingCell,
  TableTextLoadingCell,
} from "@/src/components/table/loading-cells";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { usersFilterConfig } from "@/src/features/filters/config/users-config";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { type RouterOutput } from "@/src/utils/types";
import { type TimeFilter, usersTableCols } from "@langfuse/shared";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import Page from "@/src/components/layouts/page";
import { UsersOnboarding } from "@/src/components/onboarding/UsersOnboarding";
import {
  useEnvironmentFilter,
  convertSelectedEnvironmentsToFilter,
} from "@/src/hooks/useEnvironmentFilter";
import { Badge } from "@/src/components/ui/badge";
import { SearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useTableSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { createUsersSearchBarRegistry } from "@/src/features/search-bar/lib/registries";

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
  const { isBetaEnabled } = useV4Beta();

  // Check if the user has any users
  const { data: hasAnyUser, isLoading } = api.users.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId && !isBetaEnabled,
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
        enabled: !!projectId && isBetaEnabled,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        refetchInterval: 10_000,
      },
    );

  const hasUsers = isBetaEnabled ? hasAnyUserFromEvents : hasAnyUser;
  const isLoadingUsers = isBetaEnabled ? isLoadingFromEvents : isLoading;
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
        <UsersTable isBetaEnabled={isBetaEnabled} />
      )}
    </Page>
  );
}

const UsersTable = ({ isBetaEnabled }: { isBetaEnabled: boolean }) => {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const { setDetailPageList } = useDetailPageLists();

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Convert timeRange to absolute date range for compatibility
  const dateRange = useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
  }, [timeRange]);

  const dateRangeFilter: TimeFilter[] = dateRange
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

  const environmentOptions =
    environmentFilterOptions.data?.map((value) => value.environment) || [];

  const { selectedEnvironments, setSelectedEnvironments } =
    useEnvironmentFilter(environmentOptions, projectId);

  const environmentFilter = convertSelectedEnvironmentsToFilter(
    ["environment"],
    selectedEnvironments,
  );

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const filterOptionsV3 = api.users.filterOptions.useQuery(
    {
      projectId,
      timestampFilter: dateRangeFilter,
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

  const filterOptionsV4 = api.users.filterOptionsFromEvents.useQuery(
    {
      projectId,
      timestampFilter: dateRangeFilter,
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
  const newFilterOptions = useMemo(
    () => ({
      userId: filterOptions.data?.userId ?? [],
    }),
    [filterOptions.data?.userId],
  );
  const queryFilter = useSidebarFilterState(
    usersFilterConfig,
    newFilterOptions,
    {
      loading: filterOptions.isPending,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId,
    },
  );

  const searchBarRegistry = useMemo(
    () => createUsersSearchBarRegistry(usersTableCols),
    [],
  );
  const searchBarObserved = useMemo(
    () => toObservedOptions(newFilterOptions, filterOptions.isPending),
    [filterOptions.isPending, newFilterOptions],
  );
  const { store: searchBarStore, commit: searchBarCommit } = useTableSearchBar({
    projectId,
    enabled: true,
    registry: searchBarRegistry,
    filterState: queryFilter.explicitFilterState,
    searchQuery,
    observed: searchBarObserved,
    setFilterState: queryFilter.setFilterState,
    setSearchQuery,
  });

  const filterState = queryFilter.filterState.concat(
    dateRangeFilter,
    environmentFilter,
  );

  const usersV3 = api.users.all.useQuery(
    {
      filter: filterState,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId,
      searchQuery: searchQuery ?? undefined,
    },
    { enabled: !isBetaEnabled },
  );

  const userMetricsV3 = api.users.metrics.useQuery(
    {
      projectId,
      userIds: usersV3.data?.users.map((u) => u.userId) ?? [],
      filter: filterState,
    },
    {
      enabled: usersV3.isSuccess && !isBetaEnabled,
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
    { enabled: isBetaEnabled },
  );

  const userMetricsV4 = api.users.metricsFromEvents.useQuery(
    {
      projectId,
      userIds: usersV4.data?.users.map((u) => u.userId) ?? [],
      filter: filterState,
    },
    {
      enabled: usersV4.isSuccess && isBetaEnabled,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  // Select the active query based on beta state
  const users = isBetaEnabled ? usersV4 : usersV3;
  const userMetrics = isBetaEnabled ? userMetricsV4 : userMetricsV3;

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
    {
      accessorKey: "userId",
      enableColumnFilter: true,
      header: "User ID",
      headerTooltip: {
        description:
          "The unique identifier for the user that was logged in Langfuse. See docs for more details on how to set this up.",
        href: "https://langfuse.com/docs/observability/features/users",
      },
      size: 150,
      cell: ({ row }) => {
        const value: RowData["userId"] = row.getValue("userId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/users/${encodeURIComponent(value)}`}
              value={value}
            />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "environment",
      header: "Environment",
      id: "environment",
      size: 150,
      enableHiding: true,
      loadingCell: <TableBadgeLoadingCell />,
      cell: ({ row }) => {
        const value: RowData["environment"] = row.getValue("environment");
        return value ? (
          <Badge
            variant="secondary"
            className="max-w-fit truncate rounded-sm px-1 font-normal"
            title={value}
          >
            {value}
          </Badge>
        ) : null;
      },
    },
    {
      accessorKey: "firstEvent",
      header: "First Event",
      headerTooltip: {
        description: "The earliest trace recorded for this user.",
      },
      size: 150,
      loadingCell: <TableTextLoadingCell />,
      cell: ({ row }) => {
        const value: RowData["firstEvent"] = row.getValue("firstEvent");
        if (!userMetrics.isSuccess) {
          return <TableTextLoadingCell />;
        }
        return typeof value === "string" ? value : undefined;
      },
    },
    {
      accessorKey: "lastEvent",
      header: "Last Event",
      headerTooltip: {
        description: "The latest trace recorded for this user.",
      },
      size: 150,
      loadingCell: <TableTextLoadingCell />,
      cell: ({ row }) => {
        const value: RowData["lastEvent"] = row.getValue("lastEvent");
        if (!userMetrics.isSuccess) {
          return <TableTextLoadingCell />;
        }
        return typeof value === "string" ? value : undefined;
      },
    },
    {
      accessorKey: "totalEvents",
      header: "Total Events",
      headerTooltip: {
        description:
          "Total number of events for the user, includes traces and observations. See data model for more details.",
        href: "https://langfuse.com/docs/observability/data-model",
      },
      size: 120,
      loadingCell: <TableTextLoadingCell />,
      cell: ({ row }) => {
        const value: RowData["totalEvents"] = row.getValue("totalEvents");
        if (!userMetrics.isSuccess) {
          return <TableTextLoadingCell />;
        }
        return typeof value === "string" ? value : undefined;
      },
    },
    {
      accessorKey: "totalTokens",
      header: "Total Tokens",
      headerTooltip: {
        description:
          "Total number of tokens used for the user across all generations.",
        href: "https://langfuse.com/docs/model-usage-and-cost",
      },
      size: 120,
      loadingCell: <TableTextLoadingCell />,
      cell: ({ row }) => {
        const value: RowData["totalTokens"] = row.getValue("totalTokens");
        if (!userMetrics.isSuccess) {
          return <TableTextLoadingCell />;
        }
        return typeof value === "string" ? value : undefined;
      },
    },
    {
      accessorKey: "totalCost",
      header: "Total Cost",
      headerTooltip: {
        description: "Total cost for the user across all generations.",
        href: "https://langfuse.com/docs/model-usage-and-cost",
      },
      size: 120,
      loadingCell: <TableTextLoadingCell />,
      cell: ({ row }) => {
        const value: RowData["totalCost"] = row.getValue("totalCost");
        if (!userMetrics.isSuccess) {
          return <TableTextLoadingCell />;
        }
        return typeof value === "string" ? value : undefined;
      },
    },
  ];

  return (
    <DataTableControlsProvider
      tableName={usersFilterConfig.tableName}
      defaultSidebarCollapsed={usersFilterConfig.defaultSidebarCollapsed}
    >
      <div className="flex h-full w-full flex-col">
        <SearchBarRow
          projectId={projectId}
          store={searchBarStore}
          commit={searchBarCommit}
          observed={searchBarObserved}
          registry={searchBarRegistry}
        />
        <DataTableToolbar
          filterState={queryFilter.explicitFilterState}
          columns={columns}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          environmentFilter={{
            values: selectedEnvironments,
            onValueChange: setSelectedEnvironments,
            options: environmentOptions.map((env) => ({ value: env })),
          }}
        />
        <ResizableFilterLayout>
          <DataTableControls queryFilter={queryFilter} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName={"users"}
              columns={columns}
              data={
                users.isLoading
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
                              isBetaEnabled
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
              cellPadding="comfortable"
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
};
