import { StarSessionToggle } from "@/src/components/star-toggle";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { type FilterState } from "@/src/features/filters/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { sessionsViewCols } from "@/src/server/api/definitions/sessionsView";
import { api } from "@/src/utils/api";
import { formatInterval, utcDateOffsetByDays } from "@/src/utils/dates";
import { type RouterOutput } from "@/src/utils/types";
import { useEffect } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";

export type SessionTableRow = {
  id: string;
  createdAt: string;
  userIds: string[];
  countTraces: number;
  bookmarked: boolean;
  sessionDuration: number | null;
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
      column: "createdAt",
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

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });

  const sessions = api.sessions.all.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: filterState,
    orderBy: orderByState,
  });

  const totalCount = sessions.data?.slice(1)[0]?.totalCount ?? 0;
  useEffect(() => {
    if (sessions.isSuccess) {
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
      createdAt: session.createdAt.toLocaleString(),
      userIds: session.userIds,
      countTraces: session.countTraces,
      bookmarked: session.bookmarked,
      sessionDuration: session.sessionDuration,
    };
  };

  const columns: LangfuseColumnDef<SessionTableRow>[] = [
    {
      accessorKey: "bookmarked",
      id: "bookmarked",
      header: undefined,
      cell: ({ row }) => {
        const bookmarked = row.getValue("bookmarked");
        const sessionId = row.getValue("id");

        return typeof sessionId === "string" &&
          typeof bookmarked === "boolean" ? (
          <StarSessionToggle
            sessionId={sessionId}
            projectId={projectId}
            value={bookmarked}
            size="xs"
          />
        ) : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "id",
      id: "id",
      header: "ID",
      cell: ({ row }) => {
        const value = row.getValue("id");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/sessions/${encodeURIComponent(value)}`}
            value={value}
          />
        ) : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: "Created At",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "sessionDuration",
      id: "sessionDuration",
      header: "Duration",
      enableHiding: true,
      cell: ({ row }) => {
        const value = row.getValue("sessionDuration");
        return value && typeof value === "number"
          ? formatInterval(value)
          : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "userIds",
      enableColumnFilter: !omittedFilter.find((f) => f === "userIds"),
      header: "User ID",
      enableHiding: true,
      cell: ({ row }) => {
        const value = row.getValue("userIds");
        return value && Array.isArray(value) ? (
          <div className="flex gap-1">
            {(value as string[]).map((user) => (
              <TableLink
                key={user}
                path={`/project/${projectId}/users/${encodeURIComponent(user)}`}
                value={user}
                truncateAt={40}
              />
            ))}
          </div>
        ) : undefined;
      },
    },
    {
      accessorKey: "countTraces",
      id: "countTraces",
      header: "Traces",
      enableHiding: true,
      enableSorting: true,
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<SessionTableRow>("sessionsColumnVisibility", columns);

  return (
    <div>
      <DataTableToolbar
        filterColumnDefinition={sessionsViewCols}
        filterState={userFilterState}
        setFilterState={setUserFilterState}
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
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
                  data: sessions.data.map((t) => convertToTableRow(t)),
                }
        }
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        help={{
          description:
            "A session is a collection of related traces, such as a conversation or thread. To begin, add a sessionId to the trace.",
          href: "https://langfuse.com/docs/sessions",
        }}
      />
    </div>
  );
}
