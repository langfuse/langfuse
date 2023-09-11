import Header from "@/src/components/layouts/header";

import { api } from "@/src/utils/api";
import { type ColumnDef } from "@tanstack/react-table";
import { type RouterInput } from "@/src/utils/types";
import { useState } from "react";
import TableLink from "@/src/components/table/table-link";
import { DataTable } from "@/src/components/table/data-table";
import { useRouter } from "next/router";
import { numberFormatter } from "@/src/utils/numbers";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { type Score } from "@prisma/client";

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

  const users = api.users.all.useQuery({
    ...queryOptions,
    projectId,
  });

  const columns: ColumnDef<RowData>[] = [
    {
      accessorKey: "userId",
      enableColumnFilter: true,
      header: "User ID",
      cell: ({ row }) => {
        const value = row.getValue("userId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/users/${value}`}
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
                    value?.observationId
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
      <Header title="Users" />

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
                data: users.data?.map((t) => {
                  return {
                    userId: t.userId,
                    firstEvent:
                      t.firstTrace?.toLocaleString() ?? "No event yet",
                    lastEvent:
                      t.lastObservation.toLocaleString() ?? "No event yet",
                    totalEvents: numberFormatter(
                      (Number(t.totalTraces) || 0) +
                        (Number(t.totalObservations) || 0),
                    ),
                    totalTokens: numberFormatter(t.totalTokens),
                    lastScore: t.lastScore,
                  };
                }),
              }
        }
        options={{ isLoading: true, isError: false }}
      />
    </div>
  );
}
