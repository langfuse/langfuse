import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type TableRowOptions } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { type Score } from "@prisma/client";
import { type ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

type RowData = {
  id: string;
  traceId: string;
  timestamp: string;
  name: string;
  value: number;
  comment?: string;
  observationId?: string;
};

export type ScoreFilterInput = Omit<
  RouterInput["scores"]["all"],
  "projectId" | "userId"
>;

export default function ScoresTable({
  projectId,
  userId,
}: {
  projectId: string;
  userId?: string;
}) {
  const [queryOptions, setQueryOptions] = useState<ScoreFilterInput>({
    traceId: null,
  });

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const scores = api.scores.all.useQuery({
    ...queryOptions,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    userId: userId || null,
    projectId,
  });
  const totalCount = scores.data?.slice(1)[0]?.totalCount ?? 0;

  const scoresOptions = api.scores.availableFilterOptions.useQuery({
    ...queryOptions,
    userId: userId || null,
    projectId,
  });

  const columns: ColumnDef<RowData>[] = [
    {
      accessorKey: "traceId",
      enableColumnFilter: true,
      header: "Trace ID",
      cell: ({ row }) => {
        const value = row.getValue("traceId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/traces/${value}`}
              value={value}
            />
          </>
        ) : undefined;
      },
      meta: {
        label: "TraceID",
        filter: {
          type: "select",
          values: queryOptions.traceId,
          updateFunction: (newValues: string[] | null) => {
            setQueryOptions({ ...queryOptions, traceId: newValues });
          },
        },
      },
    },
    {
      accessorKey: "observationId",
      header: "Observation ID",
      cell: ({ row }) => {
        const observationId = row.getValue("observationId");
        const traceId = row.getValue("traceId");
        return typeof observationId === "string" &&
          typeof traceId === "string" ? (
          <TableLink
            path={`/project/${projectId}/traces/${traceId}?observation=${observationId}`}
            value={observationId}
          />
        ) : null;
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
      accessorKey: "value",
      header: "Value",
    },
    {
      accessorKey: "comment",
      header: "Comment",
    },
  ];

  const convertToOptions = (
    options: RouterOutput["scores"]["availableFilterOptions"],
  ): TableRowOptions[] => {
    return options.map((o) => {
      return {
        columnId: o.key,
        options: o.occurrences.map((o) => {
          return { label: o.key, value: o.count._all };
        }),
      };
    });
  };

  const tableOptions = scoresOptions.isLoading
    ? { isLoading: true, isError: false }
    : scoresOptions.isError
    ? {
        isLoading: false,
        isError: true,
        error: scoresOptions.error.message,
      }
    : {
        isLoading: false,
        isError: false,
        data: convertToOptions(scoresOptions.data),
      };

  const convertToTableRow = (score: Score): RowData => {
    return {
      id: score.id,
      timestamp: score.timestamp.toLocaleString(),
      name: score.name,
      value: score.value,
      comment: score.comment ?? undefined,
      observationId: score.observationId ?? undefined,
      traceId: score.traceId,
    };
  };

  const isFiltered = () =>
    Object.entries(queryOptions).filter(([_k, v]) => v !== null).length > 0;

  const resetFilters = () =>
    setQueryOptions({
      traceId: null,
    });

  return (
    <div>
      {tableOptions.data ? (
        <DataTableToolbar
          columnDefs={columns}
          options={tableOptions.data}
          resetFilters={resetFilters}
          isFiltered={isFiltered}
        />
      ) : undefined}
      <DataTable
        columns={columns}
        data={
          scores.isLoading
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
                data: scores.data?.map((t) => convertToTableRow(t)),
              }
        }
        options={{ isLoading: true, isError: false }}
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
    </div>
  );
}
