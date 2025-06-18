import { useRouter } from "next/router";
import { useEffect } from "react";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { type RouterOutput } from "@/src/utils/types";
import { type FilterState } from "@langfuse/shared";
import { usersTableCols } from "@/src/server/api/definitions/usersTable";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import Page from "@/src/components/layouts/page";
import { UsersOnboarding } from "@/src/components/onboarding/UsersOnboarding";
import {
  useEnvironmentFilter,
  convertSelectedEnvironmentsToFilter,
} from "@/src/hooks/use-environment-filter";
import { Badge } from "@/src/components/ui/badge";

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

  // Check if the user has any users
  const { data: hasAnyUser, isLoading } = api.users.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchInterval: 10_000,
    },
  );

  const showOnboarding = !isLoading && !hasAnyUser;

  return (
    <Page
      headerProps={{
        title: "Users",
        help: {
          description:
            "Attribute data in Langfuse to a user by adding a userId to your traces. See docs to learn more.",
          href: "https://langfuse.com/docs/user-explorer",
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no users */}
      {showOnboarding ? <UsersOnboarding /> : <UsersTable />}
    </Page>
  );
}

const UsersTable = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "users",
    projectId,
  );

  const { setDetailPageList } = useDetailPageLists();

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange(projectId);

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "Timestamp",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
      ]
    : [];

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      { projectId },
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

  const filterState = userFilterState.concat(
    dateRangeFilter,
    environmentFilter,
  );

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const users = api.users.all.useQuery({
    filter: filterState,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    searchQuery: searchQuery ?? undefined,
  });

  // this API call will return an empty array if there are no users.
  // Hence, this adds one fast unnecessary API call if there are no users.
  const userMetrics = api.users.metrics.useQuery(
    {
      projectId,
      userIds: users.data?.users.map((u) => u.userId) ?? [],
      filter: filterState,
    },
    {
      enabled: users.isSuccess,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

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
        href: "https://langfuse.com/docs/tracing-features/users",
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
      cell: ({ row }) => {
        const value: RowData["environment"] = row.getValue("environment");
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
      accessorKey: "firstEvent",
      header: "First Event",
      headerTooltip: {
        description: "The earliest trace recorded for this user.",
      },
      size: 150,
      cell: ({ row }) => {
        const value: RowData["firstEvent"] = row.getValue("firstEvent");
        if (!userMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
      },
    },
    {
      accessorKey: "lastEvent",
      header: "Last Event",
      headerTooltip: {
        description: "The latest trace recorded for this user.",
      },
      size: 150,
      cell: ({ row }) => {
        const value: RowData["lastEvent"] = row.getValue("lastEvent");
        if (!userMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
      },
    },
    {
      accessorKey: "totalEvents",
      header: "Total Events",
      headerTooltip: {
        description:
          "Total number of events for the user, includes traces and observations. See data model for more details.",
        href: "https://langfuse.com/docs/tracing-data-model",
      },
      size: 120,
      cell: ({ row }) => {
        const value: RowData["totalEvents"] = row.getValue("totalEvents");
        if (!userMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
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
      cell: ({ row }) => {
        const value: RowData["totalTokens"] = row.getValue("totalTokens");
        if (!userMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
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
      cell: ({ row }) => {
        const value: RowData["totalCost"] = row.getValue("totalCost");
        if (!userMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
      },
    },
  ];

  return (
    <>
      <DataTableToolbar
        filterColumnDefinition={usersTableCols}
        filterState={userFilterState}
        setFilterState={useDebounce(setUserFilterState)}
        columns={columns}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
        searchConfig={{
          metadataSearchFields: ["User ID"],
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
          tableAllowsFullTextSearch: false,
          setSearchType: undefined,
          searchType: undefined,
        }}
        environmentFilter={{
          values: selectedEnvironments,
          onValueChange: setSelectedEnvironments,
          options: environmentOptions.map((env) => ({ value: env })),
        }}
      />
      <DataTable
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
                        Number(t.totalTraces ?? 0) +
                          Number(t.totalObservations ?? 0),
                      ),
                      totalTokens: compactNumberFormatter(t.totalTokens ?? 0),
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
      />
    </>
  );
};
