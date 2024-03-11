import { api, directApi } from "@/src/utils/api";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
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
import {
  formatIntervalSeconds,
  intervalInSeconds,
  utcDateOffsetByDays,
} from "@/src/utils/dates";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { JSONView } from "@/src/components/ui/code";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type ObservationLevel } from "@prisma/client";
import { cn } from "@/src/utils/tailwind";
import { LevelColors } from "@/src/components/level-colors";
import { randomIntFromInterval, usdFormatter } from "@/src/utils/numbers";
import {
  exportOptions,
  type ExportFileFormats,
} from "@/src/server/api/interfaces/exportTypes";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import type Decimal from "decimal.js";
import { type ScoreSimplified } from "@/src/server/api/routers/generations/getAllQuery";
import { Skeleton } from "@/src/components/ui/skeleton";
import React from "react";

export type GenerationsTableRow = {
  id: string;
  traceId?: string;
  startTime: Date;
  level?: ObservationLevel;
  statusMessage?: string;
  endTime?: string;
  completionStartTime?: Date;
  latency?: number;
  name?: string;
  model?: string;
  input?: unknown;
  output?: unknown;
  inputCost?: Decimal;
  outputCost?: Decimal;
  totalCost?: Decimal;
  traceName?: string;
  metadata?: string;
  scores?: ScoreSimplified[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  promptId?: string;
  promptName?: string;
  promptVersion?: string;
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

  const filterOptions = api.generations.filterOptions.useQuery(
    {
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const handleExport = async (fileFormat: ExportFileFormats) => {
    if (isExporting) return;

    setIsExporting(true);
    posthog.capture("generations:export", { file_format: fileFormat });
    if (fileFormat === "OPENAI-JSONL")
      alert(
        "When exporting in OpenAI-JSONL, only generations that exactly match the `ChatML` format will be exported. For any questions, reach out to support.",
      );
    try {
      const fileData = await directApi.generations.export.query({
        projectId,
        fileFormat,
        filter: filterState,
        searchQuery,
        orderBy: orderByState,
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
      header: "Name",
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
      cell: ({ row }) => {
        const value: Date = row.getValue("startTime");
        return value.toLocaleString();
      },
    },
    {
      accessorKey: "endTime",
      id: "endTime",
      header: "End Time",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "timeToFirstToken",
      id: "timeToFirstToken",
      header: "Time to First Token",
      enableHiding: true,
      cell: ({ row }) => {
        const startTime: Date = row.getValue("startTime");
        const completionStartTime: Date | undefined =
          row.getValue("timeToFirstToken");

        if (!completionStartTime) {
          return undefined;
        }

        const latencyInSeconds =
          intervalInSeconds(startTime, completionStartTime) || "-";
        return (
          <span>
            {typeof latencyInSeconds === "number"
              ? formatIntervalSeconds(latencyInSeconds)
              : latencyInSeconds}
          </span>
        );
      },
    },
    {
      accessorKey: "scores",
      id: "scores",
      header: "Scores",
      cell: ({ row }) => {
        const values: ScoreSimplified[] | undefined = row.getValue("scores");
        return (
          values && <GroupedScoreBadges scores={values} variant="headings" />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "latency",
      id: "latency",
      header: "Latency",
      cell: ({ row }) => {
        const latency: number | undefined = row.getValue("latency");
        return latency !== undefined ? (
          <span>{formatIntervalSeconds(latency)}</span>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "timePerOutputToken",
      id: "timePerOutputToken",
      header: "Time per Output Token",
      cell: ({ row }) => {
        const latency: number | undefined = row.getValue("latency");
        const usage: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        } = row.getValue("usage");
        return latency !== undefined &&
          (usage.completionTokens !== 0 || usage.totalTokens !== 0) ? (
          <span>
            {usage.completionTokens
              ? formatIntervalSeconds(latency / usage.completionTokens)
              : formatIntervalSeconds(latency / usage.totalTokens)}
          </span>
        ) : undefined;
      },
      defaultHidden: true,
      enableHiding: true,
    },
    {
      accessorKey: "inputCost",
      header: "Input Cost",
      cell: ({ row }) => {
        const value: Decimal | undefined = row.getValue("inputCost");

        return value !== undefined ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "outputCost",
      header: "Output Cost",
      cell: ({ row }) => {
        const value: Decimal | undefined = row.getValue("outputCost");

        return value !== undefined ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "totalCost",
      header: "Total Cost",
      cell: ({ row }) => {
        const value: Decimal | undefined = row.getValue("totalCost");

        return value !== undefined ? (
          <span>{usdFormatter(value.toNumber())}</span>
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
        const observationId: string = row.getValue("id");
        const traceId: string = row.getValue("traceId");
        return (
          <IOCell observationId={observationId} traceId={traceId} io="input" />
        );
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "output",
      header: "Output",
      cell: ({ row }) => {
        const observationId: string = row.getValue("id");
        const traceId: string = row.getValue("traceId");
        return (
          <IOCell observationId={observationId} traceId={traceId} io="output" />
        );
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
    {
      accessorKey: "prompt",
      id: "prompt",
      header: "Prompt",
      enableHiding: true,
      enableSorting: false,
      cell: ({ row }) => {
        const promptName = row.original.promptName;
        const promptVersion = row.original.promptVersion;
        const value = `${promptName} (v${promptVersion})`;
        return (
          promptName &&
          promptVersion && (
            <TableLink
              path={`/project/${projectId}/prompts/${encodeURIComponent(promptName)}?version=${promptVersion}`}
              value={value}
              truncateAt={40}
            />
          )
        );
      },
    },
  ];
  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<GenerationsTableRow>(
      "generationsColumnVisibility",
      columns,
    );

  const smallTableRequired =
    columnVisibility["input"] === true || columnVisibility["output"] === true;

  if (smallTableRequired && paginationState.pageSize !== 10) {
    setPaginationState((prev) => {
      const currentPage = prev.pageIndex;
      const currentPageSize = prev.pageSize;
      const newPageIndex = Math.floor((currentPage * currentPageSize) / 10);
      return { pageIndex: newPageIndex, pageSize: 10 };
    });
  }

  const rows: GenerationsTableRow[] = generations.isSuccess
    ? generations.data.generations.map((generation) => {
        return {
          id: generation.id,
          traceId: generation.traceId ?? undefined,
          traceName: generation.traceName ?? "",
          startTime: generation.startTime,
          endTime: generation.endTime?.toLocaleString() ?? undefined,
          timeToFirstToken: generation.completionStartTime ?? undefined,
          latency: generation.latency ?? undefined,
          totalCost: generation.calculatedTotalCost ?? undefined,
          inputCost: generation.calculatedInputCost ?? undefined,
          outputCost: generation.calculatedOutputCost ?? undefined,
          name: generation.name ?? undefined,
          version: generation.version ?? "",
          model: generation.model ?? "",
          input: generation.input,
          scores: generation.scores,
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
          promptId: generation.promptId ?? undefined,
          promptName: generation.promptName ?? undefined,
          promptVersion: generation.promptVersion ?? undefined,
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
        setColumnVisibility={setColumnVisibilityState}
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
          // enforce a minimum page size of 10 if input or output columns are visible
          options: smallTableRequired ? [10] : undefined,
        }}
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibilityState}
      />
    </div>
  );
}

const IOCell = ({
  traceId,
  observationId,
  io,
}: {
  traceId: string;
  observationId: string;
  io: "input" | "output";
}) => {
  const observation = api.observations.byId.useQuery(
    {
      observationId: observationId,
      traceId: traceId,
    },
    {
      enabled: typeof traceId === "string" && typeof observationId === "string",
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );
  return (
    <>
      {observation.isLoading || !observation.data ? (
        <JsonSkeleton className="h-[250px] w-[500px] px-3 py-1" />
      ) : (
        <JSONView
          json={
            io === "output" ? observation.data.output : observation.data.input
          }
          className="h-[250px] w-[500px] overflow-y-auto"
        />
      )}
    </>
  );
};

export const JsonSkeleton = ({
  className,
  numRows = 10,
}: {
  numRows?: number;
  className?: string;
}) => {
  const sizingOptions = [
    "h-5 w-full",
    "h-5 w-[400px]",
    "h-5 w-[450px]",
    "h-5 w-[475px]",
  ];

  const generateRandomSize = () =>
    sizingOptions[randomIntFromInterval(0, sizingOptions.length - 1)];

  return (
    <div className={cn("w-[500px] rounded-md border", className)}>
      <div className="flex flex-col gap-1">
        {[...Array<number>(numRows)].map((_) => (
          <>
            <Skeleton className={generateRandomSize()} />
          </>
        ))}
        <br />
      </div>
    </div>
  );
};
