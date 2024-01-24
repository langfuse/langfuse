import { api, directApi } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useState } from "react";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { ChevronDownIcon, Loader } from "lucide-react";
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
import { formatInterval, utcDateOffsetByDays } from "@/src/utils/dates";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { JSONView } from "@/src/components/ui/code";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type ObservationLevel } from "@prisma/client";
import { cn } from "@/src/utils/tailwind";
import { LevelColors } from "@/src/components/level-colors";
import { usdFormatter } from "@/src/utils/numbers";
import {
  exportOptions,
  type ExportFileFormats,
} from "@/src/server/api/interfaces/exportTypes";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";

export type GenerationsTableRow = {
  id: string;
  traceId: string;
  startTime: string;
  level?: ObservationLevel;
  statusMessage?: string;
  endTime?: string;
  latency?: number;
  name?: string;
  model?: string;
  input?: unknown;
  output?: unknown;
  traceName?: string;
  metadata?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type GenerationsTableProps = {
  projectId: string;
};

export default function GenerationsTable({ projectId }: GenerationsTableProps) {
  const posthog = usePostHog();
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

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  const generations = api.generations.all.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: filterState,
    orderBy: orderByState,
    searchQuery,
  });

  const totalCount = generations.data?.totalCount ?? 0;

  const filterOptions = api.generations.filterOptions.useQuery({
    projectId,
  });

  const handleExport = async (fileFormat: ExportFileFormats) => {
    if (isExporting) return;

    setIsExporting(true);
    posthog.capture("generations:export", { file_format: fileFormat });
    try {
      const fileData = await directApi.generations.export.query({
        projectId,
        fileFormat,
        filter: filterState,
        searchQuery,
      });

      let url: string;
      if (fileData.type === "s3") {
        url = fileData.url;
      } else {
        const file = new File([fileData.data], fileData.fileName, {
          type: exportOptions[fileFormat].fileType,
        });

        // create url from file
        url = URL.createObjectURL(file);
      }

      // Use a dynamically created anchor element to trigger the download
      const a = document.createElement("a");
      document.body.appendChild(a);
      a.href = url;
      a.download = fileData.fileName; // name of the downloaded file
      a.click();
      a.remove();

      // Revoke the blob URL after using it
      if (fileData.type === "data") {
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }

      setIsExporting(false);
    } catch (e) {
      console.error(e);
      setIsExporting(false);
    }
  };

  const columns: LangfuseColumnDef<GenerationsTableRow>[] = [
    {
      accessorKey: "id",
      id: "id",
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
      enableSorting: true,
    },
    {
      accessorKey: "name",
      id: "name",
      header: "name",
      enableSorting: true,
    },
    {
      accessorKey: "traceId",
      id: "traceId",
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
      enableSorting: true,
    },
    {
      accessorKey: "traceName",
      id: "traceName",
      header: "Trace Name",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "startTime",
      id: "startTime",
      header: "Start Time",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "latency",
      id: "latency",
      header: "Latency",
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("latency");
        return value !== undefined ? (
          <span>{formatInterval(value)}</span>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "cost",
      header: "Cost",
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("cost");

        return value !== undefined ? (
          <span>{usdFormatter(value)}</span>
        ) : undefined;
      },
      enableHiding: true,
    },
    {
      accessorKey: "level",
      id: "level",
      header: "Level",
      enableHiding: true,
      cell({ row }) {
        const value: ObservationLevel | undefined = row.getValue("level");
        return value ? (
          <span
            className={cn(
              "rounded-sm p-0.5 text-xs",
              LevelColors[value].bg,
              LevelColors[value].text,
            )}
          >
            {value}
          </span>
        ) : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "statusMessage",
      header: "Status Message",
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "model",
      id: "model",
      header: "Model",
      enableHiding: true,
      enableSorting: true,
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
      enableHiding: true,
    },
    {
      accessorKey: "input",
      header: "Input",
      cell: ({ row }) => {
        const value: unknown = row.getValue("input");
        return <JSONView json={value} className="w-[500px]" />;
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "output",
      header: "Output",
      cell: ({ row }) => {
        const value: unknown = row.getValue("output");
        return <JSONView json={value} className="w-[500px] bg-green-50" />;
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      cell: ({ row }) => {
        const values: string | undefined = row.getValue("metadata");
        return <div className="flex flex-wrap gap-x-3 gap-y-1">{values}</div>;
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "version",
      id: "version",
      header: "Version",
      enableHiding: true,
      enableSorting: true,
    },
  ];
  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<GenerationsTableRow>(
      "generationsColumnVisibility",
      columns,
    );

  const rows: GenerationsTableRow[] = generations.isSuccess
    ? generations.data.generations.map((generation) => {
        return {
          id: generation.id,
          traceId: generation.traceId,
          traceName: generation.traceName,
          startTime: generation.startTime.toLocaleString(),
          endTime: generation.endTime?.toLocaleString() ?? undefined,
          latency: generation.latency === null ? undefined : generation.latency,
          cost: generation.calculatedTotalCost,
          name: generation.name ?? undefined,
          version: generation.version ?? "",
          model: generation.model ?? "",
          input: generation.input,
          output: generation.output,
          level: generation.level,
          metadata: generation.metadata
            ? JSON.stringify(generation.metadata)
            : undefined,
          statusMessage: generation.statusMessage ?? undefined,
          usage: {
            promptTokens: generation.promptTokens,
            completionTokens: generation.completionTokens,
            totalTokens: generation.totalTokens,
          },
        };
      })
    : [];

  return (
    <div>
      <DataTableToolbar
        columns={columns}
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
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
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
            : generations.error
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
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />
    </div>
  );
}
