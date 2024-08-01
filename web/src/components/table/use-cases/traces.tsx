import { StarTraceToggle } from "@/src/components/star-toggle";
import { DataTable } from "@/src/components/table/data-table";
import { TraceTableMultiSelectAction } from "@/src/components/table/data-table-multi-select-actions/trace-table-multi-select-action";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { TagTracePopover } from "@/src/features/tag/components/TagTracePopver";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import { Checkbox } from "@/src/components/ui/checkbox";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type RouterInput } from "@/src/utils/types";
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
import { LevelColors } from "@/src/components/level-colors";
import { cn } from "@/src/utils/tailwind";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import {
  type FilterState,
  type TraceOptions,
  tracesTableColsWithOptions,
  type ObservationLevel,
} from "@langfuse/shared";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import {
  constructDetailColumns,
  getDetailColumns,
} from "@/src/components/table/utils/scoreDetailColumnHelpers";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";

export type TracesTableRow = {
  bookmarked: boolean;
  id: string;
  timestamp: string;
  name: string;
  userId: string;
  level: ObservationLevel;
  observationCount: number;
  latency?: number;
  release?: string;
  version?: string;
  sessionId?: string;
  // i/o and metadata not set explicitly, but fetched from the server from the cell
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  tags: string[];
  usage: {
    promptTokens: bigint;
    completionTokens: bigint;
    totalTokens: bigint;
  };
  inputCost?: Decimal;
  outputCost?: Decimal;
  totalCost?: Decimal;

  // any number of additional detail columns for individual scores
  [key: string]: unknown; // unknown of type QualitativeAggregate | QuantitativeAggregate for score columns
};

export type TracesTableProps = {
  projectId: string;
  userId?: string;
  omittedFilter?: string[];
};

export type TraceFilterInput = Omit<RouterInput["traces"]["all"], "projectId">;

export default function TracesTable({
  projectId,
  userId,
  omittedFilter = [],
}: TracesTableProps) {
  const utils = api.useUtils();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const { setDetailPageList } = useDetailPageLists();
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange();
  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "traces",
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

  const filterState = userFilterState.concat(userIdFilter, dateRangeFilter);
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const tracesAllQueryFilter = {
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: filterState,
    searchQuery,
    orderBy: orderByState,
  };
  const traces = api.traces.all.useQuery(tracesAllQueryFilter);

  const totalCount = traces.data?.totalCount ?? 0;
  useEffect(() => {
    if (traces.isSuccess) {
      setDetailPageList(
        "traces",
        traces.data.traces.map((t) => t.id),
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
    },
  );

  const scoreNamesList = api.scores.getNamesList.useQuery({
    projectId,
  });

  const transformFilterOptions = (
    traceFilterOptions: TraceOptions | undefined,
  ) => {
    return tracesTableColsWithOptions(traceFilterOptions).filter(
      (c) => !omittedFilter?.includes(c.name),
    );
  };

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("traces", "s");

  const columns: LangfuseColumnDef<TracesTableRow>[] = [
    {
      id: "select",
      accessorKey: "select",
      size: 30,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(value) => {
            table.toggleAllPageRowsSelected(!!value);
            if (!value) {
              setSelectedRows({});
            }
          }}
          aria-label="Select all"
          className="mt-1 opacity-60 data-[state=checked]:mt-[6px] data-[state=indeterminate]:mt-[6px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="mt-1 opacity-60 data-[state=checked]:mt-[5px]"
        />
      ),
    },
    {
      accessorKey: "bookmarked",
      header: undefined,
      id: "bookmarked",
      size: 30,
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
            size="xs"
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
      cell: ({ row }) => {
        const value: TracesTableRow["id"] = row.getValue("id");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/traces/${value}`}
            value={value}
          />
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
          <TableLink
            path={`/project/${projectId}/users/${encodeURIComponent(value)}`}
            value={value}
          />
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
          <TableLink
            path={`/project/${projectId}/sessions/${encodeURIComponent(value)}`}
            value={value}
          />
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
        return value !== undefined ? formatIntervalSeconds(value) : undefined;
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
        return (
          <TokenUsageBadge
            promptTokens={value.promptTokens}
            completionTokens={value.completionTokens}
            totalTokens={value.totalTokens}
            inline
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "inputCost",
      id: "inputCost",
      header: "Input Cost",
      size: 100,
      cell: ({ row }) => {
        const cost: TracesTableRow["inputCost"] = row.getValue("inputCost");
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
      enableSorting: true,
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 400,
      cell: ({ row }) => {
        const traceId: TracesTableRow["id"] = row.getValue("id");
        return (
          <TracesDynamicCell
            traceId={traceId}
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
        return (
          <TracesDynamicCell
            traceId={traceId}
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
        return (
          <TracesDynamicCell
            traceId={traceId}
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
        return (
          <span
            className={cn(
              "rounded-sm p-0.5 text-xs",
              LevelColors[value].bg,
              LevelColors[value].text,
            )}
          >
            {value}
          </span>
        );
      },
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
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
      cell: ({ row }) => {
        const traceId: TracesTableRow["id"] = row.getValue("id");
        return traceId && typeof traceId === "string" ? (
          <DeleteButton
            itemId={traceId}
            projectId={projectId}
            scope="traces:delete"
            invalidateFunc={() => void utils.traces.all.invalidate()}
            type="trace"
            isTableAction={true}
          />
        ) : undefined;
      },
    },
  ];

  const {
    groupedColumns: groupedDetailColumns,
    ungroupedColumns: detailColumns,
  } = useMemo(
    () =>
      constructDetailColumns<TracesTableRow>({
        detailColumnAccessors: scoreNamesList.data?.names ?? [],
      }),
    [scoreNamesList.data?.names],
  );

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<TracesTableRow>(
      `tracesColumnVisibility-${projectId}`,
      scoreNamesList.isLoading ? [] : [...columns, ...detailColumns],
    );

  const rows = useMemo(() => {
    return traces.isSuccess && !scoreNamesList.isLoading
      ? traces.data.traces.map((trace) => {
          const detailColumns = getDetailColumns(
            scoreNamesList.data?.names ?? [],
            trace.scores,
          );

          return {
            bookmarked: trace.bookmarked,
            id: trace.id,
            timestamp: trace.timestamp.toLocaleString(),
            name: trace.name ?? "",
            level: trace.level,
            observationCount: trace.observationCount,
            release: trace.release ?? undefined,
            version: trace.version ?? undefined,
            userId: trace.userId ?? "",
            sessionId: trace.sessionId ?? undefined,
            latency: trace.latency === null ? undefined : trace.latency,
            tags: trace.tags,
            usage: {
              promptTokens: trace.promptTokens,
              completionTokens: trace.completionTokens,
              totalTokens: trace.totalTokens,
            },
            inputCost: trace.calculatedInputCost ?? undefined,
            outputCost: trace.calculatedOutputCost ?? undefined,
            totalCost: trace.calculatedTotalCost ?? undefined,
            ...detailColumns,
          };
        })
      : [];
  }, [traces, scoreNamesList]);

  return (
    <>
      <DataTableToolbar
        columns={[...columns, ...groupedDetailColumns]}
        filterColumnDefinition={transformFilterOptions(traceFilterOptions.data)}
        searchConfig={{
          placeholder: "Search by id, name, user id",
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
        }}
        filterState={userFilterState}
        setFilterState={useDebounce(setUserFilterState)}
        actionButtons={
          Object.keys(selectedRows).filter((traceId) =>
            traces.data?.traces.map((t) => t.id).includes(traceId),
          ).length > 0 ? (
            <TraceTableMultiSelectAction
              // Exclude traces that are not in the current page
              selectedTraceIds={Object.keys(selectedRows).filter((traceId) =>
                traces.data?.traces.map((t) => t.id).includes(traceId),
              )}
              projectId={projectId}
              onDeleteSuccess={() => {
                setSelectedRows({});
              }}
            />
          ) : null
        }
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
      />
      <DataTable
        columns={[...columns, ...detailColumns]}
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
          pageCount: Math.ceil(Number(totalCount) / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        rowSelection={selectedRows}
        setRowSelection={setSelectedRows}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        rowHeight={rowHeight}
      />
    </>
  );
}

const TracesDynamicCell = ({
  traceId,
  col,
  singleLine = false,
}: {
  traceId: string;
  col: "input" | "output" | "metadata";
  singleLine?: boolean;
}) => {
  const trace = api.traces.byId.useQuery(
    { traceId: traceId },
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
