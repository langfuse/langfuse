import { StarTraceToggle } from "@/src/components/star-toggle";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { Badge } from "@/src/components/ui/badge";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { TagTracePopover } from "@/src/features/tag/components/TagTracePopver";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type RouterOutput } from "@/src/utils/types";
import { type RowSelectionState } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import type Decimal from "decimal.js";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { DeleteButton } from "@/src/components/deleteButton";
import {
  formatAsLabel,
  LevelColors,
  LevelSymbols,
} from "@/src/components/level-colors";
import { cn } from "@/src/utils/tailwind";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import {
  type FilterState,
  type TraceOptions,
  tracesTableColsWithOptions,
  type ObservationLevelType,
  BatchExportTableName,
  AnnotationQueueObjectType,
  BatchActionType,
} from "@langfuse/shared";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import {
  getScoreGroupColumnProps,
  verifyAndPrefixScoreDataAgainstKeys,
} from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import { type ScoreAggregate } from "@langfuse/shared";
import { useIndividualScoreColumns } from "@/src/features/scores/hooks/useIndividualScoreColumns";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Skeleton } from "@/src/components/ui/skeleton";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { BreakdownTooltip } from "@/src/components/trace/BreakdownToolTip";
import { InfoIcon, MoreVertical } from "lucide-react";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import React from "react";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { type TableAction } from "@/src/features/table/types";
import {
  LevelCountsDisplay,
  type LevelCount,
} from "@/src/components/level-counts-display";
import {
  DropdownMenuContent,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { Trace } from "@/src/components/trace";
import router from "next/router";
import TableId from "@/src/components/table/table-id";
import {
  useEnvironmentFilter,
  convertSelectedEnvironmentsToFilter,
} from "@/src/hooks/use-environment-filter";

export type TracesTableRow = {
  bookmarked: boolean;
  id: string;
  timestamp: Date;
  name: string;
  userId: string;
  level?: ObservationLevelType;
  observationCount?: bigint;
  levelCounts: {
    errorCount?: bigint;
    warningCount?: bigint;
    debugCount?: bigint;
    defaultCount?: bigint;
  };
  // scores holds grouped column with individual scores
  scores?: ScoreAggregate;
  latency?: number;
  release?: string;
  version?: string;
  sessionId?: string;
  environment?: string;
  // i/o and metadata not set explicitly, but fetched from the server from the cell
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  tags: string[];
  usage: {
    promptTokens?: bigint;
    completionTokens?: bigint;
    totalTokens?: bigint;
  };
  usageDetails?: Record<string, number>;
  costDetails?: Record<string, number>;
  inputCost?: Decimal;
  outputCost?: Decimal;
  totalCost?: Decimal;
};

export type TracesTableProps = {
  projectId: string;
  userId?: string;
  omittedFilter?: string[];
  pinFirstColumn?: boolean;
};

export default function TracesTable({
  projectId,
  userId,
  omittedFilter = [],
}: TracesTableProps) {
  const utils = api.useUtils();
  const [peekViewId] = useQueryParam("peek", withDefault(StringParam, null));
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const { setDetailPageList } = useDetailPageLists();
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );
  const [selectedTab, setSelectedTab] = useQueryParam(
    "display",
    withDefault(StringParam, "details"),
  );
  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange(projectId);
  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "traces",
    projectId,
  );
  const [orderByState, setOrderByState] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

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
  const userIdFilter: FilterState = userId
    ? [
        {
          column: "User ID",
          type: "string",
          operator: "=",
          value: userId,
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
  const { selectAll, setSelectAll } = useSelectAll(projectId, "traces");

  const tracesAllCountFilter = {
    projectId,
    filter: filterState,
    searchQuery,
    // "empty" values as they do not matter for total count
    page: 0,
    limit: 0,
    orderBy: null,
  };

  const tracesAllQueryFilter = {
    ...tracesAllCountFilter,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    orderBy: orderByState,
  };
  const traces = api.traces.all.useQuery(tracesAllQueryFilter, {
    enabled: environmentFilterOptions.data !== undefined,
  });
  const totalCountQuery = api.traces.countAll.useQuery(tracesAllCountFilter, {
    enabled: environmentFilterOptions.data !== undefined,
  });
  const traceMetrics = api.traces.metrics.useQuery(
    {
      projectId,
      filter: filterState,
      traceIds: traces.data?.traces.map((t) => t.id) ?? [],
    },
    {
      enabled: traces.data !== undefined,
    },
  );

  type TracesCoreOutput = RouterOutput["traces"]["all"]["traces"][number];
  type TraceMetricOutput = RouterOutput["traces"]["metrics"][number];

  const traceRowData = joinTableCoreAndMetrics<
    TracesCoreOutput,
    TraceMetricOutput
  >(traces.data?.traces, traceMetrics.data);

  const totalCount = totalCountQuery.data?.totalCount ?? null;

  useEffect(() => {
    if (traces.isSuccess) {
      setDetailPageList(
        "traces",
        traces.data.traces.map((t) => ({
          id: t.id,
          params: { timestamp: t.timestamp.toISOString() },
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traces.isSuccess, traces.data]);

  // loading filter options individually from the remaining calls
  // traces.all should load first together with everything else.
  // This here happens in the background.
  const traceFilterOptions = api.traces.filterOptions.useQuery(
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

  const transformFilterOptions = (
    traceFilterOptions: TraceOptions | undefined,
  ) => {
    return tracesTableColsWithOptions(traceFilterOptions).filter(
      (c) => !omittedFilter?.includes(c.name),
    );
  };

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("traces", "s");
  const { scoreColumns, scoreKeysAndProps, isColumnLoading } =
    useIndividualScoreColumns<TracesTableRow>({
      projectId,
      scoreColumnKey: "scores",
      selectedFilterOption: selectedOption,
      cellsLoading: !traceMetrics.data,
    });

  const hasTraceDeletionEntitlement = useHasEntitlement("trace-deletion");

  const { selectActionColumn } = TableSelectionManager<TracesTableRow>({
    projectId,
    tableName: "traces",
    setSelectedRows,
  });

  const traceDeleteMutation = api.traces.deleteMany.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Traces deleted",
        description:
          "Selected traces will be deleted. Traces are removed asynchronously and may continue to be visible for up to 15 minutes.",
      });
    },
    onSettled: () => {
      void utils.traces.all.invalidate();
    },
  });

  const addToQueueMutation = api.annotationQueueItems.createMany.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: "Traces added to queue",
        description: `Selected traces will be added to queue "${data.queueName}". This may take a minute.`,
        link: {
          href: `/project/${projectId}/annotation-queues/${data.queueId}`,
          text: `View queue "${data.queueName}"`,
        },
      });
    },
  });

  const handleDeleteTraces = async ({ projectId }: { projectId: string }) => {
    const selectedTraceIds = Object.keys(selectedRows).filter((traceId) =>
      traces.data?.traces.map((t) => t.id).includes(traceId),
    );

    await traceDeleteMutation.mutateAsync({
      projectId,
      traceIds: selectedTraceIds,
      query: {
        filter: filterState,
        orderBy: orderByState,
      },
      isBatchAction: selectAll,
    });
    setSelectedRows({});
  };

  const handleAddToAnnotationQueue = async ({
    projectId,
    targetId,
  }: {
    projectId: string;
    targetId: string;
  }) => {
    const selectedTraceIds = Object.keys(selectedRows).filter((traceId) =>
      traces.data?.traces.map((t) => t.id).includes(traceId),
    );

    await addToQueueMutation.mutateAsync({
      projectId,
      objectIds: selectedTraceIds,
      objectType: AnnotationQueueObjectType.TRACE,
      queueId: targetId,
      isBatchAction: selectAll,
      query: {
        filter: filterState,
        orderBy: orderByState,
      },
    });
    setSelectedRows({});
  };

  const tableActions: TableAction[] = [
    ...(hasTraceDeletionEntitlement
      ? [
          {
            id: "trace-delete",
            type: BatchActionType.Delete,
            label: "Delete Traces",
            description:
              "This action permanently deletes traces and cannot be undone. Trace deletion happens asynchronously and may take up to 15 minutes.",
            accessCheck: {
              scope: "traces:delete",
              entitlement: "trace-deletion",
            },
            execute: handleDeleteTraces,
          } as TableAction,
        ]
      : []),
    {
      id: "trace-add-to-annotation-queue",
      type: BatchActionType.Create,
      label: "Add to Annotation Queue",
      description: "Add selected traces to an annotation queue.",
      targetLabel: "Annotation Queue",
      execute: handleAddToAnnotationQueue,
      accessCheck: {
        scope: "annotationQueues:CUD",
        entitlement: "annotation-queues",
      },
    },
  ];

  const columns: LangfuseColumnDef<TracesTableRow>[] = [
    selectActionColumn,
    {
      accessorKey: "bookmarked",
      header: undefined,
      id: "bookmarked",
      size: 30,
      isPinned: true,
      cell: ({ row }) => {
        const bookmarked: TracesTableRow["bookmarked"] =
          row.getValue("bookmarked");
        const traceId = row.getValue("id");
        return typeof traceId === "string" &&
          typeof bookmarked === "boolean" ? (
          <StarTraceToggle
            tracesFilter={tracesAllQueryFilter}
            traceId={traceId}
            projectId={projectId}
            value={bookmarked}
            size="icon-xs"
          />
        ) : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "id",
      header: "ID",
      id: "id",
      size: 90,
      isPinned: true,
      cell: ({ row }) => {
        const value: TracesTableRow["id"] = row.getValue("id");

        return value && typeof value === "string" ? (
          <TableId value={value} />
        ) : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      id: "timestamp",
      size: 150,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: TracesTableRow["timestamp"] = row.getValue("timestamp");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      size: 150,
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "environment",
      header: "Environment",
      id: "environment",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: TracesTableRow["environment"] =
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
      accessorKey: "userId",
      header: "User",
      id: "userId",
      size: 150,
      headerTooltip: {
        description: "Add `userId` to traces to track users.",
        href: "https://langfuse.com/docs/tracing-features/users",
      },
      cell: ({ row }) => {
        const value: TracesTableRow["userId"] = row.getValue("userId");
        return value && typeof value === "string" ? (
          <TableId value={value} />
        ) : undefined;
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "sessionId",
      enableColumnFilter: !omittedFilter.find((f) => f === "sessionId"),
      id: "sessionId",
      header: "Session",
      size: 150,
      headerTooltip: {
        description: "Add `sessionId` to traces to track sessions.",
        href: "https://langfuse.com/docs/tracing-features/sessions",
      },
      cell: ({ row }) => {
        const value: TracesTableRow["sessionId"] = row.getValue("sessionId");
        return value && typeof value === "string" ? (
          <TableId value={value} />
        ) : undefined;
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "latency",
      id: "latency",
      header: "Latency",
      size: 70,
      // add seconds to the end of the latency
      cell: ({ row }) => {
        const value: TracesTableRow["latency"] = row.getValue("latency");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return value !== undefined ? (
          <span>{formatIntervalSeconds(value)}</span>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "inputTokens",
      id: "inputTokens",
      header: "Input Tokens",
      size: 110,
      cell: ({ row }) => {
        const value: TracesTableRow["usage"] = row.getValue("usage");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return <span>{numberFormatter(value.promptTokens, 0)}</span>;
      },
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
    },
    {
      accessorKey: "outputTokens",
      id: "outputTokens",
      header: "Output Tokens",
      size: 110,
      cell: ({ row }) => {
        const value: TracesTableRow["usage"] = row.getValue("usage");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return <span>{numberFormatter(value.completionTokens, 0)}</span>;
      },
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
    },
    {
      accessorKey: "totalTokens",
      id: "totalTokens",
      header: "Total Tokens",
      size: 110,
      cell: ({ row }) => {
        const value: TracesTableRow["usage"] = row.getValue("usage");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return <span>{numberFormatter(value.totalTokens, 0)}</span>;
      },
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
    },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
      size: 220,
      cell: ({ row }) => {
        const value: TracesTableRow["usage"] = row.getValue("usage");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return (
          <BreakdownTooltip details={row.original.usageDetails ?? []}>
            <div className="flex items-center gap-1">
              <TokenUsageBadge
                promptTokens={value.promptTokens ?? 0}
                completionTokens={value.completionTokens ?? 0}
                totalTokens={value.totalTokens ?? 0}
                inline
              />
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      ...getScoreGroupColumnProps(isColumnLoading || !traceMetrics.data),
      columns: scoreColumns,
    },
    {
      accessorKey: "inputCost",
      id: "inputCost",
      header: "Input Cost",
      size: 100,
      cell: ({ row }) => {
        const cost: TracesTableRow["inputCost"] = row.getValue("inputCost");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return (
          <div>
            {cost ? (
              <span>{usdFormatter(cost.toNumber())}</span>
            ) : (
              <span>-</span>
            )}
          </div>
        );
      },
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
    },
    {
      accessorKey: "outputCost",
      id: "outputCost",
      header: "Output Cost",
      size: 100,
      cell: ({ row }) => {
        const cost: TracesTableRow["outputCost"] = row.getValue("outputCost");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return (
          <div>
            {cost ? (
              <span>{usdFormatter(cost.toNumber())}</span>
            ) : (
              <span>-</span>
            )}
          </div>
        );
      },
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
    },
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: "Total Cost",
      size: 100,
      cell: ({ row }) => {
        const cost: TracesTableRow["totalCost"] = row.getValue("totalCost");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return cost != null ? (
          <BreakdownTooltip details={row.original.costDetails ?? []} isCost>
            <div className="flex items-center gap-1">
              {cost ? (
                <span>{usdFormatter(cost.toNumber())}</span>
              ) : (
                <span>-</span>
              )}
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        ) : null;
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 400,
      cell: ({ row }) => {
        const traceId: TracesTableRow["id"] = row.getValue("id");
        const traceTimestamp: TracesTableRow["timestamp"] =
          row.getValue("timestamp");
        return (
          <TracesDynamicCell
            traceId={traceId}
            projectId={projectId}
            timestamp={new Date(traceTimestamp)}
            col="input"
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "output",
      header: "Output",
      id: "output",
      size: 400,
      cell: ({ row }) => {
        const traceId: TracesTableRow["id"] = row.getValue("id");
        const traceTimestamp: TracesTableRow["timestamp"] =
          row.getValue("timestamp");
        return (
          <TracesDynamicCell
            traceId={traceId}
            projectId={projectId}
            timestamp={new Date(traceTimestamp)}
            col="output"
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      size: 400,
      headerTooltip: {
        description: "Add metadata to traces to track additional information.",
        href: "https://langfuse.com/docs/tracing-features/metadata",
      },
      cell: ({ row }) => {
        const traceId: TracesTableRow["id"] = row.getValue("id");
        const traceTimestamp: TracesTableRow["timestamp"] =
          row.getValue("timestamp");
        return (
          <TracesDynamicCell
            traceId={traceId}
            projectId={projectId}
            timestamp={new Date(traceTimestamp)}
            col="metadata"
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "level",
      id: "level",
      header: "Level",
      size: 75,
      cell: ({ row }) => {
        const value: TracesTableRow["level"] = row.getValue("level");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return value ? (
          <span
            className={cn(
              "rounded-sm p-0.5 text-xs",
              LevelColors[value].bg,
              LevelColors[value].text,
            )}
          >
            {value}
          </span>
        ) : (
          <span>-</span>
        );
      },
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
    },
    {
      accessorKey: "levelCounts",
      id: "levelCounts",
      header: "Observation Levels",
      size: 75,
      cell: ({ row }) => {
        const value: TracesTableRow["levelCounts"] =
          row.getValue("levelCounts");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;

        const counts: LevelCount[] = Object.entries(value).map(
          ([level, count]) => ({
            level: formatAsLabel(level),
            count,
            symbol: LevelSymbols[formatAsLabel(level)],
          }),
        );

        return <LevelCountsDisplay counts={counts} />;
      },
      enableHiding: true,
    },
    {
      accessorKey: "observationCount",
      id: "observationCount",
      header: "Observations",
      size: 120,
      headerTooltip: {
        description: "The number of observations in the trace.",
      },
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: TracesTableRow["observationCount"] =
          row.getValue("observationCount");
        if (!traceMetrics.data) return <Skeleton className="h-3 w-1/2" />;
        return <span>{numberFormatter(value, 0)}</span>;
      },
    },
    {
      accessorKey: "version",
      id: "version",
      header: "Version",
      size: 100,
      headerTooltip: {
        description: "Track changes via the version tag.",
        href: "https://langfuse.com/docs/experimentation",
      },
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
    },
    {
      accessorKey: "release",
      id: "release",
      header: "Release",
      size: 100,
      headerTooltip: {
        description: "Track changes to your application via the release tag.",
        href: "https://langfuse.com/docs/experimentation",
      },
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
    },
    {
      accessorKey: "tags",
      id: "tags",
      header: "Tags",
      size: 150,
      headerTooltip: {
        description: "Group traces with tags.",
        href: "https://langfuse.com/docs/tracing-features/tags",
      },
      cell: ({ row }) => {
        const tags: TracesTableRow["tags"] = row.getValue("tags");
        const traceId: TracesTableRow["id"] = row.getValue("id");
        const filterOptionTags = traceFilterOptions.data?.tags ?? [];
        const allTags = filterOptionTags.map((t) => t.value);
        return (
          <TagTracePopover
            tags={tags}
            availableTags={allTags}
            projectId={projectId}
            traceId={traceId}
            tracesFilter={tracesAllQueryFilter}
            className={cn(rowHeight !== "s" && "flex-wrap")}
          />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "action",
      header: "Action",
      size: 70,
      isPinned: true,
      cell: ({ row }) => {
        const traceId: TracesTableRow["id"] = row.getValue("id");
        return traceId &&
          typeof traceId === "string" &&
          hasTraceDeletionEntitlement ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <DeleteButton
                  itemId={traceId}
                  projectId={projectId}
                  scope="traces:delete"
                  invalidateFunc={() => void utils.traces.all.invalidate()}
                  type="trace"
                  isTableAction={true}
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined;
      },
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<TracesTableRow>(
      `tracesColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<TracesTableRow>(
    "tracesColumnOrder",
    columns,
  );

  const rows = useMemo(() => {
    return traces.isSuccess
      ? (traceRowData?.rows?.map((trace) => {
          return {
            bookmarked: trace.bookmarked,
            id: trace.id,
            timestamp: trace.timestamp,
            name: trace.name ?? "",
            level: trace.level,
            observationCount: trace.observationCount,
            release: trace.release ?? undefined,
            version: trace.version ?? undefined,
            userId: trace.userId ?? "",
            sessionId: trace.sessionId ?? undefined,
            environment: trace.environment ?? undefined,
            latency: trace.latency === null ? undefined : trace.latency,
            tags: trace.tags,
            usage: {
              promptTokens: trace.promptTokens,
              completionTokens: trace.completionTokens,
              totalTokens: trace.totalTokens,
            },
            levelCounts: {
              errorCount: trace.errorCount,
              warningCount: trace.warningCount,
              defaultCount: trace.defaultCount,
              debugCount: trace.debugCount,
            },
            usageDetails: trace.usageDetails,
            costDetails: trace.costDetails,
            scores: trace.scores
              ? verifyAndPrefixScoreDataAgainstKeys(
                  scoreKeysAndProps,
                  trace.scores,
                )
              : undefined,
            inputCost: trace.calculatedInputCost ?? undefined,
            outputCost: trace.calculatedOutputCost ?? undefined,
            totalCost: trace.calculatedTotalCost ?? undefined,
          };
        }) ?? [])
      : [];
  }, [traces, traceRowData, scoreKeysAndProps]);
  return (
    <>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={transformFilterOptions(traceFilterOptions.data)}
        searchConfig={{
          placeholder: "Search (by id, name, trace name, user id)",
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
        }}
        filterState={userFilterState}
        setFilterState={useDebounce(setUserFilterState)}
        columnsWithCustomSelect={["name", "tags"]}
        actionButtons={[
          Object.keys(selectedRows).filter((traceId) =>
            traces.data?.traces.map((t) => t.id).includes(traceId),
          ).length > 0 ? (
            <TableActionMenu
              key="traces-multi-select-actions"
              projectId={projectId}
              actions={tableActions}
              tableName={BatchExportTableName.Traces}
            />
          ) : null,
          <BatchExportTableButton
            {...{ projectId, filterState, orderByState }}
            tableName={BatchExportTableName.Traces}
            key="batchExport"
          />,
        ]}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
        multiSelect={{
          selectAll,
          setSelectAll,
          selectedRowIds: Object.keys(selectedRows).filter((traceId) =>
            traces.data?.traces.map((t) => t.id).includes(traceId),
          ),
          setRowSelection: setSelectedRows,
          totalCount,
          ...paginationState,
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
          traces.isLoading
            ? { isLoading: true, isError: false }
            : traces.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: traces.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: rows,
                }
        }
        pagination={{
          totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        rowSelection={selectedRows}
        setRowSelection={setSelectedRows}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
        pinFirstColumn
        peekView={{
          itemType: "TRACE",
          onOpenChange: (open: boolean, row?: TracesTableRow) => {
            const url = new URL(window.location.href);
            const params = new URLSearchParams(url.search);

            if (!open || !row) {
              // Remove peek and timestamp params while keeping others
              params.delete("peek");
              params.delete("timestamp");
              params.delete("observation");
              params.delete("display");
            } else if (open && row.id && peekViewId !== row.id) {
              // Update or add peek and timestamp params
              params.set("peek", row.id);
              params.set("timestamp", row.timestamp.toISOString());
              params.delete("observation");
            } else {
              return;
            }

            router.replace(
              {
                pathname: `/project/${projectId}/traces`,
                query: params.toString(),
              },
              undefined,
              { shallow: true },
            );
          },
          onExpand: (openInNewTab: boolean) => {
            if (peekViewId) {
              const url = new URL(window.location.href);
              const params = new URLSearchParams(url.search);
              const timestamp = params.get("timestamp");
              const display = params.get("display") ?? "details";

              if (openInNewTab) {
                window.open(
                  `/project/${projectId}/traces/${encodeURIComponent(peekViewId)}?timestamp=${timestamp}&display=${display}`,
                  "_blank",
                );
              } else {
                router.replace(
                  `/project/${projectId}/traces/${encodeURIComponent(peekViewId)}?timestamp=${timestamp}&display=${display}`,
                );
              }
            }
          },
          render: () => {
            const { peek, timestamp } = router.query;

            const trace = api.traces.byIdWithObservationsAndScores.useQuery(
              {
                traceId: peek as string,
                timestamp:
                  typeof timestamp === "string"
                    ? new Date(timestamp)
                    : undefined,
                projectId,
              },
              {
                enabled: !!peek && !!timestamp,
                retry(failureCount, error) {
                  if (
                    error.data?.code === "UNAUTHORIZED" ||
                    error.data?.code === "NOT_FOUND"
                  )
                    return false;
                  return failureCount < 3;
                },
              },
            );

            return !trace.data ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <Trace
                key={trace.data.id}
                trace={trace.data}
                scores={trace.data.scores}
                projectId={trace.data.projectId}
                observations={trace.data.observations}
                selectedTab={selectedTab}
                setSelectedTab={setSelectedTab}
              />
            );
          },
        }}
      />
    </>
  );
}

const TracesDynamicCell = ({
  traceId,
  projectId,
  timestamp,
  col,
  singleLine = false,
}: {
  traceId: string;
  projectId: string;
  timestamp: Date;
  col: "input" | "output" | "metadata";
  singleLine?: boolean;
}) => {
  const trace = api.traces.byId.useQuery(
    { traceId, projectId, timestamp },
    {
      enabled: typeof traceId === "string",
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
    },
  );
  return (
    <IOTableCell
      isLoading={trace.isLoading}
      data={
        col === "output"
          ? trace.data?.output
          : col === "input"
            ? trace.data?.input
            : trace.data?.metadata
      }
      className={cn(col === "output" && "bg-accent-light-green")}
      singleLine={singleLine}
    />
  );
};
