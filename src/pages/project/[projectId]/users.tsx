import Header from "@/src/components/layouts/header";

import { api } from "@/src/utils/api";
import { type RouterInput } from "@/src/utils/types";
import { useEffect, useState } from "react";
import TableLink from "@/src/components/table/table-link";
import { DataTable } from "@/src/components/table/data-table";
import { useRouter } from "next/router";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { type Score } from "@prisma/client";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { type LangfuseColumnDef } from "@/src/components/table/types";

type RowData = {
  userId: string;
  firstEvent: string;
  lastEvent: string;
  totalEvents: string;
};

export type ScoreFilterInput = Omit<RouterInput["users"]["all"], "projectId">;

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
  const totalCount = users.data?.slice(1)[0]?.totalCount ?? 0;

  useEffect(() => {
    if (users.isSuccess) {
      console.log("setting detail page list");
      setDetailPageList(
        "users",
        users.data.map((u) => encodeURIComponent(u.userId)),
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
    },
    {
      accessorKey: "lastEvent",
      header: "Last Event",
    },
    {
      accessorKey: "totalEvents",
      header: "Total Events",
    },
    {
      accessorKey: "totalTokens",
      header: "Total Tokens",
    },
    {
      accessorKey: "lastScore",
      header: "Last Score",
      cell: ({ row }) => {
        const value: Score | null = row.getValue("lastScore");
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
                  data: users.data.map((t) => {
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
                      totalTokens: compactNumberFormatter(t.totalTokens),
                      lastScore: t.lastScore,
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
