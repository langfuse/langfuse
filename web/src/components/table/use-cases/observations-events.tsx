import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  observationEventsFilterConfig,
  OBSERVATION_EVENTS_COLUMN_TO_BACKEND_KEY,
} from "@/src/features/filters/config/observations-events-config";
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
  type TimeFilter,
} from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { LevelColors } from "@/src/components/level-colors";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { type ScoreAggregate } from "@langfuse/shared";
import TagList from "@/src/features/tag/components/TagList";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { BreakdownTooltip } from "@/src/components/trace/BreakdownToolTip";
import { InfoIcon, PlusCircle } from "lucide-react";
import { UpsertModelFormDrawer } from "@/src/features/models/components/UpsertModelFormDrawer";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Badge } from "@/src/components/ui/badge";
import { type RowSelectionState } from "@tanstack/react-table";
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
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";

export type EventsTableRow = {
  // Identity fields
  id: string;
  traceId?: string;
  traceName?: string;
  spanId: string;
  parentSpanId?: string;

  // Time fields
  startTime: Date;
  endTime?: Date;
  completionStartTime?: Date;
  timestamp?: Date;

  // Core properties
  type: ObservationType;
  name?: string;
  environment?: string;
  version?: string;
  level?: ObservationLevelType;
  statusMessage?: string;

  // User context
  userId?: string;
  sessionId?: string;

  // Model fields
  providedModelName?: string;
  modelId?: string;
  modelParameters?: string;

  // Prompt fields
  promptId?: string;
  promptName?: string;
  promptVersion?: string;

  // Usage and cost
  usage: {
    inputUsage: number;
    outputUsage: number;
    totalUsage: number;
  };
  usageDetails: Record<string, number>;
  totalCost?: number;
  cost: {
    inputCost?: number;
    outputCost?: number;
  };
  costDetails: Record<string, number>;

  // Performance metrics
  latency?: number;
  timeToFirstToken?: number;

  // I/O - served directly from truncated columns
  inputTruncated?: string;
  outputTruncated?: string;
  metadata?: unknown;

  // Instrumentation
  source?: string;
  serviceName?: string;
  serviceVersion?: string;

  // Trace fields
  traceTags?: string[];

  // Scores
  scores: ScoreAggregate;
};

export type EventsTableProps = {
  projectId: string;
};

export default function ObservationsEventsTable({
  projectId,
}: EventsTableProps) {
  const router = useRouter();
  const { viewId } = router.query;

  const { setDetailPageList } = useDetailPageLists();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const { searchQuery, searchType, setSearchQuery, setSearchType } =
    useFullTextSearch();

  const { selectAll, setSelectAll } = useSelectAll(
    projectId,
    "observations-events",
  );

  const [paginationState, setPaginationState] = useQueryParams({
    page: withDefault(NumberParam, 1),
    limit: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "observations-events",
    "s",
  );

  const [inputFilterState] = useQueryFilterState(
    // Default type filter - exclude SPAN and EVENT types
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
    "generations", // Use "generations" table name for compatibility
    projectId,
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Convert timeRange to absolute date range for compatibility
  const dateRange = useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
  }, [timeRange]);

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

  const oldFilterState = inputFilterState.concat(dateRangeFilter);

  const startTimeFilters = oldFilterState.filter(
    (f) =>
      (f.column === "Start Time" || f.column === "startTime") &&
      f.type === "datetime",
  ) as TimeFilter[];

  const filterOptions = api.events.filterOptions.useQuery(
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
      ) || {};

    const scoresNumeric = filterOptions.data?.scores_avg || [];

    return {
      environment:
        environmentFilterOptions.data?.map((value) => value.environment) || [],
      name:
        filterOptions.data?.name?.map((n) => ({
          value: n.value,
          count: n.count !== undefined ? Number(n.count) : undefined,
        })) || [],
      type:
        filterOptions.data?.type?.map((t) => ({
          value: t.value,
          count: t.count !== undefined ? Number(t.count) : undefined,
        })) || [],
      traceName:
        filterOptions.data?.traceName?.map((tn) => ({
          value: tn.value,
          count: tn.count !== undefined ? Number(tn.count) : undefined,
        })) || [],
      level: ["DEFAULT", "DEBUG", "WARNING", "ERROR"],
      providedModelName:
        filterOptions.data?.providedModelName?.map((m) => ({
          value: m.value,
          count: m.count !== undefined ? Number(m.count) : undefined,
        })) || [],
      modelId:
        filterOptions.data?.modelId?.map((mid) => ({
          value: mid.value,
          count: mid.count !== undefined ? Number(mid.count) : undefined,
        })) || [],
      promptName:
        filterOptions.data?.promptName?.map((pn) => ({
          value: pn.value,
          count: pn.count !== undefined ? Number(pn.count) : undefined,
        })) || [],
      traceTags:
        filterOptions.data?.traceTags?.map((t) => ({
          value: t.value,
          count: t.count !== undefined ? Number(t.count) : undefined,
        })) || [],
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
    observationEventsFilterConfig,
    newFilterOptions,
    projectId,
  );

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  const filterState = queryFilter.filterState.concat(dateRangeFilter);

  const backendFilterState = transformFiltersForBackend(
    filterState,
    OBSERVATION_EVENTS_COLUMN_TO_BACKEND_KEY,
    observationEventsFilterConfig.columnDefinitions,
  );

  const getCountPayload = {
    projectId,
    filter: backendFilterState,
    searchQuery,
    searchType,
    page: 1,
    limit: 1,
    orderBy: null,
  };

  const getAllPayload = {
    ...getCountPayload,
    page: paginationState.page,
    limit: paginationState.limit,
    orderBy: orderByState,
  };

  const observations = api.events.all.useQuery(getAllPayload, {
    refetchOnWindowFocus: true,
  });

  const totalCountQuery = api.events.countAll.useQuery(getCountPayload, {
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
    if (observations.isSuccess) {
      setDetailPageList(
        "observations",
        observations.data.observations.map((o) => ({
          id: o.id,
          params: o.traceTimestamp
            ? {
                timestamp: o.traceTimestamp.toISOString(),
                traceId: o.traceId || "",
              }
            : undefined,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations.isSuccess, observations.data]);

  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<EventsTableRow>({
      scoreColumnKey: "scores",
      projectId,
      filter: scoreFilters.forObservations(),
      fromTimestamp: dateRange?.from,
    });

  const { selectActionColumn } = TableSelectionManager<EventsTableRow>({
    projectId,
    tableName: "observations-events",
    setSelectedRows,
  });

  const handleAddToAnnotationQueue = async ({
    projectId,
    targetId,
  }: {
    projectId: string;
    targetId: string;
  }) => {
    const selectedObservationIds = Object.keys(selectedRows).filter(
      (observationId) =>
        observations.data?.observations
          .map((o) => o.id)
          .includes(observationId),
    );

    await addToQueueMutation.mutateAsync({
      projectId,
      objectIds: selectedObservationIds,
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
      id: "observation-add-to-annotation-queue",
      type: BatchActionType.Create,
      label: "Add to Annotation Queue",
      description: "Add selected observations to an annotation queue.",
      targetLabel: "Annotation Queue",
      execute: handleAddToAnnotationQueue,
      accessCheck: {
        scope: "annotationQueues:CUD",
      },
    },
  ];

  const columns: LangfuseColumnDef<EventsTableRow>[] = [
    selectActionColumn,
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
        const value: EventsTableRow["name"] = row.getValue("name");
        return value ? (
          <span className="truncate" title={value}>
            {value}
          </span>
        ) : undefined;
      },
    },
    {
      accessorKey: "inputTruncated",
      header: "Input",
      id: "inputTruncated",
      size: 300,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("inputTruncated");
        return value ? (
          <div
            className={cn(
              "overflow-hidden",
              rowHeight === "s" ? "line-clamp-1" : "whitespace-pre-wrap",
            )}
          >
            {value}
          </div>
        ) : null;
      },
      enableHiding: true,
    },
    {
      accessorKey: "outputTruncated",
      id: "outputTruncated",
      header: "Output",
      size: 300,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("outputTruncated");
        return value ? (
          <div
            className={cn(
              "overflow-hidden bg-accent-light-green",
              rowHeight === "s" ? "line-clamp-1" : "whitespace-pre-wrap",
            )}
          >
            {value}
          </div>
        ) : null;
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
      accessorKey: "providedModelName",
      id: "providedModelName",
      header: "Model",
      size: 150,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const model = row.getValue("providedModelName") as string;
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
        href: "https://langfuse.com/docs/prompt-management/get-started",
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
        const value: EventsTableRow["environment"] =
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
      accessorKey: "userId",
      id: "userId",
      header: "User ID",
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "sessionId",
      id: "sessionId",
      header: "Session ID",
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "source",
      id: "source",
      header: "Source",
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "serviceName",
      id: "serviceName",
      header: "Service Name",
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    },
  ];

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<EventsTableRow>(
      `eventsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<EventsTableRow>(
    `eventsColumnOrder-${projectId}`,
    columns,
  );

  const peekNavigationProps = usePeekNavigation({
    queryParams: ["observation", "display", "timestamp", "traceId"],
    paramsToMirrorPeekValue: ["observation"],
    extractParamsValuesFromRow: (row: EventsTableRow) => ({
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
      filterColumnDefinition: observationEventsFilterConfig.columnDefinitions,
    },
    currentFilterState: queryFilter.filterState,
  });

  const peekConfig: DataTablePeekViewProps = useMemo(
    () => ({
      itemType: "TRACE",
      customTitlePrefix: "Observation ID:",
      detailNavigationKey: "observations",
      children: <PeekViewObservationDetail projectId={projectId} />,
      tableDataUpdatedAt: observations.dataUpdatedAt,
      ...peekNavigationProps,
    }),
    [projectId, observations.dataUpdatedAt, peekNavigationProps],
  );

  const rows: EventsTableRow[] = useMemo(() => {
    return observations.isSuccess
      ? observations.data.observations.map((observation) => {
          return {
            id: observation.id,
            traceId: observation.traceId ?? undefined,
            type: observation.type ?? undefined,
            traceName: observation.traceName ?? "",
            spanId: observation.id, // span_id maps to id
            parentSpanId: observation.parentObservationId ?? undefined,
            startTime: observation.startTime,
            endTime: observation.endTime ?? undefined,
            timeToFirstToken: observation.timeToFirstToken ?? undefined,
            scores: {}, // TODO: scores not included in FullObservation type
            latency: observation.latency ?? undefined,
            totalCost: observation.totalCost ?? undefined,
            cost: {
              inputCost: observation.inputCost ?? undefined,
              outputCost: observation.outputCost ?? undefined,
            },
            name: observation.name ?? undefined,
            version: observation.version ?? "",
            providedModelName: observation.model ?? "",
            modelId: observation.internalModelId ?? undefined,
            level: observation.level,
            statusMessage: observation.statusMessage ?? undefined,
            usage: {
              inputUsage: observation.inputUsage,
              outputUsage: observation.outputUsage,
              totalUsage: observation.totalUsage,
            },
            promptId: observation.promptId ?? undefined,
            promptName: observation.promptName ?? undefined,
            promptVersion: observation.promptVersion?.toString() ?? undefined,
            traceTags: observation.traceTags ?? undefined,
            timestamp: observation.traceTimestamp ?? undefined,
            usageDetails: observation.usageDetails ?? {},
            costDetails: observation.costDetails ?? {},
            environment: observation.environment ?? undefined,
            inputTruncated: observation.input
              ? typeof observation.input === "string"
                ? observation.input
                : JSON.stringify(observation.input)
              : undefined,
            outputTruncated: observation.output
              ? typeof observation.output === "string"
                ? observation.output
                : JSON.stringify(observation.output)
              : undefined,
            metadata: observation.metadata,
            userId: undefined, // TODO: map from observation data
            sessionId: undefined, // TODO: map from observation data
            completionStartTime: observation.completionStartTime ?? undefined,
            source: undefined, // TODO: map from observation data
            serviceName: undefined, // TODO: map from observation data
            serviceVersion: undefined,
          };
        })
      : [];
  }, [observations]);

  return (
    <DataTableControlsProvider>
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
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
            "providedModelName",
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
            Object.keys(selectedRows).filter((observationId) =>
              observations.data?.observations
                .map((o) => o.id)
                .includes(observationId),
            ).length > 0 ? (
              <TableActionMenu
                key="observations-multi-select-actions"
                projectId={projectId}
                actions={tableActions}
                tableName={BatchExportTableName.Observations}
              />
            ) : null,
          ]}
          multiSelect={{
            selectAll,
            setSelectAll,
            selectedRowIds: Object.keys(selectedRows).filter((observationId) =>
              observations.data?.observations
                .map((o) => o.id)
                .includes(observationId),
            ),
            setRowSelection: setSelectedRows,
            totalCount,
            pageSize: paginationState.limit,
            pageIndex: paginationState.page - 1,
          }}
        />

        {/* Content area with sidebar and table */}
        <div className="flex flex-1 overflow-hidden">
          <DataTableControls queryFilter={queryFilter} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName={"observations-events"}
              columns={columns}
              peekView={peekConfig}
              data={
                observations.isPending || isViewLoading
                  ? { isLoading: true, isError: false }
                  : observations.error
                    ? {
                        isLoading: false,
                        isError: true,
                        error: observations.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: rows,
                      }
              }
              pagination={{
                totalCount,
                onChange: (updater) => {
                  const newState =
                    typeof updater === "function"
                      ? updater({
                          pageIndex: paginationState.page - 1,
                          pageSize: paginationState.limit,
                        })
                      : updater;
                  setPaginationState({
                    page: newState.pageIndex + 1,
                    limit: newState.pageSize,
                  });
                },
                state: {
                  pageIndex: paginationState.page - 1,
                  pageSize: paginationState.limit,
                },
              }}
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
        </div>
      </div>
    </DataTableControlsProvider>
  );
}
