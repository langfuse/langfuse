import Header from "@/src/components/layouts/header";

import { api } from "@/src/utils/api";
import { type ColumnDef } from "@tanstack/react-table";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useState } from "react";
import TableLink from "@/src/components/table/table-link";
import { type TableRowOptions } from "@/src/components/table/types";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type Score } from "@prisma/client";
import { useRouter } from "next/router";

type RowData = {
  id: string;
  traceId: string;
  timestamp: string;
  name: string;
  value: number;
  comment?: string;
  observationId?: string;
};

export type ScoreFilterInput = Omit<RouterInput["scores"]["all"], "projectId">;

export default function ScoresPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [queryOptions, setQueryOptions] = useState<ScoreFilterInput>({
    traceId: null,
    id: null,
  });

  const scores = api.scores.all.useQuery({
    ...queryOptions,
    projectId,
  });

  const generationOptions = api.generations.availableFilterOptions.useQuery({
    ...queryOptions,
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
    options: RouterOutput["scores"]["availableFilterOptions"]
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

  const tableOptions = generationOptions.isLoading
    ? { isLoading: true, isError: false }
    : generationOptions.isError
    ? {
        isLoading: false,
        isError: true,
        error: generationOptions.error.message,
      }
    : {
        isLoading: false,
        isError: false,
        data: convertToOptions(generationOptions.data),
      };

  const convertToTableRow = (score: Score): RowData => {
    return {
      id: score.id,
      timestamp: score.timestamp.toISOString(),
      name: score.name,
      value: score.value,
      comment: score.comment ?? undefined,
      observationId: score.observationId ?? undefined,
      traceId: score.traceId,
    };
  };

  const isFiltered = () =>
    queryOptions.traceId !== null || queryOptions.id !== null;

  const resetFilters = () =>
    setQueryOptions({
      id: null,
      traceId: null,
    });

  return (
    <div className="container">
      <Header title="Scores" />
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
      />
    </div>
  );
}
