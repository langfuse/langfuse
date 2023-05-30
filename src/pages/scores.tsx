import Header from "~/components/layouts/header";

import { api } from "~/utils/api";
import { type ColumnDef } from "@tanstack/react-table";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useState } from "react";
import TableLink from "@/src/components/table/table-link";
import { type RowOptions as TableRowOptions } from "@/src/pages/traces";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type Score } from "@prisma/client";

type RowData = {
  id: string;
  traceId: string;
  timestamp: Date;
  name: string;
  value: number;
  observationId?: string;
};

export type ScoreFilterInput = RouterInput["scores"]["all"];

export default function ScoresPage() {
  const [queryOptions, setQueryOptions] = useState<ScoreFilterInput>({
    traceId: null,
    id: null,
  });

  const scores = api.scores.all.useQuery(queryOptions, {
    refetchInterval: 2000,
  });

  const llmCallOptions = api.llmCalls.availableFilterOptions.useQuery(
    queryOptions,
    { refetchInterval: 2000 }
  );

  const columns: ColumnDef<RowData>[] = [
    {
      accessorKey: "id",
      header: "ID",
      enableColumnFilter: true,
      cell: ({ row }) => {
        const value = row.getValue("id");
        return typeof value === "string" ? (
          <div key=".">...{lastCharacters(value, 7)}</div>
        ) : undefined;
      },
      meta: {
        label: "Id",
        updateFunction: (newValues: string[] | null) => {
          setQueryOptions({ ...queryOptions, id: newValues });
        },
        filter: queryOptions.id,
      },
    },
    {
      accessorKey: "traceId",
      enableColumnFilter: true,
      header: "Trace ID",
      cell: ({ row }) => {
        const value = row.getValue("traceId");
        return typeof value === "string" ? (
          <>
            <TableLink path={`/traces/${value}`} value={value} />
          </>
        ) : undefined;
      },
      meta: {
        label: "TraceID",
        updateFunction: (newValues: string[] | null) => {
          setQueryOptions({ ...queryOptions, traceId: newValues });
        },
        filter: queryOptions.traceId,
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
      accessorKey: "observationId",
      header: "Observation ID",
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

  const tableOptions = llmCallOptions.isLoading
    ? { isLoading: true, isError: false }
    : llmCallOptions.isError
    ? {
        isLoading: false,
        isError: true,
        error: llmCallOptions.error.message,
      }
    : {
        isLoading: false,
        isError: false,
        data: convertToOptions(llmCallOptions.data),
      };

  const convertToTableRow = (score: Score): RowData => {
    return {
      id: score.id,
      timestamp: score.timestamp,
      name: score.name,
      value: score.value,
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
    <div className="container mx-auto py-10">
      <Header title="Scores" live />
      {tableOptions.data ? (
        <div className="my-2">
          <DataTableToolbar
            columnDefs={columns}
            options={tableOptions.data}
            resetFilters={resetFilters}
            isFiltered={isFiltered}
          />
        </div>
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

function lastCharacters(str: string, n: number) {
  return str.substring(str.length - n);
}
