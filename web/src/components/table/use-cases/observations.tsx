import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useMemo } from "react";
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
  type ObservationType,
} from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { LevelColors } from "@/src/components/level-colors";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { observationsTableColsWithOptions } from "@langfuse/shared";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import type Decimal from "decimal.js";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import {
  getScoreGroupColumnProps,
  verifyAndPrefixScoreDataAgainstKeys,
} from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import { type ScoreAggregate } from "@langfuse/shared";
import { useIndividualScoreColumns } from "@/src/features/scores/hooks/useIndividualScoreColumns";
import TagList from "@/src/features/tag/components/TagList";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { useClickhouse } from "@/src/components/layouts/ClickhouseAdminToggle";
import { BreakdownTooltip } from "@/src/components/trace/BreakdownToolTip";
import { InfoIcon, PlusCircle } from "lucide-react";
import { UpsertModelFormDrawer } from "@/src/features/models/components/UpsertModelFormDrawer";
import { ColorCodedObservationType } from "@/src/components/trace/ObservationTree";

export type ObservationsTableRow = {
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
  usageDetails: Record<string, number>;
  costDetails: Record<string, number>;
  promptId?: string;
  promptName?: string;
  promptVersion?: string;
  traceTags?: string[];
};

export type ObservationsTableProps = {
  projectId: string;
  promptName?: string;
  promptVersion?: number;
  modelId?: string;
  omittedFilter?: string[];
};

export default function ObservationsTable({
  projectId,
  promptName,
  promptVersion,
  modelId,
  omittedFilter = [],
}: ObservationsTableProps) {
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
    [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
    ],
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

  const modelIdFilter: FilterState = modelId
    ? [
        {
          column: "Model ID",
          type: "string",
          operator: "=",
          value: modelId,
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
    ...modelIdFilter,
  ]);

  const getCountPayload = {
    projectId,
    filter: filterState,
    searchQuery,
    page: 0,
    limit: 0,
    orderBy: null,
    queryClickhouse: useClickhouse(),
  };

  const getAllPayload = {
    ...getCountPayload,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    orderBy: orderByState,
    queryClickhouse: useClickhouse(),
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
      queryClickhouse: useClickhouse(),
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const { scoreColumns, scoreKeysAndProps, isColumnLoading } =
    useIndividualScoreColumns<ObservationsTableRow>({
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

  const columns: LangfuseColumnDef<ObservationsTableRow>[] = [
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
            path={`/project/${projectId}/traces/${encodeURIComponent(traceId)}?observation=${encodeURIComponent(observationId)}`}
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
      accessorKey: "type",
      id: "type",
      header: "Type",
      size: 100,
      enableSorting: true,
      cell: ({ row }) => {
        const value: ObservationType = row.getValue("type");
        return value ? (
          <ColorCodedObservationType observationType={value} />
        ) : undefined;
      },
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
      accessorKey: "tokensPerSecond",
      id: "tokensPerSecond",
      header: "Tokens per second",
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
            {usage.completionTokens && latency
              ? Number((usage.completionTokens / latency).toFixed(1))
              : undefined}
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
          <BreakdownTooltip details={row.original.costDetails} isCost>
            <div className="flex items-center gap-1">
              <span>{usdFormatter(value.toNumber())}</span>
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
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
      cell: ({ row }) => {
        const model = row.getValue("model") as string;
        const modelId = row.getValue("modelId") as string | undefined;

        if (!model) return null;

        return modelId ? (
          <TableLink
            path={`/project/${projectId}/models/${modelId}`}
            value={model}
          />
        ) : (
          <UpsertModelFormDrawer
            action="create"
            projectId={projectId}
            prefilledModelData={{
              modelName: model,
              prices:
                Object.keys(row.original.usageDetails).length > 0
                  ? Object.keys(row.original.usageDetails)
                      .filter((key) => key != "total")
                      .reduce(
                        (acc, key) => {
                          acc[key] = 0.000001;
                          return acc;
                        },
                        {} as Record<string, number>,
                      )
                  : undefined,
            }}
            className="cursor-pointer"
          >
            <span className="flex items-center gap-1">
              <span>{model}</span>
              <PlusCircle className="h-3 w-3" />
            </span>
          </UpsertModelFormDrawer>
        );
      },
    },

    {
      accessorKey: "modelId",
      id: "modelId",
      header: "Model ID",
      size: 100,
      enableHiding: true,
      defaultHidden: true,
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
          <BreakdownTooltip details={row.original.usageDetails}>
            <div className="flex items-center gap-1">
              <TokenUsageBadge
                promptTokens={value.promptTokens}
                completionTokens={value.completionTokens}
                totalTokens={value.totalTokens}
                inline
              />
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
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
            startTime={row.getValue("startTime")}
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
            startTime={row.getValue("startTime")}
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
            startTime={row.getValue("startTime")}
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
    useColumnVisibility<ObservationsTableRow>(
      `generationsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<ObservationsTableRow>(
    "generationsColumnOrder",
    columns,
  );

  const rows: ObservationsTableRow[] = useMemo(() => {
    return generations.isSuccess
      ? generations.data.generations.map((generation) => {
          return {
            id: generation.id,
            traceId: generation.traceId ?? undefined,
            type: generation.type ?? undefined,
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
            modelId: generation.modelId ?? undefined,
            level: generation.level,
            statusMessage: generation.statusMessage ?? undefined,
            usage: {
              promptTokens: generation.promptTokens,
              completionTokens: generation.completionTokens,
              totalTokens: generation.totalTokens,
            },
            promptId: generation.promptId ?? undefined,
            promptName: generation.promptName ?? undefined,
            promptVersion: generation.promptVersion?.toString() ?? undefined,
            traceTags: generation.traceTags ?? undefined,
            usageDetails: generation.usageDetails ?? {},
            costDetails: generation.costDetails ?? {},
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
          <BatchExportTableButton
            {...{ projectId, filterState, orderByState }}
            tableName={BatchExportTableName.Generations}
            key="batchExport"
          />
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
  startTime,
  col,
  singleLine = false,
}: {
  traceId: string;
  observationId: string;
  projectId: string;
  startTime?: Date;
  col: "input" | "output" | "metadata";
  singleLine: boolean;
}) => {
  const observation = api.observations.byId.useQuery(
    {
      observationId,
      traceId,
      projectId,
      startTime,
      queryClickhouse: useClickhouse(),
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
