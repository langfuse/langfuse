import Header from "@/src/components/layouts/header";
import { api, directApi } from "@/src/utils/api";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useState } from "react";
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
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { observationsTableColsWithOptions } from "@/src/server/api/definitions/observationsTable";
import { utcDateOffsetByDays } from "@/src/utils/dates";

type GenerationTableRow = {
  id: string;
  traceId: string;
  startTime: string;
  endTime?: string;
  latency?: number;
  name?: string;
  model?: string;
  traceName?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

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

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [filterState, setFilterState] = useQueryFilterState([
    {
      column: "start_time",
      type: "datetime",
      operator: ">",
      value: utcDateOffsetByDays(-14),
    },
  ]);

  const generations = api.generations.all.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: filterState,
    searchQuery,
  });
  const totalCount = generations.data?.slice(1)[0]?.totalCount ?? 0;

  const filterOptions = api.generations.filterOptions.useQuery({
    projectId,
  });

  const handleExport = async (fileFormat: ExportFileFormats) => {
    if (isExporting) return;

    setIsExporting(true);
    posthog.capture("generations:export", { file_format: fileFormat });
    const fileData = await directApi.generations.export.query({
      projectId,
      fileFormat,
      filter: filterState,
      searchQuery,
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
      header: "name",
    },
    {
      accessorKey: "traceId",
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
    },
    {
      accessorKey: "traceName",
      header: "Trace Name",
    },
    {
      accessorKey: "startTime",
      header: "Start Time",
    },
    {
      accessorKey: "latency",
      header: "Latency",
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("latency");
        return value !== undefined ? (
          <span>{value.toFixed(2)} sec</span>
        ) : undefined;
      },
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
    {
      accessorKey: "version",
      header: "Version",
    },
  ];

  const rows: GenerationTableRow[] = generations.isSuccess
    ? generations.data.map((generation) => ({
        id: generation.id,
        traceId: generation.traceId,
        traceName: generation.traceName,
        startTime: generation.startTime.toLocaleString(),
        endTime: generation.endTime?.toLocaleString() ?? undefined,
        latency: generation.latency === null ? undefined : generation.latency,
        name: generation.name ?? undefined,
        version: generation.version ?? "",
        model: generation.model ?? "",
        usage: {
          promptTokens: generation.promptTokens,
          completionTokens: generation.completionTokens,
          totalTokens: generation.totalTokens,
        },
      }))
    : [];

  return (
    <div>
      <Header title="Generations" />
      <DataTableToolbar
        filterColumnDefinition={observationsTableColsWithOptions(
          filterOptions.data,
        )}
        filterState={filterState}
        setFilterState={setFilterState}
        searchConfig={{
          placeholder: "Search by id, name, traceName, model",
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
        }}
        actionButtons={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="ml-auto whitespace-nowrap"
                size="sm"
              >
                {filterState.length > 0 || searchQuery
                  ? "Export selection"
                  : "Export all"}{" "}
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
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
    </div>
  );
}
