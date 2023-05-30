import Header from "~/components/layouts/header";
import { api } from "~/utils/api";
import { useRouter } from "next/router";
import { type ColumnDef } from "@tanstack/react-table";
import { type Prisma, type Observation } from "@prisma/client";
import { DataTable } from "@/src/components/data-table";
import { lastCharacters } from "@/src/utils/string";
import TableLink from "@/src/components/table-link";
import { DataTableToolbar } from "@/src/components/data-table-toolbar";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useState } from "react";
import { type TraceRowOptions as TableRowOptions } from "@/src/pages/traces";

type LlmCallTableRow = {
  id: string;
  traceId: string;
  startTime: Date;
  endTime?: Date;
  name: string;
  prompt?: string;
  completion?: string;
  model?: string;
};

export type LlmCallFilterInput = RouterInput["llmCalls"]["all"];

export default function Traces() {
  const [queryOptions, setQueryOptions] = useState<LlmCallFilterInput>({
    traceId: null,
    id: null,
  });

  const llmCalls = api.llmCalls.all.useQuery(queryOptions);
  const llmCallOptions =
    api.llmCalls.availableFilterOptions.useQuery(queryOptions);

  // {
  //   refetchInterval: 1000,
  // }

  const columns: ColumnDef<LlmCallTableRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      enableColumnFilter: true,
      cell: ({ row }) => {
        const value = row.getValue("id");
        return typeof value === "string" ? (
          <>
            <TableLink path={`/llm-calls/${value}`} value={value} />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "traceId",
      header: "Trace ID",
      enableColumnFilter: true,
      cell: ({ row }) => {
        const value = row.getValue("traceId");
        return typeof value === "string" ? (
          <>
            <TableLink path={`/traces/${value}`} value={value} />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "startTime",
      header: "Start Time",
    },
    {
      accessorKey: "endTime",
      header: "End Time",
    },
    {
      accessorKey: "name",
      header: "Name",
      enableColumnFilter: true,
    },
    {
      accessorKey: "prompt",
      header: "Prompt",
      enableColumnFilter: true,
    },
    {
      accessorKey: "completion",
      header: "Completion",
    },
    {
      accessorKey: "model",
      header: "Model",
    },
  ];

  const convertToOptions = (
    options: RouterOutput["llmCalls"]["availableFilterOptions"]
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

  const rows: LlmCallTableRow[] = llmCalls.isSuccess
    ? llmCalls.data.map((llmCall) => ({
        id: llmCall.id,
        traceId: llmCall.traceId,
        startTime: llmCall.startTime,
        endTime: llmCall.endTime ?? undefined,
        name: llmCall.name,
        prompt: llmCall.attributes.prompt,
        completion: llmCall.attributes.completion,
        model: JSON.stringify(llmCall.attributes.model),
      }))
    : [];

  return (
    <div className="container mx-auto py-10">
      <Header title="LLM Calls" live />
      {tableOptions.data ? (
        <div className="mt-2">
          <DataTableToolbar
            columnDefs={columns}
            options={tableOptions.data}
            queryOptions={queryOptions}
            updateQueryOptions={updateQueryOptions}
          />
        </div>
      ) : undefined}
      <DataTable
        columns={columns}
        data={
          llmCalls.isLoading
            ? { isLoading: true, isError: false }
            : llmCalls.isError
            ? {
                isLoading: false,
                isError: true,
                error: llmCalls.error.message,
              }
            : {
                isLoading: false,
                isError: false,
                data: rows,
              }
        }
        options={{ isLoading: true, isError: false }}
      />
    </div>
  );
}
