import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { type FilterState } from "@/src/features/filters/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { sessionsViewCols } from "@/src/server/api/definitions/sessionsView";
import { api } from "@/src/utils/api";
import { utcDateOffsetByDays } from "@/src/utils/dates";
import { type RouterOutput } from "@/src/utils/types";
import { type ColumnDef } from "@tanstack/react-table";
import { useEffect } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";

export type SessionTableRow = {
  id: string;
  startedAt: string;
  userId: string[];
  countTraces: number;
};

export type SessionTableProps = {
  projectId: string;
  userId?: string;
  omittedFilter?: string[];
};

export default function SessionsTable({
  projectId,
  userId,
  omittedFilter = [],
}: SessionTableProps) {
  const { setDetailPageList } = useDetailPageLists();

  const [userFilterState, setUserFilterState] = useQueryFilterState([
    {
      column: "timestamp",
      type: "datetime",
      operator: ">",
      value: utcDateOffsetByDays(-14),
    },
  ]);

  const userIdFilter: FilterState = userId
    ? [
        {
          column: "userId",
          type: "string",
          operator: "=",
          value: userId,
        },
      ]
    : [];

  const filterState = userFilterState.concat(userIdFilter);

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const sessions = api.sessions.all.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: filterState,
    searchQuery: null,
  });
  const totalCount = sessions.data?.slice(1)[0]?.totalCount ?? 0;
  useEffect(() => {
    if (sessions.isSuccess && sessions.data) {
      setDetailPageList(
        "sessions",
        sessions.data.map((t) => t.id),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.isSuccess, sessions.data]);

  const convertToTableRow = (
    session: RouterOutput["sessions"]["all"][0],
  ): SessionTableRow => {
    return {
      id: session.id,
      startedAt: session.startedAt.toLocaleString(),
      userId: session.userId ?? [],
      countTraces: session.countTraces,
    };
  };

  const columns: ColumnDef<SessionTableRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => {
        const value = row.getValue("id");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/sessions/${value}`}
            value={value}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "startedAt",
      header: "Started At",
    },
    {
      accessorKey: "userId",
      enableColumnFilter: !omittedFilter.find((f) => f === "userId"),
      header: "User ID",
      cell: ({ row }) => {
        const value = row.getValue("userId");
        return value && Array.isArray(value) ? (
          <>
            {(value as string[]).map((user) => (
              <TableLink
                key={user}
                path={`/project/${projectId}/users/${user}`}
                value={user}
                truncateAt={40}
              />
            ))}
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "countTraces",
      header: "Traces",
    },
  ];

  return (
    <div>
      <DataTableToolbar
        filterColumnDefinition={sessionsViewCols}
        filterState={userFilterState}
        setFilterState={setUserFilterState}
      />
      <DataTable
        columns={columns}
        data={
          sessions.isLoading
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
                  data: sessions.data?.map((t) => convertToTableRow(t)),
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
