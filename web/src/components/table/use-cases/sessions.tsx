import { StarSessionToggle } from "@/src/components/star-toggle";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import {
  type FilterState,
  sessionsTableColsWithOptions,
  BatchExportTableName,
} from "@langfuse/shared";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { type RouterOutput } from "@/src/utils/types";
import type Decimal from "decimal.js";
import { useEffect } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";

export type SessionTableRow = {
  id: string;
  createdAt: string;
  userIds: string[];
  countTraces: number;
  bookmarked: boolean;
  sessionDuration: number | null;
  inputCost: Decimal;
  outputCost: Decimal;
  totalCost: Decimal;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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
  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange();

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "sessions",
  );

  const userIdFilter: FilterState = userId
    ? [
        {
          column: "User IDs",
          type: "arrayOptions",
          operator: "any of",
          value: [userId],
        },
      ]
    : [];

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "createdAt",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
      ]
    : [];

  const filterState = userFilterState.concat(userIdFilter, dateRangeFilter);

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

  const filterOptions = api.sessions.filterOptions.useQuery(
    {
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

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
      inputCost: session.inputCost,
      outputCost: session.outputCost,
      totalCost: session.totalCost,
      inputTokens: session.promptTokens,
      outputTokens: session.completionTokens,
      totalTokens: session.totalTokens,
    };
  };

  const columns: LangfuseColumnDef<SessionTableRow>[] = [
    {
      accessorKey: "bookmarked",
      id: "bookmarked",
      header: undefined,
      size: 50,
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
      size: 200,
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
      size: 150,
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "sessionDuration",
      id: "sessionDuration",
      header: "Duration",
      size: 130,
      enableHiding: true,
      cell: ({ row }) => {
        const value = row.getValue("sessionDuration");
        return value && typeof value === "number"
          ? formatIntervalSeconds(value)
          : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "userIds",
      enableColumnFilter: !omittedFilter.find((f) => f === "userIds"),
      id: "userIds",
      header: "User IDs",
      size: 200,
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
      size: 100,
      headerTooltip: {
        description: "The number of traces in the session.",
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "inputCost",
      id: "inputCost",
      header: "Input Cost",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: Decimal | null | undefined = row.getValue("inputCost");
        return value ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "outputCost",
      id: "outputCost",
      header: "Output Cost",
      size: 110,
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: Decimal | null | undefined = row.getValue("outputCost");

        return value ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: "Total Cost",
      size: 110,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: Decimal | null | undefined = row.getValue("totalCost");

        return value ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "inputTokens",
      id: "inputTokens",
      header: "Input Tokens",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("inputTokens");

        return value ? (
          <span>{numberFormatter(Number(value), 0)}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "outputTokens",
      id: "outputTokens",
      header: "Output Tokens",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value = row.getValue("outputTokens");

        return value ? (
          <span>{numberFormatter(Number(value), 0)}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "totalTokens",
      id: "totalTokens",
      header: "Total Tokens",
      size: 110,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value = row.getValue("totalTokens");
        return value ? (
          <span>{numberFormatter(Number(value), 0)}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "usage",
      id: "usage",
      header: "Usage",
      size: 220,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const promptTokens = row.getValue("inputTokens");
        const completionTokens = row.getValue("outputTokens");
        const totalTokens = row.getValue("totalTokens");
        return (
          <TokenUsageBadge
            promptTokens={Number(promptTokens)}
            completionTokens={Number(completionTokens)}
            totalTokens={Number(totalTokens)}
            inline
          />
        );
      },
    },
  ];

  const transformFilterOptions = () => {
    return sessionsTableColsWithOptions(filterOptions.data).filter(
      (c) => !omittedFilter?.includes(c.name),
    );
  };

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<SessionTableRow>("sessionsColumnVisibility", columns);

  return (
    <>
      <DataTableToolbar
        filterColumnDefinition={transformFilterOptions()}
        filterState={userFilterState}
        setFilterState={useDebounce(setUserFilterState)}
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        actionButtons={[
          <BatchExportTableButton
            {...{ projectId, filterState, orderByState }}
            tableName={BatchExportTableName.Sessions}
            key="batchExport"
          />,
        ]}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
        columnsWithCustomSelect={["userIds"]}
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
          href: "https://langfuse.com/docs/tracing-features/sessions",
        }}
      />
    </>
  );
}
