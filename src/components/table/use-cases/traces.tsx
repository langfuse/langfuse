import { DeleteTrace } from "@/src/components/delete-trace";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { StarTraceToggle } from "@/src/components/star-toggle";
import { DataTable } from "@/src/components/table/data-table";
import { TraceTableMultiSelectAction } from "@/src/components/table/data-table-multi-select-actions/trace-table-multi-select-action";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { TagTracePopver } from "@/src/features/tag/components/TagTracePopver";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import { Checkbox } from "@/src/components/ui/checkbox";
import { JSONView } from "@/src/components/ui/code";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { type FilterState } from "@/src/features/filters/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { tracesTableColsWithOptions } from "@/src/server/api/definitions/tracesTable";
import { api } from "@/src/utils/api";
import { formatInterval, utcDateOffsetByDays } from "@/src/utils/dates";
import { type RouterInput, type RouterOutput } from "@/src/utils/types";
import { type Score } from "@prisma/client";
import { type RowSelectionState } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import type Decimal from "decimal.js";
import { usdFormatter } from "@/src/utils/numbers";

export type TracesTableRow = {
  bookmarked: boolean;
  id: string;
  timestamp: string;
  name: string;
  userId: string;
  metadata?: string;
  latency?: number;
  release?: string;
  version?: string;
  input?: unknown;
  output?: unknown;
  sessionId?: string;
  scores: Score[];
  tags: string[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: Decimal;
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
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const { setDetailPageList } = useDetailPageLists();
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );
  const [userFilterState, setUserFilterState] = useQueryFilterState([
    {
      column: "timestamp",
      type: "datetime",
      operator: ">",
      value: utcDateOffsetByDays(-14),
    },
  ]);
  const [orderByState, setOrderByState] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

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
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );
  const convertToTableRow = (
    trace: RouterOutput["traces"]["all"]["traces"][0],
  ): TracesTableRow => {
    return {
      bookmarked: trace.bookmarked,
      id: trace.id,
      timestamp: trace.timestamp.toLocaleString(),
      name: trace.name ?? "",
      metadata: JSON.stringify(trace.metadata),
      release: trace.release ?? undefined,
      version: trace.version ?? undefined,
      userId: trace.userId ?? "",
      scores: trace.scores,
      sessionId: trace.sessionId ?? undefined,
      input: trace.input,
      output: trace.output,
      latency: trace.latency === null ? undefined : trace.latency,
      tags: trace.tags,
      usage: {
        promptTokens: trace.promptTokens,
        completionTokens: trace.completionTokens,
        totalTokens: trace.totalTokens,
      },
      cost: trace.calculatedTotalCost ?? undefined,
    };
  };

  const columns: LangfuseColumnDef<TracesTableRow>[] = [
    {
      id: "select",
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
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: "bookmarked",
      header: undefined,
      id: "bookmarked",
      cell: ({ row }) => {
        const bookmarked = row.getValue("bookmarked");
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
    },
    {
      accessorKey: "id",
      header: "ID",
      id: "id",
      cell: ({ row }) => {
        const value = row.getValue("id");
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
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      enableHiding: true,
    },
    {
      accessorKey: "userId",
      enableColumnFilter: !omittedFilter.find((f) => f === "userId"),
      header: "User ID",
      id: "userId",
      cell: ({ row }) => {
        const value = row.getValue("userId");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/users/${encodeURIComponent(value)}`}
            value={value}
            truncateAt={40}
          />
        ) : undefined;
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "sessionId",
      enableColumnFilter: !omittedFilter.find((f) => f === "sessionId"),
      header: "Session ID",
      cell: ({ row }) => {
        const value = row.getValue("sessionId");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/sessions/${encodeURIComponent(value)}`}
            value={value}
            truncateAt={40}
          />
        ) : undefined;
      },
      enableHiding: true,
    },
    {
      accessorKey: "latency",
      id: "latency",
      header: "Latency",
      // add seconds to the end of the latency
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("latency");
        return value !== undefined ? formatInterval(value) : undefined;
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      // TODO: Enable Ordering By Usage (not covered by API yet)
      accessorKey: "usage",
      header: "Usage",
      cell: ({ row }) => {
        const value: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        } = row.getValue("usage");
        return (
          <TokenUsageBadge
            promptTokens={value.promptTokens}
            completionTokens={value.completionTokens}
            totalTokens={value.totalTokens}
            inline
          />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "cost",
      id: "cost",
      header: "Cost",
      cell: ({ row }) => {
        const cost: Decimal | undefined = row.getValue("cost");
        return (
          <div>
            {cost ? (
              <span>{usdFormatter(cost.toNumber())}</span>
            ) : (
              <span>Not Available</span>
            )}
          </div>
        );
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "scores",
      id: "scores",
      header: "Scores",
      enableColumnFilter: !omittedFilter.find((f) => f === "scores"),
      cell: ({ row }) => {
        const values: Score[] = row.getValue("scores");
        return <GroupedScoreBadges scores={values} variant="headings" />;
      },
      enableHiding: true,
    },
    {
      accessorKey: "input",
      header: "Input",
      cell: ({ row }) => {
        const value: unknown = row.getValue("input");
        return <JSONView json={value} className="w-[500px]" />;
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "output",
      header: "Output",
      cell: ({ row }) => {
        const value: unknown = row.getValue("output");
        return <JSONView json={value} className="w-[500px] bg-green-50" />;
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      cell: ({ row }) => {
        const values: string = row.getValue("metadata");
        return <div className="flex flex-wrap gap-x-3 gap-y-1">{values}</div>;
      },
      enableHiding: true,
    },
    {
      accessorKey: "version",
      id: "version",
      header: "Version",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "release",
      id: "release",
      header: "Release",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "tags",
      id: "tags",
      header: "Tags",
      cell: ({ row }) => {
        const tags: string[] = row.getValue("tags");
        const traceId: string = row.getValue("id");
        const filterOptionTags = traceFilterOptions.data?.tags ?? [];
        const allTags = filterOptionTags.map((t) => t.value);
        return (
          <TagTracePopver
            tags={tags}
            availableTags={allTags}
            projectId={projectId}
            traceId={traceId}
            tracesFilter={tracesAllQueryFilter}
          />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => {
        const traceId = row.getValue("id");
        return traceId && typeof traceId === "string" ? (
          <DeleteTrace
            traceId={traceId}
            isTableAction={true}
            projectId={projectId}
          />
        ) : undefined;
      },
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<TracesTableRow>("tracesColumnVisibility", columns);

  return (
    <div>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={tracesTableColsWithOptions(
          traceFilterOptions.data,
        )}
        searchConfig={{
          placeholder: "Search by id, name, user id",
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
        }}
        filterState={userFilterState}
        setFilterState={setUserFilterState}
        actionButtons={
          <TraceTableMultiSelectAction
            // Exclude traces that are not in the current page
            selectedTraceIds={Object.keys(selectedRows).filter(
              (traceId) =>
                traces.data?.traces.map((t) => t.id).includes(traceId),
            )}
            projectId={projectId}
            onDeleteSuccess={() => {
              setSelectedRows({});
            }}
          />
        }
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
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
                  data: traces.data.traces.map((t) => convertToTableRow(t)),
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
      />
    </div>
  );
}
