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
  TableViewPresetTableName,
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
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Skeleton } from "@/src/components/ui/skeleton";
import TagList from "@/src/features/tag/components/TagList";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { cn } from "@/src/utils/tailwind";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import {
  useEnvironmentFilter,
  convertSelectedEnvironmentsToFilter,
} from "@/src/hooks/use-environment-filter";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { Badge } from "@/src/components/ui/badge";
import { type ScoreAggregate } from "@langfuse/shared";
import { useIndividualScoreColumns } from "@/src/features/scores/hooks/useIndividualScoreColumns";
import {
  getScoreGroupColumnProps,
  verifyAndPrefixScoreDataAgainstKeys,
} from "@/src/features/scores/components/ScoreDetailColumnHelpers";

export type SessionTableRow = {
  id: string;
  createdAt: Date;
  bookmarked: boolean;
  userIds: string[] | undefined;
  countTraces: number | undefined;
  sessionDuration: number | null | undefined;
  inputCost: Decimal | undefined;
  outputCost: Decimal | undefined;
  totalCost: Decimal | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  traceTags: string[] | undefined;
  environment?: string;
  scores?: ScoreAggregate;
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
    useTableDateRange(projectId);

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "sessions",
    projectId,
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
    userIdFilter,
    dateRangeFilter,
    environmentFilter,
  );

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("sessions", "s");

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });

  const payloadCount = {
    projectId,
    filter: filterState,
    orderBy: null,
    page: 0,
    limit: 1,
  };

  const payloadGetAll = {
    ...payloadCount,
    orderBy: orderByState,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  };

  const sessions = api.sessions.all.useQuery(payloadGetAll);
  const sessionCountQuery = api.sessions.countAll.useQuery(payloadCount);

  const { scoreColumns, scoreKeysAndProps, isColumnLoading } =
    useIndividualScoreColumns<SessionTableRow>({
      projectId,
      scoreColumnKey: "scores",
      selectedFilterOption: selectedOption,
      cellsLoading: !sessions.data,
    });

  const sessionMetrics = api.sessions.metrics.useQuery(
    {
      projectId,
      sessionIds: sessions.data?.sessions.map((s) => s.id) ?? [],
    },
    {
      enabled: sessions.data !== undefined,
    },
  );

  type SessionCoreOutput = RouterOutput["sessions"]["all"]["sessions"][number];
  type SessionMetricOutput = RouterOutput["sessions"]["metrics"][number];

  const sessionRowData = joinTableCoreAndMetrics<
    SessionCoreOutput,
    SessionMetricOutput
  >(sessions.data?.sessions, sessionMetrics.data);

  const filterOptions = api.sessions.filterOptions.useQuery(
    {
      projectId,
      timestampFilter:
        dateRangeFilter[0]?.type === "datetime"
          ? dateRangeFilter[0]
          : undefined,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const totalCount = sessionCountQuery.data?.totalCount ?? null;
  useEffect(() => {
    if (sessions.isSuccess) {
      setDetailPageList(
        "sessions",
        sessions.data.sessions.map((t) => ({ id: t.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.isSuccess, sessions.data]);

  const columns: LangfuseColumnDef<SessionTableRow>[] = [
    {
      accessorKey: "bookmarked",
      id: "bookmarked",
      isPinned: true,
      header: undefined,
      size: 50,
      cell: ({ row }) => {
        const bookmarked: SessionTableRow["bookmarked"] =
          row.getValue("bookmarked");
        const sessionId: SessionTableRow["id"] = row.getValue("id");

        return typeof sessionId === "string" &&
          typeof bookmarked === "boolean" ? (
          <StarSessionToggle
            sessionId={sessionId}
            projectId={projectId}
            value={bookmarked}
            size="icon-xs"
          />
        ) : undefined;
      },
      enableSorting: false,
    },

    {
      accessorKey: "id",
      id: "id",
      header: "ID",
      size: 200,
      isPinned: true,
      cell: ({ row }) => {
        const value: SessionTableRow["id"] = row.getValue("id");
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
      cell: ({ row }) => {
        const value: SessionTableRow["createdAt"] = row.getValue("createdAt");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "sessionDuration",
      id: "sessionDuration",
      header: "Duration",
      size: 130,
      enableHiding: true,
      cell: ({ row }) => {
        const value: SessionTableRow["sessionDuration"] =
          row.getValue("sessionDuration");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value && typeof value === "number"
          ? formatIntervalSeconds(value)
          : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "environment",
      header: "Environment",
      id: "environment",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: SessionTableRow["environment"] =
          row.getValue("environment");
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
      ...getScoreGroupColumnProps(isColumnLoading || !sessions.data),
      columns: scoreColumns,
    },
    {
      accessorKey: "userIds",
      enableColumnFilter: !omittedFilter.find((f) => f === "userIds"),
      id: "userIds",
      header: "User IDs",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const value: SessionTableRow["userIds"] = row.getValue("userIds");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
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
      cell: ({ row }) => {
        const value: SessionTableRow["countTraces"] =
          row.getValue("countTraces");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value ? <span>{numberFormatter(value, 0)}</span> : undefined;
      },
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
        const value: SessionTableRow["inputCost"] = row.getValue("inputCost");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
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
        const value: SessionTableRow["outputCost"] = row.getValue("outputCost");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
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
        const value: SessionTableRow["totalCost"] = row.getValue("totalCost");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
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
        const value: SessionTableRow["inputTokens"] =
          row.getValue("inputTokens");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
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
        const value: SessionTableRow["outputTokens"] =
          row.getValue("outputTokens");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
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
        const value: SessionTableRow["totalTokens"] =
          row.getValue("totalTokens");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
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
        const promptTokens: SessionTableRow["inputTokens"] =
          row.getValue("inputTokens");
        const completionTokens: SessionTableRow["outputTokens"] =
          row.getValue("outputTokens");
        const totalTokens: SessionTableRow["totalTokens"] =
          row.getValue("totalTokens");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return (
          <TokenUsageBadge
            inputUsage={Number(promptTokens ?? 0)}
            outputUsage={Number(completionTokens ?? 0)}
            totalUsage={Number(totalTokens ?? 0)}
            inline
          />
        );
      },
    },
    {
      accessorKey: "traceTags",
      id: "traceTags",
      header: "Trace Tags",
      size: 250,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: SessionTableRow["traceTags"] = row.getValue("traceTags");
        if (!sessionMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return (
          value && (
            <div
              className={cn(
                "flex gap-x-2 gap-y-1",
                rowHeight !== "s" && "flex-wrap",
              )}
            >
              <TagList selectedTags={value} isLoading={false} viewOnly />
            </div>
          )
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

  const [columnOrder, setColumnOrder] = useColumnOrder<SessionTableRow>(
    "sessionsColumnOrder",
    columns,
  );

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Sessions,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setUserFilterState,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibility,
    },
    validationContext: {
      columns,
      filterColumnDefinition: transformFilterOptions(),
    },
  });

  return (
    <>
      <DataTableToolbar
        filterColumnDefinition={transformFilterOptions()}
        filterState={userFilterState}
        setFilterState={useDebounce(setUserFilterState)}
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        viewConfig={{
          tableName: TableViewPresetTableName.Sessions,
          projectId,
          controllers: viewControllers,
        }}
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
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        environmentFilter={{
          values: selectedEnvironments,
          onValueChange: setSelectedEnvironments,
          options: environmentOptions.map((env) => ({ value: env })),
        }}
      />
      <DataTable
        columns={columns}
        data={
          sessions.isLoading || isViewLoading
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
                  data: sessionRowData.rows?.map<SessionTableRow>((session) => {
                    return {
                      id: session.id,
                      createdAt: session.createdAt,
                      bookmarked: session.bookmarked,
                      userIds: session.userIds,
                      countTraces: session.countTraces,
                      sessionDuration: session.sessionDuration,
                      inputCost: session.inputCost,
                      outputCost: session.outputCost,
                      totalCost: session.totalCost,
                      inputTokens: session.promptTokens,
                      outputTokens: session.completionTokens,
                      totalTokens: session.totalTokens,
                      traceTags: session.traceTags,
                      environment: session.environment,
                      scores: session.scores
                        ? verifyAndPrefixScoreDataAgainstKeys(
                            scoreKeysAndProps,
                            session.scores,
                          )
                        : undefined,
                    };
                  }),
                }
        }
        pagination={{
          totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        help={{
          description:
            "A session is a collection of related traces, such as a conversation or thread. To begin, add a sessionId to the trace.",
          href: "https://langfuse.com/docs/tracing-features/sessions",
        }}
        rowHeight={rowHeight}
      />
    </>
  );
}
