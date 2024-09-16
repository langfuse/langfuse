import { api, directApi } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useMemo, useState } from "react";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { formatIntervalSeconds } from "@/src/utils/dates";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type ObservationLevel,
  type FilterState,
  type ObservationOptions,
  BatchExportTableName,
  isCloudPlan,
} from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { LevelColors } from "@/src/components/level-colors";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import {
  exportOptions,
  type BatchExportFileFormat,
  observationsTableColsWithOptions,
} from "@langfuse/shared";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import type Decimal from "decimal.js";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  getScoreGroupColumnProps,
  verifyAndPrefixScoreDataAgainstKeys,
} from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import { type ScoreAggregate } from "@/src/features/scores/lib/types";
import { useIndividualScoreColumns } from "@/src/features/scores/hooks/useIndividualScoreColumns";
import TagList from "@/src/features/tag/components/TagList";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { useOrganizationPlan } from "@/src/features/entitlements/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { ChevronDownIcon, Loader } from "lucide-react";

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
  // scores holds grouped column with individual scores
  scores: ScoreAggregate;
  name?: string;
  model?: string;
  // i/o and metadata not set explicitly, but fetched from the server from the cell
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  inputCost?: Decimal;
  outputCost?: Decimal;
  totalCost?: Decimal;
  traceName?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  promptId?: string;
  promptName?: string;
  promptVersion?: string;
  traceTags?: string[];
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
  const plan = useOrganizationPlan();
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

  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange(projectId);

  const [inputFilterState, setInputFilterState] = useQueryFilterState(
    [],
    "generations",
    projectId,
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

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "Start Time",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
      ]
    : [];

  const filterState = inputFilterState.concat([
    ...dateRangeFilter,
    ...promptNameFilter,
    ...promptVersionFilter,
  ]);

  const getCountPayload = {
    projectId,
    filter: filterState,
    searchQuery,
    page: 0,
    limit: 0,
    orderBy: null,
  };

  const getAllPayload = {
    ...getCountPayload,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    orderBy: orderByState,
  };

  const generations = api.generations.all.useQuery(getAllPayload);
  const totalCountQuery = api.generations.countAll.useQuery(getCountPayload);

  const totalCount = totalCountQuery.data?.totalCount ?? null;

  const startTimeFilter = filterState.find((f) => f.column === "Start Time");
  const filterOptions = api.generations.filterOptions.useQuery(
    {
      projectId,
      startTimeFilter:
        startTimeFilter?.type === "datetime" ? startTimeFilter : undefined,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const { scoreColumns, scoreKeysAndProps, isColumnLoading } =
    useIndividualScoreColumns<GenerationsTableRow>({
      projectId,
      scoreColumnKey: "scores",
      selectedFilterOption: selectedOption,
    });

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
      size: 100,
      isPinned: true,
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
      size: 150,
      enableSorting: true,
    },
    {
      accessorKey: "traceId",
      id: "traceId",
      header: "Trace ID",
      size: 100,
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
      size: 150,
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "startTime",
      id: "startTime",
      header: "Start Time",
      size: 150,
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
      size: 150,
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "timeToFirstToken",
      id: "timeToFirstToken",
      header: "Time to First Token",
      size: 150,
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
    { ...getScoreGroupColumnProps(isColumnLoading), columns: scoreColumns },
    {
      accessorKey: "latency",
      id: "latency",
      header: "Latency",
      size: 100,
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
      size: 200,
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
      size: 120,
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
      size: 120,
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
      size: 120,
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
      size: 100,
      headerTooltip: {
        description:
          "Use You can differentiate the importance of observations with the level attribute to control the verbosity of your traces and highlight errors and warnings.",
        href: "https://langfuse.com/docs/tracing-features/log-levels",
      },
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
      size: 150,
      headerTooltip: {
        description:
          "Use a statusMessage to e.g. provide additional information on a status such as level=ERROR.",
        href: "https://langfuse.com/docs/tracing-features/log-levels",
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "model",
      id: "model",
      header: "Model",
      size: 150,
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "inputTokens",
      id: "inputTokens",
      header: "Input Tokens",
      size: 100,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        } = row.getValue("usage");
        return <span>{numberFormatter(value.promptTokens, 0)}</span>;
      },
    },
    {
      accessorKey: "outputTokens",
      id: "outputTokens",
      header: "Output Tokens",
      size: 100,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        } = row.getValue("usage");
        return <span>{numberFormatter(value.completionTokens, 0)}</span>;
      },
    },
    {
      accessorKey: "totalTokens",
      id: "totalTokens",
      header: "Total Tokens",
      size: 100,
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        } = row.getValue("usage");
        return <span>{numberFormatter(value.totalTokens, 0)}</span>;
      },
    },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
      size: 150,
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
      size: 300,
      cell: ({ row }) => {
        const observationId: string = row.getValue("id");
        const traceId: string = row.getValue("traceId");
        return (
          <GenerationsDynamicCell
            observationId={observationId}
            traceId={traceId}
            projectId={projectId}
            col="input"
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
      size: 300,
      cell: ({ row }) => {
        const observationId: string = row.getValue("id");
        const traceId: string = row.getValue("traceId");
        return (
          <GenerationsDynamicCell
            observationId={observationId}
            traceId={traceId}
            projectId={projectId}
            col="output"
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
      size: 300,
      headerTooltip: {
        description: "Add metadata to traces to track additional information.",
        href: "https://langfuse.com/docs/tracing-features/metadata",
      },
      cell: ({ row }) => {
        const observationId: string = row.getValue("id");
        const traceId: string = row.getValue("traceId");
        return (
          <GenerationsDynamicCell
            observationId={observationId}
            traceId={traceId}
            projectId={projectId}
            col="metadata"
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "version",
      id: "version",
      header: "Version",
      size: 100,
      headerTooltip: {
        description: "Track changes via the version tag.",
        href: "https://langfuse.com/docs/experimentation",
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "promptName",
      id: "promptName",
      header: "Prompt",
      headerTooltip: {
        description: "Link to prompt version in Langfuse prompt management.",
        href: "https://langfuse.com/docs/prompts",
      },
      size: 200,
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
            />
          )
        );
      },
    },
    {
      accessorKey: "traceTags",
      id: "traceTags",
      header: "Trace Tags",
      size: 250,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const traceTags: string[] | undefined = row.getValue("traceTags");
        return (
          traceTags && (
            <div
              className={cn(
                "flex gap-x-2 gap-y-1",
                rowHeight !== "s" && "flex-wrap",
              )}
            >
              <TagList selectedTags={traceTags} isLoading={false} viewOnly />
            </div>
          )
        );
      },
    },
  ];

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<GenerationsTableRow>(
      `generationsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<GenerationsTableRow>(
    "generationsColumnOrder",
    columns,
  );

  const rows: GenerationsTableRow[] = useMemo(() => {
    return generations.isSuccess
      ? generations.data.generations.map((generation) => {
          return {
            id: generation.id,
            traceId: generation.traceId ?? undefined,
            traceName: generation.traceName ?? "",
            startTime: generation.startTime,
            endTime: generation.endTime?.toLocaleString() ?? undefined,
            timeToFirstToken: generation.timeToFirstToken ?? undefined,
            scores: verifyAndPrefixScoreDataAgainstKeys(
              scoreKeysAndProps,
              generation.scores,
            ),
            latency: generation.latency ?? undefined,
            totalCost: generation.calculatedTotalCost ?? undefined,
            inputCost: generation.calculatedInputCost ?? undefined,
            outputCost: generation.calculatedOutputCost ?? undefined,
            name: generation.name ?? undefined,
            version: generation.version ?? "",
            model: generation.model ?? "",
            level: generation.level,
            statusMessage: generation.statusMessage ?? undefined,
            usage: {
              promptTokens: generation.promptTokens,
              completionTokens: generation.completionTokens,
              totalTokens: generation.totalTokens,
            },
            promptId: generation.promptId ?? undefined,
            promptName: generation.promptName ?? undefined,
            promptVersion: generation.promptVersion ?? undefined,
            traceTags: generation.traceTags ?? undefined,
          };
        })
      : [];
  }, [generations, scoreKeysAndProps]);

  return (
    <>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={transformFilterOptions(filterOptions.data)}
        filterState={inputFilterState}
        setFilterState={useDebounce(setInputFilterState)}
        searchConfig={{
          placeholder: "Search by id, name, traceName, model",
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
        }}
        columnsWithCustomSelect={["model", "name", "traceName", "promptName"]}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibilityState}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
        actionButtons={
          plan && isCloudPlan(plan) ? (
            <BatchExportTableButton
              {...{ projectId, filterState, orderByState }}
              tableName={BatchExportTableName.Generations}
              key="batchExport"
            />
          ) : (
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
          )
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
          totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibilityState}
        rowHeight={rowHeight}
      />
    </>
  );
}

const GenerationsDynamicCell = ({
  traceId,
  observationId,
  projectId,
  col,
  singleLine = false,
}: {
  traceId: string;
  observationId: string;
  projectId: string;
  col: "input" | "output" | "metadata";
  singleLine: boolean;
}) => {
  const observation = api.observations.byId.useQuery(
    {
      observationId,
      traceId,
      projectId,
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
        col === "output"
          ? observation.data?.output
          : col === "input"
            ? observation.data?.input
            : observation.data?.metadata
      }
      className={cn(col === "output" && "bg-accent-light-green")}
      singleLine={singleLine}
    />
  );
};
