import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useState } from "react";
import { type TableRowOptions } from "@/src/components/table/types";
import { useRouter } from "next/router";

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

export type LlmCallFilterInput = Omit<
  RouterInput["llmCalls"]["all"],
  "projectId"
>;

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [queryOptions, setQueryOptions] = useState<LlmCallFilterInput>({
    traceId: null,
    id: null,
  });

  const llmCalls = api.llmCalls.all.useQuery(
    { ...queryOptions, projectId },
    {
      refetchInterval: 5000,
    }
  );

  const llmCallOptions = api.llmCalls.availableFilterOptions.useQuery(
    { ...queryOptions, projectId },
    { refetchInterval: 5000 }
  );

  const columns: ColumnDef<LlmCallTableRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      enableColumnFilter: true,
      cell: ({ row }) => {
        const value = row.getValue("id");
        return typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/llm-calls/${value}`}
            value={value}
          />
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
          <TableLink
            path={`/project/${projectId}/traces/${value}`}
            value={value}
          />
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
    },
    {
      accessorKey: "prompt",
      header: "Prompt",
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

  const resetFilters = () =>
    setQueryOptions({
      id: null,
      traceId: null,
    });

  const isFiltered = () =>
    queryOptions.traceId !== null || queryOptions.id !== null;

  return (
    <div className="container">
      <Header title="LLM Calls" live />
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
