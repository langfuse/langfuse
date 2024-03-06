import Header from "@/src/components/layouts/header";

import { api } from "@/src/utils/api";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useEffect, useState } from "react";
import TableLink from "@/src/components/table/table-link";
import { DataTable } from "@/src/components/table/data-table";
import { useRouter } from "next/router";
import {
  compactNumberFormatter,
  numberFormatter,
  usdFormatter,
} from "@/src/utils/numbers";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { type Score } from "@prisma/client";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import Decimal from "decimal.js";

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

  const userMetrics = api.users.metrics.useQuery({
    projectId,
    userIds: users.data?.users.map((u) => u.userId) ?? [],
  });

  type UserCoreOutput = RouterOutput["users"]["all"]["users"][number];
  type UserMetricsOutput = RouterOutput["users"]["metrics"][number];

  type APIOutput = {
    status: "loading" | "error" | "success";
    rows: (UserCoreOutput & Partial<UserMetricsOutput>)[] | undefined;
  };

  const joinUserCoreAndMetrics = (): APIOutput => {
    if (users.isFetching) {
      return { status: "loading" as const, rows: undefined };
    }

    if (users.error) {
      return { status: "error" as const, rows: undefined };
    }

    if (users.data) {
      const userCoreData = users.data.users.map((user) => ({
        userId: user.userId,
        totalTraces: user.totalTraces,
      }));

      if (userMetrics.isFetching) {
        return { status: "success" as const, rows: userCoreData };
      }

      if (userMetrics.error) {
        return { status: "error" as const, rows: undefined };
      }

      const metricsById = userMetrics.data?.reduce(
        (acc, metric) => {
          acc[metric.userId] = metric;
          return acc;
        },
        {} as Record<string, (typeof userMetrics.data)[number]>,
      );

      const joinedData = userCoreData.map((userCore) => {
        const metrics = metricsById?.[userCore.userId];
        return {
          ...userCore,
          ...metrics,
        };
      });

      return { status: "success" as const, rows: joinedData };
    }

    // This should not happen, but we handle it just in case
    return { status: "error" as const, rows: undefined };
  };

  const userRowData = joinUserCoreAndMetrics();

  const totalCount = userRowData.rows?.length ?? 0;

  useEffect(() => {
    if (users.isSuccess) {
      console.log("setting detail page list");
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
        if (value instanceof Date) {
          return <>{value.toLocaleString()}</>;
        }
        if (userMetrics.isFetching) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return typeof value === "string" ? <>{value}</> : undefined;
      },
    },
    {
      accessorKey: "totalCost",
      header: "Total Cost",
      cell: ({ row }) => {
        const value: unknown = row.getValue("totalCost");
        if (value instanceof Decimal) {
          return <>{usdFormatter(value.toNumber())}</>;
        }
        if (userMetrics.isFetching) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return typeof value === "string" ? <>{value}</> : undefined;
      },
    },
    {
      accessorKey: "lastEvent",
      header: "Last Event",
      cell: ({ row }) => {
        const value: unknown = row.getValue("lastEvent");
        if (value instanceof Date) {
          return <>{value.toLocaleString()}</>;
        }
        if (userMetrics.isFetching) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return typeof value === "string" ? <>{value}</> : undefined;
      },
    },
    {
      accessorKey: "totalEvents",
      header: "Total Events",
    },
    {
      accessorKey: "totalTokens",
      header: "Total Tokens",
      cell: ({ row }) => {
        const value: unknown = row.getValue("totalTokens");
        if (typeof value === "number") {
          return <>{compactNumberFormatter(value)}</>;
        }
        if (userMetrics.isFetching) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return typeof value === "string" ? <>{value}</> : undefined;
      },
    },
    {
      accessorKey: "lastScore",
      header: "Last Score",
      cell: ({ row }) => {
        const value: Score | null = row.getValue("lastScore");
        if (userMetrics.isFetching) {
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
                      userId: t.userId,
                      firstEvent:
                        t.firstTrace?.toLocaleString() ?? "No event yet",
                      lastEvent:
                        t.lastObservation?.toLocaleString() ?? "No event yet",
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
