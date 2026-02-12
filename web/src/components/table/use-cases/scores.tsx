import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "../../ui/IOTableCell";
import { Avatar, AvatarImage } from "@/src/components/ui/avatar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  scoreFilterConfig,
  SCORE_COLUMN_TO_BACKEND_KEY,
} from "@/src/features/filters/config/scores-config";
import { transformFiltersForBackend } from "@/src/features/filters/lib/filter-transform";
import { isNumericDataType } from "@/src/features/scores/lib/helpers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { api } from "@/src/utils/api";

import type { RouterOutput } from "@/src/utils/types";
import {
  isPresent,
  type FilterState,
  type ScoreDataTypeType,
  BatchExportTableName,
  BatchActionType,
  TableViewPresetTableName,
  type TimeFilter,
} from "@langfuse/shared";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import TagList from "@/src/features/tag/components/TagList";
import { cn } from "@/src/utils/tailwind";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Badge } from "@/src/components/ui/badge";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import React, { useState, useRef, useCallback } from "react";
import type { TableAction } from "@/src/features/table/types";
import type { RowSelectionState } from "@tanstack/react-table";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import TableIdOrName from "@/src/components/table/table-id";

export type ScoresTableRow = {
  id: string;
  traceId?: string;
  sessionId?: string;
  timestamp: Date;
  source: string;
  name: string;
  dataType: ScoreDataTypeType;
  value: string;
  author: {
    userId?: string;
    image?: string;
    name?: string;
  };
  comment?: string;
  metadata?: unknown;
  observationId?: string;
  traceName?: string;
  userId?: string;
  jobConfigurationId?: string;
  traceTags?: string[];
  environment?: string;
  executionTraceId?: string;
};

function createFilterState(
  userFilterState: FilterState,
  omittedFilters: Record<string, string>[],
): FilterState {
  return omittedFilters.reduce((filterState, { key, value }) => {
    return filterState.concat([
      {
        column: `${key}`,
        type: "string",
        operator: "=",
        value: value,
      },
    ]);
  }, userFilterState);
}

export default function ScoresTable({
  projectId,
  userId,
  traceId,
  observationId,
  hiddenColumns = [],
  localStorageSuffix = "",
  disableUrlPersistence = false,
}: {
  projectId: string;
  userId?: string;
  traceId?: string;
  observationId?: string;
  omittedFilter?: string[];
  hiddenColumns?: string[];
  localStorageSuffix?: string;
  disableUrlPersistence?: boolean;
}) {
  const utils = api.useUtils();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const { selectAll, setSelectAll } = useSelectAll(projectId, "scores");

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("scores", "s");
  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Convert timeRange to absolute date range for compatibility
  const dateRange = React.useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
  }, [timeRange]);

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "timestamp",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
        ...(dateRange.to
          ? [
              {
                column: "timestamp",
                type: "datetime",
                operator: "<=",
                value: dateRange.to,
              } as const,
            ]
          : []),
      ]
    : [];

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId,
        fromTimestamp: dateRange?.from,
      },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const environmentOptions = React.useMemo(
    () =>
      environmentFilterOptions.data?.map((value) => value.environment) ??
      undefined,
    [environmentFilterOptions.data],
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

  const scoreDeleteMutation = api.scores.deleteMany.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Scores deleted",
        description:
          "Selected scores will be deleted. Scores are removed asynchronously and may continue to be visible for up to 15 minutes.",
      });
    },
    onSettled: () => {
      void utils.scores.all.invalidate();
    },
  });

  const hasTraceDeletionEntitlement = useHasEntitlement("trace-deletion");

  const handleDeleteScores = async ({ projectId }: { projectId: string }) => {
    const selectedScoreIds = Object.keys(selectedRows).filter((scoreId) =>
      scores.data?.scores.map((s) => s.id).includes(scoreId),
    );

    await scoreDeleteMutation.mutateAsync({
      projectId,
      scoreIds: selectedScoreIds,
      query: {
        filter: backendFilterState,
        orderBy: orderByState,
      },
      isBatchAction: selectAll,
    });
    setSelectedRows({});
  };

  const filterOptions = api.scores.filterOptions.useQuery(
    {
      projectId,
      timestampFilter:
        dateRangeFilter.length > 0
          ? (dateRangeFilter as TimeFilter[])
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

  const newFilterOptions = React.useMemo(
    () => ({
      name:
        filterOptions.data?.name?.map((n) => ({
          value: n.value,
          count: n.count !== undefined ? Number(n.count) : undefined,
        })) ?? undefined,
      source: ["ANNOTATION", "API", "EVAL"],
      dataType: ["NUMERIC", "CATEGORICAL", "BOOLEAN"],
      value: [],
      stringValue:
        filterOptions.data?.stringValue?.map((sv) => ({
          value: sv.value,
          count: sv.count !== undefined ? Number(sv.count) : undefined,
        })) ?? undefined,
      traceName:
        filterOptions.data?.traceName?.map((tn) => ({
          value: tn.value,
          count: tn.count !== undefined ? Number(tn.count) : undefined,
        })) ?? undefined,
      userId:
        filterOptions.data?.userId?.map((u) => ({
          value: u.value,
          count: u.count !== undefined ? Number(u.count) : undefined,
        })) ?? undefined,
      tags: filterOptions.data?.tags?.map((t) => t.value) ?? undefined, // tags don't have counts
      environment: environmentOptions,
    }),
    [filterOptions.data, environmentOptions],
  );

  const queryFilter = useSidebarFilterState(
    scoreFilterConfig,
    newFilterOptions,
    projectId,
    filterOptions.isPending || environmentFilterOptions.isPending,
    disableUrlPersistence,
  );

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  const filterState = createFilterState(
    queryFilter.filterState.concat(dateRangeFilter),
    [
      ...(userId ? [{ key: "User ID", value: userId }] : []),
      ...(traceId ? [{ key: "Trace ID", value: traceId }] : []),
      ...(observationId
        ? [{ key: "Observation ID", value: observationId }]
        : []),
    ],
  );

  const backendFilterState = transformFiltersForBackend(
    filterState,
    SCORE_COLUMN_TO_BACKEND_KEY,
    scoreFilterConfig.columnDefinitions,
  );

  const getCountPayload = {
    projectId,
    filter: backendFilterState,
    page: 0,
    limit: 1,
    orderBy: null,
  };

  const getAllPayload = {
    ...getCountPayload,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    orderBy: orderByState,
  };

  const scores = api.scores.all.useQuery(getAllPayload, {
    enabled: !environmentFilterOptions.isLoading,
  });
  const totalScoreCountQuery = api.scores.countAll.useQuery(getCountPayload, {
    enabled: !environmentFilterOptions.isLoading,
  });

  const totalCount = totalScoreCountQuery.data?.totalCount ?? null;

  const { selectActionColumn } = TableSelectionManager<ScoresTableRow>({
    projectId,
    tableName: "scores",
    setSelectedRows,
  });

  const rawColumns: LangfuseColumnDef<ScoresTableRow>[] = [
    selectActionColumn,
    {
      accessorKey: "id",
      id: "id",
      enableColumnFilter: false,
      header: "Score ID",
      size: 100,
      enableSorting: false,
      defaultHidden: true,
      enableHiding: true,
      cell: ({ row }) => {
        const value = row.getValue("id");
        return typeof value === "string" ? (
          <TableIdOrName value={value} />
        ) : undefined;
      },
    },
    {
      accessorKey: "traceName",
      header: "Trace Name",
      id: "traceName",
      enableHiding: true,
      enableSorting: true,
      size: 150,
      cell: ({ row }) => {
        const value = row.getValue("traceName") as ScoresTableRow["traceName"];
        const filter = encodeURIComponent(
          `name;stringOptions;;any of;${value}`,
        );
        return value ? (
          <TableLink
            path={`/project/${projectId}/traces?filter=${value ? filter : ""}`}
            value={value}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "traceId",
      id: "traceId",
      enableColumnFilter: true,
      header: "Trace",
      enableSorting: true,
      size: 100,
      cell: ({ row }) => {
        const value = row.getValue("traceId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/traces/${encodeURIComponent(value)}`}
              value={value}
            />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "executionTraceId",
      id: "executionTraceId",
      header: "Execution Trace",
      enableSorting: false,
      enableHiding: true,
      defaultHidden: true,
      size: 100,
      cell: ({ row }) => {
        const value = row.getValue("executionTraceId");
        return typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(value)}`}
            value={value}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "observationId",
      id: "observationId",
      header: "Observation",
      enableSorting: true,
      size: 100,
      cell: ({ row }) => {
        const observationId = row.getValue(
          "observationId",
        ) as ScoresTableRow["observationId"];
        const traceId = row.getValue("traceId") as ScoresTableRow["traceId"];
        return traceId && observationId ? (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(traceId)}?observation=${encodeURIComponent(observationId)}`}
            value={observationId}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "sessionId",
      header: "Session",
      id: "sessionId",
      enableHiding: true,
      enableSorting: true,
      size: 100,
      cell: ({ row }) => {
        const value = row.getValue("sessionId");
        return typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/sessions/${encodeURIComponent(value)}`}
            value={value}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "environment",
      header: "Environment",
      id: "environment",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value = row.getValue("environment") as string | undefined;
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
      headerTooltip: {
        description: "The user ID associated with the trace.",
        href: "https://langfuse.com/docs/observability/features/users",
      },
      enableHiding: true,
      enableSorting: true,
      size: 100,
      cell: ({ row }) => {
        const value = row.getValue("userId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/users/${encodeURIComponent(value)}`}
              value={value}
            />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      id: "timestamp",
      enableHiding: true,
      enableSorting: true,
      size: 150,
      cell: ({ row }) => {
        const value: ScoresTableRow["timestamp"] = row.getValue("timestamp");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "source",
      header: "Source",
      id: "source",
      enableHiding: true,
      enableSorting: true,
      size: 100,
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      enableHiding: true,
      enableSorting: true,
      size: 150,
    },
    {
      accessorKey: "dataType",
      header: "Data Type",
      id: "dataType",
      enableHiding: true,
      enableSorting: true,
      size: 100,
    },
    {
      accessorKey: "value",
      header: "Value",
      id: "value",
      enableHiding: true,
      enableSorting: true,
      size: 100,
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      size: 400,
      headerTooltip: {
        description: "Add metadata to scores to track additional information.",
        // TODO: docs for metadata on scores
        href: "https://langfuse.com/docs/observability/features/metadata",
      },
      cell: ({ row }) => {
        const scoreId: ScoresTableRow["id"] = row.getValue("id");
        return (
          <ScoresMetadataCell
            scoreId={scoreId}
            projectId={projectId}
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "comment",
      header: "Comment",
      id: "comment",
      enableHiding: true,
      size: 400,
      cell: ({ row }) => {
        const value = row.getValue("comment") as ScoresTableRow["comment"];
        return (
          !!value && <IOTableCell data={value} singleLine={rowHeight === "s"} />
        );
      },
    },
    {
      accessorKey: "author",
      id: "author",
      header: "Author",
      enableHiding: true,
      size: 150,
      cell: ({ row }) => {
        const { userId, name, image } = row.getValue(
          "author",
        ) as ScoresTableRow["author"];
        return (
          <div className="flex items-center space-x-2">
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={image ?? undefined}
                alt={name ?? "User Avatar"}
              />
            </Avatar>
            <span>{name ?? userId}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "jobConfigurationId",
      header: "Eval Configuration ID",
      id: "jobConfigurationId",
      headerTooltip: {
        description: "The Job Configuration ID associated with the trace.",
        href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
      },
      enableHiding: true,
      enableSorting: false,
      size: 150,
      cell: ({ row }) => {
        const value = row.getValue("jobConfigurationId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/evals/${value}`}
              value={value}
            />
          </>
        ) : undefined;
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
        const traceTags: string[] | undefined = row.getValue("traceTags");
        return (
          traceTags && (
            <div
              className={cn(
                "flex gap-x-2 gap-y-1",
                rowHeight !== "s" && "flex-wrap",
              )}
            >
              <TagList selectedTags={traceTags} isLoading={false} viewOnly />
            </div>
          )
        );
      },
    },
  ];

  const tableActions: TableAction[] = [
    ...(hasTraceDeletionEntitlement
      ? [
          {
            id: "score-delete",
            type: BatchActionType.Delete,
            label: "Delete Scores",
            description:
              "This action permanently deletes scores and cannot be undone. Score deletion happens asynchronously and may take up to 15 minutes.",
            accessCheck: {
              scope: "traces:delete",
              entitlement: "trace-deletion",
            },
            execute: handleDeleteScores,
          } as TableAction,
        ]
      : []),
  ];

  const columns = rawColumns.filter(
    (c) => !!c.id && !hiddenColumns.includes(c.id),
  );

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<ScoresTableRow>(
      "scoresColumnVisibility" + localStorageSuffix,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<ScoresTableRow>(
    `scoresColumnOrder${localStorageSuffix}`,
    columns,
  );

  const convertToTableRow = (
    score: RouterOutput["scores"]["all"]["scores"][0],
  ): ScoresTableRow => {
    return {
      id: score.id,
      timestamp: score.timestamp,
      source: score.source,
      name: score.name,
      dataType: score.dataType,
      value:
        isNumericDataType(score.dataType) && isPresent(score.value)
          ? score.value % 1 === 0
            ? String(score.value)
            : score.value.toFixed(4)
          : (score.stringValue ?? ""),
      author: {
        userId: score.authorUserId ?? undefined,
        image: score.authorUserImage ?? undefined,
        name: score.authorUserName ?? undefined,
      },
      comment: score.comment ?? undefined,
      observationId: score.observationId ?? undefined,
      sessionId: score.sessionId ?? undefined,
      traceId: score.traceId ?? undefined,
      traceName: score.traceName ?? undefined,
      userId: score.traceUserId ?? undefined,
      jobConfigurationId: score.jobConfigurationId ?? undefined,
      traceTags: score.traceTags ?? undefined,
      environment: score.environment ?? undefined,
      executionTraceId: score.executionTraceId ?? undefined,
    };
  };

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Scores,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibility,
    },
    validationContext: {
      columns,
      filterColumnDefinition: scoreFilterConfig.columnDefinitions,
    },
    currentFilterState: queryFilter.filterState,
  });

  return (
    <DataTableControlsProvider
      tableName={scoreFilterConfig.tableName}
      defaultSidebarCollapsed={scoreFilterConfig.defaultSidebarCollapsed}
    >
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        <DataTableToolbar
          columns={columns}
          filterState={queryFilter.filterState}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
          columnOrder={columnOrder}
          setColumnOrder={setColumnOrder}
          viewConfig={{
            tableName: TableViewPresetTableName.Scores,
            projectId,
            controllers: viewControllers,
          }}
          actionButtons={[
            Object.keys(selectedRows).filter((scoreId) =>
              scores.data?.scores.map((s) => s.id).includes(scoreId),
            ).length > 0 ? (
              <TableActionMenu
                key="scores-multi-select-actions"
                projectId={projectId}
                actions={tableActions}
                tableName={BatchExportTableName.Scores}
              />
            ) : null,
            <BatchExportTableButton
              {...{ projectId, filterState: backendFilterState, orderByState }}
              tableName={BatchExportTableName.Scores}
              key="batchExport"
            />,
          ]}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          multiSelect={{
            selectAll,
            setSelectAll,
            selectedRowIds: Object.keys(selectedRows).filter((scoreId) =>
              scores.data?.scores.map((s) => s.id).includes(scoreId),
            ),
            setRowSelection: setSelectedRows,
            totalCount,
            ...paginationState,
          }}
        />

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          <DataTableControls queryFilter={queryFilter} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName={"scores"}
              columns={columns}
              noResultsMessage={
                <div className="flex flex-col items-center">
                  <span>No scores found.</span>
                  <a
                    href="https://langfuse.com/faq/all/what-are-scores"
                    className="pointer-events-auto italic text-primary underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    What are scores?
                  </a>
                </div>
              }
              data={
                scores.isPending || isViewLoading
                  ? { isLoading: true, isError: false }
                  : scores.isError
                    ? {
                        isLoading: false,
                        isError: true,
                        error: scores.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: scores.data?.scores.map(convertToTableRow) ?? [],
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
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}

const ScoresMetadataCell = ({
  scoreId,
  projectId,
  singleLine = false,
}: {
  scoreId: string;
  projectId: string;
  singleLine?: boolean;
}) => {
  const score = api.scores.byId.useQuery(
    { scoreId, projectId },
    {
      enabled: typeof scoreId === "string",
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
      isLoading={score.isPending}
      data={score.data?.metadata}
      singleLine={singleLine}
    />
  );
};
