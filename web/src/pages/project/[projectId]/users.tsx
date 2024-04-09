import Header from "@/src/components/layouts/header";

import { api } from "@/src/utils/api";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useEffect, useState } from "react";
import TableLink from "@/src/components/table/table-link";
import { DataTable } from "@/src/components/table/data-table";
import { useRouter } from "next/router";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { type Score } from "@langfuse/shared";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";

export type ScoreFilterInput = Omit<RouterInput["users"]["all"], "projectId">;

type RowData = {
  userId: string;
  firstEvent: string;
  lastEvent: string;
  totalEvents: string;
};

export default function UsersPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [queryOptions] = useState<ScoreFilterInput>({});

  const { setDetailPageList } = useDetailPageLists();

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const users = api.users.all.useQuery({
    ...queryOptions,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
  });

  // this API call will return an empty array if there are no users.
  // Hence this adds one fast unnecessary API call if there are no users.
  const userMetrics = api.users.metrics.useQuery(
    {
      projectId,
      userIds: users.data?.users.map((u) => u.userId) ?? [],
    },
    {
      enabled: users.isSuccess,
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

  const totalCount = users.data?.totalUsers ?? 0;

  useEffect(() => {
    if (users.isSuccess) {
      setDetailPageList(
        "users",
        users.data.users.map((u) => encodeURIComponent(u.userId)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users.isSuccess, users.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "userId",
      enableColumnFilter: true,
      header: "User ID",
      cell: ({ row }) => {
        const value = row.getValue("userId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/users/${encodeURIComponent(value)}`}
              value={value}
              truncateAt={40}
            />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "firstEvent",
      header: "First Event",
      cell: ({ row }) => {
        const value: unknown = row.getValue("firstEvent");
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
      cell: ({ row }) => {
        const value: unknown = row.getValue("lastEvent");
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
      cell: ({ row }) => {
        const value: unknown = row.getValue("totalEvents");
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
      cell: ({ row }) => {
        const value: unknown = row.getValue("totalTokens");
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
      cell: ({ row }) => {
        const value: unknown = row.getValue("totalCost");
        if (!userMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
      },
    },
    {
      accessorKey: "lastScore",
      header: "Last Score",
      cell: ({ row }) => {
        const value: Score | null = row.getValue("lastScore");
        if (!userMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }

        return (
          <>
            {value ? (
              <div className="flex items-center gap-4">
                <TableLink
                  path={
                    value.observationId
                      ? `/project/${projectId}/traces/${value.traceId}?observation=${value.observationId}`
                      : `/project/${projectId}/traces/${value.traceId}`
                  }
                  value={value.traceId}
                />
                <GroupedScoreBadges scores={[value]} />
              </div>
            ) : undefined}
          </>
        );
      },
    },
  ];

  return (
    <div>
      <Header
        title="Users"
        help={{
          description:
            "Attribute data in Langfuse to a user by adding a userId to your traces. See docs to learn more.",
          href: "https://langfuse.com/docs/user-explorer",
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
                      firstEvent:
                        t.firstTrace?.toLocaleString() ?? "No event yet",
                      lastEvent:
                        t.lastObservation?.toLocaleString() ??
                        t.lastTrace?.toLocaleString() ??
                        "No event yet",
                      totalEvents: compactNumberFormatter(
                        (Number(t.totalTraces) || 0) +
                          (Number(t.totalObservations) || 0),
                      ),
                      totalTokens: compactNumberFormatter(t.totalTokens ?? 0),
                      lastScore: t.lastScore,
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
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
    </div>
  );
}

function joinTableCoreAndMetrics<
  Core extends { id: string },
  Metric extends { id: string },
>(
  userCoreData?: Core[],
  userMetricsData?: Metric[],
): {
  status: "loading" | "error" | "success";
  rows: (Core & Partial<Metric>)[] | undefined;
} {
  if (!userCoreData) {
    return { status: "error", rows: undefined };
  }

  const userCoreDataProcessed = userCoreData;

  if (!userMetricsData) {
    // create an object with all the keys of the UserMetrics type with undefined value

    return {
      status: "success",
      rows: userCoreDataProcessed.map((u) => ({
        ...u,
        ...({} as Partial<Metric>),
      })),
    };
  }

  const metricsById = userMetricsData.reduce<Record<string, Metric>>(
    (acc, metric) => {
      acc[metric.id] = metric;
      return acc;
    },
    {},
  );

  const joinedData = userCoreDataProcessed.map((userCore) => {
    const metrics = metricsById[userCore.id];
    return {
      ...userCore,
      ...(metrics ?? ({} as Partial<Metric>)),
    };
  });

  return { status: "success", rows: joinedData };
}
