import Header from "@/src/components/layouts/header";
import { api, fetchApi } from "@/src/utils/api";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useState } from "react";
import { type TableRowOptions } from "@/src/components/table/types";
import { useRouter } from "next/router";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { ChevronDownIcon } from "lucide-react";
import { type ExportFileFormats } from "@/src/server/api/routers/generations";

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
    name: null,
    model: null,
  });

  const generations = api.generations.all.useQuery({
    ...queryOptions,
    projectId,
  });

  const generationOptions = api.generations.availableFilterOptions.useQuery({
    ...queryOptions,
    projectId,
  });

  const handleExport = async (fileFormat: ExportFileFormats) => {
    const fileData = await fetchApi.generations.export.query({
      ...queryOptions,
      projectId,
      fileFormat,
    });

    if (!fileData) return;

    // create file from string in fileData and apply extension from fileFormat
    const fileTypes = { csv: "text/csv", json: "application/json" } as const;
    const file = new File([fileData], `generations.${fileFormat}`, {
      type: fileTypes[fileFormat],
    });

    // create url from file
    const url = URL.createObjectURL(file);

    // Use a dynamically created anchor element to trigger the download
    const a = document.createElement("a");
    document.body.appendChild(a);
    a.href = url;
    a.download = `generations.${fileFormat}`; // name of the downloaded file
    a.click();
    a.remove();

    // Revoke the blob URL after using it
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

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
      accessorKey: "name",
      enableColumnFilter: true,
      header: "name",
      meta: {
        label: "Name",
        filter: {
          type: "select",
          values: queryOptions.name,
          updateFunction: (newValues: string[] | null) => {
            setQueryOptions({ ...queryOptions, name: newValues });
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
      accessorKey: "model",
      header: "Model",
      enableColumnFilter: true,
      meta: {
        label: "Model",
        filter: {
          type: "select",
          values: queryOptions.model,
          updateFunction: (newValues: string[] | null) => {
            setQueryOptions({ ...queryOptions, model: newValues });
          },
        },
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
      name: null,
      model: null,
    });

  const isFiltered = () =>
    Object.entries(queryOptions).filter(([_k, v]) => v !== null).length > 0;

  return (
    <div>
      <Header title="Generations" />
      {tableOptions.data ? (
        <DataTableToolbar
          columnDefs={columns}
          options={tableOptions.data}
          resetFilters={resetFilters}
          isFiltered={isFiltered}
          actionButtons={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-auto" size="sm">
                  {isFiltered() ? "Export selection" : "Export all"}{" "}
                  <ChevronDownIcon className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(["json", "csv"] as ExportFileFormats[]).map((type) => (
                  <DropdownMenuItem
                    key={type}
                    className="capitalize"
                    onClick={() => void handleExport(type)}
                  >
                    as {type}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
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
