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
import { TokenUsageBadge } from "@/src/components/token-usage-badge";

type GenerationTableRow = {
  id: string;
  traceId: string;
  startTime: string;
  endTime?: string;
  name?: string;
  model?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
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
  });

  const generations = api.generations.all.useQuery({
    ...queryOptions,
    projectId,
  });

  const generationOptions = api.generations.availableFilterOptions.useQuery({
    ...queryOptions,
    projectId,
  });

  const columns: ColumnDef<GenerationTableRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => {
        const observationId = row.getValue("id");
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
    {
      accessorKey: "model",
      header: "Model",
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
  ];

  const convertToOptions = (
    options: RouterOutput["generations"]["availableFilterOptions"],
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
        startTime: generation.startTime.toLocaleString(),
        endTime: generation.endTime?.toLocaleString() ?? undefined,
        name: generation.name ?? undefined,
        model: generation.model ?? "",
        usage: {
          promptTokens: generation.promptTokens,
          completionTokens: generation.completionTokens,
          totalTokens: generation.totalTokens,
        },
      }))
    : [];

  const resetFilters = () =>
    setQueryOptions({
      traceId: null,
    });

  const isFiltered = () => queryOptions.traceId !== null;

  return (
    <div>
      <Header title="Generations" />
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
