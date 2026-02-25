import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  observationFilterConfig,
  OBSERVATION_COLUMN_TO_BACKEND_KEY,
} from "@/src/features/filters/config/observations-config";
import { transformFiltersForBackend } from "@/src/features/filters/lib/filter-transform";
import { formatIntervalSeconds } from "@/src/utils/dates";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type ObservationLevelType,
  type FilterState,
  BatchExportTableName,
  type ObservationType,
  TableViewPresetTableName,
  AnnotationQueueObjectType,
  BatchActionType,
  ActionId,
  type TimeFilter,
} from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { LevelColors } from "@/src/components/level-colors";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { MemoizedIOTableCell } from "../../ui/IOTableCell";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import {
  toAbsoluteTimeRange,
  type TableDateRange,
} from "@/src/utils/date-range-utils";
import { type ScoreAggregate } from "@langfuse/shared";
import TagList from "@/src/features/tag/components/TagList";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import {
  BreakdownTooltip,
  calculateAggregatedUsage,
} from "@/src/components/trace2/components/_shared/BreakdownToolTip";
import { InfoIcon, PlusCircle } from "lucide-react";
import { UpsertModelFormDialog } from "@/src/features/models/components/UpsertModelFormDialog";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Badge } from "@/src/components/ui/badge";
import { type RowSelectionState, type Row } from "@tanstack/react-table";
import TableIdOrName from "@/src/components/table/table-id";
import { ItemBadge } from "@/src/components/ItemBadge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PeekViewObservationDetail } from "@/src/components/table/peek/peek-observation-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useRouter } from "next/router";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type TableAction } from "@/src/features/table/types";
import {
  type DataTablePeekViewProps,
  TablePeekView,
} from "@/src/components/table/peek";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import { AddObservationsToDatasetDialog } from "@/src/features/batch-actions/components/AddObservationsToDatasetDialog/index";
import useSessionStorage from "@/src/components/useSessionStorage";
import {
  type RefreshInterval,
  REFRESH_INTERVALS,
} from "@/src/components/table/data-table-refresh-button";

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
  usagePricingTierName?: string | null;
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
  toolDefinitions?: number;
  toolCalls?: number;
};

export type ObservationsTableProps = {
  projectId: string;
  promptName?: string;
  promptVersion?: number;
  modelId?: string;
  omittedFilter?: string[];
  // External control props for embedded preview tables
  hideControls?: boolean;
  externalFilterState?: FilterState;
  externalDateRange?: TableDateRange;
  limitRows?: number;
};

export default function ObservationsTable({
  projectId,
  promptName,
  promptVersion,
  modelId,
  hideControls = false,
  externalFilterState,
  externalDateRange,
  limitRows,
}: ObservationsTableProps) {
  const router = useRouter();
  const { viewId } = router.query;
  const utils = api.useUtils();

  const { setDetailPageList } = useDetailPageLists();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const [rawRefreshInterval, setRawRefreshInterval] =
    useSessionStorage<RefreshInterval>(
      `tableRefreshInterval-${projectId}`,
      null,
    );

  // Validate session storage value against allowed intervals to prevent too small intervals
  const allowedValues = REFRESH_INTERVALS.map((i) => i.value);
  const refreshInterval = allowedValues.includes(rawRefreshInterval)
    ? rawRefreshInterval
    : null;
  const setRefreshInterval = useCallback(
    (value: RefreshInterval) => {
      if (allowedValues.includes(value)) {
        setRawRefreshInterval(value);
      }
    },
    [allowedValues, setRawRefreshInterval],
  );

  const [refreshTick, setRefreshTick] = useState(0);
  const [manualRefreshTrigger, setManualRefreshTrigger] = useState(0); // resets the interval when manual refresh is called

  // Auto-increment refresh tick to force date range recalculation
  useEffect(() => {
    if (!refreshInterval) return;
    const id = setInterval(() => {
      setRefreshTick((t) => t + 1);
    }, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval, manualRefreshTrigger]);

  const handleRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
    setManualRefreshTrigger((t) => t + 1);
    void Promise.all([
      utils.generations.all.invalidate(),
      utils.generations.countAll.invalidate(),
      utils.generations.filterOptions.invalidate(),
      utils.projects.environmentFilterOptions.invalidate(),
    ]);
  }, [utils]);
  const { searchQuery, searchType, setSearchQuery, setSearchType } =
    useFullTextSearch();

  const { selectAll, setSelectAll } = useSelectAll(projectId, "observations");
  const [showAddToDatasetDialog, setShowAddToDatasetDialog] = useState(false);

  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });

  const [storedRowHeight, setRowHeight] = useRowHeightLocalStorage(
    "generations",
    "s",
  );
  const rowHeight = hideControls ? "s" : storedRowHeight;

  const [inputFilterState] = useQueryFilterState(
    // If the user loads saved table view presets, we should not apply the default type filter
    !viewId
      ? [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: [
              "GENERATION",
              "AGENT",
              "TOOL",
              "CHAIN",
              "RETRIEVER",
              "EVALUATOR",
              "EMBEDDING",
              "GUARDRAIL",
            ],
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

  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Convert timeRange to absolute date range for compatibility
  // refreshTick forces recalculation on each refresh cycle
  const tableDateRange = useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, refreshTick]);

  const dateRange = externalDateRange ?? tableDateRange;

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
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
        ...(dateRange.to
          ? [
              {
                column: "startTime",
                type: "datetime",
                operator: "<=",
                value: dateRange.to,
              } as const,
            ]
          : []),
      ]
    : [];

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId,
        fromTimestamp: dateRange?.from,
      },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const oldFilterState = inputFilterState.concat(
    dateRangeFilter,
    promptNameFilter,
    promptVersionFilter,
    modelIdFilter,
  );

  const startTimeFilters = oldFilterState.filter(
    (f) =>
      (f.column === "Start Time" || f.column === "startTime") &&
      f.type === "datetime",
  ) as TimeFilter[];
  const filterOptions = api.generations.filterOptions.useQuery(
    {
      projectId,
      startTimeFilter:
        startTimeFilters.length > 0 ? startTimeFilters : undefined,
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

  const newFilterOptions = useMemo(() => {
    const scoreCategories =
      filterOptions.data?.score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;

    const scoresNumeric = filterOptions.data?.scores_avg ?? undefined;

    return {
      environment:
        environmentFilterOptions.data?.map((value) => value.environment) ??
        undefined,
      name:
        filterOptions.data?.name?.map((n) => ({
          value: n.value,
          count: n.count !== undefined ? Number(n.count) : undefined,
        })) ?? undefined,
      type:
        filterOptions.data?.type?.map((t) => ({
          value: t.value,
          count: t.count !== undefined ? Number(t.count) : undefined,
        })) ?? undefined,
      traceName:
        filterOptions.data?.traceName?.map((tn) => ({
          value: tn.value,
          count: tn.count !== undefined ? Number(tn.count) : undefined,
        })) ?? undefined,
      level: ["DEFAULT", "DEBUG", "WARNING", "ERROR"],
      model:
        filterOptions.data?.model?.map((m) => ({
          value: m.value,
          count: m.count !== undefined ? Number(m.count) : undefined,
        })) ?? undefined,
      modelId:
        filterOptions.data?.modelId?.map((mid) => ({
          value: mid.value,
          count: mid.count !== undefined ? Number(mid.count) : undefined,
        })) ?? undefined,
      promptName:
        filterOptions.data?.promptName?.map((pn) => ({
          value: pn.value,
          count: pn.count !== undefined ? Number(pn.count) : undefined,
        })) ?? undefined,
      tags:
        filterOptions.data?.tags?.map((t) => ({
          value: t.value,
          count: t.count !== undefined ? Number(t.count) : undefined,
        })) ?? undefined,
      toolNames:
        filterOptions.data?.toolNames?.map((tn) => ({
          value: tn.value,
          count: tn.count !== undefined ? Number(tn.count) : undefined,
        })) ?? undefined,
      calledToolNames:
        filterOptions.data?.calledToolNames?.map((ctn) => ({
          value: ctn.value,
          count: ctn.count !== undefined ? Number(ctn.count) : undefined,
        })) ?? undefined,
      latency: [],
      timeToFirstToken: [],
      tokensPerSecond: [],
      inputTokens: [],
      outputTokens: [],
      totalTokens: [],
      inputCost: [],
      outputCost: [],
      totalCost: [],
      score_categories: scoreCategories,
      scores_avg: scoresNumeric,
    };
  }, [environmentFilterOptions.data, filterOptions.data]);

  const queryFilter = useSidebarFilterState(
    observationFilterConfig,
    newFilterOptions,
    projectId,
    filterOptions.isPending || environmentFilterOptions.isPending,
    hideControls, // Disable URL persistence for embedded preview tables
  );

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  const combinedFilterState = queryFilter.filterState.concat(
    dateRangeFilter,
    promptNameFilter,
    promptVersionFilter,
    modelIdFilter,
  );

  // Use external filter state if provided, otherwise use combined filter state
  const filterState = externalFilterState || combinedFilterState;

  const backendFilterState = transformFiltersForBackend(
    filterState,
    OBSERVATION_COLUMN_TO_BACKEND_KEY,
    observationFilterConfig.columnDefinitions,
  );

  const getCountPayload = {
    projectId,
    filter: backendFilterState,
    searchQuery,
    searchType,
    page: 0,
    limit: 0,
    orderBy: null,
  };

  const getAllPayload = {
    ...getCountPayload,
    page: limitRows ? 0 : paginationState.pageIndex,
    limit: limitRows ?? paginationState.pageSize,
    orderBy: orderByState,
  };

  const generations = api.generations.all.useQuery(getAllPayload, {
    refetchOnWindowFocus: true,
  });
  const totalCountQuery = api.generations.countAll.useQuery(getCountPayload, {
    refetchOnWindowFocus: true,
  });

  const totalCount = totalCountQuery.data?.totalCount ?? null;

  const addToQueueMutation = api.annotationQueueItems.createMany.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: "Observations added to queue",
        description: `Selected observations will be added to queue "${data.queueName}". This may take a minute.`,
        link: {
          href: `/project/${projectId}/annotation-queues/${data.queueId}`,
          text: `View queue "${data.queueName}"`,
        },
      });
    },
  });

  useEffect(() => {
    if (generations.isSuccess) {
      setDetailPageList(
        "observations",
        generations.data.generations.map((g) => ({
          id: g.id,
          params: {
            traceId: g.traceId || "",
            ...(g.traceTimestamp
              ? { timestamp: g.traceTimestamp.toISOString() }
              : {}),
          },
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generations.isSuccess, generations.data]);

  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<ObservationsTableRow>({
      scoreColumnKey: "scores",
      projectId,
      filter: scoreFilters.forObservations(),
      fromTimestamp: dateRange?.from,
    });

  const { selectActionColumn } = TableSelectionManager<ObservationsTableRow>({
    projectId,
    tableName: "observations",
    setSelectedRows,
  });

  const handleAddToAnnotationQueue = async ({
    projectId,
    targetId,
  }: {
    projectId: string;
    targetId: string;
  }) => {
    const selectedGenerationIds = Object.keys(selectedRows).filter(
      (generationId) =>
        generations.data?.generations.map((g) => g.id).includes(generationId),
    );

    await addToQueueMutation.mutateAsync({
      projectId,
      objectIds: selectedGenerationIds,
      objectType: AnnotationQueueObjectType.OBSERVATION,
      queueId: targetId,
      isBatchAction: selectAll,
      query: {
        filter: backendFilterState,
        orderBy: orderByState,
      },
    });
    setSelectedRows({});
  };

  const tableActions: TableAction[] = [
    {
      id: ActionId.ObservationAddToAnnotationQueue,
      type: BatchActionType.Create,
      label: "Add to Annotation Queue",
      description: "Add selected observations to an annotation queue.",
      targetLabel: "Annotation Queue",
      execute: handleAddToAnnotationQueue,
      accessCheck: {
        scope: "annotationQueues:CUD",
      },
    },
    {
      id: ActionId.ObservationAddToDataset,
      type: BatchActionType.Create,
      label: "Add to Dataset",
      description: "Add selected observations to a dataset",
      customDialog: true,
      accessCheck: {
        scope: "datasets:CUD",
      },
    },
  ];

  const enableSorting = !hideControls;

  const columns: LangfuseColumnDef<ObservationsTableRow>[] = [
    ...(hideControls ? [] : [selectActionColumn]),
    {
      accessorKey: "startTime",
      id: "startTime",
      header: "Start Time",
      size: 150,
      enableHiding: true,
      enableSorting,
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
      enableSorting,
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
      enableSorting,
      cell: ({ row }) => {
        const value: ObservationsTableRow["name"] = row.getValue("name");
        return value ?? undefined;
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
        href: "https://langfuse.com/docs/observability/features/log-levels",
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
      enableSorting,
    },
    {
      accessorKey: "statusMessage",
      header: "Status Message",
      id: "statusMessage",
      size: 150,
      headerTooltip: {
        description:
          "Use a statusMessage to e.g. provide additional information on a status such as level=ERROR.",
        href: "https://langfuse.com/docs/observability/features/log-levels",
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
      enableSorting,
    },
    {
      accessorKey: "totalCost",
      header: "Total Cost",
      id: "totalCost",
      size: 120,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("totalCost");

        return value !== undefined ? (
          <BreakdownTooltip
            details={row.original.costDetails}
            isCost
            pricingTierName={row.original.usagePricingTierName ?? undefined}
          >
            <div className="flex items-center gap-1">
              <span>{usdFormatter(value)}</span>
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting,
    },
    {
      accessorKey: "toolDefinitions",
      id: "toolDefinitions",
      header: "Available Tools",
      size: 120,
      enableHiding: true,
      enableSorting,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("toolDefinitions");
        return value !== undefined ? (
          <span>{numberFormatter(value, 0)}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "toolCalls",
      id: "toolCalls",
      header: "Tool Calls",
      size: 100,
      enableHiding: true,
      enableSorting,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("toolCalls");
        return value !== undefined ? (
          <span>{numberFormatter(value, 0)}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "timeToFirstToken",
      id: "timeToFirstToken",
      header: "Time to First Token",
      size: 150,
      enableHiding: true,
      enableSorting,
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
        const aggregatedUsage = calculateAggregatedUsage(
          row.original.usageDetails,
        );
        return (
          <BreakdownTooltip
            details={row.original.usageDetails}
            pricingTierName={row.original.usagePricingTierName ?? undefined}
          >
            <div className="flex items-center gap-1">
              <TokenUsageBadge
                inputUsage={aggregatedUsage.input}
                outputUsage={aggregatedUsage.output}
                totalUsage={aggregatedUsage.total}
                inline
              />
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        );
      },
      enableHiding: true,
      enableSorting,
    },
    {
      accessorKey: "model",
      id: "model",
      header: "Model",
      size: 150,
      enableHiding: true,
      enableSorting,
      cell: ({ row }) => {
        const model = row.getValue("model") as string;
        const modelId = row.getValue("modelId") as string | undefined;

        if (!model) return null;

        return modelId ? (
          <TableIdOrName value={model} />
        ) : (
          <UpsertModelFormDialog
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
          </UpsertModelFormDialog>
        );
      },
    },
    {
      accessorKey: "promptName",
      id: "promptName",
      header: "Prompt",
      headerTooltip: {
        description: "Link to prompt version in Langfuse prompt management.",
        href: "https://langfuse.com/docs/prompt-management/get-started",
      },
      size: 200,
      enableHiding: true,
      enableSorting,
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
              <TagList selectedTags={traceTags} isLoading={false} />
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
        href: "https://langfuse.com/docs/observability/features/metadata",
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
    {
      accessorKey: "scores",
      header: "Scores",
      id: "scores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isColumnLoading ? <Skeleton className="h-3 w-1/2" /> : null;
      },
      columns: scoreColumns,
    },
    {
      accessorKey: "endTime",
      id: "endTime",
      header: "End Time",
      size: 150,
      enableHiding: true,
      enableSorting,
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
      enableSorting,
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
      enableSorting,
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
      enableSorting,
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
      enableSorting,
      defaultHidden: true,
    },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return generations.isPending ? (
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
          enableSorting,
        },
        {
          accessorKey: "inputTokens",
          id: "inputTokens",
          header: "Input Tokens",
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          cell: ({ row }: { row: Row<ObservationsTableRow> }) => {
            const value: {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            } = row.getValue("usage");
            return <span>{numberFormatter(value.inputUsage, 0)}</span>;
          },
        },
        {
          accessorKey: "outputTokens",
          id: "outputTokens",
          header: "Output Tokens",
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          cell: ({ row }: { row: Row<ObservationsTableRow> }) => {
            const value: {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            } = row.getValue("usage");
            return <span>{numberFormatter(value.outputUsage, 0)}</span>;
          },
        },
        {
          accessorKey: "totalTokens",
          id: "totalTokens",
          header: "Total Tokens",
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          cell: ({ row }: { row: Row<ObservationsTableRow> }) => {
            const value: {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            } = row.getValue("usage");
            return <span>{numberFormatter(value.totalUsage, 0)}</span>;
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
        return generations.isPending ? (
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
            const value: {
              inputCost: number | undefined;
              outputCost: number | undefined;
            } = row.getValue("cost");

            return value.inputCost !== undefined ? (
              <span>{usdFormatter(value.inputCost)}</span>
            ) : undefined;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        },
        {
          accessorKey: "outputCost",
          id: "outputCost",
          header: "Output Cost",
          size: 120,
          cell: ({ row }: { row: Row<ObservationsTableRow> }) => {
            const value: {
              inputCost: number | undefined;
              outputCost: number | undefined;
            } = row.getValue("cost");

            return value.outputCost !== undefined ? (
              <span>{usdFormatter(value.outputCost)}</span>
            ) : undefined;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
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

  const peekNavigationProps = usePeekNavigation({
    queryParams: ["observation", "display", "timestamp", "traceId"],
    paramsToMirrorPeekValue: ["observation"],
    extractParamsValuesFromRow: (row: ObservationsTableRow) => ({
      traceId: row.traceId || "",
      timestamp: row.timestamp?.toISOString() || "",
    }),
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
      pathParam: "traceId",
    },
  });

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Observations,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibilityState,
      setSearchQuery: setSearchQuery,
    },
    validationContext: {
      columns,
      filterColumnDefinition: observationFilterConfig.columnDefinitions,
    },
    currentFilterState: queryFilter.filterState,
  });

  const peekConfig: DataTablePeekViewProps | undefined = useMemo(() => {
    if (hideControls) return undefined;
    return {
      itemType: "TRACE",
      customTitlePrefix: "Observation ID:",
      detailNavigationKey: "observations",
      children: <PeekViewObservationDetail projectId={projectId} />,
      ...peekNavigationProps,
    };
  }, [projectId, peekNavigationProps, hideControls]);

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
            scores: generation.scores,
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
            usagePricingTierName: generation.usagePricingTierName ?? undefined,
            environment: generation.environment ?? undefined,
            toolDefinitions: generation.toolDefinitionsCount ?? undefined,
            toolCalls: generation.toolCallsCount ?? undefined,
          };
        })
      : [];
  }, [generations]);

  return (
    <DataTableControlsProvider tableName={observationFilterConfig.tableName}>
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        {!hideControls && (
          <DataTableToolbar
            columns={columns}
            filterState={queryFilter.filterState}
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
            columnsWithCustomSelect={[
              "model",
              "name",
              "traceName",
              "promptName",
            ]}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibilityState}
            columnOrder={columnOrder}
            setColumnOrder={setColumnOrder}
            orderByState={orderByState}
            rowHeight={rowHeight}
            setRowHeight={setRowHeight}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            refreshConfig={{
              onRefresh: handleRefresh,
              isRefreshing:
                generations.isFetching || totalCountQuery.isFetching,
              interval: refreshInterval,
              setInterval: setRefreshInterval,
            }}
            actionButtons={[
              <BatchExportTableButton
                {...{
                  projectId,
                  filterState: backendFilterState,
                  orderByState,
                  searchQuery,
                  searchType,
                }}
                tableName={BatchExportTableName.Observations}
                key="batchExport"
              />,
              Object.keys(selectedRows).filter((generationId) =>
                generations.data?.generations
                  .map((g) => g.id)
                  .includes(generationId),
              ).length > 0 ? (
                <TableActionMenu
                  key="observations-multi-select-actions"
                  projectId={projectId}
                  actions={tableActions}
                  tableName={BatchExportTableName.Observations}
                  onCustomAction={(actionType) => {
                    if (actionType === ActionId.ObservationAddToDataset) {
                      setShowAddToDatasetDialog(true);
                    }
                  }}
                />
              ) : null,
            ]}
            multiSelect={{
              selectAll,
              setSelectAll,
              selectedRowIds: Object.keys(selectedRows).filter((generationId) =>
                generations.data?.generations
                  .map((g) => g.id)
                  .includes(generationId),
              ),
              setRowSelection: setSelectedRows,
              totalCount,
              ...paginationState,
            }}
          />
        )}

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          {!hideControls && <DataTableControls queryFilter={queryFilter} />}

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName={"observations"}
              columns={columns}
              peekView={peekConfig}
              data={
                generations.isPending || isViewLoading
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
              pagination={
                limitRows
                  ? undefined
                  : {
                      totalCount,
                      onChange: setPaginationState,
                      state: paginationState,
                    }
              }
              rowSelection={selectedRows}
              setRowSelection={setSelectedRows}
              setOrderBy={setOrderByState}
              orderBy={orderByState}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibilityState}
              rowHeight={rowHeight}
              onRowClick={(row, event) => {
                // Handle Command/Ctrl+click to open observation in new tab
                if (event && (event.metaKey || event.ctrlKey)) {
                  // Prevent the default peek behavior
                  event.preventDefault();

                  // Construct the observation URL directly to avoid race conditions
                  const observationId = row.id;
                  const traceId = row.traceId;
                  const timestamp = row.timestamp;

                  if (traceId) {
                    let observationUrl = `/project/${projectId}/traces/${encodeURIComponent(traceId)}`;

                    const params = new URLSearchParams();
                    params.set("observation", observationId);
                    if (timestamp) {
                      params.set("timestamp", timestamp.toISOString());
                    }

                    observationUrl += `?${params.toString()}`;

                    const fullUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${observationUrl}`;
                    window.open(fullUrl, "_blank");
                  }
                }
                // For normal clicks, let the data-table handle opening the peek view
              }}
            />
          </div>
        </ResizableFilterLayout>
        {peekConfig && <TablePeekView peekView={peekConfig} />}
      </div>

      {/* Add to Dataset Dialog */}
      {showAddToDatasetDialog && (
        <AddObservationsToDatasetDialog
          projectId={projectId}
          selectedObservationIds={Object.keys(selectedRows).filter((id) =>
            generations.data?.generations.map((g) => g.id).includes(id),
          )}
          query={{
            filter: backendFilterState,
            orderBy: orderByState,
            searchQuery: searchQuery ?? undefined,
            searchType,
          }}
          selectAll={selectAll}
          totalCount={totalCount ?? 0}
          onClose={() => {
            setShowAddToDatasetDialog(false);
            setSelectedRows({});
            setSelectAll(false);
          }}
          exampleObservation={(() => {
            // Get the first selected observation to use for preview
            const selectedIds = Object.keys(selectedRows).filter((id) =>
              generations.data?.generations.map((g) => g.id).includes(id),
            );
            const firstId = selectedIds[0];
            const firstGen = generations.data?.generations.find(
              (g) => g.id === firstId,
            );
            return {
              id: firstGen?.id ?? "",
              traceId: firstGen?.traceId ?? "",
              startTime: firstGen?.traceTimestamp ?? undefined,
            };
          })()}
        />
      )}
    </DataTableControlsProvider>
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
      verbosity: "compact",
    },
    {
      enabled: typeof traceId === "string" && typeof observationId === "string",
      refetchOnMount: false, // prevents refetching loops
      staleTime: 60 * 1000, // 1 minute
      meta: { silentHttpCodes: [404] },
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
      isLoading={observation.isPending}
      data={data}
      className={cn(
        col === "output" && "bg-accent-light-green",
        col === "input" && "bg-muted/50",
      )}
      singleLine={singleLine}
    />
  );
};
