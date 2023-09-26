import Header from "@/src/components/layouts/header";
import { api, directApi } from "@/src/utils/api";
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
import { ChevronDownIcon, Loader } from "lucide-react";
import { type ExportFileFormats } from "@/src/server/api/routers/generations";
import { usePostHog } from "posthog-js/react";
import {
  DelimitedArrayParam,
  NumberParam,
  StringParam,
  useQueryParams,
  withDefault,
} from "use-query-params";

type GenerationTableRow = {
  id: string;
  traceId: string;
  startTime: string;
  endTime?: string;
  name?: string;
  model?: string;
  traceName?: string;
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

const exportOptions: Record<
  ExportFileFormats,
  {
    label: string;
    extension: string;
    fileType: string;
  }
> = {
  CSV: { label: "CSV", extension: "csv", fileType: "text/csv" },
  JSON: { label: "JSON", extension: "json", fileType: "application/json" },
  "OPENAI-JSONL": {
    label: "OpenAI JSONL (fine-tuning)",
    extension: "jsonl",
    fileType: "application/json",
  },
} as const;

export default function Generations() {
  const posthog = usePostHog();
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [isExporting, setIsExporting] = useState(false);

  const [rawQueryOptions, setQueryOptions] = useQueryParams({
    traceId: withDefault(DelimitedArrayParam, null),
    name: withDefault(DelimitedArrayParam, null),
    model: withDefault(DelimitedArrayParam, null),
    traceName: withDefault(DelimitedArrayParam, null),
    searchQuery: withDefault(StringParam, ""),
  });
  // Fix typings of useQueryParams
  const queryOptions: GenerationFilterInput & { searchQuery: string } = {
    traceId: rawQueryOptions.traceId as string[] | null,
    name: rawQueryOptions.name as string[] | null,
    model: rawQueryOptions.model as string[] | null,
    traceName: rawQueryOptions.traceName as string[] | null,
    searchQuery: rawQueryOptions.searchQuery,
  };

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const generations = api.generations.all.useQuery({
    ...queryOptions,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
  });
  const totalCount = generations.data?.slice(1)[0]?.totalCount ?? 0;

  const generationOptions = api.generations.availableFilterOptions.useQuery({
    ...queryOptions,
    projectId,
  });

  const handleExport = async (fileFormat: ExportFileFormats) => {
    if (isExporting) return;

    setIsExporting(true);
    posthog.capture("generations:export", { file_format: fileFormat });
    const fileData = await directApi.generations.export.query({
      ...queryOptions,
      projectId,
      fileFormat,
    });

    if (fileData) {
      const file = new File(
        [fileData],
        `generations.${exportOptions[fileFormat].extension}`,
        {
          type: exportOptions[fileFormat].fileType,
        },
      );

      // create url from file
      const url = URL.createObjectURL(file);

      // Use a dynamically created anchor element to trigger the download
      const a = document.createElement("a");
      document.body.appendChild(a);
      a.href = url;
      a.download = `generations.${exportOptions[fileFormat].extension}`; // name of the downloaded file
      a.click();
      a.remove();

      // Revoke the blob URL after using it
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    setIsExporting(false);
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
      accessorKey: "traceName",
      enableColumnFilter: true,
      header: "Trace Name",
      meta: {
        label: "TraceName",
        filter: {
          type: "select",
          values: queryOptions.traceName,
          updateFunction: (newValues: string[] | null) => {
            setQueryOptions({ ...queryOptions, traceName: newValues });
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
          return { label: o.key, value: o.count };
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
        traceName: generation.traceName,
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
      traceName: null,
    });

  const isFiltered = () =>
    Object.entries(queryOptions).filter(
      ([k, v]) => k !== "searchQuery" && v !== null,
    ).length > 0;

  return (
    <div>
      <Header title="Generations" />
      {tableOptions.data ? (
        <DataTableToolbar
          columnDefs={columns}
          options={tableOptions.data}
          resetFilters={resetFilters}
          isFiltered={isFiltered}
          searchConfig={{
            placeholder: "Search by id, name, traceName, model",
            updateQuery: (newQuery) =>
              setQueryOptions({ searchQuery: newQuery }),
            currentQuery: queryOptions.searchQuery,
          }}
          actionButtons={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="ml-auto whitespace-nowrap"
                  size="sm"
                >
                  {isFiltered() ? "Export selection" : "Export all"}{" "}
                  {isExporting ? (
                    <Loader className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronDownIcon className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Object.entries(exportOptions).map(([key, options]) => (
                  <DropdownMenuItem
                    key={key}
                    className="capitalize"
                    onClick={() => void handleExport(key as ExportFileFormats)}
                  >
                    as {options.label}
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
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
    </div>
  );
}
