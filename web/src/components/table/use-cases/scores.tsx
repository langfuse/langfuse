import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { Avatar, AvatarImage } from "@/src/components/ui/avatar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { isNumericDataType } from "@/src/features/scores/lib/helpers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import {
  type ScoreOptions,
  scoresTableColsWithOptions,
} from "@/src/server/api/definitions/scoresTable";
import { api } from "@/src/utils/api";

import type { RouterOutput } from "@/src/utils/types";
import {
  isPresent,
  type FilterState,
  type ScoreDataType,
  BatchExportTableName,
  BatchActionType,
  TableViewPresetTableName,
} from "@langfuse/shared";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import TagList from "@/src/features/tag/components/TagList";
import { cn } from "@/src/utils/tailwind";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import {
  useEnvironmentFilter,
  convertSelectedEnvironmentsToFilter,
} from "@/src/hooks/use-environment-filter";
import { Badge } from "@/src/components/ui/badge";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import React, { useState } from "react";
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
  dataType: ScoreDataType;
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
  omittedFilter = [],
  hiddenColumns = [],
  localStorageSuffix = "",
}: {
  projectId: string;
  userId?: string;
  traceId?: string;
  observationId?: string;
  omittedFilter?: string[];
  hiddenColumns?: string[];
  localStorageSuffix?: string;
}) {
  const utils = api.useUtils();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const { selectAll, setSelectAll } = useSelectAll(projectId, "scores");

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("scores", "s");
  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange(projectId);

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "scores",
    projectId,
  );

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

  const filterState = createFilterState(
    userFilterState.concat(dateRangeFilter, environmentFilter),
    [
      ...(userId ? [{ key: "User ID", value: userId }] : []),
      ...(traceId ? [{ key: "Trace ID", value: traceId }] : []),
      ...(observationId
        ? [{ key: "Observation ID", value: observationId }]
        : []),
    ],
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

  const getCountPayload = {
    projectId,
    filter: filterState,
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

  const scores = api.scores.all.useQuery(getAllPayload);
  const totalScoreCountQuery = api.scores.countAll.useQuery(getCountPayload);
  const totalCount = totalScoreCountQuery.data?.totalCount ?? null;

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
        filter: filterState,
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
        href: "https://langfuse.com/docs/tracing-features/users",
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
        href: "https://langfuse.com/docs/tracing-features/metadata",
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
        href: "https://langfuse.com/docs/scores/model-based-evals",
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
    };
  };

  const transformFilterOptions = (
    traceFilterOptions: ScoreOptions | undefined,
  ) => {
    return scoresTableColsWithOptions(traceFilterOptions).filter(
      (c) => !omittedFilter?.includes(c.name) && !hiddenColumns.includes(c.id),
    );
  };

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Scores,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setUserFilterState,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibility,
    },
    validationContext: {
      columns,
      filterColumnDefinition: transformFilterOptions(filterOptions.data),
    },
  });

  return (
    <>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={transformFilterOptions(filterOptions.data)}
        filterState={userFilterState}
        setFilterState={useDebounce(setUserFilterState)}
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
            {...{ projectId, filterState, orderByState }}
            tableName={BatchExportTableName.Scores}
            key="batchExport"
          />,
        ]}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
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
        environmentFilter={{
          values: selectedEnvironments,
          onValueChange: setSelectedEnvironments,
          options: environmentOptions.map((env) => ({ value: env })),
        }}
      />
      <DataTable
        columns={columns}
        data={
          scores.isLoading || isViewLoading
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
    </>
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
      isLoading={score.isLoading}
      data={score.data?.metadata}
      singleLine={singleLine}
    />
  );
};
