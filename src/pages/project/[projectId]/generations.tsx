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

// TODO Marc
type GenerationTableRow = {
  id: string;
  traceId: string;
  startTime: Date;
  endTime?: Date;
  name?: string;
  // prompt?: string;
  // completion?: string;
  model?: string;
};

export type GenerationFilterInput = Omit<
  RouterInput["generations"]["all"],
  "projectId"
>;

export default function Generations() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [queryOptions, setQueryOptions] = useState<GenerationFilterInput>({
    traceId: null,
    id: null,
  });

  const generations = api.generations.all.useQuery(
    { ...queryOptions, projectId },
    {
      refetchInterval: 5000,
    }
  );

  const generationOptions = api.generations.availableFilterOptions.useQuery(
    { ...queryOptions, projectId },
    { refetchInterval: 5000 }
  );

  const columns: ColumnDef<GenerationTableRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      enableColumnFilter: true,
      cell: ({ row }) => {
        const value = row.getValue("id");
        return typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/generations/${value}`}
            value={value}
          />
        ) : undefined;
      },
      meta: {
        label: "Id",
        filter: {
          type: "select",
          values: queryOptions.id,
          updateFunction: (newValues: string[] | null) => {
            setQueryOptions({ ...queryOptions, id: newValues });
          },
        },
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
        label: "TraceId",
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
    // {
    //   accessorKey: "prompt",
    //   header: "Prompt",
    //   cell: ({ row }) => {
    //     const messages: LLMChatMessages[] = row.getValue("prompt");
    //     if (!messages || messages.length === 0) {
    //       return <>No prompt</>;
    //     }

    //     return <Prompt messages={messages} />;
    //   },
    // },
    // {
    //   accessorKey: "completion",
    //   header: "Completion",
    // },
    {
      accessorKey: "model",
      header: "Model",
    },
  ];

  const convertToOptions = (
    options: RouterOutput["generations"]["availableFilterOptions"]
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

  const rows: GenerationTableRow[] = generations.isSuccess
    ? generations.data.map((generation) => ({
        id: generation.id,
        traceId: generation.traceId,
        startTime: generation.startTime,
        endTime: generation.endTime ?? undefined,
        name: generation.name ?? undefined,
        // prompt: JSON.stringify(generation.prompt),
        // completion: generation.completion ?? undefined,
        model: JSON.stringify(generation.model),
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
          generations.isLoading
            ? { isLoading: true, isError: false }
            : generations.isError
            ? {
                isLoading: false,
                isError: true,
                error: generations.error.message,
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
