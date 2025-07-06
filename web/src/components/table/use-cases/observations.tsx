import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useEffect, useMemo } from "react";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { formatIntervalSeconds } from "@/src/utils/dates";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type ObservationLevelType,
  type FilterState,
  type ObservationOptions,
  BatchExportTableName,
  type ObservationType,
  TableViewPresetTableName,
} from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { LevelColors } from "@/src/components/level-colors";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { observationsTableColsWithOptions } from "@langfuse/shared";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { MemoizedIOTableCell } from "@/src/components/ui/CodeJsonViewer";
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
import { BreakdownTooltip } from "@/src/components/trace/BreakdownToolTip";
import { InfoIcon, PlusCircle } from "lucide-react";
import { UpsertModelFormDrawer } from "@/src/features/models/components/UpsertModelFormDrawer";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import {
  useEnvironmentFilter,
  convertSelectedEnvironmentsToFilter,
} from "@/src/hooks/use-environment-filter";
import { Badge } from "@/src/components/ui/badge";
import { type Row } from "@tanstack/react-table";
import TableIdOrName from "@/src/components/table/table-id";
import { ItemBadge } from "@/src/components/ItemBadge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PeekViewObservationDetail } from "@/src/components/table/peek/peek-observation-detail";
import { useObservationPeekState } from "@/src/components/table/peek/hooks/useObservationPeekState";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useObservationPeekNavigation } from "@/src/components/table/peek/hooks/useObservationPeekNavigation";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useRouter } from "next/router";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { type PeekViewProps } from "@/src/components/table/peek/hooks/usePeekView";

export type ObservationsTableRow = {
  // Shown by default
  startTime: Date;
  type: ObservationType;
  name?: string;
  // i/o and metadata not set explicitly, but fetched from the server from the cell
  input?: unknown;
  output?: unknown;
  level?: ObservationLevelType;
  statusMessage?: string;
  latency?: number;
  timeToFirstToken?: number;
  usage: {
    inputUsage: number;
    outputUsage: number;
    totalUsage: number;
  };
  usageDetails: Record<string, number>;
  totalCost?: number;
  costDetails: Record<string, number>;
  model?: string;
  promptName?: string;
  environment?: string;
  traceTags?: string[];
  metadata?: unknown;
  // scores holds grouped column with individual scores
  scores: ScoreAggregate;
  // Hidden by default
  endTime?: Date;
  id: string;
  traceName?: string;
  traceId?: string;
  timestamp?: Date;
  promptId?: string;
  promptVersion?: string;
  completionStartTime?: Date;
  cost: {
    inputCost?: number;
    outputCost?: number;
  };
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
  const router = useRouter();
  const { viewId } = router.query;

  const { setDetailPageList } = useDetailPageLists();

  const { searchQuery, searchType, setSearchQuery, setSearchType } =
    useFullTextSearch();

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "generations",
    "s",
  );

  const [inputFilterState, setInputFilterState] = useQueryFilterState(
    // If the user loads saved table view presets, we should not apply the default type filter
    !viewId
      ? [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION"],
          },
        ]
      : [],
    "generations",
    projectId,
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange(projectId);

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

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      { projectId },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const environmentOptions =
    environmentFilterOptions.data?.map((value) => value.environment) || [];

  const { selectedEnvironments, setSelectedEnvironments } =
    useEnvironmentFilter(environmentOptions, projectId);

  const environmentFilter = convertSelectedEnvironmentsToFilter(
    ["environment", "traceEnvironment"],
    selectedEnvironments,
  );

  const filterState = inputFilterState.concat(
    dateRangeFilter,
    promptNameFilter,
    promptVersionFilter,
    modelIdFilter,
    environmentFilter,
  );

  const getCountPayload = {
    projectId,
    filter: filterState,
    searchQuery,
    searchType,
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
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  useEffect(() => {
    if (generations.isSuccess) {
      setDetailPageList(
        "observations",
        generations.data.generations.map((g) => ({
          id: g.id,
          params: g.traceTimestamp
            ? { timestamp: g.traceTimestamp.toISOString() }
            : undefined,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generations.isSuccess, generations.data]);

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
      accessorKey: "startTime",
      id: "startTime",
      header: "Start Time",
      size: 150,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: Date = row.getValue("startTime");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "type",
      id: "type",
      header: "Type",
      size: 50,
      enableSorting: true,
      cell: ({ row }) => {
        const value: ObservationType = row.getValue("type");
        return value ? (
          <div className="flex items-center gap-1">
            <ItemBadge type={value} />
          </div>
        ) : undefined;
      },
    },
    {
      accessorKey: "name",
      id: "name",
      header: "Name",
      size: 150,
      enableSorting: true,
      cell: ({ row }) => {
        const value: ObservationsTableRow["name"] = row.getValue("name");
        return value ? (
          <span className="truncate" title={value}>
            {value}
          </span>
        ) : undefined;
      },
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
    },
    {
      accessorKey: "level",
      id: "level",
      header: "Level",
      size: 100,
      headerTooltip: {
        description:
          "You can differentiate the importance of observations with the level attribute to control the verbosity of your traces and highlight errors and warnings.",
        href: "https://langfuse.com/docs/tracing-features/log-levels",
      },
      enableHiding: true,
      cell({ row }) {
        const value: ObservationLevelType | undefined = row.getValue("level");
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
      accessorKey: "totalCost",
      header: "Total Cost",
      id: "totalCost",
      size: 120,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("totalCost");

        return value !== undefined ? (
          <BreakdownTooltip details={row.original.costDetails} isCost>
            <div className="flex items-center gap-1">
              <span>{usdFormatter(value)}</span>
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        ) : undefined;
      },
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
    {
      accessorKey: "tokens",
      header: "Tokens",
      id: "tokens",
      size: 150,
      cell: ({ row }) => {
        const value: {
          inputUsage: number;
          outputUsage: number;
          totalUsage: number;
        } = row.getValue("usage");
        return (
          <BreakdownTooltip details={row.original.usageDetails}>
            <div className="flex items-center gap-1">
              <TokenUsageBadge
                inputUsage={value.inputUsage}
                outputUsage={value.outputUsage}
                totalUsage={value.totalUsage}
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
          <TableIdOrName value={model} />
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
        return promptName && promptVersion && <TableIdOrName value={value} />;
      },
    },
    {
      accessorKey: "environment",
      header: "Environment",
      id: "environment",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: ObservationsTableRow["environment"] =
          row.getValue("environment");
        return value ? (
          <Badge
            variant="secondary"
            className="max-w-fit truncate rounded-sm px-1 font-normal"
          >
            {value}
          </Badge>
        ) : null;
      },
    },
    {
      accessorKey: "traceTags",
      id: "traceTags",
      header: "Trace Tags",
      size: 250,
      enableHiding: true,
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
    },
    { ...getScoreGroupColumnProps(isColumnLoading), columns: scoreColumns },
    {
      accessorKey: "endTime",
      id: "endTime",
      header: "End Time",
      size: 150,
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: Date | undefined = row.getValue("endTime");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "id",
      id: "id",
      header: "ObservationID",
      size: 100,
      defaultHidden: true,
      enableSorting: true,
      enableHiding: true,
      cell: ({ row }) => {
        const observationId = row.getValue("id");
        const traceId = row.getValue("traceId");
        return typeof observationId === "string" &&
          typeof traceId === "string" ? (
          <TableIdOrName value={observationId} />
        ) : null;
      },
    },
    {
      accessorKey: "traceName",
      id: "traceName",
      header: "Trace Name",
      size: 150,
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
    },
    {
      accessorKey: "traceId",
      id: "traceId",
      header: "Trace ID",
      size: 100,
      cell: ({ row }) => {
        const value = row.getValue("traceId");
        return typeof value === "string" ? (
          <TableIdOrName value={value} />
        ) : undefined;
      },
      enableSorting: true,
      enableHiding: true,
      defaultHidden: true,
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
      defaultHidden: true,
    },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return generations.isLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: [
        {
          accessorKey: "tokensPerSecond",
          id: "tokensPerSecond",
          header: "Tokens per second",
          size: 200,
          cell: ({ row }: { row: Row<ObservationsTableRow> }) => {
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
          accessorKey: "inputTokens",
          id: "inputTokens",
          header: "Input Tokens",
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting: true,
          cell: ({ row }: { row: Row<ObservationsTableRow> }) => {
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
          cell: ({ row }: { row: Row<ObservationsTableRow> }) => {
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
          cell: ({ row }: { row: Row<ObservationsTableRow> }) => {
            const value: {
              promptTokens: number;
              completionTokens: number;
              totalTokens: number;
            } = row.getValue("usage");
            return <span>{numberFormatter(value.totalTokens, 0)}</span>;
          },
        },
      ],
    },
    {
      accessorKey: "cost",
      header: "Cost",
      id: "cost",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return generations.isLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: [
        {
          accessorKey: "inputCost",
          id: "inputCost",
          header: "Input Cost",
          size: 120,
          cell: ({ row }: { row: Row<ObservationsTableRow> }) => {
            const value: number | undefined = row.getValue("inputCost");

            return value !== undefined ? (
              <span>{usdFormatter(value)}</span>
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
          cell: ({ row }: { row: Row<ObservationsTableRow> }) => {
            const value: number | undefined = row.getValue("outputCost");

            return value !== undefined ? (
              <span>{usdFormatter(value)}</span>
            ) : undefined;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting: true,
        },
      ],
    },
  ];

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<ObservationsTableRow>(
      `observationColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<ObservationsTableRow>(
    `observationsColumnOrder-${projectId}`,
    columns,
  );

  const { getNavigationPath, expandPeek } = useObservationPeekNavigation();
  const { setPeekView } = useObservationPeekState();
  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Observations,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setInputFilterState,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibilityState,
      setSearchQuery: setSearchQuery,
    },
    validationContext: {
      columns,
      filterColumnDefinition: transformFilterOptions(filterOptions.data),
    },
  });

  const peekConfig: PeekViewProps<ObservationsTableRow> = useMemo(
    () => ({
      itemType: "TRACE",
      customTitlePrefix: "Observation ID:",
      listKey: "observations",
      onOpenChange: setPeekView,
      onExpand: expandPeek,
      shouldUpdateRowOnDetailPageNavigation: true,
      getNavigationPath,
      children: (row?: ObservationsTableRow) => (
        <PeekViewObservationDetail projectId={projectId} row={row} />
      ),
      tableDataUpdatedAt: generations.dataUpdatedAt,
    }),
    [
      projectId,
      generations.dataUpdatedAt,
      getNavigationPath,
      expandPeek,
      setPeekView,
    ],
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
            endTime: generation.endTime ?? undefined,
            timeToFirstToken: generation.timeToFirstToken ?? undefined,
            scores: verifyAndPrefixScoreDataAgainstKeys(
              scoreKeysAndProps,
              generation.scores,
            ),
            latency: generation.latency ?? undefined,
            totalCost: generation.totalCost ?? undefined,
            cost: {
              inputCost: generation.inputCost ?? undefined,
              outputCost: generation.outputCost ?? undefined,
            },
            name: generation.name ?? undefined,
            version: generation.version ?? "",
            model: generation.model ?? "",
            modelId: generation.internalModelId ?? undefined,
            level: generation.level,
            statusMessage: generation.statusMessage ?? undefined,
            usage: {
              inputUsage: generation.inputUsage,
              outputUsage: generation.outputUsage,
              totalUsage: generation.totalUsage,
            },
            promptId: generation.promptId ?? undefined,
            promptName: generation.promptName ?? undefined,
            promptVersion: generation.promptVersion?.toString() ?? undefined,
            traceTags: generation.traceTags ?? undefined,
            timestamp: generation.traceTimestamp ?? undefined,
            usageDetails: generation.usageDetails ?? {},
            costDetails: generation.costDetails ?? {},
            environment: generation.environment ?? undefined,
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
          metadataSearchFields: ["ID", "Name", "Trace Name", "Model"],
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
          searchType,
          setSearchType,
          tableAllowsFullTextSearch: true,
        }}
        viewConfig={{
          tableName: TableViewPresetTableName.Observations,
          projectId,
          controllers: viewControllers,
        }}
        columnsWithCustomSelect={["model", "name", "traceName", "promptName"]}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibilityState}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        orderByState={orderByState}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
        actionButtons={
          <BatchExportTableButton
            {...{
              projectId,
              filterState,
              orderByState,
              searchQuery,
              searchType,
            }}
            tableName={BatchExportTableName.Observations}
            key="batchExport"
          />
        }
        environmentFilter={{
          values: selectedEnvironments,
          onValueChange: setSelectedEnvironments,
          options: environmentOptions.map((env) => ({ value: env })),
        }}
      />
      <DataTable
        columns={columns}
        peekView={peekConfig}
        data={
          generations.isLoading || isViewLoading
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
    },
    {
      enabled: typeof traceId === "string" && typeof observationId === "string",
      refetchOnMount: false, // prevents refetching loops
      staleTime: 60 * 1000, // 1 minute
    },
  );

  const data =
    col === "output"
      ? observation.data?.output
      : col === "input"
        ? observation.data?.input
        : observation.data?.metadata;

  return (
    <MemoizedIOTableCell
      isLoading={observation.isLoading}
      data={data}
      className={cn(col === "output" && "bg-accent-light-green")}
      singleLine={singleLine}
    />
  );
};
