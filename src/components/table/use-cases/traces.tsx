import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { type FilterState } from "@/src/features/filters/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { tracesTableColsWithOptions } from "@/src/server/api/definitions/tracesTable";
import { api } from "@/src/utils/api";
import { utcDateOffsetByDays } from "@/src/utils/dates";
import { type RouterInput, type RouterOutput } from "@/src/utils/types";
import { type Score } from "@prisma/client";
import { type ColumnDef } from "@tanstack/react-table";
import { useEffect } from "react";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  withDefault,
} from "use-query-params";

export type TraceTableRow = {
  id: string;
  timestamp: string;
  name: string;
  userId: string;
  metadata?: string;
  latency?: number;
  release?: string;
  version?: string;
  scores: Score[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type TraceTableProps = {
  projectId: string;
  userId?: string;
  omittedFilter?: string[];
};

export type TraceFilterInput = Omit<RouterInput["traces"]["all"], "projectId">;

export default function TracesTable({
  projectId,
  userId,
  omittedFilter = [],
}: TraceTableProps) {
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

  const traces = api.traces.all.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: filterState,
    searchQuery,
  });
  const totalCount = traces.data?.slice(1)[0]?.totalCount ?? 0;
  useEffect(() => {
    if (traces.isSuccess && traces.data) {
      setDetailPageList(
        "traces",
        traces.data.map((t) => t.id),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traces.isSuccess, traces.data]);

  const traceFilterOptions = api.traces.filterOptions.useQuery({
    projectId,
  });

  const convertToTableRow = (
    trace: RouterOutput["traces"]["all"][0],
  ): TraceTableRow => {
    return {
      id: trace.id,
      timestamp: trace.timestamp.toLocaleString(),
      name: trace.name ?? "",
      metadata: JSON.stringify(trace.metadata),
      release: trace.release ?? undefined,
      version: trace.version ?? undefined,
      userId: trace.userId ?? "",
      scores: trace.scores,
      latency: trace.latency === null ? undefined : trace.latency,
      usage: {
        promptTokens: trace.promptTokens,
        completionTokens: trace.completionTokens,
        totalTokens: trace.totalTokens,
      },
    };
  };

  const columns: ColumnDef<TraceTableRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => {
        const value = row.getValue("id");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/traces/${value}`}
            value={value}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
    },
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "userId",
      enableColumnFilter: !omittedFilter.find((f) => f === "userId"),
      header: "User ID",
      cell: ({ row }) => {
        const value = row.getValue("userId");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/users/${value}`}
            value={value}
            truncateAt={40}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "latency",
      header: "Latency",
      // add seconds to the end of the latency
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("latency");
        return value !== undefined ? `${value.toFixed(2)} sec` : undefined;
      },
    },
    {
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
    },
    {
      accessorKey: "scores",
      header: "Scores",
      enableColumnFilter: !omittedFilter.find((f) => f === "scores"),
      cell: ({ row }) => {
        const values: Score[] = row.getValue("scores");
        return <GroupedScoreBadges scores={values} variant="headings" />;
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      cell: ({ row }) => {
        const values: string = row.getValue("metadata");
        return <div className="flex flex-wrap gap-x-3 gap-y-1">{values}</div>;
      },
    },
    {
      accessorKey: "version",
      header: "Version",
    },
    {
      accessorKey: "release",
      header: "Release",
    },
  ];

  return (
    <div>
      <DataTableToolbar
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
                data: traces.data?.map((t) => convertToTableRow(t)),
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
