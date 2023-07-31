import Header from "@/src/components/layouts/header";

import { api } from "@/src/utils/api";
import { type ColumnDef } from "@tanstack/react-table";
import { type RouterInput } from "@/src/utils/types";
import { useState } from "react";
import TableLink from "@/src/components/table/table-link";
import { DataTable } from "@/src/components/table/data-table";
import { useRouter } from "next/router";

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
  ];

  return (
    <div className="md:container">
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
                  console.log(t);
                  return {
                    userId: t.userId,
                    firstEvent: t.firstEvent?.toISOString() ?? "No event yet",
                    lastEvent: t.lastEvent?.toISOString() ?? "No event yet",
                    totalEvents: (
                      (t.totalTraces ?? 0) + (t.totalObservations ?? 0)
                    ).toString(),
                  };
                }),
              }
        }
        options={{ isLoading: true, isError: false }}
      />
    </div>
  );
}
