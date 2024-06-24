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
import {
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { formatIntervalSeconds, utcDateOffsetByDays } from "@/src/utils/dates";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type Prisma,
  type ObservationLevel,
  type FilterState,
  type ObservationOptions,
} from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { LevelColors } from "@/src/components/level-colors";
import { usdFormatter } from "@/src/utils/numbers";
import {
  exportOptions,
  type BatchExportFileFormat,
  observationsTableColsWithOptions,
} from "@langfuse/shared";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import type Decimal from "decimal.js";
import { type ScoreSimplified } from "@/src/server/api/routers/generations/getAllQuery";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useLookBackDays } from "@/src/hooks/useLookBackDays";

export type GenerationsTableRow = {
  id: string;
  traceId?: string;
  startTime: Date;
  level?: ObservationLevel;
  statusMessage?: string;
  endTime?: string;
  completionStartTime?: Date;
  latency?: number;
  timeToFirstToken?: number;
  name?: string;
  model?: string;
  // i/o not set explicitly, but fetched from the server from the cell
  input?: unknown;
  output?: unknown;
  inputCost?: Decimal;
  outputCost?: Decimal;
  totalCost?: Decimal;
  traceName?: string;
  metadata?: Prisma.JsonValue;
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
  promptName?: string;
  promptVersion?: number;
  omittedFilter?: string[];
};

export default function GenerationsTable({
  projectId,
  promptName,
  promptVersion,
  omittedFilter = [],
}: GenerationsTableProps) {
  const capture = usePostHogClientCapture();
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "generations",
    "s",
  );

  const [inputFilterState, setInputFilterState] = useQueryFilterState(
    [
      {
        column: "Start Time",
        type: "datetime",
        operator: ">",
        value: utcDateOffsetByDays(-useLookBackDays(projectId)),
      },
    ],
    "generations",
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  const promptNameFilter: FilterState = promptName
    ? [
        {
          column: "Prompt Name",
          type: "string",
          operator: "=",
          value: promptName,
        },
      ]
    : [];

  const promptVersionFilter: FilterState = promptVersion
    ? [
        {
          column: "Prompt Version",
          type: "number",
          operator: "=",
          value: promptVersion,
        },
      ]
    : [];

  const filterState = inputFilterState.concat([
    ...promptNameFilter,
    ...promptVersionFilter,
  ]);

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

  const transformFilterOptions = (
    filterOptions: ObservationOptions | undefined,
  ) => {
    return observationsTableColsWithOptions(filterOptions).filter(
      (col) => !omittedFilter?.includes(col.name),
    );
  };

  const handleExport = async (fileFormat: BatchExportFileFormat) => {
    if (isExporting) return;

    setIsExporting(true);
    capture("generations:export", { file_format: fileFormat });
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
      enableSorting: true,
      cell: ({ row }) => {
        const timeToFirstToken: number | undefined =
          row.getValue("timeToFirstToken");

        return (
          <span>
            {timeToFirstToken ? formatIntervalSeconds(timeToFirstToken) : "-"}
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
      enableSorting: true,
    },
    {
      accessorKey: "inputCost",
      id: "inputCost",
      header: "Input Cost",
      cell: ({ row }) => {
        const value: Decimal | undefined = row.getValue("inputCost");

        return value !== undefined ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
    },
    {
      accessorKey: "outputCost",
      id: "outputCost",
      header: "Output Cost",
      cell: ({ row }) => {
        const value: Decimal | undefined = row.getValue("outputCost");

        return value !== undefined ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
    },
    {
      accessorKey: "totalCost",
      header: "Total Cost",
      id: "totalCost",
      cell: ({ row }) => {
        const value: Decimal | undefined = row.getValue("totalCost");

        return value !== undefined ? (
          <span>{usdFormatter(value.toNumber())}</span>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting: true,
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
      id: "statusMessage",
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
      accessorKey: "inputTokens",
      id: "inputTokens",
      header: "Input Tokens",
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        } = row.getValue("usage");
        return <span>{value.promptTokens}</span>;
      },
    },
    {
      accessorKey: "outputTokens",
      id: "outputTokens",
      header: "Output Tokens",
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        } = row.getValue("usage");
        return <span>{value.completionTokens}</span>;
      },
    },
    {
      accessorKey: "totalTokens",
      id: "totalTokens",
      header: "Total Tokens",
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        } = row.getValue("usage");
        return <span>{value.totalTokens}</span>;
      },
    },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
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
      enableSorting: true,
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      cell: ({ row }) => {
        const observationId: string = row.getValue("id");
        const traceId: string = row.getValue("traceId");
        return (
          <GenerationsIOCell
            observationId={observationId}
            traceId={traceId}
            io="input"
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "output",
      id: "output",
      header: "Output",
      cell: ({ row }) => {
        const observationId: string = row.getValue("id");
        const traceId: string = row.getValue("traceId");
        return (
          <GenerationsIOCell
            observationId={observationId}
            traceId={traceId}
            io="output"
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      cell: ({ row }) => {
        const values = row.getValue(
          "metadata",
        ) as GenerationsTableRow["metadata"];
        return !!values ? (
          <IOTableCell data={values} singleLine={rowHeight === "s"} />
        ) : null;
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
      accessorKey: "promptName",
      id: "promptName",
      header: "Prompt",
      enableHiding: true,
      enableSorting: true,
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

  const rows: GenerationsTableRow[] = generations.isSuccess
    ? generations.data.generations.map((generation) => {
        return {
          id: generation.id,
          traceId: generation.traceId ?? undefined,
          traceName: generation.traceName ?? "",
          startTime: generation.startTime,
          endTime: generation.endTime?.toLocaleString() ?? undefined,
          timeToFirstToken: generation.timeToFirstToken ?? undefined,
          latency: generation.latency ?? undefined,
          totalCost: generation.calculatedTotalCost ?? undefined,
          inputCost: generation.calculatedInputCost ?? undefined,
          outputCost: generation.calculatedOutputCost ?? undefined,
          name: generation.name ?? undefined,
          version: generation.version ?? "",
          model: generation.model ?? "",
          scores: generation.scores,
          level: generation.level,
          metadata: generation.metadata,
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
    <>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={transformFilterOptions(filterOptions.data)}
        filterState={inputFilterState}
        setFilterState={setInputFilterState}
        searchConfig={{
          placeholder: "Search by id, name, traceName, model",
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
        }}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibilityState}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        actionButtons={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto whitespace-nowrap">
                <span className="hidden @6xl:inline">
                  {filterState.length > 0 || searchQuery
                    ? "Export selection"
                    : "Export all"}{" "}
                </span>
                <span className="@6xl:hidden">Export</span>
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
                  onClick={() =>
                    void handleExport(key as BatchExportFileFormat)
                  }
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
        onColumnVisibilityChange={setColumnVisibilityState}
        rowHeight={rowHeight}
      />
    </>
  );
}

const GenerationsIOCell = ({
  traceId,
  observationId,
  io,
  singleLine = false,
}: {
  traceId: string;
  observationId: string;
  io: "input" | "output";
  singleLine: boolean;
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
      refetchOnMount: false, // prevents refetching loops
    },
  );
  return (
    <IOTableCell
      isLoading={observation.isLoading}
      data={
        io === "output" ? observation.data?.output : observation.data?.input
      }
      className={cn(io === "output" && "bg-accent-light-green")}
      singleLine={singleLine}
    />
  );
};
